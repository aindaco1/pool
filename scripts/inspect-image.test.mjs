import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectImage } from './inspect-image.mjs';

test('real GIF and animated WebP decoding preserves every frame and duration', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pool-image-decoder-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('python3', ['-c', `
from PIL import Image
from pathlib import Path
import sys
root = Path(sys.argv[1])
frames = [Image.new('RGB', (64, 48), color) for color in ['red', 'blue', 'green']]
for name, durations in [('animation.gif', [100, 200, 300]), ('animation.webp', [100, 200, 300]), ('retimed.webp', [100, 210, 300])]:
    frames[0].save(root / name, save_all=True, append_images=frames[1:], duration=durations, loop=0, lossless=True)
frames[0].save(root / 'still.webp', lossless=True)
`, root]);
  const source = inspectImage(path.join(root, 'animation.gif'));
  const webp = inspectImage(path.join(root, 'animation.webp'));
  assert.deepEqual(webp.timeline, [[0, 100000], [100000, 200000], [300000, 300000]]);
  assert.deepEqual(webp.timeline, source.timeline);
  assert.equal(webp.width, 64);
  assert.equal(webp.height, 48);
  assert.notDeepEqual(inspectImage(path.join(root, 'retimed.webp')).timeline, source.timeline);
  assert.notEqual(inspectImage(path.join(root, 'retimed.webp')).frames, webp.frames);
  assert.deepEqual(inspectImage(path.join(root, 'still.webp')).timeline, [[0, 40000]]);
  const candidate = path.join(root, 'image.candidate');
  writeFileSync(candidate, readFileSync(path.join(root, 'animation.webp')));
  assert.deepEqual(inspectImage(candidate), webp);
  writeFileSync(candidate, readFileSync(candidate).subarray(0, 40));
  assert.throws(() => inspectImage(candidate));
});
