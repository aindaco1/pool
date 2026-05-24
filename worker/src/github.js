/**
 * GitHub API utilities
 * 
 * Triggers workflow_dispatch to rebuild the site
 */

import { getScopedConsole } from './logger.js';

let console = globalThis.console;

function configureGitHubLogging(env) {
  console = getScopedConsole(env, 'github');
}

/**
 * Trigger a GitHub Actions workflow
 * 
 * @param {Object} env - Worker environment
 * @param {string} reason - Reason for the rebuild (for logging)
 */
export async function triggerSiteRebuild(env, reason = 'manual') {
  configureGitHubLogging(env);

  if (!env.GITHUB_TOKEN) {
    console.warn('GITHUB_TOKEN not set, skipping site rebuild trigger');
    return { triggered: false, reason: 'No GitHub token configured' };
  }

  const owner = env.GITHUB_OWNER || 'aindaco1';
  const repo = env.GITHUB_REPO || 'pool';
  const workflow = env.GITHUB_WORKFLOW || 'deploy.yml';
  const ref = env.GITHUB_REF || 'main';

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'pool-worker'
        },
        body: JSON.stringify({
          ref,
          inputs: {
            reason
          }
        })
      }
    );

    if (res.status === 204) {
      console.log(`Site rebuild triggered: ${reason}`);
      return { triggered: true };
    }

    const error = await res.text();
    console.error(`Failed to trigger rebuild: ${res.status} ${error}`);
    return { triggered: false, reason: `GitHub API error: ${res.status}` };
  } catch (err) {
    console.error('Error triggering rebuild:', err);
    return { triggered: false, reason: err.message };
  }
}

function getGitHubRepoConfig(env = {}) {
  return {
    owner: env.GITHUB_OWNER || 'aindaco1',
    repo: env.GITHUB_REPO || 'pool',
    ref: env.GITHUB_REF || 'main'
  };
}

function getGitHubHeaders(env = {}) {
  return {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'pool-worker'
  };
}

function encodeGitHubPath(filePath) {
  return String(filePath || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeUtf8Base64(value) {
  const binary = atob(String(value || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

export async function getGitHubTextFile(env, filePath) {
  configureGitHubLogging(env);

  if (!env.GITHUB_TOKEN) {
    return { ok: false, status: 503, error: 'GITHUB_TOKEN not configured', code: 'github_not_configured' };
  }

  const { owner, repo, ref } = getGitHubRepoConfig(env);
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}?ref=${encodeURIComponent(ref)}`,
    {
      method: 'GET',
      headers: getGitHubHeaders(env)
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Failed to load GitHub file ${filePath}: ${response.status}`);
    return { ok: false, status: response.status, error: data?.message || `GitHub API error: ${response.status}` };
  }

  if (data?.encoding !== 'base64' || typeof data?.content !== 'string' || !data?.sha) {
    return { ok: false, status: 502, error: 'Unexpected GitHub file response' };
  }

  return {
    ok: true,
    path: data.path || filePath,
    sha: data.sha,
    content: decodeUtf8Base64(data.content)
  };
}

export async function putGitHubTextFile(env, filePath, content, message, sha) {
  configureGitHubLogging(env);

  if (!env.GITHUB_TOKEN) {
    return { ok: false, status: 503, error: 'GITHUB_TOKEN not configured', code: 'github_not_configured' };
  }

  const { owner, repo, ref } = getGitHubRepoConfig(env);
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`,
    {
      method: 'PUT',
      headers: getGitHubHeaders(env),
      body: JSON.stringify({
        message: String(message || `Update ${filePath}`),
        content: encodeUtf8Base64(content),
        sha,
        branch: ref
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Failed to update GitHub file ${filePath}: ${response.status}`);
    return { ok: false, status: response.status, error: data?.message || `GitHub API error: ${response.status}` };
  }

  return {
    ok: true,
    path: data?.content?.path || filePath,
    contentSha: data?.content?.sha || '',
    commitSha: data?.commit?.sha || '',
    commitUrl: data?.commit?.html_url || ''
  };
}

export async function putGitHubBase64File(env, filePath, base64Content, message, sha = undefined) {
  configureGitHubLogging(env);

  if (!env.GITHUB_TOKEN) {
    return { ok: false, status: 503, error: 'GITHUB_TOKEN not configured', code: 'github_not_configured' };
  }

  const { owner, repo, ref } = getGitHubRepoConfig(env);
  const body = {
    message: String(message || `Update ${filePath}`),
    content: String(base64Content || '').replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''),
    branch: ref
  };
  if (sha) body.sha = sha;

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`,
    {
      method: 'PUT',
      headers: getGitHubHeaders(env),
      body: JSON.stringify(body)
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Failed to update GitHub file ${filePath}: ${response.status}`);
    return { ok: false, status: response.status, error: data?.message || `GitHub API error: ${response.status}` };
  }

  return {
    ok: true,
    path: data?.content?.path || filePath,
    contentSha: data?.content?.sha || '',
    commitSha: data?.commit?.sha || '',
    commitUrl: data?.commit?.html_url || ''
  };
}
