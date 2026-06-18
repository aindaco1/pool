(function () {
'use strict';

const bootScript =
  document.currentScript ||
  document.querySelector('script[data-campaign-page-script="true"]');

if (!bootScript) {
  return;
}

const WIDTH_CLASS_PREFIX = 'hero__video-buffer-bar--w-';
const SHARE_QUERY_ALLOWLIST = new Set([
  'ref',
  'referral',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term'
]);
let launchReminderTurnstileLoadPromise = null;

function initInlineSvgSupportClass() {
  const testSvg = document.createElementNS?.('http://www.w3.org/2000/svg', 'svg');
  if (typeof SVGSVGElement !== 'undefined' && testSvg instanceof SVGSVGElement) {
    document.documentElement.classList.add('supports-inline-svg');
  }
}

initInlineSvgSupportClass();

function getRuntimeMessages() {
  return window.POOL_CONFIG?.i18n?.messages || {};
}

function getRuntimeMessage(path, fallback) {
  const parts = String(path || '').split('.');
  let value = getRuntimeMessages();
  for (let index = 0; index < parts.length; index += 1) {
    if (!value || typeof value !== 'object') return fallback;
    value = value[parts[index]];
  }
  return typeof value === 'string' && value ? value : fallback;
}

function formatRuntimeMessage(template, replacements) {
  return String(template || '').replace(/%\{([^}]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return String(replacements[key]);
    }
    return match;
  });
}

function setCountdownHeading(messageEl, text, modifierClass) {
  if (!messageEl) return;
  messageEl.textContent = '';
  const heading = document.createElement('h2');
  heading.textContent = text;
  messageEl.appendChild(heading);
  messageEl.classList.remove('campaign-countdown__message--funded', 'campaign-countdown__message--not-funded');
  if (modifierClass) {
    messageEl.classList.add(modifierClass);
  }
}

function updateFlipCardValueLengthClass(card, displayValue) {
  const digitCount = String(displayValue || '').length;
  card.classList.toggle('flip-card--long-value', digitCount >= 3);
  card.classList.toggle('flip-card--extra-long-value', digitCount >= 4);
}

function applyWidthClass(node, prefix, percent) {
  if (!node) return;
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  Array.from(node.classList).forEach((className) => {
    if (className.indexOf(prefix) === 0) {
      node.classList.remove(className);
    }
  });
  node.classList.add(prefix + clampedPercent);
}

function getFallbackDenverTimeOffset(dateStr) {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    timeZoneName: 'short'
  });
  const timeZoneParts = formatter.formatToParts(new Date(Date.UTC(year, month - 1, day, 19, 0, 0)));
  const match = timeZoneParts.find((part) => part.type === 'timeZoneName');
  return match?.value === 'MDT' ? '-06:00' : '-07:00';
}

function campaignStartDate(dateStr) {
  if (window.POOL_TIME?.campaignStartDate) {
    return window.POOL_TIME.campaignStartDate(dateStr);
  }
  return new Date(dateStr + 'T00:00:00' + getFallbackDenverTimeOffset(dateStr));
}

function campaignDeadlineDate(dateStr) {
  if (window.POOL_TIME?.campaignDeadlineDate) {
    return window.POOL_TIME.campaignDeadlineDate(dateStr);
  }
  return new Date(dateStr + 'T23:59:59' + getFallbackDenverTimeOffset(dateStr));
}

function initSupportScroll() {
  document.querySelectorAll('[data-scroll-target]').forEach((button) => {
    const targetId = button.getAttribute('data-scroll-target');
    const target = targetId ? document.getElementById(targetId) : null;
    if (targetId && target) {
      button.setAttribute('aria-controls', targetId);
    }
    button.addEventListener('click', () => {
      if (!target) return;
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
    });
  });
}

function shareUrlWithSafeQueryParams(fallbackUrl) {
  let shareUrl;
  try {
    shareUrl = new URL(fallbackUrl || window.location.href, window.location.origin);
  } catch {
    shareUrl = new URL(window.location.href);
  }

  let currentUrl;
  try {
    currentUrl = new URL(window.location.href);
  } catch {
    return shareUrl.toString();
  }

  SHARE_QUERY_ALLOWLIST.forEach((key) => {
    shareUrl.searchParams.delete(key);
    currentUrl.searchParams.getAll(key).forEach((value) => {
      if (value) {
        shareUrl.searchParams.append(key, value);
      }
    });
  });

  return shareUrl.toString();
}

function shareHrefForTarget(target, title, text, shareUrl) {
  const shareMessage = String(text || title || '').trim();
  const shareText = `${shareMessage} ${shareUrl}`.trim();
  switch (target) {
    case 'bluesky':
      return `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
    case 'x':
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}&url=${encodeURIComponent(shareUrl)}`;
    case 'threads':
      return `https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    case 'sms':
      return `sms:?&body=${encodeURIComponent(shareText)}`;
    case 'email':
      return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareText)}`;
    default:
      return '';
  }
}

function initCampaignShareLinks() {
  document.querySelectorAll('[data-campaign-share]').forEach((panel) => {
    const title = panel.getAttribute('data-share-title') || document.title;
    const text = panel.getAttribute('data-share-text') || title;
    const shareUrl = shareUrlWithSafeQueryParams(panel.getAttribute('data-share-url'));

    panel.querySelectorAll('[data-campaign-share-target]').forEach((control) => {
      const target = control.getAttribute('data-campaign-share-target') || '';
      const href = shareHrefForTarget(target, title, text, shareUrl);
      if (href && control instanceof HTMLAnchorElement) {
        control.href = href;
      }
    });
  });
}

function initScrollableGalleries() {
  document.querySelectorAll('.gallery--carousel .gallery__container').forEach((container) => {
    if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '0');
    }
    if (!container.hasAttribute('aria-label')) {
      container.setAttribute('aria-label', getRuntimeMessage('campaign.imageGallery', 'Image gallery'));
    }

    container.addEventListener('keydown', (event) => {
      const currentTarget = event.currentTarget;
      if (!(currentTarget instanceof HTMLElement)) return;

      const scrollStep = Math.max(240, Math.round(currentTarget.clientWidth * 0.8));
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        currentTarget.scrollBy({ left: scrollStep, behavior: 'smooth' });
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        currentTarget.scrollBy({ left: -scrollStep, behavior: 'smooth' });
      } else if (event.key === 'Home') {
        event.preventDefault();
        currentTarget.scrollTo({ left: 0, behavior: 'smooth' });
      } else if (event.key === 'End') {
        event.preventDefault();
        currentTarget.scrollTo({ left: currentTarget.scrollWidth, behavior: 'smooth' });
      }
    });
  });
}

function initCampaignCountdown() {
  const el = document.getElementById('campaign-countdown');
  if (!el) return;

  const deadlineStr = el.getAttribute('data-deadline');
  const startStr = el.getAttribute('data-start');
  const state = el.getAttribute('data-state');
  const goalMet = el.getAttribute('data-goal-met') === 'true';
  const messageEl = el.querySelector('.campaign-countdown__message');
  const statusEl = document.getElementById('campaign-countdown-status');
  if (messageEl) {
    messageEl.setAttribute('role', 'status');
    messageEl.setAttribute('aria-live', 'polite');
    messageEl.setAttribute('aria-atomic', 'true');
  }
  if (!deadlineStr && !(state === 'upcoming' && startStr)) return;

  let targetDate;
  if (state === 'upcoming' && startStr) {
    targetDate = campaignStartDate(startStr);
  } else {
    targetDate = campaignDeadlineDate(deadlineStr);
  }

  const flipCards = {};
  const lastValues = {};
  ['days', 'hours', 'mins', 'secs'].forEach((unit) => {
    flipCards[unit] = el.querySelector('.flip-card[data-unit="' + unit + '"]');
    lastValues[unit] = -1;
  });

  function updateCard(unit, value) {
    const card = flipCards[unit];
    if (!card) return;

    const displayVal = String(value).padStart(2, '0');
    const valueEl = card.querySelector('.flip-card__value');

    if (lastValues[unit] === -1) {
      updateFlipCardValueLengthClass(card, displayVal);
      valueEl.textContent = displayVal;
      lastValues[unit] = value;
      return;
    }

    if (lastValues[unit] === value) return;
    lastValues[unit] = value;
    card.classList.add('flip');
    setTimeout(() => {
      updateFlipCardValueLengthClass(card, displayVal);
      valueEl.textContent = displayVal;
      card.classList.remove('flip');
    }, 150);
  }

  function updateCountdownStatus(days, hours, mins, secs) {
    if (!statusEl) return;
    const template = getRuntimeMessage(
      'campaign.countdownRemaining',
      '%{days} days, %{hours} hours, %{minutes} minutes, %{seconds} seconds remaining'
    );
    statusEl.textContent = formatRuntimeMessage(template, {
      days,
      hours,
      minutes: mins,
      seconds: secs
    });
  }

  function update() {
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
      el.classList.add('campaign-countdown--ended');
      const flipCountdown = el.querySelector('.flip-countdown');
      if (flipCountdown) {
        flipCountdown.hidden = true;
      }
      const headingEl = el.querySelector('.campaign-countdown__heading');
      if (headingEl) headingEl.hidden = true;
      if (messageEl) {
        if (state === 'upcoming') {
          if (statusEl) {
            statusEl.textContent = getRuntimeMessage('campaign.countdownLive', 'Campaign is now live!');
          }
          setCountdownHeading(
            messageEl,
            getRuntimeMessage('campaign.countdownLive', 'Campaign is now live!'),
            'campaign-countdown__message--funded'
          );
        } else if (goalMet) {
          if (statusEl) {
            statusEl.textContent = getRuntimeMessage('campaign.countdownFunded', 'Project Funded');
          }
          setCountdownHeading(
            messageEl,
            getRuntimeMessage('campaign.countdownFunded', 'Project Funded'),
            'campaign-countdown__message--funded'
          );
        } else {
          if (statusEl) {
            statusEl.textContent = getRuntimeMessage('campaign.countdownEnded', 'Campaign Ended');
          }
          setCountdownHeading(
            messageEl,
            getRuntimeMessage('campaign.countdownEnded', 'Campaign Ended'),
            'campaign-countdown__message--not-funded'
          );
        }
      }
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    updateCard('days', days);
    updateCard('hours', hours);
    updateCard('mins', mins);
    updateCard('secs', secs);
    updateCountdownStatus(days, hours, mins, secs);

    setTimeout(update, 1000);
  }

  update();
}

function initHeroVideo() {
  const wrapper = document.getElementById('hero-video-wrapper');
  const video = document.getElementById('hero-video');
  const overlay = document.getElementById('hero-video-overlay');
  const playBtn = document.getElementById('hero-video-play');
  const loading = document.getElementById('hero-video-loading');
  const bufferEl = document.getElementById('hero-video-buffer');
  const bufferBar = bufferEl?.querySelector('.hero__video-buffer-bar');
  if (!video || !overlay || !playBtn || !loading || !bufferEl || !bufferBar) return;

  let isWaiting = false;
  let hasStarted = false;
  let playbackRequested = false;

  function updateBuffer() {
    if (video.buffered.length > 0 && video.duration > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      const percent = (bufferedEnd / video.duration) * 100;
      applyWidthClass(bufferBar, WIDTH_CLASS_PREFIX, percent);
    }
  }

  function showLoading() {
    if (hasStarted) {
      wrapper?.setAttribute('aria-busy', 'false');
      playBtn.hidden = true;
      loading.hidden = true;
      overlay.hidden = true;
      return;
    }

    if (!playbackRequested) {
      wrapper?.setAttribute('aria-busy', 'false');
      playBtn.hidden = false;
      loading.hidden = true;
      overlay.hidden = false;
      return;
    }

    isWaiting = true;
    wrapper?.setAttribute('aria-busy', 'true');
    playBtn.hidden = true;
    loading.hidden = false;
    overlay.hidden = false;
  }

  function hideLoading() {
    isWaiting = false;
    wrapper?.setAttribute('aria-busy', 'false');
    loading.hidden = true;
    if (hasStarted) {
      playBtn.hidden = true;
      overlay.hidden = true;
    } else {
      overlay.hidden = false;
      playBtn.hidden = false;
    }
  }

  video.addEventListener('loadedmetadata', () => {
    updateBuffer();
  });

  video.addEventListener('progress', updateBuffer);
  video.addEventListener('waiting', showLoading);
  video.addEventListener('stalled', showLoading);
  video.addEventListener('canplay', () => {
    if (!hasStarted) hideLoading();
  });
  video.addEventListener('canplaythrough', hideLoading);
  video.addEventListener('playing', () => {
    hasStarted = true;
    playbackRequested = false;
    hideLoading();
    bufferEl.classList.add('hero__video-buffer--playing');
  });
  video.addEventListener('pause', () => {
    if (!video.ended && !hasStarted) {
      wrapper?.setAttribute('aria-busy', 'false');
      overlay.hidden = false;
      playBtn.hidden = false;
      loading.hidden = true;
    }
  });
  video.addEventListener('ended', () => {
    hasStarted = false;
    wrapper?.setAttribute('aria-busy', 'false');
    overlay.hidden = false;
    playBtn.hidden = false;
    loading.hidden = true;
    bufferEl.classList.remove('hero__video-buffer--playing');
  });
  playBtn.addEventListener('click', () => {
    playbackRequested = true;
    showLoading();
    video.play().then(() => {
      playbackRequested = false;
      hideLoading();
    }).catch(() => {
      playbackRequested = false;
      hideLoading();
    });
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay && hasStarted && !isWaiting) {
      video.play();
    }
  });

  hideLoading();
  video.load();
}

function initYoutubeHeroFacades() {
  document.querySelectorAll('[data-youtube-poster-fallback]').forEach((image) => {
    if (!(image instanceof HTMLImageElement) || image.dataset.youtubePosterFallbackReady === 'true') return;
    image.dataset.youtubePosterFallbackReady = 'true';
    const fallback = image.getAttribute('data-youtube-poster-fallback') || '';
    if (!fallback) return;
    let didFallback = false;
    const useFallback = () => {
      if (didFallback || image.src === fallback) return;
      didFallback = true;
      image.src = fallback;
    };
    image.addEventListener('error', useFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) useFallback();
  });

  document.querySelectorAll('[data-youtube-embed]').forEach((facade) => {
    if (facade.dataset.youtubeReady === 'true') return;
    facade.dataset.youtubeReady = 'true';

    const button = facade.querySelector('[data-youtube-play]');
    const src = facade.getAttribute('data-youtube-src') || '';
    const title = facade.getAttribute('data-youtube-title') || getRuntimeMessage('campaign.videoEmbedTitle', 'Campaign video');
    if (!button || !src) return;

    button.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = title;
      iframe.frameBorder = '0';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      iframe.allowFullscreen = true;
      facade.replaceChildren(iframe);
      facade.classList.add('hero__video--youtube-loaded');
      iframe.focus();
    });
  });
}

function initCommunityTeaser(campaignSlug) {
  if (!campaignSlug) return;
  const teaser = document.getElementById('community-teaser');
  if (!teaser) return;

  const hasAccess =
    new RegExp('(?:^|; )supporter_' + campaignSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=').test(document.cookie) ||
    new URLSearchParams(window.location.search).has('dev');

  if (!hasAccess) return;

  const locked = teaser.querySelector('.teaser-locked');
  const unlocked = teaser.querySelector('.teaser-unlocked');
  const lockedText = teaser.querySelector('.locked-text');
  const unlockedText = teaser.querySelector('.unlocked-text');
  const button = document.getElementById('community-btn');

  if (locked) locked.hidden = true;
  if (unlocked) unlocked.hidden = false;
  if (lockedText) lockedText.hidden = true;
  if (unlockedText) unlockedText.hidden = false;
  if (button) {
    button.classList.remove('btn--locked', 'btn--secondary');
    button.classList.add('btn--primary');
  }
}

function resolveWorkerUrl(path) {
  const workerBase =
    window.POOL_CONFIG?.workerBase ||
    window.POOL_CONFIG?.platform?.workerUrl ||
    window.location.origin;
  try {
    return new URL(path, workerBase).toString();
  } catch {
    return path;
  }
}

function setLaunchReminderStatus(statusEl, message, status) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  if (status) {
    statusEl.dataset.status = status;
  } else {
    delete statusEl.dataset.status;
  }
}

function loadLaunchReminderTurnstile() {
  if (window.turnstile?.render) return Promise.resolve();
  if (launchReminderTurnstileLoadPromise) return launchReminderTurnstileLoadPromise;

  launchReminderTurnstileLoadPromise = new Promise((resolve, reject) => {
    const scriptNode = document.createElement('script');
    scriptNode.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    scriptNode.async = true;
    scriptNode.defer = true;
    scriptNode.onload = () => resolve();
    scriptNode.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(scriptNode);
  });

  return launchReminderTurnstileLoadPromise;
}

function getLaunchReminderTurnstileSize(form) {
  return form.closest('.launch-reminder--sidebar') ? 'normal' : 'flexible';
}

async function ensureLaunchReminderTurnstile(form) {
  const root = form.querySelector('[data-launch-reminder-turnstile]');
  const siteKey =
    form.getAttribute('data-turnstile-site-key') ||
    window.POOL_CONFIG?.launchReminders?.turnstileSiteKey ||
    window.POOL_CONFIG?.launchReminderTurnstileSiteKey ||
    '';
  if (!root || !siteKey) return '';

  await loadLaunchReminderTurnstile();
  if (!window.turnstile?.render) return '';

  if (!form._launchReminderTurnstile) {
    form._launchReminderTurnstile = {
      widgetId: window.turnstile.render(root, {
        sitekey: siteKey,
        action: 'launch_reminder_signup',
        size: getLaunchReminderTurnstileSize(form),
        callback(token) {
          form._launchReminderTurnstile.token = String(token || '');
        },
        'expired-callback'() {
          form._launchReminderTurnstile.token = '';
        },
        'error-callback'() {
          form._launchReminderTurnstile.token = '';
        }
      }),
      token: ''
    };
  }

  if (!form._launchReminderTurnstile.token && window.turnstile.getResponse) {
    form._launchReminderTurnstile.token = String(window.turnstile.getResponse(form._launchReminderTurnstile.widgetId) || '');
  }

  return form._launchReminderTurnstile.token || '';
}

function resetLaunchReminderTurnstile(form) {
  const state = form._launchReminderTurnstile;
  if (!state || state.widgetId === undefined || !window.turnstile?.reset) return;
  window.turnstile.reset(state.widgetId);
  state.token = '';
}

function getLaunchReminderConsent(consentInput) {
  if (!consentInput) return true;
  if (consentInput.type === 'checkbox') return Boolean(consentInput.checked);
  return ['1', 'true', 'yes', 'on'].includes(String(consentInput.value || '').trim().toLowerCase());
}

function isLaunchReminderFormVisible(form) {
  if (!form?.isConnected) return false;
  const style = window.getComputedStyle ? window.getComputedStyle(form) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return form.getClientRects().length > 0 || form.offsetParent !== null;
}

function renderVisibleLaunchReminderTurnstiles() {
  document.querySelectorAll('[data-launch-reminder-form]').forEach((form) => {
    if (!form.querySelector('[data-launch-reminder-turnstile]') || !isLaunchReminderFormVisible(form)) return;
    loadLaunchReminderTurnstile()
      .then(() => ensureLaunchReminderTurnstile(form))
      .catch(() => {});
  });
}

function initLaunchReminderForms() {
  document.querySelectorAll('[data-launch-reminder-form]').forEach((form) => {
    if (form.dataset.launchReminderReady === 'true') return;
    form.dataset.launchReminderReady = 'true';

    const emailInput = form.querySelector('input[name="email"]');
    const consentInput = form.querySelector('input[name="consent"]');
    const submitButton = form.querySelector('button[type="submit"]');
    const statusEl = form.querySelector('[data-launch-reminder-status]');
    const campaignSlug = form.getAttribute('data-campaign-slug') || bootScript.dataset.campaignSlug || '';
    const preferredLang =
      form.getAttribute('data-lang') ||
      window.POOL_CONFIG?.i18n?.currentLang ||
      'en';

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const email = String(emailInput?.value || '').trim();
      const consent = getLaunchReminderConsent(consentInput);

      if (!email) {
        setLaunchReminderStatus(
          statusEl,
          getRuntimeMessage('campaign.launchReminderEmailRequired', 'Enter your email address.'),
          'error'
        );
        emailInput?.focus();
        return;
      }

      if (!consent) {
        setLaunchReminderStatus(
          statusEl,
          getRuntimeMessage('campaign.launchReminderConsentRequired', 'Confirm that you want this launch reminder.'),
          'error'
        );
        if (consentInput?.type !== 'hidden') consentInput?.focus();
        return;
      }

      if (!campaignSlug) {
        setLaunchReminderStatus(
          statusEl,
          getRuntimeMessage('campaign.launchReminderError', 'Could not save this reminder. Please try again.'),
          'error'
        );
        return;
      }

      const defaultButtonText = submitButton?.textContent || '';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = getRuntimeMessage('campaign.launchReminderSubmitting', 'Saving...');
      }
      setLaunchReminderStatus(statusEl, '', '');

      try {
        const turnstileToken = await ensureLaunchReminderTurnstile(form);
        const hasTurnstile = Boolean(form.querySelector('[data-launch-reminder-turnstile]'));
        if (hasTurnstile && !turnstileToken) {
          throw new Error('challenge_required');
        }

        const response = await fetch(resolveWorkerUrl('/launch-reminders'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignSlug,
            email,
            preferredLang,
            consent,
            turnstileToken: turnstileToken || undefined
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok === false) {
          throw new Error(data?.code || 'launch_reminder_failed');
        }

        setLaunchReminderStatus(
          statusEl,
          getRuntimeMessage('campaign.launchReminderSuccess', "You're on the reminder list."),
          'success'
        );
        form.reset();
        resetLaunchReminderTurnstile(form);
      } catch (_error) {
        setLaunchReminderStatus(
          statusEl,
          getRuntimeMessage('campaign.launchReminderError', 'Could not save this reminder. Please try again.'),
          'error'
        );
        resetLaunchReminderTurnstile(form);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = defaultButtonText;
        }
      }
    });

  });

  renderVisibleLaunchReminderTurnstiles();
  window.addEventListener('resize', renderVisibleLaunchReminderTurnstiles, { passive: true });
}

function init() {
  initSupportScroll();
  initCampaignShareLinks();
  initScrollableGalleries();
  initCampaignCountdown();
  initYoutubeHeroFacades();
  initHeroVideo();
  initCommunityTeaser(bootScript.dataset.campaignSlug || '');
  initLaunchReminderForms();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

})();
