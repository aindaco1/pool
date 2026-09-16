export class CheckoutIntentNonceCoordinator {
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

    if (url.pathname.startsWith('/completion-')) {
      await this.ctx.storage.setAlarm?.(Date.now() + 86400000);
      return this.handleCompletion(url.pathname, payload.value, String(body.leaseId || ''));
    }

    if (url.pathname === '/prepare') {
      return this.handlePrepare(payload.value);
    }

    if (url.pathname === '/consume') {
      return this.handleConsume(payload.value);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }

  async alarm() {
    // Completion objects are per order; nonce-coordinator objects never schedule this alarm.
    await this.ctx.storage.deleteAll();
  }

  async handleCompletion(path, payload, leaseId) {
    if (!leaseId || leaseId.length > 100) return jsonResponse({ error: 'Invalid lease' }, 400);
    const key = `completion:${payload.nonce}`;
    return this.ctx.storage.transaction(async (storage) => {
      const existing = await storage.get(key);
      const active = existing?.exp > Math.floor(Date.now() / 1000) ? existing : null;
      if (active && active.cartHash !== payload.cartHash) {
        return jsonResponse({ error: 'Checkout integrity verification failed' }, 409);
      }
      if (path === '/completion-claim') {
        if (active?.status === 'complete') return jsonResponse({ ok: true, status: 'complete' });
        if (active?.leaseUntil > Date.now()) return jsonResponse({ ok: false, status: 'busy' }, 409);
        await storage.put(key, { ...payload, leaseId, leaseUntil: Date.now() + 120000, status: 'processing' });
        return jsonResponse({ ok: true, status: 'claimed' });
      }
      if (!active || active.leaseId !== leaseId) return jsonResponse({ error: 'Checkout lease mismatch' }, 409);
      if (path === '/completion-finish') {
        await storage.put(key, { ...active, status: 'complete', leaseUntil: 0 });
        return jsonResponse({ ok: true });
      }
      if (path === '/completion-release') {
        if (active.status !== 'complete') await storage.delete(key);
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ error: 'Not found' }, 404);
    });
  }

  async handlePrepare(payload) {
    const key = getNonceKey(payload.nonce);

    return this.ctx.storage.transaction(async (storage) => {
      await deleteExpiredNonce(storage, key, payload.exp);
      const existing = await storage.get(key);

      if (existing) {
        if (existing.consumedAt) {
          return jsonResponse({ ok: false, error: 'Nonce already consumed' }, 409);
        }
        if (existing.cartHash !== payload.cartHash || existing.exp !== payload.exp) {
          return jsonResponse({ ok: false, error: 'Nonce already registered with different payload' }, 409);
        }
        return jsonResponse({ ok: true, status: 'existing' });
      }

      await storage.put(key, {
        nonce: payload.nonce,
        exp: payload.exp,
        cartHash: payload.cartHash,
        createdAt: Date.now(),
        consumedAt: null
      });

      return jsonResponse({ ok: true, status: 'prepared' });
    });
  }

  async handleConsume(payload) {
    const key = getNonceKey(payload.nonce);

    return this.ctx.storage.transaction(async (storage) => {
      await deleteExpiredNonce(storage, key, payload.exp);
      const existing = await storage.get(key);

      if (existing && existing.consumedAt) {
        return jsonResponse({ ok: false, error: 'Nonce already consumed' }, 409);
      }

      if (existing && (existing.cartHash !== payload.cartHash || existing.exp !== payload.exp)) {
        return jsonResponse({ ok: false, error: 'Nonce payload mismatch' }, 409);
      }

      const now = Date.now();
      await storage.put(key, {
        nonce: payload.nonce,
        exp: payload.exp,
        cartHash: payload.cartHash,
        createdAt: existing?.createdAt || now,
        consumedAt: now
      });

      return jsonResponse({ ok: true, status: existing ? 'consumed' : 'consumed_implicit' });
    });
  }
}

function validatePayload(body) {
  const nonce = String(body?.nonce || '');
  const cartHash = String(body?.cartHash || '');
  const exp = Number(body?.exp || 0);

  if (!nonce || nonce.length > 256) {
    return { ok: false, error: 'Invalid nonce' };
  }

  if (!cartHash || cartHash.length > 256) {
    return { ok: false, error: 'Invalid cart hash' };
  }

  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, error: 'Invalid or expired timestamp' };
  }

  return {
    ok: true,
    value: {
      nonce,
      cartHash,
      exp: Math.floor(exp)
    }
  };
}

async function deleteExpiredNonce(storage, key, exp) {
  const existing = await storage.get(key);
  if (existing?.exp && existing.exp < Math.floor(Date.now() / 1000)) {
    await storage.delete(key);
  }
}

function getNonceKey(nonce) {
  return `nonce:${nonce}`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
