(function () {
  const logger = window.PoolLogger?.createLogger('manage') || {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
  const bootScript =
    document.currentScript ||
    document.querySelector('script[data-manage-page-script="true"]');

  if (!bootScript) {
    return;
  }

  const poolConfig = window.POOL_CONFIG || {};
  const RUNTIME_MESSAGES = poolConfig.i18n?.messages || {};
  const CURRENT_LANG = poolConfig.i18n?.currentLang || document.documentElement.lang || 'en';
  const WORKER_BASE = poolConfig.platform?.workerUrl || poolConfig.workerBase || bootScript.dataset.workerBase || '';
  const PLATFORM_NAME = poolConfig.platform?.name || poolConfig.platformName || bootScript.dataset.platformName || 'The Pool';
  const SALES_TAX_RATE = (() => {
    const parsed = Number(
      poolConfig.pricing?.salesTaxRate ??
      poolConfig.salesTaxRate ??
      bootScript.dataset.salesTaxRate
    );
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.07875;
  })();
  const FLAT_SHIPPING_FEE = (() => {
    const parsed = Number(
      poolConfig.pricing?.flatShippingRate ??
      poolConfig.flatShippingRate ??
      bootScript.dataset.flatShippingRate
    );
    return Math.round((Number.isFinite(parsed) && parsed >= 0 ? parsed : 3) * 100);
  })();
  const FREE_SHIPPING_DEFAULT = (() => {
    const value =
      poolConfig.shipping?.freeShippingDefault ??
      poolConfig.shippingFreeShippingDefault ??
      bootScript.dataset.shippingFreeShippingDefault;
    if (value === true || value === false) return value;
    return String(value || '').trim().toLowerCase() === 'true';
  })();
  const DEFAULT_PLATFORM_TIP_PERCENT = (() => {
    const parsed = Number(
      poolConfig.pricing?.defaultTipPercent ??
      poolConfig.defaultTipPercent ??
      bootScript.dataset.defaultTipPercent
    );
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 5;
  })();
  const MAX_PLATFORM_TIP_PERCENT = (() => {
    const parsed = Number(
      poolConfig.pricing?.maxTipPercent ??
      poolConfig.maxTipPercent ??
      bootScript.dataset.maxTipPercent
    );
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 15;
  })();
  const LIVE_STATS_CACHE_TTL_MS = (() => {
    const parsed = Number(
      poolConfig.cache?.liveStatsTtlSeconds ??
      poolConfig.liveStatsCacheTtlSeconds ??
      bootScript.dataset.liveStatsCacheTtlSeconds
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 5 * 60 * 1000;
  })();
  const LIVE_INVENTORY_CACHE_TTL_MS = (() => {
    const parsed = Number(
      poolConfig.cache?.liveInventoryTtlSeconds ??
      poolConfig.liveInventoryCacheTtlSeconds ??
      bootScript.dataset.liveInventoryCacheTtlSeconds
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 5 * 60 * 1000;
  })();
  const CHECKOUT_UI_MODE = String(
    poolConfig.checkout?.uiMode ||
    poolConfig.checkoutUiMode ||
    bootScript.dataset.checkoutUiMode ||
    'custom'
  ).trim().toLowerCase();
  const WIDTH_PERCENT_CLASS_PREFIX = 'u-width-pct-';
  const LEFT_PERCENT_CLASS_PREFIX = 'u-left-pct-';
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');
  const liveSnapshotRequests = {};
  let allCampaigns = [];
  let pledges = [];
  let isDevMode = false;
  let currentToken = null;
  let activePaymentUpdateMount = null;
  let activePaymentUpdatePledge = null;
  let isSubmittingPaymentUpdate = false;
  let activeManageDialog = null;
  let activeManageDialogCleanup = null;
  let activeManageDialogReturnFocus = null;
  const shippingQuoteState = new Map();
  const shippingOptionUtils = window.PoolShippingOptionUtils || {
    normalizeSelection: function(availableOptions, selectedOption, defaultOption) {
      const options = Array.isArray(availableOptions) ? availableOptions : [];
      const requested = String(selectedOption || '').trim().toLowerCase();
      if (requested && options.some((option) => option?.id === requested)) {
        return requested;
      }

      const normalizedDefault = String(defaultOption || 'standard').trim().toLowerCase() || 'standard';
      if (options.some((option) => option?.id === normalizedDefault)) {
        return normalizedDefault;
      }

      return options[0]?.id || 'standard';
    },
    getSelectedDetails: function(availableOptions, selectedOption, defaultOption) {
      const options = Array.isArray(availableOptions) ? availableOptions : [];
      const resolvedOption = this.normalizeSelection(options, selectedOption, defaultOption);
      return options.find((option) => option?.id === resolvedOption) || null;
    },
    resolveQuote: function(payload, selectedOption, fallbackShippingCents) {
      const firstQuote = Array.isArray(payload?.quotes) ? payload.quotes[0] : null;
      const availableOptions = Array.isArray(firstQuote?.availableOptions) ? firstQuote.availableOptions : [];
      const defaultOption = String(firstQuote?.defaultOption || 'standard').trim().toLowerCase() || 'standard';
      const resolvedOption = this.normalizeSelection(
        availableOptions,
        selectedOption || firstQuote?.selectedOption,
        defaultOption
      );
      const selectedDetails = this.getSelectedDetails(availableOptions, resolvedOption, defaultOption);
      const shippingCents = selectedDetails
        ? Math.max(0, Number(selectedDetails.shippingCents || 0))
        : Math.max(0, Number(payload?.totalShippingCents || fallbackShippingCents || 0));

      return {
        shippingCents,
        source: String(firstQuote?.source || ''),
        availableOptions,
        defaultOption,
        selectedOption: resolvedOption
      };
    },
    shouldShowOptions: function(quote) {
      const source = String(quote?.source || '').trim().toLowerCase();
      const availableOptions = Array.isArray(quote?.availableOptions) ? quote.availableOptions : [];
      const shippingCents = Math.max(0, Number(quote?.shippingCents ?? quote?.amountCents ?? 0));
      return source === 'usps_live' && shippingCents > 0 && availableOptions.length > 1;
    },
    formatChoice: function(option, labelResolver, moneyFormatter) {
      if (!option) return '';
      const label = typeof labelResolver === 'function' ? labelResolver(option.id) : String(option?.label || option?.id || '');
      const delta = Math.max(0, Number(option?.priceDeltaCents || 0));
      if (delta <= 0) return label;
      const formattedDelta = typeof moneyFormatter === 'function' ? moneyFormatter(delta) : String(delta);
      return `${label} (+${formattedDelta})`;
    }
  };

  function getRuntimeMessage(path, fallback) {
    const parts = String(path || '').split('.');
    let value = RUNTIME_MESSAGES;
    for (const part of parts) {
      if (!value || typeof value !== 'object') return fallback;
      value = value[part];
    }
    return typeof value === 'string' && value ? value : fallback;
  }

  function formatRuntimeMessage(path, fallback, replacements) {
    const template = getRuntimeMessage(path, fallback);
    if (!replacements || typeof template !== 'string') return template;
    return template.replace(/%\{(\w+)\}/g, (match, key) => {
      if (!Object.prototype.hasOwnProperty.call(replacements, key)) return match;
      return String(replacements[key]);
    });
  }

  function renderBusyButtonLabel(label, isBusy) {
    const safeLabel = String(label || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    if (!isBusy) return safeLabel;
    return `${safeLabel}<span class="pool-button-spinner" aria-hidden="true"></span>`;
  }

  function applyPercentClass(node, prefix, percent) {
    if (!node) return;
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    Array.from(node.classList).forEach((className) => {
      if (className.indexOf(prefix) === 0) {
        node.classList.remove(className);
      }
    });
    node.classList.add(prefix + clampedPercent);
  }

  function applyDeclarativeStyles(root = document) {
    root.querySelectorAll('[data-progress-width]').forEach((node) => {
      const width = node.getAttribute('data-progress-width');
      if (!width) return;
      applyPercentClass(node, WIDTH_PERCENT_CLASS_PREFIX, parseFloat(width));
    });

    root.querySelectorAll('[data-progress-left]').forEach((node) => {
      const left = node.getAttribute('data-progress-left');
      if (!left) return;
      applyPercentClass(node, LEFT_PERCENT_CLASS_PREFIX, parseFloat(left));
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function appendTextElement(parent, tagName, text, className = '') {
    const node = document.createElement(tagName);
    if (className) {
      node.className = className;
    }
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function formatTipSliderValueText(tipPercent, tipAmountCents) {
    const percent = sanitizeTipPercent(tipPercent, 0);
    return `${percent}% tip, ${formatMoney(Math.max(0, tipAmountCents || 0))}`;
  }

  function getFallbackShippingCentsForPledge(pledge, campaign, hasPhysical) {
    if (!hasPhysical) return 0;
    if (isCampaignFreeShippingEnabled(campaign)) return 0;
    const campaignFallback = Number(campaign?.shipping_fallback_flat_rate);
    if (Number.isFinite(campaignFallback) && campaignFallback >= 0) {
      return Math.round(campaignFallback * 100);
    }
    const existing = Number(pledge?.shipping);
    if (Number.isFinite(existing) && existing >= 0) {
      return existing;
    }
    return FLAT_SHIPPING_FEE;
  }

  function isCampaignFreeShippingEnabled(campaign) {
    if (campaign?.free_shipping === true || campaign?.free_shipping === false) {
      return campaign.free_shipping;
    }
    const normalized = String(campaign?.free_shipping || '').trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return FREE_SHIPPING_DEFAULT;
  }

  function getPledgeShippingQuoteAddress(pledge) {
    const address = pledge?.shippingAddress || {};
    const country = String(address.country || '').trim().toUpperCase();
    const postalCode = String(address.postalCode || address.postal_code || '').trim().toUpperCase();
    if (!country || !postalCode) return null;
    return { country, postalCode };
  }

  function buildSelectedTierEntries(campaign, pledge, tierIdOrAddedTiers, tierQtyOrSupportItems) {
    const tiers = campaign?.tiers || [];
    const isSingleTier = campaign?.single_tier_only === true;
    if (isSingleTier) {
      const selectedTier = tiers.find((tier) => tier.id === tierIdOrAddedTiers);
      if (!selectedTier) return [];
      return [{
        id: selectedTier.id,
        qty: Math.max(1, Number(tierQtyOrSupportItems || pledge?.tierQty || 1)),
        category: selectedTier.category || 'digital'
      }];
    }

    return (Array.isArray(tierQtyOrSupportItems) ? tierQtyOrSupportItems : []).map((selectedTier) => {
      const tier = tiers.find((entry) => entry.id === selectedTier.id);
      return {
        id: selectedTier.id,
        qty: Math.max(1, Number(selectedTier.qty || 1)),
        category: tier?.category || 'digital'
      };
    });
  }

  function buildSelectedSupportItemEntries(campaign, supportItems) {
    const campaignSupportItems = campaign?.support_items || [];
    return (Array.isArray(supportItems) ? supportItems : []).map((supportItem) => {
      const definition = campaignSupportItems.find((entry) => entry.id === supportItem.id);
      return {
        id: supportItem.id,
        amount: Math.max(0, Number(supportItem.amount || 0)),
        category: definition?.category || 'digital'
      };
    }).filter((supportItem) => supportItem.amount > 0);
  }

  function createShippingQuoteSignature(pledge, tierEntries, supportItemEntries) {
    const address = getPledgeShippingQuoteAddress(pledge);
    return JSON.stringify({
      campaignSlug: pledge?.campaignSlug || '',
      address,
      tiers: (tierEntries || []).map((tier) => ({ id: tier.id, qty: tier.qty })),
      supportItems: (supportItemEntries || []).map((supportItem) => ({ id: supportItem.id, amount: supportItem.amount }))
    });
  }

  function getManageShippingOptionLabel(optionId) {
    switch (String(optionId || '').trim().toLowerCase()) {
      case 'signature_required':
        return getRuntimeMessage('manage.shippingOptionSignatureRequired', 'Signature required');
      case 'adult_signature_required':
        return getRuntimeMessage('manage.shippingOptionAdultSignatureRequired', 'Adult signature required');
      case 'standard':
      default:
        return getRuntimeMessage('manage.shippingOptionStandard', 'Standard');
    }
  }

  function formatManageShippingOptionChoice(option) {
    return shippingOptionUtils.formatChoice(option, getManageShippingOptionLabel, formatMoney);
  }

  function resolveManageShippingQuoteResult(payload, selectedShippingOption) {
    return shippingOptionUtils.resolveQuote(payload, selectedShippingOption, 0);
  }

  function shouldShowManageShippingOptions(quotedQuote) {
    return shippingOptionUtils.shouldShowOptions(quotedQuote);
  }

  async function fetchQuotedShippingQuote(pledge, campaign, tierEntries, supportItemEntries, selectedShippingOption = null) {
    const hasPhysical =
      (tierEntries || []).some((tier) => tier.category === 'physical') ||
      (supportItemEntries || []).some((supportItem) => supportItem.category === 'physical');
    if (!hasPhysical) {
      return {
        shippingCents: 0,
        source: 'none',
        availableOptions: [],
        defaultOption: 'standard',
        selectedOption: 'standard'
      };
    }

    const address = getPledgeShippingQuoteAddress(pledge);
    if (!address) {
      return {
        shippingCents: getFallbackShippingCentsForPledge(pledge, campaign, true),
        source: 'fallback_flat_rate',
        availableOptions: [],
        defaultOption: 'standard',
        selectedOption: 'standard'
      };
    }

    const signature = createShippingQuoteSignature(pledge, tierEntries, supportItemEntries);
    const cached = shippingQuoteState.get(signature);
    if (cached && Number.isFinite(cached.shippingCents)) {
      return resolveManageShippingQuoteResult(cached, selectedShippingOption);
    }

    const items = tierEntries.map((tier) => ({
      id: `${pledge.campaignSlug}__${tier.id}`,
      quantity: tier.qty
    })).concat((supportItemEntries || []).map((supportItem) => ({
      id: `${pledge.campaignSlug}__support__${supportItem.id}`,
      amount: supportItem.amount
    })));

    try {
      const response = await fetch(`${WORKER_BASE}/shipping/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: pledge.campaignSlug,
          items,
          shippingAddress: address
        })
      });

      if (!response.ok) {
        throw new Error(`Shipping quote failed with ${response.status}`);
      }

      const data = await response.json();
      shippingQuoteState.set(signature, data);
      return resolveManageShippingQuoteResult(data, selectedShippingOption);
    } catch (_error) {
      return {
        shippingCents: getFallbackShippingCentsForPledge(pledge, campaign, true),
        source: 'fallback_flat_rate',
        availableOptions: [],
        defaultOption: 'standard',
        selectedOption: 'standard'
      };
    }
  }

  function isFocusableNode(node) {
    return node instanceof HTMLElement &&
      !node.hidden &&
      node.getAttribute('aria-hidden') !== 'true' &&
      !node.closest('[hidden],[aria-hidden="true"]');
  }

  function getFocusableNodes(container) {
    if (!(container instanceof HTMLElement)) return [];

    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => {
      if (!isFocusableNode(node)) return false;
      if ('disabled' in node && node.disabled) return false;
      return true;
    });
  }

  function restoreManageDialogFocus() {
    const target = activeManageDialogReturnFocus;
    if (!(target instanceof HTMLElement)) return;
    if (!target.isConnected) return;
    window.setTimeout(() => {
      if (!(target instanceof HTMLElement) || !target.isConnected) return;
      try {
        target.focus();
      } catch (_error) {}
    }, 0);
  }

  function lockManageDialogBackground(dialog) {
    const pushNode = function(node) {
      if (!(node instanceof HTMLElement)) return;
      node.setAttribute('data-pool-manage-dialog-lock', 'true');
      node.setAttribute('data-pool-manage-prev-aria-hidden', node.getAttribute('aria-hidden') ?? '__none__');
      node.setAttribute('data-pool-manage-prev-inert', node.inert ? 'true' : 'false');
      node.setAttribute('aria-hidden', 'true');
      node.inert = true;
    };

    Array.from(document.body.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      if (child.contains(dialog)) return;
      pushNode(child);
    });

    const container = dialog.parentElement;
    if (container instanceof HTMLElement) {
      Array.from(container.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || child === dialog) return;
        pushNode(child);
      });
    }

    return function unlockManageDialogBackground() {
      document.querySelectorAll('[data-pool-manage-dialog-lock="true"]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const ariaHidden = node.getAttribute('data-pool-manage-prev-aria-hidden');
        const inert = node.getAttribute('data-pool-manage-prev-inert');
        if (ariaHidden === '__none__' || ariaHidden === null) {
          node.removeAttribute('aria-hidden');
        } else {
          node.setAttribute('aria-hidden', ariaHidden);
        }
        node.inert = inert === 'true';
        node.removeAttribute('data-pool-manage-dialog-lock');
        node.removeAttribute('data-pool-manage-prev-aria-hidden');
        node.removeAttribute('data-pool-manage-prev-inert');
      });
    };
  }

  function teardownManageDialog(restoreFocus = false) {
    if (typeof activeManageDialogCleanup === 'function') {
      activeManageDialogCleanup();
    }
    activeManageDialogCleanup = null;
    activeManageDialog = null;
    if (restoreFocus) {
      restoreManageDialogFocus();
    }
    activeManageDialogReturnFocus = null;
  }

  function focusManageDialog(dialog, preferredSelector) {
    const preferred =
      (preferredSelector ? dialog.querySelector(preferredSelector) : null) ||
      getFocusableNodes(dialog)[0] ||
      dialog;

    if (!(preferred instanceof HTMLElement)) return;
    try {
      preferred.focus();
    } catch (_error) {}
  }

  function activateManageDialog(dialog, options = {}) {
    teardownManageDialog(false);
    activeManageDialog = dialog;
    activeManageDialogReturnFocus = options.returnFocusTarget instanceof HTMLElement
      ? options.returnFocusTarget
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const unlockBackground = lockManageDialogBackground(dialog);
    const handleKeydown = function(event) {
      if (activeManageDialog !== dialog || dialog.hidden) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        if (dialog.id === 'payment-update-modal') {
          closePaymentUpdateModal();
        } else {
          hideConfirmModal();
        }
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusableNodes(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeydown, true);
    activeManageDialogCleanup = function() {
      document.removeEventListener('keydown', handleKeydown, true);
      unlockBackground();
    };

    focusManageDialog(dialog, options.initialFocusSelector);
  }

  function calculateTax(subtotalCents) {
    return Math.round(subtotalCents * SALES_TAX_RATE);
  }

  function getSalesTaxLabel() {
    return `Sales tax (${(SALES_TAX_RATE * 100).toFixed(3).replace(/\.?0+$/, '')}%)`;
  }

  function sanitizeTipPercent(value, fallback = DEFAULT_PLATFORM_TIP_PERCENT) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_PLATFORM_TIP_PERCENT) {
      return parsed;
    }
    return fallback;
  }

  function calculatePlatformTip(subtotalCents, tipPercent) {
    return Math.round((Math.max(0, subtotalCents || 0) * sanitizeTipPercent(tipPercent, 0)) / 100);
  }

  function getPledgeTipAmount(pledge) {
    if (pledge.tipAmount !== undefined && pledge.tipAmount !== null) {
      return pledge.tipAmount;
    }
    return calculatePlatformTip(getPledgeSubtotal(pledge), pledge.tipPercent || 0);
  }

  function getPledgeTipPercent(pledge) {
    if (pledge.tipPercent !== undefined && pledge.tipPercent !== null) {
      return sanitizeTipPercent(pledge.tipPercent, 0);
    }
    const subtotal = getPledgeSubtotal(pledge);
    const tipAmount = getPledgeTipAmount(pledge);
    if (subtotal <= 0 || tipAmount <= 0) return 0;
    return sanitizeTipPercent(Math.round((tipAmount / subtotal) * 100), 0);
  }

  function getPledgeSubtotal(pledge) {
    if (pledge.subtotal !== undefined) {
      return pledge.subtotal;
    }
    return pledge.amount;
  }

  function mergePledgesByCampaign(pledgeList) {
    const byCampaign = {};

    for (const pledge of pledgeList) {
      const key = pledge.campaignSlug;

      if (!byCampaign[key]) {
        byCampaign[key] = {
          ...pledge,
          orderIds: [pledge.orderId],
          supportItems: pledge.supportItems ? pledge.supportItems.map((s) => ({ ...s })) : [],
          additionalTiers: []
        };

        if (pledge.tierId) {
          byCampaign[key].additionalTiers.push({
            id: pledge.tierId.split('__').pop(),
            qty: pledge.tierQty || 1,
            orderId: pledge.orderId
          });
        }

        if (pledge.additionalTiers) {
          for (const tier of pledge.additionalTiers) {
            byCampaign[key].additionalTiers.push({
              ...tier,
              orderId: pledge.orderId
            });
          }
        }
      } else {
        const merged = byCampaign[key];
        merged.orderIds.push(pledge.orderId);
        merged.subtotal = (merged.subtotal || 0) + (pledge.subtotal || pledge.amount || 0);
        merged.tax = (merged.tax || 0) + (pledge.tax || 0);
        merged.tipAmount = (merged.tipAmount || 0) + getPledgeTipAmount(pledge);
        const prevShipping = merged.shipping || 0;
        merged.shipping = Math.max(prevShipping, pledge.shipping || 0);
        merged.amount =
          (merged.amount || 0) +
          (pledge.amount || 0) -
          prevShipping -
          (pledge.shipping || 0) +
          merged.shipping;

        if (pledge.tierId) {
          const tierId = pledge.tierId.split('__').pop();
          const existingTier = merged.additionalTiers.find((t) => t.id === tierId);
          if (existingTier) {
            existingTier.qty = (existingTier.qty || 1) + (pledge.tierQty || 1);
          } else {
            merged.additionalTiers.push({
              id: tierId,
              qty: pledge.tierQty || 1,
              orderId: pledge.orderId
            });
          }
        }

        if (pledge.additionalTiers) {
          for (const tier of pledge.additionalTiers) {
            const existingTier = merged.additionalTiers.find((addedTier) => addedTier.id === tier.id);
            if (existingTier) {
              existingTier.qty = (existingTier.qty || 1) + (tier.qty || 1);
            } else {
              merged.additionalTiers.push({
                ...tier,
                orderId: pledge.orderId
              });
            }
          }
        }

        if (pledge.supportItems) {
          if (!merged.supportItems) merged.supportItems = [];
          for (const item of pledge.supportItems) {
            const existing = merged.supportItems.find((supportItem) => supportItem.id === item.id);
            if (existing) {
              existing.amount = (existing.amount || 0) + (item.amount || 0);
            } else {
              merged.supportItems.push({ ...item });
            }
          }
        }

        merged.customAmount = (merged.customAmount || 0) + (pledge.customAmount || 0);

        const statusPriority = { cancelled: 0, payment_failed: 1, charged: 2, active: 3 };
        if (statusPriority[pledge.pledgeStatus] < statusPriority[merged.pledgeStatus]) {
          merged.pledgeStatus = pledge.pledgeStatus;
        }

        merged.canModify = merged.canModify && pledge.canModify;
        merged.canCancel = merged.canCancel && pledge.canCancel;
        merged.canUpdatePaymentMethod =
          merged.canUpdatePaymentMethod && pledge.canUpdatePaymentMethod;
        merged.deadlinePassed = merged.deadlinePassed || pledge.deadlinePassed;
      }
    }

    const result = Object.values(byCampaign).map((merged) => {
      if (merged.additionalTiers.length > 0) {
        merged.tierId = merged.additionalTiers[0].id;
        merged.tierQty = merged.additionalTiers[0].qty;
        merged.additionalTiers = merged.additionalTiers.slice(1);
      }
      merged.tipPercent = getPledgeTipPercent({
        subtotal: merged.subtotal || 0,
        tipAmount: merged.tipAmount || 0
      });
      return merged;
    });

    return result;
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    currentToken = params.get('t');
    isDevMode = params.has('dev');

    try {
      const campaignsRes = await fetch('/api/campaigns.json');
      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        allCampaigns = data.campaigns || [];
      }

      if (isDevMode) {
        logger.debug('DEV MODE: Using mock pledge data');
        currentToken = 'dev-token';
        pledges = [
          {
            orderId: 'dev-order-1',
            email: 'test@example.com',
            campaignSlug: 'hand-relations',
            pledgeStatus: 'active',
            subtotal: 555,
            tax: 44,
            amount: 599,
            tierId: 'frame-slot',
            tierName: 'Buy 1 Frame',
            tierQty: 2,
            supportItems: [{ id: 'location-scouting', amount: 25 }],
            customAmount: 30,
            canModify: true,
            canCancel: true,
            canUpdatePaymentMethod: true,
            deadlinePassed: false
          },
          {
            orderId: 'dev-order-1b',
            email: 'test@example.com',
            campaignSlug: 'hand-relations',
            pledgeStatus: 'active',
            subtotal: 300,
            tax: 24,
            amount: 324,
            tierId: 'digital-download',
            tierName: 'Digital Download',
            tierQty: 1,
            supportItems: [{ id: 'location-scouting', amount: 10 }],
            customAmount: 5,
            canModify: true,
            canCancel: true,
            canUpdatePaymentMethod: true,
            deadlinePassed: false
          },
          {
            orderId: 'dev-order-2',
            email: 'test@example.com',
            campaignSlug: 'common-ground',
            pledgeStatus: 'active',
            subtotal: 4100,
            tax: 323,
            amount: 4423,
            tierId: 'screening-ticket',
            tierName: 'Community Screening',
            tierQty: 2,
            additionalTiers: [{ id: 'production-photo', qty: 1 }],
            supportItems: [],
            customAmount: 0,
            canModify: true,
            canCancel: true,
            canUpdatePaymentMethod: true,
            deadlinePassed: false
          },
          {
            orderId: 'dev-order-3',
            email: 'test@example.com',
            campaignSlug: 'test-deadline-passed',
            pledgeStatus: 'active',
            subtotal: 2500,
            tax: 197,
            amount: 2697,
            tierId: 'test-tier',
            tierName: 'Test Tier',
            tierQty: 1,
            supportItems: [],
            customAmount: 0,
            canModify: false,
            canCancel: false,
            canUpdatePaymentMethod: true,
            deadlinePassed: true
          },
          {
            orderId: 'dev-order-4',
            email: 'test@example.com',
            campaignSlug: 'test-completed-campaign',
            pledgeStatus: 'charged',
            subtotal: 5000,
            tax: 394,
            amount: 5394,
            tierId: 'producer-credit',
            tierName: 'Producer Credit',
            tierQty: 1,
            supportItems: [],
            customAmount: 0,
            canModify: false,
            canCancel: false,
            canUpdatePaymentMethod: false,
            deadlinePassed: true,
            chargedAt: '2025-12-15T07:00:00Z'
          },
          {
            orderId: 'dev-order-5',
            email: 'test@example.com',
            campaignSlug: 'test-payment-failed',
            pledgeStatus: 'payment_failed',
            subtotal: 3000,
            tax: 236,
            amount: 3236,
            tierId: 'digital-download',
            tierName: 'Digital Download',
            tierQty: 1,
            supportItems: [],
            customAmount: 0,
            canModify: false,
            canCancel: false,
            canUpdatePaymentMethod: true,
            deadlinePassed: true,
            lastPaymentError: 'Your card was declined.'
          }
        ];
      } else {
        if (!currentToken) {
          showError(getRuntimeMessage('manage.noPledgeTokenProvided', 'No pledge token provided.'));
          return;
        }

        const res = await fetch(`${WORKER_BASE}/pledges?token=${encodeURIComponent(currentToken)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || getRuntimeMessage('manage.failedToLoadPledges', 'Failed to load pledges'));
        }
        pledges = await res.json();
      }

      pledges = mergePledgesByCampaign(pledges);
      renderPledges();
    } catch (err) {
      showError(err.message);
    }
  }

  function getCampaignData(slug) {
    return allCampaigns.find((campaign) => campaign.slug === slug);
  }

  function parseDateValue(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }

  function getCampaignRecencyTimestamp(campaign) {
    if (!campaign) return null;
    return (
      parseDateValue(campaign.start_date) ||
      parseDateValue(campaign.date) ||
      parseDateValue(campaign.end_date) ||
      null
    );
  }

  function getPledgeFallbackTimestamp(pledge) {
    const directTimestamp =
      parseDateValue(pledge.createdAt) ||
      parseDateValue(pledge.created_at) ||
      parseDateValue(pledge.updatedAt) ||
      parseDateValue(pledge.updated_at);
    if (directTimestamp) return directTimestamp;

    const orderId = pledge.orderId || '';
    const orderMatch = orderId.match(/pledge-(\d{10,})-/);
    if (orderMatch) {
      return parseInt(orderMatch[1], 10);
    }

    return 0;
  }

  function sortPledgesByProjectRecency(pledgeList) {
    return [...pledgeList].sort((a, b) => {
      const campaignA = getCampaignData(a.campaignSlug);
      const campaignB = getCampaignData(b.campaignSlug);
      const timeA = getCampaignRecencyTimestamp(campaignA) || getPledgeFallbackTimestamp(a);
      const timeB = getCampaignRecencyTimestamp(campaignB) || getPledgeFallbackTimestamp(b);

      if (timeA !== timeB) return timeB - timeA;

      const titleA = (campaignA?.title || a.campaignSlug || '').toLowerCase();
      const titleB = (campaignB?.title || b.campaignSlug || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });
  }

  function isClosedPledgeForDisplay(pledge, campaign) {
    const campaignState = liveStats[pledge.campaignSlug]?.state || campaign?.state;
    return (
      pledge.deadlinePassed === true ||
      campaignState === 'post' ||
      pledge.pledgeStatus === 'charged' ||
      pledge.pledgeStatus === 'cancelled' ||
      pledge.pledgeStatus === 'payment_failed'
    );
  }

  function renderPledgeSection(title, entries) {
    if (!entries.length) return '';
    const localizedTitle = title === 'Active'
      ? getRuntimeMessage('manage.sectionActive', 'Active')
      : getRuntimeMessage('manage.sectionClosed', 'Closed');
    const showHeader = title !== 'Active';
    return `
      <section class="manage-pledge__section">
        ${showHeader
          ? `
            <div class="manage-pledge__section-header">
              <h2>${escapeHtml(localizedTitle)}</h2>
            </div>
          `
          : ''}
        <div class="manage-pledge__grid">
          ${entries.map(({ pledge, campaign, index }) => renderPledgeCard(pledge, campaign, index)).join('')}
        </div>
      </section>
    `;
  }

  const liveInventory = {};
  const liveStats = {};

  function readCachedValue(key, ttlMs) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (Date.now() - Number(parsed.timestamp || 0) > ttlMs) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed.data ?? null;
    } catch (_error) {
      return null;
    }
  }

  function writeCachedValue(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (_error) {}
  }

  function invalidateCampaignCaches(campaignSlug) {
    if (!campaignSlug) return;

    delete liveStats[campaignSlug];
    delete liveInventory[campaignSlug];

    try {
      localStorage.removeItem(`pool_stats_${campaignSlug}`);
      localStorage.removeItem(`pool_inventory_${campaignSlug}`);
    } catch (_error) {}

    if (typeof window.invalidateStatsCache === 'function') {
      window.invalidateStatsCache(campaignSlug);
    }
    if (typeof window.invalidateInventoryCache === 'function') {
      window.invalidateInventoryCache(campaignSlug);
    }
  }

  async function fetchLiveCampaignSnapshot(campaignSlug) {
    const cachedStats = readCachedValue(`pool_stats_${campaignSlug}`, LIVE_STATS_CACHE_TTL_MS);
    const cachedInventory = readCachedValue(`pool_inventory_${campaignSlug}`, LIVE_INVENTORY_CACHE_TTL_MS);

    if (cachedStats && cachedInventory) {
      liveStats[campaignSlug] = cachedStats;
      liveInventory[campaignSlug] = cachedInventory.tiers || {};
      return {
        stats: cachedStats,
        inventory: cachedInventory
      };
    }

    if (liveSnapshotRequests[campaignSlug]) {
      return liveSnapshotRequests[campaignSlug];
    }

    liveSnapshotRequests[campaignSlug] = fetch(`${WORKER_BASE}/live/${campaignSlug}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch live campaign data for ${campaignSlug}`);
        }
        const data = await res.json();
        if (data?.stats) {
          liveStats[campaignSlug] = data.stats;
          writeCachedValue(`pool_stats_${campaignSlug}`, data.stats);
        }
        if (data?.inventory) {
          liveInventory[campaignSlug] = data.inventory.tiers || {};
          writeCachedValue(`pool_inventory_${campaignSlug}`, data.inventory);
        }
        return data;
      })
      .finally(() => {
        delete liveSnapshotRequests[campaignSlug];
      });

    return liveSnapshotRequests[campaignSlug];
  }

  async function fetchLiveStats(campaignSlug) {
    if (liveStats[campaignSlug]) {
      return liveStats[campaignSlug];
    }
    const cached = readCachedValue(`pool_stats_${campaignSlug}`, LIVE_STATS_CACHE_TTL_MS);
    if (cached) {
      liveStats[campaignSlug] = cached;
      return cached;
    }
    try {
      const snapshot = await fetchLiveCampaignSnapshot(campaignSlug);
      if (snapshot?.stats) {
        return snapshot.stats;
      }
    } catch (e) {
      logger.error('Failed to fetch combined live data for', campaignSlug, e);
    }
    try {
      const res = await fetch(`${WORKER_BASE}/stats/${campaignSlug}`);
      if (res.ok) {
        const data = await res.json();
        liveStats[campaignSlug] = data;
        writeCachedValue(`pool_stats_${campaignSlug}`, data);
        return data;
      }
    } catch (e) {
      logger.error('Failed to fetch stats for', campaignSlug, e);
    }
    return {};
  }

  async function fetchLiveInventory(campaignSlug) {
    if (liveInventory[campaignSlug]) {
      return liveInventory[campaignSlug];
    }
    const cached = readCachedValue(`pool_inventory_${campaignSlug}`, LIVE_INVENTORY_CACHE_TTL_MS);
    if (cached?.tiers) {
      liveInventory[campaignSlug] = cached.tiers;
      return liveInventory[campaignSlug];
    }
    try {
      const snapshot = await fetchLiveCampaignSnapshot(campaignSlug);
      if (snapshot?.inventory?.tiers) {
        return snapshot.inventory.tiers;
      }
    } catch (e) {
      logger.error('Failed to fetch combined live inventory for', campaignSlug, e);
    }
    try {
      const res = await fetch(`${WORKER_BASE}/inventory/${campaignSlug}`);
      if (res.ok) {
        const data = await res.json();
        liveInventory[campaignSlug] = data.tiers || {};
        writeCachedValue(`pool_inventory_${campaignSlug}`, data);
        return liveInventory[campaignSlug];
      }
    } catch (e) {
      logger.error('Failed to fetch inventory for', campaignSlug, e);
    }
    return {};
  }

  function getTierRemaining(campaignSlug, tierId, pledgedQty = 0) {
    const inventory = liveInventory[campaignSlug];
    if (inventory && inventory[tierId]) {
      return inventory[tierId].remaining + pledgedQty;
    }
    return Infinity;
  }

  function showError(message) {
    document.getElementById('pledge-loading').hidden = true;
    document.getElementById('pledge-error').hidden = false;
    document.getElementById('pledge-error-message').textContent = message;
  }

  function getPaymentUpdateModal() {
    return document.getElementById('payment-update-modal');
  }

  function resetPaymentUpdateUi() {
    const modal = getPaymentUpdateModal();
    if (!modal) return;

    const error = document.getElementById('payment-update-error');
    const emailError = document.getElementById('payment-update-email-error');
    const paymentMount = document.getElementById('payment-update-payment');
    const confirmButton = document.getElementById('payment-update-confirm');

    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    if (emailError) {
      emailError.hidden = true;
      emailError.textContent = '';
    }
    const emailInput = document.getElementById('payment-update-email');
    if (emailInput instanceof HTMLInputElement) {
      emailInput.setAttribute('aria-invalid', 'false');
    }
    if (paymentMount) paymentMount.innerHTML = '';
    if (confirmButton) {
      confirmButton.disabled = true;
      confirmButton.textContent = 'Save payment method';
    }

    isSubmittingPaymentUpdate = false;
  }

  function teardownPaymentUpdateMount() {
    if (!activePaymentUpdateMount || typeof activePaymentUpdateMount.unmount !== 'function') {
      activePaymentUpdateMount = null;
      return;
    }

    try {
      activePaymentUpdateMount.unmount();
    } catch (_error) {}
    activePaymentUpdateMount = null;
  }

  function closePaymentUpdateModal() {
    const modal = getPaymentUpdateModal();
    if (!modal) return;
    if (isSubmittingPaymentUpdate) return;
    teardownPaymentUpdateMount();
    activePaymentUpdatePledge = null;
    modal.hidden = true;
    resetPaymentUpdateUi();
    teardownManageDialog(true);
  }

  function setPaymentUpdateEmailError(message) {
    const node = document.getElementById('payment-update-email-error');
    const input = document.getElementById('payment-update-email');
    if (!node) return;
    const nextMessage = String(message || '');
    node.textContent = nextMessage;
    node.hidden = !nextMessage;
    if (input instanceof HTMLInputElement) {
      input.setAttribute('aria-invalid', nextMessage ? 'true' : 'false');
    }
  }

  function setPaymentUpdateError(message) {
    const node = document.getElementById('payment-update-error');
    if (!node) return;
    node.textContent = String(message || '');
    node.hidden = !message;
  }

  function shouldShowPaymentUpdateLevelStripeError(errorLike) {
    const message = String(errorLike?.error?.message || errorLike?.message || '').trim().toLowerCase();
    if (!message) return true;

    return !(
      message.includes('incomplete') ||
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('enter a card') ||
      message.includes('card number') ||
      message.includes('security code') ||
      message.includes('expiration')
    );
  }

  function syncPaymentUpdateConfirmButton(canConfirm = false) {
    const confirmButton = document.getElementById('payment-update-confirm');
    if (!confirmButton) return;
    confirmButton.disabled = isSubmittingPaymentUpdate || !canConfirm;
    confirmButton.classList.toggle('is-busy', isSubmittingPaymentUpdate);
    confirmButton.setAttribute('aria-busy', isSubmittingPaymentUpdate ? 'true' : 'false');
    confirmButton.innerHTML = renderBusyButtonLabel(
      isSubmittingPaymentUpdate
        ? getRuntimeMessage('manage.savingPaymentMethod', 'Saving payment method...')
        : getRuntimeMessage('cart.savePaymentMethod', 'Save payment method'),
      isSubmittingPaymentUpdate
    );
  }

  async function syncPaymentUpdateEmailToStripe(email, options = {}) {
    const trimmedEmail = String(email || '').trim();
    if (!trimmedEmail) {
      const message = getRuntimeMessage('manage.emailRequired', 'Enter an email address to continue.');
      setPaymentUpdateEmailError(message);
      return {
        ok: false,
        message
      };
    }

    if (!activePaymentUpdateMount || typeof activePaymentUpdateMount.updateEmail !== 'function') {
      setPaymentUpdateEmailError('');
      return { ok: true };
    }

    const result = await activePaymentUpdateMount.updateEmail(trimmedEmail);
    const message = result?.error?.message || '';
    setPaymentUpdateEmailError(message);
    if (message && options.raise) {
      throw new Error(message);
    }
    return {
      ok: !message,
      message
    };
  }

  async function openCustomPaymentUpdateModal(pledge, payload) {
    const modal = getPaymentUpdateModal();
    if (!modal) throw new Error(getRuntimeMessage('manage.paymentUpdateError', 'There was an error updating your payment method.'));
    if (!window.PoolStripeCheckoutSidecar || typeof window.PoolStripeCheckoutSidecar.mount !== 'function') {
      throw new Error(getRuntimeMessage('manage.paymentUpdateError', 'There was an error updating your payment method.'));
    }

    teardownPaymentUpdateMount();
    resetPaymentUpdateUi();
    activePaymentUpdatePledge = pledge;
    modal.hidden = false;
    activateManageDialog(modal, {
      initialFocusSelector: '#payment-update-email'
    });

    const emailInput = document.getElementById('payment-update-email');
    const paymentMount = document.getElementById('payment-update-payment');

    if (emailInput) {
      emailInput.value = pledge.email || '';
    }

    if (typeof window.PoolStripeCheckoutSidecar.ensureStripeJs === 'function') {
      await window.PoolStripeCheckoutSidecar.ensureStripeJs();
    }

    activePaymentUpdateMount = await window.PoolStripeCheckoutSidecar.mount({
      publishableKey: payload.publishableKey,
      clientSecret: payload.clientSecret,
      paymentContainer: paymentMount,
      onChange: function(event) {
        syncPaymentUpdateConfirmButton(Boolean(event?.session?.canConfirm) || Boolean(activePaymentUpdateMount));
      }
    });
    syncPaymentUpdateConfirmButton(true);
  }

  async function startPaymentMethodUpdate(pledge) {
    if (isDevMode) {
      alert('DEV MODE: Would redirect to payment update page');
      return;
    }

    const res = await fetch(`${WORKER_BASE}/pledge/payment-method/start`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken, preferredLang: CURRENT_LANG })
    });
    if (!res.ok) throw new Error('Failed to start payment update');
    const payload = await res.json();

    if (payload?.checkoutUiMode === 'custom') {
      await openCustomPaymentUpdateModal(pledge, payload);
      return;
    }

    if (!payload?.url) {
      throw new Error('No payment update URL returned.');
    }
    window.location.href = payload.url;
  }

  function formatMoney(cents) {
    return (
      '$' +
      (cents / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    );
  }

  function formatPrice(price) {
    return (
      '$' +
      Number(price).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    );
  }

  function formatMoneyShort(amount) {
    if (amount >= 1000000) {
      const value = amount / 1000000;
      return '$' + (value === Math.floor(value) ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '')) + 'M';
    }
    if (amount >= 1000) {
      const value = amount / 1000;
      return '$' + (value === Math.floor(value) ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '')) + 'K';
    }
    return '$' + Math.floor(amount);
  }

  function renderProgressBar(campaign) {
    if (!campaign) return '';
    const pledged = campaign.pledged_amount || 0;
    const goal = campaign.goal_amount || 0;
    const stretchGoals = campaign.stretch_goals || [];
    const stretchHidden = campaign.stretch_hidden !== false;

    let maxThreshold = goal;
    let showFinalMarker = false;

    if (stretchGoals.length > 0) {
      stretchGoals.forEach((stretchGoal) => {
        if (stretchGoal.threshold > maxThreshold) maxThreshold = stretchGoal.threshold;
      });
    } else if (pledged > goal) {
      maxThreshold = pledged;
      showFinalMarker = true;
    }

    let pct = maxThreshold > 0 ? Math.round((pledged / maxThreshold) * 100) : 0;
    let exceededMax = false;
    if (pct > 100) {
      exceededMax = true;
      pct = 100;
    }

    const goalPct = maxThreshold > 0 ? Math.round((goal / maxThreshold) * 100) : 100;
    const goalMet = pledged >= goal;

    const oneThird = Math.floor(goal / 3);
    const twoThirds = Math.floor((goal * 2) / 3);
    const oneThirdPct = maxThreshold > 0 ? Math.round((oneThird / maxThreshold) * 100) : 0;
    const twoThirdsPct = maxThreshold > 0 ? Math.round((twoThirds / maxThreshold) * 100) : 0;
    const oneThirdMet = pledged >= oneThird;
    const twoThirdsMet = pledged >= twoThirds;

    let stretchMarkersHtml = '';
    if (stretchGoals.length > 0) {
      let prevMet = goalMet;
      stretchGoals.forEach((stretchGoal) => {
        const stretchPct =
          maxThreshold > 0 ? Math.round((stretchGoal.threshold / maxThreshold) * 100) : 0;
        const stretchAchieved = pledged >= stretchGoal.threshold;
        const stretchUnlocked = !stretchHidden || prevMet;
        stretchMarkersHtml += `
          <div class="progress-marker progress-marker--stretch${stretchAchieved ? ' progress-marker--achieved' : ''}${!stretchUnlocked ? ' progress-marker--locked' : ''}" data-progress-left="${stretchPct}">
            <span class="progress-marker__dot"></span>
            <span class="progress-marker__label">
              <span class="progress-marker__amount">${formatMoneyShort(stretchGoal.threshold)}</span>
              <span class="progress-marker__desc">${stretchUnlocked ? escapeHtml(stretchGoal.title) : '???'}</span>
            </span>
          </div>
        `;
        prevMet = stretchAchieved;
      });
    }

    return `
      <div class="progress-wrap progress-wrap--compact">
        <div class="progress-bar${exceededMax ? ' progress-bar--exceeded' : ''}">
          <span data-progress-width="${pct}"></span>
          <div class="progress-marker progress-marker--milestone${oneThirdMet ? ' progress-marker--achieved' : ''}" data-progress-left="${oneThirdPct}">
            <span class="progress-marker__dot"></span>
            <span class="progress-marker__label">
              <span class="progress-marker__amount">${formatMoneyShort(oneThird)}</span>
              <span class="progress-marker__desc">1/3</span>
            </span>
          </div>
          <div class="progress-marker progress-marker--milestone${twoThirdsMet ? ' progress-marker--achieved' : ''}" data-progress-left="${twoThirdsPct}">
            <span class="progress-marker__dot"></span>
            <span class="progress-marker__label">
              <span class="progress-marker__amount">${formatMoneyShort(twoThirds)}</span>
              <span class="progress-marker__desc">2/3</span>
            </span>
          </div>
          <div class="progress-marker progress-marker--goal${goalMet ? ' progress-marker--achieved' : ''}" data-progress-left="${goalPct}">
            <span class="progress-marker__dot"></span>
            <span class="progress-marker__label">
              <span class="progress-marker__amount">${formatMoneyShort(goal)}</span>
              <span class="progress-marker__desc">Goal!</span>
            </span>
          </div>
          ${showFinalMarker
            ? `
              <div class="progress-marker progress-marker--final progress-marker--achieved" data-progress-left="100">
                <span class="progress-marker__dot"></span>
                <span class="progress-marker__label">
                  <span class="progress-marker__amount">${formatMoneyShort(pledged)}</span>
                  <span class="progress-marker__desc">Final</span>
                </span>
              </div>
            `
            : ''}
          ${stretchMarkersHtml}
        </div>
        <div class="progress-meta">
          <strong>${formatPrice(pledged)}</strong> of ${formatPrice(goal)}
        </div>
      </div>
    `;
  }

  function renderCountdown(campaign) {
    if (!campaign || campaign.state === 'post') return '';

    const isUpcoming = campaign.state === 'upcoming';
    const heading = isUpcoming
      ? getRuntimeMessage('manage.startsIn', 'Starts in')
      : getRuntimeMessage('manage.endsIn', 'Ends in');
    const targetStr = isUpcoming ? campaign.start_date : campaign.goal_deadline;
    if (!targetStr) return '';

    const id = `countdown-${campaign.slug}`;
    let targetDate;
    if (isUpcoming && campaign.start_date) {
      targetDate = new Date(campaign.start_date + 'T00:00:00');
    } else {
      targetDate = new Date(targetStr + 'T23:59:59');
    }

    const now = new Date();
    const diff = Math.max(0, targetDate - now);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    const pad = (n) => String(n).padStart(2, '0');

    if (diff <= 0) {
      return `
        <div class="pledge-countdown" id="${id}">
          <span class="pledge-countdown__ended">${isUpcoming ? getRuntimeMessage('manage.campaignLive', 'Campaign Live!') : getRuntimeMessage('manage.ended', 'Ended')}</span>
        </div>
      `;
    }

    return `
      <div class="pledge-countdown" id="${id}" data-deadline="${targetStr}" data-start="${campaign.start_date || ''}" data-state="${campaign.state}">
        <span class="pledge-countdown__heading">${heading}</span>
        <div class="pledge-countdown__timer">
          <span class="pledge-countdown__unit" data-unit="days">${pad(days)}</span><span class="pledge-countdown__sep">:</span>
          <span class="pledge-countdown__unit" data-unit="hours">${pad(hours)}</span><span class="pledge-countdown__sep">:</span>
          <span class="pledge-countdown__unit" data-unit="mins">${pad(mins)}</span><span class="pledge-countdown__sep">:</span>
          <span class="pledge-countdown__unit" data-unit="secs">${pad(secs)}</span>
        </div>
      </div>
    `;
  }

  function initCountdown(campaignSlug) {
    const el = document.getElementById(`countdown-${campaignSlug}`);
    if (!el) return;

    const deadlineStr = el.dataset.deadline;
    const startStr = el.dataset.start;
    const state = el.dataset.state;

    let targetDate;
    if (state === 'upcoming' && startStr) {
      targetDate = new Date(startStr + 'T00:00:00');
    } else {
      targetDate = new Date(deadlineStr + 'T23:59:59');
    }

    function update() {
      const now = new Date();
      const diff = targetDate - now;

      if (diff <= 0) {
        el.innerHTML =
          state === 'upcoming'
            ? `<span class="pledge-countdown__ended">${escapeHtml(getRuntimeMessage('manage.campaignLive', 'Campaign Live!'))}</span>`
            : `<span class="pledge-countdown__ended">${escapeHtml(getRuntimeMessage('manage.ended', 'Ended'))}</span>`;
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      el.querySelector('[data-unit="days"]').textContent = String(days).padStart(2, '0');
      el.querySelector('[data-unit="hours"]').textContent = String(hours).padStart(2, '0');
      el.querySelector('[data-unit="mins"]').textContent = String(mins).padStart(2, '0');
      el.querySelector('[data-unit="secs"]').textContent = String(secs).padStart(2, '0');

      setTimeout(update, 1000);
    }

    update();
  }

  let pendingConfirmCallback = null;

  function showConfirmModal(message, details, onConfirm, options = {}) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-message').textContent = message;
    const detailsNode = document.getElementById('confirm-modal-details');
    detailsNode.replaceChildren();
    if (details instanceof Node) {
      detailsNode.appendChild(details);
    } else if (details) {
      detailsNode.textContent = String(details);
    }
    pendingConfirmCallback = onConfirm;
    modal.hidden = false;
    activateManageDialog(modal, {
      initialFocusSelector: '#confirm-modal-cancel',
      returnFocusTarget: options.returnFocusTarget
    });
  }

  function hideConfirmModal() {
    document.getElementById('confirm-modal').hidden = true;
    pendingConfirmCallback = null;
    teardownManageDialog(true);
  }

  document.getElementById('confirm-modal-cancel')?.addEventListener('click', hideConfirmModal);
  document
    .getElementById('confirm-modal')
    ?.querySelector('.modal__backdrop')
    ?.addEventListener('click', hideConfirmModal);
  document.getElementById('confirm-modal-confirm')?.addEventListener('click', () => {
    if (pendingConfirmCallback) pendingConfirmCallback();
    hideConfirmModal();
  });
  document.querySelectorAll('[data-payment-update-close]').forEach((node) => {
    node.addEventListener('click', closePaymentUpdateModal);
  });
    document.getElementById('payment-update-email')?.addEventListener('change', (event) => {
      syncPaymentUpdateEmailToStripe(event.target.value).catch((error) => {
      setPaymentUpdateError(error.message || getRuntimeMessage('manage.emailValidationFailed', 'Email validation failed.'));
    });
  });
  document.getElementById('payment-update-confirm')?.addEventListener('click', async () => {
    if (!activePaymentUpdateMount || typeof activePaymentUpdateMount.confirm !== 'function') return;
    const emailInput = document.getElementById('payment-update-email');
    const confirmButton = document.getElementById('payment-update-confirm');

    try {
      isSubmittingPaymentUpdate = true;
      setPaymentUpdateError('');
      syncPaymentUpdateConfirmButton(true);

      const emailResult = await syncPaymentUpdateEmailToStripe(emailInput?.value || '', { raise: true });
      if (!emailResult.ok) {
        isSubmittingPaymentUpdate = false;
        syncPaymentUpdateConfirmButton(true);
        return;
      }

      const result = await activePaymentUpdateMount.confirm();
      if (result?.type === 'error' || result?.error) {
        if (shouldShowPaymentUpdateLevelStripeError(result)) {
          throw new Error(result?.error?.message || getRuntimeMessage('manage.stripeSaveError', 'Stripe could not save the updated payment method.'));
        }

        isSubmittingPaymentUpdate = false;
        setPaymentUpdateError('');
        syncPaymentUpdateConfirmButton(true);
        return;
      }

      if (confirmButton) confirmButton.textContent = getRuntimeMessage('manage.saved', 'Saved');
      setTimeout(() => {
        closePaymentUpdateModal();
        window.location.reload();
      }, 500);
    } catch (error) {
      isSubmittingPaymentUpdate = false;
      setPaymentUpdateError(error.message || getRuntimeMessage('manage.paymentUpdateError', 'There was an error updating your payment method.'));
      syncPaymentUpdateConfirmButton(true);
    }
  });

  async function renderPledges() {
    document.getElementById('pledge-loading').hidden = true;
    const container = document.getElementById('pledges-list');
    container.hidden = false;
    pledges = sortPledgesByProjectRecency(pledges);

    if (pledges.length === 0) {
      container.innerHTML = `<p class="manage-pledge__empty">${escapeHtml(getRuntimeMessage('manage.noActivePledges', 'No active pledges found.'))}</p>`;
      return;
    }

    const campaignSlugs = [...new Set(pledges.map((pledge) => pledge.campaignSlug))];
    await Promise.all([
      ...campaignSlugs.map((slug) => fetchLiveInventory(slug)),
      ...campaignSlugs.map((slug) => fetchLiveStats(slug))
    ]);

    const entries = pledges.map((pledge, index) => ({
      pledge,
      campaign: getCampaignData(pledge.campaignSlug),
      index
    }));
    const activeEntries = entries.filter(
      ({ pledge, campaign }) => !isClosedPledgeForDisplay(pledge, campaign)
    );
    const closedEntries = entries.filter(({ pledge, campaign }) =>
      isClosedPledgeForDisplay(pledge, campaign)
    );

    container.innerHTML = [
      renderPledgeSection('Active', activeEntries),
      renderPledgeSection('Closed', closedEntries)
    ]
      .filter(Boolean)
      .join('');
    applyDeclarativeStyles(container);

    pledges.forEach((pledge, index) => {
      const campaign = getCampaignData(pledge.campaignSlug);
      if (campaign) {
        initCountdown(campaign.slug);
      }
      if (pledge.pledgeStatus === 'active') {
        setupPledgeActions(pledge, campaign, index);
      } else if (pledge.pledgeStatus === 'payment_failed') {
        setupPaymentFailedActions(pledge, index);
      }
    });
  }

  function renderPledgeCard(pledge, campaign, index) {
    const isActive = pledge.pledgeStatus === 'active';
    const isCharged = pledge.pledgeStatus === 'charged';
    const isCancelled = pledge.pledgeStatus === 'cancelled';
    const isPaymentFailed = pledge.pledgeStatus === 'payment_failed';
    const deadlinePassed = pledge.deadlinePassed === true;
    const isLocked = isActive && deadlinePassed;
    const statusLabel = isLocked
      ? getRuntimeMessage('manage.statusLocked', 'locked')
      : getRuntimeMessage(
          `manage.status${String(pledge.pledgeStatus || '')
            .replace(/(^|_)([a-z])/g, (_m, _prefix, letter) => letter.toUpperCase())}`,
          pledge.pledgeStatus
        );
    const statusClass = isLocked ? 'locked' : pledge.pledgeStatus;
    const currentTierId = pledge.tierId?.split('__').pop();
    const tiers = campaign?.tiers || [];
    const isSingleTier = campaign?.single_tier_only === true;

    const preStats = liveStats[pledge.campaignSlug];
    const preLivePledgedAmount = preStats
      ? preStats.pledgedAmount / 100
      : campaign?.pledged_amount || 0;
    const preCampaignFunded = campaign && preLivePledgedAmount >= campaign.goal_amount;
    const preIsLive = (preStats?.state || campaign?.state) === 'live';
    const preIsPost = (preStats?.state || campaign?.state) === 'post';

    const supportItems = preIsLive
      ? campaign?.support_items || []
      : campaign?.support_items?.filter((item) => item.late_support) || [];

    const stats = liveStats[pledge.campaignSlug];
    const livePledgedAmount = stats ? stats.pledgedAmount / 100 : campaign?.pledged_amount || 0;

    const campaignWithLiveStats = campaign
      ? {
          ...campaign,
          pledged_amount: livePledgedAmount,
          state: stats?.state || campaign.state
        }
      : null;

    const campaignFunded = campaign && livePledgedAmount >= campaign.goal_amount;
    const isLive = campaignWithLiveStats?.state === 'live';
    const isPost = campaignWithLiveStats?.state === 'post';
    const allowsCustomLateSupport = campaign?.custom_late_support === true;

    let tiersHtml = '';
    let supportItemsHtml = '';
    let customAmountHtml = '';
    let tipHtml = '';
    let actionsHtml = '';

    if (isActive && tiers.length > 0) {
      if (isSingleTier) {
        tiersHtml = `
          <div class="pledge-card__tiers" id="tier-section-${index}">
            <h2>${escapeHtml(getRuntimeMessage('manage.selectYourTier', 'Select Your Tier'))}</h2>
            <div class="tier-options">
              ${tiers
                .map((tier) => {
                  const isCurrent = tier.id === currentTierId;
                  const currentQty = isCurrent ? pledge.tierQty || 1 : 1;
                  const liveRemaining = getTierRemaining(
                    pledge.campaignSlug,
                    tier.id,
                    isCurrent ? currentQty : 0
                  );
                  const hasLimit = liveRemaining !== Infinity;
                  const isDisabled = !isCurrent && (tier.sold_out || (hasLimit && liveRemaining <= 0));
                  const isStackable = tier.stackable === true;
                  const maxQty = hasLimit ? liveRemaining : 99;
                  return `
                    <label class="tier-option ${isCurrent ? 'tier-option--selected' : ''} ${isDisabled ? 'tier-option--disabled' : ''}" data-tier-id="${tier.id}">
                      <input type="radio" name="tier-${index}" value="${tier.id}"
                        data-price="${tier.price}"
                        data-stackable="${isStackable}"
                        ${isCurrent ? 'checked' : ''}
                        ${isDisabled ? 'disabled' : ''}>
                      <div class="tier-option__content">
                        <strong>${escapeHtml(tier.name)}</strong>
                        <span class="tier-option__price">${formatPrice(tier.price)}${isStackable ? ' each' : ''}</span>
                        ${tier.description ? `<p class="tier-option__desc">${escapeHtml(tier.description)}</p>` : ''}
                        ${isDisabled ? `<span class="tier-option__badge tier-option__badge--soldout">${escapeHtml(getRuntimeMessage('manage.soldOut', 'Sold Out'))}</span>` : ''}
                        ${
                          isStackable && !isDisabled
                            ? `
                          <div class="tier-option__quantity" data-tier="${tier.id}">
                            <button type="button" class="qty-btn qty-minus" data-tier="${tier.id}">−</button>
                            <input type="number" class="qty-input" data-tier="${tier.id}" value="${currentQty}" min="1" max="${maxQty}">
                            <button type="button" class="qty-btn qty-plus" data-tier="${tier.id}">+</button>
                          </div>
                        `
                            : ''
                        }
                      </div>
                    </label>
                  `;
                })
                .join('')}
            </div>
          </div>
        `;
      } else {
        const existingTiers = {};
        if (currentTierId) {
          existingTiers[currentTierId] = pledge.tierQty || 1;
        }
        if (pledge.additionalTiers) {
          pledge.additionalTiers.forEach((tier) => {
            existingTiers[tier.id] = tier.qty || 1;
          });
        }

        tiersHtml = `
          <div class="pledge-card__tiers" id="tier-section-${index}">
            <h2>${escapeHtml(getRuntimeMessage('manage.addMoreTiers', 'Add More Tiers'))}</h2>
            <div class="tier-options">
              ${tiers
                .map((tier) => {
                  const isPledged = Object.prototype.hasOwnProperty.call(existingTiers, tier.id);
                  const pledgedQty = existingTiers[tier.id] || 1;
                  const liveRemaining = getTierRemaining(
                    pledge.campaignSlug,
                    tier.id,
                    isPledged ? pledgedQty : 0
                  );
                  const hasLimit = liveRemaining !== Infinity;
                  const isDisabled = tier.sold_out || (hasLimit && liveRemaining <= 0 && !isPledged);
                  const isStackable = tier.stackable === true;
                  const maxQty = hasLimit ? liveRemaining : 99;
                  return `
                    <label class="tier-option ${isPledged ? 'tier-option--selected' : ''} ${isDisabled && !isPledged ? 'tier-option--disabled' : ''}" data-tier-id="${tier.id}">
                      <input type="checkbox" name="add-tier-${index}" value="${tier.id}"
                        data-price="${tier.price}"
                        data-stackable="${isStackable}"
                        data-pledged="${isPledged}"
                        data-pledged-qty="${pledgedQty}"
                        ${isPledged ? 'checked' : ''}
                        ${isDisabled && !isPledged ? 'disabled' : ''}>
                      <div class="tier-option__content">
                        <strong>${escapeHtml(tier.name)}</strong>
                        <span class="tier-option__price">${formatPrice(tier.price)}${isStackable ? ' each' : ''}</span>
                        ${tier.description ? `<p class="tier-option__desc">${escapeHtml(tier.description)}</p>` : ''}
                        ${isPledged ? `<span class="tier-option__badge">${escapeHtml(getRuntimeMessage('manage.pledged', 'Pledged'))}</span>` : ''}
                        ${isDisabled && !isPledged ? `<span class="tier-option__badge tier-option__badge--soldout">${escapeHtml(getRuntimeMessage('manage.soldOut', 'Sold Out'))}</span>` : ''}
                        ${
                          isStackable && !isDisabled
                            ? `
                          <div class="tier-option__quantity" data-tier="${tier.id}" ${!isPledged ? 'hidden' : ''}>
                            <button type="button" class="qty-btn qty-minus" data-tier="${tier.id}">−</button>
                            <input type="number" class="qty-input" data-tier="${tier.id}" value="${isPledged ? pledgedQty : 1}" min="1" max="${maxQty}" data-original-qty="${isPledged ? pledgedQty : 0}">
                            <button type="button" class="qty-btn qty-plus" data-tier="${tier.id}">+</button>
                          </div>
                        `
                            : ''
                        }
                      </div>
                    </label>
                  `;
                })
                .join('')}
            </div>
          </div>
        `;
      }
    }

    if (isActive && supportItems.length > 0) {
      const pledgedSupport = pledge.supportItems || [];
      const supportStats = liveStats[pledge.campaignSlug] || {};
      const liveSupportItems = supportStats.supportItems || {};
      supportItemsHtml = `
        <div class="pledge-card__support" id="support-section-${index}">
          <h2>${escapeHtml(getRuntimeMessage('manage.supportPhase', 'Support a Phase'))}</h2>
          <div class="support-options">
            ${supportItems
              .map((item) => {
                const liveCurrentCents = liveSupportItems[item.id] || 0;
                const liveCurrent = liveCurrentCents / 100;
                const itemCurrent = liveCurrentCents > 0 ? liveCurrent : item.current;
                const remaining = item.target - itemCurrent;
                const currentAmount =
                  pledgedSupport.find((supportItem) => supportItem.id === item.id)?.amount || 0;
                const progressPct =
                  item.target > 0 ? Math.min(100, Math.round((itemCurrent / item.target) * 100)) : 0;
                return `
                  <div class="support-option-item ${currentAmount > 0 ? 'support-option-item--active' : ''}" data-support-id="${escapeAttribute(item.id)}">
                    <div class="support-option-item__info">
                      <div class="support-option-item__header">
                        <strong>${escapeHtml(item.label)}</strong>
                        <span class="support-option-item__amount">${formatPrice(itemCurrent)} / ${formatPrice(item.target)}</span>
                      </div>
                      <div class="support-option-item__progress">
                        <span data-progress-width="${progressPct}"></span>
                      </div>
                      ${item.need ? `<p class="support-option-item__desc">${escapeHtml(item.need)}</p>` : ''}
                    </div>
                    <div class="support-option-item__input">
                      <span class="input-prefix">$</span>
                      <input type="number"
                        name="support-amount-${index}"
                        data-support-id="${escapeAttribute(item.id)}"
                        data-label="${escapeAttribute(item.label)}"
                        data-current="${currentAmount}"
                        value="${currentAmount || ''}"
                        placeholder="${remaining > 0 ? remaining : '0'}"
                        min="0"
                        max="${remaining + currentAmount}"
                        step="1"
                        ${remaining <= 0 ? 'disabled' : ''}>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    const currentCustomAmount = pledge.customAmount || 0;
    if (isActive && (isLive || (isPost && allowsCustomLateSupport && campaignFunded))) {
      customAmountHtml = `
        <div class="pledge-card__support" id="custom-amount-section-${index}">
          <h2>${escapeHtml(getRuntimeMessage('manage.supportAtYourDiscretion', 'Support at Your Discretion'))}</h2>
          <div class="support-options">
            <div class="support-option-item ${currentCustomAmount > 0 ? 'support-option-item--active' : ''}">
              <div class="support-option-item__info">
                <p class="support-option-item__desc">${escapeHtml(getRuntimeMessage('manage.customSupportDescription', 'Contribute any amount — no reward attached.'))}</p>
              </div>
              <div class="support-option-item__input">
                <span class="input-prefix">$</span>
                <input type="number"
                  id="custom-amount-input-${index}"
                  name="custom-amount-${index}"
                  data-current="${currentCustomAmount}"
                  value="${currentCustomAmount || ''}"
                  min="0"
                  step="1"
                  placeholder="25">
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const currentTipPercent = getPledgeTipPercent(pledge);
    if (isActive) {
      tipHtml = `
        <div class="pledge-card__tip" id="tip-section-${index}">
          <div class="pledge-card__tip-header">
            <h3 id="tip-heading-${index}">${escapeHtml(formatRuntimeMessage('manage.tipHeading', 'Tip %{platform}', { platform: PLATFORM_NAME }))}</h3>
            <span class="pledge-card__tip-amount" id="tip-amount-label-${index}">${formatMoney(getPledgeTipAmount(pledge))}</span>
          </div>
          <p class="pledge-card__tip-copy" id="tip-copy-${index}">${escapeHtml(getRuntimeMessage('manage.tipCopy', 'Optional support for platform maintenance. This does not count toward the campaign goal.'))}</p>
          <div class="pledge-card__tip-controls">
            <input type="range" min="0" max="${MAX_PLATFORM_TIP_PERCENT}" step="1" value="${currentTipPercent}" id="tip-percent-${index}" data-current="${currentTipPercent}" aria-labelledby="tip-heading-${index}" aria-describedby="tip-copy-${index} tip-percent-label-${index}" aria-valuetext="${escapeAttribute(formatTipSliderValueText(currentTipPercent, getPledgeTipAmount(pledge)))}">
            <span class="pledge-card__tip-percent" id="tip-percent-label-${index}">${currentTipPercent}%</span>
          </div>
        </div>
      `;
    }

    if (isActive) {
      const canModifyPledge = pledge.canModify !== false && !deadlinePassed;
      const canCancelPledge = pledge.canCancel !== false && !deadlinePassed;

      if (deadlinePassed) {
        actionsHtml = `
          <div class="pledge-card__actions" id="actions-${index}">
            <button class="btn btn--secondary" data-action="payment" data-index="${index}">${escapeHtml(getRuntimeMessage('manage.updateCard', 'Update Card'))}</button>
          </div>
          <div class="pledge-card__footer" id="footer-${index}">
            <div class="pledge-card__notice pledge-card__notice--deadline">
              <p>⏰ ${escapeHtml(getRuntimeMessage('manage.deadlinePassedNotice', 'Campaign deadline has passed. Your pledge is locked and will be charged if the campaign reaches its goal. You can still update your payment method if needed.'))}</p>
            </div>
          </div>
        `;
      } else {
        actionsHtml = `
          <div class="pledge-card__actions" id="actions-${index}">
            <button class="btn btn--secondary" data-action="payment" data-index="${index}">${escapeHtml(getRuntimeMessage('manage.updateCard', 'Update Card'))}</button>
            ${canModifyPledge ? `<button class="btn" data-action="save" data-index="${index}" disabled>${escapeHtml(getRuntimeMessage('manage.noChanges', 'No Changes'))}</button>` : ''}
          </div>
          <div class="pledge-card__error" id="error-${index}" hidden></div>
          <div class="pledge-card__footer" id="footer-${index}">
            <div class="pledge-card__notice">
              <p>${escapeHtml(getRuntimeMessage('manage.pledgeNotice', 'How pledging works: Your card will be stored securely but not charged now. You\'ll only be charged if the campaign reaches its goal.'))}</p>
            </div>
            ${canCancelPledge ? `<button class="btn-text btn-text--danger" data-action="cancel" data-index="${index}">${escapeHtml(getRuntimeMessage('manage.cancelPledge', 'Cancel Pledge'))}</button>` : ''}
          </div>
          ${
            canCancelPledge
              ? `
            <div class="pledge-card__cancel-section" id="cancel-section-${index}" hidden>
              <div class="cancel-section__warning">
                <p><strong>${escapeHtml(getRuntimeMessage('manage.cancelTitle', 'Cancel your pledge?'))}</strong></p>
                <p>${escapeHtml(getRuntimeMessage('manage.cancelBody', 'This action cannot be undone. Your payment method will not be charged.'))}</p>
              </div>
              <div class="cancel-section__actions">
                <button class="btn btn--secondary" data-action="cancel-back" data-index="${index}">${escapeHtml(getRuntimeMessage('manage.keepPledge', 'Keep Pledge'))}</button>
                <button class="btn btn--danger" data-action="cancel-confirm" data-index="${index}">${escapeHtml(getRuntimeMessage('manage.confirmCancellation', 'Confirm Cancellation'))}</button>
              </div>
            </div>
            `
              : ''
          }
        `;
      }
    }

    let statusNotice = '';
    if (isCharged) {
      const chargedDate = pledge.chargedAt
        ? new Date(pledge.chargedAt).toLocaleDateString(CURRENT_LANG, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
        : null;
      statusNotice = `
        <div class="pledge-card__charged">
          <p>✓ ${escapeHtml(getRuntimeMessage('manage.chargedSuccess', 'Successfully charged'))}${chargedDate ? ` ${escapeHtml(formatRuntimeMessage('manage.chargedOn', 'on %{date}', { date: chargedDate }))}` : ''}. ${escapeHtml(getRuntimeMessage('manage.chargedThanks', 'Thank you for your support!'))}</p>
        </div>
      `;
    } else if (isPaymentFailed) {
      statusNotice = `
        <div class="pledge-card__payment-failed">
          <p><strong>⚠️ ${escapeHtml(getRuntimeMessage('manage.statusPaymentFailed', 'Payment Failed'))}.</strong> ${escapeHtml(getRuntimeMessage('manage.paymentFailedNotice', 'Payment failed. Please update your payment method to complete your pledge.'))}</p>
          <button class="btn btn--small" data-action="payment" data-index="${index}">${escapeHtml(getRuntimeMessage('manage.updatePaymentMethod', 'Update Payment Method'))}</button>
        </div>
      `;
    } else if (isCancelled) {
      statusNotice = `<div class="pledge-card__cancelled"><p>${escapeHtml(getRuntimeMessage('manage.pledgeCancelledNotice', 'This pledge has been cancelled.'))}</p></div>`;
    }

    const cardClasses = ['pledge-card'];
    if (isCharged) cardClasses.push('pledge-card--charged');
    if (isCancelled) cardClasses.push('pledge-card--cancelled');
    if (isPaymentFailed) cardClasses.push('pledge-card--payment-failed');

    return `
      <div class="${cardClasses.join(' ')}" data-pledge-index="${index}" data-original-amount="${pledge.amount}" data-current-tier="${currentTierId || ''}" data-current-tier-qty="${pledge.tierQty || 1}" data-campaign-slug="${campaign?.slug || pledge.campaignSlug}">
        <div class="pledge-card__header">
          <div class="pledge-card__header-top">
            <a href="/campaigns/${pledge.campaignSlug}/" class="pledge-card__campaign">${escapeHtml(campaign?.title || pledge.campaignSlug)}</a>
            <span class="pledge-card__status status--${statusClass}">${statusLabel}</span>
          </div>
          ${renderCountdown(campaignWithLiveStats)}
          ${renderProgressBar(campaignWithLiveStats)}
        </div>

        ${tiersHtml}
        ${supportItemsHtml}
        ${customAmountHtml}

        <div class="pledge-card__financials">
          ${tipHtml}
          <div class="pledge-card__summary">
            ${(() => {
              const subtotal = getPledgeSubtotal(pledge);
              const tipAmount = getPledgeTipAmount(pledge);
              const tipPercent = getPledgeTipPercent(pledge);
              const shipping = pledge.shipping || 0;
              const tax = calculateTax(subtotal);
              const total = subtotal + tax + shipping + tipAmount;
              return `
                <div class="pledge-summary__row">
                  <span class="label">${escapeHtml(getRuntimeMessage('manage.subtotal', 'Subtotal'))}</span>
                  <span class="value" id="subtotal-${index}">${formatMoney(subtotal)}</span>
                </div>
                <div class="pledge-summary__row pledge-summary__row--tip" id="tip-row-${index}" ${tipAmount > 0 ? '' : 'hidden'}>
                  <span class="label">${PLATFORM_NAME} tip (<span id="tip-row-percent-${index}">${tipPercent}</span>%)</span>
                  <span class="value" id="tip-${index}">${formatMoney(tipAmount)}</span>
                </div>
                <div class="pledge-summary__row pledge-summary__row--tax">
                  <span class="label">${getSalesTaxLabel()}</span>
                  <span class="value" id="tax-${index}">${formatMoney(tax)}</span>
                </div>
                <div class="pledge-summary__row pledge-summary__row--shipping" id="shipping-row-${index}" ${shipping > 0 ? '' : 'hidden'}>
                  <span class="label">${escapeHtml(getRuntimeMessage('manage.shipping', 'Shipping'))}</span>
                  <span class="value" id="shipping-${index}">${formatMoney(shipping)}</span>
                </div>
                <div class="pledge-summary__row pledge-summary__row--shipping-option" id="shipping-option-row-${index}" hidden>
                  <label class="label" for="shipping-option-${index}">${escapeHtml(getRuntimeMessage('manage.shippingOption', 'Delivery option'))}</label>
                  <select class="value pledge-summary__shipping-option-select" id="shipping-option-${index}" data-shipping-option-index="${index}"></select>
                </div>
                <div class="pledge-summary__total">
                  <span class="label">${escapeHtml(getRuntimeMessage('manage.total', 'Total'))}</span>
                  <span class="value" id="amount-${index}">${formatMoney(total)}</span>
                </div>
              `;
            })()}
            <div class="pledge-summary__change" id="change-${index}" hidden>
              <span id="change-direction-${index}"></span>
              <span id="change-amount-${index}"></span>
            </div>
          </div>
        </div>

        ${actionsHtml}
        ${statusNotice}
      </div>
    `;
  }

  function setupPaymentFailedActions(pledge, index) {
    const card = document.querySelector(`[data-pledge-index="${index}"]`);
    if (!card) return;

    card.querySelectorAll('[data-action="payment"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await startPaymentMethodUpdate(pledge);
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    });
  }

  function setupPledgeActions(pledge, campaign, index) {
    const card = document.querySelector(`[data-pledge-index="${index}"]`);
    if (!card) return;

    const deadlinePassed = pledge.deadlinePassed === true;
    const isLocked = pledge.pledgeStatus === 'active' && deadlinePassed;
    const isSingleTier = campaign?.single_tier_only === true;
    const currentTierId = pledge.tierId?.split('__').pop();
    const currentCustomAmountVal = pledge.customAmount || 0;
    const currentTipPercent = getPledgeTipPercent(pledge);
    let selectedTierId = currentTierId;
    let selectedSupportItems = [];
    let selectedCustomAmount = currentCustomAmountVal;
    let selectedTipPercent = currentTipPercent;
    let selectedShippingOption = String(pledge.shippingOption || 'standard').trim().toLowerCase() || 'standard';
    let selectedTierQty = pledge.tierQty || 1;
    let selectedAddTiers = [];
    const primaryOrderId = pledge.orderIds ? pledge.orderIds[0] : pledge.orderId;

    if (!isSingleTier) {
      const tiers = campaign?.tiers || [];
      if (currentTierId) {
        const tier = tiers.find((entry) => entry.id === currentTierId);
        if (tier) {
          selectedAddTiers.push({
            id: currentTierId,
            price: tier.price,
            qty: pledge.tierQty || 1,
            pledgedQty: pledge.tierQty || 1,
            isPledged: true,
            orderId: primaryOrderId
          });
        }
      }
      if (pledge.additionalTiers) {
        for (const addTier of pledge.additionalTiers) {
          const tier = tiers.find((entry) => entry.id === addTier.id);
          if (tier) {
            selectedAddTiers.push({
              id: addTier.id,
              price: tier.price,
              qty: addTier.qty || 1,
              pledgedQty: addTier.qty || 1,
              isPledged: true,
              orderId: addTier.orderId || primaryOrderId
            });
          }
        }
      }
    }

    const originalTiers = selectedAddTiers.map((tier) => ({ ...tier }));
    const refreshSummary = function() {
      if (isSingleTier) {
        updatePledgeSummary(
          index,
          pledge,
          campaign,
          selectedTierId,
          selectedTierQty,
          selectedSupportItems,
          selectedCustomAmount,
          currentCustomAmountVal,
          selectedTipPercent,
          selectedShippingOption
        );
        return;
      }

      updatePledgeSummary(
        index,
        pledge,
        campaign,
        null,
        selectedAddTiers,
        selectedSupportItems,
        selectedCustomAmount,
        currentCustomAmountVal,
        selectedTipPercent,
        selectedShippingOption
      );
    };

    if (isLocked) {
      card
        .querySelectorAll(
          '.tier-option input, .qty-btn, .qty-input, .support-option-item input, .pledge-card__tip input'
        )
        .forEach((control) => {
          control.disabled = true;
        });
      return;
    }

    if (isSingleTier) {
      card.querySelectorAll(`input[name="tier-${index}"]`).forEach((input) => {
        input.addEventListener('change', (e) => {
          card.querySelectorAll('.tier-option').forEach((opt) => {
            if (opt.querySelector(`input[name="tier-${index}"]`)) {
              opt.classList.remove('tier-option--selected');
            }
          });
          e.target.closest('.tier-option').classList.add('tier-option--selected');
          selectedTierId = e.target.value;
          const qtyInput = card.querySelector(`.qty-input[data-tier="${selectedTierId}"]`);
          selectedTierQty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
          refreshSummary();
        });
      });

      function selectTierById(tierId) {
        const radio = card.querySelector(`input[name="tier-${index}"][value="${tierId}"]`);
        if (radio && !radio.checked && !radio.disabled) {
          radio.checked = true;
          card.querySelectorAll('.tier-option').forEach((opt) => {
            if (opt.querySelector(`input[name="tier-${index}"]`)) {
              opt.classList.remove('tier-option--selected');
            }
          });
          radio.closest('.tier-option').classList.add('tier-option--selected');
          selectedTierId = tierId;
        }
      }

      card.querySelectorAll('.qty-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const tierId = e.target.dataset.tier;
          selectTierById(tierId);
          const input = card.querySelector(`.qty-input[data-tier="${tierId}"]`);
          const max = parseInt(input.max, 10) || 10;
          const val = parseInt(input.value, 10) || 1;

          if (e.target.classList.contains('qty-minus') && val > 1) {
            input.value = String(val - 1);
          } else if (e.target.classList.contains('qty-plus') && val < max) {
            input.value = String(val + 1);
          }

          selectedTierQty = parseInt(input.value, 10) || 1;
          refreshSummary();
        });
      });

      card.querySelectorAll('.qty-input').forEach((input) => {
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('change', (e) => {
          const tierId = e.target.dataset.tier;
          const max = parseInt(e.target.max, 10) || 10;
          let val = parseInt(e.target.value, 10) || 1;
          if (val < 1) val = 1;
          if (val > max) {
            val = max;
            alert(`Only ${max} available for this tier.`);
          }
          e.target.value = String(val);
          selectTierById(tierId);
          selectedTierQty = val;
          refreshSummary();
        });
      });
    } else {
      card.querySelectorAll(`input[name="add-tier-${index}"]:not(:disabled)`).forEach((input) => {
        input.addEventListener('change', (e) => {
          const tierOption = e.target.closest('.tier-option');
          const qtyContainer = tierOption.querySelector('.tier-option__quantity');

          if (e.target.checked) {
            tierOption.classList.add('tier-option--selected');
            if (qtyContainer) qtyContainer.hidden = false;
          } else {
            tierOption.classList.remove('tier-option--selected');
            if (qtyContainer) qtyContainer.hidden = true;
          }

          recalculateAddTiers();
        });
      });

      function autoCheckTier(tierId) {
        const checkbox = card.querySelector(`input[name="add-tier-${index}"][value="${tierId}"]`);
        if (checkbox && !checkbox.checked) {
          checkbox.checked = true;
          checkbox.closest('.tier-option').classList.add('tier-option--selected');
        }
      }

      card.querySelectorAll('.qty-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const tierId = e.target.dataset.tier;
          const input = card.querySelector(`.qty-input[data-tier="${tierId}"]`);
          const max = parseInt(input.max, 10) || 10;
          const val = parseInt(input.value, 10) || 1;

          if (e.target.classList.contains('qty-minus') && val > 1) {
            input.value = String(val - 1);
          } else if (e.target.classList.contains('qty-plus') && val < max) {
            input.value = String(val + 1);
          }

          autoCheckTier(tierId);
          recalculateAddTiers();
        });
      });

      card.querySelectorAll('.qty-input').forEach((input) => {
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('change', (e) => {
          const tierId = e.target.dataset.tier;
          const max = parseInt(e.target.max, 10) || 10;
          let val = parseInt(e.target.value, 10) || 1;
          if (val < 1) val = 1;
          if (val > max) {
            val = max;
            alert(`Only ${max} available for this tier.`);
          }
          e.target.value = String(val);
          autoCheckTier(tierId);
          recalculateAddTiers();
        });
      });

      function recalculateAddTiers() {
        selectedAddTiers = Array.from(card.querySelectorAll(`input[name="add-tier-${index}"]:checked`)).map(
          (checkbox) => {
            const tierId = checkbox.value;
            const price = parseFloat(checkbox.dataset.price);
            const isStackable = checkbox.dataset.stackable === 'true';
            const isPledged = checkbox.dataset.pledged === 'true';
            const pledgedQty = parseInt(checkbox.dataset.pledgedQty, 10) || 0;
            let qty = 1;
            if (isStackable) {
              const qtyInput = card.querySelector(`.qty-input[data-tier="${tierId}"]`);
              qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
            }
            return { id: tierId, price, qty, pledgedQty, isPledged };
          }
        );
        refreshSummary();
      }
    }

    card.querySelectorAll(`input[name="support-amount-${index}"]`).forEach((input) => {
      input.addEventListener('input', (e) => {
        const newVal = parseFloat(e.target.value) || 0;
        const currentVal = parseFloat(e.target.dataset.current) || 0;

        if (newVal > 0 || currentVal > 0) {
          e.target.closest('.support-option-item').classList.add('support-option-item--active');
        } else {
          e.target.closest('.support-option-item').classList.remove('support-option-item--active');
        }

        selectedSupportItems = Array.from(card.querySelectorAll(`input[name="support-amount-${index}"]`))
          .filter((field) => {
            const newAmount = parseFloat(field.value) || 0;
            const currentAmount = parseFloat(field.dataset.current) || 0;
            return newAmount !== currentAmount;
          })
          .map((field) => ({
            id: field.dataset.supportId,
            label: field.dataset.label,
            amount: parseFloat(field.value),
            currentAmount: parseFloat(field.dataset.current) || 0
          }));

        refreshSummary();
      });
    });

    const customAmountInput = card.querySelector(`input[name="custom-amount-${index}"]`);
    if (customAmountInput) {
      customAmountInput.addEventListener('input', (e) => {
        const newVal = parseFloat(e.target.value) || 0;
        selectedCustomAmount = newVal;

        if (newVal > 0 || currentCustomAmountVal > 0) {
          e.target.closest('.support-option-item').classList.add('support-option-item--active');
        } else {
          e.target.closest('.support-option-item').classList.remove('support-option-item--active');
        }

        refreshSummary();
      });
    }

    const tipInput = card.querySelector(`#tip-percent-${index}`);
    if (tipInput) {
      tipInput.addEventListener('input', (e) => {
        selectedTipPercent = parseInt(e.target.value, 10) || 0;
        const tipPercentLabel = document.getElementById(`tip-percent-label-${index}`);
        if (tipPercentLabel) {
          tipPercentLabel.textContent = `${selectedTipPercent}%`;
        }
        e.target.setAttribute(
          'aria-valuetext',
          formatTipSliderValueText(
            selectedTipPercent,
            calculatePlatformTip(getPledgeSubtotal(pledge), selectedTipPercent)
          )
        );
        refreshSummary();
      });
    }

    card.querySelector(`#shipping-option-${index}`)?.addEventListener('change', (e) => {
      selectedShippingOption = String(e.target.value || 'standard').trim().toLowerCase() || 'standard';
      refreshSummary();
    });

    card.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      document.getElementById(`footer-${index}`).hidden = true;
      document.getElementById(`actions-${index}`).hidden = true;
      document.getElementById(`cancel-section-${index}`).hidden = false;
    });

    card.querySelector('[data-action="cancel-back"]')?.addEventListener('click', () => {
      document.getElementById(`cancel-section-${index}`).hidden = true;
      document.getElementById(`footer-${index}`).hidden = false;
      document.getElementById(`actions-${index}`).hidden = false;
    });

    card.querySelector('[data-action="cancel-confirm"]')?.addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = getRuntimeMessage('manage.cancelling', 'Cancelling...');

      if (isDevMode) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        alert('DEV MODE: Pledge cancelled (simulated)');
        window.location.reload();
        return;
      }

      try {
        const orderIds = pledge.orderIds || [pledge.orderId];
        const results = await Promise.all(
          orderIds.map((orderId) =>
            fetch(`${WORKER_BASE}/pledge/cancel`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: currentToken, orderId, preferredLang: CURRENT_LANG })
            })
          )
        );
        const failed = results.filter((response) => !response.ok);
        if (failed.length > 0) throw new Error(`Failed to cancel ${failed.length} pledge(s)`);
        invalidateCampaignCaches(pledge.campaignSlug);
        window.location.reload();
      } catch (err) {
        alert('Error: ' + err.message);
        btn.disabled = false;
        btn.textContent = getRuntimeMessage('manage.confirmCancellation', 'Confirm Cancellation');
      }
    });

    card.querySelector('[data-action="payment"]')?.addEventListener('click', async () => {
      try {
        await startPaymentMethodUpdate(pledge);
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });

    card.querySelector('[data-action="save"]')?.addEventListener('click', async (e) => {
      const btn = e.target;
      const errorEl = document.getElementById(`error-${index}`);
      const currentQty = pledge.tierQty || 1;
      const detailsFragment = document.createDocumentFragment();
      const originalSubtotal = getPledgeSubtotal(pledge);
      let newSubtotal = originalSubtotal;

      function appendSectionTitle(text) {
        const p = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = text;
        p.appendChild(strong);
        detailsFragment.appendChild(p);
      }

      function appendDetailParagraph(text) {
        appendTextElement(detailsFragment, 'p', text);
      }

      function appendDetailList(title, items) {
        appendSectionTitle(title);
        const list = document.createElement('ul');
        items.forEach((item) => appendTextElement(list, 'li', item));
        detailsFragment.appendChild(list);
      }

      const tierChanged = isSingleTier && selectedTierId !== currentTierId;
      const qtyChanged = isSingleTier && selectedTierQty !== currentQty;
      const hasAddedTiers = !isSingleTier && selectedAddTiers.length > 0;
      const hasSupportChanges = selectedSupportItems.length > 0;
      const hasCustomAmountChange = selectedCustomAmount !== currentCustomAmountVal;
      const hasTipChange = selectedTipPercent !== currentTipPercent;
      const originalShippingOption = String(pledge.shippingOption || 'standard').trim().toLowerCase() || 'standard';

      if (isSingleTier && (tierChanged || qtyChanged)) {
        const newTier = campaign.tiers.find((tier) => tier.id === selectedTierId);
        const oldTier = campaign.tiers.find((tier) => tier.id === currentTierId);
        const oldTierAmount = (oldTier?.price || 0) * currentQty * 100;
        const newTierAmount = newTier.price * selectedTierQty * 100;
        const tierDiff = newTierAmount - oldTierAmount;
        newSubtotal = originalSubtotal + tierDiff;
        appendSectionTitle(getRuntimeMessage('manage.updatingPledge', 'Updating pledge'));
        appendDetailParagraph(
          formatRuntimeMessage('manage.updatingFrom', 'From: %{tier} × %{quantity} (%{amount})', {
            tier: oldTier?.name || 'Unknown',
            quantity: currentQty,
            amount: formatMoney(oldTierAmount)
          })
        );
        appendDetailParagraph(
          formatRuntimeMessage('manage.updatingTo', 'To: %{tier} × %{quantity} (%{amount})', {
            tier: newTier?.name || 'Unknown',
            quantity: selectedTierQty,
            amount: formatMoney(newTierAmount)
          })
        );
      } else if (!isSingleTier) {
        const originalTierQuantities = {};
        if (currentTierId) {
          originalTierQuantities[currentTierId] = currentQty;
        }
        if (pledge.additionalTiers) {
          pledge.additionalTiers.forEach((tier) => {
            originalTierQuantities[tier.id] = tier.qty || 1;
          });
        }

        let oldTiersAmount = 0;
        for (const [tierId, qty] of Object.entries(originalTierQuantities)) {
          const tier = campaign.tiers.find((entry) => entry.id === tierId);
          if (tier) oldTiersAmount += tier.price * qty * 100;
        }

        const newTiersAmount = selectedAddTiers.reduce(
          (sum, tier) => sum + tier.price * (tier.qty || 1) * 100,
          0
        );
        const tierDiff = newTiersAmount - oldTiersAmount;
        newSubtotal = originalSubtotal + tierDiff;

        if (selectedAddTiers.length > 0) {
          appendDetailList(
            getRuntimeMessage('manage.updatedTiers', 'Updated tiers'),
            selectedAddTiers.map((tier) => {
              const foundTier = campaign.tiers.find((entry) => entry.id === tier.id);
              return `${foundTier?.name || tier.id} × ${tier.qty || 1} = ${formatMoney(tier.price * (tier.qty || 1) * 100)}`;
            })
          );
        } else {
          appendSectionTitle(getRuntimeMessage('manage.allTiersRemoved', 'All tiers removed'));
        }
      }

      if (hasSupportChanges) {
        const supportDiff = selectedSupportItems.reduce(
          (sum, supportItem) =>
            sum + (supportItem.amount - (supportItem.currentAmount || 0)) * 100,
          0
        );
        newSubtotal += supportDiff;
        appendDetailList(
          getRuntimeMessage('manage.supportItemChanges', 'Support item changes'),
          selectedSupportItems.map((supportItem) => {
            const diff = supportItem.amount - (supportItem.currentAmount || 0);
            const diffStr = diff >= 0 ? `+${formatMoney(diff * 100)}` : formatMoney(diff * 100);
            return `${supportItem.label}: ${formatMoney((supportItem.currentAmount || 0) * 100)} → ${formatMoney(supportItem.amount * 100)} (${diffStr})`;
          })
        );
      }

      if (hasCustomAmountChange) {
        const customDiff = (selectedCustomAmount - currentCustomAmountVal) * 100;
        newSubtotal += customDiff;
        const customDiffStr =
          customDiff >= 0 ? `+${formatMoney(customDiff)}` : formatMoney(customDiff);
        appendSectionTitle(getRuntimeMessage('manage.customSupport', 'Custom support'));
        appendDetailParagraph(
          `${formatMoney(currentCustomAmountVal * 100)} → ${formatMoney(selectedCustomAmount * 100)} (${customDiffStr})`
        );
      }

      const selectedTierEntries = buildSelectedTierEntries(
        campaign,
        pledge,
        isSingleTier ? selectedTierId : null,
        isSingleTier ? selectedTierQty : selectedAddTiers
      );
      const selectedSupportItemEntries = buildSelectedSupportItemEntries(campaign, selectedSupportItems);
      const confirmQuote = await fetchQuotedShippingQuote(
        pledge,
        campaign,
        selectedTierEntries,
        selectedSupportItemEntries,
        selectedShippingOption
      );
      const confirmShipping = Math.max(0, Number(confirmQuote?.shippingCents || 0));
      const resolvedConfirmShippingOption = String(
        confirmQuote?.selectedOption || selectedShippingOption || 'standard'
      ).trim().toLowerCase() || 'standard';
      const hasShippingOptionChange = resolvedConfirmShippingOption !== originalShippingOption;
      const newTipAmount = calculatePlatformTip(newSubtotal, selectedTipPercent);
      const newTax = calculateTax(newSubtotal);
      const newTotalWithTax = newSubtotal + newTax + confirmShipping + newTipAmount;
      const totalsNode = document.createElement('p');
      totalsNode.className = 'confirm-totals';
      appendTextElement(
        totalsNode,
        'span',
        `${getRuntimeMessage('manage.subtotal', 'Subtotal')}: ${formatMoney(newSubtotal)}`
      );
      if (newTipAmount > 0) {
        appendTextElement(
          totalsNode,
          'span',
          `${PLATFORM_NAME} tip (${selectedTipPercent}%): ${formatMoney(newTipAmount)}`
        );
      }
      appendTextElement(totalsNode, 'span', `${getSalesTaxLabel()}: ${formatMoney(newTax)}`);
      if (confirmShipping > 0) {
        appendTextElement(
          totalsNode,
          'span',
          `${getRuntimeMessage('manage.shipping', 'Shipping')}: ${formatMoney(confirmShipping)}`
        );
      }
      if (
        hasShippingOptionChange ||
        shouldShowManageShippingOptions(confirmQuote)
      ) {
        appendTextElement(
          totalsNode,
          'span',
          `${getRuntimeMessage('manage.shippingOption', 'Delivery option')}: ${getManageShippingOptionLabel(resolvedConfirmShippingOption)}`
        );
      }
      const totalStrong = document.createElement('strong');
      totalStrong.textContent = `${getRuntimeMessage('manage.total', 'Total')}: ${formatMoney(newTotalWithTax)}`;
      totalsNode.appendChild(totalStrong);
      detailsFragment.appendChild(totalsNode);

      showConfirmModal(getRuntimeMessage('manage.confirmUpdatePledge', 'Are you sure you want to update your pledge?'), detailsFragment, async () => {
        btn.disabled = true;
        btn.textContent = getRuntimeMessage('manage.saving', 'Saving...');
        errorEl.hidden = true;

        if (isDevMode) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          pledge.subtotal = newSubtotal;
          pledge.tax = newTax;
          pledge.shipping = confirmShipping;
          pledge.tipPercent = selectedTipPercent;
          pledge.tipAmount = newTipAmount;
          pledge.amount = newTotalWithTax;
          pledge.shippingOption = resolvedConfirmShippingOption;
          if (isSingleTier) {
            pledge.tierId = selectedTierId;
            pledge.tierQty = selectedTierQty;
          } else if (hasAddedTiers) {
            const allTiers = selectedAddTiers.map((tier) => ({ id: tier.id, qty: tier.qty || 1 }));
            if (allTiers.length > 0) {
              pledge.tierId = allTiers[0].id;
              pledge.tierQty = allTiers[0].qty;
              pledge.additionalTiers = allTiers.slice(1);
            }
          }
          if (hasCustomAmountChange) {
            pledge.customAmount = selectedCustomAmount;
          }
          if (hasSupportChanges) {
            pledge.supportItems = selectedSupportItems.map((supportItem) => ({
              id: supportItem.id,
              amount: supportItem.amount
            }));
          }
          alert('DEV MODE: Changes saved (simulated)\nNew total: ' + formatMoney(newTotalWithTax));
          renderPledges();
          return;
        }

        try {
          const primaryOrderIdForSave = pledge.orderIds ? pledge.orderIds[0] : pledge.orderId;
          const isMergedPledge = pledge.orderIds && pledge.orderIds.length > 1;

          if (isMergedPledge && !isSingleTier) {
            const ordersToCancel = new Set();
            const primaryTiers = [];

            for (const origTier of originalTiers) {
              const stillSelected = selectedAddTiers.find((tier) => tier.id === origTier.id);
              if (!stillSelected) {
                if (origTier.orderId && origTier.orderId !== primaryOrderIdForSave) {
                  ordersToCancel.add(origTier.orderId);
                }
              } else if (origTier.orderId === primaryOrderIdForSave || !origTier.orderId) {
                primaryTiers.push(stillSelected);
              } else {
                const qtyChanged = stillSelected.qty !== origTier.pledgedQty;
                if (qtyChanged) {
                  primaryTiers.push(stillSelected);
                }
              }
            }

            for (const selectedTier of selectedAddTiers) {
              const wasOriginal = originalTiers.find((tier) => tier.id === selectedTier.id);
              if (!wasOriginal) {
                primaryTiers.push(selectedTier);
              }
            }

            if (ordersToCancel.size > 0) {
              const cancelResults = await Promise.all(
                [...ordersToCancel].map((orderId) =>
                  fetch(`${WORKER_BASE}/pledge/cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: currentToken, orderId, preferredLang: CURRENT_LANG })
                  })
                )
              );
              const failed = cancelResults.filter((response) => !response.ok);
              if (failed.length > 0) {
                throw new Error(
                  formatRuntimeMessage('manage.failedToRemoveTiers', 'Failed to remove %{count} tier(s)', {
                    count: failed.length
                  })
                );
              }
            }

            const hasAnyChanges =
              primaryTiers.length > 0 ||
              hasSupportChanges ||
              hasCustomAmountChange ||
              hasTipChange ||
              hasShippingOptionChange ||
              ordersToCancel.size > 0;
            const retainedSecondaryOrderIds = (pledge.orderIds || []).filter(
              (orderId) => orderId !== primaryOrderIdForSave && !ordersToCancel.has(orderId)
            );

            if (hasAnyChanges) {
              const res = await fetch(`${WORKER_BASE}/pledge/modify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  token: currentToken,
                  orderId: primaryOrderIdForSave,
                  preferredLang: CURRENT_LANG,
                  addTiers: primaryTiers.length > 0 ? primaryTiers : null,
                  supportItems: hasSupportChanges ? selectedSupportItems : null,
                  customAmount: hasCustomAmountChange ? selectedCustomAmount : null,
                  tipPercent: hasTipChange ? selectedTipPercent : null,
                  shippingOption: hasShippingOptionChange ? resolvedConfirmShippingOption : null
                })
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Failed to update pledge');
            }

            if (hasTipChange && retainedSecondaryOrderIds.length > 0) {
              const tipUpdates = await Promise.all(
                retainedSecondaryOrderIds.map((orderId) =>
                  fetch(`${WORKER_BASE}/pledge/modify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      token: currentToken,
                      orderId,
                      preferredLang: CURRENT_LANG,
                      tipPercent: selectedTipPercent
                    })
                  })
                )
              );
              const failedTipUpdates = tipUpdates.filter((response) => !response.ok);
              if (failedTipUpdates.length > 0) {
                throw new Error(
                  formatRuntimeMessage(
                    'manage.failedToUpdateLinkedTip',
                    'Failed to update tip on %{count} linked pledge(s)',
                    { count: failedTipUpdates.length }
                  )
                );
              }
            }
          } else {
            const res = await fetch(`${WORKER_BASE}/pledge/modify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: currentToken,
                orderId: primaryOrderIdForSave,
                preferredLang: CURRENT_LANG,
                newTierId: isSingleTier ? selectedTierId : null,
                newTierQty: isSingleTier ? selectedTierQty : null,
                addTiers: !isSingleTier ? selectedAddTiers : null,
                supportItems: hasSupportChanges ? selectedSupportItems : null,
                customAmount: hasCustomAmountChange ? selectedCustomAmount : null,
                tipPercent: hasTipChange ? selectedTipPercent : null,
                shippingOption: hasShippingOptionChange ? resolvedConfirmShippingOption : null
              })
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || getRuntimeMessage('manage.failedToUpdatePledge', 'Failed to update pledge'));
            }
            if (hasTipChange && pledge.orderIds && pledge.orderIds.length > 1) {
              const secondaryOrderIds = pledge.orderIds.slice(1);
              const tipUpdates = await Promise.all(
                secondaryOrderIds.map((orderId) =>
                  fetch(`${WORKER_BASE}/pledge/modify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      token: currentToken,
                      orderId,
                      preferredLang: CURRENT_LANG,
                      tipPercent: selectedTipPercent
                    })
                  })
                )
              );
              const failedTipUpdates = tipUpdates.filter((response) => !response.ok);
              if (failedTipUpdates.length > 0) {
                throw new Error(
                  formatRuntimeMessage(
                    'manage.failedToUpdateLinkedTip',
                    'Failed to update tip on %{count} linked pledge(s)',
                    { count: failedTipUpdates.length }
                  )
                );
              }
            }
          }

          pledge.shippingOption = resolvedConfirmShippingOption;
          invalidateCampaignCaches(pledge.campaignSlug);
          btn.textContent = getRuntimeMessage('manage.saved', 'Saved');
          setTimeout(() => window.location.reload(), 500);
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          btn.disabled = false;
          btn.textContent = getRuntimeMessage('manage.saveChanges', 'Save Changes');
        }
      }, {
        returnFocusTarget: btn
      });
    });
  }

  function updatePledgeSummary(
    index,
    pledge,
    campaign,
    tierIdOrAddedTiers,
    tierQtyOrSupportItems,
    supportItems,
    customAmount = 0,
    currentCustomAmount = 0,
    tipPercent = getPledgeTipPercent(pledge),
    shippingOption = String(pledge.shippingOption || 'standard').trim().toLowerCase() || 'standard'
  ) {
    const amountEl = document.getElementById(`amount-${index}`);
    const changeEl = document.getElementById(`change-${index}`);
    const directionEl = document.getElementById(`change-direction-${index}`);
    const changeAmountEl = document.getElementById(`change-amount-${index}`);
    const saveBtn = document.querySelector(`[data-action="save"][data-index="${index}"]`);

    const originalSubtotal = getPledgeSubtotal(pledge);
    const originalTax = calculateTax(originalSubtotal);
    const originalShipping = pledge.shipping || 0;
    const originalTipAmount = getPledgeTipAmount(pledge);
    const originalTotal = originalSubtotal + originalTax + originalShipping + originalTipAmount;
    const currentTierId = pledge.tierId?.split('__').pop();
    const currentTierQty = pledge.tierQty || 1;
    const pledgeCurrentCustomAmount = pledge.customAmount || 0;
    const isSingleTier = campaign?.single_tier_only === true;
    const tiers = campaign?.tiers || [];

    let newSubtotal = originalSubtotal;
    let hasChanges = false;

    if (isSingleTier) {
      const newTierId = tierIdOrAddedTiers;
      const newQty = tierQtyOrSupportItems || 1;
      const newTier = tiers.find((tier) => tier.id === newTierId);
      const oldTier = tiers.find((tier) => tier.id === currentTierId);

      if (newTierId !== currentTierId || newQty !== currentTierQty) {
        const oldTierAmount = (oldTier?.price || 0) * currentTierQty * 100;
        const newTierAmount = (newTier?.price || 0) * newQty * 100;
        const tierDiff = newTierAmount - oldTierAmount;
        newSubtotal = originalSubtotal + tierDiff;
        hasChanges = true;
      }
    } else {
      const addedTiers = Array.isArray(tierQtyOrSupportItems) ? tierQtyOrSupportItems : [];
      let tierDiff = 0;

      for (const tier of addedTiers) {
        const newAmount = tier.price * (tier.qty || 1) * 100;
        const originalAmount = tier.isPledged ? tier.price * tier.pledgedQty * 100 : 0;
        tierDiff += newAmount - originalAmount;
      }

      const allPledgedTierIds = [];
      if (currentTierId) allPledgedTierIds.push(currentTierId);
      if (pledge.additionalTiers) {
        pledge.additionalTiers.forEach((tier) => allPledgedTierIds.push(tier.id));
      }

      for (const pledgedId of allPledgedTierIds) {
        const stillChecked = addedTiers.find((tier) => tier.id === pledgedId);
        if (!stillChecked) {
          const tier = tiers.find((entry) => entry.id === pledgedId);
          if (tier) {
            const originalQty =
              pledgedId === currentTierId
                ? currentTierQty
                : pledge.additionalTiers?.find((entry) => entry.id === pledgedId)?.qty || 1;
            tierDiff -= tier.price * originalQty * 100;
          }
        }
      }

      if (tierDiff !== 0) {
        newSubtotal = originalSubtotal + tierDiff;
        hasChanges = true;
      }
    }

    if (supportItems && supportItems.length > 0) {
      const supportDiff = supportItems.reduce((sum, supportItem) => {
        const newAmt = (supportItem.amount || 0) * 100;
        const curAmt = (supportItem.currentAmount || 0) * 100;
        return sum + (newAmt - curAmt);
      }, 0);
      newSubtotal += supportDiff;
      hasChanges = true;
    }

    const customDiff = (customAmount - pledgeCurrentCustomAmount) * 100;
    if (customDiff !== 0) {
      newSubtotal += customDiff;
      hasChanges = true;
    }

    if (tipPercent !== getPledgeTipPercent(pledge)) {
      hasChanges = true;
    }

    const selectedTierEntries = buildSelectedTierEntries(campaign, pledge, tierIdOrAddedTiers, tierQtyOrSupportItems);
    const selectedSupportItemEntries = buildSelectedSupportItemEntries(campaign, supportItems);
    const hasPhysical =
      selectedTierEntries.some((tier) => tier.category === 'physical') ||
      selectedSupportItemEntries.some((supportItem) => supportItem.category === 'physical');
    const fallbackShipping = getFallbackShippingCentsForPledge(pledge, campaign, hasPhysical);
    let newShipping = fallbackShipping;

    const subtotalEl = document.getElementById(`subtotal-${index}`);
    const tipEl = document.getElementById(`tip-${index}`);
    const tipRow = document.getElementById(`tip-row-${index}`);
    const tipRowPercent = document.getElementById(`tip-row-percent-${index}`);
    const tipAmountLabel = document.getElementById(`tip-amount-label-${index}`);
    const taxEl = document.getElementById(`tax-${index}`);
    const shippingEl = document.getElementById(`shipping-${index}`);
    const shippingRow = document.getElementById(`shipping-row-${index}`);
    const shippingOptionRow = document.getElementById(`shipping-option-row-${index}`);
    const shippingOptionSelect = document.getElementById(`shipping-option-${index}`);
    const newTipAmount = calculatePlatformTip(newSubtotal, tipPercent);
    const newTax = calculateTax(newSubtotal);
    const newTotalWithTax = newSubtotal + newTax + newShipping + newTipAmount;
    const originalShippingOption = String(pledge.shippingOption || 'standard').trim().toLowerCase() || 'standard';
    const baseHasChanges = hasChanges;
    const shippingOptionChanged = shippingOption !== originalShippingOption;
    if (shippingOptionChanged) {
      hasChanges = true;
    }

    subtotalEl.textContent = formatMoney(newSubtotal);
    if (tipRow) {
      tipRow.hidden = newTipAmount === 0;
    }
    if (tipEl) {
      tipEl.textContent = formatMoney(newTipAmount);
    }
    if (tipRowPercent) {
      tipRowPercent.textContent = String(tipPercent);
    }
    if (tipAmountLabel) {
      tipAmountLabel.textContent = formatMoney(newTipAmount);
    }
    const tipInput = document.getElementById(`tip-percent-${index}`);
    if (tipInput) {
      tipInput.setAttribute('aria-valuetext', formatTipSliderValueText(tipPercent, newTipAmount));
    }
    taxEl.textContent = formatMoney(newTax);
    if (shippingRow) {
      shippingRow.hidden = newShipping === 0;
      shippingEl.textContent = formatMoney(newShipping);
    }
    if (shippingOptionRow) {
      shippingOptionRow.hidden = true;
    }
    if (shippingOptionSelect instanceof HTMLSelectElement) {
      shippingOptionSelect.innerHTML = '';
    }
    amountEl.textContent = formatMoney(newTotalWithTax);

    const totalDiff = newTotalWithTax - originalTotal;
    if (totalDiff > 0) {
      changeEl.hidden = false;
      directionEl.textContent = getRuntimeMessage('manage.increase', 'Increase:');
      changeAmountEl.textContent = '+' + formatMoney(totalDiff);
      changeAmountEl.className = 'change-up';
    } else if (totalDiff < 0) {
      changeEl.hidden = false;
      directionEl.textContent = getRuntimeMessage('manage.decrease', 'Decrease:');
      changeAmountEl.textContent = formatMoney(totalDiff);
      changeAmountEl.className = 'change-down';
    } else {
      changeEl.hidden = true;
      directionEl.textContent = '';
      changeAmountEl.textContent = '';
      changeAmountEl.className = '';
    }

    saveBtn.disabled = !hasChanges;
    saveBtn.textContent = hasChanges
      ? getRuntimeMessage('manage.saveChanges', 'Save Changes')
      : getRuntimeMessage('manage.noChanges', 'No Changes');

    const quoteSignature = createShippingQuoteSignature(pledge, selectedTierEntries, selectedSupportItemEntries);
    const requestState = shippingQuoteState.get(index) || { requestId: 0 };
    const requestId = (requestState.requestId || 0) + 1;
    shippingQuoteState.set(index, {
      requestId,
      signature: quoteSignature
    });

    void fetchQuotedShippingQuote(pledge, campaign, selectedTierEntries, selectedSupportItemEntries, shippingOption).then((quotedQuote) => {
      const latestState = shippingQuoteState.get(index);
      if (!latestState || latestState.requestId !== requestId || latestState.signature !== quoteSignature) {
        return;
      }

      const quotedShipping = Math.max(0, Number(quotedQuote?.shippingCents || 0));
      const resolvedShippingOption = String(quotedQuote?.selectedOption || shippingOption || 'standard').trim().toLowerCase() || 'standard';
      const quotedTotal = newSubtotal + newTax + quotedShipping + newTipAmount;
      if (shippingRow) {
        shippingRow.hidden = quotedShipping === 0;
        shippingEl.textContent = formatMoney(quotedShipping);
      }
      if (shippingOptionRow && shippingOptionSelect instanceof HTMLSelectElement) {
        const availableOptions = Array.isArray(quotedQuote?.availableOptions) ? quotedQuote.availableOptions : [];
        const showShippingOptions = shouldShowManageShippingOptions(quotedQuote);
        shippingOptionRow.hidden = !showShippingOptions;
        if (showShippingOptions) {
          shippingOptionSelect.innerHTML = availableOptions.map((option) => `
            <option value="${escapeAttribute(option.id)}"${option.id === resolvedShippingOption ? ' selected' : ''}>${escapeHtml(formatManageShippingOptionChoice(option))}</option>
          `).join('');
          shippingOptionSelect.value = resolvedShippingOption;
        } else {
          shippingOptionSelect.innerHTML = '';
        }
      }
      const resolvedHasChanges = baseHasChanges || resolvedShippingOption !== originalShippingOption;
      saveBtn.disabled = !resolvedHasChanges;
      saveBtn.textContent = resolvedHasChanges
        ? getRuntimeMessage('manage.saveChanges', 'Save Changes')
        : getRuntimeMessage('manage.noChanges', 'No Changes');
      amountEl.textContent = formatMoney(quotedTotal);

      const quotedDiff = quotedTotal - originalTotal;
      if (quotedDiff > 0) {
        changeEl.hidden = false;
        directionEl.textContent = getRuntimeMessage('manage.increase', 'Increase:');
        changeAmountEl.textContent = '+' + formatMoney(quotedDiff);
        changeAmountEl.className = 'change-up';
      } else if (quotedDiff < 0) {
        changeEl.hidden = false;
        directionEl.textContent = getRuntimeMessage('manage.decrease', 'Decrease:');
        changeAmountEl.textContent = formatMoney(quotedDiff);
        changeAmountEl.className = 'change-down';
      } else {
        changeEl.hidden = true;
        directionEl.textContent = '';
        changeAmountEl.textContent = '';
        changeAmountEl.className = '';
      }
    });
  }

  init();
})();
