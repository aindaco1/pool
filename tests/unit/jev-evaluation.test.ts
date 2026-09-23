import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureEmails } from '../../scripts/jev-corpus.mjs';
import { POLICY, summarize, reviewMarkdown } from '../../scripts/jev-evaluation.mjs';
import { createJevRequest, evaluateJevCases } from '../../shared/dust-wave-platform/packages/test-core/src/jev.js';

const controls = JSON.parse(readFileSync('tests/fixtures/jev/controls.json', 'utf8'));
const response = (payload: any, choice: string) => ({ model: 'jev-1.13.0', usage: { input_tokens: 100, output_tokens: 10 },
  answers: Object.fromEntries(Object.keys(payload.input.questions).map((key) => [key, { type: 'choice', choice,
    probabilities: { pass: choice === 'pass' ? 1 : 0, fail: choice === 'fail' ? 1 : 0, uncertain: 0 } }])) });

afterEach(() => vi.restoreAllMocks());

describe('Pool Jev advisory adapter', () => {
  it('keeps matched faithful/flawed controls for both locales with identical requirements', () => {
    expect(controls).toHaveLength(16);
    for (const good of controls.filter((row: any) => row.expected === 'pass')) {
      const bad = controls.find((row: any) => row.category === good.category && row.lang === good.lang && row.expected === 'fail');
      expect(bad.requirements).toEqual(good.requirements);
      expect(bad.candidate).not.toBe(good.candidate);
      expect(Object.keys(good.requirements)).toHaveLength(1);
    }
  });

  it('captures actual bilingual HTML/plain-text email output without any network or live identity', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    const catalog = JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e',
      "puts JSON.generate({'en'=>YAML.safe_load_file('_data/i18n/en.yml'),'es'=>YAML.safe_load_file('_data/i18n/es.yml')})"], { encoding: 'utf8' }));
    const en = await captureEmails(catalog, 'en');
    const es = await captureEmails(catalog, 'es');
    expect(en).toHaveLength(10);
    expect(es).toHaveLength(10);
    expect(fetch).not.toHaveBeenCalled();
    expect(es[0].candidate).not.toBe(en[0].candidate);
    for (const row of [...en, ...es]) {
      expect(row.candidate).toContain('Synthetic Film');
      expect(row.candidate).not.toContain('synthetic-token');
      expect(row.candidate).not.toContain('supporter@example.com');
      expect(createJevRequest(row.candidate, row.requirements).input.state).toEqual({ candidate: row.candidate });
    }
  });

  it('reports false passes and false failures instead of treating completed API calls as quality passes', async () => {
    const pair = controls.slice(0, 2);
    const report = await evaluateJevCases(pair, { policy: POLICY, call: async (payload: any) => response(payload, payload.input.state.candidate === pair[0].candidate ? 'fail' : 'pass') });
    expect(summarize(report, pair).controls).toEqual({ correct: 0, falsePasses: 1, falseFailures: 1, review: 0, unevaluated: 0 });
    expect(report.complete).toBe(true);
    expect(report.releaseAccepted).toBe(false);
    expect(reviewMarkdown(report, pair)).toContain(pair[1].candidate);
  });

  it('keeps dry runs and failed requests incomplete with no provider fallback', async () => {
    const preview = await evaluateJevCases(controls, { policy: POLICY });
    expect(preview.networkAttempts).toBe(0);
    expect(preview.complete).toBe(false);
    expect(summarize(preview, controls).controls.unevaluated).toBe(16);
    expect(summarize(preview, controls).controls.review).toBe(0);
    const call = vi.fn().mockRejectedValue(new Error('synthetic transport failure'));
    const report = await evaluateJevCases(controls, { policy: POLICY, call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(report.complete).toBe(false);
    expect(report.error).toBeTruthy();
    expect(summarize(report, controls).controls.unevaluated).toBe(16);
  });
});
