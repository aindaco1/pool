/**
 * Authentication Bypass Security Tests
 * 
 * Tests for token validation, dev-mode bypasses, and auth edge cases.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  securityFetch,
  WORKER_URL,
  PROD_MODE,
  TEST_TOKEN,
  generateFakeToken,
  generateExpiredPayload,
  TEST_CAMPAIGNS
} from './helpers';

describe('Authentication Bypass Tests', () => {
  beforeAll(() => {
    console.log(`Testing against: ${WORKER_URL}`);
    console.log(`Production mode: ${PROD_MODE}`);
  });

  describe('SEC-001: Dev-Token Bypass on /votes', () => {
    it('should reject dev-token-* in production mode', async () => {
      const devToken = `dev-token-${TEST_CAMPAIGNS.valid}`;
      
      const res = await securityFetch(`/votes?token=${devToken}&decisions=poster`);
      
      // In production, dev tokens should be rejected
      // This test FAILS if the vulnerability exists
      if (PROD_MODE) {
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toContain('Invalid');
      } else {
        // In test mode, dev tokens are allowed (429 = rate limited)
        expect([200, 401, 429]).toContain(res.status);
      }
    });

    it('should reject dev-token for POST /votes in production', async () => {
      const devToken = `dev-token-${TEST_CAMPAIGNS.valid}`;
      
      const res = await securityFetch('/votes', {
        method: 'POST',
        body: JSON.stringify({
          token: devToken,
          decisionId: 'poster',
          option: 'A'
        })
      });
      
      if (PROD_MODE) {
        expect(res.status).toBe(401);
      }
    });

    it('should not allow arbitrary campaign access via dev-token', async () => {
      // Attacker tries to access any campaign using dev-token
      const devToken = 'dev-token-secret-internal-campaign';
      
      const res = await securityFetch(`/votes?token=${devToken}&decisions=admin-decision`);
      
      // Should reject or at least not expose internal data
      if (PROD_MODE) {
        expect(res.status).toBe(401);
      }
    });
  });

  describe('Magic Link Token Validation', () => {
    it('should reject missing token on /pledge', async () => {
      const res = await securityFetch('/pledge');
      
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Missing token');
    });

    it('should reject missing token on /pledges', async () => {
      const res = await securityFetch('/pledges');
      
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Missing token');
    });

    it('should reject missing token on /votes', async () => {
      const res = await securityFetch('/votes?decisions=poster');
      
      // 400 = missing token, 429 = rate limited (both acceptable)
      expect([400, 429]).toContain(res.status);
      if (res.status === 400) {
        const body = await res.json();
        expect(body.error).toContain('Missing token');
      }
    });

    it('should reject malformed tokens (no signature)', async () => {
      const malformedToken = 'eyJvcmRlcklkIjoidGVzdCJ9'; // Just payload, no signature
      
      const res = await securityFetch(`/pledge?token=${malformedToken}`);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('Invalid');
    });

    it('should reject tokens with tampered payload', async () => {
      const fakeToken = generateFakeToken({
        orderId: 'test-order-123',
        email: 'attacker@evil.com',
        campaignSlug: TEST_CAMPAIGNS.valid
      });
      
      const res = await securityFetch(`/pledge?token=${fakeToken}`);
      
      expect(res.status).toBe(401);
    });

    it('should reject expired tokens', async () => {
      const expiredPayload = generateExpiredPayload({
        orderId: 'test-order-123',
        email: 'test@example.com',
        campaignSlug: TEST_CAMPAIGNS.valid
      });
      const fakeToken = generateFakeToken(expiredPayload);
      
      const res = await securityFetch(`/pledge?token=${fakeToken}`);
      
      expect(res.status).toBe(401);
    });

    it('should reject completely random tokens', async () => {
      const randomToken = 'totally_random_garbage_token_12345';
      
      const res = await securityFetch(`/pledge?token=${randomToken}`);
      
      expect(res.status).toBe(401);
    });

    it('should reject URL-encoded attack payloads in token', async () => {
      const attackToken = encodeURIComponent('../../admin?token=bypass');
      
      const res = await securityFetch(`/pledge?token=${attackToken}`);
      
      expect(res.status).toBe(401);
    });
  });

  describe('Token-Protected Endpoints', () => {
    it('should reject /pledge/cancel without token', async () => {
      const res = await securityFetch('/pledge/cancel', {
        method: 'POST',
        body: JSON.stringify({ orderId: 'test-123' })
      });
      
      expect(res.status).toBe(400);
    });

    it('should reject /pledge/modify without token', async () => {
      const res = await securityFetch('/pledge/modify', {
        method: 'POST',
        body: JSON.stringify({ newTierId: 'frame' })
      });
      
      expect(res.status).toBe(400);
    });

    it('should reject /pledge/payment-method/start without token', async () => {
      const res = await securityFetch('/pledge/payment-method/start', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      expect(res.status).toBe(400);
    });
  });

  describe('Public Endpoints (No Auth Required)', () => {
    it('should allow /stats/:slug without auth', async () => {
      const res = await securityFetch(`/stats/${TEST_CAMPAIGNS.valid}`);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.campaignSlug).toBe(TEST_CAMPAIGNS.valid);
    });

    it('should allow /inventory/:slug without auth', async () => {
      const res = await securityFetch(`/inventory/${TEST_CAMPAIGNS.valid}`);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.campaignSlug).toBe(TEST_CAMPAIGNS.valid);
    });

    it('should return 400 for /stats with empty slug', async () => {
      const res = await securityFetch('/stats/');
      
      // Might be 400 or 404 depending on routing
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('Token in POST Body (for cancel/modify)', () => {
    it('should reject fake token in body for /pledge/cancel', async () => {
      const fakeToken = generateFakeToken({
        orderId: 'victim-order-123',
        email: 'victim@example.com',
        campaignSlug: TEST_CAMPAIGNS.valid
      });
      
      const res = await securityFetch('/pledge/cancel', {
        method: 'POST',
        body: JSON.stringify({ token: fakeToken })
      });
      
      expect(res.status).toBe(401);
    });

    it('should reject empty token in body', async () => {
      const res = await securityFetch('/pledge/cancel', {
        method: 'POST',
        body: JSON.stringify({ token: '' })
      });
      
      expect(res.status).toBe(400);
    });

    it('should reject null token in body', async () => {
      const res = await securityFetch('/pledge/cancel', {
        method: 'POST',
        body: JSON.stringify({ token: null })
      });
      
      expect(res.status).toBe(400);
    });
  });
});
