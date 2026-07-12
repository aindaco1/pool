export const ADMIN_POOL_PLEDGE_SNAPSHOT_VERSION = 1;

const PLEDGE_WATERMARK_PATTERN = /^pledges-v1-[a-f0-9]{16}$/;

export function parsePoolReadModelTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function poolPledgeUpdatedAt(pledge = {}) {
  let latestMs = null;
  for (const value of [
    pledge.updatedAt,
    pledge.chargedAt,
    pledge.cancelledAt,
    pledge.createdAt
  ]) {
    const parsed = parsePoolReadModelTimestamp(value);
    if (parsed !== null && (latestMs === null || parsed > latestMs)) latestMs = parsed;
  }
  return latestMs === null ? '' : new Date(latestMs).toISOString();
}

export function poolPledgeSortTime(pledge = {}) {
  return parsePoolReadModelTimestamp(
    pledge.updatedAt || pledge.chargedAt || pledge.createdAt || pledge.cancelledAt || ''
  ) || 0;
}

export function comparePoolPledges(a = {}, b = {}) {
  return poolPledgeSortTime(b) - poolPledgeSortTime(a) ||
    String(b.orderId || '').localeCompare(String(a.orderId || ''));
}

export function normalizePoolPledgeOrderId(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) return '';
  return normalized;
}

function stablePledgeSignature(pledge = {}) {
  const tierSelections = Array.isArray(pledge.tierSelections) ? pledge.tierSelections : [];
  const additionalTiers = Array.isArray(pledge.additionalTiers) ? pledge.additionalTiers : [];
  const extras = Array.isArray(pledge.extras) ? pledge.extras : [];
  return [
    normalizePoolPledgeOrderId(pledge.orderId),
    String(pledge.campaignSlug || ''),
    String(pledge.pledgeStatus || pledge.status || ''),
    poolPledgeUpdatedAt(pledge),
    Number(pledge.amount || pledge.pledgeAmount || 0),
    Number(pledge.chargedAmount || 0),
    String(pledge.tierId || pledge.rewardTierId || ''),
    tierSelections.map((item) => `${item?.tierId || item?.id || ''}:${Number(item?.quantity || 0)}`).join('|'),
    additionalTiers.map((item) => `${item?.tierId || item?.id || ''}:${Number(item?.quantity || 0)}`).join('|'),
    extras.map((item) => `${item?.id || item?.sku || ''}:${Number(item?.quantity || 0)}`).join('|')
  ].join('|');
}

function stableHash16(value) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildAdminPoolPledgeSnapshotMetadata(pledges = []) {
  const normalizedPledges = Array.isArray(pledges) ? pledges : [];
  let latestKnownUpdatedAt = '';
  let latestMs = null;
  for (const pledge of normalizedPledges) {
    const updatedAt = poolPledgeUpdatedAt(pledge);
    const parsed = parsePoolReadModelTimestamp(updatedAt);
    if (parsed !== null && (latestMs === null || parsed > latestMs)) {
      latestMs = parsed;
      latestKnownUpdatedAt = updatedAt;
    }
  }
  const signature = normalizedPledges
    .slice()
    .sort(comparePoolPledges)
    .map(stablePledgeSignature)
    .join('\n');
  return {
    version: ADMIN_POOL_PLEDGE_SNAPSHOT_VERSION,
    latestKnownUpdatedAt,
    watermark: `pledges-v1-${stableHash16(signature)}`
  };
}

export function normalizeAdminPoolPledgeWatermark(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return PLEDGE_WATERMARK_PATTERN.test(normalized) ? normalized : '';
}

export function normalizeAdminPoolPledgesSince(value) {
  const parsed = parsePoolReadModelTimestamp(value);
  return parsed === null ? '' : new Date(parsed).toISOString();
}

export function adminPoolPledgeSnapshotIsUnchanged(snapshot = {}, requestState = {}) {
  const watermark = normalizeAdminPoolPledgeWatermark(requestState.watermark);
  if (watermark) return watermark === String(snapshot.watermark || '');
  const since = normalizeAdminPoolPledgesSince(requestState.since);
  return Boolean(since && since === String(snapshot.latestKnownUpdatedAt || ''));
}

export async function readPoolPledgeBatch(namespace, orderIds = []) {
  const normalizedOrderIds = orderIds
    .map(normalizePoolPledgeOrderId)
    .filter(Boolean);
  const keyNames = normalizedOrderIds.map((orderId) => `pledge:${orderId}`);
  if (!namespace?.get || keyNames.length === 0) return [];

  try {
    const bulkValues = await namespace.get(keyNames, { type: 'json' });
    if (bulkValues && typeof bulkValues.get === 'function') {
      return keyNames.map((keyName) => bulkValues.get(keyName) ?? null);
    }
  } catch {
    // Local and legacy KV adapters may only accept one key at a time.
  }

  const values = [];
  for (const keyName of keyNames) {
    values.push(await namespace.get(keyName, { type: 'json' }));
  }
  return values;
}
