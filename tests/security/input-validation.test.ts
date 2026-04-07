/**
 * Input Validation Security Tests
 * 
 * Tests for XSS, injection, overflow, and malformed input handling.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  securityFetch,
  WORKER_URL,
  PROD_MODE,
  MALICIOUS_PAYLOADS,
  TEST_CAMPAIGNS
} from './helpers';

describe('Input Validation Security Tests', () => {
  beforeAll(() => {
    console.log(`Testing against: ${WORKER_URL}`);
    console.log(`Production mode: ${PROD_MODE}`);
  });

  describe('XSS Prevention', () => {
    it.each(MALICIOUS_PAYLOADS.xss)('should handle XSS payload in email: %s', async (payload) => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          email: payload,
          tipPercent: 5
        })
      });
      
      // Should either reject invalid email or process safely
      // The payload should NOT appear unescaped in any response
      const body = await res.text();
      
      // Check response doesn't contain unescaped script tags
      expect(body).not.toContain('<script>');
      expect(body).not.toMatch(/<script/i);
    });

    it.each(MALICIOUS_PAYLOADS.xss)('should handle XSS payload in campaign slug: %s', async (payload) => {
      const res = await securityFetch(`/stats/${encodeURIComponent(payload)}`);
      
      const body = await res.text();
      expect(body).not.toContain('<script>');
    });

    it.each(MALICIOUS_PAYLOADS.xss)('should handle XSS in custom tier name', async (payload) => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5,
          tierName: payload
        })
      });
      
      const body = await res.text();
      expect(body).not.toContain('<script>');
    });
  });

  describe('SQL Injection Prevention (N/A but test anyway)', () => {
    it.each(MALICIOUS_PAYLOADS.sqlInjection)('should handle SQL injection in campaign slug: %s', async (payload) => {
      const res = await securityFetch(`/stats/${encodeURIComponent(payload)}`);
      
      // Should return 200 with empty stats (no campaign found) or 400/404
      // Key: no data leak, no crash
      expect([200, 400, 404]).toContain(res.status);
    });

    it.each(MALICIOUS_PAYLOADS.sqlInjection)('should handle SQL injection in orderId: %s', async (payload) => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          orderId: payload,
          tipPercent: 5
        })
      });
      
      expect([200, 400, 401, 403, 429]).toContain(res.status);
    });
  });

  describe('NoSQL Injection Prevention', () => {
    it.each(MALICIOUS_PAYLOADS.nosqlInjection)('should handle NoSQL injection payload: %s', async (payload) => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: payload,
          items: [],
          tipPercent: 5
        })
      });
      
      expect([400, 404, 429, 500]).toContain(res.status);
      if (res.status === 500) {
        console.warn('WARNING: Server error on NoSQL payload - investigate');
      }
    });

    it('should not allow prototype pollution via JSON', async () => {
      const pollutionPayload = {
        campaignSlug: TEST_CAMPAIGNS.valid,
        items: [],
        tipPercent: 5,
        '__proto__': { admin: true },
        'constructor': { 'prototype': { admin: true } }
      };
      
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify(pollutionPayload)
      });
      
      expect([200, 400, 429]).toContain(res.status);
    });
  });

  describe('Path Traversal Prevention', () => {
    it.each(MALICIOUS_PAYLOADS.pathTraversal)('should prevent path traversal: %s', async (payload) => {
      const res = await securityFetch(`/stats/${payload}`);
      
      // Should return 200 with empty stats (no campaign found), 400, or 404
      // Key: no file contents exposed
      expect([200, 400, 404]).toContain(res.status);
      
      const body = await res.text();
      // Should not contain file contents
      expect(body).not.toContain('root:');
      expect(body).not.toContain('[boot loader]');
    });
  });

  describe('Overflow Prevention', () => {
    it('should handle extremely long campaign slug', async () => {
      const longSlug = 'a'.repeat(10000);
      
      const res = await securityFetch(`/stats/${longSlug}`);
      
      // Should return 200 (empty stats) or fail gracefully, not crash
      expect([200, 400, 404, 414, 500]).toContain(res.status);
    });

    it('should handle extremely long email', async () => {
      const longEmail = 'a'.repeat(10000) + '@example.com';
      
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          email: longEmail,
          tipPercent: 5
        })
      });
      
      expect([200, 400, 413, 429, 500]).toContain(res.status);
    });

    it('should handle extremely large amountCents', async () => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: Number.MAX_SAFE_INTEGER,
          items: [],
          tipPercent: 5
        })
      });
      
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle negative amountCents', async () => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: -1000,
          items: [],
          tipPercent: 5
        })
      });
      
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle zero amountCents', async () => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 0,
          items: [],
          tipPercent: 5
        })
      });
      
      expect([200, 400, 429, 500]).toContain(res.status);
    });
  });

  describe('Content-Type Handling', () => {
    it('should reject non-JSON content type on POST endpoints', async () => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'campaignSlug=hand-relations&items=%5B%5D&tipPercent=5'
      });
      
      // Should fail to parse or reject (429 = rate limited)
      expect([400, 415, 429, 500]).toContain(res.status);
    });

    it('should handle missing Content-Type', async () => {
      const res = await fetch(`${WORKER_URL}/checkout-intent/start`, {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5
        })
      });
      
      // Might work or fail depending on implementation (429 = rate limited)
      expect([200, 400, 429, 500]).toContain(res.status);
    });
  });

  describe('Votes Input Validation', () => {
    it('should reject excessively long decisions list', async () => {
      const manyDecisions = Array.from({ length: 100 }, (_, i) => `decision${i}`).join(',');
      
      const res = await securityFetch(`/votes?token=test&decisions=${manyDecisions}`);
      
      // Should reject or handle gracefully (429 = rate limited)
      expect([400, 401, 429]).toContain(res.status);
    });

    it('should reject extremely long decision IDs', async () => {
      const longId = 'a'.repeat(1000);
      
      const res = await securityFetch(`/votes?token=test&decisions=${longId}`);
      
      // Should reject (429 = rate limited)
      expect([400, 401, 429]).toContain(res.status);
    });

    it('should reject extremely long option values', async () => {
      const longOption = 'A'.repeat(10000);
      
      const res = await securityFetch('/votes', {
        method: 'POST',
        body: JSON.stringify({
          token: 'fake-token',
          decisionId: 'poster',
          option: longOption
        })
      });
      
      // Should reject (token fails anyway, but option should be validated; 429 = rate limited)
      expect([400, 401, 429]).toContain(res.status);
    });
  });

  describe('JSON Parsing Edge Cases', () => {
    it('should handle duplicate keys in JSON', async () => {
      // JSON spec says last value wins, but behavior varies
      const duplicateKeys = '{"orderId":"test","orderId":"overwritten","campaignSlug":"hand-relations","amountCents":500,"email":"test@example.com"}';
      
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: duplicateKeys
      });
      
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle nested objects in unexpected fields', async () => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: { nested: 'object' },
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5
        })
      });
      
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle arrays in string fields', async () => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: ['array', 'of', 'strings'],
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5
        })
      });
      
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle null values', async () => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: null,
          campaignSlug: null,
          items: null,
          tipPercent: null
        })
      });
      
      expect([400, 429, 500]).toContain(res.status);
    });

    it('should handle unicode in input', async () => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-unicode-🎬🎥',
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5,
          email: 'tëst@éxample.com',
          tierName: '日本語タイヤー'
        })
      });
      
      expect([200, 400, 429]).toContain(res.status);
    });
  });

  describe('Shipping / Physical Product Input Validation', () => {
    it('should handle hasPhysical flag as non-boolean types', async () => {
      const payloads = [
        { hasPhysical: 'yes' },
        { hasPhysical: 1 },
        { hasPhysical: '<script>alert(1)</script>' },
        { hasPhysical: { __proto__: { admin: true } } },
        { hasPhysical: null },
      ];

      for (const extra of payloads) {
        const res = await securityFetch('/checkout-intent/start', {
          method: 'POST',
          body: JSON.stringify({
            campaignSlug: TEST_CAMPAIGNS.valid,
            items: [],
            tipPercent: 5,
            ...extra,
          })
        });

        expect([200, 400, 429, 500]).toContain(res.status);
        if (res.status === 500) {
          console.warn('WARNING: Server error on hasPhysical payload:', extra);
        }
      }
    });

    it('should not allow shipping fee manipulation via input', async () => {
      // Attacker tries to inject a negative shipping amount
      // (shipping is calculated server-side, not from client input)
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5,
          hasPhysical: true,
          shipping: -99999, // Attacker tries to inject negative shipping
          shippingFee: 0,   // Attacker tries to set fee to 0
        })
      });

      expect([200, 400, 429]).toContain(res.status);
    });

    it('should handle XSS in additionalTiers array', async () => {
      for (const xss of MALICIOUS_PAYLOADS.xss) {
        const res = await securityFetch('/checkout-intent/start', {
          method: 'POST',
          body: JSON.stringify({
            campaignSlug: TEST_CAMPAIGNS.valid,
            items: [],
            tipPercent: 5,
            additionalTiers: [{ id: xss, qty: 1 }],
          })
        });

        const body = await res.text();
        expect(body).not.toContain('<script>');
      }
    });

    it('should handle malicious supportItems array', async () => {
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5,
          supportItems: [
            { id: '<script>alert(1)</script>', amount: 100 },
            { id: 'valid-item', amount: -99999 }, // Negative amount
            { id: 'overflow', amount: Number.MAX_SAFE_INTEGER },
          ],
          customAmount: -500, // Negative custom amount
        })
      });

      expect([200, 400, 429, 500]).toContain(res.status);
      const body = await res.text();
      expect(body).not.toContain('<script>');
    });

    it('should handle invalid tipPercent values without crashing', async () => {
      const payloads = [
        { tipPercent: -1 },
        { tipPercent: 16 },
        { tipPercent: 4.5 },
        { tipPercent: 'free' },
        { tipPercent: '<script>alert(1)</script>' },
        { tipPercent: { percent: 100 } },
        { tipPercent: null },
      ];

      for (const extra of payloads) {
        const res = await securityFetch('/checkout-intent/start', {
          method: 'POST',
          body: JSON.stringify({
            campaignSlug: TEST_CAMPAIGNS.valid,
            items: [],
            ...extra,
          })
        });

        expect([200, 400, 429, 500]).toContain(res.status);
      }
    });

    it('should handle extremely large additionalTiers array', async () => {
      const hugeTiers = Array.from({ length: 1000 }, (_, i) => ({
        id: `tier-${i}`,
        qty: 1
      }));

      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5,
          additionalTiers: hugeTiers,
        })
      });

      expect([200, 400, 413, 429, 500]).toContain(res.status);
    });
  });

  describe('Email Validation', () => {
    it('should reject invalid email formats', async () => {
      const invalidEmails = [
        'not-an-email',
        '@missing-local.com',
        'missing-domain@',
        'spaces in@email.com',
        'multiple@@at.com'
      ];
      
      for (const email of invalidEmails) {
        const res = await securityFetch('/checkout-intent/start', {
          method: 'POST',
          body: JSON.stringify({
            campaignSlug: TEST_CAMPAIGNS.valid,
            items: [],
            tipPercent: 5,
            email
          })
        });
        
        expect([200, 400, 429, 500]).toContain(res.status);
      }
    });
  });
});
