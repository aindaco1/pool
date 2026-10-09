import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGitHubWorkflowRun } from '../../worker/src/deployment-status.js';
import { triggerSiteRebuild } from '../../worker/src/github.js';
const env = { GITHUB_TOKEN: 'test-token', GITHUB_OWNER: 'owner', GITHUB_REPO: 'pool' };
const sha = 'a'.repeat(40);
const requestedAt = '2026-10-09T18:00:00Z';
const run = { id: 42, path: '.github/workflows/deploy.yml', head_sha: sha, status: 'completed', conclusion: 'success', created_at: requestedAt, updated_at: '2026-10-09T18:02:00Z', html_url: 'https://github.com/owner/pool/actions/runs/42' };
afterEach(() => vi.unstubAllGlobals());
describe('campaign deployment tracking', () => {
  it('dispatches the immutable saved revision and returns tracking coordinates', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const result = await triggerSiteRebuild(env, 'campaign-publish:sunder', { commitSha: sha });
    expect(result).toMatchObject({ triggered: true, commitSha: sha, workflow: 'deploy.yml', requestedAt: expect.any(String) });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ ref: 'main', inputs: { ref: sha, reason: 'campaign-publish:sunder' } });
  });
  it('matches the saved revision even when the branch advances, and reads real build phases', async () => {
    const fetch = vi.fn(async (url: string) => Response.json(url.includes('/jobs?') ? { jobs: [{ name: 'build', status: 'completed', conclusion: 'success' }, { name: 'deploy', status: 'completed', conclusion: 'success' }] } : { workflow_runs: [{ ...run, head_sha: 'b'.repeat(40), display_title: 'Deploy ' + sha }] }));
    vi.stubGlobal('fetch', fetch);
    expect(await getGitHubWorkflowRun(env, { commitSha: sha, requestedAt })).toMatchObject({ ok: true, run: { status: 'completed', conclusion: 'success', elapsedMs: 120000, phases: { build: { conclusion: 'success' } } } });
    expect(fetch.mock.calls.every(([, init]) => init.redirect === 'manual')).toBe(true);
  });
  it.each([{ head_sha: 'b'.repeat(40) }, { path: '.github/workflows/other.yml' }])('rejects unrelated runs (%j)', async mismatch => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...run, ...mismatch })));
    expect(await getGitHubWorkflowRun(env, { commitSha: sha, requestedAt, runId: 42 })).toMatchObject({ ok: false, status: 409 });
  });
  it('stays pending without a matching run instead of declaring success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ workflow_runs: [{ ...run, head_sha: 'b'.repeat(40) }] })));
    expect(await getGitHubWorkflowRun(env, { commitSha: sha, requestedAt })).toMatchObject({ ok: true, run: { status: 'requested', found: false } });
  });
  it('rejects redirects and invalid commit IDs without following arbitrary URLs', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://evil.test' } }));
    vi.stubGlobal('fetch', fetch);
    expect(await getGitHubWorkflowRun(env, { commitSha: '../main' })).toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
    expect(await getGitHubWorkflowRun(env, { commitSha: sha, requestedAt })).toMatchObject({ ok: false, code: 'github_redirect_rejected' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
