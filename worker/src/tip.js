import { DEFAULT_PLATFORM_TIP_PERCENT, MAX_PLATFORM_TIP_PERCENT } from './provider-config.js';

export { DEFAULT_PLATFORM_TIP_PERCENT, MAX_PLATFORM_TIP_PERCENT };

export function sanitizePlatformTipPercent(value, fallback = DEFAULT_PLATFORM_TIP_PERCENT, maxPercent = MAX_PLATFORM_TIP_PERCENT) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= maxPercent) {
    return parsed;
  }
  return fallback;
}

export function calculatePlatformTip(subtotalCents, tipPercent, maxPercent = MAX_PLATFORM_TIP_PERCENT) {
  const subtotal = Math.max(0, Number(subtotalCents) || 0);
  const percent = sanitizePlatformTipPercent(tipPercent, 0, maxPercent);
  return Math.round(subtotal * (percent / 100));
}

export function derivePlatformTipPercent(subtotalCents, tipAmountCents, fallback = 0, maxPercent = MAX_PLATFORM_TIP_PERCENT) {
  const subtotal = Number(subtotalCents) || 0;
  const tipAmount = Number(tipAmountCents) || 0;
  if (subtotal <= 0 || tipAmount <= 0) {
    return fallback;
  }
  return sanitizePlatformTipPercent(Math.round((tipAmount / subtotal) * 100), fallback, maxPercent);
}
