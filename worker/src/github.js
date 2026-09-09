/** Thin Pool policy adapter for the shared bounded GitHub transport. */

import { createGitHubClient } from '../../shared/dust-wave-platform/packages/worker-core/src/github.js';
import { getScopedConsole } from './logger.js';

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

function getClient(env = {}) {
  return createGitHubClient({
    token: env.GITHUB_TOKEN,
    owner: env.GITHUB_OWNER || 'aindaco1',
    repo: env.GITHUB_REPO || 'pool',
    ref: env.GITHUB_REF || 'main',
    userAgent: 'pool-worker',
    fetchTarget: fetchGitHubWithoutRedirects
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

export async function putGitHubBase64File(env, filePath, base64Content, message, sha = undefined) {
  const result = await getClient(env).putBase64File(filePath, base64Content, message, sha);
  if (!result.ok) getScopedConsole(env, 'github').error(`Failed to update GitHub file ${filePath}: ${result.status}`);
  return result;
}

export async function deleteGitHubFile(env, filePath, message) {
  const result = await getClient(env).deleteFile(filePath, message);
  if (!result.ok) getScopedConsole(env, 'github').error(`Failed to delete GitHub file ${filePath}: ${result.status}`);
  return result;
}
