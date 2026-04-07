(function () {
'use strict';

const bootScript =
  document.currentScript ||
  document.querySelector('script[data-campaign-page-script="true"]');

if (!bootScript) {
  return;
}

const WIDTH_CLASS_PREFIX = 'hero__video-buffer-bar--w-';

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

function getMountainTimeOffset(dateStr) {
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

function initSupportScroll() {
  document.querySelectorAll('[data-scroll-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-scroll-target');
      const target = targetId ? document.getElementById(targetId) : null;
      target?.scrollIntoView({ behavior: 'smooth' });
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
  if (!deadlineStr && !(state === 'upcoming' && startStr)) return;

  let targetDate;
  if (state === 'upcoming' && startStr) {
    targetDate = new Date(startStr + 'T00:00:00' + getMountainTimeOffset(startStr));
  } else {
    targetDate = new Date(deadlineStr + 'T23:59:59' + getMountainTimeOffset(deadlineStr));
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
      valueEl.textContent = displayVal;
      lastValues[unit] = value;
      return;
    }

    if (lastValues[unit] === value) return;
    lastValues[unit] = value;
    card.classList.add('flip');
    setTimeout(() => {
      valueEl.textContent = displayVal;
      card.classList.remove('flip');
    }, 150);
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
          messageEl.innerHTML = '<h2>Campaign is now live!</h2>';
          messageEl.classList.add('campaign-countdown__message--funded');
        } else if (goalMet) {
          messageEl.innerHTML = '<h2>Project Funded</h2>';
          messageEl.classList.add('campaign-countdown__message--funded');
        } else {
          messageEl.innerHTML = '<h2>Campaign Ended</h2>';
          messageEl.classList.add('campaign-countdown__message--not-funded');
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

  function updateBuffer() {
    if (video.buffered.length > 0 && video.duration > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      const percent = (bufferedEnd / video.duration) * 100;
      applyWidthClass(bufferBar, WIDTH_CLASS_PREFIX, percent);
    }
  }

  function showLoading() {
    isWaiting = true;
    playBtn.hidden = true;
    loading.hidden = false;
    overlay.hidden = false;
  }

  function hideLoading() {
    isWaiting = false;
    loading.hidden = true;
    if (hasStarted) {
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
    hideLoading();
    bufferEl.classList.add('hero__video-buffer--playing');
  });
  video.addEventListener('pause', () => {
    if (!video.ended) {
      overlay.hidden = false;
      playBtn.hidden = false;
      loading.hidden = true;
    }
  });
  video.addEventListener('ended', () => {
    hasStarted = false;
    overlay.hidden = false;
    playBtn.hidden = false;
    loading.hidden = true;
    bufferEl.classList.remove('hero__video-buffer--playing');
  });
  playBtn.addEventListener('click', () => {
    showLoading();
    video.play().then(hideLoading).catch(hideLoading);
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay && hasStarted && !isWaiting) {
      video.play();
    }
  });

  video.load();
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

function init() {
  initSupportScroll();
  initCampaignCountdown();
  initHeroVideo();
  initCommunityTeaser(bootScript.dataset.campaignSlug || '');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

})();
