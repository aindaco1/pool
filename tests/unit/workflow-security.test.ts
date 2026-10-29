import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readWorkflow(name: string) {
  return fs.readFileSync(path.join(repoRoot, '.github', 'workflows', name), 'utf8');
}

describe('workflow security posture', () => {

  it('captures every four hours without admitting restore or payment authority', () => {
    const text = readWorkflow('capture-production-backup.yml');
    const workflow = JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e',
      'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))', path.join(repoRoot, '.github/workflows/capture-production-backup.yml')
    ], { encoding: 'utf8' }));
    expect(text).toContain("cron: '37 */4 * * *'");
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.capture.environment).toBe('production-backup');
    expect(workflow.jobs.capture.if).toContain("github.ref == 'refs/heads/main'");
    expect(workflow.jobs.capture.if).toContain("vars.BACKUP_SCHEDULE_ENABLED == 'true'");
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    const steps = workflow.jobs.capture.steps;
    expect(steps[0].with['fetch-depth']).toBe(0);
    expect(steps[0].with['persist-credentials']).toBe(false);
    expect(steps[1].with.ref).toMatch(/^[a-f0-9]{40}$/);
    const capture = steps.find((step: any) => step.env?.RECOVERY_ARCHIVE_URI);
    expect(capture.run).toContain('capture-recovery-archive.py');
    expect(capture.run).toContain('scripts/pool-backup.mjs --remote --kv-values --skip-build');
    expect(capture.env.RECOVERY_REQUIRE_R2).toBe('false');
    expect(capture.env.RECOVERY_IDENTITY_VARIABLE).toBe('POOL_BACKUP_AGE_IDENTITY');
    expect(steps.at(-1).with.path).toBe('${{ runner.temp }}/backup-verification.json');
    expect(text).not.toMatch(/--admin-exports|ADMIN_SECRET|STRIPE_SECRET_KEY|--execute|s3 rm|--delete|restore\.mjs/);
  });

  it('provisions only GitHub-sealed backup credentials behind the existing recovery approval gate', () => {
    const text = readWorkflow('provision-backup-credentials.yml');
    const workflow = JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e',
      'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))', path.join(repoRoot, '.github/workflows/provision-backup-credentials.yml')
    ], { encoding: 'utf8' }));
    expect(text).not.toMatch(/\n  (push|schedule|pull_request):/);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.seal.environment).toBe('production-recovery');
    expect(workflow.jobs.seal.if).toBe("github.ref == 'refs/heads/main'");
    const steps = workflow.jobs.seal.steps;
    expect(steps[0].with.ref).toMatch(/^[a-f0-9]{40}$/);
    expect(steps.find((step: any) => step.env?.BACKUP_ENV_PUBLIC_KEY).run)
      .toBe('/usr/bin/python3 scripts/seal-backup-credentials.py');
    expect(steps.at(-1).with.path).toBe('${{ runner.temp }}/sealed-backup-credentials.json');
    expect(steps.at(-1).with['retention-days']).toBe(1);
    expect(text).not.toMatch(/CLOUDFLARE_API_TOKEN|ADMIN_SECRET|STRIPE_SECRET_KEY|STRIPE_RECOVERY_READ_KEY|GH_TOKEN|contents: write/);
  });

  it('keeps archive verification manual, protected, and limited to sanitized evidence', () => {
    const text = readWorkflow('verify-recovery-archive.yml');
    const workflow = JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e',
      'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))', path.join(repoRoot, '.github/workflows/verify-recovery-archive.yml')
    ], { encoding: 'utf8' }));
    expect(text).toContain('workflow_dispatch:');
    expect(text).not.toMatch(/\n  (push|schedule|pull_request):/);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.verify.environment).toBe('production-recovery');
    const steps = workflow.jobs.verify.steps;
    expect(steps[0].with.ref).toMatch(/^[a-f0-9]{40}$/);
    expect(steps.find((step: any) => step.env?.RECOVERY_ARCHIVE_URI).run)
      .toBe('python3 scripts/verify-recovery-archive.py');
    expect(steps.at(-1).with.path).toBe('${{ runner.temp }}/recovery-archive-verification.json');
    expect(text).not.toMatch(/RECOVERY_DRILL_ENABLED|ADMIN_SECRET|STRIPE_SECRET_KEY|restore --/);
  });

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
