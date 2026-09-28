import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateImageChanges } from '../../scripts/validate-media-optimization.mjs';

const temporary: string[] = [];
const repoRoot = process.cwd();
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
afterEach(() => { for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-media-test-')); temporary.push(root);
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  fs.mkdirSync(path.join(root, 'assets/images'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/images/photo.jpg'), 'original image content');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'source');
  return { root, base: git(root, 'rev-parse', 'HEAD') };
}
const inspect = async (file: string) => {
  const derivative = file.match(/-(\d+)\.webp$/);
  const width = derivative ? Number(derivative[1]) : 1000;
  return { width, height: width / 2, frames: derivative ? 'scaled' : 'original', timeline: [[0, 40000]] };
};

describe('automatic image validation', () => {
  it('accepts smaller lossless sources and valid responsive sizes', async () => {
    const { root, base } = fixture();
    fs.writeFileSync(path.join(root, 'assets/images/photo.jpg'), 'smaller source');
    fs.writeFileSync(path.join(root, 'assets/images/photo-320.webp'), 'webp');
    expect((await validateImageChanges(root, base, { inspect })).images).toHaveLength(2);
  });
  it.each(['worker.js', '_config.yml', 'assets/videos/clip.webm'])('rejects non-image output %s', async (file) => {
    const { root, base } = fixture(); fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), 'changed');
    await expect(validateImageChanges(root, base, { inspect })).rejects.toThrow('Unexpected optimizer change');
  });
  it('rejects changed source pixels even when the file is smaller', async () => {
    const { root, base } = fixture(); fs.writeFileSync(path.join(root, 'assets/images/photo.jpg'), 'changed');
    await expect(validateImageChanges(root, base, { inspect: async (file: string) => ({ ...await inspect(file), frames: fs.readFileSync(file, 'utf8') }) })).rejects.toThrow('Source image content changed');
  });
  it('rejects larger sources and newly invented originals', async () => {
    const { root, base } = fixture(); fs.writeFileSync(path.join(root, 'assets/images/photo.jpg'), 'x'.repeat(30));
    await expect(validateImageChanges(root, base, { inspect })).rejects.toThrow('Larger image');
    git(root, 'restore', '.'); fs.writeFileSync(path.join(root, 'assets/images/new.jpg'), 'new');
    await expect(validateImageChanges(root, base, { inspect })).rejects.toThrow('cannot add an original');
  });
  it.each(['photo-321.webp', 'missing-320.webp'])('rejects unsupported or ungrounded derivative %s', async (name) => {
    const { root, base } = fixture(); fs.writeFileSync(path.join(root, 'assets/images', name), 'webp');
    await expect(validateImageChanges(root, base, { inspect })).rejects.toThrow(/Invalid derivative width|no unambiguous existing source/);
  });
  it('rejects oversized derivatives, lost animation frames, and symlinks', async () => {
    const { root, base } = fixture(); const target = path.join(root, 'assets/images/photo-320.webp');
    fs.writeFileSync(target, 'x'.repeat(30));
    await expect(validateImageChanges(root, base, { inspect })).rejects.toThrow('oversized');
    fs.writeFileSync(target, 'webp');
    await expect(validateImageChanges(root, base, { inspect: async (file: string) => ({ ...await inspect(file), timeline: file.endsWith('.webp') ? [[0, 40000], [40000, 40000]] : [[0, 40000]] }) })).rejects.toThrow('animation timing');
    fs.unlinkSync(target); fs.symlinkSync('photo.jpg', target);
    await expect(validateImageChanges(root, base, { inspect })).rejects.toThrow('regular file');
  });
  it('allows removal only for an existing derivative recorded as an intentional size skip', async () => {
    const { root } = fixture();
    fs.writeFileSync(path.join(root, 'assets/images/photo-320.webp'), 'old derivative');
    git(root, 'add', 'assets'); git(root, 'commit', '-m', 'old variant');
    const base = git(root, 'rev-parse', 'HEAD');
    fs.unlinkSync(path.join(root, 'assets/images/photo-320.webp')); fs.mkdirSync(path.join(root, '_data'));
    const manifest = { assets: [{ path: 'assets/images/photo.jpg', skippedDerivatives: ['assets/images/photo-320.webp'] }] };
    fs.writeFileSync(path.join(root, '_data/media-optimization-manifest.json'), JSON.stringify(manifest));
    expect((await validateImageChanges(root, base, { inspect })).images[0]).toMatchObject({ removed: true });
    manifest.assets[0].skippedDerivatives = [];
    fs.writeFileSync(path.join(root, '_data/media-optimization-manifest.json'), JSON.stringify(manifest));
    await expect(validateImageChanges(root, base, { inspect })).rejects.toThrow('Unexpected image deletion');
  });
  it('finds pending images after unrelated saves and retains intentional skips', () => {
    const { root } = fixture();
    fs.mkdirSync(path.join(root, '_data')); fs.mkdirSync(path.join(root, 'assets/videos'));
    fs.writeFileSync(path.join(root, 'assets/videos/movie.mp4'), 'video');
    fs.writeFileSync(path.join(root, 'later-save.md'), 'content saved after upload');
    git(root, 'add', '.'); git(root, 'commit', '-m', 'later save');
    const module = pathToFileURL(path.join(repoRoot, 'scripts/optimize-media.mjs')).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs/promises';
      import { createHash } from 'node:crypto';
      import { resolveMediaFiles } from ${JSON.stringify(module)};
      const args = { imagesOnly: true, changed: true, files: [] };
      const fresh = await resolveMediaFiles(args);
      const row = { path: 'assets/images/photo.jpg', sha256: createHash('sha256').update(await fs.readFile('assets/images/photo.jpg')).digest('hex'), expectedDerivatives: ['assets/images/photo-320.webp'], skippedDerivatives: [] };
      const save = () => fs.writeFile('_data/media-optimization-manifest.json', JSON.stringify({ assets: [row] }));
      await save(); const missing = await resolveMediaFiles(args);
      row.skippedDerivatives = row.expectedDerivatives; await save(); const skipped = await resolveMediaFiles(args);
      await fs.writeFile('assets/images/photo.jpg', 'replacement image'); const replaced = await resolveMediaFiles(args);
      await fs.writeFile('assets/images/photo-320.webp', 'derivative');
      const all = await resolveMediaFiles({ ...args, changed: false });
      console.log(JSON.stringify({ fresh, missing, skipped, replaced, all }));
    `], { cwd: root, encoding: 'utf8' });
    const images = ['assets/images/photo.jpg'];
    expect(JSON.parse(output)).toEqual({ fresh: images, missing: images, skipped: [], replaced: images, all: images });
  });
  it('never treats the generated manifest as a source reference and is repeatable', () => {
    const { root } = fixture();
    fs.mkdirSync(path.join(root, '_data')); fs.mkdirSync(path.join(root, '_campaigns'));
    fs.writeFileSync(path.join(root, '_campaigns/demo.md'), 'hero: /assets/images/photo.jpg\n');
    const module = pathToFileURL(path.join(repoRoot, 'scripts/optimize-media.mjs')).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs/promises';
      import { buildMediaOptimizationManifest } from ${JSON.stringify(module)};
      const first = await buildMediaOptimizationManifest();
      await fs.writeFile('_data/media-optimization-manifest.json', JSON.stringify(first));
      const second = await buildMediaOptimizationManifest({}, { previousManifest: first });
      console.log(JSON.stringify({ equal: JSON.stringify(first) === JSON.stringify(second), refs: second.assets[0].references }));
    `], { cwd: root, encoding: 'utf8' });
    expect(JSON.parse(output)).toEqual({ equal: true, refs: [{ path: '_campaigns/demo.md', count: 1 }] });
  });
});

function publicationFixture() {
  const { root, base } = fixture();
  const remote = path.join(root, 'remote.git'); git(root, 'init', '--bare', remote);
  git(root, 'remote', 'add', 'origin', remote); git(root, 'push', 'origin', 'main');
  const branch = 'bot/media-optimization-123-1'; git(root, 'switch', '-c', branch);
  fs.writeFileSync(path.join(root, 'assets/images/photo-320.webp'), 'webp');
  git(root, 'add', 'assets'); git(root, 'commit', '-m', 'Optimize dashboard images');
  const commit = git(root, 'rev-parse', 'HEAD'); git(root, 'push', 'origin', branch);
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$MEDIA_TEST_COMMAND_LOG"\n', { mode: 0o755 });
  const log = path.join(root, 'dispatch.log');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REF: 'refs/heads/main', MEDIA_TEST_COMMAND_LOG: log };
  const run = (extra = {}) => execFileSync('bash', [path.join(repoRoot, 'scripts/publish-media-optimization.sh'), base, branch, commit], { cwd: root, env: { ...env, ...extra }, stdio: 'pipe' });
  return { root, base, branch, commit, remote, log, run };
}

describe('automatic image publication', () => {
  it('fast-forwards the tested commit and explicitly dispatches Pages', () => {
    const f = publicationFixture(); f.run();
    expect(git(f.root, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0]).toBe(f.commit);
    expect(fs.readFileSync(f.log, 'utf8')).toContain('workflow run deploy.yml --ref main');
  });
  it('requeues current sources when main advances without publishing stale output', () => {
    const f = publicationFixture(); git(f.root, 'switch', '--detach', f.base);
    fs.writeFileSync(path.join(f.root, 'new-content.md'), 'creator edit'); git(f.root, 'add', 'new-content.md'); git(f.root, 'commit', '-m', 'new content');
    const newer = git(f.root, 'rev-parse', 'HEAD'); git(f.root, 'push', 'origin', 'HEAD:main'); git(f.root, 'switch', '--detach', f.commit);
    f.run();
    expect(git(f.root, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0]).toBe(newer);
    expect(fs.readFileSync(f.log, 'utf8')).toContain('workflow run media-optimization.yml --ref main -f scope=changed');
    expect(fs.readFileSync(f.log, 'utf8')).not.toContain('deploy.yml');
  });
  it('rejects feature workflow publication and a changed candidate branch', () => {
    const f = publicationFixture(); expect(() => f.run({ GITHUB_REF: 'refs/heads/test' })).toThrow();
    git(f.root, 'push', '--force', 'origin', `${f.base}:refs/heads/${f.branch}`);
    expect(() => f.run()).toThrow();
    expect(fs.existsSync(f.log)).toBe(false);
    expect(git(f.root, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0]).toBe(f.base);
  });
  it('handles main advancing between the read and the push without overwriting it', () => {
    const f = publicationFixture(); git(f.root, 'switch', '--detach', f.base);
    fs.writeFileSync(path.join(f.root, 'new-content.md'), 'concurrent edit'); git(f.root, 'add', 'new-content.md'); git(f.root, 'commit', '-m', 'concurrent content');
    const newer = git(f.root, 'rev-parse', 'HEAD'); git(f.root, 'push', 'origin', 'HEAD:refs/heads/race-fixture'); git(f.root, 'switch', '--detach', f.commit);
    // Simulate a concurrent actor advancing remote main after the preflight read.
    fs.writeFileSync(path.join(f.root, '.git/hooks/pre-push'), `#!/bin/sh\ngit --git-dir='${f.remote}' update-ref refs/heads/main '${newer}' '${f.base}'\n`, { mode: 0o755 });
    f.run();
    expect(git(f.root, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0]).toBe(newer);
    expect(fs.readFileSync(f.log, 'utf8')).toContain('media-optimization.yml');
  });
});
