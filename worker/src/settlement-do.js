const DEFAULT_SETTLEMENT_LOCK_TTL_MS = 15 * 60 * 1000;
const MAX_OWNER_LENGTH = 128;
const MAX_REASON_LENGTH = 80;
const LOCK_KEY = 'settlement-lock';

export class SettlementCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const payload = validatePayload(body);
    if (!payload.ok) {
      return jsonResponse({ error: payload.error }, 400);
    }

    if (url.pathname === '/claim') {
      return this.handleClaim(payload.value);
    }

    if (url.pathname === '/release') {
      return this.handleRelease(payload.value);
    }

    if (url.pathname === '/status') {
      return this.handleStatus(payload.value);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }

  async handleClaim(payload) {
    const result = await this.ctx.storage.transaction(async (storage) => {
      const now = Date.now();
      const existing = await storage.get(LOCK_KEY);

      if (existing && existing.expiresAt > now && existing.owner !== payload.owner) {
        return {
          ok: false,
          locked: true,
          owner: existing.owner,
          reason: existing.reason || '',
          acquiredAt: existing.acquiredAt,
          expiresAt: existing.expiresAt
        };
      }

      const lock = {
        campaignSlug: payload.campaignSlug,
        owner: payload.owner,
        reason: payload.reason,
        acquiredAt: existing?.owner === payload.owner ? existing.acquiredAt : now,
        refreshedAt: now,
        expiresAt: now + payload.ttlMs
      };

      await storage.put(LOCK_KEY, lock);

      return {
        ok: true,
        locked: false,
        owner: lock.owner,
        reason: lock.reason,
        acquiredAt: lock.acquiredAt,
        expiresAt: lock.expiresAt
      };
    });

    return jsonResponse(result, result.ok ? 200 : 409);
  }

  async handleRelease(payload) {
    const result = await this.ctx.storage.transaction(async (storage) => {
      const existing = await storage.get(LOCK_KEY);
      if (!existing || existing.expiresAt <= Date.now()) {
        await storage.delete(LOCK_KEY);
        return { ok: true, released: false };
      }

      if (existing.owner !== payload.owner) {
        return {
          ok: false,
          error: 'Settlement lock owned by another run',
          owner: existing.owner,
          expiresAt: existing.expiresAt
        };
      }

      await storage.delete(LOCK_KEY);
      return { ok: true, released: true };
    });

    return jsonResponse(result, result.ok ? 200 : 409);
  }

  async handleStatus(_payload) {
    const existing = await this.ctx.storage.get(LOCK_KEY);
    if (!existing || existing.expiresAt <= Date.now()) {
      if (existing) await this.ctx.storage.delete(LOCK_KEY);
      return jsonResponse({ ok: true, locked: false });
    }

    return jsonResponse({
      ok: true,
      locked: true,
      owner: existing.owner,
      reason: existing.reason || '',
      acquiredAt: existing.acquiredAt,
      expiresAt: existing.expiresAt
    });
  }
}

function validatePayload(body) {
  const campaignSlug = String(body?.campaignSlug || '').trim();
  const owner = String(body?.owner || '').trim();
  const reason = String(body?.reason || '').trim().slice(0, MAX_REASON_LENGTH);
  const ttlMs = Number(body?.ttlMs || DEFAULT_SETTLEMENT_LOCK_TTL_MS);

  if (!campaignSlug || !/^[a-z0-9-]+$/.test(campaignSlug)) {
    return { ok: false, error: 'Invalid campaign slug' };
  }

  if (!owner || owner.length > MAX_OWNER_LENGTH) {
    return { ok: false, error: 'Invalid lock owner' };
  }

  if (!Number.isFinite(ttlMs) || ttlMs < 30_000 || ttlMs > DEFAULT_SETTLEMENT_LOCK_TTL_MS) {
    return { ok: false, error: 'Invalid lock TTL' };
  }

  return {
    ok: true,
    value: {
      campaignSlug,
      owner,
      reason,
      ttlMs: Math.floor(ttlMs)
    }
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
