import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = '/Users/aindaco1/Library/Mobile Documents/com~apple~CloudDocs/pool';

function buildPledge({
  orderId,
  email,
  campaignSlug,
  tierId,
  tierQty,
  subtotal,
  tipPercent,
  tipAmount,
  tax,
  shipping,
  amount,
  createdAt
}: {
  orderId: string;
  email: string;
  campaignSlug: string;
  tierId: string;
  tierQty: number;
  subtotal: number;
  tipPercent: number;
  tipAmount: number;
  tax: number;
  shipping: number;
  amount: number;
  createdAt: string;
}) {
  return {
    orderId,
    email,
    campaignSlug,
    tierId,
    tierQty,
    subtotal,
    tipPercent,
    tipAmount,
    tax,
    shipping,
    amount,
    pledgeStatus: 'active',
    charged: false,
    createdAt,
    history: [
      {
        type: 'created',
        tierId,
        tierQty,
        subtotal,
        tipPercent,
        tipAmount,
        tax,
        shipping,
        amount,
        at: createdAt
      }
    ]
  };
}

function runReportScript(
  scriptName: string,
  values: Record<string, unknown>,
  args: string[] = [],
  options: { failOnList?: boolean } = {}
) {
  const tempDir = mkdtempSync(join(tmpdir(), 'pool-report-test-'));
  const fixturePath = join(tempDir, 'wrangler-fixture.json');
  const wranglerPath = join(tempDir, 'wrangler');
  const failOnList = options.failOnList === true;

  writeFileSync(
    fixturePath,
    JSON.stringify({
      keys: Object.keys(values),
      values
    })
  );

  writeFileSync(
    wranglerPath,
    `#!/usr/bin/env node
const fs = require('fs');
const fixture = JSON.parse(fs.readFileSync(process.env.MOCK_WRANGLER_DATA, 'utf8'));
const args = process.argv.slice(2);

if (args[0] === 'kv' && args[1] === 'key' && args[2] === 'list') {
  if (${failOnList ? 'true' : 'false'}) {
    console.error('Unexpected wrangler invocation:', args.join(' '));
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(fixture.keys.map((name) => ({ name }))));
  process.exit(0);
}

if (args[0] === 'kv' && args[1] === 'key' && args[2] === 'get') {
  const key = args[3];
  process.stdout.write(fixture.values[key] ? JSON.stringify(fixture.values[key]) : '');
  process.exit(0);
}

console.error('Unexpected wrangler invocation:', args.join(' '));
process.exit(1);
`
  );
  chmodSync(wranglerPath, 0o755);

  const result = spawnSync('bash', [join(repoRoot, 'scripts', scriptName), ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: tempDir,
      PATH: `${tempDir}:${process.env.PATH || ''}`,
      MOCK_WRANGLER_DATA: fixturePath
    },
    encoding: 'utf8'
  });

  rmSync(tempDir, { recursive: true, force: true });

  expect(result.status).toBe(0);
  return result.stdout.trim().split(/\r?\n/);
}

describe('pledge and fulfillment reports', () => {
  afterEach(() => {
    // no-op, temp dirs are removed per test
  });

  it('outputs one pledge-report row per campaign with per-campaign totals for bundled checkout pledges', () => {
    const lines = runReportScript('pledge-report.sh', {
      'pledge:pool-intent-bundle-1-smoke-editable': buildPledge({
        orderId: 'pool-intent-bundle-1-smoke-editable',
        email: 'supporter@example.com',
        campaignSlug: 'smoke-editable',
        tierId: 'frame',
        tierQty: 1,
        subtotal: 1000,
        tipPercent: 5,
        tipAmount: 50,
        tax: 79,
        shipping: 0,
        amount: 1129,
        createdAt: '2026-04-06T12:00:00.000Z'
      }),
      'pledge:pool-intent-bundle-1-sunder': buildPledge({
        orderId: 'pool-intent-bundle-1-sunder',
        email: 'supporter@example.com',
        campaignSlug: 'sunder',
        tierId: 'prop',
        tierQty: 1,
        subtotal: 2500,
        tipPercent: 5,
        tipAmount: 125,
        tax: 197,
        shipping: 300,
        amount: 3122,
        createdAt: '2026-04-06T12:00:00.000Z'
      })
    });

    expect(lines).toEqual([
      'email,campaign,items,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,smoke-editable,One Frame,10.00,5,0.50,0.79,0.00,11.29,created,no,2026-04-06T12:00:00.000Z,pool-intent-bundle-1-smoke-editable',
      'supporter@example.com,sunder,Handheld Prop,25.00,5,1.25,1.97,3.00,31.22,created,no,2026-04-06T12:00:00.000Z,pool-intent-bundle-1-sunder'
    ]);
  });

  it('keeps fulfillment-report totals separated by campaign for the same supporter', () => {
    const lines = runReportScript('fulfillment-report.sh', {
      'pledge:pool-intent-bundle-1-smoke-editable': buildPledge({
        orderId: 'pool-intent-bundle-1-smoke-editable',
        email: 'supporter@example.com',
        campaignSlug: 'smoke-editable',
        tierId: 'frame',
        tierQty: 1,
        subtotal: 1000,
        tipPercent: 5,
        tipAmount: 50,
        tax: 79,
        shipping: 0,
        amount: 1129,
        createdAt: '2026-04-06T12:00:00.000Z'
      }),
      'pledge:pool-intent-bundle-1-sunder': buildPledge({
        orderId: 'pool-intent-bundle-1-sunder',
        email: 'supporter@example.com',
        campaignSlug: 'sunder',
        tierId: 'prop',
        tierQty: 1,
        subtotal: 2500,
        tipPercent: 5,
        tipAmount: 125,
        tax: 197,
        shipping: 300,
        amount: 3122,
        createdAt: '2026-04-06T12:00:00.000Z'
      })
    });

    expect(lines).toEqual([
      'email,campaign,items,subtotal,tip_percent,tip,tax,shipping,total,shipping_address',
      'supporter@example.com,smoke-editable,One Frame,10.00,5,0.50,0.79,0.00,11.29,',
      'supporter@example.com,sunder,Handheld Prop,25.00,5,1.25,1.97,3.00,31.22,'
    ]);
  });

  it('labels tip-only modifications clearly in pledge-report output', () => {
    const lines = runReportScript('pledge-report.sh', {
      'pledge:pool-intent-tip-only-1': {
        ...buildPledge({
          orderId: 'pool-intent-tip-only-1',
          email: 'supporter@example.com',
          campaignSlug: 'sunder',
          tierId: 'prop',
          tierQty: 1,
          subtotal: 2500,
          tipPercent: 9,
          tipAmount: 225,
          tax: 197,
          shipping: 300,
          amount: 3222,
          createdAt: '2026-04-06T12:00:00.000Z'
        }),
        history: [
          {
            type: 'created',
            tierId: 'prop',
            tierQty: 1,
            subtotal: 2500,
            tipPercent: 5,
            tipAmount: 125,
            tax: 197,
            shipping: 300,
            amount: 3122,
            at: '2026-04-06T12:00:00.000Z'
          },
          {
            type: 'modified',
            subtotalDelta: 0,
            tipPercent: 9,
            tipAmount: 225,
            tipAmountDelta: 100,
            taxDelta: 0,
            shippingDelta: 0,
            amountDelta: 100,
            tierId: 'prop',
            tierQty: 1,
            at: '2026-04-06T13:00:00.000Z'
          }
        ]
      }
    });

    expect(lines).toEqual([
      'email,campaign,items,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,sunder,Handheld Prop,25.00,5,1.25,1.97,3.00,31.22,created,no,2026-04-06T12:00:00.000Z,pool-intent-tip-only-1',
      'supporter@example.com,sunder,(tip updated to 9%),0.00,9,1.00,0.00,0.00,1.00,modified,no,2026-04-06T13:00:00.000Z,pool-intent-tip-only-1'
    ]);
  });

  it('keeps tip update context when a modification also changes pledge items', () => {
    const lines = runReportScript('pledge-report.sh', {
      'pledge:pool-intent-tip-and-support-1': {
        ...buildPledge({
          orderId: 'pool-intent-tip-and-support-1',
          email: 'supporter@example.com',
          campaignSlug: 'sunder',
          tierId: 'prop',
          tierQty: 1,
          subtotal: 3500,
          tipPercent: 8,
          tipAmount: 280,
          tax: 276,
          shipping: 300,
          amount: 4056,
          createdAt: '2026-04-06T12:00:00.000Z'
        }),
        customAmount: 10,
        history: [
          {
            type: 'created',
            tierId: 'prop',
            tierQty: 1,
            subtotal: 2500,
            tipPercent: 5,
            tipAmount: 125,
            tax: 197,
            shipping: 300,
            amount: 3122,
            customAmount: 0,
            at: '2026-04-06T12:00:00.000Z'
          },
          {
            type: 'modified',
            subtotalDelta: 1000,
            tipPercent: 8,
            tipAmount: 155,
            tipAmountDelta: 155,
            taxDelta: 79,
            shippingDelta: 0,
            amountDelta: 934,
            tierId: 'prop',
            tierQty: 1,
            customAmount: 10,
            at: '2026-04-06T13:00:00.000Z'
          }
        ]
      }
    });

    expect(lines).toEqual([
      'email,campaign,items,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,sunder,Handheld Prop,25.00,5,1.25,1.97,3.00,31.22,created,no,2026-04-06T12:00:00.000Z,pool-intent-tip-and-support-1',
      'supporter@example.com,sunder,(modified) +Custom Support $10.00; tip updated to 8%,10.00,8,1.55,0.79,0.00,9.34,modified,no,2026-04-06T13:00:00.000Z,pool-intent-tip-and-support-1'
    ]);
  });

  it('uses the campaign pledge index for single-campaign pledge reports', () => {
    const lines = runReportScript(
      'pledge-report.sh',
      {
        'campaign-pledges:sunder': ['pool-intent-bundle-1-sunder'],
        'pledge:pool-intent-bundle-1-smoke-editable': buildPledge({
          orderId: 'pool-intent-bundle-1-smoke-editable',
          email: 'supporter@example.com',
          campaignSlug: 'smoke-editable',
          tierId: 'frame',
          tierQty: 1,
          subtotal: 1000,
          tipPercent: 5,
          tipAmount: 50,
          tax: 79,
          shipping: 0,
          amount: 1129,
          createdAt: '2026-04-06T12:00:00.000Z'
        }),
        'pledge:pool-intent-bundle-1-sunder': buildPledge({
          orderId: 'pool-intent-bundle-1-sunder',
          email: 'supporter@example.com',
          campaignSlug: 'sunder',
          tierId: 'prop',
          tierQty: 1,
          subtotal: 2500,
          tipPercent: 5,
          tipAmount: 125,
          tax: 197,
          shipping: 300,
          amount: 3122,
          createdAt: '2026-04-06T12:00:00.000Z'
        })
      },
      ['sunder'],
      { failOnList: true }
    );

    expect(lines).toEqual([
      'email,campaign,items,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,sunder,Handheld Prop,25.00,5,1.25,1.97,3.00,31.22,created,no,2026-04-06T12:00:00.000Z,pool-intent-bundle-1-sunder'
    ]);
  });

  it('uses the campaign pledge index for single-campaign fulfillment reports', () => {
    const lines = runReportScript(
      'fulfillment-report.sh',
      {
        'campaign-pledges:sunder': ['pool-intent-bundle-1-sunder'],
        'pledge:pool-intent-bundle-1-smoke-editable': buildPledge({
          orderId: 'pool-intent-bundle-1-smoke-editable',
          email: 'supporter@example.com',
          campaignSlug: 'smoke-editable',
          tierId: 'frame',
          tierQty: 1,
          subtotal: 1000,
          tipPercent: 5,
          tipAmount: 50,
          tax: 79,
          shipping: 0,
          amount: 1129,
          createdAt: '2026-04-06T12:00:00.000Z'
        }),
        'pledge:pool-intent-bundle-1-sunder': buildPledge({
          orderId: 'pool-intent-bundle-1-sunder',
          email: 'supporter@example.com',
          campaignSlug: 'sunder',
          tierId: 'prop',
          tierQty: 1,
          subtotal: 2500,
          tipPercent: 5,
          tipAmount: 125,
          tax: 197,
          shipping: 300,
          amount: 3122,
          createdAt: '2026-04-06T12:00:00.000Z'
        })
      },
      ['sunder'],
      { failOnList: true }
    );

    expect(lines).toEqual([
      'email,campaign,items,subtotal,tip_percent,tip,tax,shipping,total,shipping_address',
      'supporter@example.com,sunder,Handheld Prop,25.00,5,1.25,1.97,3.00,31.22,'
    ]);
  });
});
