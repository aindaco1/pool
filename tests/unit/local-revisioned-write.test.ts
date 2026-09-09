import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeLocalRevisionedTextFile } from '../../worker/src/local-revisioned-write.mjs';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))); });

describe('local project revision writes', () => {
  it('allows only one of two concurrent saves against the same revision', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pool-working-copy-'));
    directories.push(directory);
    const file = path.join(directory, 'draft.md');
    const original = await writeLocalRevisionedTextFile(file, 'original', '');
    const results = await Promise.allSettled([
      writeLocalRevisionedTextFile(file, 'first edit', original.contentSha),
      writeLocalRevisionedTextFile(file, 'second edit', original.contentSha)
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'campaign_revision_conflict', status: 409 } });
    expect(await fs.readFile(file, 'utf8')).toBe('first edit');
    expect(await fs.readdir(directory)).toEqual(['draft.md']);
    await expect(writeLocalRevisionedTextFile(file, 'accidental creation', '')).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(file, 'utf8')).toBe('first edit');
  });
});
