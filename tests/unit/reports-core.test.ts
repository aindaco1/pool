import { describe, expect, it } from 'vitest';

import { buildFulfillmentReport, buildPledgeLedgerReport } from '../../worker/src/reports.js';

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

describe('reports core', () => {
  it('exports actual and estimated current fees once per pledge, including cancelled and failed records', () => {
    const base = {
      email: 'supporter@example.com', campaignSlug: 'sunder',
      amount: 5000, subtotal: 4500, tipAmount: 500,
      createdAt: '2026-04-06T12:00:00.000Z',
      history: [
        { type: 'created', amount: 3000, subtotal: 2700, at: '2026-04-06T12:00:00.000Z' },
        { type: 'modified', amountDelta: 2000, subtotalDelta: 1800, at: '2026-04-06T13:00:00.000Z' }
      ]
    };
    const report = buildPledgeLedgerReport([
      { ...base, orderId: 'actual', charged: true, stripeFinancials: { source: 'actual', feeAmount: 200, netAmount: 4800 } },
      { ...base, orderId: 'estimated', pledgeStatus: 'active' },
      { ...base, orderId: 'cancelled', pledgeStatus: 'cancelled', history: [] },
      { ...base, orderId: 'failed', pledgeStatus: 'payment_failed', history: [] }
    ]);
    expect(report.rows.every((row: string[]) => row.length === report.header.length)).toBe(true);
    expect(report.rows.map((row: string[]) => row.slice(-4))).toEqual([
      ['', '', '', ''],
      ['actual', '2.00', '1.80', '43.20'],
      ['', '', '', ''],
      ['estimated', '1.75', '1.58', '43.42'],
      ['not_applicable', '0.00', '0.00', '0.00'],
      ['not_applicable', '0.00', '0.00', '45.00']
    ]);
  });

  it('builds a pledge ledger csv for history entries', () => {
    const report = buildPledgeLedgerReport([
      {
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
    ]);

    expect(report.csv).toBe([
      'email,campaign,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,status,charged,created_at,order_id,current_stripe_fee_source,current_stripe_fee,current_campaign_stripe_fee,current_campaign_amount_after_fees',
      'supporter@example.com,sunder,Handheld Prop,,25.00,0.00,25.00,5,1.25,1.97,3.00,31.22,created,no,2026-04-06T12:00:00.000Z,pool-intent-tip-only-1,,,,',
      'supporter@example.com,sunder,(tip updated to 9%),,0.00,0.00,0.00,9,1.00,0.00,0.00,1.00,modified,no,2026-04-06T13:00:00.000Z,pool-intent-tip-only-1,estimated,1.23,0.95,24.05'
    ].join('\n'));
  });

  it('builds fulfillment rows for campaign and platform fulfillers', () => {
    const report = buildFulfillmentReport([
      buildPledge({
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
    ], { platformFulfiller: 'Dust Wave' });

    expect(report.csv).toBe([
      'email,campaign,fulfiller,items,add_on_items,campaign_subtotal,platform_add_on_subtotal,subtotal,tip_percent,tip,tax,shipping,total,shipping_address',
      'supporter@example.com,,Dust Wave,,DUST WAVE Sticker x2; DUST WAVE T-Shirt (M),0.00,25.00,25.00,5,1.25,1.97,1.50,29.72,"Supporter Example, 123 Example St, Denver, CO, 80205, US"',
      'supporter@example.com,sunder,sunder,Handheld Prop,,25.00,0.00,25.00,5,1.25,1.97,1.50,29.72,"Supporter Example, 123 Example St, Denver, CO, 80205, US"'
    ].join('\n'));
  });
});
