import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.error || result.signal) throw new Error('Git comparison did not complete');
  return result;
}

function requireCommit(cwd, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha || '') || /^0+$/.test(sha)) {
    throw new Error('Campaign comparison requires exact nonzero before and after commit SHAs');
  }
  const object = `${sha}^{commit}`;
  if (git(cwd, ['cat-file', '-e', object]).status === 0) return;
  // A default Actions checkout is shallow. Fetch only the missing event commit,
  // never a moving branch, and refuse to guess if it is no longer retrievable.
  if (git(cwd, ['fetch', '--no-tags', '--depth=1', 'origin', sha]).status !== 0
      || git(cwd, ['cat-file', '-e', object]).status !== 0) {
    throw new Error('Exact campaign comparison commit is unavailable');
  }
}

export function campaignContentChanged({ before, after, cwd = process.cwd() }) {
  requireCommit(cwd, before);
  requireCommit(cwd, after);
  const result = git(cwd, [
    'diff', '--quiet', '--no-ext-diff', '--no-textconv', before, after, '--', '_campaigns/',
  ]);
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error('Exact campaign content comparison failed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const changed = campaignContentChanged({
      before: process.env.POOL_DIARY_BEFORE,
      after: process.env.POOL_DIARY_AFTER,
    });
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `campaign_content_changed=${changed}\n`);
  } catch (error) {
    console.error(`Cannot decide whether to check campaign diaries: ${error.message}`);
    process.exitCode = 1;
  }
}
