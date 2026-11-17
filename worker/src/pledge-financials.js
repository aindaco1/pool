// Shared current-pledge financial totals for Analytics and pledge reports.
// Amounts and allocations use integer cents; this module performs no I/O.

export const STRIPE_FEE_ESTIMATE_BPS = 290;
export const STRIPE_FEE_ESTIMATE_FIXED_CENTS = 30;

export function allocateIntegerTotal(totalCents, items = []) {
  const total = Math.trunc(Number(totalCents || 0) || 0);
  const count = Array.isArray(items) ? items.length : 0;
  if (count <= 0) return [];
  if (total === 0) return new Array(count).fill(0);

  const sign = total < 0 ? -1 : 1;
  const absTotal = Math.abs(total);
  const weights = items.map((item) => Math.max(0, Number(item?.amount || 0) || 0));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) {
    const allocations = new Array(count).fill(0);
    allocations[0] = total;
    return allocations;
  }

  const rows = weights.map((weight, index) => {
    const exact = (absTotal * weight) / weightTotal;
    const base = Math.floor(exact);
    return { index, base, remainder: exact - base };
  });
  let allocated = rows.reduce((sum, row) => sum + row.base, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; allocated < absTotal; index += 1, allocated += 1) {
    rows[index % rows.length].base += 1;
  }
  rows.sort((a, b) => a.index - b.index);
  return rows.map((row) => row.base * sign);
}

export function isCampaignScopedBundleAddOn(addOn) {
  return String(addOn?.scope || '').trim().toLowerCase() === 'campaign';
}

export function getCampaignBundleAddOnSubtotal(bundleAddOns = [], campaignSlug = '') {
  const normalizedCampaignSlug = String(campaignSlug || '').trim();
  return (bundleAddOns || []).reduce((sum, addOn) => {
    const quantity = Number(addOn?.quantity || 0) || 0;
    const unitPrice = Number(addOn?.unitPrice || 0) || 0;
    if (quantity <= 0 || unitPrice <= 0) return sum;
    if (!isCampaignScopedBundleAddOn(addOn)) return sum;
    if (normalizedCampaignSlug && String(addOn?.campaignSlug || '').trim() !== normalizedCampaignSlug) {
      return sum;
    }
    return sum + (unitPrice * quantity);
  }, 0);
}

export function getPlatformBundleAddOnSubtotal(bundleAddOns = []) {
  return (bundleAddOns || []).reduce((sum, addOn) => {
    const quantity = Number(addOn?.quantity || 0) || 0;
    const unitPrice = Number(addOn?.unitPrice || 0) || 0;
    if (quantity <= 0 || unitPrice <= 0) return sum;
    return isCampaignScopedBundleAddOn(addOn) ? sum : sum + (unitPrice * quantity);
  }, 0);
}

export function getPledgeStatusLabel(pledge = {}) {
  const rawStatus = String(pledge?.pledgeStatus || 'active').trim().toLowerCase();
  if (pledge?.charged === true) return 'charged';
  return rawStatus || 'active';
}

export function emptyPledgeFinancialTotals() {
  return {
    campaignCount: 0,
    indexedPledgeCount: 0,
    pledgeCount: 0,
    uniqueSupporters: 0,
    activePledgeCount: 0,
    chargedPledgeCount: 0,
    cancelledPledgeCount: 0,
    paymentFailedPledgeCount: 0,
    pledgedAmount: 0,
    chargedAmount: 0,
    paymentFailedAmount: 0,
    campaignRevenue: 0,
    campaignAddOnRevenue: 0,
    platformAddOnRevenue: 0,
    platformTipRevenue: 0,
    platformRevenue: 0,
    taxTotal: 0,
    shippingTotal: 0,
    actualStripeFeeAmount: 0,
    actualStripeNetAmount: 0,
    actualStripeGrossAmount: 0,
    actualStripeFinancialPledgeCount: 0,
    pendingStripeFinancialPledgeCount: 0,
    estimatedStripeFeeAmount: 0,
    estimatedStripeFeePledgeCount: 0,
    processorFeeAllocatedToCampaignRevenue: 0,
    processorFeeAllocatedToPlatformRevenue: 0,
    processorFeeAllocatedToTax: 0,
    processorFeeAllocatedToShipping: 0,
    netCampaignRevenue: 0,
    netPlatformRevenue: 0,
    physicalPledgeCount: 0,
    physicalPledgeAmount: 0,
    digitalPledgeCount: 0,
    digitalPledgeAmount: 0,
    platformAddOnPledgeCount: 0
  };
}

function allocateProcessorFees(feeAmount, {
  campaignRevenue = 0,
  platformRevenue = 0,
  taxTotal = 0,
  shippingTotal = 0
} = {}) {
  const [campaignFee, platformFee, taxFee, shippingFee] = allocateIntegerTotal(feeAmount, [
    { amount: campaignRevenue },
    { amount: platformRevenue },
    { amount: taxTotal },
    { amount: shippingTotal }
  ]);
  return {
    campaignRevenue: Math.max(0, Number(campaignFee || 0) || 0),
    platformRevenue: Math.max(0, Number(platformFee || 0) || 0),
    tax: Math.max(0, Number(taxFee || 0) || 0),
    shipping: Math.max(0, Number(shippingFee || 0) || 0)
  };
}

function estimateStripeFeeCents(amountCents) {
  const amount = Number(amountCents || 0) || 0;
  if (amount <= 0) return 0;
  return Math.round((amount * STRIPE_FEE_ESTIMATE_BPS) / 10000) + STRIPE_FEE_ESTIMATE_FIXED_CENTS;
}

export function getStoredStripeFinancials(pledge = {}) {
  const nested = pledge?.stripeFinancials && typeof pledge.stripeFinancials === 'object'
    ? pledge.stripeFinancials
    : {};
  const source = String(nested.source || pledge?.stripeFinancialsSource || '').trim();
  if (source !== 'actual') {
    return source === 'pending' ? { source: 'pending' } : null;
  }
  const grossAmount = Number(nested.grossAmount ?? pledge?.stripeGrossAmount);
  const feeAmount = Number(nested.feeAmount ?? pledge?.stripeFeeAmount);
  const netAmount = Number(nested.netAmount ?? pledge?.stripeNetAmount);
  if (!Number.isFinite(feeAmount) || !Number.isFinite(netAmount)) return null;
  return {
    source: 'actual',
    grossAmount: Number.isFinite(grossAmount) ? grossAmount : feeAmount + netAmount,
    feeAmount,
    netAmount
  };
}

export function applyPledgeToFinancialTotals(totals, campaign, pledge = {}) {
  const campaignSlug = String(campaign?.slug || pledge?.campaignSlug || '');
  const status = getPledgeStatusLabel(pledge);
  const subtotal = Number(pledge?.subtotal || 0) || 0;
  const amount = Number(pledge?.amount || 0) || 0;
  const bundleAddOns = Array.isArray(pledge?.bundleAddOns) ? pledge.bundleAddOns : [];
  const platformAddOnRevenue = getPlatformBundleAddOnSubtotal(bundleAddOns);
  const campaignAddOnRevenue = getCampaignBundleAddOnSubtotal(bundleAddOns, campaignSlug);
  const platformTipRevenue = Number(pledge?.tipAmount || 0) || 0;
  const platformRevenue = platformAddOnRevenue + platformTipRevenue;
  const campaignRevenue = Math.max(0, subtotal - platformAddOnRevenue);
  const taxTotal = Number(pledge?.tax || 0) || 0;
  const shippingTotal = Number(pledge?.shipping || 0) || 0;
  const isCancelled = status === 'cancelled';
  const countsTowardPledged = !isCancelled;
  const countsTowardStripeFeeEstimate = status === 'active' || status === 'charged';
  const storedStripeFinancials = getStoredStripeFinancials(pledge);
  let processorFeeForAllocation = 0;

  totals.pledgeCount += 1;
  if (countsTowardPledged) {
    totals.activePledgeCount += status === 'active' || status === 'charged' ? 1 : 0;
    totals.pledgedAmount += amount;
    totals.campaignRevenue += campaignRevenue;
    totals.campaignAddOnRevenue += campaignAddOnRevenue;
    totals.platformAddOnRevenue += platformAddOnRevenue;
    totals.platformTipRevenue += platformTipRevenue;
    totals.platformRevenue += platformRevenue;
    totals.taxTotal += taxTotal;
    totals.shippingTotal += shippingTotal;
  } else {
    totals.cancelledPledgeCount += 1;
  }

  if (status === 'charged' && storedStripeFinancials?.source === 'actual') {
    totals.actualStripeFinancialPledgeCount += 1;
    processorFeeForAllocation = Math.max(0, Number(storedStripeFinancials.feeAmount || 0) || 0);
    totals.actualStripeFeeAmount += processorFeeForAllocation;
    totals.actualStripeNetAmount += Math.max(0, Number(storedStripeFinancials.netAmount || 0) || 0);
    totals.actualStripeGrossAmount += Math.max(0, Number(storedStripeFinancials.grossAmount || 0) || 0);
  } else if (countsTowardStripeFeeEstimate) {
    processorFeeForAllocation = estimateStripeFeeCents(amount);
    totals.estimatedStripeFeePledgeCount += 1;
    totals.estimatedStripeFeeAmount += processorFeeForAllocation;
    if (status === 'charged' && storedStripeFinancials?.source === 'pending') {
      totals.pendingStripeFinancialPledgeCount += 1;
    }
  }

  if (countsTowardPledged) {
    const processorFeeAllocations = allocateProcessorFees(processorFeeForAllocation, {
      campaignRevenue,
      platformRevenue,
      taxTotal,
      shippingTotal
    });
    totals.processorFeeAllocatedToCampaignRevenue += processorFeeAllocations.campaignRevenue;
    totals.processorFeeAllocatedToPlatformRevenue += processorFeeAllocations.platformRevenue;
    totals.processorFeeAllocatedToTax += processorFeeAllocations.tax;
    totals.processorFeeAllocatedToShipping += processorFeeAllocations.shipping;
    totals.netCampaignRevenue += Math.max(0, campaignRevenue - processorFeeAllocations.campaignRevenue);
    totals.netPlatformRevenue += Math.max(0, platformRevenue - processorFeeAllocations.platformRevenue);
  }

  if (status === 'charged') {
    totals.chargedPledgeCount += 1;
    totals.chargedAmount += amount;
  }
  if (status === 'payment_failed') {
    totals.paymentFailedPledgeCount += 1;
    totals.paymentFailedAmount += amount;
  }
}
