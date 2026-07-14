import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readWorkflow(name: string) {
  return fs.readFileSync(path.join(repoRoot, '.github', 'workflows', name), 'utf8');
}

describe('workflow security posture', () => {
  it('pins every third-party action to an immutable commit and keeps read-only workflow permissions explicit', () => {
    const workflowDir = path.join(repoRoot, '.github', 'workflows');
    const workflowNames = fs.readdirSync(workflowDir).filter((name) => name.endsWith('.yml'));
    const actionRef = /^\s*uses:\s*[^\s@]+@([^\s#]+)(?:\s+#.*)?$/gm;
    for (const name of workflowNames) {
      const workflow = readWorkflow(name);
      for (const match of workflow.matchAll(actionRef)) {
        expect(match[1], `${name} has a mutable action ref`).toMatch(/^[a-f0-9]{40}$/);
      }
    }
    expect(readWorkflow('merge-smoke.yml')).toContain('permissions:\n  contents: read');
    expect(readWorkflow('release-provider-evidence.yml')).toContain('permissions:\n  contents: read');
  });

  it('separates automatic Pages refreshes from manually approved Worker deployments', () => {
    const pages = readWorkflow('deploy.yml');
    const production = readWorkflow('deploy-production.yml');
    expect(pages).toContain('name: Refresh Production Pages');
    expect(pages).not.toContain('wrangler deploy');
    expect(production).toContain('name: Deploy Production');
    expect(production).toContain('workflow_dispatch:');
    expect(production).toContain('Reviewed release branch, tag, or commit');
    expect(production).toContain('npx wrangler deploy');
    expect(pages).toContain('npm run test:crawl-endpoints -- --base=https://pool.dustwave.xyz');
    expect(production).toContain('npm run test:crawl-endpoints -- --base=https://pool.dustwave.xyz');
  });

  it('pins cache purging to the Cloudflare API instead of an unpinned third-party action', () => {
    const deploy = readWorkflow('deploy.yml');

    expect(deploy).not.toContain('jakejarvis/cloudflare-purge-action@master');
    expect(deploy).toContain('https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE}/purge_cache');
    expect(deploy).toContain('CLOUDFLARE_CACHE_PURGE_TOKEN');
    expect(deploy).not.toContain('CLOUDFLARE_EMAIL:');
    expect(deploy).not.toContain('CLOUDFLARE_KEY:');
  });

  it('sends media optimization changes through a pull request', () => {
    const workflow = readWorkflow('media-optimization.yml');

    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain('gh pr create');
    expect(workflow).toContain('bot/media-optimization-${GITHUB_RUN_ID}');
    expect(workflow).not.toMatch(/git push\s+origin\s+main/);
    expect(workflow).not.toMatch(/git push\s+origin\s+HEAD:main/);
  });

  it('archives campaigns with validated workflow_dispatch input and move-only filesystem operations', () => {
    const workflow = readWorkflow('archive-campaign.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('campaign_slug:');
    expect(workflow).toContain('/^[a-z0-9-]{1,100}$/');
    expect(workflow).toContain('function isArchiveableMediaReference');
    expect(workflow).toContain("reference.startsWith('assets/images/campaign-add-ons/')");
    expect(workflow).toContain("fs.renameSync(campaignPath, archivedCampaignPath)");
    expect(workflow).toContain("fs.renameSync(sourcePath, targetPath)");
    expect(workflow).toContain("path.join('archive', 'campaigns', slug)");
    expect(workflow).not.toContain('rm -rf');
    expect(workflow).not.toContain('pull_request_target');
  });

  it('uses the hosted AWS CLI for protected recovery instead of the unavailable Ubuntu apt package', () => {
    const recovery = readWorkflow('recovery-operations.yml');

    expect(recovery).toContain('sudo apt-get install -y age');
    expect(recovery).toContain('aws --version');
    expect(recovery).not.toContain('sudo apt-get install -y age awscli');
  });
});
