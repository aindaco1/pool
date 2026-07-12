import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { collectAssetBudgetEvidence } from '../../scripts/audit-performance-budgets.mjs';
import { evaluateCachePolicyTarget } from '../../scripts/audit-cache-policy.mjs';
import { evaluateLighthouseResult, lighthouseBudgetsForRoute } from '../../scripts/performance-lighthouse.mjs';
import { evaluateWorkerPerformanceEvidence } from '../../scripts/audit-runtime-performance.mjs';

describe('production performance gates', () => {
  it('enforces generated totals and named file budgets from one config', () => {
    const siteDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-performance-assets-'));
    fs.mkdirSync(path.join(siteDirectory, 'assets', 'js'), { recursive: true });
    fs.writeFileSync(path.join(siteDirectory, 'assets', 'js', 'app.js'), '12345');
    fs.writeFileSync(path.join(siteDirectory, 'assets', 'main.css'), '1234');
    const config = {
      assets: {
        javascriptTotalBytes: 5,
        cssTotalBytes: 4,
        files: { 'assets/js/app.js': 5 }
      }
    };

    expect(collectAssetBudgetEvidence({ config, siteDirectory })).toMatchObject({
      ok: true,
      totals: { javascriptTotalBytes: 5, cssTotalBytes: 4 }
    });
    expect(collectAssetBudgetEvidence({
      config: { ...config, assets: { ...config.assets, javascriptTotalBytes: 4 } },
      siteDirectory
    })).toMatchObject({ ok: false });
  });

  it('fails private-route cache leakage and public max-age regressions', () => {
    expect(evaluateCachePolicyTarget(
      { id: 'admin', status: 200, type: 'private' },
      { status: 200, cacheControl: 'private, no-store, max-age=0' }
    )).toMatchObject({ ok: true });
    expect(evaluateCachePolicyTarget(
      { id: 'admin', status: 200, type: 'private' },
      { status: 200, cacheControl: 'public, max-age=600' }
    )).toMatchObject({ ok: false, failures: ['missing_private', 'missing_no_store'] });
    expect(evaluateCachePolicyTarget(
      { id: 'asset', status: 200, type: 'public', minimumMaxAge: 14400 },
      { status: 200, cacheControl: 'public, max-age=600' }
    )).toMatchObject({ ok: false, failures: ['max_age_below_budget'] });
  });

  it('evaluates Lighthouse categories and numeric web-vital budgets', () => {
    const budgets = {
      categories: { performance: 0.8, accessibility: 0.95 },
      audits: { 'largest-contentful-paint': 3000, 'cumulative-layout-shift': 0.1 },
      resourceBytes: { total: 1000, image: 500 }
    };
    const passing = {
      categories: { performance: { score: 0.9 }, accessibility: { score: 1 } },
      audits: {
        'largest-contentful-paint': { numericValue: 2000 },
        'cumulative-layout-shift': { numericValue: 0.05 },
        'resource-summary': { details: { items: [
          { resourceType: 'total', transferSize: 900 },
          { resourceType: 'image', transferSize: 400 }
        ] } }
      }
    };
    expect(evaluateLighthouseResult(passing, budgets)).toMatchObject({ ok: true });
    expect(evaluateLighthouseResult({
      ...passing,
      categories: { ...passing.categories, performance: { score: 0.7 } }
    }, budgets)).toMatchObject({ ok: false });
    expect(evaluateLighthouseResult({
      ...passing,
      audits: {
        ...passing.audits,
        'resource-summary': { details: { items: [
          { resourceType: 'total', transferSize: 1200 },
          { resourceType: 'image', transferSize: 400 }
        ] } }
      }
    }, budgets)).toMatchObject({ ok: false });
  });

  it('merges shared Lighthouse limits with tighter route-specific budgets', () => {
    expect(lighthouseBudgetsForRoute({
      categories: { accessibility: 0.95 },
      audits: { 'cumulative-layout-shift': 0.1 },
      resourceBytes: { stylesheet: 300000 },
      routeBudgets: {
        '/terms/': {
          categories: { performance: 0.65 },
          audits: { 'largest-contentful-paint': 8000 },
          resourceBytes: { total: 850000, stylesheet: 200000 }
        }
      }
    }, '/terms/')).toEqual({
      categories: { accessibility: 0.95, performance: 0.65 },
      audits: { 'cumulative-layout-shift': 0.1, 'largest-contentful-paint': 8000 },
      resourceBytes: { stylesheet: 200000, total: 850000 }
    });
  });

  it('fails Worker route evidence when a configured operation is slow or missing', () => {
    const budgets = { operations: { admin_dashboard_summary: 750, admin_settings: 750 } };
    expect(evaluateWorkerPerformanceEvidence({ summaries: [{ operations: {
      admin_dashboard_summary: { count: 8, p95Ms: 320 },
      admin_settings: { count: 4, p95Ms: 610 }
    } }] }, budgets)).toMatchObject({ ok: true });
    expect(evaluateWorkerPerformanceEvidence({ slowRoutes: [
      { operation: 'admin_dashboard_summary', count: 8, p95Ms: 900 }
    ] }, budgets)).toMatchObject({
      ok: false,
      checks: expect.arrayContaining([
        expect.objectContaining({ operation: 'admin_dashboard_summary', failure: 'p95_above_budget' }),
        expect.objectContaining({ operation: 'admin_settings', failure: 'missing_samples' })
      ])
    });
  });
});
