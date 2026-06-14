(function() {
  'use strict';

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
    frame.srcdoc = data.preview?.html || '';
    frame.hidden = false;
    root.dataset.campaignPreviewLoaded = 'true';
    hideNotice();
    setStatus('');
  }

  async function loadPreview() {
    var requestId = ++previewRequestId;
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
