#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONFIG = path.join(ROOT, 'config', 'performance-budgets.json');

function valueArg(args, name, fallback = '') {
  const found = args.find((arg) => arg.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : fallback;
}

export function evaluateLighthouseResult(lhr = {}, budgets = {}) {
  const checks = [];
  for (const [id, minimum] of Object.entries(budgets.categories || {})) {
    const actual = Number(lhr.categories?.[id]?.score ?? 0);
    checks.push({ id: `category:${id}`, actual, minimum: Number(minimum), ok: actual >= Number(minimum) });
  }
  for (const [id, maximum] of Object.entries(budgets.audits || {})) {
    const actual = Number(lhr.audits?.[id]?.numericValue ?? Infinity);
    checks.push({ id: `audit:${id}`, actual, maximum: Number(maximum), ok: actual <= Number(maximum) });
  }
  const resourceRows = new Map((lhr.audits?.['resource-summary']?.details?.items || [])
    .map((entry) => [String(entry.resourceType || ''), Number(entry.transferSize || 0)]));
  for (const [resourceType, maximum] of Object.entries(budgets.resourceBytes || {})) {
    const actual = resourceRows.has(resourceType) ? resourceRows.get(resourceType) : Infinity;
    checks.push({
      id: `resource:${resourceType}`,
      actual,
      maximum: Number(maximum),
      ok: actual <= Number(maximum)
    });
  }
  return { ok: checks.every((check) => check.ok), checks };
}

function median(values = []) {
  const sorted = values.map(Number).sort((left, right) => left - right);
  if (!sorted.length) return Infinity;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function evaluateLighthouseRuns(lhrs = [], budgets = {}) {
  const evaluatedRuns = lhrs.map((lhr) => evaluateLighthouseResult(lhr, budgets));
  if (!evaluatedRuns.length) return { sampleCount: 0, ok: false, checks: [] };
  const templates = evaluatedRuns[0]?.checks || [];
  const checks = templates.map((template) => {
    const actual = median(evaluatedRuns.map((run) => run.checks.find((check) => check.id === template.id)?.actual));
    if (Object.hasOwn(template, 'minimum')) {
      return { ...template, actual, ok: actual >= template.minimum };
    }
    return { ...template, actual, ok: actual <= template.maximum };
  });
  return { sampleCount: evaluatedRuns.length, ok: checks.every((check) => check.ok), checks };
}

export function lighthouseBudgetsForRoute(lighthouseConfig = {}, routePath = '/') {
  const overrides = lighthouseConfig.routeBudgets?.[routePath] || {};
  return {
    categories: { ...(lighthouseConfig.categories || {}), ...(overrides.categories || {}) },
    audits: { ...(lighthouseConfig.audits || {}), ...(overrides.audits || {}) },
    resourceBytes: { ...(lighthouseConfig.resourceBytes || {}), ...(overrides.resourceBytes || {}) }
  };
}

export async function collectLighthouseEvidence(options = {}) {
  const config = options.config || JSON.parse(fs.readFileSync(options.configPath || DEFAULT_CONFIG, 'utf8'));
  const baseUrl = String(options.baseUrl || 'http://127.0.0.1:4000').replace(/\/$/, '');
  const configuredRuns = Number(options.runCount ?? config.lighthouse.runs ?? 3);
  const runCount = Number.isFinite(configuredRuns) && configuredRuns > 0 ? Math.floor(configuredRuns) : 3;
  const chrome = await launch({
    chromePath: options.chromePath || chromium.executablePath(),
    chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage']
  });
  const routes = [];
  try {
    for (const routePath of config.lighthouse.routes || []) {
      const routeBudgets = lighthouseBudgetsForRoute(config.lighthouse, routePath);
      const lhrs = [];
      for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
        const result = await lighthouse(`${baseUrl}${routePath}`, {
          port: chrome.port,
          output: 'json',
          logLevel: 'error',
          onlyCategories: Object.keys(routeBudgets.categories || {})
        });
        if (!result?.lhr) throw new Error(`Lighthouse did not return a result for ${routePath} run ${runIndex + 1}.`);
        lhrs.push(result.lhr);
        if (options.rawOutputDirectory) {
          fs.mkdirSync(options.rawOutputDirectory, { recursive: true });
          const basename = routePath === '/'
            ? 'home'
            : routePath.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-');
          fs.writeFileSync(
            path.join(options.rawOutputDirectory, `${basename}-run-${runIndex + 1}.json`),
            `${JSON.stringify(result.lhr)}\n`
          );
        }
      }
      const evaluated = evaluateLighthouseRuns(lhrs, routeBudgets);
      routes.push({ path: routePath, ...evaluated });
    }
  } finally {
    await chrome.kill();
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseOrigin: new URL(baseUrl).origin,
    ok: routes.every((route) => route.ok),
    routes,
    containsCredentials: false,
    containsCustomerData: false
  };
}

async function main() {
  const args = process.argv.slice(2);
  const runCount = valueArg(args, '--runs', '');
  const evidence = await collectLighthouseEvidence({
    configPath: valueArg(args, '--config', DEFAULT_CONFIG),
    baseUrl: valueArg(args, '--base-url', process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4000'),
    rawOutputDirectory: valueArg(args, '--raw-output-dir', ''),
    runCount: runCount ? Number(runCount) : undefined
  });
  const output = valueArg(args, '--output', '');
  if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
  });
}
