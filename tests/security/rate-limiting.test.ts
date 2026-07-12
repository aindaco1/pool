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

function testIp(octet: number) {
  return `198.51.100.${octet}`;
}

async function sequentialRequests(
  fn: () => Promise<Response>,
  count: number
): Promise<Response[]> {
  const responses: Response[] = [];
  for (let i = 0; i < count; i++) {
    responses.push(await fn());
  }
  return responses;
}

describe('Rate Limiting Security Tests', () => {
  beforeAll(() => {
    console.log(`Testing against: ${WORKER_URL}`);
    console.log(`Production mode: ${PROD_MODE}`);
    console.log('Note: Rate limiting tests may be slow');
  });

  describe('SEC-005: Rate Limiting Existence Check', () => {
    it('should leave public /stats read bursts uncapped for campaign virality', async () => {
      const requests = () => securityFetch(`/stats/${TEST_CAMPAIGNS.valid}`, {
        headers: {
          'CF-Connecting-IP': testIp(10)
        }
      });
      
      // Send 10 concurrent requests
      const responses = await burstRequests(requests, 10);
      
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBe(0);

      // Public read-only stats may return either an existing payload or a clean not-found.
      const successCount = responses.filter(r => r.status === 200 || r.status === 404).length;
      expect(successCount).toBeGreaterThanOrEqual(5);
    });

    it('should rate limit checkout start bursts before Stripe-heavy work fans out', async () => {
      if (PROD_MODE) {
        console.log('Skipping checkout-intent/start burst test in production to avoid Stripe API spam');
        return;
      }
      
      const requests = () => securityFetch('/checkout-intent/start', {
        method: 'POST',
        headers: {
          'CF-Connecting-IP': testIp(11)
        },
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5
        })
      });
      
      // Cross the bucket sequentially so the local KV simulation observes the counter increments.
      const responses = await sequentialRequests(requests, 45);
      
      const statuses = responses.map(r => r.status);
      console.log('/checkout-intent/start burst response statuses:', statuses);
      
      const rateLimited = responses.filter(r => r.status === 429);
      const unavailable = responses.filter(r => r.status === 503);
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(statuses.every(status => status === 400 || status === 429 || status === 503)).toBe(true);
      for (const response of unavailable) {
        await expect(response.json()).resolves.toMatchObject({ error: 'Rate limiting unavailable' });
      }
    });

    it('should rate limit vote spam bursts before token validation', async () => {
      const requests = () => securityFetch('/votes', {
        method: 'POST',
        headers: {
          'CF-Connecting-IP': testIp(12)
        },
        body: JSON.stringify({
          token: 'fake-token',
          decisionId: 'poster',
          option: 'A'
        })
      });
      
      const responses = await sequentialRequests(requests, 50);
      
      const statuses = responses.map(r => r.status);
      console.log('/votes burst response statuses:', statuses);
      
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(statuses.every(status => status === 401 || status === 429)).toBe(true);
    });

    it('should rate limit admin endpoint brute-force attempts', async () => {
      const requests = () => securityFetch('/admin/rebuild', {
        method: 'POST',
        headers: {
          'CF-Connecting-IP': testIp(13),
          'Authorization': `Bearer wrong-secret-${Math.random()}`
        },
        body: JSON.stringify({ reason: 'rate-limit-test' })
      });
      
      const responses = await sequentialRequests(requests, 8);
      
      const statuses = responses.map(r => r.status);
      console.log('/admin/rebuild burst response statuses:', statuses);
      
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(statuses.every(status => status === 401 || status === 429)).toBe(true);
    });

    it('should rate limit manage-pledge read bursts separately from writes', async () => {
      const requests = () => securityFetch('/pledges?token=fake-token', {
        headers: {
          'CF-Connecting-IP': testIp(14)
        }
      });

      const responses = await sequentialRequests(requests, 125);
      const statuses = responses.map(r => r.status);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
      expect(statuses.every(status => status === 401 || status === 429)).toBe(true);
    });

    it('should rate limit manage-pledge write bursts before token validation', async () => {
      const requests = () => securityFetch('/pledge/modify', {
        method: 'POST',
        headers: {
          'CF-Connecting-IP': testIp(15)
        },
        body: JSON.stringify({
          token: 'fake-token',
          orderId: 'pool-intent-rate-limit-write',
          tierId: 'frame-slot',
          tierQty: 1
        })
      });

      const responses = await sequentialRequests(requests, 35);
      const statuses = responses.map(r => r.status);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
      expect(statuses.every(status => status === 400 || status === 401 || status === 429)).toBe(true);
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
      const requests = () => securityFetch('/checkout-intent/start', { method: 'OPTIONS' });
      
      const responses = await burstRequests(requests, 20);
      
      // All should return CORS headers
      const successCount = responses.filter(r => r.status === 200 || r.status === 204).length;
      expect(successCount).toBe(20);
    });
  });

  describe('Resource Exhaustion Prevention', () => {
    it('should reject excessively large request bodies with 413', async () => {
      const largeBody = JSON.stringify({
        orderId: 'test-large-body',
        campaignSlug: TEST_CAMPAIGNS.valid,
        amountCents: 500,
        email: 'test@example.com',
        padding: 'x'.repeat(1000000) // 1MB of padding
      });
      
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        headers: {
          'CF-Connecting-IP': testIp(16)
        },
        body: largeBody
      });
      
      expect(res.status).toBe(413);
    });

    it('should handle deep JSON nesting', async () => {
      // Create deeply nested object
      let nested: any = { value: 'bottom' };
      for (let i = 0; i < 100; i++) {
        nested = { nested };
      }
      
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: TEST_CAMPAIGNS.valid,
          items: [],
          tipPercent: 5,
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
      expect([200, 400, 404, 414]).toContain(res.status);
    });
  });

  describe('Slow Request Handling', () => {
    it('should have reasonable timeout for slow responses', async () => {
      // This tests that the worker responds within a reasonable time
      // even for invalid requests
      const startTime = performance.now();
      
      const res = await securityFetch('/checkout-intent/start', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: 'nonexistent-campaign-that-will-fail-lookup',
          items: [
            { id: 'nonexistent-campaign-that-will-fail-lookup__frame', quantity: 1 }
          ],
          tipPercent: 5
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
      
      const attempts = 50;
      const responses: Response[] = [];
      
      for (let i = 0; i < attempts; i++) {
        const res = await securityFetch('/votes', {
          method: 'POST',
          headers: {
            'CF-Connecting-IP': testIp(17)
          },
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
      expect(rateLimited).toBeGreaterThan(0);
      expect(rateLimited + authFailed).toBe(attempts);
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
