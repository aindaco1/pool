/**
 * GitHub API utilities
 * 
 * Triggers workflow_dispatch to rebuild the site
 */

/**
 * Trigger a GitHub Actions workflow
 * 
 * @param {Object} env - Worker environment
 * @param {string} reason - Reason for the rebuild (for logging)
 */
export async function triggerSiteRebuild(env, reason = 'manual') {
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
