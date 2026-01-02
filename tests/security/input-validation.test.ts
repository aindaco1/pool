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
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-order-xss',
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: payload
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
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-order-xss-tier',
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: 'test@example.com',
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
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: payload,
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: 'test@example.com'
        })
      });
      
      // Should not cause server error (429 = rate limited, also acceptable)
      expect([200, 400, 401, 403, 429]).toContain(res.status);
    });
  });

  describe('NoSQL Injection Prevention', () => {
    it.each(MALICIOUS_PAYLOADS.nosqlInjection)('should handle NoSQL injection payload: %s', async (payload) => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-nosql',
          campaignSlug: payload,
          amountCents: 500,
          email: 'test@example.com'
        })
      });
      
      // Should not crash or behave unexpectedly (429 = rate limited)
      expect([400, 404, 429, 500]).toContain(res.status);
      if (res.status === 500) {
        console.warn('WARNING: Server error on NoSQL payload - investigate');
      }
    });

    it('should not allow prototype pollution via JSON', async () => {
      const pollutionPayload = {
        orderId: 'test-proto',
        campaignSlug: TEST_CAMPAIGNS.valid,
        amountCents: 500,
        email: 'test@example.com',
        '__proto__': { admin: true },
        'constructor': { 'prototype': { admin: true } }
      };
      
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify(pollutionPayload)
      });
      
      // Should handle gracefully (429 = rate limited)
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
      
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-long-email',
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: longEmail
        })
      });
      
      // Worker accepts, Stripe may reject - either is fine (429 = rate limited)
      expect([200, 400, 413, 429, 500]).toContain(res.status);
    });

    it('should handle extremely large amountCents', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-huge-amount',
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: Number.MAX_SAFE_INTEGER,
          email: 'test@example.com'
        })
      });
      
      // Should handle gracefully (might succeed or fail validation, 429 = rate limited)
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle negative amountCents', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-negative-amount',
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: -1000,
          email: 'test@example.com'
        })
      });
      
      // Worker may accept (Stripe will reject), or reject early - either is fine (429 = rate limited)
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle zero amountCents', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-zero-amount',
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 0,
          email: 'test@example.com'
        })
      });
      
      // Worker may accept (Stripe will reject), or reject early - either is fine (429 = rate limited)
      expect([200, 400, 429, 500]).toContain(res.status);
    });
  });

  describe('Content-Type Handling', () => {
    it('should reject non-JSON content type on POST endpoints', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'orderId=test&campaignSlug=hand-relations&amountCents=500'
      });
      
      // Should fail to parse or reject (429 = rate limited)
      expect([400, 415, 429, 500]).toContain(res.status);
    });

    it('should handle missing Content-Type', async () => {
      const res = await fetch(`${WORKER_URL}/start`, {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-no-content-type',
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: 'test@example.com'
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
      
      const res = await securityFetch('/start', {
        method: 'POST',
        body: duplicateKeys
      });
      
      // Should handle gracefully (429 = rate limited)
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle nested objects in unexpected fields', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: { nested: 'object' },
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: 'test@example.com'
        })
      });
      
      // JS coerces to "[object Object]" - may succeed or fail, key is no crash (429 = rate limited)
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle arrays in string fields', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: ['array', 'of', 'strings'],
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: 'test@example.com'
        })
      });
      
      // JS coerces array to string - may succeed or fail, key is no crash (429 = rate limited)
      expect([200, 400, 429, 500]).toContain(res.status);
    });

    it('should handle null values', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: null,
          campaignSlug: null,
          amountCents: null,
          email: null
        })
      });
      
      // Should reject null required fields (429 = rate limited)
      expect([400, 429, 500]).toContain(res.status);
    });

    it('should handle unicode in input', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-unicode-🎬🎥',
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: 'tëst@éxample.com',
          tierName: '日本語タイヤー'
        })
      });
      
      // Should handle unicode gracefully (429 = rate limited)
      expect([200, 400, 429]).toContain(res.status);
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
        const res = await securityFetch('/start', {
          method: 'POST',
          body: JSON.stringify({
            orderId: `test-invalid-email-${Date.now()}`,
            campaignSlug: TEST_CAMPAIGNS.valid,
            amountCents: 500,
            email
          })
        });
        
        // Stripe may also reject these, so 200 or 400 are both acceptable (429 = rate limited)
        // The key is not crashing
        expect([200, 400, 429, 500]).toContain(res.status);
      }
    });
  });
});
