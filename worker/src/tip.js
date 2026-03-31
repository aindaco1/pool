export const DEFAULT_PLATFORM_TIP_PERCENT = 5;
export const MAX_PLATFORM_TIP_PERCENT = 15;

export function sanitizePlatformTipPercent(value, fallback = DEFAULT_PLATFORM_TIP_PERCENT) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_PLATFORM_TIP_PERCENT) {
    return parsed;
  }
  return fallback;
}

export function calculatePlatformTip(subtotalCents, tipPercent) {
  const subtotal = Math.max(0, Number(subtotalCents) || 0);
  const percent = sanitizePlatformTipPercent(tipPercent, 0);
  return Math.round(subtotal * (percent / 100));
}

export function derivePlatformTipPercent(subtotalCents, tipAmountCents, fallback = 0) {
  const subtotal = Number(subtotalCents) || 0;
  const tipAmount = Number(tipAmountCents) || 0;
  if (subtotal <= 0 || tipAmount <= 0) {
    return fallback;
  }
  return sanitizePlatformTipPercent(Math.round((tipAmount / subtotal) * 100), fallback);
}
