// @vitest-environment node

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as runtime from '../../worker/node_modules/miniflare/dist/src/index.js';

// Exercise the real workerd Request/fetch implementation. Node and mocked fetch
// accept redirect modes that the deployed Worker compatibility date can reject.
describe('GitHub adapter in the Worker runtime', () => {
  let worker: InstanceType<typeof runtime.Miniflare>;
  const requests: Array<{ url: string; method: string; body: string }> = [];
  let responseStatus = 200;

  beforeAll(async () => {
    const config = readFileSync(path.resolve('worker/wrangler.toml'), 'utf8');
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
          import { listGitHubDirectory, putGitHubTextFile, triggerSiteRebuild } from './worker/src/github.js';
          export default { async fetch(request) {
            const env = { GITHUB_TOKEN: 'test-token', GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo' };
            const action = new URL(request.url).pathname;
            const result = action === '/create'
              ? await putGitHubTextFile(env, '_campaigns/new-campaign.md', 'preview_only: true', 'Create campaign')
              : action === '/rebuild'
                ? await triggerSiteRebuild(env, 'test-create')
                : await listGitHubDirectory(env, '_campaigns');
            return Response.json(result);
          }};
        `
      },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false
    });
    worker = new runtime.Miniflare(runtime.convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: config.match(/compatibility_date = "([^"]+)"/)![1],
      script: bundle.outputFiles[0].text,
      cf: false,
      outboundService: async (request) => {
        requests.push({ url: request.url, method: request.method, body: await request.text() });
        if (responseStatus >= 300 && responseStatus < 400) {
          return new runtime.Response(null, {
            status: responseStatus,
            headers: { Location: 'https://redirect-target.test/credentials-must-not-arrive' }
          });
        }
        if (responseStatus === 403) {
          return runtime.Response.json({ message: 'Resource not accessible by personal access token' }, { status: 403 });
        }
        if (request.method === 'POST') return new runtime.Response(null, { status: 204 });
        if (request.method === 'PUT') {
          return runtime.Response.json({
            content: { path: '_campaigns/new-campaign.md', sha: 'file-sha' },
            commit: { sha: 'commit-sha', html_url: 'https://github.test/commit-sha' }
          }, { status: 201 });
        }
        return runtime.Response.json([]);
      }
    }));
  }, 30_000);

  afterAll(async () => { await worker?.dispose(); });

  it('reads campaign sources, creates a campaign file, and dispatches the rebuild', async () => {
    expect(await (await worker.dispatchFetch('http://localhost/list')).json()).toMatchObject({ ok: true, entries: [] });
    expect(await (await worker.dispatchFetch('http://localhost/create')).json()).toMatchObject({ ok: true, commitSha: 'commit-sha' });
    expect(await (await worker.dispatchFetch('http://localhost/rebuild')).json()).toEqual({ triggered: true });
    expect(requests.map(({ method }) => method)).toEqual(['GET', 'PUT', 'POST']);
    expect(JSON.parse(requests[1].body)).toMatchObject({ branch: 'main', message: 'Create campaign' });
    expect(Buffer.from(JSON.parse(requests[1].body).content, 'base64').toString()).toBe('preview_only: true');
  });

  it.each([301, 302, 303, 307, 308])('rejects HTTP %i without following the redirect or retrying the write', async (status) => {
    responseStatus = status;
    requests.length = 0;
    const result = await (await worker.dispatchFetch('http://localhost/create')).json();
    expect(result).toMatchObject({ ok: false, status: 502, code: 'github_request_failed' });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://api.github.com/repos/owner/repo/contents/_campaigns/new-campaign.md');
  });

  it('preserves GitHub permission errors distinctly from transport failures', async () => {
    responseStatus = 403;
    const result = await (await worker.dispatchFetch('http://localhost/create')).json();
    expect(result).toMatchObject({ ok: false, status: 403, code: 'github_api_error', error: 'Resource not accessible by personal access token' });
  });
});
