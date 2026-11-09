import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { normalizeFrameHashAspectRatios } from '../shared/dust-wave-platform/packages/media-core/src/frame-hash.js';

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

