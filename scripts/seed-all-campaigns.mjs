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
const WORKER_URL = process.env.WORKER_URL || 'http://127.0.0.1:8787';
const DEFAULT_TAX_RATE = 0.0825;
const ADMIN_REQUEST_IP_BASE = process.env.ADMIN_REQUEST_IP_BASE
  || `127.${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 200) + 20}`;

const TIER_DEFINITIONS = {
  'hand-relations': {
    'frame-slot': { name: 'Buy 1 Frame', priceCents: 500 },
    'sfx-slot': { name: 'Submit a Sound Effect', priceCents: 1000 },
    'direct-action': { name: 'Direct the Protagonist', priceCents: 10000 },
    'creature-cameo': { name: 'Creature Cameo', priceCents: 25000 }
  },
  sunder: {
    'screw-goodies': { name: 'screw goodies!', priceCents: 1000 },
    'some-goodies': { name: 'some goodies', priceCents: 2000 },
    'physical-media': { name: 'physical media', priceCents: 3500 },
    fan: { name: 'fan', priceCents: 5000 },
    'super-fan': { name: 'super-fan!', priceCents: 10000 },
    'ultra-fan': { name: 'ultra-fan!!!', priceCents: 25000 }
  },
  tecolote: {
    thanks: { name: 'Thanks!', priceCents: 100 },
    'special-thanks': { name: 'Special Thanks!', priceCents: 700 },
    'owl-sticker': { name: 'Owl Sticker', priceCents: 1000 },
    'vidal-sticker': { name: 'Vidal Hidalgo Sticker', priceCents: 1000 },
    tshirt: { name: 'TECOLOTE T-Shirt', priceCents: 2500 },
    poster: { name: 'TECOLOTE Poster', priceCents: 4000 },
    'exclusive-tshirt': { name: 'EXCLUSIVE T-Shirt', priceCents: 6000 },
    auteur: { name: 'Auteur Tier', priceCents: 12000 },
    'executive-producer': { name: 'EXECUTIVE PRODUCER Tier', priceCents: 100000 },
    'nata-baldguilar': { name: 'Nata Baldguilar Tier', priceCents: 200000 }
  },
  'worst-movie-ever': {
    frame: { name: 'One Frame', priceCents: 100 },
    'writer-credit': { name: 'Writer Credit', priceCents: 500 },
    'sound-effect': { name: 'Sound Effect', priceCents: 2000 },
    dialogue: { name: 'Line of Dialogue', priceCents: 5000 },
    prop: { name: 'Handheld Prop', priceCents: 10000 },
    costume: { name: 'Costume', priceCents: 15000 },
    character: { name: 'Add a Character', priceCents: 25000 },
    'jack-does': { name: 'Jack Does Whatever You Write', priceCents: 50000 },
    language: { name: 'Scene in Another Language', priceCents: 100000 },
    act: { name: 'Act in the Movie', priceCents: 500000 }
  },
  'smoke-editable': {
    'standard-pass': { name: 'Standard Pass', priceCents: 1000 },
    'limited-poster': { name: 'Limited Poster', priceCents: 2500 }
  }
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

const CAMPAIGN_ADD_ONS = {
  condomPack: {
    productId: 'smoke-editable__first-time-sexpot-condom-pack',
    name: 'First Time Sexpot Condom Pack',
    unitPrice: 600,
    scope: 'campaign',
    campaignSlug: 'smoke-editable',
    campaignTitle: 'SMOKE EDITABLE',
    category: 'physical',
    sourceUrl: 'https://shop.dustwave.xyz/?pid=condom-1'
  },
  poster: {
    productId: 'smoke-editable__first-time-sexpot-poster',
    name: 'First Time Sexpot Poster',
    unitPrice: 3500,
    scope: 'campaign',
    campaignSlug: 'smoke-editable',
    campaignTitle: 'SMOKE EDITABLE',
    category: 'physical',
    sourceUrl: 'https://shop.dustwave.xyz/?pid=poster-3'
  }
};

const CAMPAIGNS = ['hand-relations', 'sunder', 'tecolote', 'worst-movie-ever', 'smoke-editable'];

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

function getTierDefinition(campaignSlug, tierId) {
  return TIER_DEFINITIONS[campaignSlug]?.[tierId] || { name: tierId, priceCents: 0 };
}

function buildPlatformAddOn(type, quantity, variantId = '', variantLabel = '') {
  const base = PLATFORM_ADD_ONS[type];
  if (!base) {
    throw new Error(`Unknown platform add-on type: ${type}`);
  }
  return {
    ...base,
    quantity,
    ...(variantId ? { variantId } : {}),
    ...(variantLabel ? { variantLabel } : {})
  };
}

function buildCampaignAddOn(type, quantity) {
  const base = CAMPAIGN_ADD_ONS[type];
  if (!base) {
    throw new Error(`Unknown campaign add-on type: ${type}`);
  }
  return {
    ...base,
    quantity
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

function buildAdditionalTiers(campaignSlug, additionalTiers = []) {
  return (additionalTiers || []).map((tier) => ({
    id: tier.id,
    name: tier.name || getTierDefinition(campaignSlug, tier.id).name,
    qty: Number(tier.qty || 1) || 1
  }));
}

function buildSupportItems(supportItems = []) {
  return (supportItems || []).map((item) => ({
    id: item.id,
    amount: Number(item.amount || 0) || 0
  }));
}

function computeSnapshot(campaignSlug, spec) {
  const primaryTier = getTierDefinition(campaignSlug, spec.tierId);
  const tierQty = Number(spec.tierQty || 1) || 1;
  const additionalTiers = buildAdditionalTiers(campaignSlug, spec.additionalTiers);
  const supportItems = buildSupportItems(spec.supportItems);
  const bundleAddOns = (spec.bundleAddOns || []).map((addOn) => ({ ...addOn }));
  const customAmount = Number(spec.customAmount || 0) || 0;

  const primaryTierSubtotal = (primaryTier.priceCents || 0) * tierQty;
  const additionalTierSubtotal = additionalTiers.reduce((sum, tier) => {
    const definition = getTierDefinition(campaignSlug, tier.id);
    return sum + ((definition.priceCents || 0) * (Number(tier.qty || 1) || 1));
  }, 0);
  const supportItemSubtotal = supportItems.reduce((sum, item) => sum + dollarsToCents(item.amount), 0);
  const customAmountSubtotal = dollarsToCents(customAmount);
  const campaignAddOnSubtotal = bundleAddOns.reduce((sum, addOn) => (
    String(addOn.scope || '').trim().toLowerCase() === 'campaign'
      ? sum + ((Number(addOn.unitPrice || 0) || 0) * (Number(addOn.quantity || 0) || 0))
      : sum
  ), 0);
  const platformAddOnSubtotal = bundleAddOns.reduce((sum, addOn) => (
    String(addOn.scope || '').trim().toLowerCase() !== 'campaign'
      ? sum + ((Number(addOn.unitPrice || 0) || 0) * (Number(addOn.quantity || 0) || 0))
      : sum
  ), 0);

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
    tierName: primaryTier.name,
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

function buildBasePledge(campaignSlug, orderId, email, snapshot, extra = {}) {
  return {
    orderId,
    email,
    campaignSlug,
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
    charged: false,
    ...extra
  };
}

function buildActivePledge(campaignSlug, spec) {
  const snapshot = computeSnapshot(campaignSlug, spec);
  return buildBasePledge(campaignSlug, spec.orderId, spec.email, snapshot, {
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt || spec.createdAt,
    pledgeStatus: spec.pledgeStatus || 'active',
    preferredLang: spec.preferredLang,
    shippingAddress: spec.shippingAddress || undefined,
    history: [buildCreatedHistory(snapshot, spec.createdAt)]
  });
}

function buildCancelledPledge(campaignSlug, spec) {
  const snapshot = computeSnapshot(campaignSlug, spec);
  return buildBasePledge(campaignSlug, spec.orderId, spec.email, snapshot, {
    createdAt: spec.createdAt,
    updatedAt: spec.cancelledAt,
    cancelledAt: spec.cancelledAt,
    pledgeStatus: 'cancelled',
    shippingAddress: spec.shippingAddress || undefined,
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

function buildModifiedPledge(campaignSlug, spec) {
  const before = computeSnapshot(campaignSlug, spec.before);
  const after = computeSnapshot(campaignSlug, spec.after);
  return buildBasePledge(campaignSlug, spec.orderId, spec.email, after, {
    createdAt: spec.createdAt,
    updatedAt: spec.modifiedAt,
    modifiedAt: spec.modifiedAt,
    pledgeStatus: spec.pledgeStatus || 'active',
    preferredLang: spec.after.preferredLang,
    shippingAddress: spec.after.shippingAddress || undefined,
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

function buildFixtureCatalog() {
  return {
    'hand-relations': [
      buildActivePledge('hand-relations', {
        orderId: 'hr-seed-001',
        email: 'alyssa@example.com',
        tierId: 'frame-slot',
        tierQty: 12,
        supportItems: [{ id: 'location-scouting', amount: 35 }],
        tipPercent: 5,
        createdAt: '2025-12-03T17:15:00.000Z'
      }),
      buildActivePledge('hand-relations', {
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
      buildActivePledge('hand-relations', {
        orderId: 'hr-seed-003',
        email: 'devon@example.com',
        tierId: 'direct-action',
        tierQty: 1,
        bundleAddOns: [
          buildPlatformAddOn('sticker', 3),
          buildPlatformAddOn('tshirt', 1, 'l', 'L')
        ],
        shipping: 975,
        tipPercent: 8,
        shippingAddress: buildShippingAddress('Devon Lee', '801 Blake St', 'Denver', 'CO', '80202'),
        createdAt: '2025-12-22T22:10:00.000Z'
      }),
      buildActivePledge('hand-relations', {
        orderId: 'hr-seed-004',
        email: 'devon@example.com',
        tierId: 'frame-slot',
        tierQty: 40,
        supportItems: [
          { id: 'location-scouting', amount: 25 },
          { id: 'casting', amount: 15 }
        ],
        createdAt: '2026-01-05T15:30:00.000Z'
      }),
      buildActivePledge('hand-relations', {
        orderId: 'hr-seed-005',
        email: 'sol@example.com',
        tierId: 'creature-cameo',
        tierQty: 1,
        customAmount: 50,
        pledgeStatus: 'payment_failed',
        createdAt: '2026-01-10T18:05:00.000Z'
      }),
      buildCancelledPledge('hand-relations', {
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
      buildModifiedPledge('hand-relations', {
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
      buildModifiedPledge('hand-relations', {
        orderId: 'hr-seed-008',
        email: 'noor@example.com',
        createdAt: '2025-12-28T11:20:00.000Z',
        modifiedAt: '2026-01-09T09:55:00.000Z',
        before: {
          tierId: 'frame-slot',
          tierQty: 5
        },
        after: {
          tierId: 'frame-slot',
          tierQty: 5,
          bundleAddOns: [
            buildPlatformAddOn('tshirt', 1, 'm', 'M'),
            buildPlatformAddOn('sticker', 2)
          ],
          shipping: 1295,
          tipPercent: 10,
          shippingAddress: buildShippingAddress('Noor Patel', '98 Broadway', 'Denver', 'CO', '80203')
        }
      }),
      buildActivePledge('hand-relations', {
        orderId: 'hr-seed-009',
        email: 'lucia@example.com',
        tierId: 'sfx-slot',
        tierQty: 2,
        supportItems: [{ id: 'casting', amount: 50 }],
        tipPercent: 15,
        preferredLang: 'es',
        createdAt: '2026-01-20T20:00:00.000Z'
      })
    ],
    sunder: [
      buildActivePledge('sunder', {
        orderId: 'su-seed-001',
        email: 'mina@example.com',
        tierId: 'screw-goodies',
        tierQty: 1,
        customAmount: 5,
        tipPercent: 5,
        createdAt: '2026-04-02T18:00:00.000Z'
      }),
      buildActivePledge('sunder', {
        orderId: 'su-seed-002',
        email: 'blake@example.com',
        tierId: 'physical-media',
        tierQty: 1,
        bundleAddOns: [buildPlatformAddOn('sticker', 2)],
        shipping: 625,
        tipPercent: 5,
        shippingAddress: buildShippingAddress('Blake Moreno', '500 Gold Ave SW', 'Albuquerque', 'NM', '87102'),
        createdAt: '2026-04-04T16:20:00.000Z'
      }),
      buildActivePledge('sunder', {
        orderId: 'su-seed-003',
        email: 'aidan@example.com',
        tierId: 'fan',
        tierQty: 1,
        shipping: 750,
        tipPercent: 10,
        shippingAddress: buildShippingAddress('Aidan Sullivan', '200 Lead Ave SE', 'Albuquerque', 'NM', '87102'),
        createdAt: '2026-04-06T14:10:00.000Z'
      }),
      buildModifiedPledge('sunder', {
        orderId: 'su-seed-004',
        email: 'sabrina@example.com',
        createdAt: '2026-04-07T20:00:00.000Z',
        modifiedAt: '2026-04-10T19:35:00.000Z',
        before: {
          tierId: 'some-goodies',
          tierQty: 1,
          tipPercent: 5
        },
        after: {
          tierId: 'super-fan',
          tierQty: 1,
          bundleAddOns: [buildPlatformAddOn('tshirt', 1, 's', 'S')],
          shipping: 925,
          tipPercent: 8,
          shippingAddress: buildShippingAddress('Sabrina Falkowsky', '700 Central Ave SE', 'Albuquerque', 'NM', '87102')
        }
      }),
      buildActivePledge('sunder', {
        orderId: 'su-seed-005',
        email: 'darling@example.com',
        tierId: 'ultra-fan',
        tierQty: 1,
        shipping: 1100,
        pledgeStatus: 'payment_failed',
        shippingAddress: buildShippingAddress('Darling Film Co.', '111 Lomas Blvd NW', 'Albuquerque', 'NM', '87102'),
        createdAt: '2026-04-12T13:45:00.000Z'
      }),
      buildActivePledge('sunder', {
        orderId: 'su-seed-006',
        email: 'crew@example.com',
        tierId: 'some-goodies',
        tierQty: 2,
        tipPercent: 0,
        createdAt: '2026-04-15T21:05:00.000Z'
      })
    ],
    tecolote: [
      buildActivePledge('tecolote', {
        orderId: 'te-seed-001',
        email: 'nata@example.com',
        tierId: 'thanks',
        tierQty: 10,
        tipPercent: 0,
        createdAt: '2026-02-18T17:00:00.000Z'
      }),
      buildActivePledge('tecolote', {
        orderId: 'te-seed-002',
        email: 'joe@example.com',
        tierId: 'tshirt',
        tierQty: 1,
        bundleAddOns: [buildPlatformAddOn('sticker', 1)],
        shipping: 775,
        tipPercent: 5,
        shippingAddress: buildShippingAddress('Joe Manuel Gallegos Jr.', '900 4th St SW', 'Albuquerque', 'NM', '87102'),
        createdAt: '2026-02-22T19:10:00.000Z'
      }),
      buildActivePledge('tecolote', {
        orderId: 'te-seed-003',
        email: 'maiz@example.com',
        tierId: 'exclusive-tshirt',
        tierQty: 1,
        shipping: 850,
        tipPercent: 10,
        shippingAddress: buildShippingAddress('MAIZ Team', '1415 Coal Ave SE', 'Albuquerque', 'NM', '87106'),
        createdAt: '2026-02-24T18:30:00.000Z'
      }),
      buildModifiedPledge('tecolote', {
        orderId: 'te-seed-004',
        email: 'vidal@example.com',
        createdAt: '2026-02-25T20:05:00.000Z',
        modifiedAt: '2026-03-02T16:15:00.000Z',
        before: {
          tierId: 'owl-sticker',
          tierQty: 2,
          shipping: 425,
          shippingAddress: buildShippingAddress('Vidal Hidalgo', '123 Acequia Madre', 'Santa Fe', 'NM', '87501')
        },
        after: {
          tierId: 'auteur',
          tierQty: 1,
          bundleAddOns: [buildPlatformAddOn('tshirt', 1, 'xl', 'XL')],
          shipping: 975,
          tipPercent: 5,
          shippingAddress: buildShippingAddress('Vidal Hidalgo', '123 Acequia Madre', 'Santa Fe', 'NM', '87501')
        }
      }),
      buildCancelledPledge('tecolote', {
        orderId: 'te-seed-005',
        email: 'cancelled@tecolote.com',
        tierId: 'poster',
        tierQty: 1,
        shipping: 650,
        shippingAddress: buildShippingAddress('Poster Cancelled', '55 2nd St NW', 'Albuquerque', 'NM', '87102'),
        createdAt: '2026-03-05T15:00:00.000Z',
        cancelledAt: '2026-03-08T18:20:00.000Z'
      }),
      buildActivePledge('tecolote', {
        orderId: 'te-seed-006',
        email: 'ep@example.com',
        tierId: 'executive-producer',
        tierQty: 1,
        shipping: 1200,
        tipPercent: 5,
        shippingAddress: buildShippingAddress('Executive Producer', '77 Old Santa Fe Trail', 'Santa Fe', 'NM', '87501'),
        createdAt: '2026-03-10T22:40:00.000Z'
      })
    ],
    'worst-movie-ever': [
      buildActivePledge('worst-movie-ever', {
        orderId: 'wme-seed-001',
        email: 'alice@example.com',
        tierId: 'frame',
        tierQty: 100,
        supportItems: [{ id: 'feed-the-crew', amount: 50 }],
        tipPercent: 5,
        createdAt: '2026-01-16T17:30:00.000Z'
      }),
      buildActivePledge('worst-movie-ever', {
        orderId: 'wme-seed-002',
        email: 'brian@example.com',
        tierId: 'sound-effect',
        tierQty: 1,
        additionalTiers: [{ id: 'writer-credit', qty: 1 }],
        tipPercent: 10,
        createdAt: '2026-01-18T20:15:00.000Z'
      }),
      buildActivePledge('worst-movie-ever', {
        orderId: 'wme-seed-003',
        email: 'claire@example.com',
        tierId: 'prop',
        tierQty: 1,
        supportItems: [{ id: 'outdoor-heater', amount: 40 }],
        customAmount: 25,
        tipPercent: 8,
        createdAt: '2026-01-20T18:45:00.000Z'
      }),
      buildModifiedPledge('worst-movie-ever', {
        orderId: 'wme-seed-004',
        email: 'derek@example.com',
        createdAt: '2026-01-21T21:00:00.000Z',
        modifiedAt: '2026-01-28T18:00:00.000Z',
        before: {
          tierId: 'writer-credit',
          tierQty: 1,
          tipPercent: 5
        },
        after: {
          tierId: 'dialogue',
          tierQty: 1,
          supportItems: [{ id: 'feed-the-crew', amount: 20 }],
          bundleAddOns: [buildPlatformAddOn('tshirt', 1, 'm', 'M')],
          shipping: 700,
          tipPercent: 10,
          shippingAddress: buildShippingAddress('Derek Chaos', '410 Marquette Ave NW', 'Albuquerque', 'NM', '87102')
        }
      }),
      buildCancelledPledge('worst-movie-ever', {
        orderId: 'wme-seed-005',
        email: 'ivy@cancelled.com',
        tierId: 'prop',
        tierQty: 1,
        tipPercent: 5,
        createdAt: '2026-01-24T16:20:00.000Z',
        cancelledAt: '2026-01-26T17:05:00.000Z'
      }),
      buildActivePledge('worst-movie-ever', {
        orderId: 'wme-seed-006',
        email: 'jules@example.com',
        tierId: 'character',
        tierQty: 1,
        pledgeStatus: 'payment_failed',
        createdAt: '2026-01-30T23:10:00.000Z'
      }),
      buildActivePledge('worst-movie-ever', {
        orderId: 'wme-seed-007',
        email: 'felix@example.com',
        tierId: 'jack-does',
        tierQty: 1,
        tipPercent: 0,
        createdAt: '2026-02-02T19:55:00.000Z'
      })
    ],
    'smoke-editable': [
      buildActivePledge('smoke-editable', {
        orderId: 'smoke-seed-001',
        email: 'smoke-local@example.com',
        tierId: 'standard-pass',
        tierQty: 1,
        supportItems: [{ id: 'snack-run', amount: 15 }],
        tipPercent: 5,
        createdAt: '2026-04-19T17:00:00.000Z'
      }),
      buildActivePledge('smoke-editable', {
        orderId: 'smoke-seed-002',
        email: 'poster-local@example.com',
        tierId: 'limited-poster',
        tierQty: 1,
        supportItems: [{ id: 'signed-script', amount: 25 }],
        bundleAddOns: [
          buildCampaignAddOn('poster', 1),
          buildPlatformAddOn('sticker', 1)
        ],
        shipping: 1495,
        tipPercent: 5,
        shippingAddress: buildShippingAddress('Poster Local', '12 Test Loop', 'Albuquerque', 'NM', '87104'),
        createdAt: '2026-04-19T18:15:00.000Z'
      }),
      buildModifiedPledge('smoke-editable', {
        orderId: 'smoke-seed-003',
        email: 'bundle-local@example.com',
        createdAt: '2026-04-20T13:30:00.000Z',
        modifiedAt: '2026-04-20T19:45:00.000Z',
        before: {
          tierId: 'standard-pass',
          tierQty: 1,
          supportItems: [{ id: 'snack-run', amount: 10 }],
          tipPercent: 0
        },
        after: {
          tierId: 'limited-poster',
          tierQty: 1,
          supportItems: [{ id: 'signed-script', amount: 25 }],
          bundleAddOns: [
            buildCampaignAddOn('condomPack', 1),
            buildPlatformAddOn('tshirt', 1, 's', 'S')
          ],
          shipping: 1675,
          tipPercent: 10,
          shippingAddress: buildShippingAddress('Bundle Local', '34 Smoke St', 'Albuquerque', 'NM', '87105')
        }
      }),
      buildCancelledPledge('smoke-editable', {
        orderId: 'smoke-seed-004',
        email: 'cancel-local@example.com',
        tierId: 'limited-poster',
        tierQty: 1,
        supportItems: [{ id: 'signed-script', amount: 25 }],
        bundleAddOns: [buildCampaignAddOn('poster', 1)],
        shipping: 1350,
        createdAt: '2026-04-20T15:10:00.000Z',
        cancelledAt: '2026-04-21T09:20:00.000Z'
      })
    ]
  };
}

function writeTempJson(value) {
  const filePath = path.join(
    os.tmpdir(),
    `pool-seed-all-campaigns-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
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
    // Ignore missing-key deletes.
  }
}

function listKeys(prefix) {
  return (runWranglerJson([
    'kv', 'key', 'list',
    '--binding', 'PLEDGES',
    '--local',
    '--preview',
    '--prefix', prefix
  ]) || []).map((entry) => String(entry?.name || '').trim()).filter(Boolean);
}

function clearLocalFixtureState() {
  const prefixes = ['pledge:', 'email:', 'campaign-pledges:', 'stats:', 'tier-inventory:', 'campaign-runner-report:'];
  let deletedCount = 0;
  for (const prefix of prefixes) {
    for (const key of listKeys(prefix)) {
      deleteKvKey(key);
      deletedCount += 1;
    }
  }
  return deletedCount;
}

async function rebuildCampaignProjection(campaignSlug, adminSecret) {
  const baseHeaders = { Authorization: `Bearer ${adminSecret}` };
  for (const endpoint of [
    `${WORKER_URL}/stats/${campaignSlug}/recalculate`,
    `${WORKER_URL}/inventory/${campaignSlug}/recalculate`
  ]) {
    let response = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const adminRequestIp = `${ADMIN_REQUEST_IP_BASE}.${Math.floor(Math.random() * 200) + 20}`;
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...baseHeaders,
          'CF-Connecting-IP': adminRequestIp,
          'X-Forwarded-For': adminRequestIp
        }
      });
      if (response.ok) {
        break;
      }
      if (response.status !== 429) {
        throw new Error(`Failed POST ${endpoint}: ${response.status} ${await response.text()}`);
      }
      const retryAfterSeconds = Number(response.headers.get('retry-after') || 1) || 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterSeconds, 2) * 1000));
    }
    if (!response?.ok) {
      throw new Error(`Failed POST ${endpoint}: ${response?.status} ${await response?.text?.()}`);
    }
  }
}

async function readStats(campaignSlug) {
  const response = await fetch(`${WORKER_URL}/stats/${campaignSlug}`);
  if (!response.ok) {
    throw new Error(`Failed GET /stats/${campaignSlug}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  console.log('🧹 Clearing local pledge/index/stats/inventory/report state...');
  const deletedCount = clearLocalFixtureState();
  console.log(`   Deleted ${deletedCount} local KV key(s)`);

  const catalog = buildFixtureCatalog();
  const allPledges = [];

  console.log('');
  console.log('🌱 Seeding representative local fixtures...');
  for (const campaignSlug of CAMPAIGNS) {
    const pledges = catalog[campaignSlug] || [];
    for (const pledge of pledges) {
      putKvJson(`pledge:${pledge.orderId}`, pledge);
      allPledges.push(pledge);
    }
    const orderIds = pledges
      .filter((pledge) => pledge.pledgeStatus !== 'cancelled')
      .map((pledge) => pledge.orderId)
      .sort();
    putKvJson(`campaign-pledges:${campaignSlug}`, orderIds);
    console.log(`   ${campaignSlug}: ${pledges.length} seeded pledge(s)`);
  }

  const adminSecret = readAdminSecret();
  if (!adminSecret) {
    throw new Error('ADMIN_SECRET is required to rebuild local stats and inventory projections.');
  }

  console.log('');
  console.log('🔄 Rebuilding stats and tier inventory...');
  for (const campaignSlug of CAMPAIGNS) {
    await rebuildCampaignProjection(campaignSlug, adminSecret);
  }

  console.log('');
  console.log('📊 Local campaign summary:');
  for (const campaignSlug of CAMPAIGNS) {
    const stats = await readStats(campaignSlug);
    const campaignPledges = catalog[campaignSlug] || [];
    const modifiedCount = campaignPledges.filter((pledge) => Array.isArray(pledge.history) && pledge.history.some((entry) => entry.type === 'modified')).length;
    const cancelledCount = campaignPledges.filter((pledge) => pledge.pledgeStatus === 'cancelled').length;
    const failedCount = campaignPledges.filter((pledge) => pledge.pledgeStatus === 'payment_failed').length;
    console.log(
      `   ${campaignSlug.padEnd(18)} $${((Number(stats.pledgedAmount || 0) || 0) / 100).toFixed(2)}`
      + ` from ${stats.pledgeCount} report-visible pledge(s)`
      + ` | modified ${modifiedCount}, cancelled ${cancelledCount}, failed ${failedCount}`
    );
  }

  console.log('');
  console.log('✅ Seeded local campaign fixtures for the current platform model');
  console.log('   Includes support items, platform add-ons, and smoke-editable campaign add-ons.');
  console.log(`   Campaigns: ${CAMPAIGNS.join(', ')}`);
  console.log(`   Total seeded pledges: ${allPledges.length}`);
}

await main();
