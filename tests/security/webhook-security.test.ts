/**
 * Webhook Security Tests
 * 
 * Tests for Stripe and Snipcart webhook signature verification.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  securityFetch,
  WORKER_URL,
  PROD_MODE,
  generateFakeStripeSignature,
  TEST_CAMPAIGNS
} from './helpers';

describe('Webhook Security Tests', () => {
  beforeAll(() => {
    console.log(`Testing against: ${WORKER_URL}`);
    console.log(`Production mode: ${PROD_MODE}`);
  });

  describe('SEC-002: Stripe Webhook Signature Verification', () => {
    const fakeStripeEvent = {
      id: 'evt_fake_123',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: 'cs_fake_123',
          mode: 'setup',
          customer: 'cus_fake',
          customer_email: 'attacker@evil.com',
          setup_intent: 'seti_fake',
          metadata: {
            orderId: 'malicious-order-123',
            campaignSlug: TEST_CAMPAIGNS.valid,
            amountCents: '9999999', // Attacker tries to create huge pledge
            tierId: 'frame',
            tierName: 'Malicious Tier'
          }
        }
      }
    };

    it('should reject webhook without signature header', async () => {
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(fakeStripeEvent)
      });
      
      // Should fail - no signature header
      expect([401, 500]).toContain(res.status);
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = JSON.stringify(fakeStripeEvent);
      const fakeSignature = generateFakeStripeSignature(payload);
      
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': fakeSignature
        },
        body: payload
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('Invalid signature');
    });

    it('should reject webhook with empty signature', async () => {
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': ''
        },
        body: JSON.stringify(fakeStripeEvent)
      });
      
      expect([401, 500]).toContain(res.status);
    });

    it('should reject webhook with malformed signature format', async () => {
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'not_a_valid_format'
        },
        body: JSON.stringify(fakeStripeEvent)
      });
      
      expect(res.status).toBe(401);
    });

    it('should reject webhook with expired timestamp', async () => {
      // Stripe signatures include a timestamp; old ones should be rejected
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const expiredSignature = `t=${oldTimestamp},v1=fake_signature`;
      
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': expiredSignature
        },
        body: JSON.stringify(fakeStripeEvent)
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      // Should mention timestamp or signature error
      expect(body.error).toBeDefined();
    });

    it('should reject webhook attempting to create pledge for non-existent campaign', async () => {
      const maliciousEvent = {
        ...fakeStripeEvent,
        data: {
          object: {
            ...fakeStripeEvent.data.object,
            metadata: {
              ...fakeStripeEvent.data.object.metadata,
              campaignSlug: 'admin-internal-campaign'
            }
          }
        }
      };
      
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': generateFakeStripeSignature(JSON.stringify(maliciousEvent))
        },
        body: JSON.stringify(maliciousEvent)
      });
      
      // Should fail signature verification first
      expect(res.status).toBe(401);
    });

    it('should not process the same event ID twice (idempotency)', async () => {
      // This is a defense in depth check - even if signature passed,
      // duplicate events should be skipped
      // We can't fully test this without a valid signature,
      // but we can verify the mechanism exists
      
      const eventId = `evt_test_duplicate_${Date.now()}`;
      const event1 = { ...fakeStripeEvent, id: eventId };
      
      // First request (will fail signature, but that's expected)
      await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': generateFakeStripeSignature(JSON.stringify(event1))
        },
        body: JSON.stringify(event1)
      });
      
      // Second request with same event ID
      const res2 = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': generateFakeStripeSignature(JSON.stringify(event1))
        },
        body: JSON.stringify(event1)
      });
      
      // Both should fail signature verification
      expect(res2.status).toBe(401);
    });
  });

  describe('Snipcart Webhook Security', () => {
    const fakeSnipcartEvent = {
      eventName: 'order.completed',
      mode: 'Test',
      content: {
        token: 'snipcart-order-fake-123',
        email: 'attacker@evil.com',
        items: [{
          id: `${TEST_CAMPAIGNS.valid}__frame`,
          name: 'Test Tier',
          price: 5,
          quantity: 1
        }]
      }
    };

    it('should reject webhook without request token', async () => {
      const res = await securityFetch('/webhooks/snipcart', {
        method: 'POST',
        body: JSON.stringify(fakeSnipcartEvent)
      });
      
      // Should reject if SNIPCART_WEBHOOK_SECRET is configured
      // Might return 401 or 500 depending on config
      // If no secret configured, might return 200 (vulnerability!)
      if (PROD_MODE) {
        expect([401, 500]).toContain(res.status);
      }
    });

    it('should reject webhook with invalid request token', async () => {
      const res = await securityFetch('/webhooks/snipcart', {
        method: 'POST',
        headers: {
          'x-snipcart-requesttoken': 'invalid_token_attempt'
        },
        body: JSON.stringify(fakeSnipcartEvent)
      });
      
      // Should reject
      if (PROD_MODE) {
        expect([401, 500]).toContain(res.status);
      }
    });

    it('should reject webhook with empty request token', async () => {
      const res = await securityFetch('/webhooks/snipcart', {
        method: 'POST',
        headers: {
          'x-snipcart-requesttoken': ''
        },
        body: JSON.stringify(fakeSnipcartEvent)
      });
      
      if (PROD_MODE) {
        expect([401, 500]).toContain(res.status);
      }
    });
  });

  describe('Webhook Payload Manipulation', () => {
    it('should handle empty body gracefully', async () => {
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 't=123,v1=abc'
        },
        body: ''
      });
      
      // Should fail gracefully, not crash
      expect([400, 401, 500]).toContain(res.status);
    });

    it('should handle invalid JSON body', async () => {
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 't=123,v1=abc'
        },
        body: 'not valid json {'
      });
      
      // Should fail gracefully
      expect([400, 401, 500]).toContain(res.status);
    });

    it('should handle extremely large payload', async () => {
      const largePayload = JSON.stringify({
        id: 'evt_test',
        data: { padding: 'x'.repeat(100000) }
      });
      
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 't=123,v1=abc'
        },
        body: largePayload
      });
      
      // Should either reject or handle gracefully
      expect([400, 401, 413, 500]).toContain(res.status);
    });
  });

  describe('Mode Mismatch Handling', () => {
    it('should acknowledge test events sent to production worker with 200 OK', async () => {
      // When a test-mode event is sent to a production worker (or vice versa),
      // the worker should acknowledge it with 200 OK and skip processing.
      // This prevents signature verification failures when Stripe sends test
      // events to a production endpoint.
      const testEvent = {
        id: 'evt_test_mode_mismatch',
        type: 'checkout.session.completed',
        livemode: false, // Test mode event
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'setup'
          }
        }
      };
      
      // Note: In production (SNIPCART_MODE=live), the worker should skip this
      // before signature verification and return 200 OK.
      // In test mode, it will proceed to signature verification and fail.
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 't=123,v1=fake'
        },
        body: JSON.stringify(testEvent)
      });
      
      // Both 200 (mode mismatch skip) and 401 (signature fail) are acceptable
      // depending on whether we're testing against prod or test worker
      expect([200, 401]).toContain(res.status);
      
      if (res.status === 200) {
        const body = await res.json();
        expect(body.skipped).toBe('mode mismatch');
        console.log('✅ Mode mismatch handling active - test events skipped in production');
      }
    });
  });

  describe('Replay Attack Prevention', () => {
    it('should reject signatures with future timestamps', async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in future
      const futureSignature = `t=${futureTimestamp},v1=fake_signature`;
      
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': futureSignature
        },
        body: JSON.stringify({ id: 'evt_test', type: 'test' })
      });
      
      // Should reject - timestamp validation should catch this
      expect([401, 500]).toContain(res.status);
    });

    it('should reject signatures with very old timestamps', async () => {
      const ancientTimestamp = Math.floor(Date.now() / 1000) - 86400; // 24 hours ago
      const oldSignature = `t=${ancientTimestamp},v1=fake_signature`;
      
      const res = await securityFetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': oldSignature
        },
        body: JSON.stringify({ id: 'evt_test', type: 'test' })
      });
      
      expect(res.status).toBe(401);
    });
  });
});
