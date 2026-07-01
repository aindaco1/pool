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
  createdAt,
  goalTrackingSubtotal = null,
  bundleAddOnSubtotal = null,
  bundleAddOns = [],
  shippingAddress = null,
  customAmount = 0,
  history = null
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
  goalTrackingSubtotal?: number | null;
  bundleAddOnSubtotal?: number | null;
  bundleAddOns?: Array<Record<string, unknown>>;
  shippingAddress?: Record<string, unknown> | null;
  customAmount?: number;
  history?: Array<Record<string, unknown>> | null;
}) {
  const defaultHistory = [
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
      bundleAddOns,
      bundleAddOnSubtotal,
      customAmount,
      at: createdAt
    }
  ];
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
    goalTrackingSubtotal,
    bundleAddOnSubtotal,
    bundleAddOns,
    shippingAddress,
    customAmount,
    pledgeStatus: 'active',
    charged: false,
    createdAt,
    history: history ?? defaultHistory
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

function runReportScriptWithoutCloudflareToken(scriptName: string) {
  const tempDir = mkdtempSync(join(tmpdir(), 'pool-report-auth-test-'));
  const result = spawnSync('bash', [join(repoRoot, 'scripts', scriptName), '--env', 'production', '--remote'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: tempDir,
      CLOUDFLARE_API_TOKEN: '',
      MOCK_WRANGLER_DATA: '',
      POOL_REPORT_LOAD_ENV: '0'
    },
    encoding: 'utf8'
  });
  rmSync(tempDir, { recursive: true, force: true });

  return result;
}

describe('pledge and fulfillment reports', () => {
  afterEach(() => {
    // no-op, temp dirs are removed per test
  });

  it.each(['pledge-report.sh', 'fulfillment-report.sh'])(
    'fails %s remote exports clearly when Wrangler auth is missing',
    (scriptName) => {
      const result = runReportScriptWithoutCloudflareToken(scriptName);

      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Remote report export could not authenticate with Wrangler');
      expect(result.stderr).not.toContain('Traceback');
    },
    15000
  );

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
      'email,campaign,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,smoke-editable,One Frame,,10.00,0.00,10.00,5,0.50,0.79,0.00,11.29,created,no,2026-04-06T12:00:00.000Z,pool-intent-bundle-1-smoke-editable',
      'supporter@example.com,sunder,Handheld Prop,,25.00,0.00,25.00,5,1.25,1.97,3.00,31.22,created,no,2026-04-06T12:00:00.000Z,pool-intent-bundle-1-sunder'
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
      'email,campaign,fulfiller,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,shipping_address',
      'supporter@example.com,smoke-editable,smoke-editable,One Frame,,10.00,0.00,10.00,5,0.50,0.79,0.00,11.29,',
      'supporter@example.com,sunder,sunder,Handheld Prop,,25.00,0.00,25.00,5,1.25,1.97,3.00,31.22,'
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
      'email,campaign,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,sunder,Handheld Prop,,25.00,0.00,25.00,5,1.25,1.97,3.00,31.22,created,no,2026-04-06T12:00:00.000Z,pool-intent-tip-only-1',
      'supporter@example.com,sunder,(tip updated to 9%),,0.00,0.00,0.00,9,1.00,0.00,0.00,1.00,modified,no,2026-04-06T13:00:00.000Z,pool-intent-tip-only-1'
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
      'email,campaign,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,sunder,Handheld Prop,,25.00,0.00,25.00,5,1.25,1.97,3.00,31.22,created,no,2026-04-06T12:00:00.000Z,pool-intent-tip-and-support-1',
      'supporter@example.com,sunder,(modified) +Custom Support $10.00; tip updated to 8%,,10.00,0.00,10.00,8,1.55,0.79,0.00,9.34,modified,no,2026-04-06T13:00:00.000Z,pool-intent-tip-and-support-1'
    ]);
  });

  it('labels add-on-only modifications clearly in pledge-report output', () => {
    const lines = runReportScript('pledge-report.sh', {
      'pledge:pool-intent-addon-mod-1': {
        ...buildPledge({
          orderId: 'pool-intent-addon-mod-1',
          email: 'supporter@example.com',
          campaignSlug: 'sunder',
          tierId: 'prop',
          tierQty: 1,
          subtotal: 3500,
          goalTrackingSubtotal: 1000,
          bundleAddOnSubtotal: 2500,
          bundleAddOns: [
            { productId: 'dust-wave-butterfingers', name: 'DUST WAVE Butterfingers T-Shirt', variantLabel: 'XS', quantity: 1, unitPrice: 2500 }
          ],
          tipPercent: 5,
          tipAmount: 175,
          tax: 276,
          shipping: 300,
          amount: 4251,
          createdAt: '2026-04-06T12:00:00.000Z'
        }),
        history: [
          {
            type: 'created',
            tierId: 'prop',
            tierQty: 1,
            subtotal: 1300,
            goalTrackingSubtotal: 1000,
            bundleAddOnSubtotal: 300,
            bundleAddOns: [
              { productId: 'dust-wave-sticker', name: 'DUST WAVE Sticker', quantity: 1, unitPrice: 300 }
            ],
            tipPercent: 5,
            tipAmount: 65,
            tax: 102,
            shipping: 300,
            amount: 1767,
            at: '2026-04-06T12:00:00.000Z'
          },
          {
            type: 'modified',
            subtotalDelta: 2200,
            bundleAddOns: [
              { productId: 'dust-wave-butterfingers', name: 'DUST WAVE Butterfingers T-Shirt', variantLabel: 'XS', quantity: 1, unitPrice: 2500 }
            ],
            tipPercent: 5,
            tipAmount: 110,
            tipAmountDelta: 110,
            taxDelta: 174,
            shippingDelta: 0,
            amountDelta: 2484,
            tierId: 'prop',
            tierQty: 1,
            at: '2026-04-06T13:00:00.000Z'
          }
        ]
      }
    });

    expect(lines).toEqual([
      'email,campaign,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,sunder,Handheld Prop,DUST WAVE Sticker,10.00,3.00,13.00,5,0.65,1.02,3.00,17.67,created,no,2026-04-06T12:00:00.000Z,pool-intent-addon-mod-1',
      'supporter@example.com,sunder,(modified add-ons; tip updated to 5%),+DUST WAVE Butterfingers T-Shirt (XS); -DUST WAVE Sticker,0.00,22.00,22.00,5,1.10,1.74,0.00,24.84,modified,no,2026-04-06T13:00:00.000Z,pool-intent-addon-mod-1'
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
      'email,campaign,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,sunder,Handheld Prop,,25.00,0.00,25.00,5,1.25,1.97,3.00,31.22,created,no,2026-04-06T12:00:00.000Z,pool-intent-bundle-1-sunder'
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
      'email,campaign,fulfiller,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,shipping_address',
      'supporter@example.com,sunder,sunder,Handheld Prop,,25.00,0.00,25.00,5,1.25,1.97,3.00,31.22,'
    ]);
  });

  it('separates platform add-on value from campaign pledge value in pledge-report output', () => {
    const lines = runReportScript('pledge-report.sh', {
      'pledge:pool-intent-add-ons-1': buildPledge({
        orderId: 'pool-intent-add-ons-1',
        email: 'supporter@example.com',
        campaignSlug: 'sunder',
        tierId: 'prop',
        tierQty: 1,
        subtotal: 5000,
        goalTrackingSubtotal: 2500,
        bundleAddOnSubtotal: 2500,
        bundleAddOns: [
          { productId: 'dust-wave-sticker', name: 'DUST WAVE Sticker', quantity: 2, unitPrice: 500, scope: 'platform' },
          { productId: 'dust-wave-tshirt', name: 'DUST WAVE T-Shirt', variantLabel: 'M', quantity: 1, unitPrice: 1500, scope: 'platform' }
        ],
        tipPercent: 5,
        tipAmount: 250,
        tax: 394,
        shipping: 300,
        amount: 5944,
        createdAt: '2026-04-06T12:00:00.000Z'
      })
    });

    expect(lines).toEqual([
      'email,campaign,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,sunder,Handheld Prop,DUST WAVE Sticker x2; DUST WAVE T-Shirt (M),25.00,25.00,50.00,5,2.50,3.94,3.00,59.44,created,no,2026-04-06T12:00:00.000Z,pool-intent-add-ons-1'
    ]);
  });

  it('surfaces add-on items separately in fulfillment-report output', () => {
    const lines = runReportScript('fulfillment-report.sh', {
      'pledge:pool-intent-add-ons-1': buildPledge({
        orderId: 'pool-intent-add-ons-1',
        email: 'supporter@example.com',
        campaignSlug: 'sunder',
        tierId: 'prop',
        tierQty: 1,
        subtotal: 5000,
        goalTrackingSubtotal: 2500,
        bundleAddOnSubtotal: 2500,
        bundleAddOns: [
          { productId: 'dust-wave-sticker', name: 'DUST WAVE Sticker', quantity: 2, unitPrice: 500, scope: 'platform' },
          { productId: 'dust-wave-tshirt', name: 'DUST WAVE T-Shirt', variantLabel: 'M', quantity: 1, unitPrice: 1500, scope: 'platform' }
        ],
        tipPercent: 5,
        tipAmount: 250,
        tax: 394,
        shipping: 300,
        amount: 5944,
        shippingAddress: {
          name: 'Supporter Example',
          address1: '123 Example St',
          city: 'Denver',
          province: 'CO',
          postalCode: '80205',
          country: 'US'
        },
        createdAt: '2026-04-06T12:00:00.000Z'
      })
    });

    expect(lines).toEqual([
      'email,campaign,fulfiller,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,shipping_address',
      'supporter@example.com,,Dust Wave,,DUST WAVE Sticker x2; DUST WAVE T-Shirt (M),0.00,25.00,25.00,5,1.25,1.97,1.50,29.72,\"Supporter Example, 123 Example St, Denver, CO, 80205, US\"',
      'supporter@example.com,sunder,sunder,Handheld Prop,,25.00,0.00,25.00,5,1.25,1.97,1.50,29.72,\"Supporter Example, 123 Example St, Denver, CO, 80205, US\"'
    ]);
  });

  it('keeps fulfillment aligned with the final add-on state after modifications', () => {
    const lines = runReportScript('fulfillment-report.sh', {
      'pledge:pool-intent-addon-final-1': buildPledge({
        orderId: 'pool-intent-addon-final-1',
        email: 'supporter@example.com',
        campaignSlug: 'sunder',
        tierId: 'prop',
        tierQty: 1,
        subtotal: 3500,
        goalTrackingSubtotal: 1000,
        bundleAddOnSubtotal: 2500,
        bundleAddOns: [
          { productId: 'dust-wave-butterfingers', name: 'DUST WAVE Butterfingers T-Shirt', variantLabel: 'XS', quantity: 1, unitPrice: 2500, scope: 'platform' }
        ],
        tipPercent: 7,
        tipAmount: 245,
        tax: 276,
        shipping: 300,
        amount: 4321,
        shippingAddress: {
          name: 'Supporter Example',
          address1: '123 Example St',
          city: 'Denver',
          province: 'CO',
          postalCode: '80205',
          country: 'US'
        },
        createdAt: '2026-04-06T12:00:00.000Z'
      })
    });

    expect(lines).toEqual([
      'email,campaign,fulfiller,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,shipping_address',
      'supporter@example.com,,Dust Wave,,DUST WAVE Butterfingers T-Shirt (XS),0.00,25.00,25.00,7,1.75,1.98,2.15,30.88,\"Supporter Example, 123 Example St, Denver, CO, 80205, US\"',
      'supporter@example.com,sunder,sunder,Handheld Prop,,10.00,0.00,10.00,7,0.70,0.78,0.85,12.33,\"Supporter Example, 123 Example St, Denver, CO, 80205, US\"'
    ]);
  });

  it('counts campaign add-ons toward campaign subtotal in pledge-report output', () => {
    const lines = runReportScript('pledge-report.sh', {
      'pledge:pool-intent-campaign-add-on-1': buildPledge({
        orderId: 'pool-intent-campaign-add-on-1',
        email: 'supporter@example.com',
        campaignSlug: 'smoke-editable',
        tierId: 'frame',
        tierQty: 1,
        subtotal: 1600,
        goalTrackingSubtotal: 1600,
        bundleAddOnSubtotal: 600,
        bundleAddOns: [
          {
            productId: 'smoke-editable__first-time-sexpot-condom-pack',
            name: 'First Time Sexpot Condom Pack',
            quantity: 1,
            unitPrice: 600,
            scope: 'campaign',
            campaignSlug: 'smoke-editable',
            campaignTitle: 'SMOKE EDITABLE'
          }
        ],
        tipPercent: 5,
        tipAmount: 80,
        tax: 126,
        shipping: 300,
        amount: 2106,
        createdAt: '2026-04-06T12:00:00.000Z'
      })
    });

    expect(lines).toEqual([
      'email,campaign,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id',
      'supporter@example.com,smoke-editable,One Frame,First Time Sexpot Condom Pack,16.00,0.00,16.00,5,0.80,1.26,3.00,21.06,created,no,2026-04-06T12:00:00.000Z,pool-intent-campaign-add-on-1'
    ]);
  });

  it('lists campaign add-ons under the campaign fulfiller in fulfillment-report output', () => {
    const lines = runReportScript('fulfillment-report.sh', {
      'pledge:pool-intent-campaign-add-on-1': buildPledge({
        orderId: 'pool-intent-campaign-add-on-1',
        email: 'supporter@example.com',
        campaignSlug: 'smoke-editable',
        tierId: 'frame',
        tierQty: 1,
        subtotal: 1600,
        goalTrackingSubtotal: 1600,
        bundleAddOnSubtotal: 600,
        bundleAddOns: [
          {
            productId: 'smoke-editable__first-time-sexpot-poster',
            name: 'First Time Sexpot Poster',
            quantity: 1,
            unitPrice: 600,
            scope: 'campaign',
            campaignSlug: 'smoke-editable',
            campaignTitle: 'SMOKE EDITABLE'
          }
        ],
        tipPercent: 5,
        tipAmount: 80,
        tax: 126,
        shipping: 300,
        amount: 2106,
        shippingAddress: {
          name: 'Supporter Example',
          address1: '123 Example St',
          city: 'Denver',
          province: 'CO',
          postalCode: '80205',
          country: 'US'
        },
        createdAt: '2026-04-06T12:00:00.000Z'
      })
    });

    expect(lines).toEqual([
      'email,campaign,fulfiller,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,shipping_address',
      'supporter@example.com,smoke-editable,smoke-editable,One Frame,First Time Sexpot Poster,16.00,0.00,16.00,5,0.80,1.26,3.00,21.06,\"Supporter Example, 123 Example St, Denver, CO, 80205, US\"'
    ]);
  });
});
