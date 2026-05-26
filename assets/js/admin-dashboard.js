(function() {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-admin-dashboard-script="true"]');
  if (!script) return;

  var logger = window.PoolLogger?.createLogger('admin') || {
    debug: function() {},
    info: function() {},
    warn: function() {},
    error: function() {}
  };

  var config = window.POOL_CONFIG || {};
  var messages = config.i18n?.messages?.admin || {};
  var lang = config.i18n?.currentLang || document.documentElement.lang || 'en';
  var workerBase = config.platform?.workerUrl || config.workerBase || '';
  var siteUrl = config.platform?.siteUrl || config.siteUrl || window.location.origin || '';
  var canonicalSiteUrl = script.dataset.canonicalSiteUrl || '';
  var canonicalWorkerBase = script.dataset.canonicalWorkerBase || '';

  var authPanel = document.getElementById('admin-auth-panel');
  var loginForm = document.getElementById('admin-login-form');
  var emailInput = document.getElementById('admin-email');
  var authStatus = document.getElementById('admin-auth-status');
  var app = document.getElementById('admin-app');
  var logoutButton = document.getElementById('admin-logout');
  var sessionSummary = document.getElementById('admin-session-summary');
  var tabButtons = Array.from(document.querySelectorAll('[data-admin-tab]'));
  var tabPanels = Array.from(document.querySelectorAll('[data-admin-tab-panel]'));
  var settingsPublish = document.getElementById('admin-settings-publish');
  var settingsStatus = document.getElementById('admin-settings-status');
  var settingsSectionTabsRoot = document.getElementById('admin-settings-section-tabs');
  var settingsRoot = document.getElementById('admin-settings-results');
  var campaignTabsRoot = document.getElementById('admin-campaign-tabs');
  var campaignSettingsRoot = document.getElementById('admin-campaign-settings-results');
  var addOnsPublish = document.getElementById('admin-addons-publish');
  var addOnsStatus = document.getElementById('admin-addons-status');
  var addOnsRoot = document.getElementById('admin-addons-results');
  var reportPreviewForm = document.getElementById('admin-report-preview-form');
  var reportCampaign = document.getElementById('admin-report-campaign');
  var reportType = document.getElementById('admin-report-type');
  var reportDownload = document.getElementById('admin-report-download');
  var reportStatus = document.getElementById('admin-report-status');
  var reportPreviewRoot = document.getElementById('admin-report-preview');
  var reportSort = { index: -1, direction: 'asc' };
  var inventorySection = document.getElementById('admin-inventory-section');
  var inventoryLoad = document.getElementById('admin-inventory-load');
  var inventoryStatus = document.getElementById('admin-inventory-status');
  var inventoryRoot = document.getElementById('admin-inventory-results');
  var marketingForm = document.getElementById('admin-marketing-builder');
  var marketingCampaign = document.getElementById('admin-marketing-campaign');
  var marketingSource = document.getElementById('admin-marketing-source');
  var marketingMedium = document.getElementById('admin-marketing-medium');
  var marketingContent = document.getElementById('admin-marketing-content');
  var marketingRef = document.getElementById('admin-marketing-ref');
  var marketingReferrer = document.getElementById('admin-marketing-referrer');
  var marketingUrl = document.getElementById('admin-marketing-url');
  var marketingCopyUrl = document.getElementById('admin-marketing-copy-url');
  var marketingSaveReferral = document.getElementById('admin-marketing-save-referral');
  var marketingCancelEdit = document.getElementById('admin-marketing-cancel-edit');
  var marketingStatus = document.getElementById('admin-marketing-status');
  var marketingSnippets = document.getElementById('admin-marketing-snippets');
  var marketingReferralsRoot = document.getElementById('admin-marketing-referrals');
  var marketingEmbedBuilder = document.querySelector('[data-admin-marketing-embed]');
  var analyticsCampaign = document.getElementById('admin-analytics-campaign');
  var analyticsStatus = document.getElementById('admin-analytics-status');
  var analyticsRoot = document.getElementById('admin-analytics-results');
  var analyticsSort = { index: -1, direction: 'asc' };
  var contentCampaign = document.getElementById('admin-content-campaign');
  var contentLoad = document.getElementById('admin-content-load');
  var contentEditor = document.getElementById('admin-content-editor');
  var contentTitleField = document.getElementById('admin-content-title-field');
  var contentShortBlurb = document.getElementById('admin-content-short-blurb');
  var contentBlocksRoot = document.getElementById('admin-content-blocks');
  var contentLongContent = document.getElementById('admin-content-long-content');
  if (contentBlocksRoot) contentBlocksRoot.dataset.contentEditorId = 'campaign';
  var contentSaveDraft = document.getElementById('admin-content-save-draft');
  var contentPublish = document.getElementById('admin-content-publish');
  var contentStatus = document.getElementById('admin-content-status');
  var contentValidation = document.getElementById('admin-content-validation');
  var contentPreviewGrid = document.querySelector('.admin-content__preview-grid');
  var contentPreviewDesktop = document.getElementById('admin-content-preview-desktop');
  var contentPreviewMobile = document.getElementById('admin-content-preview-mobile');
  var supporterFilters = document.getElementById('admin-supporter-filters');
  var supporterCampaign = document.getElementById('admin-supporter-campaign');
  var supporterStatus = document.getElementById('admin-supporter-status');
  var supporterFulfillment = document.getElementById('admin-supporter-fulfillment');
  var supporterQuery = document.getElementById('admin-supporter-query');
  var supportersStatus = document.getElementById('admin-supporters-status');
  var supportersRoot = document.getElementById('admin-supporters-results');
  var supportersExport = document.getElementById('admin-supporters-export');
  var supportersNext = document.getElementById('admin-supporters-next');
  var supporterSort = { key: '', direction: 'asc' };

  var currentUser = null;
  var currentCsrf = '';
  var currentCampaigns = [];
  var currentSettings = null;
  var selectedSettingsSectionId = '';
  var currentCampaignSettingsSections = [];
  var selectedCampaignSettingsSlug = '';
  var supporterCursor = 0;
  var supporterNextCursor = null;
  var supporterFilterTimer = 0;
  var marketingStorageKey = 'pool-admin-marketing-builder';
  var marketingEditingOriginalCode = '';
  var marketingEmbedSyncedSlug = '';
  var contentStoragePrefix = 'pool-admin-content-draft:';
  var loadedContentCampaignSlug = '';
  var contentBlocks = [];
  var contentBlockTypes = ['text', 'quote', 'image', 'gallery', 'video', 'audio', 'embed', 'divider'];
  var contentAlignments = ['left', 'center', 'right', 'justify'];
  var contentTextFormats = ['p', 'h2', 'h3', 'h4'];
  var activeContentEditable = null;
  var activeContentLink = null;
  var activeContentJsonField = contentLongContent;
  var deferredContentTouchActivationTimer = 0;
  var deferContentTouchActivationUntil = 0;
  var suppressContentSettingsClickUntil = 0;
  var contentHistory = [];
  var lastContentMutation = '';
  var activeDiaryContentField = null;
  var campaignContentBeforeDiary = null;
  var contentPreviewTimer = 0;
  var contentPreviewRequestId = 0;
  var contentSavedSnapshot = '';
  var contentHasUnsavedChanges = false;
  var collectionFieldIdCounter = 0;
  var contentEditorInstanceCounter = 0;
  var activeSettingsSectionHasPublishableControls = true;
  var mobileTabSelectIdCounter = 0;
  var mobileTabSelects = new WeakMap();

  function t(key, fallback, replacements) {
    var text = messages[key] || fallback || key;
    Object.keys(replacements || {}).forEach(function(name) {
      text = text.replace(new RegExp('%\\{' + name + '\\}', 'g'), replacements[name]);
    });
    return text;
  }

  function i18nFragment(value, fallback) {
    return String(value || fallback || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\+/g, ' plus ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function optionTranslationKeyPrefix(row, scope) {
    var path = i18nFragment(row?.path || row?.label || '');
    return (scope === 'campaign' ? 'campaign_option_' : 'settings_option_') + path;
  }

  function localizeSettingsOption(optionConfig, row, scope) {
    var value = String(optionConfig?.value ?? '');
    var label = String(optionConfig?.label ?? value);
    var valueKey = i18nFragment(value || label, 'blank');
    var fieldKey = optionTranslationKeyPrefix(row, scope) + '_' + valueKey;
    var genericKey = 'option_' + valueKey;
    return Object.assign({}, optionConfig, {
      label: t(fieldKey, t(genericKey, label))
    });
  }

  function settingsFieldTranslationKey(row, scope) {
    var path = i18nFragment(row?.path || '');
    if (path) return (scope === 'campaign' ? 'campaign_field_' : 'settings_field_') + path;
    return (scope === 'campaign' ? 'campaign_readonly_' : 'settings_readonly_') + i18nFragment(row?.label || '', 'value');
  }

  function localizeReadOnlySettingsValue(row) {
    if (row?.editable) return row?.value;
    if (typeof row?.rawValue === 'boolean') return t(row.rawValue ? 'yes' : 'no', row.rawValue ? 'Yes' : 'No');
    var value = String(row?.value ?? '');
    var exact = {
      Configured: 'settings_status_configured',
      Missing: 'settings_status_missing',
      'Not configured': 'settings_status_not_configured',
      'Optional / not configured': 'settings_status_optional_not_configured',
      'GitHub secret / local shell only': 'settings_status_github_secret_or_local_shell'
    };
    if (exact[value]) return t(exact[value], value);
    if (row?.path === 'state' || String(row?.sourceLabel || row?.label || '') === 'State') return campaignStateLabel(value);
    return value;
  }

  function setText(node, value) {
    if (node) node.textContent = value || '';
  }

  function syncMobileTabSelect(tablist, options) {
    if (!(tablist instanceof HTMLElement)) return;
    var buttons = Array.from(tablist.querySelectorAll(options?.buttonSelector || '[role="tab"]'))
      .filter(function(button) {
        return button instanceof HTMLButtonElement && !button.hidden;
      });
    var state = mobileTabSelects.get(tablist);
    if (!state) {
      var wrapper = document.createElement('div');
      wrapper.className = 'admin-mobile-tab-select';
      var selectId = (tablist.id || 'admin-mobile-tab-select') + '-' + String(++mobileTabSelectIdCounter);
      var label = document.createElement('label');
      label.className = 'admin-mobile-tab-select__label';
      label.setAttribute('for', selectId);
      var select = document.createElement('select');
      select.id = selectId;
      select.className = 'admin-settings__input admin-mobile-tab-select__control';
      wrapper.append(label, select);
      tablist.insertAdjacentElement('afterend', wrapper);
      state = { wrapper: wrapper, label: label, select: select };
      mobileTabSelects.set(tablist, state);
    }

    state.label.textContent = options?.label || tablist.getAttribute('aria-label') || t('mobile_menu_label', 'Choose section');
    state.wrapper.hidden = tablist.hidden || buttons.length < 2;
    state.select.replaceChildren();
    var selectedValue = '';
    buttons.forEach(function(button) {
      var value = String(options?.value ? options.value(button) : button.id || button.textContent || '');
      var option = document.createElement('option');
      option.value = value;
      option.textContent = (button.textContent || value).trim();
      state.select.append(option);
      if (button.getAttribute('aria-selected') === 'true') selectedValue = value;
    });
    if (selectedValue) state.select.value = selectedValue;
    state.select.onchange = function() {
      var value = state.select.value;
      var targetButton = buttons.find(function(button) {
        return String(options?.value ? options.value(button) : button.id || button.textContent || '') === value;
      });
      if (!(targetButton instanceof HTMLButtonElement)) return;
      if (typeof options?.activate === 'function') {
        options.activate(value, targetButton);
      } else {
        targetButton.click();
      }
    };
  }

  function syncAdminMobileTabs() {
    syncMobileTabSelect(document.querySelector('[data-admin-tabs] > .admin-tabs__list'), {
      label: t('tabs_label', 'Admin sections'),
      buttonSelector: '[data-admin-tab]',
      value: function(button) { return button.dataset.adminTab || ''; },
      activate: function(value) { activateAdminTab(value); }
    });
  }

  function adminTabCompactLabel(tabName, fallback) {
    var labels = {
      settings: t('settings_short_title', 'Settings'),
      addons: t('addons_short_title', 'Add-ons'),
      campaigns: t('campaign_settings_short_title', 'Campaigns'),
      analytics: t('analytics_short_title', 'Analytics'),
      reports: t('reports_short_title', 'Reports'),
      supporters: t('supporters_short_title', 'Supporters'),
      marketing: t('marketing_short_title', 'Marketing')
    };
    return labels[tabName] || fallback || tabName;
  }

  function applyAdminTabCompactLabels() {
    tabButtons.forEach(function(button) {
      if (!(button instanceof HTMLButtonElement)) return;
      var fullLabel = (button.getAttribute('aria-label') || button.textContent || '').trim();
      if (!button.querySelector('.admin-tabs__label')) {
        button.replaceChildren();
        var label = document.createElement('span');
        label.className = 'admin-tabs__label';
        label.textContent = fullLabel;
        button.append(label);
      }
      button.setAttribute('aria-label', fullLabel);
      button.title = fullLabel;
      button.dataset.compactLabel = adminTabCompactLabel(button.dataset.adminTab || '', fullLabel);
    });
  }

  function syncSettingsSectionMobileTabs() {
    syncMobileTabSelect(settingsSectionTabsRoot, {
      label: t('settings_sections_label', 'Settings sections'),
      buttonSelector: '[data-settings-section-tab]',
      value: function(button) { return button.dataset.settingsSectionTab || ''; },
      activate: function(value) { selectSettingsSection(value); }
    });
  }

  function syncCampaignSettingsMobileTabs() {
    syncMobileTabSelect(campaignTabsRoot, {
      label: t('campaign_settings_tabs_label', 'Campaign settings sections'),
      buttonSelector: '[data-campaign-settings-tab]',
      value: function(button) { return button.dataset.campaignSettingsTab || ''; },
      activate: function(value) { selectCampaignSettings(value); }
    });
  }

  function syncCampaignSubtabMobileTabs(panel) {
    if (!(panel instanceof HTMLElement)) return;
    var subtabList = panel.querySelector('.admin-campaign-section-tabs');
    syncMobileTabSelect(subtabList, {
      label: subtabList?.getAttribute('aria-label') || t('campaign_settings_subtabs_label', 'sections'),
      buttonSelector: '[data-campaign-settings-subtab]',
      value: function(button) { return button.dataset.campaignSettingsSubtab || ''; },
      activate: function(value) { selectCampaignSettingsSubtab(panel, value); }
    });
  }

  function settingsHaveUnsavedChanges(roots) {
    return collectSettingsChanges(roots).length > 0;
  }

  function adminUsersEditor() {
    return settingsRoot?.querySelector?.('[data-admin-users-editor]');
  }

  function adminUsersHaveUnsavedChanges() {
    var editor = adminUsersEditor();
    return Boolean(editor && String(editor.value || '') !== String(editor.dataset.adminUsersSavedValue || ''));
  }

  function campaignSettingsHaveUnsavedChanges() {
    return settingsHaveUnsavedChanges(campaignSettingsRoot ? [campaignSettingsRoot] : []);
  }

  function adminHasUnsavedChanges() {
    return contentHasUnsavedChanges || settingsHaveUnsavedChanges() || adminUsersHaveUnsavedChanges();
  }

  function setDirtyButtonState(button, dirty, cleanText, dirtyText, options) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.classList.toggle('is-dirty', Boolean(dirty));
    button.dataset.dirtyState = dirty ? 'dirty' : 'clean';
    button.textContent = dirty ? dirtyText : cleanText;
    if (options?.disableWhenClean !== false) {
      button.disabled = !dirty || Boolean(options?.forceDisabled);
    }
  }

  function updateDirtyIndicators() {
    var settingsDirty = settingsHaveUnsavedChanges();
    var campaignDirty = contentHasUnsavedChanges || campaignSettingsHaveUnsavedChanges();
    var settingsCleanText = t('settings_publish', 'Publish');
    var settingsDirtyText = t('settings_publish_unsaved', 'Publish');
    setDirtyButtonState(settingsPublish, settingsDirty, settingsCleanText, settingsDirtyText, {
      forceDisabled: !activeSettingsSectionHasPublishableControls
    });
    setDirtyButtonState(addOnsPublish, settingsDirty, settingsCleanText, settingsDirtyText);
    updateAdminUsersSaveState(adminUsersEditor());
    setDirtyButtonState(contentPublish, campaignDirty, t('content_publish', 'Publish'), t('content_publish', 'Publish'), {
      forceDisabled: activeDiaryContentField instanceof HTMLTextAreaElement
    });
    setDirtyButtonState(contentSaveDraft, contentHasUnsavedChanges, t('content_save_draft', 'Save draft'), t('content_save_draft', 'Save draft'));
  }

  function markDiaryEditorDirty(root, dirty) {
    var editorRoot = root?.closest?.('.admin-settings__diary-content') || root;
    if (!(editorRoot instanceof HTMLElement)) return;
    var save = editorRoot.querySelector('[data-diary-save-draft]');
    editorRoot.classList.toggle('is-dirty', Boolean(dirty));
    setDirtyButtonState(save, dirty, t('content_save_draft', 'Save draft'), t('content_save_draft', 'Save draft'));
  }

  function updateAdminDirtyIndicatorsSoon() {
    window.requestAnimationFrame(updateDirtyIndicators);
  }

  function apiUrl(path) {
    return String(workerBase || '').replace(/\/$/, '') + path;
  }

  function absoluteSiteUrl(path) {
    var base = String(siteUrl || window.location.origin || '').trim() || 'https://pool.dustwave.xyz';
    return new URL(path, base.replace(/\/$/, '') + '/');
  }

  function mediaPreviewUrl(path) {
    var value = String(path || '').trim();
    if (!value) return '';
    if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
    if (value.startsWith('/')) return value;
    return absoluteSiteUrl(value).toString();
  }

  async function requestJson(path, options) {
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options?.headers || {});
    if (currentCsrf && options?.method && options.method !== 'GET') {
      headers['x-pool-admin-csrf'] = currentCsrf;
    }
    var response = await fetch(apiUrl(path), Object.assign({}, options || {}, {
      credentials: 'include',
      headers: headers
    }));
    var data = await response.json().catch(function() { return {}; });
    if (!response.ok) {
      var error = new Error(data.error || 'Request failed');
      error.response = response;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function requestBlob(path, options) {
    var headers = Object.assign({}, options?.headers || {});
    var response = await fetch(apiUrl(path), Object.assign({}, options || {}, {
      credentials: 'include',
      headers: headers
    }));
    if (!response.ok) {
      var data = await response.json().catch(function() { return {}; });
      var error = new Error(data.error || 'Request failed');
      error.response = response;
      error.data = data;
      throw error;
    }
    return {
      blob: await response.blob(),
      filename: getFilenameFromDisposition(response.headers.get('Content-Disposition'))
    };
  }

  function getFilenameFromDisposition(disposition) {
    var match = String(disposition || '').match(/filename="([^"]+)"/);
    return match ? match[1] : '';
  }

  function showAuth(message) {
    if (authPanel) authPanel.hidden = false;
    if (app) app.hidden = true;
    if (logoutButton) logoutButton.hidden = true;
    setText(authStatus, message || '');
  }

  function showApp(user) {
    currentUser = user;
    if (authPanel) authPanel.hidden = true;
    if (app) app.hidden = false;
    if (logoutButton) logoutButton.hidden = false;
    syncAdminTabsForRole(user);
    var roleLabel = user?.role === 'super_admin'
      ? t('role_super_admin', 'super admin')
      : t('role_campaign_user', 'campaign user');
    setText(sessionSummary, t('signed_in_as', 'Signed in as %{email} (%{role})', {
      email: user?.email || '',
      role: roleLabel
    }));
  }

  function visibleAdminTabButtons() {
    return tabButtons.filter(function(button) {
      return button instanceof HTMLButtonElement && !button.hidden;
    });
  }

  function syncAdminTabsForRole(user) {
    var canManagePlatform = user?.role === 'super_admin';
    var settingsTab = document.querySelector('[data-admin-tab="settings"]');
    if (settingsTab instanceof HTMLButtonElement) settingsTab.hidden = !canManagePlatform;
    var settingsPanel = document.querySelector('[data-admin-tab-panel="settings"]');
    if (settingsPanel instanceof HTMLElement) settingsPanel.dataset.adminRestricted = canManagePlatform ? 'false' : 'true';
    var addOnsTab = document.querySelector('[data-admin-tab="addons"]');
    if (addOnsTab instanceof HTMLButtonElement) addOnsTab.hidden = !canManagePlatform;
    var addOnsPanel = document.querySelector('[data-admin-tab-panel="addons"]');
    if (addOnsPanel instanceof HTMLElement) addOnsPanel.dataset.adminRestricted = canManagePlatform ? 'false' : 'true';
    var activeButton = tabButtons.find(function(button) {
      return button instanceof HTMLButtonElement && button.getAttribute('aria-selected') === 'true';
    });
    var activeTab = activeButton?.dataset?.adminTab || '';
    if (!canManagePlatform && (activeTab === 'settings' || activeTab === 'addons')) {
      activateAdminTab('campaigns');
    } else {
      activateAdminTab(activeTab || (canManagePlatform ? 'settings' : 'campaigns'));
    }
  }

  function activateAdminTab(name, options) {
    var targetName = String(name || 'settings');
    var targetButton = tabButtons.find(function(button) {
      return button instanceof HTMLButtonElement && button.dataset.adminTab === targetName && !button.hidden;
    });
    if (!(targetButton instanceof HTMLButtonElement)) {
      targetButton = visibleAdminTabButtons()[0];
      targetName = targetButton?.dataset?.adminTab || 'settings';
    }
    if (!(targetButton instanceof HTMLButtonElement)) return;
    tabButtons.forEach(function(button) {
      if (!(button instanceof HTMLButtonElement)) return;
      var selected = button === targetButton;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    tabPanels.forEach(function(panel) {
      if (!(panel instanceof HTMLElement)) return;
      var selected = panel.dataset.adminTabPanel === targetName;
      panel.hidden = !selected || panel.dataset.adminRestricted === 'true';
    });
    if (targetName === 'campaigns') {
      mountContentEditorForCampaign(selectedCampaignSettingsSlug);
      loadContentCampaign({ skipIfLoaded: true });
    }
    syncAdminMobileTabs();
    if (options?.focus === true) targetButton?.focus();
  }

  function activeAdminStatus() {
    var activeTab = tabButtons.find(function(button) {
      return button instanceof HTMLButtonElement && button.getAttribute('aria-selected') === 'true';
    })?.dataset?.adminTab || 'settings';
    if (activeTab === 'settings') return settingsStatus;
    if (activeTab === 'campaigns') return contentStatus;
    if (activeTab === 'addons') return addOnsStatus;
    if (activeTab === 'reports') return reportStatus;
    if (activeTab === 'marketing') return marketingStatus;
    if (activeTab === 'analytics') return analyticsStatus;
    if (activeTab === 'supporters') return supportersStatus;
    return settingsStatus || authStatus;
  }

  function formatMoney(cents) {
    return new Intl.NumberFormat(lang || 'en', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format((Number(cents || 0) || 0) / 100);
  }

  function formatPercent(value) {
    return new Intl.NumberFormat(lang || 'en', {
      maximumFractionDigits: 0
    }).format(Number(value || 0)) + '%';
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(lang || 'en').format(Number(value || 0) || 0);
  }

  function statCard(baseClass, label, value) {
    var card = document.createElement('section');
    card.className = baseClass;
    var valueNode = document.createElement('span');
    valueNode.className = baseClass + '-value';
    valueNode.textContent = value;
    var labelNode = document.createElement('span');
    labelNode.className = baseClass + '-label';
    labelNode.textContent = label;
    card.append(valueNode, labelNode);
    return card;
  }

  function appendTableHeader(row, labels) {
    labels.forEach(function(label) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      row.append(th);
    });
  }

  function appendTextCells(row, values) {
    values.forEach(function(value) {
      var td = document.createElement('td');
      td.textContent = value;
      row.append(td);
    });
  }

  function renderSummary(summary) {
    currentCampaigns = Array.isArray(summary?.campaigns) ? summary.campaigns : [];
    renderCampaignOptions(currentCampaigns);
  }

  function settingsRowsForRender(rows) {
    var output = [];
    var index = 0;
    while (index < (rows || []).length) {
      var row = rows[index];
      var group = row?.layoutGroup || '';
      if (!group) {
        output.push(row);
        index += 1;
        continue;
      }
      var grouped = [];
      while (index < rows.length && rows[index]?.layoutGroup === group) {
        grouped.push(rows[index]);
        index += 1;
      }
      output.push(grouped.length > 1
        ? { input: 'settings-field-grid', rows: grouped, label: grouped.map(function(item) { return item.label; }).join(', '), layoutGroup: group }
        : grouped[0]);
    }
    return output;
  }

  function appendSettingsControl(parent, row, section, index) {
    var describedById = settingsHelpId(row, section?.title, index);
    if (row?.input === 'content-editor') {
      var slot = document.createElement('div');
      slot.className = 'admin-settings__content-editor-slot';
      slot.dataset.contentEditorSlot = row.campaignSlug || campaignSettingsSlug(section) || '';
      describeCompositeControl(slot, describedById, row?.label || row?.path || '');
      parent.append(slot);
      return;
    }
    if (row?.input === 'slug-derived' || row?.input === 'url-derived') {
      var derived = createSettingsInput(row);
      derived.dataset.settingsDerivedCampaign = row.campaignSlug || campaignSettingsSlug(section) || '';
      derived.dataset.settingsDerivedOriginal = String(row.rawValue || row.value || '');
      derived.setAttribute('aria-label', row.label || row.path);
      appendDescribedBy(derived, describedById);
      parent.append(derived);
      return;
    }
    if (row?.editable && row?.path) {
      var fieldId = 'admin-setting-' + String(row.campaignSlug || 'platform') + '-' + String(row.path).replace(/[^a-z0-9_-]+/gi, '-');
      var control = createSettingsInput(row);
      control.id = fieldId;
      if (!['add-on-products', 'admin-users', 'campaign-collection', 'image-upload', 'video-upload', 'rich-text-inline', 'email-list', 'checkbox-list'].includes(row.input)) control.classList.add('admin-settings__input');
      control.classList.add('admin-settings__input--' + String(row.input || row.type || 'text').replace(/[^a-z0-9_-]+/gi, '-'));
      control.dataset.settingsPath = row.path;
      control.dataset.settingsType = row.type || 'string';
      control.dataset.settingsInput = row.input || row.type || 'text';
      if (row.input === 'admin-users') control.dataset.settingsRuntimeOnly = 'true';
      if (row.submitDivisor !== undefined) control.dataset.settingsSubmitDivisor = String(row.submitDivisor);
      if (row.timeParts?.hourPath && row.timeParts?.minutePath) {
        control.dataset.settingsTimeHourPath = row.timeParts.hourPath;
        control.dataset.settingsTimeMinutePath = row.timeParts.minutePath;
        control.dataset.settingsTimeOriginalHour = String(normalizeTimePart(row.timeParts.hour, 0, 23));
        control.dataset.settingsTimeOriginalMinute = String(normalizeTimePart(row.timeParts.minute, 0, 59));
      }
      control.dataset.settingsOriginal = String(control.value || '');
      if (row.campaignSlug) control.dataset.settingsCampaign = row.campaignSlug;
      control.setAttribute('aria-label', row.label || row.path);
      describeCompositeControl(control, describedById, row.label || row.path);
      if (row.input === 'currency') {
        var prefix = document.createElement('span');
        prefix.className = 'admin-settings__affix';
        prefix.textContent = '$';
        var wrap = document.createElement('span');
        wrap.className = 'admin-settings__input-wrap';
        wrap.append(prefix, control);
        parent.append(wrap);
      } else if (row.input === 'percent') {
        var suffix = document.createElement('span');
        suffix.className = 'admin-settings__affix';
        suffix.textContent = '%';
        var percentWrap = document.createElement('span');
        percentWrap.className = 'admin-settings__input-wrap';
        percentWrap.append(control, suffix);
        parent.append(percentWrap);
      } else {
        parent.append(control);
      }
      return;
    }
    parent.textContent = row?.value || '';
  }

  function applySettingsVisibleWhenDataset(element, row) {
    if (!element || !row?.visibleWhen?.path) return;
    element.dataset.settingsVisibleWhenPath = row.visibleWhen.path;
    element.dataset.settingsVisibleWhenValue = String(row.visibleWhen.value ?? '');
    if (row.visibleWhen.campaignSlug) element.dataset.settingsVisibleWhenCampaign = row.visibleWhen.campaignSlug;
  }

  function renderSettingsTable(section, options) {
    var group = document.createElement('section');
    group.className = 'admin-settings__group';
    var heading = document.createElement('h3');
    heading.textContent = section?.title || t('settings_group', 'Settings');
    var table = document.createElement('table');
    table.className = 'admin-settings__table';
    var caption = document.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = heading.textContent;
    var tbody = document.createElement('tbody');
    function shouldHideFieldLabel(row) {
      if (options?.hideFieldLabels === true) return true;
      if (Array.isArray(options?.hideFieldLabels)) {
        return options.hideFieldLabels.includes(row?.path) || options.hideFieldLabels.includes(row?.label);
      }
      return false;
    }
    settingsRowsForRender(section?.rows || []).forEach(function(row, index) {
      var tr = document.createElement('tr');
      tr.dataset.settingsRowLabel = row?.label || '';
      applySettingsVisibleWhenDataset(tr, row);
      var renderFullWidth = options?.fullWidthRows === true || row?.input === 'settings-field-grid';
      if (renderFullWidth) tr.classList.add('admin-settings__row--full');
      var th = document.createElement('th');
      th.scope = 'row';
      th.append(renderSettingsLabel(row, section?.title, index));
      var td = document.createElement('td');
      if (renderFullWidth) td.colSpan = 2;
      if (row?.input === 'settings-field-grid') {
        var fieldGrid = document.createElement('div');
        fieldGrid.className = 'admin-settings__field-grid';
        fieldGrid.classList.add('admin-settings__field-grid--count-' + String(row.rows.length));
        row.rows.forEach(function(childRow, childIndex) {
          var field = document.createElement('div');
          field.className = 'admin-settings__field-grid-item';
          field.dataset.settingsRowLabel = childRow?.label || '';
          applySettingsVisibleWhenDataset(field, childRow);
          var label = renderSettingsLabel(childRow, section?.title, String(index) + '-' + String(childIndex));
          var controlWrap = document.createElement('div');
          appendSettingsControl(controlWrap, childRow, section, String(index) + '-' + String(childIndex));
          field.append(label, controlWrap);
          fieldGrid.append(field);
        });
        td.append(fieldGrid);
      } else if (renderFullWidth && shouldHideFieldLabel(row)) {
        appendSettingsControl(td, row, section, index);
      } else if (renderFullWidth) {
        var fieldStack = document.createElement('div');
        fieldStack.className = 'admin-settings__field-stack';
        var topLabel = renderSettingsLabel(row, section?.title, index);
        var topControlWrap = document.createElement('div');
        appendSettingsControl(topControlWrap, row, section, index);
        fieldStack.append(topLabel, topControlWrap);
        td.append(fieldStack);
      } else {
        appendSettingsControl(td, row, section, index);
      }
      if (renderFullWidth) {
        tr.append(td);
      } else {
        tr.append(th, td);
      }
      tbody.append(tr);
    });
    table.append(caption, tbody);
    if (!options?.hideHeading) group.append(heading);
    group.append(table);
    return group;
  }

  function safeHelpId(prefix, label, index) {
    return String(prefix || 'admin-setting-help') + '-' + String(label || index || 'field')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function settingsHelpId(row, sectionTitle, index) {
    if (!String(row?.help || '').trim()) return '';
    return safeHelpId('admin-setting-help', String(sectionTitle || 'settings') + '-' + String(row?.path || row?.label || index));
  }

  function createHelpControl(label, helpText, idBase) {
    var text = String(helpText || '').trim();
    if (!text) return null;
    var helpId = safeHelpId('admin-setting-help', idBase || label, collectionFieldIdCounter);
    var help = document.createElement('span');
    help.className = 'admin-settings__help';
    help.dataset.adminHelpId = helpId;
    var button = document.createElement('button');
    button.className = 'admin-settings__help-button';
    button.type = 'button';
    button.setAttribute('aria-label', t('settings_help_label', 'About') + ' ' + (label || 'setting'));
    button.setAttribute('aria-describedby', helpId);
    button.append(createIcon('info'));
    var tooltip = document.createElement('span');
    tooltip.className = 'admin-settings__help-tooltip';
    tooltip.id = helpId;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = text;
    help.append(button, tooltip);
    return help;
  }

  function appendDescribedBy(element, describedById) {
    if (!(element instanceof HTMLElement) || !describedById) return;
    var ids = new Set(String(element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(describedById);
    element.setAttribute('aria-describedby', Array.from(ids).join(' '));
  }

  function describeCompositeControl(control, describedById, label) {
    if (!(control instanceof HTMLElement) || !describedById) return;
    appendDescribedBy(control, describedById);
    control.querySelectorAll('input, select, textarea, [role="textbox"]').forEach(function(child) {
      appendDescribedBy(child, describedById);
    });
    if (control.tagName === 'DIV' && label && !control.getAttribute('role')) {
      control.setAttribute('role', 'group');
    }
    if (!control.getAttribute('aria-label') && label && ['DIV', 'FIELDSET'].includes(control.tagName)) {
      control.setAttribute('aria-label', label);
    }
  }

  function appendRequiredMarker(label) {
    var marker = document.createElement('span');
    marker.className = 'admin-settings__required';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = ' *';
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = ' ' + t('required_label', 'required');
    label.append(marker, sr);
  }

  function createProductLabelRow(labelText, helpText, idBase, options) {
    var row = document.createElement('span');
    row.className = 'admin-settings__product-label';
    if (options?.className) row.classList.add(options.className);
    var label = document.createElement(options?.htmlFor ? 'label' : 'span');
    if (options?.htmlFor) label.htmlFor = options.htmlFor;
    if (options?.labelId) label.id = options.labelId;
    label.append(document.createTextNode(labelText));
    if (options?.required) appendRequiredMarker(label);
    row.append(label);
    var help = createHelpControl(labelText, helpText || '', idBase);
    if (help) row.append(help);
    return { row, label, helpId: help?.dataset?.adminHelpId || '' };
  }

  function createAdminControl(options) {
    var input;
    if (options?.textarea) {
      input = document.createElement('textarea');
      input.rows = options.rows || 3;
    } else if (options?.select) {
      input = document.createElement('select');
      options.select.forEach(function(optionConfig) {
        var option = document.createElement('option');
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        input.append(option);
      });
    } else {
      input = document.createElement('input');
      input.type = options?.type || 'text';
    }
    return input;
  }

  function createAdminField(labelText, key, value, options, config) {
    var wrap = document.createElement('div');
    wrap.className = config?.className || 'admin-settings__product-field';
    if (options?.wide) wrap.classList.add('admin-settings__product-field--wide');
    if (options?.alignWithMedia) wrap.classList.add('admin-settings__product-field--media-paired');
    var input = createAdminControl(options);
    input.dataset[config.datasetKey] = key;
    input.value = value ?? '';
    input.id = config.idPrefix + '-' + String(collectionFieldIdCounter++);
    if (options?.step) input.step = options.step;
    if (options?.min !== undefined) input.min = String(options.min);
    if (options?.disabled) input.disabled = true;
    if (options?.readonly && 'readOnly' in input) {
      input.readOnly = true;
      input.classList.add('admin-settings__input--readonly');
    }
    var helpText = options?.help || (typeof config.helpFor === 'function' ? config.helpFor(key) : '');
    var labelRow = createProductLabelRow(labelText, helpText, input.id, {
      htmlFor: input.id,
      required: options?.required
    });
    if (labelRow.helpId) appendDescribedBy(input, labelRow.helpId);
    wrap.append(labelRow.row, input);
    return wrap;
  }

  function renderSettingsLabel(row, sectionTitle, index) {
    var wrap = document.createElement('span');
    wrap.className = 'admin-settings__label';
    var text = document.createElement('span');
    text.textContent = row?.label || '';
    wrap.append(text);

    var help = createHelpControl(row?.label || '', row?.help || '', String(sectionTitle || 'settings') + '-' + String(row?.path || row?.label || index));
    if (help) {
      wrap.dataset.adminHelpId = help.dataset.adminHelpId || '';
      wrap.append(help);
    }

    return wrap;
  }

  function createSettingsInput(row) {
    var inputType = row.input || row.type || 'text';
    var control;
    if (inputType === 'content-editor') {
      return contentEditor || document.createElement('div');
    }
    if (inputType === 'rich-text-inline') {
      return createInlineRichTextInput(row);
    }
    if (inputType === 'email-list') {
      return createEmailListInput(row);
    }
    if (inputType === 'checkbox-list') {
      return createCheckboxListInput(row);
    }
    if (inputType === 'slug-derived' || inputType === 'url-derived') {
      control = document.createElement('output');
      control.className = 'admin-settings__derived-value';
      control.value = String(row.rawValue ?? row.value ?? '');
      control.textContent = control.value;
      control.dataset.settingsDerived = inputType;
      control.dataset.settingsOriginal = control.value;
      control.setAttribute('aria-live', 'polite');
      return control;
    }
    if (inputType === 'select') {
      control = document.createElement('select');
      var optionValues = new Set();
      (Array.isArray(row.options) ? row.options : []).forEach(function(optionConfig) {
        var value = String(optionConfig?.value ?? '');
        optionValues.add(value);
        var option = document.createElement('option');
        option.value = value;
        option.textContent = optionConfig?.label || value;
        if (optionConfig?.disabled) option.disabled = true;
        control.append(option);
      });
      var currentValue = String(row.rawValue ?? '');
      if (currentValue && !optionValues.has(currentValue)) {
        var currentOption = document.createElement('option');
        currentOption.value = currentValue;
        currentOption.textContent = currentValue;
        control.prepend(currentOption);
      }
      control.value = currentValue;
      return control;
    }

    if (row.type === 'boolean') {
      control = document.createElement('select');
      [
        { value: 'true', label: t('yes', 'Yes') },
        { value: 'false', label: t('no', 'No') }
      ].forEach(function(optionConfig) {
        var option = document.createElement('option');
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        control.append(option);
      });
      control.value = String(row.rawValue === true || row.rawValue === 'true');
      return control;
    }

    if (inputType === 'add-on-products') {
      return createAddOnProductsEditor(row);
    }

    if (inputType === 'admin-users') {
      return createAdminUsersEditor(row);
    }

    if (inputType === 'campaign-collection') {
      return createCampaignCollectionEditor(row);
    }

    if (inputType === 'image-upload') {
      return createSettingsImageInput(row);
    }

    if (inputType === 'video-upload') {
      return createSettingsVideoInput(row);
    }

    if (inputType === 'textarea' || row.type === 'list' || String(row.value || '').length > 80) {
      control = document.createElement('textarea');
      control.value = row.type === 'list' && Array.isArray(row.rawValue)
        ? row.rawValue.join(inputType === 'url-list' ? '\n' : ', ')
        : String(row.rawValue ?? '');
      if (row.placeholder) control.placeholder = row.placeholder;
      return control;
    }

    control = document.createElement('input');
    if (inputType === 'currency' || inputType === 'percent' || inputType === 'integer' || inputType === 'decimal') {
      control.type = 'number';
      control.inputMode = inputType === 'integer' ? 'numeric' : 'decimal';
    } else if (inputType === 'date') {
      control.type = 'date';
    } else if (inputType === 'time') {
      control.type = 'time';
    } else if (inputType === 'color') {
      control.type = 'color';
    } else if (inputType === 'url') {
      control.type = 'url';
    } else if (inputType === 'email') {
      control.type = 'email';
    } else {
      control.type = 'text';
    }
    var displayMultiplier = Number(row.displayMultiplier || 1);
    if (!Number.isFinite(displayMultiplier) || displayMultiplier <= 0) displayMultiplier = 1;
    if (row.min !== undefined) control.min = String(formatSettingsNumberForInput(Number(row.min) * displayMultiplier));
    if (row.max !== undefined) control.max = String(formatSettingsNumberForInput(Number(row.max) * displayMultiplier));
    if (row.step !== undefined) control.step = String(formatSettingsNumberForInput(Number(row.step) * displayMultiplier));
    if (inputType === 'time') {
      control.value = formatSettingsTimeValue(row.timeParts?.hour, row.timeParts?.minute);
    } else if (inputType === 'color') {
      control.value = /^#[0-9a-f]{6}$/i.test(String(row.rawValue || '')) ? row.rawValue : '#000000';
    } else if (row.type === 'number' && displayMultiplier !== 1) {
      control.value = formatSettingsNumberForInput(Number(row.rawValue || 0) * displayMultiplier);
    } else {
      control.value = String(row.rawValue ?? '');
    }
    if (row.placeholder) control.placeholder = row.placeholder;
    return control;
  }

  function createInlineRichTextInput(row) {
    var root = document.createElement('div');
    root.className = 'admin-settings__rich-inline';
    var toolbar = document.createElement('div');
    toolbar.className = 'admin-settings__rich-inline-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', row.toolbarLabel || row.label || t('content_format_group', 'Text styling'));
    [
      { action: 'bold', label: t('content_format_bold', 'Bold'), text: 'B' },
      { action: 'italic', label: t('content_format_italic', 'Italic'), text: 'I' },
      { action: 'underline', label: t('content_format_underline', 'Underline'), text: 'U' }
    ].forEach(function(config) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--secondary btn--small admin-settings__rich-inline-button';
      button.dataset.richInlineAction = config.action;
      button.setAttribute('aria-label', config.label);
      button.textContent = config.text;
      toolbar.append(button);
    });
    var editor = document.createElement('div');
    editor.className = 'admin-settings__rich-inline-editor';
    editor.contentEditable = 'true';
    editor.spellcheck = true;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-label', row.label || '');
    editor.innerHTML = renderEditorInlineMarkdown(row.rawValue ?? row.value ?? '');
    root.value = nodeToMarkdown(editor).trim();
    var savedSelectionRange = null;
    function syncValue() {
      root.value = nodeToMarkdown(editor).trim();
      updateAdminDirtyIndicatorsSoon();
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function selectionIsInsideEditor() {
      var selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0) return false;
      var range = selection.getRangeAt(0);
      var node = range.commonAncestorContainer;
      return editor.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode);
    }
    function saveEditorSelection() {
      var selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0 || !selectionIsInsideEditor()) return;
      savedSelectionRange = selection.getRangeAt(0).cloneRange();
    }
    function restoreEditorSelection() {
      if (!savedSelectionRange) return;
      var selection = window.getSelection?.();
      if (!selection) return;
      editor.focus({ preventScroll: true });
      selection.removeAllRanges();
      selection.addRange(savedSelectionRange);
    }
    function inlineActionTag(action) {
      if (action === 'bold') return 'strong';
      if (action === 'italic') return 'em';
      if (action === 'underline') return 'u';
      return '';
    }
    function currentEditorRange() {
      var selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0) return null;
      var range = selection.getRangeAt(0);
      var node = range.commonAncestorContainer;
      return editor.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode) ? range : null;
    }
    function applyManualInlineAction(action, activeBefore) {
      var tag = inlineActionTag(action);
      var range = currentEditorRange() || savedSelectionRange;
      if (!tag || !range || range.collapsed || activeBefore) return false;
      var wrapper = document.createElement(tag);
      wrapper.append(range.extractContents());
      range.insertNode(wrapper);
      var nextRange = document.createRange();
      nextRange.selectNodeContents(wrapper);
      var selection = window.getSelection?.();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(nextRange);
      }
      savedSelectionRange = nextRange.cloneRange();
      return true;
    }
    function updateButtonState() {
      var selectionInside = selectionIsInsideEditor();
      if (selectionInside) saveEditorSelection();
      toolbar.querySelectorAll('[data-rich-inline-action]').forEach(function(button) {
        if (!(button instanceof HTMLButtonElement)) return;
        var isActive = false;
        if (selectionInside) {
          try {
            isActive = document.queryCommandState(button.dataset.richInlineAction || '');
          } catch (_error) {
            isActive = false;
          }
        }
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }
    editor.addEventListener('input', function() {
      syncValue();
      updateButtonState();
    });
    editor.addEventListener('paste', function(event) {
      var sanitized = sanitizedClipboardHtml(event, false);
      if (!sanitized) return;
      event.preventDefault();
      document.execCommand('insertHTML', false, sanitized);
      syncValue();
      updateButtonState();
    });
    editor.addEventListener('focus', updateButtonState);
    editor.addEventListener('keyup', updateButtonState);
    editor.addEventListener('mouseup', updateButtonState);
    function handleDocumentSelectionChange() {
      if (!root.isConnected) {
        document.removeEventListener('selectionchange', handleDocumentSelectionChange);
        return;
      }
      updateButtonState();
    }
    document.addEventListener('selectionchange', handleDocumentSelectionChange);
    toolbar.addEventListener('mousedown', function(event) {
      if (event.target?.closest?.('[data-rich-inline-action]')) {
        saveEditorSelection();
        event.preventDefault();
      }
    });
    toolbar.addEventListener('click', function(event) {
      var button = event.target?.closest?.('[data-rich-inline-action]');
      if (!(button instanceof HTMLButtonElement)) return;
      var action = button.dataset.richInlineAction || '';
      var activeBefore = button.getAttribute('aria-pressed') === 'true';
      saveEditorSelection();
      restoreEditorSelection();
      var before = nodeToMarkdown(editor).trim();
      document.execCommand(action, false, null);
      if (nodeToMarkdown(editor).trim() === before) applyManualInlineAction(action, activeBefore);
      syncValue();
      updateButtonState();
    });
    updateButtonState();
    root.append(toolbar, editor);
    return root;
  }

  function createEmailListInput(row) {
    var root = document.createElement('div');
    root.className = 'admin-settings__email-list';
    var list = document.createElement('div');
    list.className = 'admin-settings__email-list-items';
    var input = document.createElement('input');
    input.type = 'email';
    input.inputMode = 'email';
    input.autocomplete = 'email';
    input.className = 'admin-settings__email-list-input';
    input.setAttribute('aria-label', row.label || t('email_label_generic', 'Email'));
    root.value = '';

    function values() {
      return Array.from(list.querySelectorAll('[data-email-list-value]')).map(function(item) {
        return item.dataset.emailListValue || '';
      }).filter(Boolean);
    }
    function syncValue() {
      root.value = values().join(', ');
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function addEmail(value) {
      var email = String(value || '').trim().replace(/,+$/g, '');
      if (!email || values().includes(email)) return;
      var item = document.createElement('span');
      item.className = 'admin-settings__email-token';
      item.dataset.emailListValue = email;
      var text = document.createElement('span');
      text.textContent = email;
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', t('remove_email', 'Remove email') + ' ' + email);
      remove.textContent = 'x';
      remove.addEventListener('click', function() {
        item.remove();
        syncValue();
        input.focus();
      });
      item.append(text, remove);
      list.append(item);
      syncValue();
    }
    (Array.isArray(row.rawValue) ? row.rawValue : String(row.rawValue || '').split(',')).forEach(addEmail);
    input.addEventListener('keydown', function(event) {
      if (event.key === ',' || event.key === 'Enter') {
        event.preventDefault();
        addEmail(input.value);
        input.value = '';
      } else if (event.key === 'Backspace' && !input.value) {
        list.lastElementChild?.remove();
        syncValue();
      }
    });
    input.addEventListener('input', function() {
      if (!input.value.includes(',')) return;
      input.value.split(',').forEach(addEmail);
      input.value = '';
    });
    input.addEventListener('blur', function() {
      addEmail(input.value);
      input.value = '';
    });
    root.commitPending = function() {
      addEmail(input.value);
      input.value = '';
    };
    root.append(list, input);
    syncValue();
    return root;
  }

  function createCheckboxListInput(row) {
    var root = document.createElement('fieldset');
    root.className = 'admin-settings__checkbox-list';
    var legend = document.createElement('legend');
    legend.className = 'sr-only';
    legend.textContent = row.label || t('checkbox_options_label', 'Options');
    root.append(legend);
    var optionCount = 0;
    var selected = new Set((Array.isArray(row.rawValue) ? row.rawValue : String(row.rawValue || '').split(',')).map(function(item) {
      return String(item || '').trim();
    }).filter(Boolean));
    if (row.includeStandardOption !== false) {
      var standard = document.createElement('label');
      standard.className = 'admin-settings__checkbox-option';
      var standardInput = document.createElement('input');
      standardInput.type = 'checkbox';
      standardInput.checked = true;
      standardInput.disabled = true;
      standard.append(standardInput, document.createTextNode(t('shipping_option_standard', 'Standard')));
      root.append(standard);
      optionCount += 1;
    }

    function checkedValues() {
      return Array.from(root.querySelectorAll('input[data-checkbox-list-value]')).filter(function(input) {
        return input instanceof HTMLInputElement && input.checked && !input.disabled;
      }).map(function(input) {
        return input.dataset.checkboxListValue || '';
      }).filter(Boolean);
    }
    function syncValue() {
      root.value = checkedValues().join(', ');
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }
    (Array.isArray(row.options) ? row.options : []).forEach(function(optionConfig) {
      var value = String(optionConfig?.value ?? '').trim();
      if (!value) return;
      var label = document.createElement('label');
      label.className = 'admin-settings__checkbox-option';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = value;
      checkbox.dataset.checkboxListValue = value;
      if (row.checkboxDatasetKey) checkbox.dataset[row.checkboxDatasetKey] = value;
      checkbox.checked = selected.has(value);
      checkbox.disabled = optionConfig?.disabled === true;
      checkbox.addEventListener('change', syncValue);
      label.append(checkbox, document.createTextNode(optionConfig?.label || value));
      root.append(label);
      optionCount += 1;
    });
    if (!optionCount && row.emptyText) {
      var empty = document.createElement('p');
      empty.className = 'admin-settings__empty-note';
      empty.textContent = row.emptyText;
      root.append(empty);
    }
    syncValue();
    return root;
  }

  function createImageUploadField(options) {
    var root = document.createElement('div');
    root.className = options?.className || 'admin-settings__image-field';
    var currentPath = String(options?.value ?? '');
    root.value = currentPath;
    if (options?.dataset) {
      Object.entries(options.dataset).forEach(function(entry) {
        root.dataset[entry[0]] = entry[1];
      });
    }

    var previewWrap = document.createElement('div');
    previewWrap.className = 'admin-settings__image-preview';
    var preview = document.createElement(options?.previewType === 'video' ? 'video' : 'img');
    preview.alt = options?.previewAlt || t('settings_image_preview_alt', 'Current image preview');
    if (preview instanceof HTMLImageElement) {
      preview.loading = 'lazy';
    } else if (preview instanceof HTMLVideoElement) {
      preview.controls = true;
      preview.preload = 'auto';
      preview.muted = true;
      preview.playsInline = true;
      preview.setAttribute('aria-label', options?.previewAlt || t('settings_video_preview_alt', 'Current video preview'));
    }
    var previewEmpty = document.createElement('span');
    previewEmpty.textContent = options?.emptyText || t('settings_image_no_preview', 'No image preview');
    previewWrap.append(preview, previewEmpty);

    var uploadRow = document.createElement('div');
    uploadRow.className = 'admin-settings__image-upload';
    var fileLabel = document.createElement('label');
    fileLabel.className = 'btn btn--secondary';
    fileLabel.textContent = options?.uploadLabel || t('settings_image_upload', 'Upload image');
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = options?.accept || 'image/png,image/jpeg,image/webp,image/gif';
    if (options?.uploadDataset) {
      Object.entries(options.uploadDataset).forEach(function(entry) {
        fileInput.dataset[entry[0]] = entry[1];
      });
    }
    fileLabel.append(fileInput);
    var uploadStatus = document.createElement('span');
    uploadStatus.className = 'admin-settings__image-status';
    uploadStatus.setAttribute('role', 'status');
    uploadRow.append(fileLabel, uploadStatus);

    function setValue(value) {
      root.value = String(value || '');
      updatePreview(root.value);
      root.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function updatePreview(value) {
      var path = String(value || '').trim();
      if (!path) {
        preview.removeAttribute('src');
        if (preview instanceof HTMLVideoElement) preview.replaceChildren();
        preview.hidden = true;
        previewEmpty.hidden = false;
        return;
      }
      try {
        var previewUrl = mediaPreviewUrl(path);
        if (preview instanceof HTMLVideoElement) {
          if (preview.querySelector('source')?.getAttribute('src') === previewUrl) {
            preview.hidden = false;
            previewEmpty.hidden = true;
            return;
          }
          preview.replaceChildren();
          var source = document.createElement('source');
          source.src = previewUrl;
          if (/\.webm(?:[?#].*)?$/i.test(path)) source.type = 'video/webm';
          if (/\.mp4(?:[?#].*)?$/i.test(path)) source.type = 'video/mp4';
          if (/\.mov(?:[?#].*)?$/i.test(path)) source.type = 'video/quicktime';
          preview.append(source);
          preview.load();
        } else {
          preview.src = previewUrl;
        }
        preview.hidden = false;
        previewEmpty.hidden = true;
      } catch (_error) {
        preview.removeAttribute('src');
        if (preview instanceof HTMLVideoElement) preview.replaceChildren();
        preview.hidden = true;
        previewEmpty.hidden = false;
      }
    }

    fileInput.addEventListener('change', async function() {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var allowedTypes = options?.allowedTypes || ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        setText(uploadStatus, options?.typeErrorText || t('settings_image_upload_type_error', 'Use a PNG, JPEG, or WebP image.'));
        return;
      }
      var maxBytes = options?.maxBytes || 8 * 1024 * 1024;
      if (file.size > maxBytes) {
        setText(uploadStatus, options?.sizeErrorText || t('settings_image_upload_size_error', 'Image must be 8 MB or smaller.'));
        return;
      }
      setText(uploadStatus, options?.uploadingText || t('settings_image_uploading', 'Uploading image...'));
      try {
        var dataUrl = await readFileAsDataUrl(file);
        var uploadContext = typeof options?.uploadContext === 'function' ? options.uploadContext(root) : {};
        var filenameBase = typeof options?.filenameBase === 'function' ? options.filenameBase(root) : options?.filenameBase;
        var result = await requestJson(options?.uploadPath || '/admin/settings/image-upload', {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            content: dataUrl,
            kind: options?.kind || 'admin',
            campaignSlug: options?.campaignSlug || uploadContext?.campaignSlug || '',
            collection: options?.collection || uploadContext?.collection || '',
            fieldPath: options?.fieldPath || uploadContext?.fieldPath || '',
            filenameBase: filenameBase || uploadContext?.filenameBase || ''
          })
        });
        setValue(result.path || '');
        setText(uploadStatus, options?.uploadedText || t('settings_image_uploaded', 'Image uploaded. Publish settings to use it.'));
      } catch (error) {
        logger.error('Failed to upload admin image', error);
        setText(uploadStatus, error?.data?.error || t('settings_image_upload_failed', 'Unable to upload image.'));
      } finally {
        fileInput.value = '';
      }
    });

    root.append(previewWrap, uploadRow);
    updatePreview(currentPath);
    return root;
  }

  function createLogoPathInput(row) {
    return createImageUploadField({
      value: String(row.rawValue ?? row.value ?? ''),
      previewAlt: t('settings_logo_preview_alt', 'Current logo preview'),
      emptyText: t('settings_logo_no_preview', 'No logo preview'),
      uploadLabel: t('settings_logo_upload', 'Upload logo'),
      uploadedText: t('settings_logo_uploaded', 'Logo uploaded. Publish settings to use it.'),
      uploadPath: '/admin/settings/logo-upload',
      kind: 'logo',
      fieldPath: row?.path || 'platform.logo_path',
      filenameBase: 'logo',
      accept: 'image/png,image/jpeg,image/webp',
      allowedTypes: ['image/png', 'image/jpeg', 'image/webp'],
      maxBytes: 512 * 1024,
      typeErrorText: t('settings_logo_upload_type_error', 'Use a PNG, JPEG, or WebP logo.'),
      sizeErrorText: t('settings_logo_upload_size_error', 'Logo must be 512 KB or smaller.'),
      uploadDataset: { logoUploadInput: 'true' }
    });
  }

  function createSettingsImageInput(row) {
    if (row?.path === 'platform.logo_path') return createLogoPathInput(row);
    return createImageUploadField({
      value: String(row.rawValue ?? row.value ?? ''),
      previewAlt: t('settings_image_preview_alt', 'Current image preview'),
      emptyText: t('settings_image_no_preview', 'No image preview'),
      uploadLabel: t('settings_image_upload', 'Upload image'),
      uploadedText: t('settings_image_uploaded', 'Image uploaded. Publish settings to use it.'),
      kind: row?.campaignSlug ? 'campaign' : 'admin',
      campaignSlug: row?.campaignSlug || '',
      fieldPath: row?.path || '',
      filenameBase: row?.label || row?.path || '',
      uploadDataset: { settingsImageUploadInput: 'true' }
    });
  }

  function createSettingsVideoInput(row) {
    return createImageUploadField({
      value: String(row.rawValue ?? row.value ?? ''),
      previewType: 'video',
      previewAlt: t('settings_video_preview_alt', 'Current video preview'),
      emptyText: t('settings_video_no_preview', 'No video preview'),
      uploadLabel: t('settings_video_upload', 'Upload video'),
      uploadedText: t('settings_video_uploaded', 'Video uploaded. Publish settings to use it.'),
      uploadPath: '/admin/settings/video-upload',
      kind: row?.campaignSlug ? 'campaign-video' : 'admin-video',
      campaignSlug: row?.campaignSlug || '',
      fieldPath: row?.path || '',
      filenameBase: row?.label || row?.path || 'video',
      accept: 'video/mp4,video/webm,video/quicktime',
      allowedTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
      maxBytes: 100 * 1024 * 1024,
      typeErrorText: t('settings_video_upload_type_error', 'Use an MP4, WebM, or MOV video.'),
      sizeErrorText: t('settings_video_upload_size_error', 'Video must be 100 MB or smaller.'),
      uploadingText: t('settings_video_uploading', 'Uploading video...'),
      uploadDataset: { settingsVideoUploadInput: 'true' }
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.addEventListener('load', function() {
        resolve(String(reader.result || ''));
      });
      reader.addEventListener('error', function() {
        reject(reader.error || new Error('Unable to read file.'));
      });
      reader.readAsDataURL(file);
    });
  }

  function createEditorField(labelText, key, value, options) {
    return createAdminField(labelText, key, value, options, {
      datasetKey: 'collectionField',
      idPrefix: 'admin-collection-field'
    });
  }

  function collectionFieldLabel(key, fallback) {
    return t('collection_field_' + key, fallback);
  }

  function addOnFieldLabel(key, fallback) {
    return t('add_on_field_' + key, fallback);
  }

  function productCategoryOptions() {
    return [
      { value: 'physical', label: t('option_physical', 'Physical') },
      { value: 'digital', label: t('option_digital', 'Digital') }
    ];
  }

  function optionalProductCategoryOptions() {
    return [{ value: '', label: t('none', 'None') }].concat(productCategoryOptions().slice().reverse());
  }

  function shippingPresetOptions(currentValue) {
    var presets = [
      { value: '', label: t('shipping_preset_none', 'None') },
      { value: 'tshirt', label: t('shipping_preset_tshirt', 'T-shirt') },
      { value: 'sticker', label: t('shipping_preset_sticker', 'Sticker') },
      { value: 'poster', label: t('shipping_preset_poster', 'Poster') },
      { value: 'signed_script', label: t('shipping_preset_signed_script', 'Signed script') }
    ];
    var current = String(currentValue || '');
    if (current && !presets.some(function(option) { return option.value === current; })) {
      presets.push({ value: current, label: current });
    }
    return presets;
  }

  var SHIPPING_PACKAGE_FIELDS = [
    { key: 'weight_oz', labelKey: 'shipping_weight_oz', label: 'Weight (oz)', required: true },
    { key: 'packaging_weight_oz', labelKey: 'shipping_packaging_weight_oz', label: 'Packaging weight (oz)' },
    { key: 'length_in', labelKey: 'shipping_length_in', label: 'Length (in)', required: true },
    { key: 'width_in', labelKey: 'shipping_width_in', label: 'Width (in)', required: true },
    { key: 'height_in', labelKey: 'shipping_height_in', label: 'Height (in)', required: true },
    { key: 'stack_height_in', labelKey: 'shipping_stack_height_in', label: 'Stack height (in)' }
  ];

  function readShippingPackageFields(root, selector, datasetKey) {
    var shipping = {};
    root.querySelectorAll(selector).forEach(function(field) {
      var key = field.dataset[datasetKey];
      if (!key || field.value === '') return;
      shipping[key] = Number(field.value);
    });
    return shipping;
  }

  function createShippingPackageFields(source, options) {
    var shipping = source?.shipping && typeof source.shipping === 'object' ? source.shipping : {};
    var wrap = document.createElement('div');
    wrap.className = 'admin-settings__shipping-fields admin-settings__product-field--wide';
    wrap.dataset[options.containerDataset] = 'true';
    SHIPPING_PACKAGE_FIELDS.forEach(function(field) {
      wrap.append(createAdminField(t(field.labelKey, field.label), field.key, shipping[field.key] ?? '', {
        type: 'number',
        min: 0,
        step: '0.01',
        required: field.required,
        help: typeof options.helpFor === 'function' ? options.helpFor(field.labelKey) : ''
      }, {
        className: 'admin-settings__product-field admin-settings__shipping-field',
        datasetKey: options.fieldDataset,
        idPrefix: options.idPrefix
      }));
    });
    return wrap;
  }

  function adminSortIndicatorText(isActive, direction) {
    return isActive ? (direction === 'asc' ? '↑' : '↓') : '↕';
  }

  function compareAdminSortValues(aValue, bValue, direction, type) {
    if (type === 'number') return ((Number(aValue) || 0) - (Number(bValue) || 0)) * direction;
    var aNumeric = Number(aValue);
    var bNumeric = Number(bValue);
    if (Number.isFinite(aNumeric) && Number.isFinite(bNumeric)) return (aNumeric - bNumeric) * direction;
    return String(aValue || '').localeCompare(String(bValue || ''), lang || 'en', { sensitivity: 'base' }) * direction;
  }

  function createAdminSortButton(label, buttonClassName, indicatorClassName, onClick) {
    var button = document.createElement('button');
    var indicator = document.createElement('span');
    button.type = 'button';
    button.className = buttonClassName;
    button.setAttribute('aria-label', t('sort_by_label', 'Sort by') + ' ' + String(label || ''));
    indicator.className = indicatorClassName;
    indicator.setAttribute('aria-hidden', 'true');
    indicator.textContent = '↕';
    button.append(document.createTextNode(String(label || '')), indicator);
    button.addEventListener('click', onClick);
    return button;
  }

  function normalizeDateTimeLocalValue(value) {
    var text = String(value || '').trim();
    var match = text.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
    return match ? match[1] + 'T' + match[2] : '';
  }

  function dateTimeOffset(value) {
    var text = String(value || '').trim();
    return text.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] || '-06:00';
  }

  function diaryPhaseOptions(currentValue) {
    var phases = [
      { value: 'launch', label: t('diary_phase_launch', 'Launch') },
      { value: 'fundraising', label: t('diary_phase_fundraising', 'Fundraising') },
      { value: 'production', label: t('diary_phase_production', 'Production') },
      { value: 'fulfillment', label: t('diary_phase_fulfillment', 'Fulfillment') }
    ];
    var current = String(currentValue || '').trim();
    if (current && !phases.some(function(option) { return option.value === current; })) {
      phases.push({ value: current, label: current });
    }
    return phases;
  }

  function decisionEligibleOptions(currentValue) {
    var options = [
      { value: 'backers', label: t('decision_eligible_backers', 'Campaign supporters') },
      { value: 'charged_backers', label: t('decision_eligible_charged_backers', 'Charged campaign supporters') }
    ];
    var current = String(currentValue || '').trim();
    if (current && !options.some(function(option) { return option.value === current; })) {
      options.push({ value: current, label: current });
    }
    return options;
  }

  function decisionStatusFromDeadline(deadline) {
    var text = String(deadline || '').trim();
    if (!text) return 'open';
    var date = new Date(text + 'T23:59:59');
    if (Number.isNaN(date.getTime())) return 'open';
    return new Date() > date ? 'closed' : 'open';
  }

  function decisionStatusLabel(status) {
    return String(status || '') === 'closed' ? t('decision_status_closed', 'Closed') : t('decision_status_open', 'Open');
  }

  function readCollectionCard(card) {
    var item = {};
    card.querySelectorAll('[data-collection-field]').forEach(function(field) {
      var key = field.dataset.collectionField;
      if (!key) return;
      if (['price', 'target', 'limit_total', 'remaining', 'requires_threshold', 'threshold'].includes(key)) {
        item[key] = field.value === '' ? '' : Number(field.value);
      } else if (['stackable', 'late_support'].includes(key)) {
        item[key] = field.value === 'true';
      } else if (key === 'contentJson') {
        try {
          item.content = parseContentBlocks(field.value || '[]');
        } catch (_error) {
          item.content = [];
        }
      } else if (key === 'optionsJson') {
        try {
          item.options = JSON.parse(field.value || '[]');
        } catch (_error) {
          item.options = [];
        }
      } else {
        item[key] = field.value || '';
      }
    });
    if (item.category !== 'physical') {
      delete item.shipping_preset;
    } else if (!String(item.shipping_preset || '').trim()) {
      var shipping = readShippingPackageFields(card, '[data-collection-shipping-field]', 'collectionShippingField');
      if (Object.keys(shipping).length) item.shipping = shipping;
    }
    return item;
  }

  function createCampaignCollectionEditor(row) {
    var root = document.createElement('div');
    root.className = 'admin-settings__products-editor admin-settings__collection-editor';
    var list = document.createElement('div');
    list.className = 'admin-settings__products-list';
    var collection = row.collection || row.path || '';
    var items = Array.isArray(row.rawValue) ? row.rawValue.slice() : [];
    if (collection === 'diary') {
      items.sort(function(a, b) {
        var aTime = Date.parse(a?.date || '') || 0;
        var bTime = Date.parse(b?.date || '') || 0;
        return bTime - aTime;
      });
    }

    function syncValue() {
      root.value = JSON.stringify(Array.from(list.querySelectorAll('[data-campaign-collection-card]')).map(readCollectionCard));
      updateAdminDirtyIndicatorsSoon();
    }

    function hiddenCollectionField(key, value) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.dataset.collectionField = key;
      input.value = value ?? '';
      return input;
    }

    function createDiaryDateTimeField(value) {
      var wrap = createEditorField(collectionFieldLabel('date', 'Date'), 'dateDisplay', normalizeDateTimeLocalValue(value), {
        type: 'datetime-local',
        help: collectionFieldHelp('date')
      });
      var input = wrap.querySelector('[data-collection-field="dateDisplay"]');
      var hidden = hiddenCollectionField('date', value || '');
      function syncDateValue() {
        hidden.value = input?.value ? input.value + dateTimeOffset(hidden.value || value) : '';
      }
      if (input instanceof HTMLInputElement) {
        input.removeAttribute('data-collection-field');
        input.addEventListener('input', syncDateValue);
        input.addEventListener('change', syncDateValue);
        syncDateValue();
      }
      wrap.append(hidden);
      return wrap;
    }

    function collectionFieldHelp(field) {
      var help = {
        tiers: {
          id: t('collection_help_tier_id', 'Stable URL-safe identifier used by checkout, reports, inventory, and existing pledges. Existing tiers keep their IDs; new tier IDs are derived from the name.'),
          name: t('collection_help_tier_name', 'Public tier name shown on the campaign page, checkout, receipts, and pledge management.'),
          description: t('collection_help_tier_description', 'Short public explanation of what supporters receive or fund at this tier. Supports bold, italic, and underline.'),
          image: t('collection_help_tier_image', 'Public tier image shown on campaign pages and in checkout. Use a clear PNG, JPEG, WebP, or GIF that represents the reward.'),
          price: t('collection_help_tier_price', 'Price in USD charged for one unit of this tier when the campaign succeeds.'),
          category: t('collection_help_tier_category', 'Digital tiers do not need shipping. Physical tiers can use shipping presets. Any tier can have a quantity limit.'),
          shipping_preset: t('collection_help_tier_shipping_preset', 'Reusable package definition for physical reward fulfillment and shipping estimates.'),
          shipping_weight_oz: t('collection_help_tier_shipping_weight_oz', 'Reward weight, in ounces, before packaging. Required when a physical tier does not use a shipping preset.'),
          shipping_packaging_weight_oz: t('collection_help_tier_shipping_packaging_weight_oz', 'Extra package or mailer weight, in ounces. Leave blank or 0 if it is already included in the reward weight.'),
          shipping_length_in: t('collection_help_tier_shipping_length_in', 'Package length, in inches. Required when a physical tier does not use a shipping preset.'),
          shipping_width_in: t('collection_help_tier_shipping_width_in', 'Package width, in inches. Required when a physical tier does not use a shipping preset.'),
          shipping_height_in: t('collection_help_tier_shipping_height_in', 'Package height, in inches. Required when a physical tier does not use a shipping preset.'),
          shipping_stack_height_in: t('collection_help_tier_shipping_stack_height_in', 'Additional height added for each extra unit in the same shipment. Leave blank to reuse the package height.'),
          limit_total: t('collection_help_tier_limit_total', 'Maximum units available across all supporters. Leave blank for unlimited. For non-stackable tiers, this limits how many supporters can claim the tier; for stackable tiers, it limits total units.'),
          stackable: t('collection_help_tier_stackable', 'Allows one supporter to choose more than one unit of this tier in the same pledge.'),
          late_support: t('collection_help_tier_late_support', 'Keeps this tier available during late support after the primary campaign has ended.'),
          requires_threshold: t('collection_help_tier_requires_threshold', 'Funding amount that must be reached before this tier can be selected. Leave blank if it is always available.')
        },
        support_items: {
          id: t('collection_help_support_id', 'Stable URL-safe identifier used by checkout, reports, and pledge records. Existing support items keep their IDs; new IDs are derived from the name.'),
          label: t('collection_help_support_label', 'Public name shown for this standalone support item.'),
          need: t('collection_help_support_need', 'Public description of the concrete production need this support item helps cover.'),
          target: t('collection_help_support_target', 'Target amount in USD used for this support item\'s progress and campaign display.'),
          category: t('collection_help_support_category', 'Fulfillment type for this support item. Digital items do not need shipping; physical items can use a shipping preset.'),
          shipping_preset: t('collection_help_support_shipping_preset', 'Reusable package definition for physical support item fulfillment and shipping estimates.'),
          late_support: t('collection_help_support_late_support', 'Keeps this support item available during late support after the primary campaign has ended.')
        },
        diary: {
          title: t('collection_help_diary_title', 'Public title for this campaign diary or update entry.'),
          date: t('collection_help_diary_date', 'Publication date and time used for display and newest-first ordering.'),
          phase: t('collection_help_diary_phase', 'Campaign phase label used to contextualize the update, such as launch, fundraising, production, or fulfillment.'),
          content: t('collection_help_diary_content', 'WYSIWYG content blocks for this diary entry. Edits stay local until you save the draft and publish settings.')
        },
        decisions: {
          id: t('collection_help_decision_id', 'Stable URL-safe identifier for this decision. Existing decisions keep their IDs; new IDs are derived from the title.'),
          type: t('collection_help_decision_type', 'Interaction label shown to supporters. Vote is for choosing an outcome; poll is for lightweight feedback. Both use the same option and tally flow today.'),
          title: t('collection_help_decision_title', 'Public decision question or title shown in campaign decision areas and supporter prompts.'),
          deadline: t('collection_help_decision_deadline', 'Last date supporters can participate. Leave blank only if the decision should remain open indefinitely.'),
          eligible: t('collection_help_decision_eligible', 'Supporter audience allowed to participate, such as all campaign supporters or charged campaign supporters.'),
          status: t('collection_help_decision_status', 'Read-only status derived from the deadline. Decisions close automatically after the deadline passes.'),
          optionsJson: t('collection_help_decision_options', 'Choices shown to supporters. Add one option per row; images are optional and useful when the choice needs artwork.')
        },
        stretch_goals: {
          threshold: t('collection_help_stretch_threshold', 'Funding amount in USD that unlocks this stretch goal.'),
          title: t('collection_help_stretch_title', 'Public title for this stretch goal.'),
          description: t('collection_help_stretch_description', 'Short public explanation of what unlocks at this threshold.'),
          status: t('collection_help_stretch_status', 'Display status for this stretch goal, such as locked, unlocked, or revealed.')
        },
        ongoing_items: {
          label: t('collection_help_ongoing_label', 'Public label for this ongoing support need.'),
          remaining: t('collection_help_ongoing_remaining', 'Remaining amount in USD shown for this ongoing support need.')
        }
      };
      return help[collection]?.[field] || '';
    }

    function imageField(item, options) {
      var image = createImageUploadField({
        value: item.image || item.image_url || '',
        className: 'admin-settings__product-image' + (options?.wide === false ? '' : ' admin-settings__product-field--wide'),
        previewAlt: t('campaign_item_image_preview_alt', 'Current item image preview'),
        emptyText: t('campaign_item_image_no_preview', 'No item image'),
        uploadLabel: t('campaign_item_image_upload', 'Upload item image'),
        uploadedText: t('campaign_item_image_uploaded', 'Item image uploaded. Publish settings to use it.'),
        kind: collection === 'campaign_add_ons' ? 'campaign-add-on' : 'campaign-item',
        campaignSlug: row?.campaignSlug || '',
        collection: collection,
        filenameBase: function(rootNode) {
          var card = rootNode?.closest?.('[data-campaign-collection-card]');
          return card?.querySelector?.('[data-collection-field="name"]')?.value ||
            card?.querySelector?.('[data-collection-field="label"]')?.value ||
            card?.querySelector?.('[data-collection-field="title"]')?.value ||
            item.name || item.label || item.title || collection;
        },
        dataset: { collectionField: 'image' },
        uploadDataset: { campaignItemImageUpload: 'true' }
      });
      var labelText = t('campaign_item_image_label', 'Image');
      image.prepend(createProductLabelRow(labelText, collectionFieldHelp('image'), 'campaign-item-image-' + collectionFieldIdCounter++, {
        className: 'admin-settings__product-image-label'
      }).row);
      return image;
    }

    function derivedCollectionIdField(item, sourceKey, fallback) {
      var originalId = String(item.id || '').trim();
      var initialId = originalId || slugifyTitle(item[sourceKey] || '', fallback);
      var wrap = document.createElement('div');
      wrap.className = 'admin-settings__product-field';
      var labelId = 'tier-id-label-' + collectionFieldIdCounter++;
      var labelInfo = createProductLabelRow(collectionFieldLabel('id', 'ID'), collectionFieldHelp('id'), labelId, { labelId });
      var output = document.createElement('output');
      output.className = 'admin-settings__derived-value admin-settings__collection-derived-id';
      output.dataset.collectionDerivedId = 'true';
      output.dataset.collectionDerivedOriginal = originalId;
      output.dataset.collectionDerivedSource = sourceKey;
      output.dataset.collectionDerivedFallback = fallback;
      output.value = initialId;
      output.textContent = initialId;
      output.setAttribute('aria-live', 'polite');
      output.setAttribute('aria-labelledby', labelId);
      appendDescribedBy(output, labelInfo.helpId);
      var input = hiddenCollectionField('id', initialId);
      wrap.append(labelInfo.row, output, input);
      return wrap;
    }

    function updateCollectionDerivedId(card) {
      var output = card.querySelector('[data-collection-derived-id]');
      var input = card.querySelector('input[data-collection-field="id"]');
      if (!(output instanceof HTMLOutputElement) || !(input instanceof HTMLInputElement)) return;
      var original = String(output.dataset.collectionDerivedOriginal || '').trim();
      var sourceKey = output.dataset.collectionDerivedSource || 'name';
      var fallback = output.dataset.collectionDerivedFallback || 'new-item';
      var sourceValue = card.querySelector('[data-collection-field="' + sourceKey + '"]')?.value || '';
      var value = original || slugifyTitle(sourceValue, fallback);
      output.value = value;
      output.textContent = value;
      input.value = value;
    }

    function richInlineCollectionField(labelText, key, value, helpText, options) {
      var wrap = document.createElement('div');
      wrap.className = 'admin-settings__product-field';
      if (options?.wide !== false) wrap.classList.add('admin-settings__product-field--wide');
      if (options?.alignWithMedia) wrap.classList.add('admin-settings__product-field--media-paired');
      var fieldId = 'admin-collection-rich-inline-' + String(collectionFieldIdCounter++);
      var labelInfo = createProductLabelRow(labelText, helpText || '', fieldId, {
        labelId: fieldId + '-label'
      });
      var control = createInlineRichTextInput({ label: labelText, value, rawValue: value });
      control.classList.add('admin-settings__rich-inline--collection');
      control.dataset.collectionField = key;
      control.setAttribute('aria-labelledby', labelInfo.label.id);
      wrap.append(labelInfo.row, control);
      return wrap;
    }

    function normalizeDecisionOptions(options) {
      return (Array.isArray(options) ? options : []).map(function(option) {
        if (option && typeof option === 'object') {
          return {
            label: option.label || '',
            image: option.image || ''
          };
        }
        return { label: String(option || ''), image: '' };
      });
    }

    function diaryContentJson(item) {
      var blocks = Array.isArray(item.content) && item.content.length
        ? item.content
        : [{ type: 'text', body: item.body || '', align: 'left' }];
      return JSON.stringify(parseContentBlocks(blocks), null, 2);
    }

    function setCollectionFieldHidden(card, key, hidden) {
      var field = card.querySelector('[data-collection-field="' + key + '"]');
      var wrap = field?.closest?.('.admin-settings__product-field, .admin-settings__product-image, .admin-settings__diary-content');
      if (wrap instanceof HTMLElement) wrap.hidden = Boolean(hidden);
    }

    function updateTierCardConditionalFields(card) {
      var category = card.querySelector('[data-collection-field="category"]')?.value || 'digital';
      var shippingPreset = String(card.querySelector('[data-collection-field="shipping_preset"]')?.value || '').trim();
      var isDigital = category !== 'physical';
      setCollectionFieldHidden(card, 'shipping_preset', isDigital);
      var shippingFields = card.querySelector('[data-collection-shipping-fields]');
      if (shippingFields instanceof HTMLElement) {
        shippingFields.hidden = isDigital || Boolean(shippingPreset);
      }
    }

    function updateSupportItemCardConditionalFields(card) {
      var category = card.querySelector('[data-collection-field="category"]')?.value || '';
      setCollectionFieldHidden(card, 'shipping_preset', category === 'digital');
    }

    function collectionShippingFields(item) {
      return createShippingPackageFields(item, {
        containerDataset: 'collectionShippingFields',
        fieldDataset: 'collectionShippingField',
        idPrefix: 'admin-collection-shipping-field',
        helpFor: collectionFieldHelp
      });
    }

    function collectionSupportsManualOrder() {
      return ['tiers', 'support_items', 'decisions', 'stretch_goals', 'ongoing_items'].includes(collection);
    }

    function collectionItemNoun() {
      if (collection === 'tiers') return t('collection_item_tier', 'Tier');
      if (collection === 'support_items') return t('collection_item_support', 'Support item');
      if (collection === 'decisions') return t('collection_item_decision', 'Decision');
      if (collection === 'stretch_goals') return t('collection_item_stretch_goal', 'Stretch goal');
      if (collection === 'ongoing_items') return t('collection_item_ongoing_item', 'Ongoing item');
      return t('collection_item_generic', 'Item');
    }

    function updateCollectionMoveButtons() {
      var cards = Array.from(list.querySelectorAll('[data-campaign-collection-card]'));
      cards.forEach(function(card, index) {
        var title = card.querySelector('[data-collection-card-title]');
        if (title instanceof HTMLElement) title.textContent = collectionItemNoun() + ' ' + String(index + 1);
        card.querySelectorAll('[data-collection-move]').forEach(function(button) {
          var direction = button.dataset.collectionMove;
          button.disabled = (direction === 'up' && index === 0) || (direction === 'down' && index === cards.length - 1);
        });
      });
    }

    function moveCollectionCard(card, direction) {
      if (!(card instanceof HTMLElement)) return;
      if (direction === 'up' && card.previousElementSibling) {
        list.insertBefore(card, card.previousElementSibling);
      } else if (direction === 'down' && card.nextElementSibling) {
        list.insertBefore(card.nextElementSibling, card);
      }
      updateCollectionMoveButtons();
      syncValue();
    }

    function createCollectionMoveButton(direction) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--secondary btn--small admin-settings__collection-move';
      button.dataset.collectionMove = direction;
      button.setAttribute('aria-label', direction === 'up'
        ? t('collection_move_up', 'Move item up')
        : t('collection_move_down', 'Move item down'));
      button.append(createIcon(direction === 'up' ? 'arrowUp' : 'arrowDown'));
      button.addEventListener('click', function() {
        moveCollectionCard(button.closest('[data-campaign-collection-card]'), direction);
      });
      return button;
    }

    function createCollectionActions() {
      var actions = document.createElement('div');
      actions.className = 'admin-settings__collection-actions';
      actions.setAttribute('aria-label', t('collection_order_actions', 'Item order'));
      actions.append(createCollectionMoveButton('up'), createCollectionMoveButton('down'));
      return actions;
    }

    function createCollectionCardHeader() {
      var header = document.createElement('div');
      header.className = 'admin-settings__collection-card-header';
      var title = document.createElement('span');
      title.className = 'admin-settings__collection-card-title';
      title.dataset.collectionCardTitle = 'true';
      title.textContent = collectionItemNoun();
      header.append(title, createCollectionActions());
      return header;
    }

    function createDecisionOptionsEditor(item) {
      var wrap = document.createElement('div');
      wrap.className = 'admin-settings__product-field admin-settings__decision-options admin-settings__product-field--wide';
      var heading = document.createElement('span');
      heading.className = 'admin-settings__product-label admin-settings__decision-options-label';
      var headingText = document.createElement('span');
      headingText.textContent = collectionFieldLabel('options', 'Options');
      heading.append(headingText);
      var help = createHelpControl(collectionFieldLabel('options', 'Options'), collectionFieldHelp('optionsJson'), 'decision-options-' + collectionFieldIdCounter++);
      if (help) heading.append(help);
      var hidden = hiddenCollectionField('optionsJson', JSON.stringify(normalizeDecisionOptions(item.options)));
      var editor = document.createElement('div');
      editor.className = 'admin-settings__decision-options-control';
      var rows = document.createElement('div');
      rows.className = 'admin-settings__variant-list';

      function syncOptionsField() {
        hidden.value = JSON.stringify(Array.from(rows.querySelectorAll('[data-decision-option-row]')).map(function(row) {
          return {
            label: row.querySelector('[data-decision-option-field="label"]')?.value || '',
            image: row.querySelector('[data-decision-option-field="image"]')?.value || ''
          };
        }).filter(function(option) {
          return option.label || option.image;
        }));
      }

      function optionField(labelText, key, value) {
        var label = document.createElement('label');
        label.className = 'admin-settings__variant-field';
        var span = document.createElement('span');
        span.textContent = labelText;
        var input = document.createElement('input');
        input.type = key === 'image' ? 'url' : 'text';
        input.dataset.decisionOptionField = key;
        input.value = value || '';
        label.append(span, input);
        return label;
      }

      function optionImageField(value) {
        return createImageUploadField({
          value: value || '',
          className: 'admin-settings__product-image admin-settings__decision-option-image',
          previewAlt: t('decision_option_image_preview_alt', 'Current decision option image preview'),
          emptyText: t('decision_option_image_no_preview', 'Image optional'),
          uploadLabel: t('decision_option_image_upload', 'Upload image'),
          uploadedText: t('decision_option_image_uploaded', 'Option image uploaded. Publish settings to use it.'),
          kind: 'decision-option',
          campaignSlug: row?.campaignSlug || '',
          collection: 'decisions',
          filenameBase: function(rootNode) {
            return rootNode?.closest?.('[data-decision-option-row]')?.querySelector?.('[data-decision-option-field="label"]')?.value ||
              option?.label || 'decision-option';
          },
          dataset: { decisionOptionField: 'image' },
          uploadDataset: { decisionOptionImageUpload: 'true' }
        });
      }

      function renderDecisionOption(option) {
        var optionRow = document.createElement('div');
        optionRow.className = 'admin-settings__variant-row admin-settings__decision-option-row';
        optionRow.dataset.decisionOptionRow = 'true';
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn--secondary admin-settings__decision-option-delete';
        remove.textContent = t('delete', 'Delete');
        remove.setAttribute('aria-label', t('delete_decision_option', 'Delete option'));
        remove.addEventListener('click', function() {
          optionRow.remove();
          syncOptionsField();
          syncValue();
        });
        optionRow.append(optionField(collectionFieldLabel('label', 'Label'), 'label', option?.label || ''), optionImageField(option?.image || ''), remove);
        optionRow.addEventListener('input', function() {
          syncOptionsField();
          syncValue();
        });
        optionRow.addEventListener('change', function() {
          syncOptionsField();
          syncValue();
        });
        return optionRow;
      }

      normalizeDecisionOptions(item.options).forEach(function(option) {
        rows.append(renderDecisionOption(option));
      });
      var addOption = document.createElement('button');
      addOption.type = 'button';
      addOption.className = 'btn btn--secondary btn--small';
      addOption.textContent = t('add_decision_option', 'Add option');
      addOption.addEventListener('click', function() {
        rows.append(renderDecisionOption({ label: '', image: '' }));
        syncOptionsField();
        syncValue();
      });
      editor.append(rows, addOption);
      wrap.append(heading, editor, hidden);
      syncOptionsField();
      return wrap;
    }

    function createDerivedDecisionStatusField(item) {
      var wrap = document.createElement('div');
      wrap.className = 'admin-settings__product-field';
      var labelId = 'decision-status-label-' + collectionFieldIdCounter++;
      var labelInfo = createProductLabelRow(collectionFieldLabel('status', 'Status'), collectionFieldHelp('status'), labelId, { labelId });
      var status = decisionStatusFromDeadline(item.deadline || '');
      var output = document.createElement('output');
      output.className = 'admin-settings__derived-value';
      output.dataset.decisionDerivedStatus = 'true';
      output.value = status;
      output.textContent = decisionStatusLabel(status);
      output.setAttribute('aria-live', 'polite');
      output.setAttribute('aria-labelledby', labelId);
      appendDescribedBy(output, labelInfo.helpId);
      var input = hiddenCollectionField('status', status);
      wrap.append(labelInfo.row, output, input);
      return wrap;
    }

    function updateDecisionDerivedStatus(card) {
      var output = card.querySelector('[data-decision-derived-status]');
      var input = card.querySelector('input[data-collection-field="status"]');
      if (!(output instanceof HTMLOutputElement) || !(input instanceof HTMLInputElement)) return;
      var deadline = card.querySelector('[data-collection-field="deadline"]')?.value || '';
      var status = decisionStatusFromDeadline(deadline);
      output.value = status;
      output.textContent = decisionStatusLabel(status);
      input.value = status;
    }

    function renderCard(item) {
      var card = document.createElement('section');
      card.className = 'admin-settings__product-card';
      card.classList.add('admin-settings__collection-card--' + collection.replace(/[^a-z0-9_-]/gi, '-'));
      card.dataset.campaignCollectionCard = 'true';
      if (collectionSupportsManualOrder()) {
        card.append(createCollectionCardHeader());
      }
      if (collection === 'tiers') {
        card.append(
          createEditorField(collectionFieldLabel('name', 'Name'), 'name', item.name || '', { type: 'text', help: collectionFieldHelp('name') }),
          derivedCollectionIdField(item, 'name', 'new-tier'),
          richInlineCollectionField(collectionFieldLabel('description', 'Description'), 'description', item.description || '', collectionFieldHelp('description'), { wide: false, alignWithMedia: true }),
          imageField(item, { wide: false }),
          createEditorField(collectionFieldLabel('price_usd', 'Price (USD)'), 'price', item.price ?? 0, { type: 'number', min: 0, step: '0.01', help: collectionFieldHelp('price') }),
          createEditorField(collectionFieldLabel('requires_threshold', 'Requires threshold'), 'requires_threshold', item.requires_threshold ?? '', { type: 'number', min: 0, step: '1', help: collectionFieldHelp('requires_threshold') }),
          createEditorField(collectionFieldLabel('category', 'Category'), 'category', item.category || 'digital', { select: productCategoryOptions().slice().reverse(), help: collectionFieldHelp('category') }),
          createEditorField(collectionFieldLabel('stackable', 'Stackable'), 'stackable', String(item.stackable === true), { select: [{ value: 'true', label: t('yes', 'Yes') }, { value: 'false', label: t('no', 'No') }], help: collectionFieldHelp('stackable') }),
          createEditorField(collectionFieldLabel('shipping_preset', 'Shipping preset'), 'shipping_preset', item.shipping_preset || '', { select: shippingPresetOptions(item.shipping_preset || ''), help: collectionFieldHelp('shipping_preset') }),
          collectionShippingFields(item),
          createEditorField(collectionFieldLabel('quantity_limit', 'Quantity limit'), 'limit_total', item.limit_total ?? '', { type: 'number', min: 0, step: '1', help: collectionFieldHelp('limit_total') }),
          createEditorField(collectionFieldLabel('late_support', 'Late support'), 'late_support', String(item.late_support === true), { select: [{ value: 'true', label: t('yes', 'Yes') }, { value: 'false', label: t('no', 'No') }], help: collectionFieldHelp('late_support') })
        );
        updateCollectionDerivedId(card);
        updateTierCardConditionalFields(card);
      } else if (collection === 'support_items') {
        card.append(
          createEditorField(collectionFieldLabel('name', 'Name'), 'label', item.label || '', { type: 'text', help: collectionFieldHelp('label') }),
          derivedCollectionIdField(item, 'label', 'new-support-item'),
          createEditorField(collectionFieldLabel('description', 'Description'), 'need', item.need || '', { type: 'text', help: collectionFieldHelp('need') }),
          createEditorField(collectionFieldLabel('target_usd', 'Target (USD)'), 'target', item.target ?? 0, { type: 'number', min: 0, step: '0.01', help: collectionFieldHelp('target') }),
          createEditorField(collectionFieldLabel('late_support', 'Late support'), 'late_support', String(item.late_support === true), { select: [{ value: 'true', label: t('yes', 'Yes') }, { value: 'false', label: t('no', 'No') }], help: collectionFieldHelp('late_support') }),
          createEditorField(collectionFieldLabel('category', 'Category'), 'category', item.category || '', { select: optionalProductCategoryOptions(), help: collectionFieldHelp('category') }),
          createEditorField(collectionFieldLabel('shipping_preset', 'Shipping preset'), 'shipping_preset', item.shipping_preset || '', { select: shippingPresetOptions(item.shipping_preset || ''), wide: true, help: collectionFieldHelp('shipping_preset') })
        );
        updateSupportItemCardConditionalFields(card);
      } else if (collection === 'stretch_goals') {
        card.append(
          createEditorField(collectionFieldLabel('title', 'Title'), 'title', item.title || '', { type: 'text', help: collectionFieldHelp('title') }),
          createEditorField(collectionFieldLabel('threshold_usd', 'Threshold (USD)'), 'threshold', item.threshold ?? 0, { type: 'number', min: 0, step: '0.01', help: collectionFieldHelp('threshold') }),
          createEditorField(collectionFieldLabel('description', 'Description'), 'description', item.description || '', { textarea: true, wide: true, help: collectionFieldHelp('description') }),
          createEditorField(collectionFieldLabel('status', 'Status'), 'status', item.status || 'locked', { select: [{ value: 'locked', label: t('stretch_status_locked', 'Locked') }, { value: 'unlocked', label: t('stretch_status_unlocked', 'Unlocked') }, { value: 'revealed', label: t('stretch_status_revealed', 'Revealed') }, { value: '', label: t('none', 'None') }], help: collectionFieldHelp('status') })
        );
      } else if (collection === 'ongoing_items') {
        card.append(
          createEditorField(collectionFieldLabel('label', 'Label'), 'label', item.label || '', { type: 'text', help: collectionFieldHelp('label') }),
          createEditorField(collectionFieldLabel('remaining_usd', 'Remaining (USD)'), 'remaining', item.remaining ?? '', { type: 'number', min: 0, step: '0.01', help: collectionFieldHelp('remaining') })
        );
      } else if (collection === 'diary') {
        var contentField = document.createElement('textarea');
        contentField.dataset.collectionField = 'contentJson';
        contentField.value = diaryContentJson(item);
        contentField.dataset.diaryDraftOriginal = contentBlocksSnapshot(contentField.value);
        contentField.hidden = true;
        var contentTools = document.createElement('div');
        contentTools.className = 'admin-settings__product-field admin-settings__product-field--wide admin-settings__diary-content';
        var contentLabel = document.createElement('span');
        contentLabel.className = 'admin-settings__product-label admin-settings__diary-label';
        var contentLabelText = document.createElement('span');
        contentLabelText.textContent = t('content_blocks_label', 'Content blocks');
        contentLabel.append(contentLabelText);
        var contentHelp = createHelpControl(t('content_blocks_label', 'Content blocks'), collectionFieldHelp('content'), 'diary-content-' + collectionFieldIdCounter++);
        if (contentHelp) contentLabel.append(contentHelp);
        var diaryEditor = document.createElement('div');
        diaryEditor.className = 'admin-content__blocks long-content admin-settings__diary-editor';
        diaryEditor.dataset.diaryContentEditor = 'true';
        diaryEditor.dataset.contentEditorId = 'diary-' + (++contentEditorInstanceCounter);
        var diaryActions = document.createElement('div');
        diaryActions.className = 'admin-settings__diary-actions';
        var diarySave = document.createElement('button');
        diarySave.type = 'button';
        diarySave.className = 'btn btn--secondary btn--small';
        diarySave.dataset.diarySaveDraft = 'true';
        diarySave.disabled = true;
        diarySave.textContent = t('content_save_draft', 'Save draft');
        diaryActions.append(diarySave);
        var contentControl = document.createElement('div');
        contentControl.className = 'admin-settings__diary-content-control';
        diarySave.addEventListener('click', function() {
          withContentEditorContext(diaryEditor, contentField, function() {
            syncContentJsonFromBlocks();
          });
          syncValue();
          contentField.dataset.diaryDraftOriginal = contentBlocksSnapshot(contentField.value);
          markDiaryEditorDirty(diaryEditor, false);
          updateAdminDirtyIndicatorsSoon();
        });
        contentControl.append(diaryEditor, diaryActions, contentField);
        contentTools.append(contentLabel, contentControl);
        card.append(
          createEditorField(collectionFieldLabel('title', 'Title'), 'title', item.title || '', { type: 'text', help: collectionFieldHelp('title') }),
          createDiaryDateTimeField(item.date || ''),
          createEditorField(collectionFieldLabel('phase', 'Phase'), 'phase', item.phase || 'fundraising', { select: diaryPhaseOptions(item.phase), help: collectionFieldHelp('phase') }),
          contentTools
        );
        withContentEditorContext(diaryEditor, contentField, function() {
          renderContentBlocks();
        });
        attachContentBlockEditor(diaryEditor, contentField);
      } else if (collection === 'decisions') {
        card.append(
          createEditorField(collectionFieldLabel('title', 'Title'), 'title', item.title || '', { type: 'text', help: collectionFieldHelp('title') }),
          derivedCollectionIdField(item, 'title', 'new-decision'),
          createEditorField(collectionFieldLabel('type', 'Type'), 'type', item.type || 'vote', { select: [{ value: 'vote', label: t('decision_type_vote', 'Vote') }, { value: 'poll', label: t('decision_type_poll', 'Poll') }], help: collectionFieldHelp('type') }),
          createEditorField(collectionFieldLabel('deadline', 'Deadline'), 'deadline', item.deadline || '', { type: 'date', help: collectionFieldHelp('deadline') }),
          createEditorField(collectionFieldLabel('eligible', 'Eligible'), 'eligible', item.eligible || 'backers', { select: decisionEligibleOptions(item.eligible), help: collectionFieldHelp('eligible') }),
          createDerivedDecisionStatusField(item),
          createDecisionOptionsEditor(item)
        );
        updateDecisionDerivedStatus(card);
      }
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--secondary admin-settings__collection-delete';
      remove.textContent = t('delete', 'Delete');
      remove.addEventListener('click', function() {
        card.remove();
        updateCollectionMoveButtons();
        syncValue();
      });
      card.append(remove);
      card.addEventListener('change', function(event) {
        if (collection === 'tiers' && ['category', 'shipping_preset'].includes(event.target?.dataset?.collectionField || '')) {
          updateTierCardConditionalFields(card);
        }
        if (collection === 'support_items' && event.target?.dataset?.collectionField === 'category') {
          updateSupportItemCardConditionalFields(card);
        }
        if (collection === 'decisions' && event.target?.dataset?.collectionField === 'deadline') {
          updateDecisionDerivedStatus(card);
        }
      });
      card.addEventListener('input', function(event) {
        if (collection === 'tiers' && event.target?.dataset?.collectionField === 'name') {
          updateCollectionDerivedId(card);
        }
        if (collection === 'support_items' && event.target?.dataset?.collectionField === 'label') {
          updateCollectionDerivedId(card);
        }
        if (collection === 'decisions' && event.target?.dataset?.collectionField === 'title') {
          updateCollectionDerivedId(card);
        }
        if (collection === 'decisions' && event.target?.dataset?.collectionField === 'deadline') {
          updateDecisionDerivedStatus(card);
        }
      });
      card.addEventListener('input', syncValue);
      card.addEventListener('change', syncValue);
      return card;
    }

    items.forEach(function(item) {
      list.append(renderCard(item));
    });
    updateCollectionMoveButtons();
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn--secondary';
    add.textContent = t('add_item', 'Add item');
    var addItemAtTop = collection === 'diary' || collectionSupportsManualOrder();
    add.addEventListener('click', function() {
      var card = renderCard({ id: '', title: '', name: '', label: '', price: 0, target: 0, options: [] });
      if (addItemAtTop) {
        list.prepend(card);
      } else {
        list.append(card);
      }
      updateCollectionMoveButtons();
      syncValue();
    });
    if (addItemAtTop) {
      root.append(add, list);
    } else {
      root.append(list, add);
    }
    syncValue();
    return root;
  }

  function createAdminUsersEditor(row) {
    var root = document.createElement('div');
    root.className = 'admin-settings__products-editor admin-settings__users-editor';
    root.dataset.adminUsersEditor = 'true';
    var list = document.createElement('div');
    list.className = 'admin-settings__products-list';
    var users = Array.isArray(row.rawValue) ? row.rawValue : [];
    var campaignOptions = Array.isArray(row.campaignOptions) ? row.campaignOptions : [];
    var currentUserEmail = String(row.currentUserEmail || '').trim().toLowerCase();

    function normalizeUserEmail(value) {
      return String(value || '').trim().toLowerCase();
    }

    function isCurrentUser(user) {
      return currentUserEmail && normalizeUserEmail(user?.email) === currentUserEmail;
    }

    function normalizeUserCampaigns(user) {
      return new Set((Array.isArray(user?.campaigns) ? user.campaigns : user?.campaignSlugs || [])
        .map(function(campaignSlug) { return String(campaignSlug || '').trim(); })
        .filter(Boolean));
    }

    function adminUserHelp(key) {
      var help = {
        name: t('admin_user_help_name', 'Internal display name for this admin account. It helps super admins identify who has access.'),
        email: t('admin_user_help_email', 'Email address used for admin magic-link sign-in. Use the exact address this person will enter.'),
        role: t('admin_user_help_role', 'Super admins can manage all dashboard sections. Campaign users can manage only selected campaigns.'),
        campaigns: t('admin_user_help_campaigns', 'Campaigns this campaign user can view and manage. Super admins automatically have access to every campaign.')
      };
      return help[key] || '';
    }

    function userField(labelText, key, value, options) {
      return createAdminField(labelText, key, value, options, {
        datasetKey: 'adminUserField',
        idPrefix: 'admin-user-field',
        helpFor: adminUserHelp
      });
    }

    function readUserCard(card) {
      var user = { name: '', email: '', role: 'campaign_user', campaigns: [] };
      card.querySelectorAll('[data-admin-user-field]').forEach(function(field) {
        var key = field.dataset.adminUserField;
        if (!key) return;
        user[key] = field.value || '';
      });
      if (user.role === 'super_admin') {
        user.campaigns = [];
      } else {
        user.campaigns = String(card.querySelector('[data-admin-user-campaigns-list]')?.value || '')
          .split(',')
          .map(function(campaignSlug) { return campaignSlug.trim(); })
          .filter(Boolean);
      }
      return user;
    }

    function syncValue() {
      root.value = JSON.stringify(Array.from(list.querySelectorAll('[data-admin-user-card]')).map(readUserCard));
      updateAdminUsersSaveState(root);
      updateAdminDirtyIndicatorsSoon();
    }

    function campaignCheckboxes(user) {
      var wrap = document.createElement('div');
      wrap.className = 'admin-settings__product-field admin-settings__user-campaigns admin-settings__product-field--wide';
      var legendId = 'admin-user-campaigns-' + String(collectionFieldIdCounter++);
      var labelRow = createProductLabelRow(t('admin_user_campaigns', 'Campaigns'), adminUserHelp('campaigns'), legendId, {
        labelId: legendId,
        required: true
      });
      var selected = normalizeUserCampaigns(user);
      var options = createCheckboxListInput({
        label: t('admin_user_campaigns', 'Campaigns'),
        rawValue: Array.from(selected),
        options: campaignOptions,
        includeStandardOption: false,
        checkboxDatasetKey: 'adminUserCampaign',
        emptyText: t('admin_user_no_campaigns', 'No campaigns are available.')
      });
      options.dataset.adminUserCampaignsList = 'true';
      options.setAttribute('aria-labelledby', legendId);
      wrap.append(labelRow.row, options);
      return wrap;
    }

    function updateUserCardConditionalFields(card) {
      var role = card.querySelector('[data-admin-user-field="role"]')?.value || 'campaign_user';
      var campaigns = card.querySelector('.admin-settings__user-campaigns');
      if (campaigns instanceof HTMLElement) campaigns.hidden = role === 'super_admin';
    }

    function renderUser(user) {
      var card = document.createElement('section');
      var isSelf = isCurrentUser(user);
      card.className = 'admin-settings__product-card admin-settings__user-card';
      card.dataset.adminUserCard = 'true';
      if (isSelf) card.dataset.adminCurrentUser = 'true';
      card.append(
        userField(t('admin_user_name', 'Name'), 'name', user?.name || '', { type: 'text' }),
        userField(t('admin_user_email', 'Email'), 'email', user?.email || '', { type: 'email', required: true, readonly: isSelf }),
        userField(t('admin_user_role', 'Role'), 'role', user?.role || 'campaign_user', {
          select: [
            { value: 'campaign_user', label: t('admin_user_role_campaign_user', 'Campaign user') },
            { value: 'super_admin', label: t('admin_user_role_super_admin', 'Super admin') }
          ],
          required: true,
          disabled: isSelf
        }),
        campaignCheckboxes(user)
      );
      updateUserCardConditionalFields(card);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--secondary admin-settings__collection-delete';
      remove.textContent = t('delete', 'Delete');
      remove.setAttribute('aria-label', t('admin_user_delete', 'Delete admin user') + ' ' + (user?.email || ''));
      if (isSelf) {
        remove.disabled = true;
        remove.title = t('admin_user_self_protected', 'You cannot delete or demote your own super admin account.');
      }
      remove.addEventListener('click', function() {
        if (remove.disabled) return;
        card.remove();
        syncValue();
      });
      card.append(remove);
      card.addEventListener('input', syncValue);
      card.addEventListener('change', function(event) {
        if (event.target?.dataset?.adminUserField === 'role') updateUserCardConditionalFields(card);
        syncValue();
      });
      return card;
    }

    users.forEach(function(user) {
      list.append(renderUser(user));
    });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn--secondary';
    add.textContent = t('admin_user_add', 'Add user');
    add.addEventListener('click', function() {
      list.prepend(renderUser({ name: '', email: '', role: 'campaign_user', campaigns: [] }));
      syncValue();
    });
    var actions = document.createElement('div');
    actions.className = 'admin-settings__actions admin-settings__user-actions';
    var status = document.createElement('p');
    status.className = 'admin-dashboard__status';
    status.dataset.adminUsersStatus = 'true';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn';
    save.dataset.adminUsersSave = 'true';
    save.textContent = t('admin_user_save', 'Save users');
    save.disabled = true;
    save.addEventListener('click', function() {
      saveAdminUsers(root);
    });
    actions.append(status, save);
    root.append(add, list, actions);
    syncValue();
    root.dataset.adminUsersSavedValue = root.value;
    updateAdminUsersSaveState(root);
    return root;
  }

  function updateAdminUsersSaveState(root) {
    if (!(root instanceof HTMLElement)) return;
    var dirty = String(root.value || '') !== String(root.dataset.adminUsersSavedValue || '');
    var save = root.querySelector('[data-admin-users-save]');
    setDirtyButtonState(save, dirty, t('admin_user_save', 'Save users'), t('admin_user_save', 'Save users'));
  }

  async function saveAdminUsers(root) {
    if (!(root instanceof HTMLElement)) return;
    var status = root.querySelector('[data-admin-users-status]');
    var save = root.querySelector('[data-admin-users-save]');
    var users = [];
    try {
      users = JSON.parse(String(root.value || '[]'));
    } catch (_error) {
      setText(status, t('admin_user_save_invalid', 'User changes need updates before saving.'));
      return;
    }
    if (save instanceof HTMLButtonElement) save.disabled = true;
    setText(status, t('admin_user_saving', 'Saving users...'));
    try {
      var result = await requestJson('/admin/users', {
        method: 'POST',
        body: JSON.stringify({ users: users })
      });
      root.value = JSON.stringify(result.users || users);
      root.dataset.adminUsersSavedValue = root.value;
      root.dataset.settingsOriginal = root.value;
      updateAdminUsersSaveState(root);
      updateAdminDirtyIndicatorsSoon();
      setText(status, t('admin_user_saved', 'Users saved. Changes take effect immediately.'));
    } catch (error) {
      logger.error('Failed to save admin users', error);
      setText(status, error?.data?.errors?.join(' ') || error?.data?.error || t('admin_user_save_failed', 'Unable to save users.'));
      updateAdminUsersSaveState(root);
    }
  }

  function createAddOnProductsEditor(row) {
    var root = document.createElement('div');
    root.className = 'admin-settings__products-editor';
    var list = document.createElement('div');
    list.className = 'admin-settings__products-list';
    var products = Array.isArray(row.rawValue) ? row.rawValue : [];
    var deriveProductIds = true;
    var deriveVariantIds = true;

    function syncValue() {
      root.value = JSON.stringify(Array.from(list.querySelectorAll('[data-add-on-product-card]')).map(function(card) {
        var product = {};
        card.querySelectorAll(':scope > .admin-settings__product-field [data-add-on-product-field], :scope > [data-add-on-product-field]').forEach(function(field) {
          var key = field.dataset.addOnProductField;
          if (!key) return;
          if (key === 'price') {
            product[key] = Number(field.value || 0);
          } else if (key === 'inventory') {
            product[key] = field.value === '' ? '' : Number(field.value);
          } else {
            product[key] = field.value || '';
          }
        });
        if (product.category !== 'physical') {
          delete product.shipping_preset;
        }
        if (product.category === 'physical' && !String(product.shipping_preset || '').trim()) {
          product.shipping = readShippingPackageFields(card, '[data-add-on-product-shipping-field]', 'addOnProductShippingField');
        }
        product.variants = Array.from(card.querySelectorAll('[data-add-on-variant-row]')).map(function(row) {
          var variant = {};
          row.querySelectorAll('[data-add-on-variant-field]').forEach(function(field) {
            var key = field.dataset.addOnVariantField;
            if (!key) return;
            variant[key] = key === 'inventory'
              ? (field.value === '' ? '' : Number(field.value))
              : field.value || '';
          });
          return variant;
        });
        return product;
      }));
      updateAdminDirtyIndicatorsSoon();
    }

    function addOnProductHelp(key) {
      var help = {
        id: t('add_on_help_id', 'Stable URL-safe identifier used by checkout, carts, inventory, and fulfillment records. Existing add-ons keep their IDs; new IDs are derived from the name.'),
        name: t('add_on_help_name', 'Public product name shown in add-on selectors, cart, checkout, receipts, and fulfillment views.'),
        description: t('add_on_help_description', 'Public product description shown where supporters choose add-ons. Keep it short and concrete.'),
        image_url: t('add_on_help_image_url', 'Public product image shown with this add-on. Use a clear PNG, JPEG, WebP, or GIF that represents the item.'),
        price: t('add_on_help_price', 'Dollar amount charged for one unit of this add-on.'),
        category: t('add_on_help_category', 'Digital add-ons do not need shipping. Physical add-ons can use shipping presets and inventory.'),
        shipping_preset: t('add_on_help_shipping_preset', 'Reusable shipping package definition for physical add-on fulfillment and shipping estimates.'),
        shipping_weight_oz: t('add_on_help_shipping_weight_oz', 'Product weight, in ounces, before packaging. Required when a physical add-on does not use a shipping preset.'),
        shipping_packaging_weight_oz: t('add_on_help_shipping_packaging_weight_oz', 'Extra package or mailer weight, in ounces. Leave blank or 0 if it is already included in the product weight.'),
        shipping_length_in: t('add_on_help_shipping_length_in', 'Package length, in inches. Required when a physical add-on does not use a shipping preset.'),
        shipping_width_in: t('add_on_help_shipping_width_in', 'Package width, in inches. Required when a physical add-on does not use a shipping preset.'),
        shipping_height_in: t('add_on_help_shipping_height_in', 'Package height, in inches. Required when a physical add-on does not use a shipping preset.'),
        shipping_stack_height_in: t('add_on_help_shipping_stack_height_in', 'Additional height added for each extra unit in the same shipment. Leave blank to reuse the package height.'),
        inventory: t('add_on_help_inventory', 'Optional stock count available for this add-on. Leave blank when inventory is unlimited or managed elsewhere.'),
        source_url: t('add_on_help_source_url', 'Optional product or storefront link for reference and integrations. Use it when this add-on maps to an external product page; leave it blank when it only exists inside this campaign.'),
        variant_option_name: t('add_on_help_variant_option_name', 'Optional label for the variant selector, such as Size, Color, or Format.'),
        variants: t('add_on_help_variants', 'Optional product variations supporters can choose, such as sizes or formats.'),
        variant_id: t('add_on_help_variant_id', 'Stable identifier for this variant. Existing variants keep their IDs; new variant IDs are derived from the label.'),
        variant_label: t('add_on_help_variant_label', 'Public variant label shown to supporters, such as Small, Large, or Digital download.'),
        variant_inventory: t('add_on_help_variant_inventory', 'Optional stock count for this specific variant. Leave blank when variant inventory is unlimited or managed elsewhere.')
      };
      return help[key] || '';
    }

    function productField(labelText, key, value, options) {
      return createAdminField(labelText, key, value, options, {
        datasetKey: 'addOnProductField',
        idPrefix: 'admin-add-on-product-field',
        helpFor: addOnProductHelp
      });
    }

    function productShippingFields(product) {
      return createShippingPackageFields(product, {
        containerDataset: 'addOnShippingFields',
        fieldDataset: 'addOnProductShippingField',
        idPrefix: 'admin-add-on-product-shipping-field',
        helpFor: addOnProductHelp
      });
    }

    function productImageField(product, options) {
      var image = createImageUploadField({
        value: product.image_url || product.imageUrl || '',
        className: 'admin-settings__product-image' + (options?.wide === false ? '' : ' admin-settings__product-field--wide'),
        previewAlt: t('add_on_image_preview_alt', 'Current add-on image preview'),
        emptyText: t('add_on_image_no_preview', 'No product image'),
        uploadLabel: t('add_on_image_upload', 'Upload product image'),
        uploadedText: t('add_on_image_uploaded', 'Product image uploaded. Publish settings to use it.'),
        kind: 'add-on',
        campaignSlug: product.campaign_slug || product.campaignSlug || '',
        filenameBase: function(rootNode) {
          return rootNode?.closest?.('[data-add-on-product-card]')?.querySelector?.('[data-add-on-product-field="name"]')?.value ||
            product.name || product.id || 'add-on';
        },
        dataset: { addOnProductField: 'image_url' },
        uploadDataset: { addOnProductImageUpload: 'true' }
      });
      var labelText = t('add_on_image_label', 'Image');
      image.prepend(createProductLabelRow(labelText, addOnProductHelp('image_url'), 'add-on-product-image-' + collectionFieldIdCounter++, {
        className: 'admin-settings__product-image-label'
      }).row);
      return image;
    }

    function hiddenAddOnProductField(key, value) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.dataset.addOnProductField = key;
      input.value = value ?? '';
      return input;
    }

    function derivedAddOnProductIdField(product) {
      var originalId = String(product.id || '').trim();
      var initialId = originalId || slugifyTitle(product.name || '', 'new-add-on');
      var wrap = document.createElement('div');
      wrap.className = 'admin-settings__product-field';
      var labelId = 'add-on-product-id-label-' + collectionFieldIdCounter++;
      var labelInfo = createProductLabelRow(addOnFieldLabel('id', 'ID'), addOnProductHelp('id'), labelId, { labelId });
      var output = document.createElement('output');
      output.className = 'admin-settings__derived-value admin-settings__add-on-derived-id';
      output.dataset.addOnProductDerivedId = 'true';
      output.dataset.addOnProductDerivedOriginal = originalId;
      output.value = initialId;
      output.textContent = initialId;
      output.setAttribute('aria-live', 'polite');
      output.setAttribute('aria-labelledby', labelId);
      appendDescribedBy(output, labelInfo.helpId);
      wrap.append(labelInfo.row, output, hiddenAddOnProductField('id', initialId));
      return wrap;
    }

    function updateAddOnProductDerivedId(card) {
      var output = card.querySelector('[data-add-on-product-derived-id]');
      var input = card.querySelector('input[data-add-on-product-field="id"]');
      if (!(output instanceof HTMLOutputElement) || !(input instanceof HTMLInputElement)) return;
      var original = String(output.dataset.addOnProductDerivedOriginal || '').trim();
      var sourceValue = card.querySelector('[data-add-on-product-field="name"]')?.value || '';
      var value = original || slugifyTitle(sourceValue, 'new-add-on');
      output.value = value;
      output.textContent = value;
      input.value = value;
    }

    function variantField(labelText, key, value, options) {
      return createAdminField(labelText, key, value, options, {
        className: 'admin-settings__variant-field',
        datasetKey: 'addOnVariantField',
        idPrefix: 'admin-add-on-variant-field',
        helpFor: addOnProductHelp
      });
    }

    function hiddenAddOnVariantField(key, value) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.dataset.addOnVariantField = key;
      input.value = value ?? '';
      return input;
    }

    function derivedAddOnVariantIdField(variant) {
      var originalId = String(variant?.id || '').trim();
      var initialId = originalId || slugifyTitle(variant?.label || '', 'new-variant');
      var wrap = document.createElement('div');
      wrap.className = 'admin-settings__variant-field';
      var labelId = 'add-on-variant-id-label-' + collectionFieldIdCounter++;
      var labelInfo = createProductLabelRow(addOnFieldLabel('id', 'ID'), addOnProductHelp('variant_id'), labelId, { labelId });
      var output = document.createElement('output');
      output.className = 'admin-settings__derived-value admin-settings__add-on-derived-id';
      output.dataset.addOnVariantDerivedId = 'true';
      output.dataset.addOnVariantDerivedOriginal = originalId;
      output.value = initialId;
      output.textContent = initialId;
      output.setAttribute('aria-live', 'polite');
      output.setAttribute('aria-labelledby', labelId);
      appendDescribedBy(output, labelInfo.helpId);
      wrap.append(labelInfo.row, output, hiddenAddOnVariantField('id', initialId));
      return wrap;
    }

    function updateAddOnVariantDerivedId(row) {
      var output = row.querySelector('[data-add-on-variant-derived-id]');
      var input = row.querySelector('input[data-add-on-variant-field="id"]');
      if (!(output instanceof HTMLOutputElement) || !(input instanceof HTMLInputElement)) return;
      var original = String(output.dataset.addOnVariantDerivedOriginal || '').trim();
      var labelValue = row.querySelector('[data-add-on-variant-field="label"]')?.value || '';
      var value = original || slugifyTitle(labelValue, 'new-variant');
      output.value = value;
      output.textContent = value;
      input.value = value;
    }

    function renderVariant(variant) {
      var row = document.createElement('div');
      row.className = 'admin-settings__variant-row';
      row.dataset.addOnVariantRow = 'true';
      if (deriveVariantIds) {
        row.append(
          variantField(addOnFieldLabel('label', 'Label'), 'label', variant?.label || '', { type: 'text', help: addOnProductHelp('variant_label') }),
          derivedAddOnVariantIdField(variant),
          variantField(addOnFieldLabel('inventory', 'Inventory'), 'inventory', variant?.inventory ?? '', { type: 'number', min: 0, step: '1', help: addOnProductHelp('variant_inventory') })
        );
        updateAddOnVariantDerivedId(row);
      } else {
        row.append(
          variantField(addOnFieldLabel('label', 'Label'), 'label', variant?.label || '', { type: 'text', help: addOnProductHelp('variant_label') }),
          variantField(addOnFieldLabel('id', 'ID'), 'id', variant?.id || '', { type: 'text', help: addOnProductHelp('variant_id') }),
          variantField(addOnFieldLabel('inventory', 'Inventory'), 'inventory', variant?.inventory ?? '', { type: 'number', min: 0, step: '1', help: addOnProductHelp('variant_inventory') })
        );
      }
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--secondary btn--small';
      remove.textContent = t('delete', 'Delete');
      remove.setAttribute('aria-label', t('delete_variant', 'Delete variant'));
      remove.addEventListener('click', function() {
        row.remove();
        syncValue();
      });
      row.append(remove);
      row.addEventListener('input', function(event) {
        if (deriveVariantIds && event.target?.dataset?.addOnVariantField === 'label') updateAddOnVariantDerivedId(row);
        syncValue();
      });
      row.addEventListener('change', syncValue);
      return row;
    }

    function renderVariantsEditor(product) {
      var wrap = document.createElement('div');
      wrap.className = 'admin-settings__variants';
      var heading = document.createElement('div');
      heading.className = 'admin-settings__product-label admin-settings__variants-heading';
      var headingText = document.createElement('h4');
      headingText.textContent = t('variants', 'Variants');
      heading.append(headingText);
      var help = createHelpControl(t('variants', 'Variants'), addOnProductHelp('variants'), 'add-on-variants-' + collectionFieldIdCounter++);
      if (help) heading.append(help);
      var rows = document.createElement('div');
      rows.className = 'admin-settings__variant-list';
      (Array.isArray(product.variants) ? product.variants : []).forEach(function(variant) {
        rows.append(renderVariant(variant));
      });
      var addVariant = document.createElement('button');
      addVariant.type = 'button';
      addVariant.className = 'btn btn--secondary btn--small';
      addVariant.textContent = t('add_variant', 'Add variant');
      addVariant.addEventListener('click', function() {
        rows.prepend(renderVariant({ id: '', label: '', inventory: '' }));
        syncValue();
      });
      wrap.append(heading, addVariant, rows);
      return wrap;
    }

    function setAddOnProductFieldHidden(card, key, hidden) {
      var field = card.querySelector('[data-add-on-product-field="' + key + '"]');
      var wrap = field?.closest?.('.admin-settings__product-field, .admin-settings__product-image');
      if (wrap instanceof HTMLElement) wrap.hidden = Boolean(hidden);
    }

    function updateAddOnProductConditionalFields(card) {
      var category = card.querySelector('[data-add-on-product-field="category"]')?.value || 'physical';
      var shippingPreset = String(card.querySelector('[data-add-on-product-field="shipping_preset"]')?.value || '').trim();
      setAddOnProductFieldHidden(card, 'shipping_preset', category === 'digital');
      var shippingFields = card.querySelector('[data-add-on-shipping-fields]');
      if (shippingFields instanceof HTMLElement) {
        shippingFields.hidden = category !== 'physical' || Boolean(shippingPreset);
      }
    }

    function renderProduct(product) {
      var card = document.createElement('section');
      card.className = 'admin-settings__product-card';
      card.dataset.addOnProductCard = 'true';
      card.append(
        productField(addOnFieldLabel('name', 'Name'), 'name', product.name || '', { type: 'text' }),
        deriveProductIds
          ? derivedAddOnProductIdField(product)
          : productField(addOnFieldLabel('id', 'ID'), 'id', product.id || '', { type: 'text' }),
        productField(addOnFieldLabel('description', 'Description'), 'description', product.description || '', { textarea: true, alignWithMedia: true }),
        productImageField(product, { wide: false }),
        productField(addOnFieldLabel('price', 'Price'), 'price', product.price ?? 0, { type: 'number', min: 0, step: '0.01' }),
        productField(addOnFieldLabel('category', 'Category'), 'category', product.category || 'physical', {
          select: productCategoryOptions()
        }),
        productField(addOnFieldLabel('shipping_preset', 'Shipping preset'), 'shipping_preset', product.shipping_preset || product.shippingPreset || '', { select: shippingPresetOptions(product.shipping_preset || product.shippingPreset || '') }),
        productShippingFields(product),
        productField(addOnFieldLabel('inventory', 'Inventory'), 'inventory', product.inventory ?? '', { type: 'number', min: 0, step: '1' }),
        productField(addOnFieldLabel('source_url', 'Source URL'), 'source_url', product.source_url || product.sourceUrl || '', { type: 'url' }),
        productField(addOnFieldLabel('variant_option_name', 'Variant option name'), 'variant_option_name', product.variant_option_name || product.variantOptionName || '', { type: 'text' }),
        renderVariantsEditor(product)
      );
      if (deriveProductIds) updateAddOnProductDerivedId(card);
      updateAddOnProductConditionalFields(card);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--secondary admin-settings__collection-delete';
      remove.textContent = t('delete', 'Delete');
      remove.setAttribute('aria-label', t('delete_product', 'Delete product') + ' ' + (product.name || product.id || ''));
      remove.addEventListener('click', function() {
        card.remove();
        syncValue();
      });
      card.append(remove);
      card.addEventListener('input', function(event) {
        if (deriveProductIds && event.target?.dataset?.addOnProductField === 'name') updateAddOnProductDerivedId(card);
        syncValue();
      });
      card.addEventListener('change', function(event) {
        if (['category', 'shipping_preset'].includes(event.target?.dataset?.addOnProductField || '')) {
          updateAddOnProductConditionalFields(card);
        }
        syncValue();
      });
      return card;
    }

    products.forEach(function(product) {
      list.append(renderProduct(product));
    });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn--secondary';
    add.textContent = t('add_product', 'Add product');
    add.addEventListener('click', function() {
      list.prepend(renderProduct({
        id: '',
        name: '',
        description: '',
        image_url: '',
        price: 0,
        category: 'physical',
        variants: []
      }));
      syncValue();
    });
    root.append(add, list);
    syncValue();
    return root;
  }

  function formatSettingsNumberForInput(value) {
    if (!Number.isFinite(value)) return '';
    return String(Number(value.toFixed(10)));
  }

  function normalizeTimePart(value, min, max) {
    var number = Number(value);
    if (!Number.isInteger(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function formatSettingsTimeValue(hour, minute) {
    return String(normalizeTimePart(hour, 0, 23)).padStart(2, '0') + ':' + String(normalizeTimePart(minute, 0, 59)).padStart(2, '0');
  }

  function collectCompoundTimeChanges(control) {
    var value = String(control.value || '');
    var match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return [];
    var hour = String(Number(match[1]));
    var minute = String(Number(match[2]));
    var originalHour = control.dataset.settingsTimeOriginalHour || '0';
    var originalMinute = control.dataset.settingsTimeOriginalMinute || '0';
    var changes = [];
    if (hour !== originalHour) {
      changes.push({
        path: control.dataset.settingsTimeHourPath || '',
        campaignSlug: control.dataset.settingsCampaign || '',
        type: 'number',
        value: hour,
        original: originalHour
      });
    }
    if (minute !== originalMinute) {
      changes.push({
        path: control.dataset.settingsTimeMinutePath || '',
        campaignSlug: control.dataset.settingsCampaign || '',
        type: 'number',
        value: minute,
        original: originalMinute
      });
    }
    return changes;
  }

  function normalizeSettingsRow(row, scope) {
    if (!row || typeof row !== 'object') return row;
    var next = Object.assign({}, row);
    if (row.path === 'platform.site_url' && canonicalSiteUrl) {
      next = Object.assign({}, next, {
        value: canonicalSiteUrl,
        rawValue: canonicalSiteUrl
      });
    }
    if (row.path === 'platform.worker_url' && canonicalWorkerBase) {
      next = Object.assign({}, next, {
        value: canonicalWorkerBase,
        rawValue: canonicalWorkerBase
      });
    }
    var fieldKey = settingsFieldTranslationKey(next, scope);
    next.sourceLabel = row.label || '';
    next.label = t(fieldKey + '_label', row.label || '');
    next.help = t(fieldKey + '_help', row.help || '');
    next.value = localizeReadOnlySettingsValue(next);
    if (next.placeholder) next.placeholder = t(fieldKey + '_placeholder', next.placeholder);
    if (Array.isArray(next.options)) {
      next.options = next.options.map(function(optionConfig) {
        return localizeSettingsOption(optionConfig, next, scope);
      });
    }
    return next;
  }

  function normalizeSettingsSection(section, options) {
    if (!section || typeof section !== 'object') return section;
    if (!Array.isArray(section.rows)) return section;
    var scope = options?.scope || 'platform';
    var sourceTitle = section.title || '';
    var title = scope === 'campaign'
      ? sourceTitle
      : t('settings_section_' + i18nFragment(sourceTitle, 'settings'), sourceTitle);
    return Object.assign({}, section, {
      sourceTitle,
      title,
      rows: section.rows.map(function(row) { return normalizeSettingsRow(row, scope); })
    });
  }

  function campaignSettingsSlug(section) {
    var slugRow = Array.isArray(section?.rows)
      ? section.rows.find(function(row) { return row?.path === 'slug' || row?.sourceLabel === 'Slug' || row?.label === 'Slug'; })
      : null;
    return String(slugRow?.value || slugRow?.rawValue || '').trim();
  }

  function campaignSettingsSubtabs() {
    return [
      { id: 'settings', label: t('campaign_subtab_settings', 'Settings') },
      { id: 'content', label: t('campaign_subtab_content', 'Content') },
      { id: 'tiers', label: t('campaign_subtab_tiers', 'Tiers') },
      { id: 'support_items', label: t('campaign_subtab_support_items', 'Support Items') },
      { id: 'campaign_add_ons', label: t('campaign_subtab_campaign_add_ons', 'Add-Ons') },
      { id: 'stretch_goals', label: t('campaign_subtab_stretch_goals', 'Stretch Goals') },
      { id: 'ongoing_items', label: t('campaign_subtab_ongoing_items', 'Ongoing Items') },
      { id: 'diary', label: t('campaign_subtab_diary', 'Diary Entries') },
      { id: 'decisions', label: t('campaign_subtab_decisions', 'Decisions') }
    ];
  }

  function campaignSettingsSubtabCompactLabel(subtabId, fallback) {
    var labels = {
      settings: t('campaign_subtab_short_settings', 'Settings'),
      content: t('campaign_subtab_short_content', 'Content'),
      tiers: t('campaign_subtab_short_tiers', 'Tiers'),
      support_items: t('campaign_subtab_short_support_items', 'Support'),
      campaign_add_ons: t('campaign_subtab_short_campaign_add_ons', 'Add-Ons'),
      stretch_goals: t('campaign_subtab_short_stretch_goals', 'Goals'),
      ongoing_items: t('campaign_subtab_short_ongoing_items', 'Ongoing'),
      diary: t('campaign_subtab_short_diary', 'Diary'),
      decisions: t('campaign_subtab_short_decisions', 'Decisions')
    };
    return labels[subtabId] || fallback || subtabId;
  }

  function campaignSettingsSubtabDescription(subtabId) {
    var descriptions = {
      settings: t('campaign_subtab_desc_settings', 'Edit core campaign details, dates, funding target, and report recipients.'),
      content: t('campaign_subtab_desc_content', 'Edit campaign page content in a local draft and preview mobile layout before publishing.'),
      tiers: t('campaign_subtab_desc_tiers', 'Manage pledge reward levels, pricing, limits, images, and fulfillment behavior.'),
      support_items: t('campaign_subtab_desc_support_items', 'Manage non-tier support goals shown on the campaign page.'),
      campaign_add_ons: t('campaign_subtab_desc_campaign_add_ons', 'Manage optional add-on products that are available only on this campaign.'),
      stretch_goals: t('campaign_subtab_desc_stretch_goals', 'Manage funding milestones that unlock when the campaign reaches specific amounts.'),
      ongoing_items: t('campaign_subtab_desc_ongoing_items', 'Manage ongoing support needs shown after or alongside the main campaign.'),
      diary: t('campaign_subtab_desc_diary', 'Create and edit campaign updates. Entries are sorted newest first.'),
      decisions: t('campaign_subtab_desc_decisions', 'Manage supporter vote and poll questions, eligibility, deadlines, and option artwork.')
    };
    return descriptions[subtabId] || '';
  }

  function renderCampaignSettingsSubtabIntro(subtab) {
    var intro = document.createElement('div');
    intro.className = 'admin-campaign-section-panel__intro';
    var copy = document.createElement('p');
    copy.textContent = campaignSettingsSubtabDescription(subtab.id);
    intro.append(copy);
    return intro;
  }

  function campaignSettingsSubtabForRow(row) {
    var path = String(row?.path || '');
    if (path === 'content_editor') return 'content';
    if (path === 'featured_tier_id' || path === 'tiers') return 'tiers';
    if (path === 'support_items') return 'support_items';
    if (path === 'campaign_add_ons') return 'campaign_add_ons';
    if (path === 'stretch_goals') return 'stretch_goals';
    if (path === 'ongoing_items') return 'ongoing_items';
    if (path === 'diary') return 'diary';
    if (path === 'decisions') return 'decisions';
    return 'settings';
  }

  function campaignSettingsRowsBySubtab(section) {
    var subtabs = campaignSettingsSubtabs().map(function(subtab) {
      return Object.assign({ rows: [] }, subtab);
    });
    var byId = subtabs.reduce(function(map, subtab) {
      map[subtab.id] = subtab;
      return map;
    }, {});
    (section?.rows || []).forEach(function(row) {
      var subtabId = campaignSettingsSubtabForRow(row);
      (byId[subtabId] || byId.settings).rows.push(row);
    });
    return subtabs;
  }

  function selectCampaignSettingsSubtab(panel, subtabId, options) {
    if (!(panel instanceof HTMLElement)) return;
    var nextSubtabId = subtabId || panel.querySelector('[data-campaign-settings-subtab]')?.dataset?.campaignSettingsSubtab || 'settings';
    panel.querySelectorAll('[data-campaign-settings-subtab]').forEach(function(button) {
      var selected = button.dataset.campaignSettingsSubtab === nextSubtabId;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
      if (selected && options?.focus === true && button instanceof HTMLButtonElement) button.focus();
    });
    panel.querySelectorAll('[data-campaign-settings-subtab-panel]').forEach(function(subPanel) {
      subPanel.hidden = subPanel.dataset.campaignSettingsSubtabPanel !== nextSubtabId;
    });
    syncCampaignSubtabMobileTabs(panel);
  }

  function handleCampaignSettingsSubtabKeydown(event, panel, button) {
    var keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (keys.indexOf(event.key) < 0 || !(button instanceof HTMLButtonElement)) return;
    var buttons = Array.from(panel.querySelectorAll('[data-campaign-settings-subtab]')).filter(function(candidate) {
      return candidate instanceof HTMLButtonElement && !candidate.hidden;
    });
    var currentIndex = buttons.indexOf(button);
    if (currentIndex < 0 || !buttons.length) return;
    event.preventDefault();
    var nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = buttons.length - 1;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;
    selectCampaignSettingsSubtab(panel, buttons[nextIndex]?.dataset?.campaignSettingsSubtab || 'settings', { focus: true });
  }

  function selectCampaignSettings(slug) {
    selectedCampaignSettingsSlug = slug || selectedCampaignSettingsSlug || campaignSettingsSlug(currentCampaignSettingsSections[0]) || '';
    if (contentCampaign instanceof HTMLSelectElement && selectedCampaignSettingsSlug) {
      contentCampaign.value = selectedCampaignSettingsSlug;
    }
    if (campaignTabsRoot) {
      campaignTabsRoot.querySelectorAll('[data-campaign-settings-tab]').forEach(function(button) {
        var selected = button.dataset.campaignSettingsTab === selectedCampaignSettingsSlug;
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
      });
    }
    if (campaignSettingsRoot) {
      campaignSettingsRoot.querySelectorAll('[data-campaign-settings-panel]').forEach(function(panel) {
        panel.hidden = panel.dataset.campaignSettingsPanel !== selectedCampaignSettingsSlug;
      });
    }
    mountContentEditorForCampaign(selectedCampaignSettingsSlug);
    if (document.querySelector('[data-admin-tab-panel="campaigns"]')?.hidden === false) {
      loadContentCampaign({ skipIfLoaded: true });
    }
    syncCampaignSettingsMobileTabs();
  }

  function renderCampaignSettingsTabs(campaignSections) {
    if (!campaignTabsRoot || !campaignSettingsRoot) return;
    campaignTabsRoot.replaceChildren();
    campaignSettingsRoot.replaceChildren();
    currentCampaignSettingsSections = campaignSections || [];
    if (!currentCampaignSettingsSections.length) {
      var empty = document.createElement('p');
      empty.textContent = t('settings_empty', 'No settings are available for this admin account.');
      campaignSettingsRoot.append(empty);
      return;
    }
    if (!currentCampaignSettingsSections.some(function(section) {
      return campaignSettingsSlug(section) === selectedCampaignSettingsSlug;
    })) {
      selectedCampaignSettingsSlug = campaignSettingsSlug(currentCampaignSettingsSections[0]);
    }
    currentCampaignSettingsSections.forEach(function(section, index) {
      var slug = campaignSettingsSlug(section) || String(index);
      var tabId = 'admin-campaign-settings-tab-' + slug;
      var panelId = 'admin-campaign-settings-panel-' + slug;
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'admin-campaign-tabs__tab';
      tab.id = tabId;
      tab.dataset.campaignSettingsTab = slug;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panelId);
      tab.textContent = section?.title || slug;
      tab.addEventListener('click', function() {
        selectCampaignSettings(slug);
      });
      campaignTabsRoot.append(tab);

      var panel = document.createElement('section');
      panel.id = panelId;
      panel.dataset.campaignSettingsPanel = slug;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      var subtabList = document.createElement('div');
      subtabList.className = 'admin-campaign-section-tabs';
      subtabList.setAttribute('role', 'tablist');
      subtabList.setAttribute('aria-label', (section?.title || slug) + ' ' + t('campaign_settings_subtabs_label', 'sections'));
      var subtabPanels = document.createElement('div');
      subtabPanels.className = 'admin-campaign-section-panels';
      campaignSettingsRowsBySubtab(section).forEach(function(subtab, subtabIndex) {
        var subtabButtonId = panelId + '-subtab-' + subtab.id;
        var subtabPanelId = panelId + '-subpanel-' + subtab.id;
        var subtabButton = document.createElement('button');
        subtabButton.type = 'button';
        subtabButton.className = 'admin-campaign-section-tabs__tab';
        subtabButton.id = subtabButtonId;
        subtabButton.dataset.campaignSettingsSubtab = subtab.id;
        subtabButton.setAttribute('role', 'tab');
        subtabButton.setAttribute('aria-controls', subtabPanelId);
        subtabButton.setAttribute('aria-label', subtab.label);
        subtabButton.title = subtab.label;
        subtabButton.dataset.compactLabel = campaignSettingsSubtabCompactLabel(subtab.id, subtab.label);
        var subtabLabel = document.createElement('span');
        subtabLabel.className = 'admin-campaign-section-tabs__label';
        subtabLabel.textContent = subtab.label;
        subtabButton.append(subtabLabel);
        subtabButton.addEventListener('click', function() {
          selectCampaignSettingsSubtab(panel, subtab.id);
        });
        subtabButton.addEventListener('keydown', function(event) {
          handleCampaignSettingsSubtabKeydown(event, panel, subtabButton);
        });
        subtabList.append(subtabButton);

        var subPanel = document.createElement('section');
        subPanel.id = subtabPanelId;
        subPanel.className = 'admin-campaign-section-panel';
        subPanel.dataset.campaignSettingsSubtabPanel = subtab.id;
        subPanel.setAttribute('role', 'tabpanel');
        subPanel.setAttribute('aria-labelledby', subtabButtonId);
        subPanel.append(renderCampaignSettingsSubtabIntro(subtab));
        if (subtab.rows.length) {
          subPanel.append(renderSettingsTable(Object.assign({}, section, { title: subtab.label, rows: subtab.rows }), {
            hideHeading: true,
            fullWidthRows: true,
            hideFieldLabels: subtab.id === 'tiers' ? ['tiers'] : ['content', 'support_items', 'campaign_add_ons', 'stretch_goals', 'ongoing_items', 'diary', 'decisions'].includes(subtab.id)
          }));
        } else {
          var emptySubtab = document.createElement('p');
          emptySubtab.className = 'admin-app__muted';
          emptySubtab.textContent = t('settings_empty', 'No settings are available for this admin account.');
          subPanel.append(emptySubtab);
        }
        subPanel.hidden = subtabIndex !== 0;
        subtabPanels.append(subPanel);
      });
      panel.append(subtabList, subtabPanels);
      campaignSettingsRoot.append(panel);
      selectCampaignSettingsSubtab(panel, 'settings');
      updateDerivedCampaignFields(slug);
    });
    selectCampaignSettings(selectedCampaignSettingsSlug);
  }

  function settingsSectionId(section, index, usedIds) {
    var base = slugifyTitle(section?.title || '', 'settings-section-' + String(index + 1));
    var id = base;
    var suffix = 2;
    while (usedIds.has(id)) {
      id = base + '-' + String(suffix);
      suffix += 1;
    }
    usedIds.add(id);
    return id;
  }

  function selectSettingsSection(sectionId, options) {
    selectedSettingsSectionId = sectionId || selectedSettingsSectionId || '';
    if (!settingsSectionTabsRoot || !settingsRoot) return;
    settingsSectionTabsRoot.querySelectorAll('[data-settings-section-tab]').forEach(function(button) {
      var selected = button.dataset.settingsSectionTab === selectedSettingsSectionId;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
      if (selected && options?.focus) button.focus();
    });
    settingsRoot.querySelectorAll('[data-settings-section-panel]').forEach(function(panel) {
      panel.hidden = panel.dataset.settingsSectionPanel !== selectedSettingsSectionId;
    });
    var activePanel = settingsRoot.querySelector('[data-settings-section-panel="' + cssEscape(selectedSettingsSectionId) + '"]');
    var hasPublishableControls = Boolean(activePanel?.querySelector?.('[data-settings-path]:not([data-settings-runtime-only="true"])'));
    activeSettingsSectionHasPublishableControls = hasPublishableControls;
    var settingsPublishActions = settingsPublish?.closest?.('.admin-settings__actions');
    if (settingsPublishActions instanceof HTMLElement) {
      settingsPublishActions.hidden = false;
      settingsPublishActions.classList.toggle('is-placeholder', !hasPublishableControls);
      if (hasPublishableControls) {
        settingsPublishActions.removeAttribute('aria-hidden');
      } else {
        settingsPublishActions.setAttribute('aria-hidden', 'true');
      }
    }
    updateDirtyIndicators();
    syncSettingsSectionMobileTabs();
  }

  function handleSettingsSectionTabKeydown(event, button) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    var buttons = Array.from(settingsSectionTabsRoot?.querySelectorAll('[data-settings-section-tab]') || []);
    var currentIndex = buttons.indexOf(button);
    if (currentIndex < 0 || !buttons.length) return;
    event.preventDefault();
    var nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = buttons.length - 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % buttons.length;
    selectSettingsSection(buttons[nextIndex]?.dataset?.settingsSectionTab || '', { focus: true });
  }

  function renderSettingsSectionTabs(sections) {
    if (!settingsSectionTabsRoot || !settingsRoot) return;
    settingsSectionTabsRoot.replaceChildren();
    settingsRoot.replaceChildren();
    var usedIds = new Set();
    var sectionItems = (sections || []).map(function(section, index) {
      return { id: settingsSectionId(section, index, usedIds), section };
    });
    settingsSectionTabsRoot.hidden = sectionItems.length === 0;
    if (!sectionItems.length) {
      var empty = document.createElement('p');
      empty.textContent = t('settings_empty', 'No settings are available for this admin account.');
      settingsRoot.append(empty);
      return;
    }
    if (!sectionItems.some(function(item) { return item.id === selectedSettingsSectionId; })) {
      selectedSettingsSectionId = sectionItems[0].id;
    }
    sectionItems.forEach(function(item) {
      var tabId = 'admin-settings-section-tab-' + item.id;
      var panelId = 'admin-settings-section-panel-' + item.id;
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'admin-campaign-tabs__tab';
      tab.id = tabId;
      tab.dataset.settingsSectionTab = item.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panelId);
      tab.textContent = item.section?.title || t('settings_group', 'Settings');
      tab.addEventListener('click', function() {
        selectSettingsSection(item.id);
      });
      tab.addEventListener('keydown', function(event) {
        handleSettingsSectionTabKeydown(event, tab);
      });
      settingsSectionTabsRoot.append(tab);

      var panel = document.createElement('section');
      panel.id = panelId;
      panel.dataset.settingsSectionPanel = item.id;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      panel.append(renderSettingsTable(item.section, { hideHeading: true, fullWidthRows: true }));
      settingsRoot.append(panel);
    });
    selectSettingsSection(selectedSettingsSectionId);
  }

  function renderSettings(data) {
    if (!settingsRoot) return;
    currentSettings = data || null;
    settingsRoot.replaceChildren();
    if (settingsSectionTabsRoot) settingsSectionTabsRoot.replaceChildren();
    if (addOnsRoot) addOnsRoot.replaceChildren();
    if (campaignTabsRoot) campaignTabsRoot.replaceChildren();
    if (campaignSettingsRoot) campaignSettingsRoot.replaceChildren();
    var sections = Array.isArray(data?.sections)
      ? data.sections.map(function(section) { return normalizeSettingsSection(section, { scope: 'platform' }); })
      : [];
    var addOnsSections = sections.filter(function(section) {
      return (section?.sourceTitle || section?.title) === 'Platform add-ons';
    });
    sections = sections.filter(function(section) {
      return (section?.sourceTitle || section?.title) !== 'Platform add-ons';
    });
    var campaignSections = Array.isArray(data?.campaigns)
      ? data.campaigns.map(function(section) { return normalizeSettingsSection(section, { scope: 'campaign' }); })
      : [];
    renderSettingsSectionTabs(sections);
    renderCampaignSettingsTabs(campaignSections);
    if (addOnsRoot) {
      if (addOnsSections.length) {
        addOnsSections.forEach(function(section) {
          addOnsRoot.append(renderSettingsTable(section, { hideHeading: true, fullWidthRows: true }));
        });
      } else {
        var addOnsEmpty = document.createElement('p');
        addOnsEmpty.textContent = t('addons_empty', 'No platform add-ons are available for this admin account.');
        addOnsRoot.append(addOnsEmpty);
      }
    }
    updateConditionalSettingsRows();
  }

  function settingsContainers() {
    return [settingsRoot, addOnsRoot, campaignSettingsRoot].filter(function(root) {
      return root instanceof HTMLElement;
    });
  }

  function getSettingsControlValue(path, campaignSlug) {
    if (!path) return '';
    var selector = '[data-settings-path="' + cssEscape(String(path)) + '"]';
    if (campaignSlug) {
      selector += '[data-settings-campaign="' + cssEscape(String(campaignSlug)) + '"]';
    }
    for (const root of settingsContainers()) {
      var control = root.querySelector(selector);
      if (control) return control.value;
    }
    return '';
  }

  function updateConditionalSettingsRows() {
    settingsContainers().forEach(function(root) {
      root.querySelectorAll('[data-settings-visible-when-path]').forEach(function(row) {
        var path = row.dataset.settingsVisibleWhenPath || '';
        var expected = row.dataset.settingsVisibleWhenValue || '';
        var campaignSlug = row.dataset.settingsVisibleWhenCampaign || '';
        row.hidden = getSettingsControlValue(path, campaignSlug) !== expected;
      });
      root.querySelectorAll('.admin-settings__field-grid').forEach(function(grid) {
        var parentRow = grid.closest('tr');
        if (!(parentRow instanceof HTMLTableRowElement)) return;
        var items = Array.from(grid.querySelectorAll(':scope > .admin-settings__field-grid-item'));
        if (!items.length) return;
        parentRow.hidden = items.every(function(item) { return item.hidden; });
      });
    });
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function slugifyTitle(value, fallback) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback || 'new-campaign';
  }

  function derivedCampaignUrl(slug) {
    return '/campaigns/' + encodeURIComponent(slugifyTitle(slug)) + '/';
  }

  function updateDerivedCampaignFields(campaignSlug) {
    var title = getSettingsControlValue('title', campaignSlug);
    var derivedSlug = slugifyTitle(title);
    var panel = campaignSettingsRoot?.querySelector?.('[data-campaign-settings-panel="' + cssEscape(campaignSlug) + '"]');
    if (!(panel instanceof HTMLElement)) return;
    panel.querySelectorAll('[data-settings-derived]').forEach(function(output) {
      if (!(output instanceof HTMLOutputElement)) return;
      var original = String(output.dataset.settingsDerivedOriginal || '').trim();
      var value = original || (output.dataset.settingsDerived === 'url-derived' ? derivedCampaignUrl(derivedSlug) : derivedSlug);
      output.value = value;
      output.textContent = value;
    });
  }

  function mountContentEditorForCampaign(campaignSlug) {
    if (!(contentEditor instanceof HTMLFormElement) || !campaignSlug || !campaignSettingsRoot) return;
    var slot = campaignSettingsRoot.querySelector('[data-content-editor-slot="' + cssEscape(campaignSlug) + '"]');
    if (slot instanceof HTMLElement && !slot.contains(contentEditor)) {
      [contentEditor, contentValidation, contentPreviewGrid].forEach(function(node) {
        if (node instanceof Node) slot.append(node);
      });
    }
  }

  function collectSettingsChanges(roots) {
    return (roots || settingsContainers()).flatMap(function(root) {
      return Array.from(root.querySelectorAll('[data-settings-path]'));
    }).filter(function(control) {
      if (control.dataset.settingsRuntimeOnly === 'true') return false;
      var row = control.closest('tr');
      return !row || !row.hidden;
    }).flatMap(function(control) {
      if (typeof control.commitPending === 'function') control.commitPending();
      if (control.dataset.settingsInput === 'time' && control.dataset.settingsTimeHourPath) {
        return collectCompoundTimeChanges(control);
      }
      var value = control.value;
      var original = control.dataset.settingsOriginal || '';
      var submitDivisor = Number(control.dataset.settingsSubmitDivisor || 1);
      var submitValue = value;
      if (Number.isFinite(submitDivisor) && submitDivisor > 0 && submitDivisor !== 1 && value !== '') {
        submitValue = formatSettingsNumberForInput(Number(value) / submitDivisor);
      }
      return [{
        path: control.dataset.settingsPath || '',
        campaignSlug: control.dataset.settingsCampaign || '',
        type: control.dataset.settingsType || 'string',
        value: submitValue,
        original: original,
        current: value
      }];
    }).filter(function(change) {
      return String(change.current || '') !== String(change.original || '');
    }).map(function(change) {
      return {
        path: change.path,
        campaignSlug: change.campaignSlug,
        type: change.type,
        value: change.value,
        original: change.original
      };
    });
  }

  function collectCampaignSettingsChanges() {
    return collectSettingsChanges(campaignSettingsRoot ? [campaignSettingsRoot] : []);
  }

  async function validateSettingsChanges(statusNode, changesOverride) {
    statusNode = statusNode || settingsStatus;
    var changes = changesOverride || collectSettingsChanges();
    if (!changes.length) {
      setText(statusNode, t('settings_no_changes', 'No settings changes to validate.'));
      return null;
    }
    setText(statusNode, t('settings_validating', 'Validating settings...'));
    try {
      var result = await requestJson('/admin/settings/preview', {
        method: 'POST',
        body: JSON.stringify({ changes: changes })
      });
      setText(statusNode, t('settings_valid', 'Settings changes are valid. Publishing will commit them to GitHub and start a deploy.'));
      return result;
    } catch (error) {
      logger.error('Failed to validate admin settings', error);
      setText(statusNode, error?.data?.errors?.join(' ') || t('settings_invalid', 'Settings changes need updates before publishing.'));
      return null;
    }
  }

  async function publishSettingsChanges(statusNode, changesOverride) {
    statusNode = statusNode || settingsStatus;
    var changes = changesOverride || collectSettingsChanges();
    if (!changes.length) {
      setText(statusNode, t('settings_no_changes', 'No settings changes to publish.'));
      return false;
    }
    var validation = await validateSettingsChanges(statusNode, changes);
    if (!validation) return false;
    var confirmed = window.confirm(t('settings_publish_confirm', 'Publish these settings and start a deploy? Changes may take a few minutes to appear.'));
    if (!confirmed) return false;
    setText(statusNode, t('settings_publishing', 'Publishing settings and starting deploy...'));
    try {
      var result = await requestJson('/admin/settings/publish', {
        method: 'POST',
        body: JSON.stringify({ changes: changes })
      });
      setText(statusNode, result?.rebuild?.triggered
        ? t('settings_published', 'Settings published to GitHub. Deploy started; changes may take a few minutes to appear.')
        : t('settings_published_no_deploy', 'Settings published, but deploy did not start automatically.'));
      settingsContainers().forEach(function(root) {
        root.querySelectorAll('[data-settings-path]').forEach(function(control) {
          control.dataset.settingsOriginal = String(control.value || '');
        });
      });
      updateDirtyIndicators();
      return true;
    } catch (error) {
      logger.error('Failed to publish admin settings', error);
      setText(statusNode, error?.data?.errors?.join(' ') || error?.data?.error || t('settings_publish_failed', 'Unable to publish settings.'));
      return false;
    }
  }

  function renderCampaignOptions(campaigns) {
    [
      { select: supporterCampaign, previous: supporterCampaign?.value },
      { select: reportCampaign, previous: reportCampaign?.value },
      { select: marketingCampaign, previous: marketingCampaign?.value },
      { select: contentCampaign, previous: contentCampaign?.value }
    ].forEach(function(target) {
      if (!target.select) return;
      target.select.replaceChildren();
      var isSupporterCampaignSelect = target.select === supporterCampaign;
      var isReportCampaignSelect = target.select === reportCampaign;
      if (isSupporterCampaignSelect || isReportCampaignSelect) {
        var allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = t('filter_all', 'All');
        target.select.append(allOption);
      }
      campaigns.forEach(function(campaign) {
        var option = document.createElement('option');
        option.value = campaign.slug;
        option.textContent = campaign.title || campaign.slug;
        target.select.append(option);
      });
      if (target.previous && campaigns.some(function(campaign) { return campaign.slug === target.previous; })) {
        target.select.value = target.previous;
      } else if (isSupporterCampaignSelect || isReportCampaignSelect) {
        target.select.value = '';
      }
    });
    renderAnalyticsOptions(campaigns);
    resetMarketingBuilderFields();
    loadMarketingReferrals();
    hydrateContentDraft();
  }

  function renderAnalyticsOptions(campaigns) {
    if (!(analyticsCampaign instanceof HTMLSelectElement)) return;
    var previous = analyticsCampaign.value;
    analyticsCampaign.replaceChildren();
    var allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = t('analytics_all_campaigns', 'All campaigns');
    analyticsCampaign.append(allOption);
    campaigns.forEach(function(campaign) {
      var option = document.createElement('option');
      option.value = campaign.slug;
      option.textContent = campaign.title || campaign.slug;
      analyticsCampaign.append(option);
    });
    if (previous && campaigns.some(function(campaign) { return campaign.slug === previous; })) {
      analyticsCampaign.value = previous;
    }
  }

  function readMarketingDraft() {
    try {
      return JSON.parse(localStorage.getItem(marketingStorageKey) || '{}') || {};
    } catch (_error) {
      return {};
    }
  }

  function writeMarketingDraft() {
    try {
      localStorage.setItem(marketingStorageKey, JSON.stringify({
        campaignSlug: marketingCampaign?.value || '',
        source: marketingSource?.value || '',
        medium: marketingMedium?.value || '',
        content: marketingContent?.value || '',
        ref: normalizeMarketingReferralCode(marketingReferrer?.value || marketingRef?.value || ''),
        referrer: marketingReferrer?.value || ''
      }));
    } catch (_error) {
    }
  }

  function clearMarketingDraft() {
    try {
      localStorage.removeItem(marketingStorageKey);
    } catch (_error) {
    }
  }

  function resetMarketingBuilderFields(options) {
    if (marketingSource instanceof HTMLInputElement) marketingSource.value = '';
    if (marketingMedium instanceof HTMLInputElement) marketingMedium.value = '';
    if (marketingContent instanceof HTMLInputElement) marketingContent.value = '';
    if (marketingReferrer instanceof HTMLInputElement) marketingReferrer.value = '';
    if (marketingRef instanceof HTMLInputElement) marketingRef.value = '';
    setMarketingEditingState('');
    clearMarketingDraft();
    if (options?.update !== false) updateMarketingBuilder();
  }

  function hydrateMarketingDraft() {
    var draft = readMarketingDraft();
    if (marketingSource instanceof HTMLInputElement) marketingSource.value = draft.source || '';
    if (marketingMedium instanceof HTMLInputElement) marketingMedium.value = draft.medium || '';
    if (marketingContent instanceof HTMLInputElement) marketingContent.value = draft.content || '';
    if (marketingReferrer instanceof HTMLInputElement) marketingReferrer.value = draft.referrer || '';
    if (marketingRef instanceof HTMLInputElement) marketingRef.value = normalizeMarketingReferralCode(draft.referrer || draft.ref || '');
    if (
      marketingCampaign instanceof HTMLSelectElement &&
      draft.campaignSlug &&
      Array.from(marketingCampaign.options).some(function(option) { return option.value === draft.campaignSlug; })
    ) {
      marketingCampaign.value = draft.campaignSlug;
    }
  }

  function selectedMarketingCampaign() {
    var slug = marketingCampaign?.value || '';
    return currentCampaigns.find(function(campaign) { return campaign.slug === slug; }) || currentCampaigns[0] || null;
  }

  function localizedCampaignPath(slug) {
    return (lang === 'es' ? '/es/campaigns/' : '/campaigns/') + encodeURIComponent(slug) + '/';
  }

  function buildMarketingUrl(campaign) {
    if (!campaign?.slug) return '';
    var url = absoluteSiteUrl(localizedCampaignPath(campaign.slug));
    var source = String(marketingSource?.value || '').trim();
    var medium = String(marketingMedium?.value || '').trim();
    var content = String(marketingContent?.value || '').trim();
    var ref = String(marketingRef?.value || '').trim();
    if (source) url.searchParams.set('utm_source', source);
    if (medium) url.searchParams.set('utm_medium', medium);
    url.searchParams.set('utm_campaign', campaign.slug);
    if (content) url.searchParams.set('utm_content', content);
    if (ref) url.searchParams.set('ref', ref);
    return url.toString();
  }

  function buildMarketingSnippets(campaign, url) {
    var title = campaign?.title || campaign?.slug || '';
    var platform = config.platform?.name || config.platformName || 'The Pool';
    var emailCopy = t('marketing_email_copy', 'I thought you might like %{title}. See the campaign, rewards, and progress here: %{url}', { title: title, url: url });
    var emailHtml = t(
      'marketing_email_copy_html',
      'I thought you might like <strong>%{title}</strong>. See the <a href="%{url}">campaign, rewards, and progress</a>.',
      {
        title: escapeEditorHtml(title),
        url: escapeEditorAttribute(url)
      }
    );
    return [
      {
        title: t('marketing_snippet_social', 'Social post'),
        copy: t('marketing_social_copy', 'Support %{title} on %{platform}: %{url}', { title: title, platform: platform, url: url })
      },
      {
        title: t('marketing_snippet_email', 'Email intro'),
        copy: emailCopy,
        html: emailHtml
      },
      {
        title: t('marketing_snippet_milestone', 'Milestone nudge'),
        copy: t('marketing_milestone_copy', '%{title} is live now. Every pledge helps move it closer to the finish line: %{url}', { title: title, url: url })
      }
    ];
  }

  function renderMarketingSnippets(campaign, url) {
    if (!marketingSnippets) return;
    marketingSnippets.replaceChildren();
    if (!campaign || !url) return;
    buildMarketingSnippets(campaign, url).forEach(function(snippet) {
      var card = document.createElement('section');
      card.className = 'admin-marketing__snippet';
      var title = document.createElement('span');
      title.className = 'admin-marketing__snippet-title';
      title.textContent = snippet.title;
      var copy = document.createElement('p');
      copy.className = 'admin-marketing__snippet-copy';
      var safeHtml = snippet.html ? sanitizeClipboardHtml(snippet.html, false) : '';
      if (safeHtml) {
        copy.innerHTML = safeHtml;
      } else {
        copy.textContent = snippet.copy;
      }
      var button = document.createElement('button');
      button.className = 'btn btn--secondary';
      button.type = 'button';
      button.dataset.marketingCopy = snippet.copy;
      if (safeHtml) button.dataset.marketingCopyHtml = safeHtml;
      button.textContent = t('marketing_copy_snippet', 'Copy snippet');
      card.append(title, copy, button);
      marketingSnippets.append(card);
    });
  }

  function setMarketingEditingState(code) {
    marketingEditingOriginalCode = String(code || '');
    if (marketingSaveReferral) {
      marketingSaveReferral.textContent = marketingEditingOriginalCode
        ? t('marketing_update_referral', 'Update referral code')
        : t('marketing_save_referral', 'Save referral code');
    }
    if (marketingCancelEdit) marketingCancelEdit.hidden = !marketingEditingOriginalCode;
  }

  function applyMarketingUrlToFields(url) {
    try {
      var parsed = new URL(String(url || ''));
      if (marketingSource instanceof HTMLInputElement) marketingSource.value = parsed.searchParams.get('utm_source') || '';
      if (marketingMedium instanceof HTMLInputElement) marketingMedium.value = parsed.searchParams.get('utm_medium') || '';
      if (marketingContent instanceof HTMLInputElement) marketingContent.value = parsed.searchParams.get('utm_content') || '';
      if (marketingRef instanceof HTMLInputElement) marketingRef.value = parsed.searchParams.get('ref') || '';
    } catch (_error) {
    }
  }

  function editMarketingReferral(row) {
    var campaignSlug = String(row?.campaignSlug || '').trim();
    if (
      campaignSlug &&
      marketingCampaign instanceof HTMLSelectElement &&
      Array.from(marketingCampaign.options).some(function(option) { return option.value === campaignSlug; })
    ) {
      marketingCampaign.value = campaignSlug;
    }
    applyMarketingUrlToFields(row?.url || '');
    if (marketingRef instanceof HTMLInputElement && !marketingRef.value) marketingRef.value = row?.code || '';
    if (marketingReferrer instanceof HTMLInputElement) marketingReferrer.value = row?.referrer || row?.name || '';
    setMarketingEditingState(row?.code || '');
    updateMarketingBuilder();
    writeMarketingDraft();
    marketingReferrer?.focus?.();
    setText(marketingStatus, t('marketing_referral_editing', 'Editing saved referral code.'));
  }

  async function deleteMarketingReferral(row) {
    var campaign = selectedMarketingCampaign();
    var code = String(row?.code || '').trim();
    if (!campaign?.slug || !code) return;
    if (!window.confirm(t('marketing_referral_delete_confirm', 'Delete this saved referral code?'))) return;
    setText(marketingStatus, t('marketing_referral_deleting', 'Deleting referral code...'));
    try {
      var data = await requestJson('/admin/marketing/referrals', {
        method: 'DELETE',
        body: JSON.stringify({
          campaignSlug: campaign.slug,
          code: code
        })
      });
      if (marketingEditingOriginalCode === code) setMarketingEditingState('');
      renderMarketingReferrals(data.referrals || []);
      setText(marketingStatus, t('marketing_referral_deleted', 'Referral code deleted.'));
    } catch (error) {
      logger.error('Failed to delete referral code', error);
      setText(marketingStatus, error?.data?.error || t('marketing_referral_delete_failed', 'Unable to delete referral code.'));
    }
  }

  function renderMarketingReferrals(referrals) {
    if (!marketingReferralsRoot) return;
    marketingReferralsRoot.replaceChildren();
    var heading = document.createElement('h3');
    heading.textContent = t('marketing_referrals_title', 'Saved referral codes');
    var rows = Array.isArray(referrals) ? referrals : [];
    if (!rows.length) {
      var empty = document.createElement('p');
      empty.className = 'admin-app__muted';
      empty.textContent = t('marketing_referrals_empty', 'No saved referral codes for this campaign yet.');
      marketingReferralsRoot.append(heading, empty);
      return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'admin-marketing__referrals-table-wrap';
    var table = document.createElement('table');
    table.className = 'admin-marketing__referrals-table';
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    var referrerHeader = t('marketing_referrer_header', 'Referrer');
    var urlHeader = t('marketing_ref_url_header', 'URL');
    var createdHeader = t('marketing_ref_created_header', 'Created');
    var actionsHeader = t('marketing_ref_actions_header', 'Actions');
    appendTableHeader(headerRow, [referrerHeader, urlHeader, createdHeader, actionsHeader]);
    thead.append(headerRow);
    var tbody = document.createElement('tbody');
    rows.forEach(function(row) {
      var tr = document.createElement('tr');
      var referrerCell = document.createElement('td');
      referrerCell.setAttribute('data-label', referrerHeader);
      referrerCell.textContent = row.referrer || row.name || '';
      var urlCell = document.createElement('td');
      urlCell.setAttribute('data-label', urlHeader);
      var url = String(row.url || '').trim();
      if (url) {
        var link = document.createElement('a');
        link.className = 'admin-marketing__referral-url';
        link.href = url;
        link.textContent = url;
        urlCell.append(link);
      }
      var createdCell = document.createElement('td');
      createdCell.setAttribute('data-label', createdHeader);
      createdCell.textContent = row.createdAt ? new Date(row.createdAt).toLocaleDateString(lang || 'en') : '';
      var actionsCell = document.createElement('td');
      actionsCell.setAttribute('data-label', actionsHeader);
      var actions = document.createElement('div');
      actions.className = 'admin-marketing__referral-actions';
      var edit = document.createElement('button');
      edit.className = 'btn btn--secondary btn--small';
      edit.type = 'button';
      edit.textContent = t('marketing_referral_edit', 'Edit');
      edit.addEventListener('click', function() {
        editMarketingReferral(row);
      });
      var remove = document.createElement('button');
      remove.className = 'btn btn--secondary btn--small';
      remove.type = 'button';
      remove.textContent = t('marketing_referral_delete', 'Delete');
      remove.addEventListener('click', function() {
        deleteMarketingReferral(row);
      });
      actions.append(edit, remove);
      actionsCell.append(actions);
      tr.append(referrerCell, urlCell, createdCell, actionsCell);
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    marketingReferralsRoot.append(heading, wrap);
  }

  async function loadMarketingReferrals() {
    if (!marketingReferralsRoot) return;
    var campaign = selectedMarketingCampaign();
    if (!campaign?.slug) {
      renderMarketingReferrals([]);
      return;
    }
    try {
      var params = new URLSearchParams({ campaignSlug: campaign.slug });
      var data = await requestJson('/admin/marketing/referrals?' + params.toString(), { method: 'GET' });
      renderMarketingReferrals(data.referrals || []);
    } catch (error) {
      logger.error('Failed to load saved referral codes', error);
      setText(marketingStatus, t('marketing_referrals_load_failed', 'Unable to load saved referral codes.'));
    }
  }

  function normalizeMarketingReferralCode(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  function syncMarketingReferralCode() {
    if (!(marketingRef instanceof HTMLInputElement)) return '';
    var code = normalizeMarketingReferralCode(marketingReferrer?.value || '');
    marketingRef.value = code;
    return code;
  }

  async function saveMarketingReferral() {
    var campaign = selectedMarketingCampaign();
    var code = syncMarketingReferralCode();
    var name = String(marketingReferrer?.value || '').trim();
    updateMarketingBuilder();
    var url = String(marketingUrl?.value || '').trim();
    if (!campaign?.slug || !code || !name || !url) {
      setText(marketingStatus, t('marketing_referral_required', 'Choose a campaign, add the referrer name, and generate a campaign URL.'));
      return;
    }
    writeMarketingDraft();
    setText(marketingStatus, t('marketing_referral_saving', 'Saving referral code...'));
    try {
      var data = await requestJson('/admin/marketing/referrals', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: campaign.slug,
          code: code,
          originalCode: marketingEditingOriginalCode || undefined,
          name: name,
          referrer: name,
          url: url
        })
      });
      setMarketingEditingState('');
      renderMarketingReferrals(data.referrals || []);
      resetMarketingBuilderFields();
      setText(marketingStatus, t('marketing_referral_saved', 'Referral code saved.'));
    } catch (error) {
      logger.error('Failed to save referral code', error);
      setText(marketingStatus, error?.data?.error || t('marketing_referral_save_failed', 'Unable to save referral code.'));
    }
  }

  function updateMarketingBuilder() {
    syncMarketingReferralCode();
    var campaign = selectedMarketingCampaign();
    if (!campaign) {
      if (marketingUrl) marketingUrl.value = '';
      if (marketingSnippets) marketingSnippets.replaceChildren();
      syncMarketingEmbedBuilder(null);
      return;
    }
    if (
      marketingCampaign instanceof HTMLSelectElement &&
      campaign.slug &&
      marketingCampaign.value !== campaign.slug
    ) {
      marketingCampaign.value = campaign.slug;
    }
    var campaignUrl = buildMarketingUrl(campaign);
    if (marketingUrl) marketingUrl.value = campaignUrl;
    syncMarketingEmbedBuilder(campaign);
    renderMarketingSnippets(campaign, campaignUrl);
  }

  function syncMarketingEmbedBuilder(campaign) {
    if (!marketingEmbedBuilder) return;
    var slug = String(campaign?.slug || '').trim();
    if (marketingEmbedSyncedSlug === slug) return;
    marketingEmbedSyncedSlug = slug;
    window.dispatchEvent(new CustomEvent('pool-campaign-embed:set-campaign', {
      detail: { slug: slug }
    }));
  }

  async function copyText(text) {
    var value = String(text || '');
    if (!value) return false;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    var field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', 'true');
    field.style.position = 'fixed';
    field.style.left = '-9999px';
    document.body.append(field);
    field.select();
    var copied = document.execCommand('copy');
    field.remove();
    return copied;
  }

  async function copyRichText(html, plainText) {
    var htmlValue = String(html || '');
    var textValue = String(plainText || '');
    if (!htmlValue) return copyText(textValue);
    if (navigator.clipboard?.write && window.ClipboardItem && window.Blob) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([htmlValue], { type: 'text/html' }),
          'text/plain': new Blob([textValue], { type: 'text/plain' })
        })
      ]);
      return true;
    }
    var field = document.createElement('div');
    field.contentEditable = 'true';
    field.setAttribute('aria-hidden', 'true');
    field.style.position = 'fixed';
    field.style.left = '-9999px';
    field.style.top = '0';
    field.innerHTML = htmlValue;
    document.body.append(field);
    var selection = window.getSelection?.();
    var range = document.createRange();
    range.selectNodeContents(field);
    selection?.removeAllRanges();
    selection?.addRange(range);
    var copied = document.execCommand('copy');
    selection?.removeAllRanges();
    field.remove();
    return copied || copyText(textValue);
  }

  async function copyMarketingText(text, html) {
    try {
      var copied = html ? await copyRichText(html, text) : await copyText(text);
      setText(marketingStatus, copied
        ? t('marketing_copied', 'Copied.')
        : t('marketing_copy_failed', 'Unable to copy.'));
    } catch (error) {
      logger.warn('Marketing copy failed', error);
      setText(marketingStatus, t('marketing_copy_failed', 'Unable to copy.'));
    }
  }

  function titleCaseAnalyticsKey(value) {
    return String(value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, function(character) { return character.toUpperCase(); });
  }

  function analyticsBreakdownLabel(group, key, options) {
    var normalized = String(key || '').trim().toLowerCase();
    if (group === 'status') {
      return t('analytics_status_' + normalized, titleCaseAnalyticsKey(normalized));
    }
    if (group === 'language') {
      return t('analytics_language_' + normalized, normalized ? normalized.toUpperCase() : t('analytics_unknown', 'Unknown'));
    }
    if (group === 'referral') {
      if (!normalized || normalized === 'direct') return t('analytics_referral_direct', 'No referral code');
      var referralLabels = options?.referralLabels || {};
      var savedLabel = String(referralLabels[normalized] || '').trim();
      if (savedLabel) {
        return savedLabel.toLowerCase() === normalized ? savedLabel : savedLabel + ' (' + normalized + ')';
      }
      return titleCaseAnalyticsKey(normalized);
    }
    if (group === 'utm') {
      if (!normalized || normalized === 'none') return t('analytics_utm_none', 'No UTM source');
      return titleCaseAnalyticsKey(normalized);
    }
    if (group === 'fulfillment') {
      if (normalized === 'physical') return t('analytics_fulfillment_physical', 'Physical');
      if (normalized === 'digital') return t('analytics_fulfillment_digital', 'Digital');
      if (normalized === 'platform_addons') return t('analytics_fulfillment_platform_addons', 'Platform add-ons');
    }
    return titleCaseAnalyticsKey(normalized);
  }

  function analyticsStateLabel(state) {
    var normalized = String(state || '').trim().toLowerCase();
    if (normalized === 'upcoming' || normalized === 'prelaunch') return t('analytics_state_upcoming', 'Upcoming');
    if (normalized === 'live') return t('analytics_state_live', 'Live');
    if (normalized === 'post') return t('analytics_state_post', 'Post-campaign');
    if (normalized === 'funded') return t('analytics_state_funded', 'Funded');
    if (normalized === 'draft') return t('analytics_state_draft', 'Draft');
    if (normalized === 'archived') return t('analytics_state_archived', 'Archived');
    return normalized ? titleCaseAnalyticsKey(normalized) : t('analytics_unknown', 'Unknown');
  }

  function campaignStateLabel(state) {
    var normalized = String(state || '').trim().toLowerCase();
    if (normalized === 'pre') return t('campaign_state_pre', 'Pre-launch (legacy)');
    return analyticsStateLabel(normalized);
  }

  function renderAnalyticsBreakdown(title, rows, group, options) {
    var card = document.createElement('section');
    card.className = 'admin-analytics__card';
    var heading = document.createElement('div');
    heading.className = 'admin-analytics__breakdown-title';
    heading.textContent = title;
    card.append(heading);
    var list = document.createElement('ul');
    list.className = 'admin-analytics__breakdown-list';
    (rows || []).slice(0, 5).forEach(function(row) {
      var item = document.createElement('li');
      item.textContent = t('analytics_breakdown_item', '%{key}: %{count} (%{amount})', {
        key: analyticsBreakdownLabel(group, row.key, options),
        count: formatNumber(row.count),
        amount: formatMoney(row.amount)
      });
      list.append(item);
    });
    if (!list.children.length) {
      var empty = document.createElement('li');
      empty.textContent = t('analytics_breakdown_empty', 'No data yet');
      list.append(empty);
    }
    card.append(list);
    return card;
  }

  function analyticsFulfillmentBreakdown(totals) {
    return [
      { key: 'physical', count: Number(totals?.physicalPledgeCount || 0), amount: Number(totals?.physicalPledgeAmount || 0) },
      { key: 'digital', count: Number(totals?.digitalPledgeCount || 0), amount: Number(totals?.digitalPledgeAmount || 0) },
      { key: 'platform_addons', count: Number(totals?.platformAddOnPledgeCount || 0), amount: Number(totals?.platformAddOnRevenue || 0) }
    ].filter(function(row) {
      return row.count > 0 || row.amount > 0;
    });
  }

  function updateAnalyticsSortIndicators(table) {
    table?.querySelectorAll('th[data-analytics-sort-index]').forEach(function(header) {
      var isActive = Number(header.dataset.analyticsSortIndex) === analyticsSort.index;
      header.setAttribute('aria-sort', isActive ? analyticsSort.direction + 'ending' : 'none');
      var indicator = header.querySelector('.admin-analytics__sort-indicator');
      if (indicator) {
        indicator.textContent = adminSortIndicatorText(isActive, analyticsSort.direction);
        indicator.classList.toggle('is-active', isActive);
      }
    });
  }

  function sortAnalyticsRows(table) {
    if (!table) return;
    if (analyticsSort.index < 0) {
      updateAnalyticsSortIndicators(table);
      return;
    }
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var direction = analyticsSort.direction === 'desc' ? -1 : 1;
    var rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort(function(a, b) {
      var aValue = a.children[analyticsSort.index]?.dataset.analyticsSortValue || '';
      var bValue = b.children[analyticsSort.index]?.dataset.analyticsSortValue || '';
      return compareAdminSortValues(aValue, bValue, direction);
    });
    tbody.append.apply(tbody, rows);
    updateAnalyticsSortIndicators(table);
  }

  function appendAnalyticsHeader(row, labels) {
    labels.forEach(function(label, index) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.dataset.analyticsSortIndex = String(index);
      th.dataset.exportLabel = String(label || '');
      th.setAttribute('aria-sort', 'none');
      var button = createAdminSortButton(label, 'admin-analytics__sort', 'admin-analytics__sort-indicator', function() {
        analyticsSort.direction = analyticsSort.index === index && analyticsSort.direction === 'asc' ? 'desc' : 'asc';
        analyticsSort.index = index;
        sortAnalyticsRows(row.closest('table'));
      });
      th.append(button);
      row.append(th);
    });
  }

  function appendAnalyticsCells(row, cells) {
    cells.forEach(function(cell) {
      var td = document.createElement('td');
      td.textContent = cell.value;
      td.dataset.analyticsSortValue = String(cell.sortValue ?? cell.value ?? '');
      row.append(td);
    });
  }

  function analyticsMetricCard(label, value, helpText, key) {
    var card = statCard('admin-analytics__card', label, value);
    var labelNode = card.querySelector('.admin-analytics__card-label');
    var help = createHelpControl(label, helpText, 'analytics-' + (key || label));
    if (labelNode && help) labelNode.append(help);
    return card;
  }

  function renderAnalytics(data) {
    if (!analyticsRoot) return;
    analyticsRoot.replaceChildren();
    var totals = data?.totals || {};
    var platformRevenue = Number(totals.platformAddOnRevenue || 0) + Number(totals.platformTipRevenue || 0);
    var averagePledge = Number(totals.pledgeCount || 0) > 0
      ? Number(totals.pledgedAmount || 0) / Number(totals.pledgeCount || 1)
      : 0;
    var summary = document.createElement('section');
    summary.className = 'admin-analytics__summary';
    var metrics = document.createElement('div');
    metrics.className = 'admin-analytics__metrics';
    metrics.append(
      analyticsMetricCard(t('analytics_pledged', 'Pledged'), formatMoney(totals.pledgedAmount), t('analytics_help_pledged', 'Total promised by non-cancelled pledges. This can include active pledges and payment-failed pledges, so use Charged for money actually collected.'), 'pledged'),
      analyticsMetricCard(t('analytics_campaign_revenue', 'Campaign revenue'), formatMoney(totals.campaignRevenue), t('analytics_help_campaign_revenue', 'Pledge value that belongs to the campaign before tax, shipping, platform tips, and platform add-ons. Campaign add-ons are already included here.'), 'campaign-revenue'),
      analyticsMetricCard(t('analytics_platform_revenue', 'Platform revenue'), formatMoney(platformRevenue), t('analytics_help_platform_revenue', 'Pledge value that belongs to the platform: platform add-ons plus platform tips. This does not include tax, shipping, campaign revenue, or processor fees.'), 'platform-revenue'),
      analyticsMetricCard(t('analytics_tax', 'Tax'), formatMoney(totals.taxTotal), t('analytics_help_tax', 'Sales tax recorded on non-cancelled pledges. This is included in Pledged, but not in Campaign revenue or Platform revenue.'), 'tax'),
      analyticsMetricCard(t('analytics_shipping', 'Shipping'), formatMoney(totals.shippingTotal), t('analytics_help_shipping', 'Shipping fees recorded on non-cancelled pledges. This is included in Pledged, but not in Campaign revenue or Platform revenue.'), 'shipping'),
      analyticsMetricCard(t('analytics_estimated_stripe_fees', 'Estimated Stripe fees'), formatMoney(totals.estimatedStripeFeeAmount), t('analytics_help_estimated_stripe_fees', "Planning estimate for active or charged pledges using Stripe's standard US domestic card rate: 2.9% + $0.30 per pledge. Actual fees can differ."), 'estimated-stripe-fees'),
      analyticsMetricCard(t('analytics_charged', 'Charged'), formatMoney(totals.chargedAmount), t('analytics_help_charged', 'Money from pledges that have successfully been charged. This is the closest card to collected gross revenue.'), 'charged'),
      analyticsMetricCard(t('analytics_payment_failed', 'Payment failed'), formatMoney(totals.paymentFailedAmount), t('analytics_help_payment_failed', 'Value of pledges currently marked payment failed. This is not collected money.'), 'payment-failed'),
      analyticsMetricCard(t('analytics_supporters', 'Supporters'), formatNumber(totals.uniqueSupporters), t('analytics_help_supporters', 'Unique supporter email addresses in this view. One person with multiple pledges is counted once.'), 'supporters'),
      analyticsMetricCard(t('analytics_pledges', 'Total pledges'), formatNumber(totals.pledgeCount), t('analytics_help_pledges', 'Total pledge records in this view, including active, charged, payment-failed, and cancelled pledges.'), 'pledges'),
      analyticsMetricCard(t('analytics_active_pledges', 'Active or charged pledges'), formatNumber(totals.activePledgeCount), t('analytics_help_active_pledges', 'Pledges that are still active or already charged. Cancelled pledges and payment-failed pledges are not included.'), 'active-pledges'),
      analyticsMetricCard(t('analytics_average_pledge', 'Average pledge'), formatMoney(averagePledge), t('analytics_help_average_pledge', 'Pledged value divided by total pledge records. Cancelled pledges count as records but add no pledged dollars.'), 'average-pledge'),
      analyticsMetricCard(t('analytics_campaign_addons', 'Campaign add-ons'), formatMoney(totals.campaignAddOnRevenue), t('analytics_help_campaign_addons', 'The part of campaign revenue that came from campaign-specific add-ons. This is already included in Campaign revenue.'), 'campaign-addons'),
      analyticsMetricCard(t('analytics_platform_addons', 'Platform add-ons'), formatMoney(totals.platformAddOnRevenue), t('analytics_help_platform_addons', 'The part of platform revenue that came from platform-level add-on products.'), 'platform-addons'),
      analyticsMetricCard(t('analytics_platform_tips', 'Platform tips'), formatMoney(totals.platformTipRevenue), t('analytics_help_platform_tips', 'Optional tips supporters added for the platform. These are included in Platform revenue.'), 'platform-tips')
    );
    summary.append(metrics);

    var referralLabels = data?.referralLabels || {};
    var breakdowns = document.createElement('div');
    breakdowns.className = 'admin-analytics__breakdowns';
    breakdowns.append(
      renderAnalyticsBreakdown(t('analytics_referral_breakdown', 'Referral codes'), data?.referralBreakdown || [], 'referral', { referralLabels: referralLabels }),
      renderAnalyticsBreakdown(t('analytics_language_breakdown', 'Language'), data?.languageBreakdown || [], 'language'),
      renderAnalyticsBreakdown(t('analytics_utm_breakdown', 'UTM sources'), data?.utmSourceBreakdown || [], 'utm'),
      renderAnalyticsBreakdown(t('analytics_fulfillment_breakdown', 'Fulfillment type'), analyticsFulfillmentBreakdown(totals), 'fulfillment')
    );
    summary.append(breakdowns);
    analyticsRoot.append(summary);

    var campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
    if (data?.scope !== 'portfolio') return;
    if (!campaigns.length) return;
    var tableSection = document.createElement('div');
    tableSection.className = 'admin-analytics__table-section';
    var wrap = document.createElement('div');
    wrap.className = 'admin-analytics__table-wrap';
    var rowCount = document.createElement('p');
    rowCount.className = 'admin-analytics__row-count admin-app__muted';
    rowCount.textContent = t('analytics_campaign_rows', '%{count} campaigns', {
      count: formatNumber(campaigns.length)
    });
    wrap.append(rowCount);
    var table = document.createElement('table');
    table.className = 'admin-analytics__table';
    var caption = document.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = t('analytics_campaign_table', 'Campaign analytics');
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    var headerLabels = [
      t('campaign', 'Campaign'),
      t('state', 'State'),
      t('analytics_pledged', 'Pledged'),
      t('backers', 'Backers'),
      t('progress', 'Progress'),
      t('analytics_pledges', 'Pledges'),
      t('analytics_charged', 'Charged'),
      t('analytics_campaign_revenue', 'Campaign revenue'),
      t('analytics_platform_revenue', 'Platform revenue'),
      t('analytics_estimated_stripe_fees', 'Estimated Stripe fees'),
      t('analytics_payment_failed', 'Payment failed')
    ];
    if (analyticsSort.index >= headerLabels.length) analyticsSort.index = -1;
    appendAnalyticsHeader(headerRow, headerLabels);
    thead.append(headerRow);
    var tbody = document.createElement('tbody');
    campaigns.forEach(function(campaign) {
      var row = document.createElement('tr');
      var campaignTotals = campaign.totals || {};
      var goalAmountCents = Number(campaign.goalAmount || 0) * 100;
      var pledgedAmount = Number(campaignTotals.pledgedAmount || 0);
      var percentFunded = goalAmountCents > 0 ? Math.round((pledgedAmount / goalAmountCents) * 100) : 0;
      var stateValue = String(campaign.effectiveState || campaign.state || '');
      appendAnalyticsCells(row, [
        { value: campaign.title || campaign.slug || '', sortValue: String(campaign.title || campaign.slug || '').toLocaleLowerCase() },
        { value: analyticsStateLabel(stateValue), sortValue: stateValue.toLocaleLowerCase() },
        { value: formatMoney(pledgedAmount), sortValue: pledgedAmount },
        { value: formatNumber(campaignTotals.uniqueSupporters), sortValue: Number(campaignTotals.uniqueSupporters || 0) },
        { value: formatPercent(percentFunded), sortValue: percentFunded },
        { value: formatNumber(campaignTotals.pledgeCount), sortValue: Number(campaignTotals.pledgeCount || 0) },
        { value: formatMoney(campaignTotals.chargedAmount), sortValue: Number(campaignTotals.chargedAmount || 0) },
        { value: formatMoney(campaignTotals.campaignRevenue), sortValue: Number(campaignTotals.campaignRevenue || 0) },
        { value: formatMoney(Number(campaignTotals.platformAddOnRevenue || 0) + Number(campaignTotals.platformTipRevenue || 0)), sortValue: Number(campaignTotals.platformAddOnRevenue || 0) + Number(campaignTotals.platformTipRevenue || 0) },
        { value: formatMoney(campaignTotals.estimatedStripeFeeAmount), sortValue: Number(campaignTotals.estimatedStripeFeeAmount || 0) },
        { value: formatMoney(campaignTotals.paymentFailedAmount), sortValue: Number(campaignTotals.paymentFailedAmount || 0) }
      ]);
      tbody.append(row);
    });
    table.append(caption, thead, tbody);
    sortAnalyticsRows(table);
    wrap.append(table);
    var actions = document.createElement('div');
    actions.className = 'admin-analytics__table-actions';
    var exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'btn btn--secondary';
    exportButton.textContent = t('analytics_export_csv', 'Export CSV');
    exportButton.addEventListener('click', exportVisibleAnalyticsCsv);
    actions.append(exportButton);
    tableSection.append(wrap, actions);
    analyticsRoot.append(tableSection);
  }

  async function loadAnalytics() {
    if (!analyticsRoot) return;
    var params = new URLSearchParams();
    if (analyticsCampaign?.value) params.set('campaignSlug', analyticsCampaign.value);
    setText(analyticsStatus, t('analytics_loading', 'Loading analytics...'));
    try {
      var data = await requestJson('/admin/analytics' + (params.toString() ? '?' + params.toString() : ''), { method: 'GET' });
      renderAnalytics(data);
      setText(analyticsStatus, '');
    } catch (error) {
      logger.error('Failed to load analytics', error);
      setText(analyticsStatus, error?.data?.code === 'campaign_index_required'
        ? t('analytics_index_required', 'Campaign pledge indexes must be rebuilt before analytics can load.')
        : t('analytics_load_failed', 'Unable to load analytics.'));
    }
  }

  function selectedContentCampaignSlug() {
    return contentCampaign?.value || currentCampaigns[0]?.slug || '';
  }

  function selectedCampaignSettingValue(path, fallback) {
    var value = getSettingsControlValue(path, selectedContentCampaignSlug());
    return value !== '' ? value : (fallback || '');
  }

  function syncContentMetadataFromSettings() {
    if (contentTitleField instanceof HTMLInputElement) {
      contentTitleField.value = selectedCampaignSettingValue('title', contentTitleField.value);
    }
    if (contentShortBlurb instanceof HTMLTextAreaElement) {
      contentShortBlurb.value = selectedCampaignSettingValue('short_blurb', contentShortBlurb.value);
    }
  }

  function contentBlockLabel(type) {
    var labels = {
      text: t('content_block_text', 'Text'),
      quote: t('content_block_quote', 'Quote'),
      image: t('content_block_image', 'Image'),
      gallery: t('content_block_gallery', 'Gallery'),
      video: t('content_block_video', 'Video'),
      audio: t('content_block_audio', 'Audio'),
      embed: t('content_block_embed', 'Embed'),
      divider: t('content_block_divider', 'Divider')
    };
    return labels[type] || labels.text;
  }

  function contentBlockCommand(value) {
    var type = String(value || '').trim().replace(/^\/+/, '').toLowerCase();
    return contentBlockTypes.indexOf(type) >= 0 ? type : 'text';
  }

  function contentBlockAlignment(value) {
    var align = String(value || '').trim().toLowerCase();
    return contentAlignments.indexOf(align) >= 0 ? align : 'left';
  }

  function contentGalleryLayout(value) {
    var layout = String(value || '').trim().toLowerCase();
    return layout === 'carousel' ? 'carousel' : 'grid';
  }

  function contentGalleryCaptionStyle(value) {
    var style = String(value || '').trim().toLowerCase();
    return style === 'overlay' ? 'overlay' : 'inline';
  }

  function contentVideoProvider(value) {
    var provider = String(value || '').trim().toLowerCase();
    return ['youtube', 'vimeo', 'local'].indexOf(provider) >= 0 ? provider : 'youtube';
  }

  function contentVideoSourceType(src) {
    var path = String(src || '');
    if (/\.webm(?:[?#].*)?$/i.test(path)) return 'video/webm';
    if (/\.mp4(?:[?#].*)?$/i.test(path)) return 'video/mp4';
    if (/\.mov(?:[?#].*)?$/i.test(path)) return 'video/quicktime';
    return '';
  }

  function cloneContentBlocks(blocks) {
    return JSON.parse(JSON.stringify(blocks || []));
  }

  function contentBlocksSnapshot(blocks) {
    try {
      return JSON.stringify(parseContentBlocks(blocks || []));
    } catch (_error) {
      return JSON.stringify([]);
    }
  }

  function pushContentHistory() {
    contentHistory.push(cloneContentBlocks(contentBlocks));
    if (contentHistory.length > 50) contentHistory.shift();
  }

  function pushContentSnapshot(snapshot) {
    contentHistory.push(cloneContentBlocks(snapshot));
    if (contentHistory.length > 50) contentHistory.shift();
  }

  function undoContentBlockMutation() {
    var previous = contentHistory.pop();
    if (!previous) return false;
    contentBlocks = previous;
    lastContentMutation = 'undo';
    renderContentBlocks();
    writeContentDraft();
    return true;
  }

  function defaultContentBlock(type) {
    var align = 'left';
    switch (contentBlockCommand(type)) {
      case 'quote':
        return { type: 'quote', text: '', author: '', align: align };
      case 'image':
        return { type: 'image', src: '', alt: '', caption: '', align: align };
      case 'gallery':
        return { type: 'gallery', layout: 'grid', caption_style: 'inline', images: [], caption: '', align: align };
      case 'video':
        return { type: 'video', provider: 'youtube', video_id: '', src: '', poster: '', caption: '', align: align };
      case 'audio':
        return { type: 'audio', src: '', title: '', caption: '', align: align };
      case 'embed':
        return { type: 'embed', provider: 'spotify', src: '', title: '', caption: '', align: align };
      case 'divider':
        return { type: 'divider', align: align };
      default:
        return { type: 'text', body: '', align: align };
    }
  }

  function normalizeContentBlock(block) {
    if (!block || typeof block !== 'object') return defaultContentBlock('text');
    var type = contentBlockCommand(block.type);
    var normalized = defaultContentBlock(type);
    Object.keys(normalized).forEach(function(key) {
      if (key === 'type') return;
      if (key === 'images') {
        normalized.images = Array.isArray(block.images)
          ? block.images.map(function(image) {
            return {
              src: String(image?.src || ''),
              alt: String(image?.alt || ''),
              caption: String(image?.caption || '')
            };
          })
          : [];
        return;
      }
      if (key === 'layout') {
        normalized.layout = contentGalleryLayout(block.layout);
        return;
      }
      if (key === 'caption_style') {
        normalized.caption_style = contentGalleryCaptionStyle(block.caption_style);
        return;
      }
      if (key === 'provider' && type === 'video') {
        normalized.provider = contentVideoProvider(block.provider);
        return;
      }
      normalized[key] = String(block[key] || '');
    });
    normalized.align = contentBlockAlignment(block.align);
    return normalized;
  }

  function parseContentBlocks(value) {
    if (Array.isArray(value)) return value.map(normalizeContentBlock);
    if (typeof value === 'string' && value.trim()) {
      var parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(normalizeContentBlock) : [];
    }
    return [];
  }

  function galleryImagesToText(images) {
    return (Array.isArray(images) ? images : []).map(function(image) {
      return [image?.src || '', image?.alt || '', image?.caption || ''].join(' | ').replace(/( \| )+$/, '');
    }).join('\n');
  }

  function galleryTextToImages(value) {
    return String(value || '').split(/\r?\n/).map(function(line) {
      var parts = line.split('|').map(function(part) { return part.trim(); });
      return {
        src: parts[0] || '',
        alt: parts[1] || '',
        caption: parts[2] || ''
      };
    }).filter(function(image) {
      return image.src || image.alt || image.caption;
    });
  }

  function syncContentJsonFromBlocks() {
    if (activeContentJsonField instanceof HTMLTextAreaElement) {
      activeContentJsonField.value = JSON.stringify(contentBlocks, null, 2);
    }
  }

  function contentBlocksFromField(field) {
    try {
      var blocks = parseContentBlocks(field?.value || '[]');
      return blocks.length ? blocks : [defaultContentBlock('text')];
    } catch (_error) {
      return [defaultContentBlock('text')];
    }
  }

  function withContentEditorContext(root, field, callback) {
    if (!(root instanceof HTMLElement) || !(field instanceof HTMLTextAreaElement)) return callback();
    var previousRoot = contentBlocksRoot;
    var previousJsonField = activeContentJsonField;
    var previousBlocks = contentBlocks;
    var previousHistory = contentHistory;
    var previousMutation = lastContentMutation;
    var previousDiaryField = activeDiaryContentField;
    var previousEditable = activeContentEditable;
    var previousLink = activeContentLink;
    contentBlocksRoot = root;
    activeContentJsonField = field;
    contentBlocks = contentBlocksFromField(field);
    contentHistory = root.__contentHistory || [];
    lastContentMutation = root.__lastContentMutation || '';
    activeDiaryContentField = field;
    try {
      return callback();
    } finally {
      syncContentJsonFromBlocks();
      root.__contentHistory = contentHistory;
      root.__lastContentMutation = lastContentMutation;
      field.dispatchEvent(new Event('change', { bubbles: true }));
      contentBlocksRoot = previousRoot;
      activeContentJsonField = previousJsonField;
      contentBlocks = previousBlocks;
      contentHistory = previousHistory;
      lastContentMutation = previousMutation;
      activeDiaryContentField = previousDiaryField;
      activeContentEditable = previousEditable;
      activeContentLink = previousLink;
    }
  }

  function escapeEditorHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeEditorAttribute(value) {
    return escapeEditorHtml(value).replace(/"/g, '&quot;');
  }

  function isSafeEditorHref(value) {
    return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(String(value || '').trim());
  }

  function renderEditorInlineMarkdown(value) {
    var html = escapeEditorHtml(value);
    html = html.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    html = html.replace(/&lt;(\/?(?:u|strong|em|b|i))&gt;/gi, '<$1>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|\/(?!\/)[^)\s]+|#[^)\s]+)\)/gi, function(match, label, href) {
      var normalizedHref = String(href || '').replace(/&amp;/g, '&');
      return isSafeEditorHref(normalizedHref) ? '<a href="' + escapeEditorAttribute(normalizedHref) + '">' + label + '</a>' : match;
    });
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    return html;
  }

  function createSafeRichTextSpan(value, className) {
    var span = document.createElement('span');
    span.className = className || '';
    span.innerHTML = renderEditorInlineMarkdown(value);
    return span;
  }

  function directChildWithClass(parent, className) {
    if (!(parent instanceof HTMLElement)) return null;
    return Array.from(parent.children).find(function(child) {
      return child instanceof HTMLElement && child.classList.contains(className);
    }) || null;
  }

  function renderGalleryImageCaption(galleryItem, caption) {
    if (!(galleryItem instanceof HTMLElement)) return;
    directChildWithClass(galleryItem, 'gallery__item-caption')?.remove();
    if (!caption) return;
    var itemCaption = document.createElement('span');
    itemCaption.className = 'gallery__item-caption';
    itemCaption.append(createSafeRichTextSpan(caption, 'gallery__item-caption-text'));
    var settingsButton = directChildWithClass(galleryItem, 'admin-content-block__settings-button--gallery-image');
    galleryItem.insertBefore(itemCaption, settingsButton || null);
  }

  function isContentSettingsTarget(node) {
    var element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element?.closest?.(
      '[data-content-action="toggle-media-settings"], [data-content-action="toggle-gallery-image-settings"], [data-content-media-settings], [data-content-gallery-image-settings]'
    ));
  }

  function contentSettingsButtonForNode(node) {
    var element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    var button = element?.closest?.('[data-content-action="toggle-media-settings"], [data-content-action="toggle-gallery-image-settings"]');
    return button instanceof HTMLButtonElement ? button : null;
  }

  function markdownToEditorHtml(value, blockMode) {
    var lines = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (!blockMode) return renderEditorInlineMarkdown(lines.join(' '));
    var chunks = [];
    var paragraph = [];
    var listItems = [];
    var listTag = 'ul';
    function flushParagraph() {
      if (!paragraph.length) return;
      chunks.push('<p>' + renderEditorInlineMarkdown(paragraph.join(' ')) + '</p>');
      paragraph = [];
    }
    function flushList() {
      if (!listItems.length) return;
      chunks.push('<' + listTag + '>' + listItems.map(function(item) {
        return '<li>' + renderEditorInlineMarkdown(item) + '</li>';
      }).join('') + '</' + listTag + '>');
      listItems = [];
      listTag = 'ul';
    }
    lines.forEach(function(line) {
      var trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }
      var heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        chunks.push('<h' + heading[1].length + '>' + renderEditorInlineMarkdown(heading[2]) + '</h' + heading[1].length + '>');
      } else {
        var unorderedListItem = trimmed.match(/^[-*]\s+(.+)$/);
        if (unorderedListItem) {
          flushParagraph();
          if (listItems.length && listTag !== 'ul') flushList();
          listTag = 'ul';
          listItems.push(unorderedListItem[1]);
        } else {
          var orderedListItem = trimmed.match(/^\d+[.)]\s+(.+)$/);
          if (orderedListItem) {
            flushParagraph();
            if (listItems.length && listTag !== 'ol') flushList();
            listTag = 'ol';
            listItems.push(orderedListItem[1]);
          } else {
            flushList();
            paragraph.push(trimmed);
          }
        }
      }
    });
    flushParagraph();
    flushList();
    return chunks.join('') || '';
  }

  function normalizePastedPlainText(value) {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/^\s*[•◦▪]\s+/gm, '- ')
      .replace(/^\s*([a-zA-Z])[\.)]\s+/gm, function(_match, letter) {
        var index = letter.toLowerCase().charCodeAt(0) - 96;
        return (index > 0 ? index : 1) + '. ';
      })
      .trim();
  }

  function elementHasClipboardStyle(element, styleName) {
    var style = (element.getAttribute('style') || '').toLowerCase();
    if (styleName === 'bold') return /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
    if (styleName === 'italic') return /font-style\s*:\s*italic/.test(style);
    if (styleName === 'underline') return /text-decoration[^;]*underline/.test(style);
    return false;
  }

  function sanitizeClipboardHtml(html, blockMode) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(String(html || ''), 'text/html');
    var unsafeTags = new Set(['script', 'style', 'meta', 'link', 'object', 'embed', 'iframe', 'svg']);
    var blockTags = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote']);
    function cleanChildren(node) {
      return Array.from(node.childNodes).map(cleanNode).join('');
    }
    function wrapInlineStyle(element, htmlValue) {
      var tag = element.tagName.toLowerCase();
      var value = htmlValue;
      if ((tag === 'u' || elementHasClipboardStyle(element, 'underline')) && value) value = '<u>' + value + '</u>';
      if ((tag === 'em' || tag === 'i' || elementHasClipboardStyle(element, 'italic')) && value) value = '<em>' + value + '</em>';
      if ((tag === 'strong' || tag === 'b' || elementHasClipboardStyle(element, 'bold')) && value) value = '<strong>' + value + '</strong>';
      return value;
    }
    function cleanNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return escapeEditorHtml(node.textContent || '');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      var element = node;
      var tag = element.tagName.toLowerCase();
      if (unsafeTags.has(tag)) return '';
      if (tag === 'br') return '<br>';
      var inner = cleanChildren(element);
      if (!inner.trim()) return '';
      if (tag === 'a') {
        var href = element.getAttribute('href') || '';
        return isSafeEditorHref(href) ? '<a href="' + escapeEditorAttribute(href) + '">' + inner + '</a>' : inner;
      }
      if (tag === 'ul' || tag === 'ol') {
        return blockMode ? '<' + tag + '>' + cleanChildren(element) + '</' + tag + '>' : cleanChildren(element);
      }
      if (tag === 'li') return blockMode ? '<li>' + inner.trim() + '</li>' : inner + '<br>';
      if (blockMode && /^h[1-6]$/.test(tag)) {
        var level = Math.min(4, Math.max(2, Number(tag.slice(1))));
        return '<h' + level + '>' + inner.trim() + '</h' + level + '>';
      }
      var styled = wrapInlineStyle(element, inner);
      if (blockMode && blockTags.has(tag)) return '<p>' + styled.trim() + '</p>';
      return styled;
    }
    return cleanChildren(doc.body).replace(/(<br>\s*){3,}/g, '<br><br>').trim();
  }

  function sanitizedClipboardHtml(event, blockMode) {
    var html = event?.clipboardData?.getData('text/html') || '';
    if (html) {
      var sanitized = sanitizeClipboardHtml(html, blockMode);
      if (sanitized) return sanitized;
    }
    var text = normalizePastedPlainText(event?.clipboardData?.getData('text/plain') || '');
    return blockMode ? markdownToEditorHtml(text, true) : renderEditorInlineMarkdown(text.replace(/\n+/g, ' '));
  }

  function appendEmptyEditorParagraph(control) {
    var paragraph = document.createElement('p');
    paragraph.dataset.placeholder = control.dataset.placeholder || '';
    control.append(paragraph);
  }

  function nodeToMarkdown(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return String(node.textContent || '').replace(/\u00a0/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    var element = node;
    var tag = element.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    var inner = Array.from(element.childNodes).map(nodeToMarkdown).join('');
    if (tag === 'a') {
      var href = element.getAttribute('href') || '';
      return href ? '[' + inner + '](' + href + ')' : inner;
    }
    if (tag === 'strong' || tag === 'b') return '**' + inner + '**';
    if (tag === 'em' || tag === 'i') return '*' + inner + '*';
    if (tag === 'u') return '<u>' + inner + '</u>';
    if (tag === 'h2') return '## ' + inner.trim();
    if (tag === 'h3') return '### ' + inner.trim();
    if (tag === 'h4') return '#### ' + inner.trim();
    if (tag === 'ul') {
      return Array.from(element.children).filter(function(child) {
        return child.tagName?.toLowerCase() === 'li';
      }).map(function(child) {
        return '- ' + nodeToMarkdown(child).trim().replace(/\n+/g, ' ');
      }).join('\n');
    }
    if (tag === 'ol') {
      return Array.from(element.children).filter(function(child) {
        return child.tagName?.toLowerCase() === 'li';
      }).map(function(child, index) {
        return String(index + 1) + '. ' + nodeToMarkdown(child).trim().replace(/\n+/g, ' ');
      }).join('\n');
    }
    if (tag === 'li') return inner.trim();
    return inner;
  }

  function editorHtmlToMarkdown(control) {
    var blocks = [];
    Array.from(control.childNodes).forEach(function(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var text = (node.textContent || '').trim();
        if (text) blocks.push(text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      var element = node;
      var tag = element.tagName.toLowerCase();
      var markdown = nodeToMarkdown(element).trim();
      if (!markdown && tag !== 'br') return;
      blocks.push(markdown);
    });
    if (!blocks.length) return editableText(control);
    return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function editableText(control) {
    return String(control?.innerText || control?.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function setEditableText(control, value, blockMode) {
    control.replaceChildren();
    var text = String(value || '');
    if (control.tagName === 'P' || control.tagName === 'CITE' || control.tagName === 'FIGCAPTION') {
      control.innerHTML = markdownToEditorHtml(text, false);
      return;
    }
    if (!text) {
      if (blockMode) appendEmptyEditorParagraph(control);
      return;
    }
    control.innerHTML = markdownToEditorHtml(text, blockMode);
  }

  function createEditable(tagName, block, index, field, labelText, className, options) {
    var control = document.createElement(tagName);
    control.className = className || 'admin-content-block__editable';
    control.contentEditable = 'true';
    control.spellcheck = true;
    control.dataset.contentIndex = String(index);
    control.dataset.contentField = field;
    control.dataset.placeholder = options?.placeholder || (field === 'body'
      ? t('content_empty_block', 'Start writing, or type /quote, /image, or /divider...')
      : labelText);
    control.setAttribute('aria-label', labelText);
    control.setAttribute('role', 'textbox');
    control.setAttribute('aria-multiline', options?.blockMode ? 'true' : 'false');
    control.setAttribute('tabindex', '0');
    setEditableText(control, block[field] || '', options?.blockMode);
    return control;
  }

  function createContentInput(tagName, block, index, field, labelText, options) {
    var wrap = document.createElement('label');
    wrap.className = 'admin-content-block__field';
    var label = document.createElement('span');
    label.textContent = labelText;
    var control = document.createElement(tagName);
    control.dataset.contentIndex = String(index);
    control.dataset.contentField = field;
    if (tagName === 'select') {
      (options?.options || []).forEach(function(optionConfig) {
        var option = document.createElement('option');
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        control.append(option);
      });
    }
    control.value = field === 'images' ? galleryImagesToText(block.images) : String(block[field] || '');
    if (tagName === 'textarea') control.rows = options?.rows || 3;
    if (options?.placeholder) control.placeholder = options.placeholder;
    wrap.append(label, control);
    return wrap;
  }

  function createGalleryImageInput(tagName, block, index, imageIndex, field, labelText, options) {
    var wrap = document.createElement('label');
    wrap.className = 'admin-content-block__field';
    var label = document.createElement('span');
    label.textContent = labelText;
    var control = document.createElement(tagName);
    control.dataset.contentIndex = String(index);
    control.dataset.contentImageIndex = String(imageIndex);
    control.dataset.contentField = field;
    control.value = String(block.images?.[imageIndex]?.[field] || '');
    if (tagName === 'textarea') control.rows = options?.rows || 3;
    if (options?.placeholder) control.placeholder = options.placeholder;
    wrap.append(label, control);
    return wrap;
  }

  function createGalleryImageCaptionInput(block, index, imageIndex) {
    var wrap = document.createElement('div');
    wrap.className = 'admin-content-block__field';
    var label = document.createElement('span');
    label.textContent = t('content_field_hover_caption', 'Hover caption');
    var control = createInlineRichTextInput({
      label: t('content_field_hover_caption', 'Hover caption'),
      toolbarLabel: t('content_field_hover_caption_formatting', 'Caption text styling'),
      rawValue: block.images?.[imageIndex]?.caption || '',
      value: block.images?.[imageIndex]?.caption || ''
    });
    control.classList.add('admin-content-block__rich-inline');
    control.dataset.contentIndex = String(index);
    control.dataset.contentImageIndex = String(imageIndex);
    control.dataset.contentField = 'caption';
    wrap.append(label, control);
    return wrap;
  }

  function createIcon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('admin-content-block__icon');
    var paths = {
      alignLeft: ['M4 6h16', 'M4 10h11', 'M4 14h16', 'M4 18h11'],
      alignCenter: ['M4 6h16', 'M7 10h10', 'M4 14h16', 'M7 18h10'],
      alignRight: ['M4 6h16', 'M9 10h11', 'M4 14h16', 'M9 18h11'],
      alignJustify: ['M4 6h16', 'M4 10h16', 'M4 14h16', 'M4 18h16'],
      info: ['M12 16v-4', 'M12 8h.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
      link: ['M10 13a5 5 0 0 0 7.1 0l1.4-1.4a5 5 0 0 0-7.1-7.1L10.5 5.4', 'M14 11a5 5 0 0 0-7.1 0L5.5 12.4a5 5 0 0 0 7.1 7.1l.9-.9'],
      list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
      listOrdered: ['M10 6h11', 'M10 12h11', 'M10 18h11', 'M4 6h1v4', 'M4 10h2', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'],
      arrowUp: ['M12 19V5', 'M5 12l7-7 7 7'],
      arrowDown: ['M12 5v14', 'M19 12l-7 7-7-7'],
      trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
      settings: [
        'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.16.09a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.18a2 2 0 0 1-1 1.73l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.16.09a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.16-.09a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.18a2 2 0 0 1 1-1.73l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.16-.09a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
        'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
      ]
    };
    (paths[name] || []).forEach(function(definition) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', definition);
      svg.append(path);
    });
    return svg;
  }

  function createToolbarGroup(label) {
    var group = document.createElement('div');
    group.className = 'admin-content-block__toolbar-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    return group;
  }

  function createContentChrome(block, index) {
    var chrome = document.createElement('div');
    chrome.className = 'admin-content-block__chrome';
    chrome.dataset.contentChrome = 'true';
    chrome.setAttribute('aria-hidden', 'true');
    chrome.addEventListener('mousedown', function(event) {
      if (event.target?.closest?.('button')) {
        event.preventDefault();
      }
    });
    var typeLabel = document.createElement('label');
    typeLabel.className = 'admin-content-block__type admin-content-block__toolbar-group admin-content-block__toolbar-group--type';
    var select = document.createElement('select');
    select.className = 'admin-content-block__select';
    select.dataset.contentIndex = String(index);
    select.dataset.contentAction = 'type';
    select.setAttribute('aria-label', t('content_block_type', 'Block type'));
    contentBlockTypes.forEach(function(type) {
      var option = document.createElement('option');
      option.value = type;
      option.textContent = contentBlockLabel(type);
      option.selected = block.type === type;
      select.append(option);
    });
    typeLabel.append(select);

    var headerRow = document.createElement('div');
    headerRow.className = 'admin-content-block__chrome-row admin-content-block__chrome-row--header';
    var formatRow = document.createElement('div');
    formatRow.className = 'admin-content-block__chrome-row admin-content-block__chrome-row--format';
    var actions = document.createElement('div');
    actions.className = 'admin-content-block__actions';
    if (block.type === 'text' || block.type === 'quote') {
      var formatGroup = createToolbarGroup(t('content_format_group', 'Text styling'));
      var formatButtons = [
        { action: 'format-bold', label: t('content_format_bold', 'Bold'), text: 'B' },
        { action: 'format-italic', label: t('content_format_italic', 'Italic'), text: 'I' },
        { action: 'format-underline', label: t('content_format_underline', 'Underline'), text: 'U' }
      ];
      if (block.type === 'text') {
        formatButtons.push(
          { action: 'format-link', label: t('content_format_link', 'Link'), icon: 'link' },
          { action: 'format-unordered-list', label: t('content_format_unordered_list', 'Unordered list'), icon: 'list' },
          { action: 'format-ordered-list', label: t('content_format_ordered_list', 'Numbered list'), icon: 'listOrdered' }
        );
      }
      formatButtons.forEach(function(config) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn--secondary btn--small admin-content-block__format-button admin-content-block__format-button--' + config.action;
        button.dataset.contentIndex = String(index);
        button.dataset.contentAction = config.action;
        button.setAttribute('aria-label', config.label);
        button.setAttribute('aria-pressed', 'false');
        if (config.icon) {
          button.append(createIcon(config.icon));
        } else {
          button.textContent = config.text;
        }
        formatGroup.append(button);
      });
      if (block.type === 'text') {
        var styleGroup = createToolbarGroup(t('content_format_label', 'Text format'));
        var formatSelect = document.createElement('select');
        formatSelect.className = 'admin-content-block__select admin-content-block__format-select';
        formatSelect.dataset.contentIndex = String(index);
        formatSelect.dataset.contentAction = 'format-block';
        formatSelect.setAttribute('aria-label', t('content_format_label', 'Text format'));
        var multipleOption = document.createElement('option');
        multipleOption.value = 'multiple';
        multipleOption.textContent = t('content_format_multiple', 'Multiple');
        multipleOption.disabled = true;
        formatSelect.append(multipleOption);
        [
          { value: 'p', label: t('content_format_paragraph', 'Paragraph') },
          { value: 'h2', label: t('content_format_heading_2', 'Heading 2') },
          { value: 'h3', label: t('content_format_heading_3', 'Heading 3') },
          { value: 'h4', label: t('content_format_heading_4', 'Heading 4') }
        ].forEach(function(config) {
          var option = document.createElement('option');
          option.value = config.value;
          option.textContent = config.label;
          formatSelect.append(option);
        });
        styleGroup.append(formatSelect);
      }
      actions.append(formatGroup);
      if (styleGroup) actions.append(styleGroup);
    }
    var alignGroup = createToolbarGroup(t('content_align_group', 'Alignment'));
    alignGroup.classList.add('admin-content-block__toolbar-group--alignment');
    contentAlignments.forEach(function(align) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--secondary btn--small' + (contentBlockAlignment(block.align) === align ? ' is-active' : '');
      button.dataset.contentIndex = String(index);
      button.dataset.contentAction = 'align';
      button.dataset.contentAlign = align;
      button.setAttribute('aria-label', t('content_align_' + align, align));
      button.setAttribute('aria-pressed', contentBlockAlignment(block.align) === align ? 'true' : 'false');
      button.append(createIcon(align === 'left' ? 'alignLeft' : align === 'center' ? 'alignCenter' : align === 'right' ? 'alignRight' : 'alignJustify'));
      alignGroup.append(button);
    });
    actions.append(alignGroup);
    var blockGroup = createToolbarGroup(t('content_block_actions_group', 'Block actions'));
    blockGroup.classList.add('admin-content-block__toolbar-group--block-actions');
    [
      { action: 'up', label: t('content_block_move_up', 'Move block up'), text: '↑', disabled: index === 0 },
      { action: 'down', label: t('content_block_move_down', 'Move block down'), text: '↓', disabled: index === contentBlocks.length - 1 },
      { action: 'delete', label: t('content_block_delete', 'Delete block'), icon: 'trash', disabled: contentBlocks.length === 1 }
    ].forEach(function(config) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--secondary btn--small';
      button.dataset.contentIndex = String(index);
      button.dataset.contentAction = config.action;
      button.setAttribute('aria-label', config.label);
      if (config.icon) {
        button.append(createIcon(config.icon));
      } else {
        button.textContent = config.text;
      }
      button.disabled = config.disabled;
      blockGroup.append(button);
    });
    headerRow.append(typeLabel, blockGroup);

    chrome.append(headerRow);
    if (actions.children.length) {
      formatRow.append(actions);
      chrome.append(formatRow);
    }
    if (block.type === 'text') {
      var linkPanel = document.createElement('div');
      linkPanel.className = 'admin-content-block__link-panel';
      linkPanel.dataset.contentLinkPanel = String(index);
      linkPanel.setAttribute('role', 'group');
      linkPanel.setAttribute('aria-label', t('content_link_label', 'Link URL'));
      linkPanel.hidden = true;
      var linkLabel = document.createElement('label');
      var linkLabelText = document.createElement('span');
      linkLabelText.textContent = t('content_link_label', 'Link URL');
      var linkInput = document.createElement('input');
      linkInput.type = 'text';
      linkInput.inputMode = 'url';
      linkInput.dataset.contentIndex = String(index);
      linkInput.dataset.contentAction = 'link-url';
      linkInput.setAttribute('aria-label', t('content_link_label', 'Link URL'));
      linkLabel.append(linkLabelText, linkInput);
      var applyButton = document.createElement('button');
      applyButton.type = 'button';
      applyButton.className = 'btn btn--secondary btn--small';
      applyButton.dataset.contentIndex = String(index);
      applyButton.dataset.contentAction = 'link-apply';
      applyButton.textContent = t('content_link_apply', 'Apply');
      var removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn--secondary btn--small';
      removeButton.dataset.contentIndex = String(index);
      removeButton.dataset.contentAction = 'link-remove';
      removeButton.textContent = t('content_link_remove', 'Remove link');
      linkPanel.append(linkLabel, applyButton, removeButton);
      chrome.append(linkPanel);
    }
    return chrome;
  }

  function createMediaPlaceholder() {
    var placeholder = document.createElement('div');
    placeholder.className = 'admin-content-block__media-placeholder';
    placeholder.textContent = t('content_empty_media', 'Add media details below to preview this block.');
    return placeholder;
  }

  function renderMediaSettings(card, block, index) {
    if (block.type === 'divider' || block.type === 'text' || block.type === 'quote' || block.type === 'gallery') return;
    var editorId = contentBlocksRoot?.dataset?.contentEditorId || 'campaign';
    var panelId = 'admin-content-media-settings-' + editorId + '-' + index;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--secondary btn--small admin-content-block__settings-button';
    button.dataset.contentIndex = String(index);
    button.dataset.contentAction = 'toggle-media-settings';
    button.setAttribute('aria-controls', panelId);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', t('content_media_settings', 'Media settings'));
    button.append(createIcon('settings'));
    var panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'admin-content-block__settings-panel';
    panel.dataset.contentMediaSettings = String(index);
    panel.setAttribute('role', 'group');
    panel.hidden = true;
    var heading = document.createElement('h3');
    heading.id = panelId + '-title';
    heading.textContent = t('content_media_settings', 'Media settings');
    panel.setAttribute('aria-labelledby', heading.id);
    panel.append(heading);
    var fields = document.createElement('div');
    fields.className = 'admin-content-block__fields';
    if (block.type === 'image') {
      fields.append(
        createContentInput('input', block, index, 'src', t('content_field_src', 'Source URL or path')),
        createContentInput('input', block, index, 'alt', t('content_field_alt', 'Alt text'))
      );
    } else if (block.type === 'video') {
      var providerInput = createContentInput('select', block, index, 'provider', t('content_field_provider', 'Provider'), {
        options: [
          { value: 'youtube', label: t('content_provider_youtube', 'YouTube') },
          { value: 'vimeo', label: t('content_provider_vimeo', 'Vimeo') },
          { value: 'local', label: t('content_provider_local', 'Uploaded video') }
        ]
      });
      if (contentVideoProvider(block.provider) === 'local') {
        fields.append(
          providerInput,
          createContentInput('input', block, index, 'src', t('content_field_video_src', 'Video file path')),
          createContentInput('input', block, index, 'poster', t('content_field_poster', 'Poster image path'))
        );
      } else {
        fields.append(
          providerInput,
          createContentInput('input', block, index, 'video_id', t('content_field_video_id', 'Video ID'))
        );
      }
    } else if (block.type === 'audio') {
      fields.append(
        createContentInput('input', block, index, 'src', t('content_field_src', 'Source URL or path')),
        createContentInput('input', block, index, 'title', t('content_field_title', 'Title'))
      );
    } else if (block.type === 'embed') {
      fields.append(
        createContentInput('input', block, index, 'provider', t('content_field_provider', 'Provider')),
        createContentInput('input', block, index, 'src', t('content_field_src', 'Source URL or path')),
        createContentInput('input', block, index, 'title', t('content_field_title', 'Title'))
      );
    }
    panel.append(fields);
    card.append(button, panel);
  }

  function renderGalleryImageSettings(galleryItem, block, index, imageIndex) {
    if (!(galleryItem instanceof HTMLElement)) return;
    var editorId = contentBlocksRoot?.dataset?.contentEditorId || 'campaign';
    var panelId = 'admin-content-gallery-image-settings-' + editorId + '-' + index + '-' + imageIndex;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--secondary btn--small admin-content-block__settings-button admin-content-block__settings-button--gallery-image';
    button.dataset.contentIndex = String(index);
    button.dataset.contentImageIndex = String(imageIndex);
    button.dataset.contentAction = 'toggle-gallery-image-settings';
    button.setAttribute('aria-controls', panelId);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', t('content_gallery_image_settings', 'Gallery image caption settings'));
    button.append(createIcon('settings'));
    var panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'admin-content-block__settings-panel admin-content-block__settings-panel--gallery-image';
    panel.dataset.contentGalleryImageSettings = String(index) + '-' + String(imageIndex);
    panel.setAttribute('role', 'group');
    panel.hidden = true;
    var heading = document.createElement('h3');
    heading.id = panelId + '-title';
    heading.textContent = t('content_gallery_image_settings', 'Gallery image caption settings');
    panel.setAttribute('aria-labelledby', heading.id);
    var fields = document.createElement('div');
    fields.className = 'admin-content-block__fields';
    fields.append(createGalleryImageCaptionInput(block, index, imageIndex));
    panel.append(heading, fields);
    galleryItem.append(button, panel);
  }

  function appendEditableCaption(card, block, index) {
    if (block.type === 'divider' || block.type === 'text' || block.type === 'quote') return;
    var caption = createEditable('figcaption', block, index, 'caption', t('content_field_caption', 'Caption'), 'content-block__caption admin-content-block__editable admin-content-block__editable--caption', {
      placeholder: t('content_field_caption_empty', 'Optional caption - hidden unless filled')
    });
    card.append(caption);
  }

  function blockElementName(type) {
    return type === 'quote' ? 'blockquote' : type === 'text' || type === 'divider' ? 'div' : 'figure';
  }

  function renderContentBlockBody(card, block, index) {
    if (block.type === 'text') {
      card.append(createEditable('div', block, index, 'body', t('content_field_body', 'Body'), 'admin-content-block__editable admin-content-block__editable--prose', { blockMode: true }));
    } else if (block.type === 'quote') {
      card.append(createEditable('p', block, index, 'text', t('content_field_text', 'Quote text'), 'admin-content-block__editable admin-content-block__editable--quote'));
      card.append(createEditable('cite', block, index, 'author', t('content_field_author', 'Author'), 'admin-content-block__editable admin-content-block__editable--cite'));
    } else if (block.type === 'image') {
      if (block.src) {
        var image = document.createElement('img');
        image.src = block.src;
        image.alt = block.alt || '';
        image.loading = 'lazy';
        card.append(image);
      } else {
        card.append(createMediaPlaceholder());
      }
      appendEditableCaption(card, block, index);
      renderMediaSettings(card, block, index);
    } else if (block.type === 'gallery') {
      var container = document.createElement('div');
      container.className = 'gallery__container';
      if (block.images?.length) {
        block.images.forEach(function(item, imageIndex) {
          var galleryItem = document.createElement('div');
          galleryItem.className = 'gallery__item';
          galleryItem.dataset.contentImageIndex = String(imageIndex);
          var image = document.createElement('img');
          image.src = item.src || '';
          image.alt = item.alt || '';
          image.loading = 'lazy';
          galleryItem.append(image);
          renderGalleryImageCaption(galleryItem, item.caption);
          renderGalleryImageSettings(galleryItem, block, index, imageIndex);
          container.append(galleryItem);
        });
      } else {
        container.append(createMediaPlaceholder());
      }
      card.append(container);
      appendEditableCaption(card, block, index);
      renderMediaSettings(card, block, index);
    } else if (block.type === 'video') {
      var provider = contentVideoProvider(block.provider);
      if (provider === 'local' && block.src) {
        var localVideo = document.createElement('div');
        localVideo.className = 'video-embed video-embed--local';
        var videoElement = document.createElement('video');
        videoElement.controls = true;
        videoElement.preload = 'none';
        videoElement.playsInline = true;
        if (block.poster) videoElement.poster = block.poster;
        else videoElement.setAttribute('data-first-frame-poster', 'true');
        var videoSource = document.createElement('source');
        videoSource.src = block.src;
        var sourceType = contentVideoSourceType(block.src);
        if (sourceType) videoSource.type = sourceType;
        videoElement.append(videoSource);
        localVideo.append(videoElement);
        card.append(localVideo);
        if (window.PoolVideoPosters?.init) window.PoolVideoPosters.init(localVideo);
      } else if (block.video_id) {
        var video = document.createElement('div');
        video.className = 'video-embed video-embed--' + (provider === 'vimeo' ? 'vimeo' : 'youtube');
        var iframe = document.createElement('iframe');
        iframe.src = provider === 'vimeo'
          ? 'https://player.vimeo.com/video/' + encodeURIComponent(block.video_id) + '?dnt=1'
          : 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(block.video_id);
        iframe.loading = 'lazy';
        iframe.title = block.caption || t('content_video_title', 'Video');
        video.append(iframe);
        card.append(video);
      } else {
        card.append(createMediaPlaceholder());
      }
      appendEditableCaption(card, block, index);
      renderMediaSettings(card, block, index);
    } else if (block.type === 'audio') {
      var audioWrap = document.createElement('div');
      audioWrap.className = 'audio-player';
      if (block.title) {
        var title = document.createElement('span');
        title.className = 'audio-player__title';
        title.textContent = block.title;
        audioWrap.append(title);
      }
      if (block.src) {
        var audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'metadata';
        var source = document.createElement('source');
        source.src = block.src;
        source.type = 'audio/mpeg';
        audio.append(source);
        audioWrap.append(audio);
      } else {
        audioWrap.append(createMediaPlaceholder());
      }
      card.append(audioWrap);
      appendEditableCaption(card, block, index);
      renderMediaSettings(card, block, index);
    } else if (block.type === 'embed') {
      if (block.src) {
        var embedWrap = document.createElement('div');
        embedWrap.className = 'embed-container ' + (block.provider === 'spotify' ? 'embed-container--spotify' : 'embed-container--video');
        var embed = document.createElement('iframe');
        embed.src = block.src;
        embed.loading = 'lazy';
        embed.title = block.title || block.caption || t('content_embed_title', 'Embedded content');
        embedWrap.append(embed);
        card.append(embedWrap);
      } else {
        card.append(createMediaPlaceholder());
      }
      appendEditableCaption(card, block, index);
      renderMediaSettings(card, block, index);
    }
  }

  function createContentInsertControl(index) {
    var wrap = document.createElement('div');
    wrap.className = 'admin-content-insert';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-content-insert__button';
    button.dataset.contentAction = 'insert-block';
    button.dataset.contentIndex = String(index);
    button.setAttribute('aria-label', t('content_block_insert', 'Add content block'));
    button.textContent = '+';
    wrap.append(button);
    return wrap;
  }

  function renderContentBlocks(focusIndex) {
    if (!contentBlocksRoot) return;
    contentBlocksRoot.replaceChildren();
    if (!contentBlocks.length) contentBlocks = [defaultContentBlock('text')];
    contentBlocksRoot.append(createContentInsertControl(0));
    contentBlocks.forEach(function(block, index) {
      if (index > 0) contentBlocksRoot.append(createContentInsertControl(index));
      var card = document.createElement(blockElementName(block.type));
      card.className = 'admin-content-block content-block content-block--' + block.type + ' content-block--align-' + contentBlockAlignment(block.align) + (block.type === 'gallery' ? ' gallery--' + contentGalleryLayout(block.layout) + ' gallery--caption-' + contentGalleryCaptionStyle(block.caption_style) : '');
      card.dataset.contentIndex = String(index);
      card.append(createContentChrome(block, index));
      renderContentBlockBody(card, block, index);
      contentBlocksRoot.append(card);
    });
    contentBlocksRoot.append(createContentInsertControl(contentBlocks.length));
    syncContentJsonFromBlocks();
    syncContentChromeAccessibility(contentBlocksRoot);
    if (typeof focusIndex === 'number') {
      contentBlocksRoot.querySelector('[data-content-index="' + focusIndex + '"][data-content-field]')?.focus();
    }
  }

  function updateContentBlockField(control) {
    var index = Number(control.dataset.contentIndex);
    var field = control.dataset.contentField || '';
    var block = contentBlocks[index];
    if (!block || !field) return;
    if (control.dataset.contentImageIndex !== undefined && block.type === 'gallery') {
      var imageIndex = Number(control.dataset.contentImageIndex);
      if (!Number.isInteger(imageIndex) || !block.images?.[imageIndex]) return;
      block.images[imageIndex][field] = control.value;
      if (field === 'caption') {
        var galleryItem = contentBlocksRoot?.querySelector?.('[data-content-index="' + index + '"] .gallery__item[data-content-image-index="' + imageIndex + '"]');
        renderGalleryImageCaption(galleryItem, control.value);
      }
    } else if (field === 'images') {
      block.images = galleryTextToImages(control.value);
    } else if (field === 'provider') {
      block.provider = contentVideoProvider(control.value);
      syncContentJsonFromBlocks();
      renderContentBlocks(index);
      return;
    } else if (control.isContentEditable) {
      block[field] = field === 'body' ? editorHtmlToMarkdown(control) : nodeToMarkdown(control).trim();
    } else {
      block[field] = control.value;
    }
    syncContentJsonFromBlocks();
  }

  function activateContentBlockForNode(node) {
    if (!contentBlocksRoot) return;
    var element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    var block = element?.closest?.('.admin-content-block');
    contentBlocksRoot.querySelectorAll('.admin-content-block.is-active').forEach(function(item) {
      if (item !== block) item.classList.remove('is-active');
    });
    if (block instanceof HTMLElement && contentBlocksRoot.contains(block)) {
      block.classList.add('is-active');
    }
    syncContentChromeAccessibility(contentBlocksRoot);
  }

  function deactivateContentBlocks(root) {
    var scope = root instanceof HTMLElement ? root : contentBlocksRoot;
    scope?.querySelectorAll?.('.admin-content-block.is-active').forEach(function(item) {
      item.classList.remove('is-active');
    });
    syncContentChromeAccessibility(scope);
  }

  function setContentChromeInteractive(chrome, active) {
    if (!(chrome instanceof HTMLElement)) return;
    chrome.setAttribute('aria-hidden', active ? 'false' : 'true');
    chrome.querySelectorAll('button, input, select, textarea').forEach(function(control) {
      if (!(control instanceof HTMLElement)) return;
      if (active) {
        control.removeAttribute('tabindex');
      } else {
        control.tabIndex = -1;
      }
    });
  }

  function syncContentChromeAccessibility(root) {
    var scope = root instanceof HTMLElement ? root : contentBlocksRoot;
    if (!(scope instanceof HTMLElement)) return;
    scope.querySelectorAll('.admin-content-block').forEach(function(block) {
      setContentChromeInteractive(block.querySelector('[data-content-chrome]'), block.classList.contains('is-active'));
    });
  }

  function updateActiveEditable() {
    var active = document.activeElement;
    if (active instanceof HTMLElement && active.isContentEditable && contentBlocksRoot?.contains(active)) {
      activeContentEditable = active;
      if (Date.now() >= deferContentTouchActivationUntil) {
        activateContentBlockForNode(active);
      }
    }
    updateContentLinkInspector();
    updateContentFormatState();
  }

  function editableForNode(node) {
    var element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    var editable = element?.closest?.('[contenteditable="true"][data-content-field]');
    return editable instanceof HTMLElement && contentBlocksRoot?.contains(editable) ? editable : null;
  }

  function linkForNode(node) {
    var element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    var link = element?.closest?.('a');
    return link instanceof HTMLAnchorElement && contentBlocksRoot?.contains(link) ? link : null;
  }

  function selectedContentLink() {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    var anchorLink = linkForNode(selection.anchorNode);
    if (anchorLink) return anchorLink;
    var focusLink = linkForNode(selection.focusNode);
    if (focusLink) return focusLink;
    return linkForNode(selection.getRangeAt(0).commonAncestorContainer);
  }

  function selectedContentEditable() {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    return editableForNode(selection.anchorNode)
      || editableForNode(selection.focusNode)
      || editableForNode(selection.getRangeAt(0).commonAncestorContainer);
  }

  function contentTextFormatForNode(node, editable) {
    var element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    var block = element?.closest?.('p,h2,h3,h4');
    if (block instanceof HTMLElement && editable?.contains(block)) {
      var tag = block.tagName.toLowerCase();
      return contentTextFormats.indexOf(tag) >= 0 ? tag : 'p';
    }
    return 'p';
  }

  function selectedContentTextFormat(editable) {
    var selection = window.getSelection();
    if (!(editable instanceof HTMLElement) || !selection || selection.rangeCount === 0) return 'p';
    var range = selection.getRangeAt(0);
    if (selection.isCollapsed) return contentTextFormatForNode(selection.focusNode, editable);
    var formats = [];
    editable.querySelectorAll('p,h2,h3,h4').forEach(function(block) {
      try {
        if (range.intersectsNode(block)) formats.push(block.tagName.toLowerCase());
      } catch (error) {
        // Ignore detached or browser-normalized nodes while the editor is mutating.
      }
    });
    if (!formats.length) formats.push(contentTextFormatForNode(range.commonAncestorContainer, editable));
    var uniqueFormats = Array.from(new Set(formats.filter(function(format) {
      return contentTextFormats.indexOf(format) >= 0;
    })));
    if (uniqueFormats.length > 1) return 'multiple';
    return uniqueFormats[0] || 'p';
  }

  function clearContentLinkInspector() {
    activeContentLink = null;
    contentBlocksRoot?.querySelectorAll('[data-content-link-panel]').forEach(function(panel) {
      panel.hidden = true;
    });
  }

  function setActiveContentLink(link) {
    var editable = editableForNode(link);
    if (!(link instanceof HTMLAnchorElement) || !editable) {
      clearContentLinkInspector();
      return;
    }
    activeContentLink = link;
    activeContentEditable = editable;
    updateContentLinkInspector();
  }

  function updateContentLinkInspector() {
    if (!contentBlocksRoot) return;
    var selectionEditable = selectedContentEditable();
    var link = selectionEditable ? selectedContentLink() : activeContentLink;
    var editable = editableForNode(link);
    contentBlocksRoot.querySelectorAll('[data-content-link-panel]').forEach(function(panel) {
      panel.hidden = true;
    });
    if (!(link instanceof HTMLAnchorElement) || !link.isConnected || !contentBlocksRoot.contains(link) || !editable) {
      activeContentLink = null;
      return;
    }
    activeContentLink = link;
    activeContentEditable = editable;
    var panel = contentBlocksRoot.querySelector('[data-content-link-panel="' + editable.dataset.contentIndex + '"]');
    var input = panel?.querySelector('[data-content-action="link-url"]');
    if (!(panel instanceof HTMLElement) || !(input instanceof HTMLInputElement)) return;
    input.value = link.getAttribute('href') || '';
    panel.hidden = false;
  }

  function refreshContentSelectionState(event) {
    if (editableForNode(event?.target)) {
      updateContentLinkInspector();
      updateContentFormatState();
    }
  }

  function updateContentFormatState() {
    if (!contentBlocksRoot) return;
    var editable = selectedContentEditable() || activeContentEditable;
    var activeIndex = editable?.dataset?.contentIndex || '';
    var activeLink = selectedContentLink() || activeContentLink;
    var commands = {
      'format-bold': 'bold',
      'format-italic': 'italic',
      'format-underline': 'underline',
      'format-unordered-list': 'insertUnorderedList',
      'format-ordered-list': 'insertOrderedList'
    };
    Object.keys(commands).forEach(function(action) {
      contentBlocksRoot.querySelectorAll('[data-content-action="' + action + '"]').forEach(function(button) {
        var isActive = false;
        if (button instanceof HTMLButtonElement && button.dataset.contentIndex === activeIndex && editable && (editable.dataset.contentField === 'body' || !action.includes('list'))) {
          try {
            isActive = document.queryCommandState(commands[action]);
          } catch (error) {
            isActive = false;
          }
        }
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    });
    contentBlocksRoot.querySelectorAll('[data-content-action="format-link"]').forEach(function(button) {
      var isActive = button instanceof HTMLButtonElement && button.dataset.contentIndex === activeIndex && !!activeLink;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    contentBlocksRoot.querySelectorAll('[data-content-action="format-block"]').forEach(function(select) {
      if (!(select instanceof HTMLSelectElement)) return;
      if (select.dataset.contentIndex === activeIndex && editable?.dataset?.contentField === 'body') {
        select.value = selectedContentTextFormat(editable);
      } else if (select.value === 'multiple') {
        select.value = 'p';
      }
    });
  }

  function applyContentFormat(action, value) {
    updateActiveEditable();
    var control = activeContentEditable;
    if (!(control instanceof HTMLElement) || !control.isContentEditable) return;
    control.focus();
    document.execCommand(action, false, value || null);
    updateContentBlockField(control);
    writeContentDraft();
    updateContentFormatState();
  }

  function applyContentLink() {
    updateActiveEditable();
    var control = activeContentEditable;
    if (!(control instanceof HTMLElement) || !control.isContentEditable) return;
    control.focus();
    var existingLink = selectedContentLink();
    var url = window.prompt(t('content_link_prompt', 'Paste a URL for this link'), existingLink?.getAttribute('href') || '');
    if (url === null) return;
    var href = String(url || '').trim();
    if (!isSafeEditorHref(href)) {
      setText(contentStatus, t('content_link_invalid', 'Links must start with http://, https://, mailto:, /, or #.'));
      return;
    }
    var selection = window.getSelection();
    if (existingLink) {
      existingLink.setAttribute('href', href);
      setActiveContentLink(existingLink);
    } else if (!selection || selection.isCollapsed) {
      document.execCommand('insertHTML', false, '<a href="' + escapeEditorAttribute(href) + '">' + escapeEditorHtml(href) + '</a>');
    } else {
      document.execCommand('createLink', false, href);
    }
    updateContentBlockField(control);
    writeContentDraft();
    updateContentLinkInspector();
  }

  function applyContentLinkPanel(input) {
    var link = activeContentLink;
    if (!(link instanceof HTMLAnchorElement) || !link.isConnected) link = selectedContentLink();
    var editable = editableForNode(link);
    if (!(input instanceof HTMLInputElement) || !(link instanceof HTMLAnchorElement) || !editable) return;
    var href = input.value.trim();
    if (!isSafeEditorHref(href)) {
      setText(contentStatus, t('content_link_invalid', 'Links must start with http://, https://, mailto:, /, or #.'));
      input.value = link.getAttribute('href') || '';
      return;
    }
    link.setAttribute('href', href);
    setActiveContentLink(link);
    updateContentBlockField(editable);
    writeContentDraft();
  }

  function removeActiveContentLink() {
    var link = activeContentLink;
    if (!(link instanceof HTMLAnchorElement) || !link.isConnected) link = selectedContentLink();
    var editable = editableForNode(link);
    if (!(link instanceof HTMLAnchorElement) || !editable) return;
    var fragment = document.createDocumentFragment();
    while (link.firstChild) fragment.append(link.firstChild);
    link.replaceWith(fragment);
    activeContentLink = null;
    updateContentBlockField(editable);
    writeContentDraft();
    updateContentLinkInspector();
  }

  function closeContentSettingsPanels(root) {
    var scope = root instanceof HTMLElement ? root : contentBlocksRoot;
    scope?.querySelectorAll?.('[data-content-media-settings], [data-content-gallery-image-settings]').forEach(function(panel) {
      panel.hidden = true;
    });
    scope?.querySelectorAll?.('[data-content-action="toggle-media-settings"], [data-content-action="toggle-gallery-image-settings"]').forEach(function(button) {
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleMediaSettings(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    var panelId = button.getAttribute('aria-controls');
    var panel = panelId ? document.getElementById(panelId) : null;
    if (!(panel instanceof HTMLElement)) return;
    var opening = panel.hidden;
    closeContentSettingsPanels(contentBlocksRoot);
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      panel.querySelector('input, textarea, select, button')?.focus();
    } else {
      button.blur();
      deactivateContentBlocks(contentBlocksRoot);
    }
  }

  function applyContentBlockFormat(value) {
    var tag = contentTextFormats.indexOf(value) >= 0 ? value : 'p';
    applyContentFormat('formatBlock', tag);
  }

  function applyContentListFormat(ordered) {
    applyContentFormat(ordered ? 'insertOrderedList' : 'insertUnorderedList');
  }

  function applyContentBlockAlignment(index, align) {
    if (!contentBlocks[index]) return;
    pushContentHistory();
    contentBlocks[index].align = contentBlockAlignment(align);
    lastContentMutation = 'block';
    renderContentBlocks(index);
    writeContentDraft();
  }

  function changeContentBlockType(index, type) {
    var previous = contentBlocks[index] || defaultContentBlock('text');
    var next = defaultContentBlock(type);
    next.align = contentBlockAlignment(previous.align);
    if (previous.type === 'text' && next.type === 'quote') next.text = previous.body || '';
    if (previous.type === 'quote' && next.type === 'text') next.body = previous.text || '';
    pushContentHistory();
    contentBlocks[index] = next;
    lastContentMutation = 'block';
    renderContentBlocks(index);
    writeContentDraft();
  }

  function contentEditableCaretOffset(control) {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return editableText(control).length;
    var range = selection.getRangeAt(0);
    if (!control.contains(range.endContainer)) return editableText(control).length;
    var preSelection = range.cloneRange();
    preSelection.selectNodeContents(control);
    preSelection.setEnd(range.endContainer, range.endOffset);
    return preSelection.toString().length;
  }

  function insertContentBlockFromSlash(control) {
    var index = Number(control.dataset.contentIndex);
    var field = control.dataset.contentField || '';
    if (field !== 'body' || !contentBlocks[index]) return false;
    var value = editorHtmlToMarkdown(control);
    var commandNames = contentBlockTypes.join('|');
    var commandMatch = value.match(new RegExp('(?:^|\\n|\\s)/(?:' + commandNames + ')(?=\\s*$|\\n)', 'i'));
    if (!commandMatch) return false;

    var commandText = commandMatch[0].match(/\/([a-z]+)/i)?.[1] || 'text';
    var lineStart = commandMatch.index + commandMatch[0].indexOf('/');
    var lineEnd = commandMatch.index + commandMatch[0].length;
    var type = contentBlockCommand(commandText);
    var beforeText = value.slice(0, lineStart).replace(/\s+$/, '');
    var afterText = value.slice(lineEnd).replace(/^\s+/, '');
    var insertAt = index;
    var originalAlign = contentBlockAlignment(contentBlocks[index].align);
    var historySnapshot = cloneContentBlocks(contentBlocks);
    var restoredBody = [beforeText, afterText].filter(Boolean).join('\n\n');
    historySnapshot[index] = { type: 'text', body: restoredBody, align: originalAlign };
    pushContentSnapshot(historySnapshot);
    if (beforeText) {
      contentBlocks[index].body = beforeText;
      insertAt = index + 1;
    } else {
      contentBlocks.splice(index, 1);
    }
    contentBlocks.splice(insertAt, 0, defaultContentBlock(type));
    if (afterText) {
      contentBlocks.splice(insertAt + 1, 0, { type: 'text', body: afterText, align: originalAlign });
    }
    lastContentMutation = 'block';
    renderContentBlocks(insertAt);
    writeContentDraft();
    return true;
  }

  function syncContentBlocksFromJson() {
    try {
      contentBlocks = parseContentBlocks(contentLongContent?.value || '[]');
      renderContentBlocks();
      writeContentDraft();
      setText(contentStatus, '');
    } catch (_error) {
      setText(contentStatus, t('content_json_invalid', 'Content blocks must be valid JSON.'));
    }
  }

  function contentDraftStorageKey() {
    return contentStoragePrefix + (lang || 'en') + ':' + selectedContentCampaignSlug();
  }

  function currentContentSnapshot() {
    if (activeDiaryContentField instanceof HTMLTextAreaElement) return contentSavedSnapshot;
    return JSON.stringify({
      campaignSlug: selectedContentCampaignSlug(),
      title: contentTitleField?.value || '',
      shortBlurb: contentShortBlurb?.value || '',
      longContent: contentBlocksSnapshot(contentBlocks)
    });
  }

  function setContentDirty(dirty) {
    contentHasUnsavedChanges = Boolean(dirty);
    updateDirtyIndicators();
  }

  function updateContentDirty() {
    if (activeDiaryContentField instanceof HTMLTextAreaElement) return;
    setContentDirty(currentContentSnapshot() !== contentSavedSnapshot);
  }

  function resetContentDirtyBaseline() {
    contentSavedSnapshot = currentContentSnapshot();
    setContentDirty(false);
  }

  function syncActiveDiaryContentField() {
    if (!(activeDiaryContentField instanceof HTMLTextAreaElement)) return false;
    syncContentJsonFromBlocks();
    activeDiaryContentField.value = JSON.stringify(contentBlocks, null, 2);
    activeDiaryContentField.dispatchEvent(new Event('change', { bubbles: true }));
    markDiaryEditorDirty(contentBlocksRoot, contentBlocksSnapshot(contentBlocks) !== (activeDiaryContentField.dataset.diaryDraftOriginal || contentBlocksSnapshot([])));
    updateAdminDirtyIndicatorsSoon();
    return true;
  }

  function updateContentEditorMode() {
    var editingDiary = activeDiaryContentField instanceof HTMLTextAreaElement;
    contentEditor?.classList.toggle('is-editing-diary', editingDiary);
    if (contentLoad instanceof HTMLButtonElement) contentLoad.disabled = editingDiary;
    updateDirtyIndicators();
  }

  function scheduleContentPreview(options) {
    if (!(contentPreviewMobile instanceof HTMLIFrameElement)) return;
    if (activeDiaryContentField instanceof HTMLTextAreaElement) return;
    if (!selectedContentCampaignSlug()) return;
    if (contentPreviewTimer) window.clearTimeout(contentPreviewTimer);
    var delay = options?.immediate ? 0 : 650;
    contentPreviewTimer = window.setTimeout(function() {
      contentPreviewTimer = 0;
      previewContentDraft({ silent: true, auto: true });
    }, delay);
  }

  function writeContentDraft(options) {
    if (syncActiveDiaryContentField()) return;
    var slug = selectedContentCampaignSlug();
    if (!slug) return;
    try {
      localStorage.setItem(contentDraftStorageKey(), JSON.stringify({
        campaignSlug: slug,
        title: contentTitleField?.value || '',
        shortBlurb: contentShortBlurb?.value || '',
        longContent: contentBlocks
      }));
    } catch (_error) {
    }
    if (options?.trackDirty !== false) updateContentDirty();
    if (options?.schedulePreview !== false) scheduleContentPreview();
  }

  function readContentDraft() {
    try {
      return JSON.parse(localStorage.getItem(contentDraftStorageKey()) || '{}') || {};
    } catch (_error) {
      return {};
    }
  }

  function setContentFields(draft) {
    activeDiaryContentField = null;
    campaignContentBeforeDiary = null;
    activeContentJsonField = contentLongContent;
    updateContentEditorMode();
    if (contentTitleField instanceof HTMLInputElement) contentTitleField.value = draft?.title || '';
    if (contentShortBlurb instanceof HTMLTextAreaElement) contentShortBlurb.value = draft?.shortBlurb || '';
    try {
      contentBlocks = parseContentBlocks(draft?.longContent || []);
    } catch (_error) {
      contentBlocks = [];
      setText(contentStatus, t('content_json_invalid', 'Content blocks must be valid JSON.'));
    }
    renderContentBlocks();
    resetContentDirtyBaseline();
  }

  function hydrateContentDraft() {
    if (!contentEditor || !selectedContentCampaignSlug()) return;
    var draft = readContentDraft();
    if (draft?.campaignSlug) {
      setContentFields(draft);
      resetContentDirtyBaseline();
      scheduleContentPreview({ immediate: true });
    }
  }

  function readContentEditorDraft() {
    syncContentMetadataFromSettings();
    var longContent = parseContentBlocks(contentLongContent?.value || contentBlocks);
    contentBlocks = longContent;
    syncContentJsonFromBlocks();
    return {
      campaignSlug: selectedContentCampaignSlug(),
      title: contentTitleField?.value || '',
      shortBlurb: contentShortBlurb?.value || '',
      longContent: longContent
    };
  }

  function renderContentValidation(data) {
    if (!contentValidation) return;
    contentValidation.replaceChildren();
    var errors = Array.isArray(data?.errors) ? data.errors : [];
    var warnings = Array.isArray(data?.warnings) ? data.warnings : [];
    if (!errors.length && !warnings.length) return;

    [
      { title: t('content_errors', 'Errors'), rows: errors },
      { title: t('content_warnings', 'Warnings'), rows: warnings }
    ].forEach(function(group) {
      if (!group.rows.length) return;
      var section = document.createElement('section');
      section.className = 'admin-content__validation-group';
      var heading = document.createElement('h3');
      heading.textContent = group.title;
      var list = document.createElement('ul');
      group.rows.forEach(function(message) {
        var item = document.createElement('li');
        item.textContent = message;
        list.append(item);
      });
      section.append(heading, list);
      contentValidation.append(section);
    });
  }

  function renderContentPreview(data) {
    var html = data?.preview?.html || '';
    if (contentPreviewDesktop instanceof HTMLIFrameElement) contentPreviewDesktop.srcdoc = html;
    if (contentPreviewMobile instanceof HTMLIFrameElement) contentPreviewMobile.srcdoc = html;
    renderContentValidation(data);
  }

  async function loadContentCampaign(options) {
    var slug = selectedContentCampaignSlug();
    if (!slug) {
      setText(contentStatus, currentCampaigns.length ? '' : t('no_campaigns', 'No campaigns are available for this admin account.'));
      return;
    }
    if (options?.skipIfLoaded && loadedContentCampaignSlug === slug && contentBlocks.length) return;

    setText(contentStatus, t('content_loading', 'Loading campaign content...'));
    try {
      var data = await requestJson('/admin/content/campaign?campaignSlug=' + encodeURIComponent(slug), { method: 'GET' });
      setContentFields({
        campaignSlug: data?.campaign?.slug || slug,
        title: data?.campaign?.title || '',
        shortBlurb: data?.campaign?.shortBlurb || '',
        longContent: data?.campaign?.longContent || []
      });
      syncContentMetadataFromSettings();
      writeContentDraft({ trackDirty: false });
      loadedContentCampaignSlug = slug;
      resetContentDirtyBaseline();
      setText(contentStatus, '');
      scheduleContentPreview({ immediate: true });
    } catch (error) {
      logger.error('Failed to load campaign content', error);
      setText(contentStatus, t('content_load_failed', 'Unable to load campaign content.'));
    }
  }

  async function previewContentDraft(options) {
    if (activeDiaryContentField instanceof HTMLTextAreaElement) {
      syncActiveDiaryContentField();
      if (!options?.silent) setText(contentStatus, t('content_diary_preview_blocked', 'Finish editing the diary entry before previewing campaign page content.'));
      return;
    }
    var draft;
    try {
      draft = readContentEditorDraft();
    } catch (_error) {
      if (!options?.silent) setText(contentStatus, t('content_json_invalid', 'Content blocks must be valid JSON.'));
      return;
    }
    if (!draft.campaignSlug) {
      if (!options?.silent) setText(contentStatus, currentCampaigns.length ? '' : t('no_campaigns', 'No campaigns are available for this admin account.'));
      return;
    }

    var requestId = ++contentPreviewRequestId;
    writeContentDraft({ schedulePreview: false });
    if (!options?.silent) setText(contentStatus, t('content_previewing', 'Validating preview...'));
    try {
      var data = await requestJson('/admin/content/preview', {
        method: 'POST',
        body: JSON.stringify({
          campaignSlug: draft.campaignSlug,
          draft: draft
        })
      });
      if (requestId !== contentPreviewRequestId) return;
      renderContentPreview(data);
      if (!options?.silent) setText(contentStatus, t('content_preview_ready', 'Preview is ready.'));
    } catch (error) {
      if (requestId !== contentPreviewRequestId) return;
      if (error?.data?.preview) {
        renderContentPreview(error.data);
      } else {
        renderContentValidation(error?.data || {});
      }
      if (!options?.silent) setText(contentStatus, t('content_preview_failed', 'Preview needs changes before it can publish.'));
    }
  }

  async function publishContentDraft() {
    if (activeDiaryContentField instanceof HTMLTextAreaElement) {
      syncActiveDiaryContentField();
      setText(contentStatus, t('content_diary_publish_blocked', 'Finish editing the diary entry before publishing campaign page content.'));
      return;
    }
    var confirmed = window.confirm(t('content_publish_confirm', 'Publish this campaign content to GitHub and trigger a rebuild?'));
    if (!confirmed) return;

    var draft;
    try {
      draft = readContentEditorDraft();
    } catch (_error) {
      setText(contentStatus, t('content_json_invalid', 'Content blocks must be valid JSON.'));
      return;
    }
    if (!draft.campaignSlug) {
      setText(contentStatus, currentCampaigns.length ? '' : t('no_campaigns', 'No campaigns are available for this admin account.'));
      return;
    }

    writeContentDraft();
    setText(contentStatus, t('content_publishing', 'Publishing content...'));
    try {
      var data = await requestJson('/admin/content/publish', {
        method: 'POST',
        body: JSON.stringify({
          intent: 'publish',
          campaignSlug: draft.campaignSlug,
          draft: draft
        })
      });
      setText(contentStatus, t('content_published', 'Content published. Rebuild status: %{status}', {
        status: data?.rebuild?.triggered ? t('yes', 'Yes') : t('no', 'No')
      }));
      resetContentDirtyBaseline();
    } catch (error) {
      if (error?.data?.preview) {
        renderContentPreview(error.data);
      } else {
        renderContentValidation(error?.data || {});
      }
      setText(contentStatus, error?.data?.code === 'github_not_configured'
        ? t('content_publish_not_configured', 'GitHub publishing is not configured.')
        : t('content_publish_failed', 'Unable to publish content.'));
    }
  }

  async function publishCampaignChanges() {
    var campaignSettingsChanges = collectCampaignSettingsChanges();
    if (!campaignSettingsChanges.length && !contentHasUnsavedChanges) {
      setText(contentStatus, t('settings_no_changes', 'No settings changes to publish.'));
      updateDirtyIndicators();
      return;
    }
    if (campaignSettingsChanges.length) {
      var settingsPublished = await publishSettingsChanges(contentStatus, campaignSettingsChanges);
      if (!settingsPublished) return;
    }
    if (contentHasUnsavedChanges) {
      await publishContentDraft();
    }
  }

  function reportQueryParams() {
    var params = new URLSearchParams();
    params.set('campaignSlug', reportCampaign?.value || '');
    params.set('reportType', reportType?.value || 'pledge');
    return params;
  }

  function reportSortValue(value) {
    var normalized = String(value ?? '').trim();
    var numeric = Number(normalized.replace(/[$,%\s,]+/g, ''));
    if (normalized && Number.isFinite(numeric)) return numeric;
    var date = Date.parse(normalized);
    if (normalized && Number.isFinite(date)) return date;
    return normalized.toLocaleLowerCase();
  }

  function updateReportSortIndicators(table) {
    table?.querySelectorAll('th[data-report-sort-index]').forEach(function(header) {
      var isActive = Number(header.dataset.reportSortIndex) === reportSort.index;
      header.setAttribute('aria-sort', isActive ? reportSort.direction + 'ending' : 'none');
      var indicator = header.querySelector('.admin-reports__sort-indicator');
      if (indicator) {
        indicator.textContent = adminSortIndicatorText(isActive, reportSort.direction);
        indicator.classList.toggle('is-active', isActive);
      }
    });
  }

  function sortReportRows(table) {
    if (!table) return;
    if (reportSort.index < 0) {
      updateReportSortIndicators(table);
      return;
    }
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var direction = reportSort.direction === 'desc' ? -1 : 1;
    var rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort(function(a, b) {
      var aValue = a.children[reportSort.index]?.dataset.reportSortValue || '';
      var bValue = b.children[reportSort.index]?.dataset.reportSortValue || '';
      return compareAdminSortValues(aValue, bValue, direction);
    });
    tbody.append.apply(tbody, rows);
    updateReportSortIndicators(table);
  }

  function appendReportHeader(row, header) {
    header.forEach(function(label, index) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.dataset.reportSortIndex = String(index);
      th.setAttribute('aria-sort', 'none');
      var button = createAdminSortButton(label, 'admin-reports__sort', 'admin-reports__sort-indicator', function() {
        reportSort.direction = reportSort.index === index && reportSort.direction === 'asc' ? 'desc' : 'asc';
        reportSort.index = index;
        sortReportRows(row.closest('table'));
      });
      th.append(button);
      row.append(th);
    });
  }

  function appendReportCells(row, values) {
    values.forEach(function(value) {
      var td = document.createElement('td');
      td.textContent = value;
      td.dataset.reportSortValue = String(reportSortValue(value));
      row.append(td);
    });
  }

  function renderReportPreview(data) {
    if (!reportPreviewRoot) return;
    reportPreviewRoot.replaceChildren();

    var summary = document.createElement('p');
    summary.className = 'admin-reports__summary admin-app__muted';
    summary.textContent = t('report_row_count', '%{count} rows', {
      count: formatNumber(data?.rowCount)
    });
    reportPreviewRoot.append(summary);

    var header = Array.isArray(data?.header) ? data.header : [];
    var rows = Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data?.previewRows) ? data.previewRows : [];
    if (!header.length || !rows.length) {
      var empty = document.createElement('p');
      empty.className = 'admin-app__muted';
      empty.textContent = t('report_empty', 'No report rows are available for this preview.');
      reportPreviewRoot.append(empty);
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'admin-reports__table-wrap';
    var table = document.createElement('table');
    table.className = 'admin-reports__table';
    var caption = document.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = t('report_preview_caption', 'Report preview rows');
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    if (reportSort.index >= header.length) reportSort.index = -1;
    appendReportHeader(headerRow, header);
    thead.append(headerRow);
    var tbody = document.createElement('tbody');
    rows.forEach(function(row) {
      var tr = document.createElement('tr');
      appendReportCells(tr, header.map(function(_label, index) { return row[index] || ''; }));
      tbody.append(tr);
    });
    table.append(caption, thead, tbody);
    sortReportRows(table);
    wrap.append(table);
    reportPreviewRoot.append(wrap);
  }

  async function loadReportPreview() {
    if (!currentCampaigns.length) {
      if (reportPreviewRoot) reportPreviewRoot.replaceChildren();
      setText(reportStatus, currentCampaigns.length ? '' : t('no_campaigns', 'No campaigns are available for this admin account.'));
      return;
    }

    setText(reportStatus, t('loading_report_preview', 'Building report preview...'));
    try {
      var data = await requestJson('/admin/reports/campaign-runner/preview?' + reportQueryParams().toString(), { method: 'GET' });
      renderReportPreview(data);
      setText(reportStatus, '');
    } catch (error) {
      logger.error('Failed to load report preview', error);
      setText(reportStatus, error?.data?.code === 'campaign_index_required'
        ? t('report_index_required', 'This campaign needs its pledge index rebuilt before report previews.')
        : t('load_report_preview_failed', 'Unable to load the report preview.'));
    }
  }

  async function downloadReportCsv() {
    if (!currentCampaigns.length) {
      setText(reportStatus, currentCampaigns.length ? '' : t('no_campaigns', 'No campaigns are available for this admin account.'));
      return;
    }

    setText(reportStatus, t('downloading_report', 'Preparing CSV download...'));
    try {
      var result = await requestBlob('/admin/reports/campaign-runner.csv?' + reportQueryParams().toString(), { method: 'GET' });
      var objectUrl = URL.createObjectURL(result.blob);
      var link = document.createElement('a');
      link.href = objectUrl;
      link.download = result.filename || 'campaign-runner-report.csv';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setText(reportStatus, t('download_started', 'CSV download started.'));
    } catch (error) {
      logger.error('Failed to download report CSV', error);
      setText(reportStatus, error?.data?.code === 'campaign_index_required'
        ? t('report_index_required', 'This campaign needs its pledge index rebuilt before report previews.')
        : t('download_report_failed', 'Unable to download the CSV.'));
    }
  }

  function formatInventoryValue(value) {
    return value === null || value === undefined
      ? t('inventory_unlimited', 'Unlimited')
      : new Intl.NumberFormat(lang || 'en').format(value || 0);
  }

  function renderInventory(data) {
    if (!inventoryRoot) return;
    inventoryRoot.replaceChildren();
    var rows = Array.isArray(data?.rows) ? data.rows : [];
    if (!rows.length) {
      var empty = document.createElement('p');
      empty.className = 'admin-app__muted';
      empty.textContent = t('inventory_empty', 'No platform add-on inventory is configured.');
      inventoryRoot.append(empty);
      return;
    }

    var table = document.createElement('table');
    table.className = 'admin-inventory__table';
    var caption = document.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = t('inventory_title', 'Platform inventory');
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    appendTableHeader(headerRow, [
      t('inventory_item', 'Item'),
      t('inventory_config', 'Config'),
      t('inventory_baseline', 'Baseline'),
      t('inventory_sold', 'Sold'),
      t('inventory_remaining', 'Remaining'),
      t('inventory_actions', 'Actions')
    ]);
    thead.append(headerRow);

    var tbody = document.createElement('tbody');
    rows.forEach(function(row) {
      var tr = document.createElement('tr');
      appendTextCells(tr, [
        row.label || row.productId || '',
        formatInventoryValue(row.configuredInventory),
        row.hasOverride
          ? t('inventory_override_value', '%{value} override', { value: formatInventoryValue(row.inventory) })
          : formatInventoryValue(row.inventory),
        formatInventoryValue(row.sold),
        formatInventoryValue(row.remaining)
      ]);

      var actionCell = document.createElement('td');
      var actionWrap = document.createElement('div');
      actionWrap.className = 'admin-inventory__actions';
      var input = document.createElement('input');
      input.className = 'admin-inventory__input';
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = row.inventory === null || row.inventory === undefined ? '' : String(row.inventory);
      input.setAttribute('aria-label', t('inventory_amount_label', 'Inventory amount'));
      input.dataset.productId = row.productId || '';
      input.dataset.variantId = row.variantId || '';

      [
        { action: 'set', label: t('inventory_set', 'Set') },
        { action: 'restock', label: t('inventory_add', 'Add') },
        { action: 'reset', label: t('inventory_reset', 'Reset') }
      ].forEach(function(config) {
        var button = document.createElement('button');
        button.className = 'btn btn--secondary';
        button.type = 'button';
        button.textContent = config.label;
        button.dataset.inventoryAction = config.action;
        button.dataset.productId = row.productId || '';
        button.dataset.variantId = row.variantId || '';
        actionWrap.append(button);
      });

      actionWrap.prepend(input);
      actionCell.append(actionWrap);
      tr.append(actionCell);
      tbody.append(tr);
    });

    table.append(caption, thead, tbody);
    inventoryRoot.append(table);
  }

  async function loadInventory() {
    if (!inventoryRoot || currentUser?.role !== 'super_admin') return;
    setText(inventoryStatus, t('loading_inventory', 'Loading inventory...'));
    try {
      var data = await requestJson('/admin/add-ons/inventory', { method: 'GET' });
      renderInventory(data);
      setText(inventoryStatus, t('inventory_loaded', 'Inventory loaded.'));
    } catch (error) {
      logger.error('Failed to load platform inventory', error);
      setText(inventoryStatus, t('load_inventory_failed', 'Unable to load platform inventory.'));
    }
  }

  async function mutateInventory(button) {
    var action = button?.dataset?.inventoryAction || '';
    var productId = button?.dataset?.productId || '';
    var variantId = button?.dataset?.variantId || '';
    var row = button?.closest?.('tr');
    var input = row?.querySelector?.('.admin-inventory__input');
    if (!action || !productId) return;

    if (action === 'reset') {
      var confirmed = window.confirm(t('inventory_reset_confirm', 'Reset this inventory baseline to the configured value?'));
      if (!confirmed) return;
    }
    if (action !== 'reset') {
      var saveConfirmed = window.confirm(t('inventory_mutation_confirm', 'Update this inventory baseline?'));
      if (!saveConfirmed) return;
    }

    var numericValue = input instanceof HTMLInputElement ? Number.parseInt(input.value, 10) : NaN;
    var body = { action: action, productId: productId, variantId: variantId };
    if (action === 'set') body.inventory = numericValue;
    if (action === 'restock') body.quantity = numericValue;

    setText(inventoryStatus, t('saving_inventory', 'Saving inventory...'));
    try {
      await requestJson('/admin/add-ons/inventory', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      await loadInventory();
      setText(inventoryStatus, t('inventory_saved', 'Inventory updated.'));
    } catch (error) {
      logger.error('Failed to update platform inventory', error);
      setText(inventoryStatus, t('inventory_save_failed', 'Unable to update inventory.'));
    }
  }

  function csvCell(value) {
    var normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    return '"' + normalized.replace(/"/g, '""') + '"';
  }

  function visibleSupportersCsv() {
    var table = supportersRoot?.querySelector('table');
    if (!table) return '';
    var hasCampaignColumn = Boolean(table.querySelector('th[data-supporter-sort-key="campaign"]'));
    var rows = Array.from(table.querySelectorAll('tr')).map(function(row) {
      var values = Array.from(row.querySelectorAll('th, td')).map(function(cell) {
        return csvCell(cell.dataset.exportLabel || cell.textContent);
      });
      if (!hasCampaignColumn) {
        values.unshift(csvCell(row.parentElement?.tagName === 'THEAD'
          ? t('campaign_label', 'Campaign')
          : row.dataset.supporterCampaign || ''));
      }
      return values.join(',');
    });
    return rows.length ? rows.join('\n') + '\n' : '';
  }

  function exportVisibleSupportersCsv() {
    var csv = visibleSupportersCsv();
    if (!csv) {
      setText(supportersStatus, t('supporters_export_empty', 'No visible supporters to export.'));
      return;
    }
    var blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'supporters-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function visibleAnalyticsCsv() {
    var table = analyticsRoot?.querySelector('.admin-analytics__table');
    if (!table) return '';
    var rows = Array.from(table.querySelectorAll('tr')).map(function(row) {
      return Array.from(row.querySelectorAll('th, td')).map(function(cell) {
        return csvCell(cell.dataset.exportLabel || cell.textContent);
      }).join(',');
    });
    return rows.length ? rows.join('\n') + '\n' : '';
  }

  function exportVisibleAnalyticsCsv() {
    var csv = visibleAnalyticsCsv();
    if (!csv) {
      setText(analyticsStatus, t('analytics_export_empty', 'No analytics rows to export.'));
      return;
    }
    var blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'campaign-analytics-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function supporterColumns(showCampaignColumn) {
    return (showCampaignColumn ? [{ key: 'campaign', label: t('campaign_label', 'Campaign') }] : []).concat([
      { key: 'email', label: t('supporter_email', 'Email') },
      { key: 'status', label: t('supporter_status', 'Status') },
      { key: 'amount', label: t('supporter_amount', 'Amount') },
      { key: 'fulfillment', label: t('supporter_fulfillment', 'Fulfillment') },
      { key: 'created', label: t('supporter_created', 'Created') }
    ]);
  }

  function supporterSortType(key) {
    return key === 'amount' || key === 'created' ? 'number' : 'text';
  }

  function supporterCell(value, sortValue, key) {
    return {
      value: value,
      sortValue: sortValue ?? value,
      key: key
    };
  }

  function appendSupporterCells(row, cells) {
    cells.forEach(function(cell) {
      var td = document.createElement('td');
      td.textContent = cell.value;
      td.dataset.supporterSortKey = cell.key;
      td.dataset.supporterSortValue = String(cell.sortValue ?? cell.value ?? '');
      row.append(td);
    });
  }

  function updateSupporterSortIndicators(table) {
    table?.querySelectorAll('th[data-supporter-sort-key]').forEach(function(header) {
      var isActive = header.dataset.supporterSortKey === supporterSort.key;
      header.setAttribute('aria-sort', isActive ? supporterSort.direction + 'ending' : 'none');
      var indicator = header.querySelector('.admin-supporters__sort-indicator');
      if (indicator) {
        indicator.textContent = adminSortIndicatorText(isActive, supporterSort.direction);
        indicator.classList.toggle('is-active', isActive);
      }
    });
  }

  function sortSupporterRows(table) {
    if (!table) return;
    if (!supporterSort.key) {
      updateSupporterSortIndicators(table);
      return;
    }
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var type = supporterSortType(supporterSort.key);
    var direction = supporterSort.direction === 'desc' ? -1 : 1;
    var rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort(function(a, b) {
      var aValue = a.querySelector('[data-supporter-sort-key="' + supporterSort.key + '"]')?.dataset.supporterSortValue || '';
      var bValue = b.querySelector('[data-supporter-sort-key="' + supporterSort.key + '"]')?.dataset.supporterSortValue || '';
      return compareAdminSortValues(aValue, bValue, direction, type);
    });
    tbody.append.apply(tbody, rows);
    updateSupporterSortIndicators(table);
  }

  function appendSupporterHeader(row, columns) {
    columns.forEach(function(column) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.dataset.supporterSortKey = column.key;
      th.dataset.exportLabel = column.label;
      th.setAttribute('aria-sort', 'none');
      var button = createAdminSortButton(column.label, 'admin-supporters__sort', 'admin-supporters__sort-indicator', function() {
        supporterSort.direction = supporterSort.key === column.key && supporterSort.direction === 'asc' ? 'desc' : 'asc';
        supporterSort.key = column.key;
        sortSupporterRows(row.closest('table'));
      });
      button.dataset.supporterSortKey = column.key;
      th.append(button);
      row.append(th);
    });
  }

  function supporterQueryParams(cursor) {
    var params = new URLSearchParams();
    params.set('campaignSlug', supporterCampaign?.value || '');
    params.set('status', supporterStatus?.value || 'all');
    params.set('fulfillment', supporterFulfillment?.value || 'all');
    params.set('limit', '25');
    if (cursor) params.set('cursor', String(cursor));
    var query = String(supporterQuery?.value || '').trim();
    if (query) params.set('q', query);
    return params;
  }

  function renderSupportersPage(data, append) {
    if (!supportersRoot) return;
    if (!append) supportersRoot.replaceChildren();
    supporterNextCursor = data?.page?.nextCursor ?? null;
    if (supportersNext) supportersNext.hidden = supporterNextCursor === null;

    var supporters = Array.isArray(data?.supporters) ? data.supporters : [];
    if (!append && supporters.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'admin-app__muted';
      empty.textContent = t('supporters_empty', 'No supporters match these filters.');
      supportersRoot.append(empty);
      return;
    }

    var table = supportersRoot.querySelector('table');
    var tbody = table?.querySelector('tbody');
    if (!table) {
      var showCampaignColumn = data?.scope === 'portfolio';
      var columns = supporterColumns(showCampaignColumn);
      if (supporterSort.key && !columns.some(function(column) { return column.key === supporterSort.key; })) {
        supporterSort.key = '';
      }
      table = document.createElement('table');
      table.className = 'admin-supporters__table';
      var caption = document.createElement('caption');
      caption.className = 'sr-only';
      caption.textContent = t('supporters_title', 'Supporters');
      var thead = document.createElement('thead');
      var headerRow = document.createElement('tr');
      appendSupporterHeader(headerRow, columns);
      thead.append(headerRow);
      tbody = document.createElement('tbody');
      table.append(caption, thead, tbody);
      supportersRoot.append(table);
    }

    supporters.forEach(function(supporter) {
      var row = document.createElement('tr');
      var campaignLabel = supporter.campaignTitle || data?.campaign?.title || supporter.campaignSlug || data?.campaign?.slug || '';
      row.dataset.supporterCampaign = campaignLabel;
      var statusLabel = t('status_' + String(supporter.pledgeStatus || 'active'), supporter.pledgeStatus || '');
      var fulfillmentLabel = supporter.hasPhysicalReward
        ? t('fulfillment_physical', 'Physical')
        : t('fulfillment_digital', 'Digital');
      var createdAt = supporter.createdAt ? Date.parse(supporter.createdAt) : 0;
      var cells = (data?.scope === 'portfolio' ? [
        supporterCell(campaignLabel, campaignLabel.toLocaleLowerCase(), 'campaign')
      ] : []).concat([
        supporterCell(supporter.email || supporter.orderId || '', String(supporter.email || supporter.orderId || '').toLocaleLowerCase(), 'email'),
        supporterCell(statusLabel, statusLabel.toLocaleLowerCase(), 'status'),
        supporterCell(formatMoney(supporter.amount), Number(supporter.amount || 0), 'amount'),
        supporterCell(fulfillmentLabel, fulfillmentLabel.toLocaleLowerCase(), 'fulfillment'),
        supporterCell(supporter.createdAt ? new Date(supporter.createdAt).toLocaleDateString(lang || 'en') : '', Number.isFinite(createdAt) ? createdAt : 0, 'created')
      ]);
      appendSupporterCells(row, cells);
      tbody.append(row);
    });
    sortSupporterRows(table);
  }

  async function loadSupporters(options) {
    if (!currentCampaigns.length) {
      if (supportersRoot) supportersRoot.replaceChildren();
      if (supportersNext) supportersNext.hidden = true;
      setText(supportersStatus, currentCampaigns.length ? '' : t('no_campaigns', 'No campaigns are available for this admin account.'));
      return;
    }

    var append = options?.append === true;
    var cursor = append ? supporterNextCursor : 0;
    setText(supportersStatus, t('loading_supporters', 'Loading supporters...'));
    try {
      var data = await requestJson('/admin/supporters?' + supporterQueryParams(cursor).toString(), { method: 'GET' });
      supporterCursor = data?.page?.cursor || 0;
      renderSupportersPage(data, append);
      setText(supportersStatus, '');
    } catch (error) {
      logger.error('Failed to load supporters', error);
      if (supportersNext) supportersNext.hidden = true;
      setText(supportersStatus, error?.data?.code === 'campaign_index_required'
        ? t('supporters_index_required', 'This campaign needs its pledge index rebuilt before supporter browsing.')
        : t('load_supporters_failed', 'Unable to load supporters.'));
    }
  }

  async function loadSettings() {
    setText(settingsStatus, t('settings_loading', 'Loading settings...'));
    try {
      var data = await requestJson('/admin/settings', { method: 'GET' });
      renderSettings(data);
      setText(settingsStatus, '');
      updateDirtyIndicators();
    } catch (error) {
      logger.error('Failed to load admin settings', error);
      setText(settingsStatus, t('settings_load_failed', 'Unable to load settings.'));
    }
  }

  async function loadSummary() {
    var statusTarget = activeAdminStatus();
    setText(statusTarget, t('refreshing', 'Refreshing...'));
    try {
      var summary = await requestJson('/admin/dashboard/summary', { method: 'GET' });
      renderSummary(summary);
      setText(statusTarget, '');
      await loadSettings();
      await loadReportPreview();
      await loadAnalytics();
      await loadSupporters({ append: false });
    } catch (error) {
      logger.error('Failed to load admin summary', error);
      setText(statusTarget, t('load_summary_failed', 'Unable to load the admin summary.'));
    }
  }

  async function loadSession() {
    setText(authStatus, t('loading_session', 'Checking admin session...'));
    try {
      var session = await requestJson('/admin/session', { method: 'GET' });
      currentCsrf = session.csrfToken || '';
      showApp(session.user);
      await loadSummary();
    } catch (_error) {
      showAuth(t('session_failed', 'Sign in to continue.'));
    }
  }

  async function exchangeToken(token) {
    showAuth(t('exchanging_token', 'Signing you in...'));
    try {
      var result = await requestJson('/admin/auth/exchange', {
        method: 'POST',
        body: JSON.stringify({ token: token, preferredLang: lang })
      });
      currentCsrf = result.csrfToken || '';
      var cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('admin_login');
      window.history.replaceState({}, document.title, cleanUrl.toString());
      showApp(result.user);
      await loadSummary();
    } catch (error) {
      logger.warn('Admin token exchange failed', error);
      showAuth(t('exchange_failed', 'This admin link is invalid or expired.'));
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      var email = String(emailInput?.value || '').trim();
      if (!email) return;
      setText(authStatus, t('sending_link', 'Sending magic link...'));
      try {
        var result = await requestJson('/admin/auth/start', {
          method: 'POST',
          body: JSON.stringify({ email: email, preferredLang: lang })
        });
        if (result.loginUrl) {
          setText(authStatus, t('dev_link_ready', 'Development login link is ready.') + ' ' + result.loginUrl);
        } else {
          setText(authStatus, t('link_sent', 'If that email has access, a magic link is on the way.'));
        }
      } catch (error) {
        logger.error('Admin sign-in start failed', error);
        setText(authStatus, t('login_failed', 'Unable to start admin sign-in.'));
      }
    });
  }

  window.addEventListener('beforeunload', function(event) {
    if (!adminHasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  if (tabButtons.length) {
    applyAdminTabCompactLabels();
    tabButtons.forEach(function(button) {
      if (!(button instanceof HTMLButtonElement)) return;
      button.addEventListener('click', function() {
        activateAdminTab(button.dataset.adminTab || 'settings');
      });
      button.addEventListener('keydown', function(event) {
        var keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (keys.indexOf(event.key) < 0) return;
        event.preventDefault();
        var visibleButtons = visibleAdminTabButtons();
        var currentIndex = visibleButtons.indexOf(button);
        var nextIndex = currentIndex;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = visibleButtons.length - 1;
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + visibleButtons.length) % visibleButtons.length;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % visibleButtons.length;
        activateAdminTab(visibleButtons[nextIndex]?.dataset?.adminTab || 'settings', { focus: true });
      });
    });
  }

  if (settingsPublish) {
    settingsPublish.addEventListener('click', function() { publishSettingsChanges(settingsStatus); });
  }

  if (addOnsPublish) {
    addOnsPublish.addEventListener('click', function() { publishSettingsChanges(addOnsStatus); });
  }

  if (settingsRoot) {
    settingsRoot.addEventListener('change', updateConditionalSettingsRows);
    settingsRoot.addEventListener('input', updateAdminDirtyIndicatorsSoon);
    settingsRoot.addEventListener('change', updateAdminDirtyIndicatorsSoon);
  }

  if (addOnsRoot) {
    addOnsRoot.addEventListener('change', updateConditionalSettingsRows);
    addOnsRoot.addEventListener('input', updateAdminDirtyIndicatorsSoon);
    addOnsRoot.addEventListener('change', updateAdminDirtyIndicatorsSoon);
  }

  if (campaignSettingsRoot) {
    campaignSettingsRoot.addEventListener('input', function(event) {
      var control = event.target?.closest?.('[data-settings-path]');
      if (!control) return;
      var campaignSlug = control.dataset.settingsCampaign || selectedCampaignSettingsSlug;
      if (control.dataset.settingsPath === 'title') updateDerivedCampaignFields(campaignSlug);
      if (campaignSlug === selectedContentCampaignSlug() && ['title', 'short_blurb'].includes(control.dataset.settingsPath || '')) {
        syncContentMetadataFromSettings();
        writeContentDraft();
      }
      updateAdminDirtyIndicatorsSoon();
    });
    campaignSettingsRoot.addEventListener('change', function(event) {
      updateConditionalSettingsRows();
      var control = event.target?.closest?.('[data-settings-path]');
      if (control?.dataset?.settingsPath === 'title') updateDerivedCampaignFields(control.dataset.settingsCampaign || selectedCampaignSettingsSlug);
      updateAdminDirtyIndicatorsSoon();
    });
  }

  if (reportPreviewForm) {
    reportPreviewForm.addEventListener('submit', function(event) {
      event.preventDefault();
      loadReportPreview();
    });
  }

  [reportCampaign, reportType].forEach(function(control) {
    if (!control) return;
    control.addEventListener('change', function() {
      reportSort.index = -1;
      reportSort.direction = 'asc';
      loadReportPreview();
    });
  });

  if (reportDownload) {
    reportDownload.addEventListener('click', downloadReportCsv);
  }

  if (inventoryLoad) {
    inventoryLoad.addEventListener('click', loadInventory);
  }

  if (inventoryRoot) {
    inventoryRoot.addEventListener('click', function(event) {
      var button = event.target?.closest?.('[data-inventory-action]');
      if (button instanceof HTMLButtonElement) {
        mutateInventory(button);
      }
    });
  }

  if (marketingForm) {
    marketingForm.addEventListener('submit', function(event) {
      event.preventDefault();
      updateMarketingBuilder();
      writeMarketingDraft();
    });
    marketingForm.addEventListener('input', function() {
      updateMarketingBuilder();
      writeMarketingDraft();
    });
    marketingForm.addEventListener('change', function(event) {
      updateMarketingBuilder();
      writeMarketingDraft();
      if (event.target === marketingCampaign) {
        setMarketingEditingState('');
        loadMarketingReferrals();
      }
    });
  }

  if (marketingCopyUrl) {
    marketingCopyUrl.addEventListener('click', function() {
      copyMarketingText(marketingUrl?.value || '');
    });
  }

  if (marketingSaveReferral) {
    marketingSaveReferral.addEventListener('click', saveMarketingReferral);
  }

  if (marketingCancelEdit) {
    marketingCancelEdit.addEventListener('click', function() {
      setMarketingEditingState('');
      setText(marketingStatus, '');
    });
  }

  if (marketingSnippets) {
    marketingSnippets.addEventListener('click', function(event) {
      var button = event.target?.closest?.('[data-marketing-copy]');
      if (button instanceof HTMLButtonElement) {
        copyMarketingText(button.dataset.marketingCopy || '', button.dataset.marketingCopyHtml || '');
      }
    });
  }

  if (analyticsCampaign) {
    analyticsCampaign.addEventListener('change', function() {
      analyticsSort.index = -1;
      analyticsSort.direction = 'asc';
      loadAnalytics();
    });
  }

  function runContentEditorAction(root, field, callback) {
    if (field instanceof HTMLTextAreaElement) {
      return withContentEditorContext(root, field, callback);
    }
    return callback();
  }

  function attachContentBlockEditor(root, field) {
    if (!(root instanceof HTMLElement)) return;
    document.addEventListener('pointerdown', function(event) {
      if (event.target instanceof Node && root.contains(event.target)) return;
      closeContentSettingsPanels(root);
      deactivateContentBlocks(root);
    });
    root.addEventListener('focusin', function() {
      runContentEditorAction(root, field, updateActiveEditable);
    });
    root.addEventListener('mouseup', function(event) {
      runContentEditorAction(root, field, function() {
        refreshContentSelectionState(event);
      });
    });
    root.addEventListener('keyup', function(event) {
      runContentEditorAction(root, field, function() {
        refreshContentSelectionState(event);
      });
    });
    root.addEventListener('pointerdown', function(event) {
      runContentEditorAction(root, field, function() {
        var settingsButton = contentSettingsButtonForNode(event.target);
        if (settingsButton) {
          event.preventDefault();
          event.stopPropagation();
          suppressContentSettingsClickUntil = Date.now() + 600;
          toggleMediaSettings(settingsButton);
          return;
        }
        if (isContentSettingsTarget(event.target)) return;
        closeContentSettingsPanels(root);
        if (event.pointerType === 'touch' && editableForNode(event.target)) {
          deferContentTouchActivationUntil = Date.now() + 500;
          if (deferredContentTouchActivationTimer) window.clearTimeout(deferredContentTouchActivationTimer);
          var target = event.target;
          deferredContentTouchActivationTimer = window.setTimeout(function() {
            deferContentTouchActivationUntil = 0;
            runContentEditorAction(root, field, function() {
              activateContentBlockForNode(target);
              updateContentLinkInspector();
              updateContentFormatState();
            });
          }, 500);
          return;
        }
        activateContentBlockForNode(event.target);
      });
    });
    root.addEventListener('input', function(event) {
      runContentEditorAction(root, field, function() {
        var control = event.target;
        if (control instanceof HTMLElement && control.isContentEditable && !control.dataset.contentField) return;
        if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLElement && (control.isContentEditable || control.dataset.contentField)) {
          updateContentBlockField(control);
          lastContentMutation = control instanceof HTMLElement && control.isContentEditable ? 'text' : 'field';
          writeContentDraft();
        }
      });
    });
    root.addEventListener('change', function(event) {
      runContentEditorAction(root, field, function() {
        var control = event.target;
        if (control instanceof HTMLSelectElement && control.dataset.contentAction === 'type') {
          changeContentBlockType(Number(control.dataset.contentIndex), control.value);
        } else if (control instanceof HTMLSelectElement && control.dataset.contentAction === 'format-block') {
          applyContentBlockFormat(control.value);
        } else if (control instanceof HTMLInputElement && control.dataset.contentAction === 'link-url') {
          applyContentLinkPanel(control);
        } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
          updateContentBlockField(control);
          writeContentDraft();
        }
      });
    });
    root.addEventListener('click', function(event) {
      runContentEditorAction(root, field, function() {
        var settingsButton = contentSettingsButtonForNode(event.target);
        if (settingsButton && Date.now() < suppressContentSettingsClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        var deferActivation = Date.now() < deferContentTouchActivationUntil && editableForNode(event.target);
        if (!deferActivation && !isContentSettingsTarget(event.target)) activateContentBlockForNode(event.target);
        var link = event.target?.closest?.('a');
        if (link instanceof HTMLAnchorElement && editableForNode(link)) {
          event.preventDefault();
          setActiveContentLink(link);
          updateContentFormatState();
        }
        var button = event.target?.closest?.('[data-content-action]');
        if (!(button instanceof HTMLButtonElement)) return;
        var index = Number(button.dataset.contentIndex);
        var action = button.dataset.contentAction;
        if (action === 'format-bold') {
          applyContentFormat('bold');
        } else if (action === 'format-italic') {
          applyContentFormat('italic');
        } else if (action === 'format-underline') {
          applyContentFormat('underline');
        } else if (action === 'format-link') {
          applyContentLink();
        } else if (action === 'format-unordered-list') {
          applyContentListFormat(false);
        } else if (action === 'format-ordered-list') {
          applyContentListFormat(true);
        } else if (action === 'link-apply') {
          applyContentLinkPanel(button.closest('[data-content-link-panel]')?.querySelector('[data-content-action="link-url"]'));
        } else if (action === 'link-remove') {
          removeActiveContentLink();
        } else if (action === 'toggle-media-settings') {
          toggleMediaSettings(button);
        } else if (action === 'toggle-gallery-image-settings') {
          toggleMediaSettings(button);
        } else if (action === 'align') {
          applyContentBlockAlignment(index, button.dataset.contentAlign);
        } else if (action === 'insert-block') {
          pushContentHistory();
          contentBlocks.splice(Math.max(0, Math.min(index, contentBlocks.length)), 0, defaultContentBlock('text'));
          lastContentMutation = 'block';
          renderContentBlocks(index);
        } else if (action === 'up' && index > 0) {
          pushContentHistory();
          var previous = contentBlocks[index - 1];
          contentBlocks[index - 1] = contentBlocks[index];
          contentBlocks[index] = previous;
          lastContentMutation = 'block';
          renderContentBlocks(index - 1);
        } else if (action === 'down' && index < contentBlocks.length - 1) {
          pushContentHistory();
          var next = contentBlocks[index + 1];
          contentBlocks[index + 1] = contentBlocks[index];
          contentBlocks[index] = next;
          lastContentMutation = 'block';
          renderContentBlocks(index + 1);
        } else if (action === 'delete' && contentBlocks.length > 1) {
          pushContentHistory();
          contentBlocks.splice(index, 1);
          lastContentMutation = 'block';
          renderContentBlocks(Math.max(0, index - 1));
        }
        writeContentDraft();
      });
    });
    root.addEventListener('keydown', function(event) {
      runContentEditorAction(root, field, function() {
        var control = event.target;
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && lastContentMutation === 'block') {
          if (undoContentBlockMutation()) event.preventDefault();
          return;
        }
        if (control instanceof HTMLInputElement && control.dataset.contentAction === 'link-url' && event.key === 'Enter') {
          applyContentLinkPanel(control);
          event.preventDefault();
          return;
        }
        if (event.key === 'Escape') {
          var panel = control instanceof HTMLElement ? control.closest('[data-content-media-settings], [data-content-gallery-image-settings]') : null;
          if (panel instanceof HTMLElement) {
            var button = contentBlocksRoot.querySelector('[aria-controls="' + panel.id + '"]');
            panel.hidden = true;
            if (button instanceof HTMLButtonElement) {
              button.setAttribute('aria-expanded', 'false');
              button.focus();
            }
            event.preventDefault();
            return;
          }
        }
        if (!(control instanceof HTMLElement) || !control.isContentEditable || event.key !== 'Enter') return;
        if (!insertContentBlockFromSlash(control)) return;
        event.preventDefault();
      });
    });
    root.addEventListener('paste', function(event) {
      runContentEditorAction(root, field, function() {
        var control = event.target;
        if (!(control instanceof HTMLElement) || !control.isContentEditable) return;
        var sanitized = sanitizedClipboardHtml(event, control.dataset.contentField === 'body');
        if (!sanitized) return;
        event.preventDefault();
        document.execCommand('insertHTML', false, sanitized);
        control.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  if (contentLoad) {
    contentLoad.addEventListener('click', loadContentCampaign);
  }

  if (contentCampaign) {
    contentCampaign.addEventListener('change', hydrateContentDraft);
  }

  if (contentEditor) {
    contentEditor.addEventListener('submit', function(event) {
      event.preventDefault();
      previewContentDraft();
    });
    contentEditor.addEventListener('input', writeContentDraft);
  }

  attachContentBlockEditor(contentBlocksRoot);

  if (contentLongContent) {
    contentLongContent.addEventListener('change', syncContentBlocksFromJson);
  }

  if (contentSaveDraft) {
    contentSaveDraft.addEventListener('click', function() {
      writeContentDraft({ trackDirty: false });
      resetContentDirtyBaseline();
      setText(contentStatus, activeDiaryContentField instanceof HTMLTextAreaElement
        ? t('content_diary_synced', 'Diary entry content updated in this settings draft.')
        : t('content_draft_saved', 'Draft saved in this browser.'));
    });
  }

  if (contentPublish) {
    contentPublish.addEventListener('click', publishCampaignChanges);
  }

  function loadSupportersForCurrentFilters() {
    if (supporterFilterTimer) window.clearTimeout(supporterFilterTimer);
    supporterFilterTimer = 0;
    supporterCursor = 0;
    supporterNextCursor = null;
    loadSupporters({ append: false });
  }

  function scheduleSupporterFilterLoad(delay) {
    if (supporterFilterTimer) window.clearTimeout(supporterFilterTimer);
    supporterFilterTimer = window.setTimeout(loadSupportersForCurrentFilters, delay);
  }

  if (supporterFilters) {
    supporterFilters.addEventListener('submit', function(event) {
      event.preventDefault();
      loadSupportersForCurrentFilters();
    });
  }

  [supporterCampaign, supporterStatus, supporterFulfillment].forEach(function(control) {
    if (!control) return;
    control.addEventListener('change', function() {
      loadSupportersForCurrentFilters();
    });
  });

  if (supporterQuery) {
    supporterQuery.addEventListener('input', function() {
      scheduleSupporterFilterLoad(350);
    });
  }

  if (supportersExport) {
    supportersExport.addEventListener('click', exportVisibleSupportersCsv);
  }

  if (supportersNext) {
    supportersNext.addEventListener('click', function() {
      if (supporterNextCursor !== null) {
        loadSupporters({ append: true });
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async function() {
      try {
        await requestJson('/admin/logout', { method: 'POST', body: '{}' });
        currentUser = null;
        currentCsrf = '';
        showAuth('');
      } catch (error) {
        logger.error('Admin logout failed', error);
        setText(activeAdminStatus(), t('logout_failed', 'Unable to log out. Try refreshing the page.'));
      }
    });
  }

  renderContentBlocks();

  var loginToken = new URL(window.location.href).searchParams.get('admin_login');
  if (loginToken) {
    exchangeToken(loginToken);
  } else {
    loadSession();
  }
})();
