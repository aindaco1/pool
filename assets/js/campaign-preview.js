(function() {
  'use strict';

  var bootScript = document.currentScript;
  var mediaMessage = 'pool:preview-youtube';

  function youtubeVideoId(href) {
    try {
      var url = new URL(href);
      var id = url.searchParams.get('v') || '';
      return url.origin === 'https://www.youtube.com' && url.pathname === '/watch' &&
        /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : '';
    } catch (_error) {
      return '';
    }
  }

  // Run the media controls inside the opaque preview frame, using an external
  // first-party script so the inherited CSP never needs unsafe-inline.
  if (bootScript?.hasAttribute('data-campaign-preview-media')) {
    var parentOrigin = new URL(bootScript.src).origin;
    var activeVideos = new Map();
    var measurePending = false;

    function sendVideoPosition(slot, video, action) {
      var rect = video.container.getBoundingClientRect();
      window.parent.postMessage({
        type: mediaMessage,
        action: action,
        slot: slot,
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }, parentOrigin);
    }

    function measureVideos() {
      if (measurePending || !activeVideos.size) return;
      measurePending = true;
      window.requestAnimationFrame(function() {
        measurePending = false;
        activeVideos.forEach(function(video, slot) { sendVideoPosition(slot, video, 'layout'); });
      });
    }

    // Keep the trusted players aligned with their placeholders during inner
    // scrolling, responsive layout, font loading and late-loading images.
    document.addEventListener('scroll', measureVideos, { capture: true, passive: true });
    document.addEventListener('load', measureVideos, true);
    window.addEventListener('resize', measureVideos);
    var mediaResizeObserver = new ResizeObserver(measureVideos);
    mediaResizeObserver.observe(document.body);
    document.querySelectorAll('[data-youtube-poster-fallback]').forEach(function(image) {
      var fallback = image.getAttribute('data-youtube-poster-fallback');
      if (!(image instanceof HTMLImageElement) || !fallback) return;
      var didFallback = false;
      function useFallback() {
        if (didFallback) return;
        didFallback = true;
        image.src = fallback;
      }
      image.addEventListener('error', useFallback, { once: true });
      // YouTube may return a decodable 120px placeholder with its 404, which
      // fires load instead of error. A real maxres thumbnail is larger.
      function checkThumbnail() {
        if (image.naturalWidth <= 120) useFallback();
      }
      image.addEventListener('load', checkThumbnail, { once: true });
      if (image.complete) checkThumbnail();
    });
    document.addEventListener('click', function(event) {
      var link = event.target.closest?.('a.hero__video-play--youtube');
      var slot = link?.dataset.previewVideoSlot;
      var container = link?.closest('.hero__video--youtube');
      if (!slot || !container || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      var video = { container: container };
      activeVideos.set(slot, video);
      mediaResizeObserver.observe(container);
      sendVideoPosition(slot, video, 'play');
      link.style.visibility = 'hidden';
      link.tabIndex = -1;
      link.setAttribute('aria-hidden', 'true');
    });
    window.addEventListener('message', function(event) {
      if (event.source === window.parent && event.origin === parentOrigin &&
          event.data?.type === mediaMessage + ':measure') measureVideos();
    });
    return;
  }

  var root = document.querySelector('[data-campaign-preview]');
  if (!root) return;

  var logger = window.PoolLogger?.createLogger('campaign-preview') || {
    warn: function() {},
    error: function() {}
  };
  var config = window.POOL_CONFIG || {};
  var workerBase = config.platform?.workerUrl || config.workerBase || '';
  var lang = config.i18n?.currentLang || document.documentElement.lang || '';
  var slug = String(root.dataset.campaignPreviewSlug || '').trim();
  var status = root.querySelector('[data-campaign-preview-status]');
  var frame = root.querySelector('[data-campaign-preview-frame]');
  var notice = root.querySelector('[data-campaign-preview-notice]');
  var noticeTitle = root.querySelector('[data-campaign-preview-notice-title]');
  var noticeBody = root.querySelector('[data-campaign-preview-notice-body]');
  var previewRequestId = 0;
  var mediaScriptUrl = bootScript?.src || new URL('/assets/js/campaign-preview.js', window.location.href).href;
  var previewVideos = new Map();
  var videoLayer = root.querySelector('[data-preview-video-layer]');
  var players = new Map();

  function clearVideos() {
    videoLayer?.replaceChildren();
    players.clear();
  }

  if (videoLayer && frame) {
    // Players need their own origin/storage, so they are siblings of the
    // opaque campaign frame. The clipped layer places them exactly over the
    // campaign's media slots without granting campaign HTML parent access.
    new ResizeObserver(function() {
      videoLayer.style.width = frame.clientWidth + 'px';
      videoLayer.style.height = frame.clientHeight + 'px';
      frame.contentWindow?.postMessage({ type: mediaMessage + ':measure' }, '*');
    }).observe(frame);
    window.addEventListener('message', function(event) {
      var data = event.data;
      if (event.source !== frame.contentWindow || event.origin !== 'null' || frame.hidden ||
          root.dataset.campaignPreviewLoaded !== 'true' || data?.type !== mediaMessage ||
          !previewVideos.has(data.slot) || !['play', 'layout'].includes(data.action)) return;
      var bounds = data.bounds;
      if (!bounds || !['x', 'y', 'width', 'height'].every(function(key) {
        return Number.isFinite(bounds[key]) && Math.abs(bounds[key]) <= 100000;
      }) || bounds.width <= 0 || bounds.height <= 0 || bounds.width > frame.clientWidth + 1) return;
      var player = players.get(data.slot);
      if (!player) {
        if (data.action !== 'play') return;
        var video = previewVideos.get(data.slot);
        player = document.createElement('iframe');
        player.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(video.id) + '?autoplay=1&rel=0';
        player.title = video.title;
        player.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        player.referrerPolicy = 'strict-origin-when-cross-origin';
        player.allowFullscreen = true;
        players.set(data.slot, player);
        videoLayer.append(player);
      }
      player.style.left = bounds.x + 'px';
      player.style.top = bounds.y + 'px';
      player.style.width = bounds.width + 'px';
      player.style.height = bounds.height + 'px';
      if (data.action === 'play') player.focus({ preventScroll: true });
    });
  }

  function message(name, fallback) {
    return String(root.dataset[name] || fallback || '');
  }

  function setStatus(value) {
    if (!status) return;
    status.textContent = value;
    status.hidden = !value;
  }

  function hideNotice() {
    if (!notice) return;
    notice.hidden = true;
    delete root.dataset.campaignPreviewAccess;
  }

  function showAccessNotice() {
    if (noticeTitle) noticeTitle.textContent = message('previewAccessTitle', 'Preview link unavailable');
    if (noticeBody) {
      noticeBody.textContent = message(
        'previewAccessBody',
        'This preview link has expired or is invalid. Ask the campaign team for a new 24-hour preview link.'
      );
    }
    if (notice) notice.hidden = false;
    root.dataset.campaignPreviewAccess = 'blocked';
    setStatus('');
  }

  function previewRequestError(messageText, statusCode) {
    var error = new Error(messageText || 'Preview request failed');
    error.status = statusCode || 0;
    return error;
  }

  function isAccessError(error) {
    return error?.status === 401 || error?.status === 403;
  }

  function apiUrl(path) {
    if (!workerBase) return path;
    try {
      return new URL(path, workerBase).toString();
    } catch (_error) {
      return path;
    }
  }

  function previewEndpoint(token) {
    var path = '/admin/campaign-preview/' + encodeURIComponent(slug);
    var params = new URLSearchParams();
    if (token) params.set('t', token);
    if (lang) params.set('lang', lang);
    var query = params.toString();
    if (query) path += '?' + query;
    return apiUrl(path);
  }

  function previewTokenStorageKey() {
    return 'pool_campaign_preview_token:' + slug;
  }

  function previewTokenFromUrl() {
    try {
      return new URL(window.location.href).searchParams.get('t') || '';
    } catch (_error) {
      return '';
    }
  }

  function storedPreviewToken() {
    try {
      return window.sessionStorage.getItem(previewTokenStorageKey()) || '';
    } catch (_error) {
      return '';
    }
  }

  function storePreviewToken(token) {
    if (!token) return;
    try {
      window.sessionStorage.setItem(previewTokenStorageKey(), token);
    } catch (_error) {
    }
  }

  function clearStoredPreviewToken() {
    try {
      window.sessionStorage.removeItem(previewTokenStorageKey());
    } catch (_error) {
    }
  }

  function stripPreviewToken() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has('t')) return;
      url.searchParams.delete('t');
      window.history.replaceState({}, document.title, url.toString());
    } catch (_error) {
    }
  }

  async function fetchPreviewData(token) {
    var response = await fetch(previewEndpoint(token), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json'
      }
    });
    var data = await response.json().catch(function() { return {}; });
    if (!response.ok) {
      throw previewRequestError(data.error || 'Preview request failed', response.status);
    }
    return data;
  }

  function renderPreview(data) {
    var previewDocument = new DOMParser().parseFromString(data.preview?.html || '', 'text/html');
    previewVideos.clear();
    previewDocument.querySelectorAll('a.hero__video-play--youtube').forEach(function(link, index) {
      var id = youtubeVideoId(link.href);
      if (!id) return;
      var slot = previewRequestId + ':' + index;
      link.dataset.previewVideoSlot = slot;
      previewVideos.set(slot, { id: id, title: link.getAttribute('aria-label') || message('previewVideoTitle', 'Campaign video') });
    });
    var mediaScript = previewDocument.createElement('script');
    mediaScript.src = mediaScriptUrl;
    mediaScript.defer = true;
    mediaScript.setAttribute('data-campaign-preview-media', '');
    previewDocument.body.append(mediaScript);
    frame.srcdoc = '<!doctype html>\n' + previewDocument.documentElement.outerHTML;
    frame.hidden = false;
    root.dataset.campaignPreviewLoaded = 'true';
    hideNotice();
    setStatus('');
  }

  async function loadPreview() {
    var requestId = ++previewRequestId;
    clearVideos();
    previewVideos.clear();
    delete root.dataset.campaignPreviewLoaded;
    if (!slug || !(frame instanceof HTMLIFrameElement)) {
      hideNotice();
      setStatus(message('previewError', 'Preview unavailable.'));
      return;
    }

    var urlToken = previewTokenFromUrl();
    if (urlToken) storePreviewToken(urlToken);
    var token = urlToken || storedPreviewToken();
    if (urlToken) stripPreviewToken();

    hideNotice();
    setStatus(message('previewLoading', 'Loading protected preview...'));
    try {
      var data = await fetchPreviewData(token);
      if (requestId !== previewRequestId) return;
      renderPreview(data);
    } catch (error) {
      if (requestId !== previewRequestId) return;
      if (token && isAccessError(error)) {
        clearStoredPreviewToken();
        try {
          var fallbackData = await fetchPreviewData('');
          if (requestId !== previewRequestId) return;
          renderPreview(fallbackData);
          return;
        } catch (fallbackError) {
          error = fallbackError;
        }
      }
      logger.warn('Campaign preview failed', error);
      frame.hidden = true;
      if (isAccessError(error)) {
        showAccessNotice();
        return;
      }
      hideNotice();
      setStatus(message('previewError', 'Preview unavailable.'));
    }
  }

  loadPreview();

  window.addEventListener('pageshow', function(event) {
    var restoredWithoutFrame = root.dataset.campaignPreviewLoaded === 'true' &&
      frame instanceof HTMLIFrameElement &&
      (frame.hidden || !frame.srcdoc);
    if (event?.persisted || restoredWithoutFrame) loadPreview();
  });
})();
