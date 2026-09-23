#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { callCloudflareJev, createJevRequest, evaluateJevCases } from '../shared/dust-wave-platform/packages/test-core/src/jev.js';
import { ROOT, capturePoolCases } from './jev-corpus.mjs';

export const POLICY = { minimumMargin: 0.10, models: ['jev-1.13.0'] };
const INPUT_USD_PER_MILLION = 0.042; // TypeSafe reference, 2026-09-22; not a Cloudflare billing cap.
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function summarize(report, corpus) {
  const labels = new Map(corpus.filter((row) => row.expected).map((row) => [row.id, row.expected]));
  const controls = { correct: 0, falsePasses: 0, falseFailures: 0, review: 0, unevaluated: 0 };
  const rendered = { pass: 0, fail: 0, review: 0, unevaluated: 0 };
  let inputTokens = 0;
  const evaluated = new Map(report.cases.map((row) => [row.id, row]));
  for (const source of corpus) {
    const row = evaluated.get(source.id) || { id: source.id };
    inputTokens += row.result?.usage.input_tokens || 0;
    const findings = Object.values(row.result?.findings || {});
    if (labels.has(row.id)) {
      const decision = findings[0]?.decision;
      if (!decision) controls.unevaluated++;
      else if (decision === 'review') controls.review++;
      else if (decision === labels.get(row.id)) controls.correct++;
      else if (decision === 'pass') controls.falsePasses++;
      else controls.falseFailures++;
    } else if (!findings.length) rendered.unevaluated++;
    else if (findings.some((f) => f.decision === 'fail')) rendered.fail++;
    else if (findings.some((f) => f.decision === 'review')) rendered.review++;
    else rendered.pass++;
  }
  return { controls, rendered, inputTokens, estimatedInferenceUsd: inputTokens * INPUT_USD_PER_MILLION / 1_000_000 };
}

export function reviewMarkdown(report, corpus) {
  const rows = new Map(corpus.map((row) => [row.id, row]));
  const summary = summarize(report, corpus);
  const lines = ['# Pool Jev advisory pilot', '',
    `Evaluation complete: ${report.complete}. Network attempts: ${report.networkAttempts}.`,
    ...(report.error ? [`Error: ${report.error}`] : []),
    'This pilot does not block existing tests or establish release acceptance. The 0.10 margin is provisional, not Pool-calibrated.', '',
    `Controls: ${JSON.stringify(summary.controls)}.`, `Rendered cases: ${JSON.stringify(summary.rendered)}.`, '',
    '## Flagged rendered cases and control mismatches', ''];
  for (const row of report.cases) {
    const source = rows.get(row.id);
    const flagged = Object.entries(row.result?.findings || {}).filter(([, finding]) => source.expected ? finding.decision !== source.expected : finding.decision !== 'pass');
    if (!flagged.length && !row.error) continue;
    lines.push(`### ${row.id}`, '', ...(row.error ? [row.error, ''] : []));
    for (const [key, finding] of flagged) lines.push(`- ${finding.decision}: ${source.requirements[key]} Probabilities: ${JSON.stringify(finding.probabilities)}.`);
    lines.push('', ...source.candidate.split('\n').map((line) => `> ${line}`), '');
  }
  lines.push('## Scope and limits', '',
    'Synthetic local DOM states and existing Worker email renderers; no Stripe calls, email sends, production reads, custom input or real supporter data.',
    'DOM capture checks runtime text/visibility, not layout, browser compatibility, live persistence, provider delivery or a complete checkout journey.',
    'Controls are engineering-authored examples, not independent human labels or an unseen validation set. Spanish results need fluent review before gating.',
    'Current deterministic suites remain authoritative for arithmetic, authorization, routing and state transitions.', '');
  return lines.join('\n');
}

function credentials() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  if (!/^[a-fA-F0-9]{32}$/.test(accountId)) throw new Error('Set CLOUDFLARE_ACCOUNT_ID before a live pilot');
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    try {
      const result = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'worker/node_modules/wrangler/bin/wrangler.js'), 'auth', 'token', '--json'], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 45_000
      }));
      token = result.token || result.access_token;
    } catch { throw new Error('Could not use existing Wrangler authentication; no credentials logged'); }
  }
  if (typeof token !== 'string' || !token) throw new Error('Set CLOUDFLARE_API_TOKEN or authenticate Wrangler');
  return { accountId, token };
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('npm run test:jev -- [--live | --dry-run] [--max-estimated-usd=0.25]\nFresh local render and advisory synthetic evaluation. Default: dry run, no authentication/network.');
    return 0;
  }
  if (args.some((arg) => !['--live', '--dry-run'].includes(arg) && !arg.startsWith('--max-estimated-usd=')) ||
      (args.includes('--live') && args.includes('--dry-run'))) throw new Error('Unknown or conflicting Jev arguments');
  const live = args.includes('--live');
  const maximum = Number(args.find((arg) => arg.startsWith('--max-estimated-usd='))?.split('=')[1] ?? 0.25);
  if (!Number.isFinite(maximum) || maximum <= 0 || maximum > 1) throw new Error('Estimate limit must be positive and at most $1');
  const output = path.join(ROOT, 'tmp/jev', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output); // An existing run must never be overwritten, even on a name collision.
  console.log(`Capturing synthetic evidence: ${output}`);
  const site = path.join(output, 'site');
  // Production mode bypasses the auto-loaded machine-local config. Test URLs are explicit.
  execFileSync('bundle', ['exec', 'jekyll', 'build', '--config', '_config.yml,_config.test.yml', '--destination', site, '--quiet'], {
    cwd: ROOT, env: { ...process.env, JEKYLL_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000
  });
  const controls = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/jev/controls.json'), 'utf8'));
  const captured = await capturePoolCases(site);
  const corpus = [...controls, ...captured];
  // Complete request preparation precedes authentication. No arbitrary input/evidence paths.
  const requests = corpus.map((row) => createJevRequest(row.candidate, row.requirements));
  const questionCount = requests.reduce((n, row) => n + Object.keys(row.input.questions).length, 0);
  const reservedEstimateUsd = questionCount * 32_000 * INPUT_USD_PER_MILLION / 1_000_000;
  if (reservedEstimateUsd > maximum || questionCount > 100) throw new Error('Pilot exceeds estimated spending/question budget');
  const sourcePaths = [
    'scripts/jev-corpus.mjs', 'scripts/jev-evaluation.mjs', 'tests/fixtures/jev/controls.json',
    'worker/src/email.js', 'worker/src/provider-config.js', 'assets/js/manage-page.js', 'assets/js/pledge-result.js', 'assets/js/pool-config.js',
    '_data/i18n/en.yml', '_data/i18n/es.yml', '_includes/runtime-messages-json.html',
    'shared/dust-wave-platform/packages/test-core/src/jev.js'
  ];
  const metadata = { createdAt: new Date().toISOString(), policyCalibrated: false, reservedEstimateUsd, inputUsdPerMillion: INPUT_USD_PER_MILLION,
    corpusSha256: sha256(JSON.stringify(corpus)), sourceHashes: Object.fromEntries(sourcePaths.map((file) => [file, sha256(fs.readFileSync(path.join(ROOT, file)))])),
    candidateHashes: Object.fromEntries(captured.map((row) => [row.id, sha256(row.candidate)])) };
  fs.writeFileSync(path.join(output, 'corpus.json'), JSON.stringify(corpus, null, 2) + '\n');
  const onProgress = async (report) => {
      const evidence = { ...report, ...metadata, summary: summarize(report, corpus) };
      fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(evidence, null, 2) + '\n');
      fs.writeFileSync(path.join(output, 'review.md'), reviewMarkdown(evidence, corpus));
  };
  let report = await evaluateJevCases(corpus, { policy: POLICY, maxQuestions: 100, onProgress });
  if (live) {
    let auth;
    try { auth = credentials(); } catch {
      report.error = 'Cloudflare authentication unavailable. Set CLOUDFLARE_ACCOUNT_ID and a token, or use existing Wrangler login.';
      await onProgress(report);
      console.error(report.error);
      return 2;
    }
    report = await evaluateJevCases(corpus, { policy: POLICY, maxQuestions: 100, onProgress, call: (payload) => callCloudflareJev(payload, auth) });
  }
  console.log(JSON.stringify({ output, complete: report.complete, networkAttempts: report.networkAttempts, questionCount, reservedEstimateUsd, ...summarize(report, corpus) }, null, 2));
  // Advisory findings do not fail the command. Missing/incomplete evidence is an error.
  return live && !report.complete ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error('Jev pilot could not prepare complete evidence. Check local build/dependencies and pilot configuration.');
    process.exitCode = 2;
  });
}
