import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectAssetBudgetEvidence } from '../../scripts/audit-performance-budgets.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Pool performance budgets', () => {
  it('measures generated asset totals and named files', () => {
    const siteDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-performance-budget-'));
    temporaryDirectories.push(siteDirectory);
    fs.mkdirSync(path.join(siteDirectory, 'assets', 'js'), { recursive: true });
    fs.writeFileSync(path.join(siteDirectory, 'assets', 'js', 'app.js'), '12345');
    fs.writeFileSync(path.join(siteDirectory, 'assets', 'main.css'), '123');
    const evidence = collectAssetBudgetEvidence({
      siteDirectory,
      config: {
        assets: {
          siteDirectory: '_site',
          javascriptTotalBytes: 10,
          cssTotalBytes: 10,
          files: { 'assets/js/app.js': 5 }
        },
        workersCache: { enabled: false }
      }
    });
    expect(evidence.ok).toBe(true);
    expect(evidence.totals).toEqual({ javascriptTotalBytes: 5, cssTotalBytes: 3 });
    expect(evidence.workersCache.enabled).toBe(false);
  });

  it('fails when a named asset exceeds its ceiling', () => {
    const siteDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-performance-budget-'));
    temporaryDirectories.push(siteDirectory);
    fs.mkdirSync(path.join(siteDirectory, 'assets', 'js'), { recursive: true });
    fs.writeFileSync(path.join(siteDirectory, 'assets', 'js', 'app.js'), '123456');
    const evidence = collectAssetBudgetEvidence({
      siteDirectory,
      config: {
        assets: { siteDirectory: '_site', javascriptTotalBytes: 10, cssTotalBytes: 10, files: { 'assets/js/app.js': 5 } }
      }
    });
    expect(evidence.ok).toBe(false);
  });
});
