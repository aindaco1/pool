#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const WORKER_DIR = path.join(ROOT_DIR, 'worker');

const CAMPAIGN_SLUG = 'hand-relations';
const WORKER_URL = process.env.WORKER_URL || 'http://127.0.0.1:8787';
const DEFAULT_TAX_RATE = 0.0825;

const TIER_DEFINITIONS = {
  'frame-slot': { name: 'Buy 1 Frame', priceCents: 500 },
  'sfx-slot': { name: 'Submit a Sound Effect', priceCents: 1000 },
  'direct-action': { name: 'Direct the Protagonist', priceCents: 10000 },
  'creature-cameo': { name: 'Creature Cameo', priceCents: 25000 }
};

const PLATFORM_ADD_ONS = {
  sticker: {
    productId: 'dust-wave-sticker',
    name: 'DUST WAVE Sticker',
    unitPrice: 300,
    scope: 'platform',
    category: 'physical'
  },
  tshirt: {
    productId: 'dust-wave-tshirt',
    name: 'DUST WAVE T-Shirt',
    unitPrice: 2500,
    scope: 'platform',
    category: 'physical'
  }
};

function dollarsToCents(value = 0) {
  return Math.round((Number(value || 0) || 0) * 100);
}

function runCommand(command, args, { cwd = ROOT_DIR, input = undefined } = {}) {
  return execFileSync(command, args, {
    cwd,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
}

function resolveWranglerCommand() {
  const configured = String(process.env.WRANGLER_BIN || '').trim();
  if (configured) {
    return configured.split(/\s+/);
  }
  return ['npx', 'wrangler'];
}

function runWrangler(args, { input = undefined } = {}) {
  const command = resolveWranglerCommand();
  return runCommand(command[0], [...command.slice(1), ...args], {
    cwd: WORKER_DIR,
    input
  });
}

function runWranglerJson(args) {
  const output = runWrangler(args);
  return output ? JSON.parse(output) : null;
}

function readAdminSecret() {
  const envSecret = String(process.env.ADMIN_SECRET || '').trim();
  if (envSecret) {
    return envSecret;
  }

  const devVarsPath = path.join(WORKER_DIR, '.dev.vars');
  if (!fs.existsSync(devVarsPath)) {
    return '';
  }

  const match = fs.readFileSync(devVarsPath, 'utf8').match(/^ADMIN_SECRET=(.+)$/m);
  return match ? match[1].trim() : '';
}

function hashId(value) {
  return createHash('md5').update(String(value)).digest('hex').slice(0, 10);
}

function buildPlatformAddOn(type, quantity, variantLabel = '') {
  const base = PLATFORM_ADD_ONS[type];
  if (!base) {
    throw new Error(`Unknown platform add-on type: ${type}`);
  }

  return {
    ...base,
    quantity,
    ...(variantLabel ? { variantLabel } : {})
  };
}

function buildShippingAddress(name, address1, city, province, postalCode) {
  return {
    name,
    address1,
    city,
    province,
    postalCode,
    country: 'US'
  };
}

function getTierName(tierId) {
  return TIER_DEFINITIONS[tierId]?.name || tierId;
}

function buildAdditionalTiers(additionalTiers = []) {
  return (additionalTiers || []).map((tier) => ({
    id: tier.id,
    name: tier.name || getTierName(tier.id),
    qty: Number(tier.qty || 1) || 1
  }));
}

function buildSupportItems(supportItems = []) {
  return (supportItems || []).map((item) => ({
    id: item.id,
    amount: Number(item.amount || 0) || 0
  }));
}

function computeSnapshot(spec) {
  const tierQty = Number(spec.tierQty || 1) || 1;
  const tierPriceCents = TIER_DEFINITIONS[spec.tierId]?.priceCents || 0;
  const additionalTiers = buildAdditionalTiers(spec.additionalTiers);
  const supportItems = buildSupportItems(spec.supportItems);
  const bundleAddOns = (spec.bundleAddOns || []).map((addOn) => ({ ...addOn }));
  const customAmount = Number(spec.customAmount || 0) || 0;

  const primaryTierSubtotal = tierPriceCents * tierQty;
  const additionalTierSubtotal = additionalTiers.reduce((sum, tier) => {
    const unitPrice = TIER_DEFINITIONS[tier.id]?.priceCents || 0;
    return sum + (unitPrice * (Number(tier.qty || 1) || 1));
  }, 0);
  const supportItemSubtotal = supportItems.reduce((sum, item) => sum + dollarsToCents(item.amount), 0);
  const customAmountSubtotal = dollarsToCents(customAmount);
  const campaignAddOnSubtotal = bundleAddOns.reduce((sum, addOn) => {
    const quantity = Number(addOn.quantity || 0) || 0;
    const unitPrice = Number(addOn.unitPrice || 0) || 0;
    if (String(addOn.scope || '').trim().toLowerCase() === 'campaign') {
      return sum + (quantity * unitPrice);
    }
    return sum;
  }, 0);
  const platformAddOnSubtotal = bundleAddOns.reduce((sum, addOn) => {
    const quantity = Number(addOn.quantity || 0) || 0;
    const unitPrice = Number(addOn.unitPrice || 0) || 0;
    if (String(addOn.scope || '').trim().toLowerCase() !== 'campaign') {
      return sum + (quantity * unitPrice);
    }
    return sum;
  }, 0);

  const goalTrackingSubtotal = primaryTierSubtotal
    + additionalTierSubtotal
    + supportItemSubtotal
    + customAmountSubtotal
    + campaignAddOnSubtotal;
  const subtotal = goalTrackingSubtotal + platformAddOnSubtotal;
  const tipPercent = Number(spec.tipPercent || 0) || 0;
  const tipAmount = spec.tipAmount != null
    ? Number(spec.tipAmount || 0) || 0
    : Math.round(subtotal * (tipPercent / 100));
  const tax = spec.tax != null
    ? Number(spec.tax || 0) || 0
    : Math.round((subtotal + tipAmount) * DEFAULT_TAX_RATE);
  const shipping = Number(spec.shipping || 0) || 0;
  const amount = subtotal + tipAmount + tax + shipping;

  return {
    tierId: spec.tierId,
    tierName: getTierName(spec.tierId),
    tierQty,
    additionalTiers,
    supportItems,
    customAmount,
    bundleAddOns,
    goalTrackingSubtotal,
    subtotal,
    tipPercent,
    tipAmount,
    tax,
    shipping,
    amount
  };
}

function buildCreatedHistory(snapshot, at) {
  return {
    type: 'created',
    tierId: snapshot.tierId,
    tierName: snapshot.tierName,
    tierQty: snapshot.tierQty,
    additionalTiers: snapshot.additionalTiers,
    supportItems: snapshot.supportItems,
    customAmount: snapshot.customAmount,
    bundleAddOns: snapshot.bundleAddOns,
    goalTrackingSubtotal: snapshot.goalTrackingSubtotal,
    subtotal: snapshot.subtotal,
    tipPercent: snapshot.tipPercent,
    tipAmount: snapshot.tipAmount,
    tax: snapshot.tax,
    shipping: snapshot.shipping,
    amount: snapshot.amount,
    at
  };
}

function buildBasePledge(orderId, email, snapshot, extra = {}) {
  const base = {
    orderId,
    email,
    campaignSlug: CAMPAIGN_SLUG,
    tierId: snapshot.tierId,
    tierName: snapshot.tierName,
    tierQty: snapshot.tierQty,
    additionalTiers: snapshot.additionalTiers,
    supportItems: snapshot.supportItems,
    customAmount: snapshot.customAmount,
    bundleAddOns: snapshot.bundleAddOns,
    goalTrackingSubtotal: snapshot.goalTrackingSubtotal,
    subtotal: snapshot.subtotal,
    tipPercent: snapshot.tipPercent,
    tipAmount: snapshot.tipAmount,
    tax: snapshot.tax,
    shipping: snapshot.shipping,
    amount: snapshot.amount,
    stripeCustomerId: `cus_seed_${hashId(orderId)}`,
    stripePaymentMethodId: `pm_seed_${hashId(`${orderId}:pm`)}`,
    stripeSetupIntentId: `seti_seed_${hashId(`${orderId}:si`)}`,
    pledgeStatus: 'active',
    charged: false
  };

  return {
    ...base,
    ...extra
  };
}

function buildActivePledge(spec) {
  const snapshot = computeSnapshot(spec);
  return buildBasePledge(spec.orderId, spec.email, snapshot, {
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt || spec.createdAt,
    preferredLang: spec.preferredLang,
    shippingAddress: spec.shippingAddress || undefined,
    pledgeStatus: spec.pledgeStatus || 'active',
    history: [buildCreatedHistory(snapshot, spec.createdAt)]
  });
}

function buildCancelledPledge(spec) {
  const snapshot = computeSnapshot(spec);
  return buildBasePledge(spec.orderId, spec.email, snapshot, {
    createdAt: spec.createdAt,
    updatedAt: spec.cancelledAt,
    cancelledAt: spec.cancelledAt,
    shippingAddress: spec.shippingAddress || undefined,
    pledgeStatus: 'cancelled',
    history: [
      buildCreatedHistory(snapshot, spec.createdAt),
      {
        type: 'cancelled',
        subtotalDelta: -snapshot.subtotal,
        tipPercent: snapshot.tipPercent,
        tipAmountDelta: -snapshot.tipAmount,
        taxDelta: -snapshot.tax,
        shippingDelta: -snapshot.shipping,
        amountDelta: -snapshot.amount,
        at: spec.cancelledAt
      }
    ]
  });
}

function buildModifiedPledge(spec) {
  const before = computeSnapshot(spec.before);
  const after = computeSnapshot(spec.after);
  return buildBasePledge(spec.orderId, spec.email, after, {
    createdAt: spec.createdAt,
    updatedAt: spec.modifiedAt,
    modifiedAt: spec.modifiedAt,
    preferredLang: spec.after.preferredLang,
    shippingAddress: spec.after.shippingAddress || undefined,
    pledgeStatus: spec.pledgeStatus || 'active',
    history: [
      buildCreatedHistory(before, spec.createdAt),
      {
        type: 'modified',
        tierId: after.tierId,
        tierName: after.tierName,
        tierQty: after.tierQty,
        additionalTiers: after.additionalTiers,
        supportItems: after.supportItems,
        customAmount: after.customAmount,
        bundleAddOns: after.bundleAddOns,
        goalTrackingSubtotal: after.goalTrackingSubtotal,
        subtotalDelta: after.subtotal - before.subtotal,
        tipPercent: after.tipPercent,
        tipAmount: after.tipAmount,
        tipAmountDelta: after.tipAmount - before.tipAmount,
        taxDelta: after.tax - before.tax,
        shippingDelta: after.shipping - before.shipping,
        amountDelta: after.amount - before.amount,
        at: spec.modifiedAt
      }
    ]
  });
}

function buildFixturePledges() {
  return [
    buildActivePledge({
      orderId: 'hr-seed-001',
      email: 'alyssa@example.com',
      tierId: 'frame-slot',
      tierQty: 12,
      supportItems: [{ id: 'location-scouting', amount: 35 }],
      tipPercent: 5,
      createdAt: '2025-12-03T17:15:00.000Z'
    }),
    buildActivePledge({
      orderId: 'hr-seed-002',
      email: 'marco@example.com',
      tierId: 'direct-action',
      tierQty: 1,
      additionalTiers: [{ id: 'frame-slot', qty: 20 }],
      supportItems: [{ id: 'casting', amount: 20 }],
      customAmount: 18,
      tipPercent: 12,
      createdAt: '2025-12-11T19:40:00.000Z'
    }),
    buildActivePledge({
      orderId: 'hr-seed-003',
      email: 'devon@example.com',
      tierId: 'direct-action',
      tierQty: 1,
      bundleAddOns: [
        buildPlatformAddOn('sticker', 3),
        buildPlatformAddOn('tshirt', 1, 'L')
      ],
      shipping: 975,
      tipPercent: 8,
      shippingAddress: buildShippingAddress('Devon Lee', '801 Blake St', 'Denver', 'CO', '80202'),
      createdAt: '2025-12-22T22:10:00.000Z'
    }),
    buildActivePledge({
      orderId: 'hr-seed-004',
      email: 'devon@example.com',
      tierId: 'frame-slot',
      tierQty: 40,
      supportItems: [
        { id: 'location-scouting', amount: 25 },
        { id: 'casting', amount: 15 }
      ],
      tipPercent: 0,
      createdAt: '2026-01-05T15:30:00.000Z'
    }),
    buildActivePledge({
      orderId: 'hr-seed-005',
      email: 'sol@example.com',
      tierId: 'creature-cameo',
      tierQty: 1,
      customAmount: 50,
      tipPercent: 0,
      pledgeStatus: 'payment_failed',
      createdAt: '2026-01-10T18:05:00.000Z'
    }),
    buildCancelledPledge({
      orderId: 'hr-seed-006',
      email: 'irene@example.com',
      tierId: 'sfx-slot',
      tierQty: 4,
      bundleAddOns: [buildPlatformAddOn('sticker', 2)],
      shipping: 450,
      tipPercent: 5,
      shippingAddress: buildShippingAddress('Irene Wu', '1420 Pearl St', 'Boulder', 'CO', '80302'),
      createdAt: '2026-01-12T13:00:00.000Z',
      cancelledAt: '2026-01-14T16:25:00.000Z'
    }),
    buildModifiedPledge({
      orderId: 'hr-seed-007',
      email: 'pablo@example.com',
      createdAt: '2025-12-07T20:10:00.000Z',
      modifiedAt: '2025-12-18T18:45:00.000Z',
      before: {
        tierId: 'frame-slot',
        tierQty: 10,
        customAmount: 10,
        tipPercent: 5
      },
      after: {
        tierId: 'direct-action',
        tierQty: 1,
        additionalTiers: [{ id: 'sfx-slot', qty: 1 }],
        customAmount: 25,
        tipPercent: 10
      }
    }),
    buildModifiedPledge({
      orderId: 'hr-seed-008',
      email: 'noor@example.com',
      createdAt: '2025-12-28T11:20:00.000Z',
      modifiedAt: '2026-01-09T09:55:00.000Z',
      before: {
        tierId: 'frame-slot',
        tierQty: 5,
        tipPercent: 0
      },
      after: {
        tierId: 'frame-slot',
        tierQty: 5,
        bundleAddOns: [
          buildPlatformAddOn('tshirt', 1, 'M'),
          buildPlatformAddOn('sticker', 2)
        ],
        shipping: 1295,
        tipPercent: 10,
        shippingAddress: buildShippingAddress('Noor Patel', '98 Broadway', 'Denver', 'CO', '80203')
      }
    }),
    buildActivePledge({
      orderId: 'hr-seed-009',
      email: 'lucia@example.com',
      tierId: 'sfx-slot',
      tierQty: 2,
      supportItems: [{ id: 'casting', amount: 50 }],
      tipPercent: 15,
      preferredLang: 'es',
      createdAt: '2026-01-20T20:00:00.000Z'
    })
  ];
}

function writeTempJson(value) {
  const filePath = path.join(
    os.tmpdir(),
    `pool-hand-relations-seed-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  return filePath;
}

function putKvJson(key, value) {
  const tempPath = writeTempJson(value);
  try {
    runWrangler([
      'kv', 'key', 'put', key,
      '--binding', 'PLEDGES',
      '--local',
      '--preview',
      '--path', tempPath
    ]);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function deleteKvKey(key) {
  try {
    runWrangler([
      'kv', 'key', 'delete', key,
      '--binding', 'PLEDGES',
      '--local',
      '--preview'
    ], { input: 'y\n' });
  } catch (_) {
    // Ignore deletes for missing keys.
  }
}

function listKvKeys(prefix) {
  return runWranglerJson([
    'kv', 'key', 'list',
    '--binding', 'PLEDGES',
    '--local',
    '--preview',
    '--prefix', prefix
  ]) || [];
}

function collectExistingLocalOrderIds() {
  const raw = runCommand('python3', ['./scripts/fetch-pledges-json.py', CAMPAIGN_SLUG, '--local'], {
    cwd: ROOT_DIR
  });
  const parsed = JSON.parse(raw || '{}');
  const orderIds = new Set();
  for (const pledge of parsed.pledges || []) {
    const orderId = String(pledge?.orderId || '').trim();
    if (orderId) {
      orderIds.add(orderId);
    }
  }
  return Array.from(orderIds);
}

async function rebuildProjections() {
  const adminSecret = readAdminSecret();
  if (!adminSecret) {
    throw new Error('ADMIN_SECRET is required to rebuild stats and inventory after seeding.');
  }

  const commonHeaders = {
    Authorization: `Bearer ${adminSecret}`
  };
  const endpoints = [
    `${WORKER_URL}/stats/${CAMPAIGN_SLUG}/recalculate`,
    `${WORKER_URL}/inventory/${CAMPAIGN_SLUG}/recalculate`
  ];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: commonHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed POST ${endpoint}: ${response.status} ${await response.text()}`);
    }
  }
}

async function readStatsSummary() {
  const response = await fetch(`${WORKER_URL}/stats/${CAMPAIGN_SLUG}`);
  if (!response.ok) {
    throw new Error(`Failed to read stats summary: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function deleteExistingCampaignRunnerMarkers() {
  const markerKeys = listKvKeys('campaign-runner-report:')
    .map((entry) => String(entry?.name || '').trim())
    .filter(Boolean)
    .filter((name) => (
      name === `campaign-runner-report:fulfillment:${CAMPAIGN_SLUG}`
      || name.startsWith(`campaign-runner-report:pledge:${CAMPAIGN_SLUG}:`)
    ));

  for (const key of markerKeys) {
    deleteKvKey(key);
  }

  return markerKeys.length;
}

async function main() {
  const existingOrderIds = collectExistingLocalOrderIds();
  for (const orderId of existingOrderIds) {
    deleteKvKey(`pledge:${orderId}`);
  }

  deleteKvKey(`campaign-pledges:${CAMPAIGN_SLUG}`);
  deleteKvKey(`stats:${CAMPAIGN_SLUG}`);
  deleteKvKey(`tier-inventory:${CAMPAIGN_SLUG}`);
  const deletedMarkerCount = deleteExistingCampaignRunnerMarkers();

  const pledges = buildFixturePledges();
  for (const pledge of pledges) {
    putKvJson(`pledge:${pledge.orderId}`, pledge);
  }

  putKvJson(`campaign-pledges:${CAMPAIGN_SLUG}`, pledges
    .filter((pledge) => pledge.pledgeStatus !== 'cancelled')
    .map((pledge) => pledge.orderId)
    .sort());

  await rebuildProjections();
  const stats = await readStatsSummary();

  const paymentFailedCount = pledges.filter((pledge) => pledge.pledgeStatus === 'payment_failed').length;
  const cancelledCount = pledges.filter((pledge) => pledge.pledgeStatus === 'cancelled').length;
  const modifiedCount = pledges.filter((pledge) => Array.isArray(pledge.history) && pledge.history.some((entry) => entry.type === 'modified')).length;

  console.log(`Seeded ${pledges.length} local ${CAMPAIGN_SLUG} pledges.`);
  console.log(`Removed ${existingOrderIds.length} existing ${CAMPAIGN_SLUG} pledge keys.`);
  console.log(`Cleared ${deletedMarkerCount} campaign-runner report marker key(s).`);
  console.log(`Active pledge count: ${stats.pledgeCount}`);
  console.log(`Campaign pledged total: $${((Number(stats.pledgedAmount || 0) || 0) / 100).toFixed(2)}`);
  console.log(`Fixture mix: ${modifiedCount} modified, ${cancelledCount} cancelled, ${paymentFailedCount} payment_failed.`);
}

await main();
