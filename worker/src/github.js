/** Thin Pool policy adapter for the shared bounded GitHub transport. */

import { createGitHubClient } from '../../shared/dust-wave-platform/packages/worker-core/src/github.js';
import { getScopedConsole } from './logger.js';
import { readBoundedText } from '../../shared/dust-wave-platform/packages/worker-core/src/response-body.js';
import { createGitHubUploadBody } from './github-upload.js';

export const MAX_VIDEO_UPLOAD_BYTES = 100_000_000;

async function fetchGitHubWithoutRedirects(input, init) {
  // The pinned shared client uses redirect: 'error', which this Worker's
  // runtime rejects before sending. Enforce the same policy with manual mode.
  const response = await fetch(input, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    throw new TypeError('GitHub redirects are not allowed');
  }
  return response;
}

function getClient(env = {}, options = {}) {
  return createGitHubClient({
    token: env.GITHUB_TOKEN,
    owner: env.GITHUB_OWNER || 'aindaco1',
    repo: env.GITHUB_REPO || 'pool',
    ref: env.GITHUB_REF || 'main',
    userAgent: 'pool-worker',
    fetchTarget: fetchGitHubWithoutRedirects,
    ...options
  });
}

function notConfigured(env) {
  if (env?.GITHUB_TOKEN) return null;
  return { ok: false, status: 503, error: 'GITHUB_TOKEN not configured', code: 'github_not_configured' };
}

async function triggerGitHubWorkflow(env, {
  workflow,
  inputs = {},
  successMessage = 'GitHub workflow triggered',
  missingTokenReason = 'No GitHub token configured'
} = {}) {
  const console = getScopedConsole(env, 'github');
  if (!env.GITHUB_TOKEN) {
    console.warn(`GITHUB_TOKEN not set, skipping ${workflow || 'workflow'} trigger`);
    return { triggered: false, reason: missingTokenReason };
  }
  const workflowFile = workflow || 'deploy.yml';
  const result = await getClient(env).dispatchWorkflow(workflowFile, inputs);
  if (result.ok) {
    console.log(successMessage);
    return { triggered: true, workflow: workflowFile };
  }
  console.error(`Failed to trigger ${workflowFile}: ${result.status} ${result.code || ''}`.trim());
  return {
    triggered: false,
    workflow: workflowFile,
    reason: result.code === 'github_api_error'
      ? `GitHub API error: ${result.status}`
      : result.error
  };
}

export async function triggerSiteRebuild(env, reason = 'manual') {
  const result = await triggerGitHubWorkflow(env, {
    workflow: env.GITHUB_WORKFLOW || 'deploy.yml',
    inputs: { reason },
    successMessage: `Site rebuild triggered: ${reason}`
  });
  return result.triggered ? { triggered: true } : { triggered: false, reason: result.reason };
}

export function triggerMediaOptimization(env, { scope = 'changed' } = {}) {
  const normalizedScope = scope === 'all' ? 'all' : 'changed';
  return triggerGitHubWorkflow(env, {
    workflow: env.GITHUB_MEDIA_OPTIMIZATION_WORKFLOW || 'media-optimization.yml',
    inputs: { scope: normalizedScope },
    successMessage: `Media optimization triggered: ${normalizedScope}`
  });
}

export function triggerCampaignArchive(env, { campaignSlug = '', requestedBy = '' } = {}) {
  return triggerGitHubWorkflow(env, {
    workflow: env.GITHUB_CAMPAIGN_ARCHIVE_WORKFLOW || 'archive-campaign.yml',
    inputs: {
      campaign_slug: String(campaignSlug || ''),
      requested_by: String(requestedBy || '')
    },
    successMessage: `Campaign archive triggered: ${campaignSlug}`
  });
}

export async function getGitHubTextFile(env, filePath, options = {}) {
  const missing = notConfigured(env);
  if (missing) return missing;
  const result = await getClient(env).getTextFile(filePath);
  if (!result.ok && !(options.allowMissing && result.status === 404)) getScopedConsole(env, 'github').error(`Failed to load GitHub file ${filePath}: ${result.status}`);
  return result;
}

export async function listGitHubDirectory(env, directoryPath, options = {}) {
  const missing = notConfigured(env);
  if (missing) return missing;
  const result = await getClient(env).listDirectory(directoryPath);
  if (!result.ok && options?.quiet !== true) {
    getScopedConsole(env, 'github').error(`Failed to list GitHub directory ${directoryPath}: ${result.status}`);
  }
  return result;
}

export async function putGitHubTextFile(env, filePath, content, message, sha) {
  const result = await getClient(env).putTextFile(filePath, content, message, sha);
  if (!result.ok) getScopedConsole(env, 'github').error(`Failed to update GitHub file ${filePath}: ${result.status}`);
  return result;
}

export async function putGitHubBase64File(env, filePath, base64Content, message, sha = undefined, maxContentBytes = undefined) {
  const result = await getClient(env, { maxContentBytes }).putBase64File(filePath, base64Content, message, sha);
  if (!result.ok) getScopedConsole(env, 'github').error(`Failed to update GitHub file ${filePath}: ${result.status}`);
  return result;
}

// The shared client buffers JSON and is appropriate for bounded text/images.
// Video needs a streaming body to fit the Worker's memory and ingress limits.
export async function putGitHubVideoFile(env, filePath, source, bytes, message, sha = undefined) {
  const missing = notConfigured(env);
  if (missing) return missing;
  if (!source || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_VIDEO_UPLOAD_BYTES) {
    return { ok: false, status: 400, code: 'invalid_video_size', error: 'Video upload must be between 1 byte and 100 MB.' };
  }
  if (!/^assets\/videos\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(mp4|webm|mov)$/.test(filePath)) {
    return { ok: false, status: 400, code: 'invalid_video_path', error: 'Invalid video upload path.' };
  }
  const owner = encodeURIComponent(env.GITHUB_OWNER || 'aindaco1');
  const repo = encodeURIComponent(env.GITHUB_REPO || 'pool');
  const path = filePath.split('/').map(encodeURIComponent).join('/');
  const upload = createGitHubUploadBody(source, bytes, {
    message,
    branch: env.GITHUB_REF || 'main',
    ...(sha ? { sha } : {})
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const response = await fetchGitHubWithoutRedirects(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        'user-agent': 'pool-worker'
      },
      body: upload.body,
      signal: controller.signal,
      duplex: 'half'
    });
    if (upload.error) throw upload.error;
    let data;
    try {
      data = JSON.parse(await readBoundedText(response, 64 * 1024));
    } catch {
      return { ok: false, status: 502, code: 'github_invalid_response', error: 'GitHub returned an invalid upload response.' };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, code: 'github_api_error', error: String(data?.message || `GitHub API error: ${response.status}`).slice(0, 512) };
    }
    if (!upload.complete || !data?.content?.sha || !data?.commit?.sha) {
      return { ok: false, status: 502, code: 'github_invalid_response', error: 'GitHub did not confirm the complete video upload.' };
    }
    return { ok: true, path: filePath, contentSha: data.content.sha, commitSha: data.commit.sha, commitUrl: data.commit.html_url || '' };
  } catch (error) {
    if (upload.error) return { ok: false, status: 400, code: 'invalid_video_body', error: upload.error.message };
    const timedOut = controller.signal.aborted || error?.name === 'AbortError';
    return { ok: false, status: 502, code: timedOut ? 'github_timeout' : 'github_request_failed', error: timedOut ? 'GitHub video upload timed out.' : 'Unable to upload video to GitHub.' };
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await upload.cancel();
  }
}

export async function deleteGitHubFile(env, filePath, message) {
  const result = await getClient(env).deleteFile(filePath, message);
  if (!result.ok) getScopedConsole(env, 'github').error(`Failed to delete GitHub file ${filePath}: ${result.status}`);
  return result;
}
