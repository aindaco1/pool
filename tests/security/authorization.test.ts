/**
 * Authorization Security Tests
 * 
 * Tests for cross-user access, admin endpoint protection, and privilege escalation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  securityFetch,
  WORKER_URL,
  PROD_MODE,
  ADMIN_SECRET,
  generateFakeToken,
  TEST_CAMPAIGNS
} from './helpers';

describe('Authorization Security Tests', () => {
  beforeAll(() => {
    console.log(`Testing against: ${WORKER_URL}`);
    console.log(`Production mode: ${PROD_MODE}`);
  });

  describe('SEC-003: Test Endpoint Access in Production', () => {
    it('should reject /test/setup in production mode', async () => {
      const res = await securityFetch('/test/setup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'attacker@evil.com',
          campaignSlug: TEST_CAMPAIGNS.valid
        })
      });
      
      if (PROD_MODE) {
        // In production, test endpoints should return 404 (not 401/403)
        // to avoid revealing their existence
        expect([403, 404]).toContain(res.status);
      } else {
        // In test mode, they might work
        expect([200, 403, 404, 500]).toContain(res.status);
      }
    });

    it('should reject /test/cleanup in production mode', async () => {
      const res = await securityFetch('/test/cleanup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          campaignSlug: TEST_CAMPAIGNS.valid
        })
      });
      
      if (PROD_MODE) {
        expect([403, 404]).toContain(res.status);
      }
    });

    it('should reject /test/email in production mode', async () => {
      const res = await securityFetch('/test/email', {
        method: 'POST',
        body: JSON.stringify({
          type: 'supporter',
          email: 'victim@example.com',
          campaignSlug: TEST_CAMPAIGNS.valid
        })
      });
      
      if (PROD_MODE) {
        expect([403, 404]).toContain(res.status);
      }
    });

    it('should reject /test/votes in production mode', async () => {
      const res = await securityFetch('/test/votes', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          decisions: { poster: { A: 100, B: 50 } }
        })
      });
      
      if (PROD_MODE) {
        expect([403, 404]).toContain(res.status);
      }
    });
  });

  describe('Admin Endpoint Protection', () => {
    it('should reject /admin/rebuild without auth', async () => {
      const res = await securityFetch('/admin/rebuild', {
        method: 'POST',
        body: JSON.stringify({ reason: 'attacker-test' })
      });
      
      // 401 = unauthorized, 429 = rate limited (both acceptable)
      expect([401, 429]).toContain(res.status);
    });

    it('should reject /admin/rebuild with wrong secret', async () => {
      const res = await securityFetch('/admin/rebuild', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer wrong_secret_123'
        },
        body: JSON.stringify({ reason: 'attacker-test' })
      });
      
      // 401 = unauthorized, 429 = rate limited (both acceptable)
      expect([401, 429]).toContain(res.status);
    });

    it('should reject /admin/settle/:slug without auth', async () => {
      const res = await securityFetch(`/admin/settle/${TEST_CAMPAIGNS.valid}`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      // 401 = unauthorized, 429 = rate limited (both acceptable)
      expect([401, 429]).toContain(res.status);
    });

    it('should reject /admin/settle/:slug with wrong header name', async () => {
      const res = await securityFetch(`/admin/settle/${TEST_CAMPAIGNS.valid}`, {
        method: 'POST',
        headers: {
          'X-Admin-Token': ADMIN_SECRET // Wrong header name
        },
        body: JSON.stringify({})
      });
      
      // 401 = unauthorized, 429 = rate limited (both acceptable)
      expect([401, 429]).toContain(res.status);
    });

    it('should reject /admin/broadcast/diary without auth', async () => {
      const res = await securityFetch('/admin/broadcast/diary', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          title: 'Malicious Diary',
          body: 'Attacker content'
        })
      });
      
      // 401 = unauthorized, 429 = rate limited (both acceptable)
      expect([401, 429]).toContain(res.status);
    });

    it('should reject /admin/broadcast/milestone without auth', async () => {
      const res = await securityFetch('/admin/broadcast/milestone', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          milestone: 'goal'
        })
      });
      
      // 401 = unauthorized, 429 = rate limited (both acceptable)
      expect([401, 429]).toContain(res.status);
    });

    it('should reject /admin/milestone-check/:slug without auth', async () => {
      const res = await securityFetch(`/admin/milestone-check/${TEST_CAMPAIGNS.valid}`, {
        method: 'POST'
      });
      
      // 401 = unauthorized, 429 = rate limited (both acceptable)
      expect([401, 429]).toContain(res.status);
    });

    it('should reject /admin/inventory/init-all without auth', async () => {
      const res = await securityFetch('/admin/inventory/init-all', {
        method: 'POST'
      });
      
      expect(res.status).toBe(401);
    });

    it('should reject stats recalculate without auth', async () => {
      const res = await securityFetch(`/stats/${TEST_CAMPAIGNS.valid}/recalculate`, {
        method: 'POST'
      });
      
      expect(res.status).toBe(401);
    });

    it('should reject inventory recalculate without auth', async () => {
      const res = await securityFetch(`/inventory/${TEST_CAMPAIGNS.valid}/recalculate`, {
        method: 'POST'
      });
      
      expect(res.status).toBe(401);
    });
  });

  describe('Cross-User Access Prevention', () => {
    it('should reject cancel with token for different email', async () => {
      // Create a token claiming to be user A
      const tokenForUserA = generateFakeToken({
        orderId: 'order-user-a',
        email: 'userA@example.com',
        campaignSlug: TEST_CAMPAIGNS.valid
      });
      
      // Try to cancel order belonging to user B
      const res = await securityFetch('/pledge/cancel', {
        method: 'POST',
        body: JSON.stringify({
          token: tokenForUserA,
          orderId: 'order-user-b'
        })
      });
      
      // Should fail (token signature invalid, or if valid, email mismatch)
      expect([401, 403]).toContain(res.status);
    });

    it('should reject modify with token for different order', async () => {
      const fakeToken = generateFakeToken({
        orderId: 'my-order-123',
        email: 'me@example.com',
        campaignSlug: TEST_CAMPAIGNS.valid
      });
      
      const res = await securityFetch('/pledge/modify', {
        method: 'POST',
        body: JSON.stringify({
          token: fakeToken,
          orderId: 'someone-elses-order',
          newTierId: 'frame'
        })
      });
      
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Campaign Slug Validation', () => {
    it('should reject /start with non-existent campaign', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-order-123',
          campaignSlug: TEST_CAMPAIGNS.invalid,
          amountCents: 500,
          email: 'test@example.com'
        })
      });
      
      // 400 = invalid campaign, 429 = rate limited (both acceptable)
      expect([400, 429]).toContain(res.status);
      if (res.status === 400) {
        const body = await res.json();
        expect(body.error).toContain('not found');
      }
    });

    it('should reject /start with path traversal in campaign slug', async () => {
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-order-123',
          campaignSlug: TEST_CAMPAIGNS.malicious,
          amountCents: 500,
          email: 'test@example.com'
        })
      });
      
      // Should fail validation, not cause path traversal (429 = rate limited)
      expect([400, 404, 429]).toContain(res.status);
    });

    it('should handle URL-encoded campaign slugs safely', async () => {
      const encodedMalicious = encodeURIComponent('../../../etc/passwd');
      
      const res = await securityFetch(`/stats/${encodedMalicious}`);
      
      // Should return 200 (empty stats) or 400/404 - key is no file exposure
      expect([200, 400, 404]).toContain(res.status);
      
      const body = await res.text();
      expect(body).not.toContain('root:');
    });
  });

  describe('HTTP Method Enforcement', () => {
    it('should reject GET on POST-only endpoints', async () => {
      const endpoints = ['/start', '/pledge/cancel', '/pledge/modify', '/admin/rebuild'];
      
      for (const endpoint of endpoints) {
        const res = await securityFetch(endpoint, { method: 'GET' });
        expect([400, 404, 405]).toContain(res.status);
      }
    });

    it('should reject POST on GET-only endpoints', async () => {
      const endpoints = ['/pledge', '/pledges'];
      
      for (const endpoint of endpoints) {
        const res = await securityFetch(endpoint, { 
          method: 'POST',
          body: JSON.stringify({ token: 'test' })
        });
        expect([400, 404, 405]).toContain(res.status);
      }
    });
  });

  describe('Admin Secret Brute Force Protection', () => {
    it('should not leak timing information on wrong vs right secret length', async () => {
      // This is a basic timing attack check
      // In practice, should use constant-time comparison
      
      const shortSecret = 'a';
      const longSecret = 'a'.repeat(100);
      
      const startShort = performance.now();
      await securityFetch('/admin/rebuild', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${shortSecret}` },
        body: '{}'
      });
      const durationShort = performance.now() - startShort;
      
      const startLong = performance.now();
      await securityFetch('/admin/rebuild', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${longSecret}` },
        body: '{}'
      });
      const durationLong = performance.now() - startLong;
      
      // Durations should be similar (within reasonable variance)
      // This is a weak test due to network variance, but can catch obvious issues
      const ratio = Math.max(durationShort, durationLong) / Math.min(durationShort, durationLong);
      expect(ratio).toBeLessThan(3); // Should not differ by more than 3x
    });
  });
});
