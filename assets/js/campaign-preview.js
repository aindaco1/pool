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
    var activePlayLink = null;
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
      var id = link && youtubeVideoId(link.href);
      if (!id || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      activePlayLink = link;
      window.parent.postMessage({ type: mediaMessage, videoId: id }, parentOrigin);
    });
    window.addEventListener('message', function(event) {
      if (event.source === window.parent && event.origin === parentOrigin &&
          event.data?.type === mediaMessage + ':closed') activePlayLink?.focus();
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
  var videoDialog = root.querySelector('[data-preview-video-dialog]');
  var videoPlayer = root.querySelector('[data-preview-video-player]');

  function closeVideo() {
    videoPlayer?.replaceChildren();
    if (videoDialog?.open) videoDialog.close();
  }

  if (videoDialog && videoPlayer) {
    root.querySelector('[data-preview-video-close]').addEventListener('click', closeVideo);
    videoDialog.addEventListener('close', function() {
      videoPlayer.replaceChildren();
      // The srcdoc frame has an opaque origin; this message contains no data.
      frame.contentWindow?.postMessage({ type: mediaMessage + ':closed' }, '*');
    });
    window.addEventListener('message', function(event) {
      if (event.source !== frame.contentWindow || event.origin !== 'null' || frame.hidden ||
          root.dataset.campaignPreviewLoaded !== 'true' || event.data?.type !== mediaMessage ||
          !previewVideos.has(event.data.videoId)) return;
      var player = document.createElement('iframe');
      player.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(event.data.videoId) + '?autoplay=1&rel=0';
      player.title = previewVideos.get(event.data.videoId);
      player.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
      player.referrerPolicy = 'strict-origin-when-cross-origin';
      player.allowFullscreen = true;
      videoPlayer.replaceChildren(player);
      if (!videoDialog.open) videoDialog.showModal();
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
    previewDocument.querySelectorAll('a.hero__video-play--youtube').forEach(function(link) {
      var id = youtubeVideoId(link.href);
      if (id) previewVideos.set(id, link.getAttribute('aria-label') || message('previewVideoTitle', 'Campaign video'));
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
    closeVideo();
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
