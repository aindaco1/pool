#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeFrameHashAspectRatios } from '../shared/dust-wave-platform/packages/media-core/src/frame-hash.js';
import { buildMediaOptimizationManifest } from './optimize-media.mjs';
import { MEDIA_MANIFEST_PATH, MEDIA_RESPONSIVE_WIDTHS } from '../worker/src/media-catalog.js';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });

export function inspectImage(file) {
  const probe = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file
  ], { encoding: 'utf8', timeout: 120_000 }));
  const { width, height } = probe.streams?.[0] || {};
  if (!(width > 0 && height > 0)) throw new Error(`Image has no dimensions: ${file}`);
  // Frame hashes include dimensions, timing, and every decoded frame. This
  // also rejects source orientation/animation changes caused by metadata loss.
  const frames = execFileSync('ffmpeg', [
    '-v', 'error', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough',
    '-pix_fmt', 'rgba', '-f', 'framehash', '-hash', 'sha256', '-'
  ], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  const frameText = normalizeFrameHashAspectRatios(frames.toString());
  const timeBase = frameText.match(/^#tb 0: (\d+)\/(\d+)$/m);
  if (!timeBase) throw new Error(`Image frame timing is unavailable: ${file}`);
  const seconds = Number(timeBase[1]) / Number(timeBase[2]);
  const timeline = frameText.split('\n').filter((line) => line && !line.startsWith('#')).map((line) => {
    const fields = line.split(',').map((field) => field.trim());
    return [Math.round(Number(fields[2]) * seconds * 1e6), Math.round(Number(fields[3]) * seconds * 1e6)];
  });
  if (!timeline.length || timeline.some((row) => row.some((value) => !Number.isFinite(value)))) throw new Error(`Invalid image frames: ${file}`);
  return { width, height, frames: createHash('sha256').update(frameText).digest('hex'), timeline };
}

export async function validateImageChanges(root, base, { inspect = inspectImage } = {}) {
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('An exact base commit is required');
  const changed = git(root, 'diff', '--name-only', '--no-renames', '-z', base).toString().split('\0').filter(Boolean);
  const added = git(root, 'ls-files', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean);
  const files = [...new Set([...changed, ...added])];
  const sources = git(root, 'ls-tree', '-r', '--name-only', base, '--', 'assets/images').toString().split('\n')
    .filter((file) => /\.(png|jpe?g|gif)$/i.test(file));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pool-media-validation-'));
  const report = [];
  try {
    for (const file of files) {
      if (file === MEDIA_MANIFEST_PATH) {
        const stat = await fs.lstat(path.join(root, file));
        if (!stat.isFile()) throw new Error('Manifest must be a regular file');
        continue;
      }
      if (!/^assets\/images\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpe?g|gif|webp)$/i.test(file) || file.split('/').includes('..')) {
        throw new Error(`Unexpected optimizer change: ${file}`);
      }
      const target = path.join(root, file);
      const derivative = file.match(/^(.*)-(\d+)\.webp$/i);
      let original;
      try { original = git(root, 'show', `${base}:${file}`); } catch { /* A new responsive derivative. */ }
      const stat = await fs.lstat(target).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!stat) {
        const manifest = JSON.parse(await fs.readFile(path.join(root, MEDIA_MANIFEST_PATH), 'utf8'));
        const matches = sources.filter((source) => derivative && source.replace(/\.[^.]+$/, '') === derivative[1]);
        const row = matches.length === 1 && manifest.assets?.find((asset) => asset.path === matches[0]);
        if (!original || !row || !MEDIA_RESPONSIVE_WIDTHS.includes(Number(derivative[2])) || !row.skippedDerivatives?.includes(file)) {
          throw new Error(`Unexpected image deletion: ${file}`);
        }
        // The final manifest check verifies this exception against current files.
        await fs.access(path.join(root, matches[0]));
        report.push({ path: file, removed: true, reason: 'candidate not smaller than source' });
        continue;
      }
      if (!stat.isFile()) throw new Error(`Image must be a regular file: ${file}`);
      const image = await inspect(target);
      if (original) {
        const originalPath = path.join(temporary, path.basename(file));
        await fs.writeFile(originalPath, original);
        const before = await inspect(originalPath);
        if (!/-\d+\.webp$/i.test(file) && stat.size > original.length) throw new Error(`Larger image rejected: ${file}`);
        // Generated WebP sizes are lossy by design; source images must retain
        // their decoded pixels, orientation, and frame timing exactly.
        if (!/-\d+\.webp$/i.test(file) && JSON.stringify(image) !== JSON.stringify(before)) {
          throw new Error(`Source image content changed: ${file}`);
        }
      }
      if (derivative) {
        const width = Number(derivative[2]);
        if (!MEDIA_RESPONSIVE_WIDTHS.includes(width) || image.width !== width) throw new Error(`Invalid derivative width: ${file}`);
        const matches = sources.filter((source) => source.replace(/\.[^.]+$/, '') === derivative[1]);
        if (matches.length !== 1) throw new Error(`Derivative has no unambiguous existing source: ${file}`);
        const source = matches[0];
        const sourcePath = path.join(root, source);
        const sourceStat = await fs.stat(sourcePath);
        const sourceImage = await inspect(sourcePath);
        const expectedHeight = Math.round(sourceImage.height * width / sourceImage.width);
        if (width >= sourceImage.width || Math.abs(image.height - expectedHeight) > 1 || stat.size >= sourceStat.size) {
          throw new Error(`Derivative is oversized or changes aspect ratio: ${file}`);
        }
        if (JSON.stringify(image.timeline) !== JSON.stringify(sourceImage.timeline)) throw new Error(`Derivative changes animation timing: ${file}`);
      } else if (!original) {
        throw new Error(`Optimizer cannot add an original image: ${file}`);
      }
      report.push({ path: file, bytes: stat.size, width: image.width, height: image.height });
    }
    return { files, images: report };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const base = process.argv[2];
  const result = await validateImageChanges(process.cwd(), base);
  const previousManifest = JSON.parse(await fs.readFile(MEDIA_MANIFEST_PATH, 'utf8'));
  const expected = await buildMediaOptimizationManifest({ ffprobe: true }, { previousManifest });
  if (JSON.stringify(previousManifest) !== JSON.stringify(expected)) throw new Error('Media manifest does not match current files');
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
