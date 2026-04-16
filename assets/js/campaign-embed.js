(function () {
'use strict';

const bootScript =
  document.currentScript ||
  document.querySelector('script[data-campaign-embed-script="true"]');

if (!bootScript) {
  return;
}

const root = document.querySelector('[data-campaign-embed-root]');
if (!root) {
  return;
}

const REFRESH_INTERVAL_MS = 60 * 1000;
const DEFAULT_EMBED_HEIGHT_PX = 720;
const COMPACT_EMBED_HEIGHT_PX = 560;
const EMBED_LAYOUTS = new Set(['full', 'compact']);
const EMBED_THEMES = new Set(['default', 'warm', 'ocean']);
const EMBED_CTA_OPTIONS = new Set(['show', 'hide']);
const builder = document.querySelector('[data-campaign-embed-builder]');
const select = document.querySelector('[data-campaign-embed-select]');
const layoutSelect = document.querySelector('[data-campaign-embed-layout]');
const themeSelect = document.querySelector('[data-campaign-embed-theme]');
const mediaSelect = document.querySelector('[data-campaign-embed-media]');
const ctaSelect = document.querySelector('[data-campaign-embed-cta]');
const codeField = document.querySelector('[data-campaign-embed-code]');
const copyButton = document.querySelector('[data-campaign-embed-copy]');
const copyStatus = document.querySelector('[data-campaign-embed-copy-status]');
const closeLink = document.querySelector('[data-campaign-embed-close]');
const isFramed = window.self !== window.top;

let currentSlug = '';
let currentSnapshot = null;
let currentOptions = null;
let countdownTimer = null;
let refreshTimer = null;
let resizeObserver = null;

if (isFramed) {
  document.body.classList.add('campaign-embed-page--framed');
}

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

function formatRuntimeMessage(path, fallback, replacements) {
  const template = getRuntimeMessage(path, fallback);
  if (!replacements) return template;
  return template.replace(/%\{(.*?)\}/g, (_match, key) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return String(replacements[key]);
    }
    return '';
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

function getSiteUrl() {
  return window.POOL_CONFIG?.platform?.siteUrl || window.POOL_CONFIG?.siteUrl || window.location.origin;
}

function getWorkerBase() {
  return window.POOL_CONFIG?.platform?.workerUrl || window.POOL_CONFIG?.workerBase || 'https://pledge.dustwave.xyz';
}

function getCurrentLang() {
  return window.POOL_CONFIG?.i18n?.currentLang || 'en';
}

function resolveUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  try {
    return new URL(pathOrUrl, getSiteUrl()).toString();
  } catch (_error) {
    return '';
  }
}

function getLocalizedCampaignPath(path) {
  const currentLang = getCurrentLang();
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath.startsWith('/')) return normalizedPath;
  if (currentLang === 'en') return normalizedPath;
  if (/^\/[a-z]{2}(?:-[a-z0-9]{2,8})?\//i.test(normalizedPath)) return normalizedPath;
  return '/' + currentLang + normalizedPath;
}

function resolveCampaignUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  try {
    const url = new URL(pathOrUrl, getSiteUrl());
    if (url.origin === getSiteUrl()) {
      url.pathname = getLocalizedCampaignPath(url.pathname);
    }
    return url.toString();
  } catch (_error) {
    return '';
  }
}

function formatCurrencyFromCents(cents) {
  const amount = Number(cents || 0) / 100;
  return new Intl.NumberFormat(getCurrentLang(), {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount);
}

function formatMoneyShortFromDollars(amount) {
  const value = Math.max(0, Number(amount || 0));
  if (value >= 1000) {
    const abbreviated = value / 1000;
    const text = abbreviated % 1 === 0 ? abbreviated.toFixed(0) : abbreviated.toFixed(1).replace(/\.0$/, '');
    return '$' + text + 'K';
  }
  return '$' + Math.round(value);
}

function formatDate(dateString) {
  if (!dateString) return '';
  const [year, month, day] = String(dateString).split('-').map(Number);
  if (!year || !month || !day) return String(dateString);
  return new Intl.DateTimeFormat(getCurrentLang(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function getMountainTimeOffset(dateString) {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    timeZoneName: 'short'
  });
  const parts = formatter.formatToParts(new Date(Date.UTC(year, month - 1, day, 19, 0, 0)));
  const zone = parts.find((part) => part.type === 'timeZoneName')?.value;
  return zone === 'MDT' ? '-06:00' : '-07:00';
}

function getDeadlineDate(dateString) {
  if (!dateString) return null;
  return new Date(dateString + 'T23:59:59' + getMountainTimeOffset(dateString));
}

function formatCountdown(distanceMs) {
  if (distanceMs <= 0) {
    return {
      days: '00',
      hours: '00',
      minutes: '00',
      seconds: '00'
    };
  }
  const totalSeconds = Math.floor(distanceMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0')
  };
}

function getQuerySlug() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get('slug') || '').trim();
}

function normalizeLayout(value) {
  return EMBED_LAYOUTS.has(value) ? value : 'full';
}

function normalizeTheme(value) {
  return EMBED_THEMES.has(value) ? value : 'default';
}

function normalizeMedia(value) {
  return value === 'hide' || value === '0' || value === 'false' ? 'hide' : 'show';
}

function normalizeCta(value) {
  return EMBED_CTA_OPTIONS.has(value) ? value : 'show';
}

function normalizeEmbedOptions(options) {
  return {
    layout: normalizeLayout(String(options?.layout || '')),
    theme: normalizeTheme(String(options?.theme || '')),
    media: normalizeMedia(String(options?.media || '')),
    cta: normalizeCta(String(options?.cta || ''))
  };
}

function getQueryOptions() {
  const params = new URLSearchParams(window.location.search);
  return normalizeEmbedOptions({
    layout: params.get('layout'),
    theme: params.get('theme'),
    media: params.get('media'),
    cta: params.get('cta')
  });
}

function setQueryState(slug, options) {
  const nextUrl = new URL(window.location.href);
  const normalizedOptions = normalizeEmbedOptions(options);
  if (slug) {
    nextUrl.searchParams.set('slug', slug);
  } else {
    nextUrl.searchParams.delete('slug');
  }
  if (normalizedOptions.layout === 'compact') {
    nextUrl.searchParams.set('layout', normalizedOptions.layout);
  } else {
    nextUrl.searchParams.delete('layout');
  }
  if (normalizedOptions.theme !== 'default') {
    nextUrl.searchParams.set('theme', normalizedOptions.theme);
  } else {
    nextUrl.searchParams.delete('theme');
  }
  if (normalizedOptions.media === 'hide') {
    nextUrl.searchParams.set('media', normalizedOptions.media);
  } else {
    nextUrl.searchParams.delete('media');
  }
  if (normalizedOptions.cta === 'hide') {
    nextUrl.searchParams.set('cta', normalizedOptions.cta);
  } else {
    nextUrl.searchParams.delete('cta');
  }
  window.history.replaceState({}, '', nextUrl.toString());
}

function getEmbedHeight(options) {
  return normalizeEmbedOptions(options).layout === 'compact' ? COMPACT_EMBED_HEIGHT_PX : DEFAULT_EMBED_HEIGHT_PX;
}

function syncOptionControls(options) {
  const normalizedOptions = normalizeEmbedOptions(options);
  if (layoutSelect) {
    layoutSelect.value = normalizedOptions.layout;
  }
  if (themeSelect) {
    themeSelect.value = normalizedOptions.theme;
  }
  if (mediaSelect) {
    mediaSelect.value = normalizedOptions.media;
  }
  if (ctaSelect) {
    ctaSelect.value = normalizedOptions.cta;
  }
}

function getBuilderOptions() {
  return normalizeEmbedOptions({
    layout: layoutSelect ? layoutSelect.value : currentOptions?.layout,
    theme: themeSelect ? themeSelect.value : currentOptions?.theme,
    media: mediaSelect ? mediaSelect.value : currentOptions?.media,
    cta: ctaSelect ? ctaSelect.value : currentOptions?.cta
  });
}

function buildResizeHelperScript(embedOrigin) {
  return [
    '<script>',
    '(function(){',
    "  if (window.__POOL_CAMPAIGN_EMBED_RESIZE__) return;",
    "  window.__POOL_CAMPAIGN_EMBED_RESIZE__ = true;",
    "  var allowedOrigin = " + JSON.stringify(embedOrigin) + ';',
    "  window.addEventListener('message', function(event) {",
    "    if (event.origin !== allowedOrigin) return;",
    "    var data = event.data || {};",
    "    if (data.type !== 'pool-campaign-embed:resize') return;",
    "    var frames = document.querySelectorAll('iframe[data-pool-campaign-embed]');",
    "    for (var index = 0; index < frames.length; index += 1) {",
    "      var frame = frames[index];",
    "      if (frame.contentWindow !== event.source) continue;",
    "      var nextHeight = Math.max(320, Number(data.height || 0));",
    "      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;",
    "      frame.style.height = nextHeight + 'px';",
    "      frame.setAttribute('height', String(nextHeight));",
    "      break;",
    "    }",
    "  });",
    '})();',
    '<\/script>'
  ].join('\n');
}

function buildEmbedCode(slug, title, options) {
  const normalizedOptions = normalizeEmbedOptions(options);
  const embedUrl = new URL(window.location.pathname, getSiteUrl());
  embedUrl.searchParams.set('slug', slug);
  if (normalizedOptions.layout === 'compact') {
    embedUrl.searchParams.set('layout', normalizedOptions.layout);
  }
  if (normalizedOptions.theme !== 'default') {
    embedUrl.searchParams.set('theme', normalizedOptions.theme);
  }
  if (normalizedOptions.media === 'hide') {
    embedUrl.searchParams.set('media', normalizedOptions.media);
  }
  if (normalizedOptions.cta === 'hide') {
    embedUrl.searchParams.set('cta', normalizedOptions.cta);
  }
  const embedOrigin = embedUrl.origin;
  const embedHeight = getEmbedHeight(normalizedOptions);
  const iframeTitle = formatRuntimeMessage('embed.iframe_title', '%{title} campaign embed', {
    title: title || slug
  });
  return [
    '<iframe',
    '  data-pool-campaign-embed="true"',
    '  src="' + embedUrl.toString() + '"',
    '  title="' + escapeHtml(iframeTitle) + '"',
    '  loading="lazy"',
    '  scrolling="no"',
    '  allow="autoplay; fullscreen; picture-in-picture"',
    '  height="' + embedHeight + '"',
    '  style="width: 100%; max-width: 960px; height: ' + embedHeight + 'px; border: 0; overflow: hidden;"',
    '></iframe>',
    buildResizeHelperScript(embedOrigin)
  ].join('\n');
}

function renderMedia(campaign, embedOptions) {
  const heroVideo = resolveUrl(campaign.heroVideo);
  const heroImage = resolveUrl(
    normalizeEmbedOptions(embedOptions).layout === 'compact'
      ? (campaign.heroImage || campaign.heroImageWide)
      : (campaign.heroImageWide || campaign.heroImage)
  );
  const imageAlt = escapeHtml(campaign.heroImageAlt || campaign.title || currentSlug);

  if (heroVideo && normalizeEmbedOptions(embedOptions).layout !== 'compact') {
    if (/youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\//i.test(heroVideo)) {
      let videoId = '';
      if (heroVideo.indexOf('youtu.be/') !== -1) {
        videoId = heroVideo.split('youtu.be/').pop().split('?')[0];
      } else if (heroVideo.indexOf('watch?v=') !== -1) {
        videoId = heroVideo.split('watch?v=').pop().split('&')[0];
      } else if (heroVideo.indexOf('/embed/') !== -1) {
        videoId = heroVideo.split('/embed/').pop().split('?')[0];
      }
      if (videoId) {
        return '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1&mute=1&loop=1&playlist=' + encodeURIComponent(videoId) + '&controls=0&modestbranding=1&playsinline=1" title="' + imageAlt + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
      }
    }

    if (/\.(mp4|webm|mov)(\?.*)?$/i.test(heroVideo)) {
      return '<video autoplay muted loop playsinline preload="metadata" poster="' + escapeHtml(heroImage) + '"><source src="' + escapeHtml(heroVideo) + '"></video>';
    }
  }

  if (heroImage) {
    return '<img src="' + escapeHtml(heroImage) + '" alt="' + imageAlt + '">';
  }

  return '<div class="campaign-embed-card__media-fallback">' + escapeHtml(campaign.title || currentSlug) + '</div>';
}

function renderProgressBar(snapshot) {
  const campaign = snapshot?.campaign || {};
  const stats = snapshot?.stats || {};
  const goalAmount = Number(campaign.goalAmount || stats.goalAmount || 0);
  const pledgedDollars = Number(stats.pledgedAmount || 0) / 100;
  const stretchGoals = Array.isArray(campaign.stretchGoals) ? campaign.stretchGoals : [];
  const stretchHidden = campaign.stretchHidden !== false;
  let maxThreshold = goalAmount;
  let showFinalMarker = false;

  for (let index = 0; index < stretchGoals.length; index += 1) {
    const stretch = stretchGoals[index];
    if (!stretch || stretch.status === 'hidden') continue;
    maxThreshold = Math.max(maxThreshold, Number(stretch.threshold || 0));
  }

  if (stretchGoals.length === 0 && pledgedDollars > goalAmount) {
    maxThreshold = pledgedDollars;
    showFinalMarker = true;
  }

  let pct = maxThreshold > 0 ? Math.round((pledgedDollars / maxThreshold) * 100) : 0;
  let exceededMax = false;
  if (pct > 100) {
    pct = 100;
    exceededMax = true;
  }

  const goalPct = maxThreshold > 0 ? Math.round((goalAmount / maxThreshold) * 100) : 100;
  const goalMet = goalAmount > 0 ? pledgedDollars >= goalAmount : false;
  const oneThird = Math.floor(goalAmount / 3);
  const twoThirds = Math.floor((goalAmount * 2) / 3);
  const oneThirdPct = maxThreshold > 0 ? Math.round((oneThird / maxThreshold) * 100) : 0;
  const twoThirdsPct = maxThreshold > 0 ? Math.round((twoThirds / maxThreshold) * 100) : 0;

  let stretchMarkersHtml = '';
  let prevMet = goalMet;

  for (let index = 0; index < stretchGoals.length; index += 1) {
    const stretch = stretchGoals[index];
    if (!stretch || stretch.status === 'hidden') continue;
    const threshold = Number(stretch.threshold || 0);
    const stretchPct = maxThreshold > 0 ? Math.round((threshold / maxThreshold) * 100) : 0;
    const achieved = pledgedDollars >= threshold;
    const unlocked = !stretchHidden || prevMet;
    stretchMarkersHtml += ''
      + '<div class="progress-marker progress-marker--stretch'
      + (stretchPct >= 100 ? ' progress-marker--edge-right' : '')
      + (achieved ? ' progress-marker--achieved' : '')
      + (unlocked ? '' : ' progress-marker--locked')
      + '" style="left: ' + stretchPct + '%;">'
      + '<span class="progress-marker__dot"></span>'
      + '<span class="progress-marker__label">'
      + '<span class="progress-marker__amount">' + escapeHtml(formatMoneyShortFromDollars(threshold)) + '</span>'
      + '<span class="progress-marker__desc">' + escapeHtml(unlocked ? String(stretch.title || '') : '???') + '</span>'
      + '</span>'
      + '</div>';
    prevMet = achieved;
  }

  const backgroundUrl = resolveUrl(campaign.progressBackground);

  return ''
    + '<div class="progress-wrap">'
    + (backgroundUrl ? '<img src="' + escapeHtml(backgroundUrl) + '" alt="" class="progress-wrap__bg" aria-hidden="true">' : '')
    + '<div class="progress-bar' + (exceededMax ? ' progress-bar--exceeded' : '') + '">'
    + '<span style="width: ' + pct + '%;"></span>'
    + '<div class="progress-marker progress-marker--milestone' + (pledgedDollars >= oneThird ? ' progress-marker--achieved' : '') + '" style="left: ' + oneThirdPct + '%;">'
    + '<span class="progress-marker__dot"></span>'
    + '<span class="progress-marker__label"><span class="progress-marker__amount">' + escapeHtml(formatMoneyShortFromDollars(oneThird)) + '</span><span class="progress-marker__desc">1/3</span></span>'
    + '</div>'
    + '<div class="progress-marker progress-marker--milestone' + (pledgedDollars >= twoThirds ? ' progress-marker--achieved' : '') + '" style="left: ' + twoThirdsPct + '%;">'
    + '<span class="progress-marker__dot"></span>'
    + '<span class="progress-marker__label"><span class="progress-marker__amount">' + escapeHtml(formatMoneyShortFromDollars(twoThirds)) + '</span><span class="progress-marker__desc">2/3</span></span>'
    + '</div>'
    + '<div class="progress-marker progress-marker--goal'
    + (goalPct >= 100 ? ' progress-marker--edge-right' : '')
    + (goalMet ? ' progress-marker--achieved' : '')
    + '" style="left: ' + goalPct + '%;">'
    + '<span class="progress-marker__dot"></span>'
    + '<span class="progress-marker__label"><span class="progress-marker__amount">' + escapeHtml(formatMoneyShortFromDollars(goalAmount)) + '</span><span class="progress-marker__desc">' + escapeHtml(getRuntimeMessage('embed.goal_marker', 'Goal!')) + '</span></span>'
    + '</div>'
    + (showFinalMarker
      ? '<div class="progress-marker progress-marker--final progress-marker--edge-right progress-marker--achieved" style="left: 100%;"><span class="progress-marker__dot"></span><span class="progress-marker__label"><span class="progress-marker__amount">' + escapeHtml(formatMoneyShortFromDollars(pledgedDollars)) + '</span><span class="progress-marker__desc">' + escapeHtml(getRuntimeMessage('embed.final_marker', 'Final')) + '</span></span></div>'
      : '')
    + stretchMarkersHtml
    + '</div>'
    + '<div class="progress-meta"><strong>' + escapeHtml(formatCurrencyFromCents(stats.pledgedAmount || 0)) + '</strong> ' + escapeHtml(getRuntimeMessage('embed.raised_label', 'raised')) + ' · ' + escapeHtml(formatRuntimeMessage('embed.of_goal_label', 'of %{goal} goal', { goal: formatCurrencyFromCents(goalAmount * 100) })) + '</div>'
    + '</div>';
}

function renderCountdownMarkup() {
  return ''
    + '<div class="campaign-embed-card__countdown">'
    + '<div class="flip-countdown flip-countdown--embed">'
    + '<div class="flip-countdown__group">'
    + '<div class="flip-card"><span class="flip-card__value" data-campaign-embed-countdown-part="days">00</span></div>'
    + '<span class="flip-countdown__label">' + escapeHtml(getRuntimeMessage('embed.countdown_days', 'Days')) + '</span>'
    + '</div>'
    + '<div class="flip-countdown__separator" aria-hidden="true">:</div>'
    + '<div class="flip-countdown__group">'
    + '<div class="flip-card"><span class="flip-card__value" data-campaign-embed-countdown-part="hours">00</span></div>'
    + '<span class="flip-countdown__label">' + escapeHtml(getRuntimeMessage('embed.countdown_hours', 'Hours')) + '</span>'
    + '</div>'
    + '<div class="flip-countdown__separator" aria-hidden="true">:</div>'
    + '<div class="flip-countdown__group">'
    + '<div class="flip-card"><span class="flip-card__value" data-campaign-embed-countdown-part="minutes">00</span></div>'
    + '<span class="flip-countdown__label">' + escapeHtml(getRuntimeMessage('embed.countdown_minutes', 'Minutes')) + '</span>'
    + '</div>'
    + '<div class="flip-countdown__separator" aria-hidden="true">:</div>'
    + '<div class="flip-countdown__group">'
    + '<div class="flip-card"><span class="flip-card__value" data-campaign-embed-countdown-part="seconds">00</span></div>'
    + '<span class="flip-countdown__label">' + escapeHtml(getRuntimeMessage('embed.countdown_seconds', 'Seconds')) + '</span>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function getStatusMarkup(snapshot) {
  const campaign = snapshot?.campaign || {};
  const stats = snapshot?.stats || {};
  const effectiveState = campaign.effectiveState || stats.effectiveState || campaign.state || stats.state || 'unknown';
  const goalDeadline = campaign.goalDeadline || stats.goalDeadline;
  const isFunded = campaign.isFunded === true || stats.isFunded === true;

  if (effectiveState === 'upcoming') {
    return {
      statusClass: '',
      statusText: '',
      metaMarkup: '<div class="campaign-embed-card__date">' + escapeHtml(formatRuntimeMessage('embed.starts_on', 'Starts %{date}', { date: formatDate(campaign.startDate) })) + '</div>'
    };
  }

  if (effectiveState === 'live') {
    return {
      statusClass: '',
      statusText: '',
      metaMarkup: ''
        + '<div class="campaign-embed-card__meta-row">'
        + '<div class="campaign-embed-card__date">' + escapeHtml(formatRuntimeMessage('embed.ends_on', 'Ends %{date}', { date: formatDate(goalDeadline) })) + '</div>'
        + renderCountdownMarkup()
        + '</div>'
    };
  }

  if (isFunded) {
    return {
      statusClass: ' campaign-embed-card__status--funded',
      statusText: getRuntimeMessage('embed.funded', 'Campaign funded!'),
      metaMarkup: '<div class="campaign-embed-card__final">' + escapeHtml(getRuntimeMessage('embed.final_pledged', 'Final pledged')) + ': <strong>' + escapeHtml(formatCurrencyFromCents(stats.pledgedAmount || 0)) + '</strong></div>'
    };
  }

  return {
    statusClass: ' campaign-embed-card__status--ended',
    statusText: getRuntimeMessage('embed.ended', 'Campaign ended'),
    metaMarkup: ''
  };
}

function renderSnapshot(snapshot) {
  const embedOptions = normalizeEmbedOptions(currentOptions);
  currentSnapshot = snapshot;
  const campaign = snapshot?.campaign || {};
  const status = getStatusMarkup(snapshot);
  const blurbHtml = campaign.shortBlurbHtml || escapeHtml(campaign.shortBlurb || '');
  const campaignUrl = resolveCampaignUrl(campaign.url || '/campaigns/' + encodeURIComponent(currentSlug) + '/');
  const creatorLabel = getRuntimeMessage('embed.creator_label', 'Creator');
  const categoryLabel = getRuntimeMessage('embed.category_label', 'Category');
  const showMedia = embedOptions.media !== 'hide';
  const showCta = embedOptions.cta !== 'hide';
  root.className = 'campaign-embed-widget campaign-embed-widget--theme-' + embedOptions.theme + ' campaign-embed-widget--layout-' + embedOptions.layout + (showMedia ? '' : ' campaign-embed-widget--media-hidden');
  if (closeLink && !isFramed) {
    closeLink.href = campaignUrl;
    closeLink.hidden = false;
    closeLink.setAttribute('aria-label', getRuntimeMessage('embed.back_to_campaign', 'Back to campaign'));
    closeLink.setAttribute('title', getRuntimeMessage('embed.back_to_campaign', 'Back to campaign'));
  }
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = ''
    + '<article class="campaign-embed-card'
    + (embedOptions.layout === 'compact' ? ' campaign-embed-card--compact' : '')
    + (showMedia ? '' : ' campaign-embed-card--media-hidden')
    + '" aria-labelledby="campaign-embed-title">'
    + (showMedia ? '<div class="campaign-embed-card__media">' + renderMedia(campaign, embedOptions) + '</div>' : '')
    + '<div class="campaign-embed-card__body">'
    + '<div class="campaign-embed-card__eyebrow">'
    + ((campaign.creatorName || campaign.category)
      ? '<div class="campaign-embed-card__meta-stack">'
        + (campaign.creatorName ? '<div class="campaign-embed-card__meta-line"><span class="campaign-embed-card__meta-label">' + escapeHtml(creatorLabel) + ':</span> <span class="campaign-embed-card__meta-value">' + escapeHtml(campaign.creatorName) + '</span></div>' : '')
        + (campaign.category ? '<div class="campaign-embed-card__meta-line"><span class="campaign-embed-card__meta-label">' + escapeHtml(categoryLabel) + ':</span> <span class="campaign-embed-card__meta-value">' + escapeHtml(campaign.category) + '</span></div>' : '')
        + '</div>'
      : '')
    + (status.statusText ? '<span class="campaign-embed-card__status' + status.statusClass + '">' + escapeHtml(status.statusText) + '</span>' : '')
    + '</div>'
    + '<h2 id="campaign-embed-title" class="campaign-embed-card__title">' + escapeHtml(campaign.title || currentSlug) + '</h2>'
    + '<p class="campaign-embed-card__blurb">' + blurbHtml + '</p>'
    + status.metaMarkup
    + ((campaign.effectiveState || snapshot?.stats?.effectiveState) === 'live' ? renderProgressBar(snapshot) : '')
    + (showCta
      ? '<div class="campaign-embed-card__actions">'
        + '<a class="campaign-embed-card__button" href="' + escapeHtml(campaignUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHtml(formatRuntimeMessage('embed.view_campaign_aria', 'View campaign: %{title}', { title: campaign.title || currentSlug })) + '">' + escapeHtml(getRuntimeMessage('embed.view_campaign_label', 'View Campaign')) + '</a>'
        + '</div>'
      : '')
    + '</div>'
    + '</article>';

  if (codeField && currentSlug) {
    codeField.value = buildEmbedCode(currentSlug, campaign.title || currentSlug, embedOptions);
  }

  startCountdown(snapshot);
  postFrameHeight();
}

function startCountdown(snapshot) {
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
  const countdownNodes = {
    days: root.querySelector('[data-campaign-embed-countdown-part="days"]'),
    hours: root.querySelector('[data-campaign-embed-countdown-part="hours"]'),
    minutes: root.querySelector('[data-campaign-embed-countdown-part="minutes"]'),
    seconds: root.querySelector('[data-campaign-embed-countdown-part="seconds"]')
  };
  if (!countdownNodes.days || !countdownNodes.hours || !countdownNodes.minutes || !countdownNodes.seconds) return;
  const goalDeadline = snapshot?.campaign?.goalDeadline || snapshot?.stats?.goalDeadline;
  const deadlineDate = getDeadlineDate(goalDeadline);
  if (!deadlineDate) return;

  const updateCountdown = function () {
    const countdown = formatCountdown(deadlineDate.getTime() - Date.now());
    countdownNodes.days.textContent = countdown.days;
    countdownNodes.hours.textContent = countdown.hours;
    countdownNodes.minutes.textContent = countdown.minutes;
    countdownNodes.seconds.textContent = countdown.seconds;
  };

  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 1000);
}

function renderError(message) {
  if (closeLink && !currentSnapshot) {
    closeLink.hidden = true;
  }
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = '<div class="campaign-embed-widget__error" role="alert">' + escapeHtml(message) + '</div>';
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
  postFrameHeight();
}

function renderLoading() {
  root.setAttribute('aria-busy', 'true');
  root.innerHTML = '<div class="campaign-embed-widget__loading" role="status">' + escapeHtml(getRuntimeMessage('embed.loading', 'Loading campaign embed...')) + '</div>';
}

async function fetchCampaignList() {
  const response = await fetch(resolveUrl('/api/campaigns.json'));
  if (!response.ok) {
    throw new Error('Failed to fetch campaigns');
  }
  const payload = await response.json();
  return Array.isArray(payload?.campaigns) ? payload.campaigns : [];
}

function populateSelect(campaigns) {
  if (!select) return;
  const options = ['<option value="">' + escapeHtml(getRuntimeMessage('embed.select_label', 'Campaign')) + '</option>'];
  campaigns.forEach((campaign) => {
    if (!campaign?.slug) return;
    options.push('<option value="' + escapeHtml(campaign.slug) + '">' + escapeHtml(campaign.title || campaign.slug) + '</option>');
  });
  select.innerHTML = options.join('');
  if (currentSlug) {
    select.value = currentSlug;
  }
}

async function fetchLiveSnapshot(slug) {
  const response = await fetch(getWorkerBase() + '/live/' + encodeURIComponent(slug));
  if (!response.ok) {
    throw new Error('Failed to fetch live campaign snapshot');
  }
  return response.json();
}

async function loadSlug(slug, options) {
  const nextOptions = normalizeEmbedOptions(options?.embed || currentOptions || getBuilderOptions());
  const nextSlug = String(slug || '').trim();
  if (!nextSlug) {
    renderError(getRuntimeMessage('embed.missing_slug', 'Select a campaign to generate an embed.'));
    return;
  }
  currentSlug = nextSlug;
  currentOptions = nextOptions;
  if (select) {
    select.value = nextSlug;
  }
  syncOptionControls(nextOptions);
  setQueryState(nextSlug, nextOptions);
  renderLoading();
  try {
    const snapshot = await fetchLiveSnapshot(nextSlug);
    renderSnapshot(snapshot);
    if (!options || options.refresh !== true) {
      scheduleRefresh();
    }
  } catch (_error) {
    renderError(getRuntimeMessage('embed.load_error', 'Unable to load this campaign embed right now.'));
  }
}

function scheduleRefresh() {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }
  refreshTimer = window.setInterval(function () {
    if (!currentSlug) return;
    loadSlug(currentSlug, { refresh: true, embed: currentOptions });
  }, REFRESH_INTERVAL_MS);
}

function postFrameHeight() {
  if (!isFramed) return;
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body ? document.body.scrollHeight : 0
  );
  window.parent.postMessage({
    type: 'pool-campaign-embed:resize',
    slug: currentSlug,
    height: height
  }, '*');
}

function syncBuilderCopy() {
  if (!copyButton || !codeField) return;
  copyButton.addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(codeField.value);
      if (copyStatus) {
        copyStatus.textContent = getRuntimeMessage('embed.copy_success', 'Copied!');
      }
    } catch (_error) {
      if (copyStatus) {
        copyStatus.textContent = getRuntimeMessage('embed.copy_failure', 'Copy failed. Select the code and copy it manually.');
      }
    }
  });
}

function syncBuilderLabels() {
  const mappings = [
    ['[data-embed-builder-title]', getRuntimeMessage('embed.builder_title', 'Campaign Embed')],
    ['[data-embed-builder-intro]', getRuntimeMessage('embed.builder_intro', 'Copy this iframe code to embed a live campaign preview on another site.')],
    ['[data-embed-select-label]', getRuntimeMessage('embed.select_label', 'Campaign')],
    ['[data-embed-layout-label]', getRuntimeMessage('embed.layout_label', 'Layout')],
    ['[data-embed-layout-full]', getRuntimeMessage('embed.layout_full', 'Full')],
    ['[data-embed-layout-compact]', getRuntimeMessage('embed.layout_compact', 'Compact')],
    ['[data-embed-theme-label]', getRuntimeMessage('embed.theme_label', 'Theme')],
    ['[data-embed-theme-default]', getRuntimeMessage('embed.theme_default', 'Default')],
    ['[data-embed-theme-warm]', getRuntimeMessage('embed.theme_warm', 'Warm')],
    ['[data-embed-theme-ocean]', getRuntimeMessage('embed.theme_ocean', 'Ocean')],
    ['[data-embed-media-label]', getRuntimeMessage('embed.media_label', 'Media')],
    ['[data-embed-media-show]', getRuntimeMessage('embed.media_show', 'Show hero media')],
    ['[data-embed-media-hide]', getRuntimeMessage('embed.media_hide', 'Hide hero media')],
    ['[data-embed-cta-label]', getRuntimeMessage('embed.cta_label', 'Call to action')],
    ['[data-embed-cta-show]', getRuntimeMessage('embed.cta_show', 'Show campaign button')],
    ['[data-embed-cta-hide]', getRuntimeMessage('embed.cta_hide', 'Hide campaign button')],
    ['[data-embed-code-label]', getRuntimeMessage('embed.code_label', 'Embed code')],
    ['[data-embed-code-help]', getRuntimeMessage('embed.code_help', 'Paste this iframe into your site where you want the campaign preview to appear.')],
    ['[data-embed-preview-label]', getRuntimeMessage('embed.preview_label', 'Preview')]
  ];
  mappings.forEach(function (entry) {
    const node = document.querySelector(entry[0]);
    if (node) {
      node.textContent = entry[1];
    }
  });
  if (copyButton) {
    copyButton.textContent = getRuntimeMessage('embed.copy_button', 'Copy code');
  }
  if (closeLink && !isFramed) {
    const closeLabel = getRuntimeMessage('embed.back_to_campaign', 'Back to campaign');
    closeLink.setAttribute('aria-label', closeLabel);
    closeLink.setAttribute('title', closeLabel);
  }
}

function initSelectHandling() {
  if (!select) return;
  select.addEventListener('change', function () {
    const slug = String(select.value || '').trim();
    if (!slug) {
      renderError(getRuntimeMessage('embed.missing_slug', 'Select a campaign to generate an embed.'));
      return;
    }
    if (copyStatus) {
      copyStatus.textContent = '';
    }
    loadSlug(slug, { embed: getBuilderOptions() });
  });
}

function initOptionHandling() {
  [layoutSelect, themeSelect, mediaSelect, ctaSelect].forEach(function (field) {
    if (!field) return;
    field.addEventListener('change', function () {
      if (copyStatus) {
        copyStatus.textContent = '';
      }
      currentOptions = getBuilderOptions();
      if (currentSlug) {
        loadSlug(currentSlug, { embed: currentOptions });
        return;
      }
      setQueryState('', currentOptions);
      if (codeField) {
        codeField.value = '';
      }
    });
  });
}

async function initBuilderCampaigns() {
  if (isFramed) return;
  try {
    const campaigns = await fetchCampaignList();
    populateSelect(campaigns);
    if (!currentSlug && campaigns.length > 0) {
      currentSlug = String(campaigns[0].slug || '').trim();
      if (select) {
        select.value = currentSlug;
      }
    }
  } catch (_error) {
    // Keep builder available even if the selector cannot pre-populate.
  }
}

function initHeightObserver() {
  if (!isFramed || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(function () {
    postFrameHeight();
  });
  resizeObserver.observe(document.body);
}

async function init() {
  syncBuilderLabels();
  syncBuilderCopy();
  initSelectHandling();
  initOptionHandling();
  initHeightObserver();

  currentSlug = getQuerySlug();
  currentOptions = getQueryOptions();
  syncOptionControls(currentOptions);
  await initBuilderCampaigns();

  if (currentSlug) {
    loadSlug(currentSlug);
    return;
  }

  if (!isFramed && select && select.value) {
    loadSlug(select.value);
    return;
  }

  renderError(getRuntimeMessage('embed.missing_slug', 'Select a campaign to generate an embed.'));
}

init();
})();
