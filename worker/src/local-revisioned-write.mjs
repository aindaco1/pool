import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const writes = new Map();
const hash = content => createHash('sha256').update(content).digest('hex');

// The local helper serializes compare-and-write operations just as GitHub's SHA
// precondition does in production. Rename keeps readers from seeing partial YAML.
export async function writeLocalRevisionedTextFile(filePath, content, expectedSha) {
  const previous = writes.get(filePath) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    let current = null;
    try { current = await fs.readFile(filePath, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if ((current === null ? '' : hash(current)) !== expectedSha) {
      throw Object.assign(new Error('Project changed since it was loaded. Your edits have been kept.'), {
        status: 409, code: 'campaign_revision_conflict'
      });
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, content, { flag: 'wx' });
      await fs.rename(temporary, filePath);
    } finally { await fs.rm(temporary, { force: true }); }
    return { ok: true, contentSha: hash(content), commitSha: 'local', commitUrl: '' };
  });
  writes.set(filePath, next);
  try { return await next; }
  finally { if (writes.get(filePath) === next) writes.delete(filePath); }
}
