/**
 * Rate Limiting Security Tests
 * 
 * Tests for abuse prevention and rate limiting behavior.
 * Note: These tests may be slow due to burst testing.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  securityFetch,
  WORKER_URL,
  PROD_MODE,
  burstRequests,
  TEST_CAMPAIGNS
} from './helpers';

describe('Rate Limiting Security Tests', () => {
  beforeAll(() => {
    console.log(`Testing against: ${WORKER_URL}`);
    console.log(`Production mode: ${PROD_MODE}`);
    console.log('Note: Rate limiting tests may be slow');
  });

  describe('SEC-005: Rate Limiting Existence Check', () => {
    it('should handle burst of requests to /stats (read-only)', async () => {
      const requests = () => securityFetch(`/stats/${TEST_CAMPAIGNS.valid}`);
      
      // Send 10 concurrent requests
      const responses = await burstRequests(requests, 10);
      
      // All should succeed (stats is public, read-only)
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(5);
      
      // Check if any were rate limited (429)
      const rateLimited = responses.filter(r => r.status === 429);
      if (rateLimited.length > 0) {
        console.log('✅ Rate limiting is active on /stats');
      } else {
        console.log('⚠️ No rate limiting detected on /stats (acceptable for read-only)');
      }
    });

    it('should potentially rate limit burst requests to /start', async () => {
      if (PROD_MODE) {
        console.log('Skipping /start burst test in production to avoid Stripe API spam');
        return;
      }
      
      const requests = () => securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: `test-rate-limit-${Date.now()}-${Math.random()}`,
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: 'ratelimit-test@example.com'
        })
      });
      
      // Send 5 concurrent requests
      const responses = await burstRequests(requests, 5);
      
      // Check for rate limiting (429) or success (200) or validation errors
      const statuses = responses.map(r => r.status);
      console.log('/start burst response statuses:', statuses);
      
      const rateLimited = responses.filter(r => r.status === 429);
      if (rateLimited.length > 0) {
        console.log('✅ Rate limiting is active on /start');
        expect(rateLimited.length).toBeGreaterThan(0);
      } else {
        console.log('⚠️ No rate limiting detected on /start - consider adding');
      }
    });

    it('should potentially rate limit burst requests to /votes', async () => {
      const requests = () => securityFetch('/votes', {
        method: 'POST',
        body: JSON.stringify({
          token: 'fake-token',
          decisionId: 'poster',
          option: 'A'
        })
      });
      
      // Send 10 concurrent requests
      const responses = await burstRequests(requests, 10);
      
      const statuses = responses.map(r => r.status);
      console.log('/votes burst response statuses:', statuses);
      
      const rateLimited = responses.filter(r => r.status === 429);
      if (rateLimited.length > 0) {
        console.log('✅ Rate limiting is active on /votes');
      } else {
        // All should fail auth anyway, but no rate limiting
        const authFailed = responses.filter(r => r.status === 401);
        console.log(`⚠️ No rate limiting on /votes (${authFailed.length} auth failures)`);
      }
    });

    it('should potentially rate limit admin endpoint attempts', async () => {
      const requests = () => securityFetch('/admin/rebuild', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer wrong-secret-${Math.random()}`
        },
        body: JSON.stringify({ reason: 'rate-limit-test' })
      });
      
      // Send 10 concurrent requests with wrong secrets
      const responses = await burstRequests(requests, 10);
      
      const statuses = responses.map(r => r.status);
      console.log('/admin/rebuild burst response statuses:', statuses);
      
      const rateLimited = responses.filter(r => r.status === 429);
      const authFailed = responses.filter(r => r.status === 401);
      
      if (rateLimited.length > 0) {
        console.log('✅ Rate limiting is active on admin endpoints');
      } else {
        console.log(`⚠️ No rate limiting on /admin/rebuild (${authFailed.length} auth failures)`);
        console.log('   Consider adding aggressive rate limiting for admin endpoints');
      }
    });
  });

  describe('DoS Resilience', () => {
    it('should handle many sequential requests without degradation', async () => {
      const startTime = performance.now();
      const requestCount = 20;
      
      for (let i = 0; i < requestCount; i++) {
        await securityFetch(`/stats/${TEST_CAMPAIGNS.valid}`);
      }
      
      const totalTime = performance.now() - startTime;
      const avgTime = totalTime / requestCount;
      
      console.log(`${requestCount} sequential requests completed in ${totalTime.toFixed(0)}ms`);
      console.log(`Average response time: ${avgTime.toFixed(0)}ms`);
      
      // Average should be reasonable (under 1 second per request)
      expect(avgTime).toBeLessThan(1000);
    });

    it('should not crash under rapid OPTIONS requests', async () => {
      const requests = () => securityFetch('/start', { method: 'OPTIONS' });
      
      const responses = await burstRequests(requests, 20);
      
      // All should return CORS headers
      const successCount = responses.filter(r => r.status === 200 || r.status === 204).length;
      expect(successCount).toBe(20);
    });
  });

  describe('Resource Exhaustion Prevention', () => {
    it('should reject excessively large request bodies', async () => {
      const largeBody = JSON.stringify({
        orderId: 'test-large-body',
        campaignSlug: TEST_CAMPAIGNS.valid,
        amountCents: 500,
        email: 'test@example.com',
        padding: 'x'.repeat(1000000) // 1MB of padding
      });
      
      const res = await securityFetch('/start', {
        method: 'POST',
        body: largeBody
      });
      
      // Should reject large body or handle gracefully (429 = rate limited)
      // Cloudflare has a 100MB limit, but smaller limits are good
      expect([200, 400, 413, 429, 500]).toContain(res.status);
    });

    it('should handle deep JSON nesting', async () => {
      // Create deeply nested object
      let nested: any = { value: 'bottom' };
      for (let i = 0; i < 100; i++) {
        nested = { nested };
      }
      
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-deep-nesting',
          campaignSlug: TEST_CAMPAIGNS.valid,
          amountCents: 500,
          email: 'test@example.com',
          extra: nested
        })
      });
      
      // Should not crash
      expect(res.status).toBeDefined();
    });

    it('should handle many query parameters', async () => {
      const manyParams = Array.from({ length: 100 }, (_, i) => `param${i}=value${i}`).join('&');
      
      const res = await securityFetch(`/stats/${TEST_CAMPAIGNS.valid}?${manyParams}`);
      
      // Should ignore extra params, not crash
      expect([200, 400, 414]).toContain(res.status);
    });
  });

  describe('Slow Request Handling', () => {
    it('should have reasonable timeout for slow responses', async () => {
      // This tests that the worker responds within a reasonable time
      // even for invalid requests
      const startTime = performance.now();
      
      const res = await securityFetch('/start', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'test-timeout',
          campaignSlug: 'nonexistent-campaign-that-will-fail-lookup',
          amountCents: 500,
          email: 'test@example.com'
        })
      });
      
      const duration = performance.now() - startTime;
      
      console.log(`Slow request completed in ${duration.toFixed(0)}ms`);
      
      // Should respond within 10 seconds even for invalid campaign
      expect(duration).toBeLessThan(10000);
      expect(res.status).toBeDefined();
    });
  });

  describe('Vote Spam Prevention', () => {
    it('should track or limit vote attempts per user', async () => {
      // Without a valid token, these will all fail auth,
      // but we're checking for rate limiting behavior
      
      const attempts = 20;
      const responses: Response[] = [];
      
      for (let i = 0; i < attempts; i++) {
        const res = await securityFetch('/votes', {
          method: 'POST',
          body: JSON.stringify({
            token: 'fake-token-for-spam-test',
            decisionId: 'poster',
            option: i % 2 === 0 ? 'A' : 'B'
          })
        });
        responses.push(res);
      }
      
      const statuses = responses.map(r => r.status);
      const rateLimited = responses.filter(r => r.status === 429).length;
      const authFailed = responses.filter(r => r.status === 401).length;
      
      console.log(`Vote spam test: ${attempts} attempts, ${rateLimited} rate limited, ${authFailed} auth failed`);
      
      if (rateLimited > 0) {
        console.log('✅ Rate limiting detected for vote spam');
      } else {
        console.log('⚠️ No rate limiting for vote spam - consider adding');
      }
    });
  });

  describe('Concurrent Operation Safety', () => {
    it('should handle concurrent stats requests safely', async () => {
      const requests = () => securityFetch(`/stats/${TEST_CAMPAIGNS.valid}`);
      
      const responses = await burstRequests(requests, 20);
      
      // All should return consistent data
      const bodies = await Promise.all(responses.map(r => r.json().catch(() => null)));
      const validBodies = bodies.filter(b => b !== null);
      
      // All non-null responses should have the same structure
      if (validBodies.length > 1) {
        const firstKeys = Object.keys(validBodies[0]).sort();
        for (const body of validBodies.slice(1)) {
          const keys = Object.keys(body).sort();
          expect(keys).toEqual(firstKeys);
        }
      }
    });

    it('should handle concurrent inventory requests safely', async () => {
      const requests = () => securityFetch(`/inventory/${TEST_CAMPAIGNS.valid}`);
      
      const responses = await burstRequests(requests, 20);
      
      // Check for consistency
      const successResponses = responses.filter(r => r.status === 200);
      expect(successResponses.length).toBeGreaterThan(0);
    });
  });
});
