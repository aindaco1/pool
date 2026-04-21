const DEFAULT_PLATFORM_FULFILLER = 'Platform';

const TIER_NAMES = {
  frame: 'One Frame',
  'writer-credit': 'Writer Credit',
  'sound-effect': 'Sound Effect',
  dialogue: 'Line of Dialogue',
  prop: 'Handheld Prop',
  costume: 'Costume',
  character: 'Add a Character',
  'jack-does': 'Jack Does Whatever You Write',
  language: 'Scene in Another Language',
  act: 'Act in the Movie'
};

function formatCents(cents = 0) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function buildCsv(header, rows) {
  return [header, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

function getTierDisplayName(tierId, campaign = null, fallback = '') {
  const normalizedTierId = String(tierId || '').trim();
  if (!normalizedTierId && fallback) {
    return String(fallback).trim();
  }

  const matchedTier = Array.isArray(campaign?.tiers)
    ? campaign.tiers.find((tier) => String(tier?.id || '').trim() === normalizedTierId)
    : null;

  const campaignName = String(matchedTier?.name || '').trim();
  if (campaignName) {
    return campaignName;
  }

  return TIER_NAMES[normalizedTierId] || String(fallback || normalizedTierId || '').trim();
}

function getAddOnLabel(addOn = {}) {
  const name = String(addOn?.name || addOn?.productId || 'Platform add-on').trim();
  const variant = String(addOn?.variantLabel || '').trim();
  return variant ? `${name} (${variant})` : name;
}

function isCampaignAddOn(addOn = {}, campaignSlug = '') {
  const scope = String(addOn?.scope || '').trim().toLowerCase();
  const addOnCampaignSlug = String(addOn?.campaignSlug || addOn?.campaign_slug || '').trim();
  const normalizedCampaignSlug = String(campaignSlug || '').trim();

  if (scope !== 'campaign') {
    return false;
  }

  if (!normalizedCampaignSlug) {
    return true;
  }

  return addOnCampaignSlug === normalizedCampaignSlug;
}

function getAddOnCounts(addOns = []) {
  const counts = new Map();
  for (const addOn of addOns || []) {
    const label = getAddOnLabel(addOn);
    const quantity = Math.max(0, Number(addOn?.quantity || 0) || 0);
    if (!label || quantity <= 0) {
      continue;
    }
    counts.set(label, (counts.get(label) || 0) + quantity);
  }
  return counts;
}

function getAddOnSubtotalCents(addOns = [], campaignSlug = '', scope = 'all') {
  let totalCents = 0;
  const normalizedScope = String(scope || 'all').trim().toLowerCase();

  for (const addOn of addOns || []) {
    const lineTotal = (Number(addOn?.unitPrice || 0) || 0) * (Number(addOn?.quantity || 0) || 0);
    if (normalizedScope === 'campaign') {
      if (!isCampaignAddOn(addOn, campaignSlug)) {
        continue;
      }
    } else if (normalizedScope === 'platform') {
      if (isCampaignAddOn(addOn, campaignSlug)) {
        continue;
      }
    }
    totalCents += lineTotal;
  }

  return totalCents;
}

function getCampaignSubtotalCents(pledge = {}) {
  if (pledge?.goalTrackingSubtotal !== null && pledge?.goalTrackingSubtotal !== undefined) {
    return Number(pledge.goalTrackingSubtotal || 0) || 0;
  }

  const subtotalCents = Number(pledge?.subtotal ?? pledge?.amount ?? 0) || 0;
  return subtotalCents - getAddOnSubtotalCents(pledge?.bundleAddOns || [], pledge?.campaignSlug || '', 'platform');
}

function buildCountItemsStr(counts, { isNegative = false } = {}) {
  const items = [];
  const entries = counts instanceof Map ? Array.from(counts.entries()) : Object.entries(counts || {});

  for (const [itemName, rawQty] of entries.sort(([a], [b]) => String(a).localeCompare(String(b)))) {
    const quantity = Number(rawQty || 0) || 0;
    if (!itemName || quantity <= 0) {
      continue;
    }
    const prefix = isNegative ? '-' : '';
    items.push(quantity > 1 ? `${prefix}${itemName} x${quantity}` : `${prefix}${itemName}`);
  }

  return items.join('; ');
}

function buildDiffItemsStr(oldCounts, newCounts) {
  const items = [];
  const allNames = new Set([
    ...Array.from((oldCounts || new Map()).keys?.() || Object.keys(oldCounts || {})),
    ...Array.from((newCounts || new Map()).keys?.() || Object.keys(newCounts || {}))
  ]);

  for (const itemName of Array.from(allNames).sort((a, b) => String(a).localeCompare(String(b)))) {
    const oldQty = oldCounts instanceof Map ? (oldCounts.get(itemName) || 0) : (oldCounts?.[itemName] || 0);
    const newQty = newCounts instanceof Map ? (newCounts.get(itemName) || 0) : (newCounts?.[itemName] || 0);
    const diff = newQty - oldQty;
    if (diff > 0) {
      items.push(diff > 1 ? `+${itemName} x${diff}` : `+${itemName}`);
    } else if (diff < 0) {
      items.push(diff < -1 ? `-${itemName} x${Math.abs(diff)}` : `-${itemName}`);
    }
  }

  return items.join('; ');
}

function getTierCounts(entry = {}, campaign = null) {
  const counts = new Map();
  const tierId = String(entry?.tierId || '').trim();
  if (tierId) {
    const tierName = getTierDisplayName(tierId, campaign, entry?.tierName);
    if (tierName) {
      counts.set(tierName, Number(entry?.tierQty || 1) || 1);
    }
  }

  for (const addTier of entry?.additionalTiers || []) {
    const addTierName = getTierDisplayName(addTier?.id, campaign, addTier?.name);
    if (!addTierName) {
      continue;
    }
    counts.set(addTierName, Number(addTier?.qty || 1) || 1);
  }

  return counts;
}

function buildItemsStr(entry = {}, campaign = null, { isNegative = false, customAmount = 0 } = {}) {
  const items = [];
  const tierId = String(entry?.tierId || '').trim();

  if (tierId) {
    const tierName = getTierDisplayName(tierId, campaign, entry?.tierName);
    const tierQty = Number(entry?.tierQty || 1) || 1;
    const prefix = isNegative ? '-' : '';
    items.push(tierQty > 1 ? `${prefix}${tierName} x${tierQty}` : `${prefix}${tierName}`);
  }

  for (const addTier of entry?.additionalTiers || []) {
    const addTierName = getTierDisplayName(addTier?.id, campaign, addTier?.name);
    if (!addTierName) {
      continue;
    }
    const addTierQty = Number(addTier?.qty || 1) || 1;
    const prefix = isNegative ? '-' : '';
    items.push(addTierQty > 1 ? `${prefix}${addTierName} x${addTierQty}` : `${prefix}${addTierName}`);
  }

  if ((Number(customAmount || 0) || 0) > 0) {
    items.push(`Custom Support $${Number(customAmount || 0).toFixed(2)}`);
  }

  return items.join('; ');
}

function allocateCents(totalCents, bucketCents = []) {
  const normalizedTotalCents = Number(totalCents || 0) || 0;
  if (normalizedTotalCents <= 0 || !bucketCents.length) {
    return bucketCents.map(() => 0);
  }

  const totalBucketCents = bucketCents.reduce((sum, value) => sum + (Number(value || 0) || 0), 0);
  if (totalBucketCents <= 0) {
    return bucketCents.map(() => 0);
  }

  const allocations = [];
  let consumed = 0;
  for (let index = 0; index < bucketCents.length; index += 1) {
    if (index === bucketCents.length - 1) {
      allocations.push(normalizedTotalCents - consumed);
      break;
    }
    const allocation = Math.floor((normalizedTotalCents * (Number(bucketCents[index] || 0) || 0)) / totalBucketCents);
    consumed += allocation;
    allocations.push(allocation);
  }

  return allocations;
}

function getShippingAddressStr(address = null) {
  if (!address || typeof address !== 'object') {
    return '';
  }

  const parts = [
    address.name,
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.postalCode,
    address.country
  ].map((value) => String(value || '').trim()).filter(Boolean);

  return parts.join(', ');
}

export function buildPledgeLedgerReport(pledges = [], { campaign = null } = {}) {
  const header = [
    'email',
    'campaign',
    'items',
    'add_on_items',
    'campaign_subtotal',
    'platform_add_on_subtotal',
    'subtotal',
    'tip_percent',
    'tip',
    'tax',
    'shipping',
    'total',
    'status',
    'charged',
    'created_at',
    'order_id'
  ];

  const rows = [];

  for (const pledge of pledges || []) {
    const pledgeCampaign = campaign && String(campaign?.slug || '') === String(pledge?.campaignSlug || '')
      ? campaign
      : null;
    const email = String(pledge?.email || '').trim();
    const campaignSlug = String(pledge?.campaignSlug || '').trim();
    const orderId = String(pledge?.orderId || '').trim();
    const charged = pledge?.charged === true ? 'yes' : 'no';
    const history = Array.isArray(pledge?.history) ? pledge.history : [];

    if (history.length > 0) {
      let previousCounts = new Map();
      let previousAddOnCounts = new Map();
      let previousCustomAmount = 0;
      let previousAddOnSubtotalCents = 0;

      for (const entry of history) {
        const entryType = String(entry?.type || '').trim().toLowerCase();
        const timestamp = String(entry?.at || '').trim();

        if (entryType === 'created') {
          const subtotalCents = Number(entry?.subtotal || 0) || 0;
          const tipPercent = Number(entry?.tipPercent ?? pledge?.tipPercent ?? 0) || 0;
          const tipCents = Number(entry?.tipAmount ?? pledge?.tipAmount ?? 0) || 0;
          const taxCents = Number(entry?.tax || 0) || 0;
          const shippingCents = Number(entry?.shipping || 0) || 0;
          const totalCents = Number(entry?.amount || 0) || 0;
          const customAmount = Number(entry?.customAmount || 0) || 0;
          const addOnCounts = getAddOnCounts(entry?.bundleAddOns || []);
          const addOnSubtotalCents = getAddOnSubtotalCents(entry?.bundleAddOns || [], campaignSlug, 'platform');
          const campaignSubtotalCents = getCampaignSubtotalCents({
            ...entry,
            campaignSlug
          });

          previousCounts = getTierCounts(entry, pledgeCampaign);
          previousAddOnCounts = addOnCounts;
          previousCustomAmount = customAmount;
          previousAddOnSubtotalCents = addOnSubtotalCents;

          rows.push([
            email,
            campaignSlug,
            buildItemsStr(entry, pledgeCampaign, { customAmount }),
            buildCountItemsStr(addOnCounts),
            formatCents(campaignSubtotalCents),
            formatCents(addOnSubtotalCents),
            formatCents(subtotalCents),
            String(tipPercent),
            formatCents(tipCents),
            formatCents(taxCents),
            formatCents(shippingCents),
            formatCents(totalCents),
            'created',
            charged,
            timestamp,
            orderId
          ]);
          continue;
        }

        if (entryType === 'modified') {
          const subtotalDeltaCents = Number(entry?.subtotalDelta || 0) || 0;
          const tipPercent = Number(entry?.tipPercent ?? pledge?.tipPercent ?? 0) || 0;
          const tipDeltaCents = Number(entry?.tipAmountDelta || 0) || 0;
          const taxDeltaCents = Number(entry?.taxDelta || 0) || 0;
          const shippingDeltaCents = Number(entry?.shippingDelta || 0) || 0;
          const totalDeltaCents = Number(entry?.amountDelta || 0) || 0;
          const newCounts = getTierCounts(entry, pledgeCampaign);
          const newCustomAmount = Number(entry?.customAmount || 0) || 0;
          const newAddOnCounts = getAddOnCounts(entry?.bundleAddOns || []);
          const addOnSubtotalCents = getAddOnSubtotalCents(entry?.bundleAddOns || [], campaignSlug, 'platform');
          const addOnSubtotalDeltaCents = addOnSubtotalCents - previousAddOnSubtotalCents;
          const campaignSubtotalDeltaCents = subtotalDeltaCents - addOnSubtotalDeltaCents;

          let itemsStr = buildDiffItemsStr(previousCounts, newCounts);
          const addOnItemsStr = buildDiffItemsStr(previousAddOnCounts, newAddOnCounts);

          if (newCustomAmount !== previousCustomAmount) {
            const customDiff = newCustomAmount - previousCustomAmount;
            const customStr = customDiff > 0
              ? `+Custom Support $${customDiff.toFixed(2)}`
              : `-Custom Support $${Math.abs(customDiff).toFixed(2)}`;
            itemsStr = itemsStr ? `${itemsStr}; ${customStr}` : customStr;
          }

          const tipChanged = tipDeltaCents !== 0;
          const tipOnlyChange = tipChanged && subtotalDeltaCents === 0 && taxDeltaCents === 0 && shippingDeltaCents === 0;
          const addOnChanged = Boolean(addOnItemsStr);

          if (itemsStr) {
            itemsStr = tipChanged
              ? `(modified) ${itemsStr}; tip updated to ${tipPercent}%`
              : `(modified) ${itemsStr}`;
          } else if (tipOnlyChange) {
            itemsStr = `(tip updated to ${tipPercent}%)`;
          } else if (addOnChanged && tipChanged) {
            itemsStr = `(modified add-ons; tip updated to ${tipPercent}%)`;
          } else if (addOnChanged) {
            itemsStr = '(modified add-ons)';
          } else {
            itemsStr = '(modified)';
          }

          previousCounts = newCounts;
          previousAddOnCounts = newAddOnCounts;
          previousCustomAmount = newCustomAmount;
          previousAddOnSubtotalCents = addOnSubtotalCents;

          rows.push([
            email,
            campaignSlug,
            itemsStr,
            addOnItemsStr,
            formatCents(campaignSubtotalDeltaCents),
            formatCents(addOnSubtotalDeltaCents),
            formatCents(subtotalDeltaCents),
            String(tipPercent),
            formatCents(tipDeltaCents),
            formatCents(taxDeltaCents),
            formatCents(shippingDeltaCents),
            formatCents(totalDeltaCents),
            'modified',
            charged,
            timestamp,
            orderId
          ]);
          continue;
        }

        if (entryType === 'cancelled') {
          const subtotalDeltaCents = Number(entry?.subtotalDelta || 0) || 0;
          const tipPercent = Number(entry?.tipPercent ?? pledge?.tipPercent ?? 0) || 0;
          const tipDeltaCents = Number(entry?.tipAmountDelta || 0) || 0;
          const taxDeltaCents = Number(entry?.taxDelta || 0) || 0;
          const shippingDeltaCents = Number(entry?.shippingDelta || 0) || 0;
          const totalDeltaCents = Number(entry?.amountDelta || 0) || 0;
          const addOnCounts = getAddOnCounts(pledge?.bundleAddOns || []);
          const addOnSubtotalCents = -getAddOnSubtotalCents(pledge?.bundleAddOns || [], campaignSlug, 'platform');
          const campaignSubtotalDeltaCents = subtotalDeltaCents - addOnSubtotalCents;

          rows.push([
            email,
            campaignSlug,
            buildItemsStr(pledge, pledgeCampaign, {
              isNegative: true,
              customAmount: Number(pledge?.customAmount || 0) || 0
            }),
            buildCountItemsStr(addOnCounts, { isNegative: true }),
            formatCents(campaignSubtotalDeltaCents),
            formatCents(addOnSubtotalCents),
            formatCents(subtotalDeltaCents),
            String(tipPercent),
            formatCents(tipDeltaCents),
            formatCents(taxDeltaCents),
            formatCents(shippingDeltaCents),
            formatCents(totalDeltaCents),
            'cancelled',
            charged,
            timestamp,
            orderId
          ]);
        }
      }

      continue;
    }

    const pledgeStatus = String(pledge?.pledgeStatus || 'unknown').trim().toLowerCase();
    const status = pledge?.charged === true
      ? 'charged'
      : pledgeStatus === 'payment_failed'
        ? 'failed'
        : pledgeStatus;
    const isCancelled = status === 'cancelled';
    const sign = isCancelled ? -1 : 1;
    const subtotalCents = sign * (Number(pledge?.subtotal ?? pledge?.amount ?? 0) || 0);
    const tipPercent = Number(pledge?.tipPercent || 0) || 0;
    const tipCents = sign * (Number(pledge?.tipAmount || 0) || 0);
    const taxCents = sign * (Number(pledge?.tax || 0) || 0);
    const shippingCents = sign * (Number(pledge?.shipping || 0) || 0);
    const totalCents = sign * (Number(pledge?.amount || 0) || 0);
    const addOnCounts = getAddOnCounts(pledge?.bundleAddOns || []);
    const addOnSubtotalCents = sign * getAddOnSubtotalCents(pledge?.bundleAddOns || [], campaignSlug, 'platform');
    const campaignSubtotalCents = sign * getCampaignSubtotalCents(pledge);

    rows.push([
      email,
      campaignSlug,
      buildItemsStr(pledge, pledgeCampaign, {
        isNegative: isCancelled,
        customAmount: Number(pledge?.customAmount || 0) || 0
      }),
      buildCountItemsStr(addOnCounts, { isNegative: isCancelled }),
      formatCents(campaignSubtotalCents),
      formatCents(addOnSubtotalCents),
      formatCents(subtotalCents),
      String(tipPercent),
      formatCents(tipCents),
      formatCents(taxCents),
      formatCents(shippingCents),
      formatCents(totalCents),
      status,
      charged,
      String(pledge?.createdAt || ''),
      orderId
    ]);
  }

  return {
    header,
    rows,
    csv: buildCsv(header, rows)
  };
}

export function buildFulfillmentReport(
  pledges = [],
  { campaign = null, platformFulfiller = DEFAULT_PLATFORM_FULFILLER } = {}
) {
  const header = [
    'email',
    'campaign',
    'fulfiller',
    'items',
    'add_on_items',
    'campaign_subtotal',
    'platform_add_on_subtotal',
    'subtotal',
    'tip_percent',
    'tip',
    'tax',
    'shipping',
    'total',
    'shipping_address'
  ];

  const aggregated = new Map();

  for (const pledge of pledges || []) {
    if (String(pledge?.pledgeStatus || '').trim().toLowerCase() === 'cancelled') {
      continue;
    }

    const email = String(pledge?.email || '').trim();
    const campaignSlug = String(pledge?.campaignSlug || '').trim();
    const pledgeCampaign = campaign && String(campaign?.slug || '') === campaignSlug ? campaign : null;
    const shippingAddress = getShippingAddressStr(pledge?.shippingAddress);
    const campaignSubtotalCents = getCampaignSubtotalCents(pledge);
    const platformAddOnSubtotalCents = getAddOnSubtotalCents(pledge?.bundleAddOns || [], campaignSlug, 'platform');
    const tipCents = Number(pledge?.tipAmount || 0) || 0;
    const taxCents = Number(pledge?.tax || 0) || 0;
    const shippingCents = Number(pledge?.shipping || 0) || 0;

    const campaignItems = getTierCounts(pledge, pledgeCampaign);
    const campaignAddOnItems = new Map();
    const platformAddOnItems = new Map();

    for (const addOn of pledge?.bundleAddOns || []) {
      const addOnLabel = getAddOnLabel(addOn);
      const quantity = Number(addOn?.quantity || 1) || 1;
      const targetMap = isCampaignAddOn(addOn, campaignSlug) ? campaignAddOnItems : platformAddOnItems;
      if (!addOnLabel || quantity <= 0) {
        continue;
      }
      targetMap.set(addOnLabel, (targetMap.get(addOnLabel) || 0) + quantity);
    }

    const rowSpecs = [];
    if (campaignSubtotalCents > 0 || campaignItems.size > 0 || campaignAddOnItems.size > 0) {
      rowSpecs.push({
        campaign: campaignSlug,
        fulfiller: campaignSlug,
        campaignSubtotalCents,
        addOnSubtotalCents: 0,
        subtotalCents: campaignSubtotalCents,
        items: campaignItems,
        addOnItems: campaignAddOnItems
      });
    }

    if (platformAddOnSubtotalCents > 0 || platformAddOnItems.size > 0) {
      rowSpecs.push({
        campaign: '',
        fulfiller: String(platformFulfiller || DEFAULT_PLATFORM_FULFILLER),
        campaignSubtotalCents: 0,
        addOnSubtotalCents: platformAddOnSubtotalCents,
        subtotalCents: platformAddOnSubtotalCents,
        items: new Map(),
        addOnItems: platformAddOnItems
      });
    }

    if (!rowSpecs.length) {
      continue;
    }

    const bucketCents = rowSpecs.map((spec) => spec.subtotalCents);
    const tipAllocations = allocateCents(tipCents, bucketCents);
    const taxAllocations = allocateCents(taxCents, bucketCents);
    const shippingAllocations = allocateCents(shippingCents, bucketCents);

    rowSpecs.forEach((spec, index) => {
      const aggregateKey = [email, spec.campaign, spec.fulfiller].join('::');
      if (!aggregated.has(aggregateKey)) {
        aggregated.set(aggregateKey, {
          email,
          campaign: spec.campaign,
          fulfiller: spec.fulfiller,
          campaignSubtotalCents: 0,
          addOnSubtotalCents: 0,
          subtotalCents: 0,
          tipCents: 0,
          taxCents: 0,
          shippingCents: 0,
          totalCents: 0,
          tipPercent: 0,
          items: new Map(),
          addOnItems: new Map(),
          shippingAddress: ''
        });
      }

      const aggregate = aggregated.get(aggregateKey);
      aggregate.campaignSubtotalCents += spec.campaignSubtotalCents;
      aggregate.addOnSubtotalCents += spec.addOnSubtotalCents;
      aggregate.subtotalCents += spec.subtotalCents;
      aggregate.tipCents += tipAllocations[index];
      aggregate.taxCents += taxAllocations[index];
      aggregate.shippingCents += shippingAllocations[index];
      aggregate.totalCents += spec.subtotalCents + tipAllocations[index] + taxAllocations[index] + shippingAllocations[index];
      if (aggregate.subtotalCents > 0 && aggregate.tipCents > 0) {
        aggregate.tipPercent = Math.round((aggregate.tipCents / aggregate.subtotalCents) * 100);
      }
      if (shippingAddress && !aggregate.shippingAddress) {
        aggregate.shippingAddress = shippingAddress;
      }

      for (const [itemName, quantity] of spec.items.entries()) {
        aggregate.items.set(itemName, (aggregate.items.get(itemName) || 0) + quantity);
      }
      for (const [itemName, quantity] of spec.addOnItems.entries()) {
        aggregate.addOnItems.set(itemName, (aggregate.addOnItems.get(itemName) || 0) + quantity);
      }
    });
  }

  const rows = Array.from(aggregated.values())
    .filter((row) => (row.items.size > 0 || row.addOnItems.size > 0) && row.totalCents > 0)
    .sort((a, b) => (
      a.email.localeCompare(b.email) ||
      a.campaign.localeCompare(b.campaign) ||
      a.fulfiller.localeCompare(b.fulfiller)
    ))
    .map((row) => ([
      row.email,
      row.campaign,
      row.fulfiller,
      buildCountItemsStr(row.items),
      buildCountItemsStr(row.addOnItems),
      formatCents(row.campaignSubtotalCents),
      formatCents(row.addOnSubtotalCents),
      formatCents(row.subtotalCents),
      String(row.tipPercent),
      formatCents(row.tipCents),
      formatCents(row.taxCents),
      formatCents(row.shippingCents),
      formatCents(row.totalCents),
      row.shippingAddress
    ]));

  return {
    header,
    rows,
    csv: buildCsv(header, rows)
  };
}
