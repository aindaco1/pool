export class TierInventoryCoordinator {
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

    if (url.pathname === '/apply-selection') {
      return this.handleApplySelection(payload.value);
    }

    if (url.pathname === '/claim-selection') {
      return this.handleClaimSelection(payload.value);
    }

    if (url.pathname === '/replace') {
      return this.handleReplace(payload.value);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }

  async handleClaim(payload) {
    const result = await this.ctx.storage.transaction(async (storage) => {
      const inventory = await getWorkingInventory(storage, payload.inventory);
      const tier = inventory[payload.tierId];

      if (!tier) {
        return { success: true };
      }

      const remaining = Number(tier.limit || 0) - Number(tier.claimed || 0);
      if (payload.qty > remaining) {
        return {
          success: false,
          error: `Only ${Math.max(0, remaining)} remaining for this tier`,
          remaining: Math.max(0, remaining)
        };
      }

      tier.claimed = Number(tier.claimed || 0) + payload.qty;
      await storage.put('inventory', inventory);

      return {
        success: true,
        remaining: Math.max(0, Number(tier.limit || 0) - Number(tier.claimed || 0)),
        inventory
      };
    });

    await syncInventoryToKv(this.env, payload.campaignSlug, result.inventory);
    return jsonResponse(result);
  }

  async handleRelease(payload) {
    const result = await this.ctx.storage.transaction(async (storage) => {
      const inventory = await getWorkingInventory(storage, payload.inventory);
      const tier = inventory[payload.tierId];

      if (!tier) {
        return { success: true, inventory };
      }

      tier.claimed = Math.max(0, Number(tier.claimed || 0) - payload.qty);
      await storage.put('inventory', inventory);
      return { success: true, inventory };
    });

    await syncInventoryToKv(this.env, payload.campaignSlug, result.inventory);
    return jsonResponse(result);
  }

  async handleClaimSelection(payload) {
    return this.handleApplySelection({
      campaignSlug: payload.campaignSlug,
      inventory: payload.inventory,
      previousCounts: {},
      nextCounts: payload.nextCounts
    });
  }

  async handleApplySelection(payload) {
    const result = await this.ctx.storage.transaction(async (storage) => {
      const inventory = await getWorkingInventory(storage, payload.inventory);
      const previousCounts = payload.previousCounts || {};
      const nextCounts = payload.nextCounts || {};
      const tierIds = new Set([...Object.keys(previousCounts), ...Object.keys(nextCounts)]);

      for (const tierId of tierIds) {
        const delta = Number(nextCounts[tierId] || 0) - Number(previousCounts[tierId] || 0);
        if (delta <= 0) continue;

        const tier = inventory[tierId];
        if (!tier) continue;

        const remaining = Number(tier.limit || 0) - Number(tier.claimed || 0);
        if (delta > remaining) {
          return {
            success: false,
            error: `Only ${Math.max(0, remaining)} remaining for this tier`,
            remaining: Math.max(0, remaining)
          };
        }
      }

      for (const tierId of tierIds) {
        const delta = Number(nextCounts[tierId] || 0) - Number(previousCounts[tierId] || 0);
        if (delta === 0) continue;

        const tier = inventory[tierId];
        if (!tier) continue;

        if (delta > 0) {
          tier.claimed = Number(tier.claimed || 0) + delta;
        } else {
          tier.claimed = Math.max(0, Number(tier.claimed || 0) + delta);
        }
      }

      await storage.put('inventory', inventory);
      return { success: true, inventory };
    });

    await syncInventoryToKv(this.env, payload.campaignSlug, result.inventory);
    return jsonResponse(result);
  }

  async handleReplace(payload) {
    const inventory = cloneInventory(payload.inventory || {});
    await this.ctx.storage.put('inventory', inventory);
    await syncInventoryToKv(this.env, payload.campaignSlug, inventory);
    return jsonResponse({ success: true, inventory });
  }
}

function validatePayload(body) {
  const campaignSlug = String(body?.campaignSlug || '');
  const tierId = body?.tierId == null ? null : String(body.tierId || '');
  const qty = body?.qty == null ? null : Number(body.qty);
  const inventory = body?.inventory && typeof body.inventory === 'object' ? body.inventory : {};
  const previousCounts = body?.previousCounts && typeof body.previousCounts === 'object' ? body.previousCounts : {};
  const nextCounts = body?.nextCounts && typeof body.nextCounts === 'object' ? body.nextCounts : {};

  if (!campaignSlug || campaignSlug.length > 200) {
    return { ok: false, error: 'Invalid campaign slug' };
  }

  if (tierId !== null && (!tierId || tierId.length > 200)) {
    return { ok: false, error: 'Invalid tier ID' };
  }

  if (qty !== null && (!Number.isFinite(qty) || qty <= 0)) {
    return { ok: false, error: 'Invalid quantity' };
  }

  return {
    ok: true,
    value: {
      campaignSlug,
      tierId,
      qty: qty == null ? null : Math.floor(qty),
      inventory: cloneInventory(inventory),
      previousCounts: normalizeCountMap(previousCounts),
      nextCounts: normalizeCountMap(nextCounts)
    }
  };
}

function normalizeCountMap(map) {
  const normalized = {};
  for (const [key, value] of Object.entries(map || {})) {
    const qty = Number(value || 0);
    if (!key || !Number.isFinite(qty) || qty < 0) continue;
    normalized[key] = Math.floor(qty);
  }
  return normalized;
}

async function getWorkingInventory(storage, bootstrapInventory) {
  const stored = await storage.get('inventory');
  if (stored && typeof stored === 'object') {
    return cloneInventory(stored);
  }

  const inventory = cloneInventory(bootstrapInventory || {});
  if (Object.keys(inventory).length > 0) {
    await storage.put('inventory', inventory);
  }
  return inventory;
}

async function syncInventoryToKv(env, campaignSlug, inventory) {
  if (!env?.PLEDGES || !inventory) return;
  await env.PLEDGES.put(`tier-inventory:${campaignSlug}`, JSON.stringify(inventory));
}

function cloneInventory(inventory) {
  return JSON.parse(JSON.stringify(inventory || {}));
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
