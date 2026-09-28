import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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

  it('requires image validation and the complete reusable gate before automatic publication', () => {
    const workflow = JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e',
      'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))', path.join(repoRoot, '.github/workflows/media-optimization.yml')
    ], { encoding: 'utf8' }));
    const { optimize, verify, publish, cleanup } = workflow.jobs;
    const prepare = optimize.steps.find((step: any) => step.id === 'prepare').run;
    expect(prepare.indexOf('validate-media-optimization.mjs')).toBeLessThan(prepare.indexOf('git push'));
    expect(prepare).toContain('--images-only --changed');
    expect(verify.needs).toBe('optimize');
    expect(verify.uses).toBe('./.github/workflows/merge-smoke.yml');
    expect(verify.with.ref).toBe('${{ needs.optimize.outputs.commit }}');
    expect(verify.permissions).toEqual({ contents: 'read' });
    expect(publish.needs).toEqual(['optimize', 'verify']);
    expect(publish.if).toContain("github.ref == 'refs/heads/main'");
    expect(publish.if).toContain("needs.verify.result == 'success'");
    expect(publish.if).toContain("needs.optimize.outputs.changed == 'false'");
    expect(cleanup.if).toContain('always()');
    expect(cleanup.needs).toEqual(['optimize', 'verify', 'publish']);
    expect(cleanup.steps.at(-1).run).toContain('--force-with-lease=');
    expect(JSON.stringify(workflow)).not.toContain('pull_request_target');
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
