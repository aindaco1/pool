// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as runtime from '../../worker/node_modules/miniflare/dist/src/index.js';

describe('streamed GitHub video uploads in workerd', () => {
  let worker: InstanceType<typeof runtime.Miniflare>;
  let calls: Array<{ url: string; bytes: number; hash: string; sample: string }>;
  let status: number;
  const prefix = '{"message":"Upload video","branch":"main","content":"';
  beforeEach(() => { calls = []; status = 201; });
  beforeAll(async () => {
    const config = readFileSync('worker/wrangler.toml', 'utf8');
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
          import { putGitHubVideoFile } from './worker/src/github.js';
          export default { async fetch(request) {
            const env = { GITHUB_TOKEN: 'test-token', GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo' };
            const result = await putGitHubVideoFile(env, 'assets/videos/campaigns/demo/video.mp4',
              request.body, Number(new URL(request.url).searchParams.get('size')), 'Upload video');
            return Response.json(result);
          }};
        `
      },
      bundle: true, format: 'esm', platform: 'browser', external: ['node:buffer'], write: false
    });
    worker = new runtime.Miniflare(runtime.convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: config.match(/compatibility_date = "([^"]+)"/)![1],
      compatibilityFlags: ['nodejs_compat'],
      script: bundle.outputFiles[0].text,
      cf: false,
      outboundService: async (request) => {
        const call = { url: request.url, bytes: 0, hash: '', sample: '' };
        calls.push(call);
        if (status === 307) return new runtime.Response(null, { status, headers: { Location: 'https://must-not-follow.test' } });
        if (status === 403) return runtime.Response.json({ message: 'Permission denied' }, { status });
        const hash = createHash('sha256');
        const reader = request.body!.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          call.bytes += value.byteLength;
          hash.update(value);
          if (call.bytes < 4096) call.sample += Buffer.from(value).toString();
        }
        call.hash = hash.digest('hex');
        return runtime.Response.json({ content: { sha: 'content-sha' }, commit: { sha: 'commit-sha' } }, { status });
      }
    }));
  }, 30_000);
  afterAll(async () => { await worker?.dispose(); });

  function upload(bytes: number, actualBytes = bytes, chunkSize = 65537) {
    let remaining = actualBytes;
    return worker.dispatchFetch(`http://localhost/video?size=${bytes}`, {
      method: 'POST',
      body: new ReadableStream({
        pull(controller) {
          if (!remaining) { controller.close(); return; }
          const size = Math.min(remaining, chunkSize);
          controller.enqueue(new Uint8Array(size));
          remaining -= size;
        }
      }),
      duplex: 'half'
    });
  }

  it.each([1, 2, 3, 4, 5, 65539])('preserves base64 across chunk boundaries for %i bytes', async (size) => {
    const response = await upload(size, size, size > 5 ? 8191 : 1);
    expect(await response.json()).toMatchObject({ ok: true, contentSha: 'content-sha' });
    const expected = prefix + Buffer.alloc(size).toString('base64') + '"}';
    expect(calls[0].hash).toBe(createHash('sha256').update(expected).digest('hex'));
    expect(calls[0].bytes).toBe(Buffer.byteLength(expected));
  });

  it('streams exactly 100 MB without buffering the full request or base64 JSON in the Worker', async () => {
    const response = await upload(100_000_000);
    expect(await response.json()).toMatchObject({ ok: true, commitSha: 'commit-sha' });
    // A zero-filled 100 MB file encodes to 133,333,334 As followed by ==.
    const expected = createHash('sha256').update(prefix);
    let remaining = 133_333_334;
    while (remaining) {
      const size = Math.min(remaining, 65536);
      expected.update('A'.repeat(size));
      remaining -= size;
    }
    expected.update('=="}');
    expect(calls).toHaveLength(1);
    expect(calls[0].hash).toBe(expected.digest('hex'));
    expect(calls[0].bytes).toBe(prefix.length + 133_333_336 + 2);
  }, 60_000);

  it.each([0, 100_000_001])('rejects invalid size %i before contacting GitHub', async (size) => {
    const response = await upload(size, 1);
    expect(await response.json()).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it.each([4, 6])('rejects a stream whose actual length is %i instead of 5', async (actual) => {
    const response = await upload(5, actual, 1);
    expect(await response.json()).toMatchObject({ ok: false, status: 400, code: 'invalid_video_body' });
  });

  it.each([307, 403])('does not retry or follow a provider response of %i', async (code) => {
    status = code;
    const response = await upload(5);
    expect(await response.json()).toMatchObject({ ok: false, status: code === 307 ? 502 : 403 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('https://api.github.com/repos/owner/repo/contents/assets/videos/');
  });
});
