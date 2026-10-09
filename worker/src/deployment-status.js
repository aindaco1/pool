// Store's bounded workflow tracking, adapted to Pool's Pages deployment phases.
import { fetchWithTimeout } from '../../shared/dust-wave-platform/packages/worker-core/src/provider-fetch.js';
import { readBoundedText } from '../../shared/dust-wave-platform/packages/worker-core/src/response-body.js';
const GITHUB_WORKFLOW_STATUS_TIMEOUT_MS = 10_000;
const GITHUB_WORKFLOW_STATUS_MAX_BYTES = 512_000;
const GITHUB_COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const GITHUB_WORKFLOW_FILE_PATTERN = /^[a-z0-9._-]+\.ya?ml$/iu;
function notConfigured() {
  return { ok: false, status: 503, error: 'Deployment tracking is not configured.', code: 'github_not_configured' };
}

function normalizedWorkflowStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return ['requested', 'queued', 'pending', 'waiting', 'in_progress', 'completed'].includes(status)
    ? status
    : 'requested';
}

function normalizedWorkflowConclusion(value) {
  const conclusion = String(value || '').trim().toLowerCase();
  return [
    'action_required',
    'cancelled',
    'failure',
    'neutral',
    'skipped',
    'stale',
    'success',
    'timed_out'
  ].includes(conclusion) ? conclusion : '';
}

function boundedWorkflowTimestamp(value) {
  const timestamp = String(value || '').trim();
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : '';
}

function normalizedWorkflowRun(run = {}, nowMs = Date.now()) {
  const createdAt = boundedWorkflowTimestamp(run.created_at);
  const startedAt = boundedWorkflowTimestamp(run.run_started_at);
  const updatedAt = boundedWorkflowTimestamp(run.updated_at);
  const status = normalizedWorkflowStatus(run.status);
  const conclusion = normalizedWorkflowConclusion(run.conclusion);
  const startMs = Date.parse(startedAt || createdAt || '');
  const endMs = status === 'completed' ? Date.parse(updatedAt || '') : nowMs;
  const durationMs = Number.isFinite(startMs) && Number.isFinite(endMs)
    ? Math.max(0, endMs - startMs)
    : 0;
  const runId = Number(run.id);

  return {
    found: true,
    runId: Number.isSafeInteger(runId) && runId > 0 ? runId : null,
    status,
    conclusion,
    createdAt,
    startedAt,
    updatedAt,
    durationMs,
    url: /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/u.test(String(run.html_url || ''))
      ? String(run.html_url)
      : ''
  };
}

function withWorkflowRequestTiming(run = {}, requestedAt = '', nowMs = Date.now()) {
  const requestedAtTimestamp = boundedWorkflowTimestamp(requestedAt);
  const requestedAtMs = Date.parse(requestedAtTimestamp);
  const updatedAtMs = Date.parse(String(run.updatedAt || ''));
  const endMs = run.status === 'completed' && Number.isFinite(updatedAtMs) ? updatedAtMs : nowMs;
  return {
    ...run,
    requestedAt: requestedAtTimestamp,
    elapsedMs: Number.isFinite(requestedAtMs) && Number.isFinite(endMs)
      ? Math.max(0, endMs - requestedAtMs)
      : Number(run.durationMs || 0)
  };
}

function workflowRunMatchesCommit(run, commitSha, workflow) {
  if (run.path !== `.github/workflows/${workflow}`) return false;
  const title = String(run.display_title || '');
  // Workflow execution stays on the configured branch. The immutable input is
  // recorded in the run title, even if that branch advanced before dispatch.
  if (/^Deploy [a-f0-9]{40}$/.test(title)) return title === `Deploy ${commitSha}`;
  return String(run.head_sha || '').toLowerCase() === commitSha;
}

async function withPublishingPhases(env, rawRun, requestedAt) {
  const run = withWorkflowRequestTiming(normalizedWorkflowRun(rawRun), requestedAt);
  const result = await requestGitHubWorkflowStatus(env, `/actions/runs/${run.runId}/jobs?filter=latest&per_page=100`);
  if (!result.ok) return result;
  const jobs = Array.isArray(result.data.jobs) ? result.data.jobs : [];
  const phases = {};
  for (const [phase, name] of [['build', 'build'], ['deploy', 'deploy']]) {
    const job = jobs.find((item) => item.name === name);
    phases[phase] = { status: normalizedWorkflowStatus(job?.status), conclusion: normalizedWorkflowConclusion(job?.conclusion) };
  }
  return { ok: true, run: { ...run, phases } };
}

async function requestGitHubWorkflowStatus(env, path) {
  if (!env?.GITHUB_TOKEN) return notConfigured(env);
  const owner = String(env.GITHUB_OWNER || 'aindaco1').trim();
  const repo = String(env.GITHUB_REPO || 'pool').trim();
  let response;
  try {
    response = await fetchWithTimeout(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`,
      {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'pool-worker'
        }
      },
      GITHUB_WORKFLOW_STATUS_TIMEOUT_MS
    );
  } catch (error) {
    return {
      ok: false,
      status: 502,
      code: error?.name === 'AbortError' ? 'github_timeout' : 'github_request_failed',
      error: error?.name === 'AbortError' ? 'GitHub request timed out' : 'Unable to reach GitHub'
    };
  }

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, status: 502, code: 'github_redirect_rejected', error: 'GitHub request was redirected' };
  }

  let text = '';
  try {
    text = await readBoundedText(response, GITHUB_WORKFLOW_STATUS_MAX_BYTES, 'GitHub response');
  } catch (error) {
    return error?.code === 'body_too_large'
      ? { ok: false, status: 502, code: 'github_response_too_large', error: 'GitHub response exceeds the configured limit' }
      : { ok: false, status: 502, code: 'github_invalid_response', error: 'Unable to read GitHub response' };
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    return { ok: false, status: 502, code: 'github_invalid_response', error: 'GitHub returned an invalid response' };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: 'github_api_error',
      error: String(data?.message || `GitHub API error: ${response.status}`).slice(0, 512)
    };
  }
  return { ok: true, data };
}

export async function getGitHubWorkflowRun(env, options = {}) {
  const commitSha = String(options.commitSha || '').trim().toLowerCase();
  if (!GITHUB_COMMIT_SHA_PATTERN.test(commitSha)) {
    return { ok: false, status: 400, code: 'github_invalid_commit', error: 'A full GitHub commit SHA is required.' };
  }
  const runId = Number(options.runId);
  const workflow = String(env.GITHUB_WORKFLOW || 'deploy.yml').trim();
  if (!GITHUB_WORKFLOW_FILE_PATTERN.test(workflow)) {
    return { ok: false, status: 400, code: 'github_invalid_workflow', error: 'GitHub workflow file is invalid.' };
  }
  let result;
  if (Number.isSafeInteger(runId) && runId > 0) {
    result = await requestGitHubWorkflowStatus(env, `/actions/runs/${runId}`);
    if (!result.ok) return result;
    if (!workflowRunMatchesCommit(result.data, commitSha, workflow)) {
      return { ok: false, status: 409, code: 'github_workflow_commit_mismatch', error: 'GitHub workflow run does not match the published commit.' };
    }
    return withPublishingPhases(env, result.data, options.requestedAt);
  }

  const query = new URLSearchParams({
    exclude_pull_requests: 'true',
    per_page: '20'
  });
  result = await requestGitHubWorkflowStatus(
    env,
    `/actions/workflows/${encodeURIComponent(workflow)}/runs?${query.toString()}`
  );
  if (!result.ok) return result;

  const requestedAt = String(options.requestedAt || '');
  const requestedAtMs = Date.parse(requestedAt);
  const earliestCreatedAt = Number.isFinite(requestedAtMs) ? requestedAtMs - 10_000 : 0;
  const runs = Array.isArray(result.data?.workflow_runs) ? result.data.workflow_runs : [];
  const match = runs.find((run) => {
    if (!workflowRunMatchesCommit(run, commitSha, workflow)) return false;
    const createdAtMs = Date.parse(String(run?.created_at || ''));
    return !earliestCreatedAt || (Number.isFinite(createdAtMs) && createdAtMs >= earliestCreatedAt);
  });

  if (match) return withPublishingPhases(env, match, requestedAt);
  return {
    ok: true,
    run: withWorkflowRequestTiming({
        found: false,
        runId: null,
        status: 'requested',
        conclusion: '',
        createdAt: '',
        startedAt: '',
        updatedAt: '',
        durationMs: 0,
        url: ''
      }, requestedAt)
  };
}
