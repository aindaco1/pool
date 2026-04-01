import { describe, expect, it } from 'vitest';

import { extractCartFromSnipcartItems, extractPledgeFromOrder } from '../../worker/src/snipcart.js';

describe('snipcart cart parsing', () => {
  it('extracts campaign slug, tiers, support items, and custom support from real item shapes', () => {
    const cart = extractCartFromSnipcartItems([
      {
        id: 'hand-relations__frame-slot',
        price: 5,
        quantity: 2,
        url: 'https://pool.test/campaigns/hand-relations/'
      },
      {
        id: 'hand-relations__support__location-scouting',
        price: 10,
        quantity: 3,
        url: 'https://pool.test/campaigns/hand-relations/'
      },
      {
        id: 'hand-relations__custom-support',
        price: 7,
        quantity: 2,
        url: 'https://pool.test/campaigns/hand-relations/'
      },
      {
        id: 'hand-relations__vip-pass',
        price: 100,
        quantity: 1,
        url: 'https://pool.test/campaigns/hand-relations/'
      },
      {
        id: 'shipping',
        price: 3,
        quantity: 1,
        url: 'https://pool.test/campaigns/hand-relations/'
      }
    ]);

    expect(cart).toEqual({
      campaignSlug: 'hand-relations',
      tierSelections: [
        { id: 'frame-slot', qty: 2 },
        { id: 'vip-pass', qty: 1 }
      ],
      supportItems: [
        { id: 'location-scouting', amount: 30 }
      ],
      customAmount: 14
    });
  });

  it('merges repeated tier rows and ignores malformed ids', () => {
    const cart = extractCartFromSnipcartItems([
      {
        id: 'hand-relations__frame-slot',
        price: 5,
        quantity: 1,
        url: 'https://pool.test/campaigns/hand-relations/'
      },
      {
        id: 'hand-relations__frame-slot',
        price: 5,
        quantity: 4,
        url: 'https://pool.test/campaigns/hand-relations/'
      },
      {
        id: 'hand-relations__',
        price: 99,
        quantity: 1,
        url: 'https://pool.test/campaigns/hand-relations/'
      },
      {
        id: 'not-a-tier',
        price: 50,
        quantity: 1,
        url: 'https://pool.test/campaigns/hand-relations/'
      }
    ]);

    expect(cart.tierSelections).toEqual([{ id: 'frame-slot', qty: 5 }]);
    expect(cart.supportItems).toEqual([]);
    expect(cart.customAmount).toBe(0);
  });

  it('extracts pledge metadata from a Snipcart order using parsed item state', () => {
    const pledge = extractPledgeFromOrder({
      token: 'snip-order-123',
      email: 'supporter@example.com',
      status: 'Processed',
      paymentStatus: 'Pending',
      finalGrandTotal: 128.45,
      creationDate: '2026-03-31T00:00:00.000Z',
      modificationDate: '2026-03-31T00:05:00.000Z',
      metadata: { source: 'test' },
      items: [
        {
          id: 'hand-relations__frame-slot',
          name: 'Buy 1 Frame',
          price: 5,
          quantity: 1,
          url: 'https://pool.test/campaigns/hand-relations/'
        },
        {
          id: 'hand-relations__support__location-scouting',
          name: 'Location Scouting',
          price: 20,
          quantity: 1,
          url: 'https://pool.test/campaigns/hand-relations/'
        }
      ]
    });

    expect(pledge).toMatchObject({
      orderId: 'snip-order-123',
      email: 'supporter@example.com',
      campaignSlug: 'hand-relations',
      tierName: 'Buy 1 Frame',
      amount: 12845,
      supportItems: [{ id: 'location-scouting', amount: 20 }],
      customAmount: 0,
      metadata: { source: 'test' }
    });
    expect(pledge?.tierSelections).toEqual([{ id: 'frame-slot', qty: 1 }]);
  });
});
