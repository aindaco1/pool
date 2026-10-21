// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { campaignContentChanged } from '../../scripts/campaign-content-changed.mjs';

const repoRoot = path.resolve(__dirname, '..', '..');
const temporary: string[] = [];
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000,
}).trim();

afterEach(() => {
  for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-diary-guard-'));
  temporary.push(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'Test');
  const commit = (name: string, contents: string) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), contents);
    git(root, 'add', '.');
    git(root, '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    return git(root, 'rev-parse', 'HEAD');
  };
  const before = commit('_campaigns/example.md', 'diary: []\n');
  return { root, before, commit };
}

describe('exact campaign-content comparison', () => {
  it('does not authorize a diary check for source-only or saved-draft changes', () => {
    const f = fixture();
    f.commit('scripts/example.mjs', 'export const fixed = true;\n');
    const after = f.commit('_campaign_drafts/example.md', 'diary: [draft]\n');
    expect(campaignContentChanged({ cwd: f.root, before: f.before, after })).toBe(false);
  });

  it('finds campaign changes anywhere in a multi-commit push using exact endpoints', () => {
    const f = fixture();
    f.commit('_campaigns/example.md', 'diary: [published]\n');
    const after = f.commit('scripts/example.mjs', 'export const fixed = true;\n');
    expect(campaignContentChanged({ cwd: f.root, before: f.before, after })).toBe(true);
    // A later checkout must not change the result for an older event's SHAs.
    f.commit('_campaigns/example.md', 'diary: []\n');
    expect(campaignContentChanged({ cwd: f.root, before: f.before, after })).toBe(true);
  });

  it('includes campaign removal and excludes unrelated similarly named directories', () => {
    const f = fixture();
    const unrelated = f.commit('_campaigns-archive/example.md', 'archived\n');
    expect(campaignContentChanged({ cwd: f.root, before: f.before, after: unrelated })).toBe(false);
    git(f.root, 'rm', '_campaigns/example.md');
    git(f.root, '-c', 'commit.gpgsign=false', 'commit', '-m', 'remove campaign');
    expect(campaignContentChanged({ cwd: f.root, before: unrelated, after: git(f.root, 'rev-parse', 'HEAD') })).toBe(true);
  });

  it('fetches the exact missing before commit from a shallow checkout', () => {
    const f = fixture();
    f.commit('_campaigns/example.md', 'diary: [published]\n');
    const after = f.commit('scripts/example.mjs', 'tooling\n');
    const shallow = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-diary-shallow-'));
    temporary.push(shallow);
    git(shallow, 'clone', '--depth=1', pathToFileURL(f.root).href, '.');
    expect(spawnSync('git', ['cat-file', '-e', `${f.before}^{commit}`], { cwd: shallow }).status).not.toBe(0);
    expect(campaignContentChanged({ cwd: shallow, before: f.before, after })).toBe(true);
  });

  it.each(['', 'main', '--help', '0'.repeat(40), 'z'.repeat(40)])('rejects an invalid event commit %j', (before) => {
    const f = fixture();
    expect(() => campaignContentChanged({ cwd: f.root, before, after: f.before })).toThrow('exact nonzero');
  });

  it('fails without emitting an allow output when the exact comparison cannot be obtained', () => {
    const f = fixture();
    const output = path.join(f.root, 'step-output');
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/campaign-content-changed.mjs')], {
      cwd: f.root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, POOL_DIARY_BEFORE: 'a'.repeat(40), POOL_DIARY_AFTER: f.before, GITHUB_OUTPUT: output },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Exact campaign comparison commit is unavailable');
    expect(fs.existsSync(output)).toBe(false);
  });

  it('writes the comparison as a GitHub step output only after success', () => {
    const f = fixture();
    const after = f.commit('scripts/example.mjs', 'tooling\n');
    const output = path.join(f.root, 'step-output');
    execFileSync(process.execPath, [path.join(repoRoot, 'scripts/campaign-content-changed.mjs')], {
      cwd: f.root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, POOL_DIARY_BEFORE: f.before, POOL_DIARY_AFTER: after, GITHUB_OUTPUT: output },
    });
    expect(fs.readFileSync(output, 'utf8')).toBe('campaign_content_changed=false\n');
  });
});

function workflow(name: string) {
  return JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e',
    'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))', path.join(repoRoot, '.github/workflows', name),
  ], { encoding: 'utf8', timeout: 10_000 }));
}

function diaryAllowed(config: any, eventName: string, changed = '', skip = false, successful = true) {
  const step = config.jobs.deploy.steps.find((value: any) => value.name === 'Check for new diary entries');
  // This condition deliberately uses the shared JS/Actions boolean subset.
  return runInNewContext(step.if, {
    success: () => successful,
    inputs: { skip_diary_check: skip },
    github: { event_name: eventName },
    needs: { build: { outputs: { campaign_content_changed: changed } } },
  }, { timeout: 100 });
}

describe('deployment diary policy', () => {
  const pages = workflow('deploy.yml');
  const production = workflow('deploy-production.yml');

  it('skips source-only pushes and accepts campaign pushes without changing scheduled publication', () => {
    expect(diaryAllowed(pages, 'push', 'false')).toBe(false);
    expect(diaryAllowed(pages, 'push', '')).toBe(false);
    expect(diaryAllowed(pages, 'push', 'true')).toBe(true);
    expect(diaryAllowed(pages, 'schedule')).toBe(true);
    expect(diaryAllowed(pages, 'workflow_dispatch')).toBe(true);
  });

  it.each([['Pages', pages], ['Worker and Pages', production]])('%s dispatch can suppress diary processing without changing ordinary dispatch', (_, config) => {
    expect(diaryAllowed(config, 'workflow_dispatch')).toBe(true);
    expect(diaryAllowed(config, 'workflow_dispatch', '', true)).toBe(false);
    expect(diaryAllowed(config, 'workflow_dispatch', '', false, false)).toBe(false);
    // Ruby's YAML 1.1 parser reads the key "on" as the boolean true.
    const trigger = config.on || config.true;
    expect(trigger.workflow_dispatch.inputs.skip_diary_check).toMatchObject({ type: 'boolean', default: false });
  });

  it('compares full event SHAs before building and carries the result to the guarded deploy step', () => {
    const build = pages.jobs.build;
    const step = build.steps.find((value: any) => value.id === 'campaign_content');
    expect(step.if).toBe("github.event_name == 'push'");
    expect(step.run).toBe('node scripts/campaign-content-changed.mjs');
    expect(step.env).toEqual({ POOL_DIARY_BEFORE: '${{ github.event.before }}', POOL_DIARY_AFTER: '${{ github.sha }}' });
    expect(build.outputs.campaign_content_changed).toBe('${{ steps.campaign_content.outputs.campaign_content_changed }}');
    expect(build.steps.indexOf(step)).toBeLessThan(build.steps.findIndex((value: any) => value.name === 'Build with Jekyll'));
    // Old immutable refs remain deployable by manual dispatch without this new helper.
    expect(production.jobs.build.steps.some((value: any) => value.run?.includes('campaign-content-changed'))).toBe(false);
  });
});
