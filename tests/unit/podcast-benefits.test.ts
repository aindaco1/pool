import { describe, expect, it, vi } from 'vitest';

import {
  buildPodcastBenefitEvent,
  generatePodcastBenefitCode,
  PodcastBenefitBridgeError,
  sendPodcastBenefitEvent
} from '../../worker/src/podcast-benefits.js';
import {
  hmacSha256
} from '../../shared/dust-wave-platform/packages/worker-core/src/crypto.js';

const CODE = 'DW-POD-ABCDEFGH-JKLMNPQR-STUVWXYZ-23456789';
const NOW = new Date('2026-07-24T12:00:00.000Z');

describe('Pool podcast benefit bridge primitive', () => {
  it('keeps the shared code contract characterized in Pool', () => {
    expect(generatePodcastBenefitCode((bytes) => {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = index;
      }
    })).toBe(CODE);
  });

  it('normalizes a grant without retaining optional empty fields', () => {
    expect(buildPodcastBenefitEvent({
      eventId: 'event_fixture_1',
      grantId: 'grant_fixture_1',
      action: 'grant',
      showSlug: 'Opera-En-La-Selva',
      email: ' Listener@Example.com ',
      code: CODE.toLowerCase()
    }, { now: NOW })).toEqual({
      eventId: 'event_fixture_1',
      grantId: 'grant_fixture_1',
      action: 'grant',
      showSlug: 'opera-en-la-selva',
      email: 'listener@example.com',
      code: CODE
    });
  });

  it('fails closed without making a request when disabled', async () => {
    const fetchImpl = vi.fn();
    await expect(sendPodcastBenefitEvent({
      PODCAST_BENEFITS_ENABLED: 'false'
    }, revokeFixture(), { fetchImpl, now: NOW })).rejects.toMatchObject({
      code: 'podcast_bridge_not_configured',
      retryable: false
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('signs the exact bounded JSON body for the Podcast endpoint', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const headers = new Headers(init.headers);
      expect(String(_url)).toBe(
        'https://feeds.dustwave.xyz/v1/internal/pool/grants'
      );
      expect(init.redirect).toBe('error');
      expect(headers.get('x-pool-podcast-timestamp')).toBe('1784894400');
      expect(headers.get('x-pool-podcast-signature')).toBe(
        await hmacSha256(
          `1784894400.${init.body}`,
          'p'.repeat(32),
          'hex'
        )
      );
      expect(JSON.parse(String(init.body))).toEqual(revokeFixture());
      return new Response(JSON.stringify({
        accepted: true,
        action: 'revoke',
        status: 'revoked',
        idempotent: false
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    await expect(sendPodcastBenefitEvent(
      configuredEnv(),
      revokeFixture(),
      { fetchImpl, now: NOW }
    )).resolves.toEqual({
      accepted: true,
      action: 'revoke',
      status: 'revoked',
      idempotent: false
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe live endpoints before fetch', async () => {
    const fetchImpl = vi.fn();
    await expect(sendPodcastBenefitEvent({
      ...configuredEnv(),
      PODCAST_BRIDGE_URL:
        'http://127.0.0.1/v1/internal/pool/grants',
      APP_MODE: 'live'
    }, revokeFixture(), { fetchImpl, now: NOW }))
      .rejects.toMatchObject({ code: 'podcast_bridge_not_configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('classifies a provider outage as retryable without echoing its body', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: `do-not-echo-${CODE}-listener@example.com`
    }), {
      status: 503,
      headers: { 'content-type': 'application/json' }
    }));
    let error;
    try {
      await sendPodcastBenefitEvent(
        configuredEnv(),
        revokeFixture(),
        { fetchImpl, now: NOW }
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PodcastBenefitBridgeError);
    expect(error).toMatchObject({
      code: 'podcast_bridge_rejected',
      status: 503,
      retryable: true
    });
    expect(JSON.stringify(error)).not.toContain(CODE);
    expect(JSON.stringify(error)).not.toContain('listener@example.com');
  });

  it('bounds an oversized provider response and preserves retry semantics', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      'x'.repeat(16_385),
      {
        status: 503,
        headers: { 'content-length': '16385' }
      }
    ));

    await expect(sendPodcastBenefitEvent(
      configuredEnv(),
      revokeFixture(),
      { fetchImpl, now: NOW }
    )).rejects.toMatchObject({
      code: 'podcast_bridge_response_invalid',
      status: 503,
      retryable: true
    });
  });
});

function configuredEnv() {
  return {
    APP_MODE: 'live',
    PODCAST_BENEFITS_ENABLED: 'true',
    PODCAST_BRIDGE_URL:
      'https://feeds.dustwave.xyz/v1/internal/pool/grants',
    PODCAST_BRIDGE_TIMEOUT_MS: '5000',
    POOL_PODCAST_BRIDGE_SECRET: 'p'.repeat(32)
  };
}

function revokeFixture() {
  return {
    eventId: 'event_fixture_1',
    grantId: 'grant_fixture_1',
    action: 'revoke'
  };
}
