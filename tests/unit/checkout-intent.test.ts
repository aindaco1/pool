import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  buildCheckoutIntentPayload,
  createCheckoutIntentToken,
  DEFAULT_CHECKOUT_INTENT_TTL_SECONDS,
  hashCheckoutContribution,
  verifyCheckoutIntentToken
} from '../../worker/src/checkout-intent.js';
import {
  getCheckoutUiMode,
  getCartRuntime,
  getDefaultPlatformTipPercent,
  getMaxPlatformTipPercent,
  getCheckoutProvider,
  getPlatformCompanyName,
  getPlatformName,
  getPledgesEmailFrom,
  getSiteBase,
  getSupportEmail,
  getUpdatesEmailFrom,
  getWorkerBase,
  isFirstPartyCartEnabled,
  isFirstPartyCheckoutEnabled
} from '../../worker/src/provider-config.js';
import { CheckoutIntentNonceCoordinator } from '../../worker/src/checkout-intent-do.js';

class FakeStorage {
  map = new Map<string, any>();

  async get(key: string) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  async put(key: string, value: any) {
    this.map.set(key, value);
  }

  async delete(key: string) {
    this.map.delete(key);
  }

  async transaction<T>(callback: (storage: FakeStorage) => Promise<T>) {
    return callback(this);
  }
}

describe('checkout intent scaffolding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
    vi.stubGlobal('crypto', webcrypto);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('produces the same cart hash for equivalent contribution shapes', async () => {
    const first = await hashCheckoutContribution({
      campaignSlug: 'hand-relations',
      selectedTiers: [
        { id: 'frame-slot', qty: 2 },
        { id: 'producer-credit', qty: 1 }
      ],
      supportItems: [
        { id: 'location-scouting', amount: 2500 },
        { id: 'wardrobe', amount: 500 }
      ],
      customAmount: 0,
      tipPercent: 5,
      hasPhysical: true,
      subtotal: 10000,
      shipping: 300,
      tax: 788,
      total: 11588
    });

    const second = await hashCheckoutContribution({
      subtotal: 10000,
      tax: 788,
      total: 11588,
      shipping: 300,
      hasPhysical: true,
      tipPercent: 5,
      customAmount: 0,
      supportItems: [
        { amount: 500, id: 'wardrobe' },
        { amount: 2500, id: 'location-scouting' }
      ],
      selectedTiers: [
        { qty: 1, id: 'producer-credit' },
        { qty: 2, id: 'frame-slot' }
      ],
      campaignSlug: 'hand-relations'
    });

    expect(first).toBe(second);
  });

  it('creates and verifies a short-lived checkout token', async () => {
    const secret = 'checkout-intent-secret';
    const token = await createCheckoutIntentToken(secret, {
      nonce: 'nonce-123',
      cartHash: 'abc123',
      campaignSlug: 'hand-relations',
      tipPercent: 5,
      email: 'supporter@example.com'
    });

    const payload = await verifyCheckoutIntentToken(secret, token);
    expect(payload).toMatchObject({
      scope: 'checkout_start',
      version: 1,
      nonce: 'nonce-123',
      cartHash: 'abc123',
      campaignSlug: 'hand-relations',
      tipPercent: 5,
      email: 'supporter@example.com',
      issuedAt: 1775044800,
      exp: 1775044800 + DEFAULT_CHECKOUT_INTENT_TTL_SECONDS
    });
  });

  it('rejects tampered checkout tokens', async () => {
    const secret = 'checkout-intent-secret';
    const token = await createCheckoutIntentToken(secret, {
      nonce: 'nonce-123',
      cartHash: 'abc123',
      campaignSlug: 'hand-relations'
    });

    const [payloadB64, signatureB64] = token.split('.');
    const tamperedPayload = btoa('{"scope":"checkout_start","version":1,"nonce":"nonce-123","campaignSlug":"other","cartHash":"abc123","tipPercent":0,"email":"","issuedAt":1775044800,"exp":1775045400}')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const verified = await verifyCheckoutIntentToken(secret, `${tamperedPayload}.${signatureB64}`);
    expect(verified).toBeNull();
    expect(payloadB64).not.toBe(tamperedPayload);
  });

  it('normalizes provider flags to first-party defaults', () => {
    expect(getCheckoutProvider({})).toBe('first_party');
    expect(getCartRuntime({})).toBe('first_party');
    expect(getCheckoutUiMode({})).toBe('custom');
    expect(isFirstPartyCheckoutEnabled({ CHECKOUT_PROVIDER: 'first_party' })).toBe(true);
    expect(isFirstPartyCartEnabled({ CART_RUNTIME: 'FIRST_PARTY' })).toBe(true);
    expect(isFirstPartyCheckoutEnabled({ CHECKOUT_PROVIDER: 'weird' })).toBe(true);
  });

  it('exposes variable-first Worker branding and pricing helpers', () => {
    const env = {
      SITE_BASE: 'https://fork.example',
      WORKER_BASE: 'https://pledge.fork.example',
      PLATFORM_NAME: 'Fork Pool',
      PLATFORM_COMPANY_NAME: 'Fork Studio',
      SUPPORT_EMAIL: 'hello@fork.example',
      PLEDGES_EMAIL_FROM: 'Fork Pool <pledges@fork.example>',
      UPDATES_EMAIL_FROM: 'Fork Pool <updates@fork.example>',
      DEFAULT_PLATFORM_TIP_PERCENT: '7',
      MAX_PLATFORM_TIP_PERCENT: '18'
    };

    expect(getSiteBase(env)).toBe('https://fork.example/');
    expect(getWorkerBase(env)).toBe('https://pledge.fork.example/');
    expect(getPlatformName(env)).toBe('Fork Pool');
    expect(getPlatformCompanyName(env)).toBe('Fork Studio');
    expect(getSupportEmail(env)).toBe('hello@fork.example');
    expect(getPledgesEmailFrom(env)).toBe('Fork Pool <pledges@fork.example>');
    expect(getUpdatesEmailFrom(env)).toBe('Fork Pool <updates@fork.example>');
    expect(getDefaultPlatformTipPercent(env)).toBe(7);
    expect(getMaxPlatformTipPercent(env)).toBe(18);
  });

  it('consumes checkout nonces only once', async () => {
    const storage = new FakeStorage();
    const coordinator = new CheckoutIntentNonceCoordinator({ storage }, {});
    const exp = Math.floor(Date.now() / 1000) + 600;

    const prepareResponse = await coordinator.fetch(new Request('https://do.test/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: 'nonce-1', cartHash: 'hash-1', exp })
    }));
    expect(prepareResponse.status).toBe(200);

    const consumeResponse = await coordinator.fetch(new Request('https://do.test/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: 'nonce-1', cartHash: 'hash-1', exp })
    }));
    expect(consumeResponse.status).toBe(200);

    const replayResponse = await coordinator.fetch(new Request('https://do.test/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: 'nonce-1', cartHash: 'hash-1', exp })
    }));
    expect(replayResponse.status).toBe(409);
    await expect(replayResponse.json()).resolves.toMatchObject({
      ok: false,
      error: 'Nonce already consumed'
    });
  });

  it('allows atomic direct consume without a separate prepare step', async () => {
    const storage = new FakeStorage();
    const coordinator = new CheckoutIntentNonceCoordinator({ storage }, {});
    const exp = Math.floor(Date.now() / 1000) + 600;

    const consumeResponse = await coordinator.fetch(new Request('https://do.test/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: 'nonce-direct', cartHash: 'hash-direct', exp })
    }));

    expect(consumeResponse.status).toBe(200);
    await expect(consumeResponse.json()).resolves.toMatchObject({
      ok: true,
      status: 'consumed_implicit'
    });
  });

  it('builds payloads with the expected scope and expiry', () => {
    const payload = buildCheckoutIntentPayload({
      nonce: 'nonce-123',
      cartHash: 'hash-123',
      campaignSlug: 'hand-relations'
    });

    expect(payload).toMatchObject({
      scope: 'checkout_start',
      version: 1,
      nonce: 'nonce-123',
      cartHash: 'hash-123',
      campaignSlug: 'hand-relations',
      exp: 1775044800 + DEFAULT_CHECKOUT_INTENT_TTL_SECONDS
    });
  });
});
