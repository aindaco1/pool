#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = new Set(['.gif', '.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4', '.m4v']);
const MEDIA_ROOTS = ['assets/images', 'assets/videos'];
const REFERENCE_ROOTS = ['_campaigns', '_data'];
const REFERENCE_FILES = ['_config.yml'];

export function normalizeRepoPath(repoPath) {
  return String(repoPath || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

export function publicAssetPathForRepoPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return normalized.startsWith('assets/') ? `/${normalized}` : '';
}

export function webmDerivativePathForVideo(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  const extension = path.posix.extname(normalized).toLowerCase();
  return VIDEO_EXTENSIONS.has(extension)
    ? normalized.slice(0, -extension.length) + '.webm'
    : '';
}

export function rewriteMediaReferences(source, replacements = new Map()) {
  let output = String(source || '');
  const ordered = Array.from(replacements.entries())
    .filter(([from, to]) => from && to && from !== to)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of ordered) {
    output = output.split(from).join(to);
  }
  return output;
}

function parseArgs(argv = []) {
  const args = {
    write: false,
    check: false,
    changed: false,
    files: []
  };
  for (const arg of argv) {
    if (arg === '--write') args.write = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--changed') args.changed = true;
    else args.files.push(arg);
  }
  return args;
}

async function commandExists(command) {
  try {
    await execFileAsync(command, ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

async function walkFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function changedFiles() {
  try {
    const { stdout } = await execFileAsync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']);
    return stdout.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function isImageFile(repoPath) {
  return IMAGE_EXTENSIONS.has(path.posix.extname(normalizeRepoPath(repoPath)).toLowerCase());
}

function isVideoSourceFile(repoPath) {
  return VIDEO_EXTENSIONS.has(path.posix.extname(normalizeRepoPath(repoPath)).toLowerCase());
}

function isDashboardMediaFile(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return MEDIA_ROOTS.some((root) => normalized.startsWith(`${root}/`)) &&
    (isImageFile(normalized) || isVideoSourceFile(normalized));
}

async function resolveMediaFiles(args) {
  if (args.files.length) {
    return args.files.map(normalizeRepoPath).filter(isDashboardMediaFile);
  }
  if (args.changed) {
    const files = (await changedFiles()).map(normalizeRepoPath).filter(isDashboardMediaFile);
    if (files.length) return files;
  }
  const roots = await Promise.all(MEDIA_ROOTS.map((root) => walkFiles(root)));
  return roots.flat()
    .map((filePath) => normalizeRepoPath(path.relative(process.cwd(), filePath)))
    .filter(isDashboardMediaFile);
}

async function replaceIfSmaller(sourcePath, candidatePath, write) {
  const sourceSize = await fileSize(sourcePath);
  const candidateSize = await fileSize(candidatePath);
  if (!candidateSize || candidateSize >= sourceSize) {
    await fs.rm(candidatePath, { force: true });
    return { changed: false, bytesSaved: 0 };
  }
  if (write) {
    await fs.rename(candidatePath, sourcePath);
  } else {
    await fs.rm(candidatePath, { force: true });
  }
  return { changed: true, bytesSaved: sourceSize - candidateSize };
}

async function optimizeImage(repoPath, args, tools) {
  const extension = path.posix.extname(repoPath).toLowerCase();
  const filePath = path.resolve(repoPath);
  const before = await fileSize(filePath);
  if (!before) return { repoPath, changed: false, skipped: 'missing' };

  if (extension === '.png' && tools.oxipng) {
    if (args.write) await execFileAsync('oxipng', ['-o', 'max', '--strip', 'safe', filePath]);
  } else if ((extension === '.jpg' || extension === '.jpeg') && tools.jpegtran) {
    const candidatePath = `${filePath}.optimized`;
    await execFileAsync('jpegtran', ['-copy', 'none', '-optimize', '-progressive', '-outfile', candidatePath, filePath]);
    return { repoPath, ...await replaceIfSmaller(filePath, candidatePath, args.write) };
  } else if (extension === '.gif' && tools.gifsicle) {
    if (args.write) await execFileAsync('gifsicle', ['-O3', '-b', filePath]);
  } else if (extension === '.webp' && tools.cwebp) {
    const candidatePath = `${filePath}.optimized`;
    await execFileAsync('cwebp', ['-quiet', '-lossless', '-z', '9', filePath, '-o', candidatePath]);
    return { repoPath, ...await replaceIfSmaller(filePath, candidatePath, args.write) };
  } else {
    return { repoPath, changed: false, skipped: `missing optimizer for ${extension}` };
  }

  const after = await fileSize(filePath);
  return { repoPath, changed: after < before, bytesSaved: Math.max(0, before - after) };
}

async function generateWebmDerivative(repoPath, args, tools) {
  if (!tools.ffmpeg) return { repoPath, changed: false, skipped: 'missing ffmpeg' };
  const derivativeRepoPath = webmDerivativePathForVideo(repoPath);
  if (!derivativeRepoPath) return { repoPath, changed: false, skipped: 'not a video source' };
  const sourcePath = path.resolve(repoPath);
  const derivativePath = path.resolve(derivativeRepoPath);
  const sourceStat = await fs.stat(sourcePath).catch(() => null);
  const derivativeStat = await fs.stat(derivativePath).catch(() => null);
  if (derivativeStat && sourceStat && derivativeStat.mtimeMs >= sourceStat.mtimeMs) {
    return { repoPath, changed: false, derivativeRepoPath, skipped: 'up to date' };
  }
  if (args.write) {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', sourcePath,
      '-c:v', 'libvpx-vp9',
      '-crf', '18',
      '-b:v', '0',
      '-row-mt', '1',
      '-c:a', 'libopus',
      '-b:a', '160k',
      derivativePath
    ], { maxBuffer: 1024 * 1024 * 20 });
  }
  return {
    repoPath,
    changed: !derivativeStat || Boolean(sourceStat && derivativeStat && derivativeStat.mtimeMs < sourceStat.mtimeMs),
    derivativeRepoPath,
    replacement: [publicAssetPathForRepoPath(repoPath), publicAssetPathForRepoPath(derivativeRepoPath)]
  };
}

async function referenceFiles() {
  const files = [];
  for (const root of REFERENCE_ROOTS) {
    files.push(...await walkFiles(root));
  }
  for (const file of REFERENCE_FILES) {
    if (await fileExists(file)) files.push(file);
  }
  return files.filter((file) => /\.(md|ya?ml|json)$/i.test(file));
}

async function rewriteRepositoryReferences(replacements, write) {
  if (!replacements.size) return [];
  const changed = [];
  for (const filePath of await referenceFiles()) {
    const source = await fs.readFile(filePath, 'utf8');
    const rewritten = rewriteMediaReferences(source, replacements);
    if (rewritten === source) continue;
    changed.push(normalizeRepoPath(filePath));
    if (write) await fs.writeFile(filePath, rewritten);
  }
  return changed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const write = args.write && !args.check;
  const mediaFiles = await resolveMediaFiles(args);
  const tools = {
    oxipng: await commandExists('oxipng'),
    jpegtran: await commandExists('jpegtran'),
    gifsicle: await commandExists('gifsicle'),
    cwebp: await commandExists('cwebp'),
    ffmpeg: await commandExists('ffmpeg')
  };
  const replacements = new Map();
  const results = [];

  for (const repoPath of mediaFiles) {
    if (isImageFile(repoPath)) {
      results.push(await optimizeImage(repoPath, { ...args, write }, tools));
    } else if (isVideoSourceFile(repoPath)) {
      const result = await generateWebmDerivative(repoPath, { ...args, write }, tools);
      results.push(result);
      if (result.replacement && (!args.check || result.derivativeRepoPath)) {
        replacements.set(result.replacement[0], result.replacement[1]);
      }
    }
  }

  const referenceChanges = write ? await rewriteRepositoryReferences(replacements, true) : [];
  const changedCount = results.filter((result) => result.changed).length + referenceChanges.length;
  console.log(JSON.stringify({
    mode: write ? 'write' : 'check',
    filesChecked: mediaFiles.length,
    changedCount,
    referenceChanges,
    tools,
    results
  }, null, 2));

  if (args.check && changedCount > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
