(function(global) {
  'use strict';

  global.PoolAdminSettingsReview = {
    create: function(context) {
      var appendDescribedBy = context.appendDescribedBy;
      var appendTableHeader = context.appendTableHeader;
      var createProductLabelRow = context.createProductLabelRow;
      var downloadBlobResult = context.downloadBlobResult;
      var formatNumber = context.formatNumber;
      var getCampaigns = context.getCampaigns;
      var lang = context.lang;
      var logger = context.logger;
      var requestBlob = context.requestBlob;
      var requestJson = context.requestJson;
      var setText = context.setText;
      var t = context.t;

      function formatAdminDate(value) {
        var parsed = new Date(String(value || ''));
        return Number.isNaN(parsed.getTime())
          ? t('admin_value_unavailable', 'Unavailable')
          : parsed.toLocaleString(lang || 'en');
      }

      function createReviewTable(captionText, headers) {
        var wrap = document.createElement('div');
        wrap.className = 'admin-settings-review__table-wrap';
        var table = document.createElement('table');
        table.className = 'admin-settings-review__table';
        var caption = document.createElement('caption');
        caption.className = 'sr-only';
        caption.textContent = captionText;
        var thead = document.createElement('thead');
        var headerRow = document.createElement('tr');
        appendTableHeader(headerRow, headers);
        thead.append(headerRow);
        var body = document.createElement('tbody');
        table.append(caption, thead, body);
        wrap.append(table);
        return { wrap: wrap, body: body, headers: headers };
      }

      function appendCells(reviewTable, row, values) {
        values.forEach(function(value, index) {
          var cell = document.createElement('td');
          cell.dataset.label = reviewTable.headers[index] || '';
          cell.textContent = value;
          row.append(cell);
        });
      }

      function sessionClientLabel(session) {
        var client = session?.client || {};
        return [client.browser, client.operatingSystem, client.device].filter(Boolean).join(' / ') ||
          t('admin_value_unavailable', 'Unavailable');
      }

      function renderSessions(root, data) {
        var results = root.querySelector('[data-admin-session-results]');
        if (!results) return;
        results.replaceChildren();
        var active = Array.isArray(data?.active) ? data.active : [];
        var recent = Array.isArray(data?.recent) ? data.recent : [];
        var summary = document.createElement('p');
        summary.className = 'admin-app__muted';
        summary.textContent = t('admin_sessions_summary', '%{count} active sessions. Login metadata is retained for %{days} days without full IP addresses, full user agents, or precise location.', {
          count: formatNumber(active.length),
          days: formatNumber(data?.retentionDays || 30)
        });
        var revokeHelp = document.createElement('p');
        revokeHelp.className = 'admin-app__muted';
        revokeHelp.textContent = t('admin_sessions_revoke_help', 'The current session stays protected. Revoke any other active session you do not recognize.');
        results.append(summary, revokeHelp);

        var activeHeading = document.createElement('h4');
        activeHeading.textContent = t('admin_sessions_active_title', 'Active sessions');
        results.append(activeHeading);
        if (!active.length) {
          var emptyActive = document.createElement('p');
          emptyActive.className = 'admin-app__muted';
          emptyActive.textContent = t('admin_sessions_none_active', 'No active sessions.');
          results.append(emptyActive);
        } else {
          var activeTable = createReviewTable(t('admin_sessions_active_caption', 'Active administrator sessions'), [
            t('admin_sessions_admin', 'Admin'),
            t('admin_sessions_client', 'Client'),
            t('admin_sessions_started', 'Started'),
            t('admin_sessions_expires', 'Expires'),
            t('admin_sessions_action', 'Action')
          ]);
          active.forEach(function(session) {
            var row = document.createElement('tr');
            appendCells(activeTable, row, [
              session.email || t('admin_value_unknown', 'Unknown'),
              sessionClientLabel(session),
              formatAdminDate(session.createdAt),
              formatAdminDate(session.expiresAt)
            ]);
            var actionCell = document.createElement('td');
            actionCell.dataset.label = activeTable.headers[4];
            if (session.current) {
              var current = document.createElement('span');
              current.className = 'admin-app__muted';
              current.textContent = t('admin_sessions_current', 'Current session');
              actionCell.append(current);
            } else {
              var revoke = document.createElement('button');
              revoke.type = 'button';
              revoke.className = 'btn btn--secondary btn--small';
              revoke.textContent = t('admin_sessions_revoke', 'Revoke');
              revoke.addEventListener('click', async function() {
                if (!global.confirm(t('admin_sessions_revoke_confirm', 'Revoke this administrator session?'))) return;
                var status = root.querySelector('[data-admin-session-status]');
                revoke.disabled = true;
                setText(status, t('admin_sessions_revoking', 'Revoking session...'));
                try {
                  await requestJson('/admin/sessions/revoke', {
                    method: 'POST',
                    body: JSON.stringify({ id: session.id })
                  });
                  setText(status, t('admin_sessions_revoked', 'Session revoked.'));
                  root.dataset.adminSessionState = '';
                  await loadSessionReview(root, { force: true, preserveStatus: true });
                } catch (error) {
                  logger.error('Failed to revoke admin session', error);
                  setText(status, t('admin_sessions_revoke_failed', 'Unable to revoke the session.'));
                  revoke.disabled = false;
                }
              });
              actionCell.append(revoke);
            }
            row.append(actionCell);
            activeTable.body.append(row);
          });
          results.append(activeTable.wrap);
        }

        var recentHeading = document.createElement('h4');
        recentHeading.textContent = t('admin_sessions_recent_title', 'Recent logins');
        results.append(recentHeading);
        if (!recent.length) {
          var emptyRecent = document.createElement('p');
          emptyRecent.className = 'admin-app__muted';
          emptyRecent.textContent = t('admin_sessions_none_recent', 'No recent logins.');
          results.append(emptyRecent);
          return;
        }
        var recentTable = createReviewTable(t('admin_sessions_recent_caption', 'Recent administrator logins'), [
          t('admin_sessions_admin', 'Admin'),
          t('admin_sessions_client', 'Client'),
          t('admin_sessions_network_id', 'Network ID'),
          t('admin_sessions_started', 'Started'),
          t('admin_sessions_state', 'State')
        ]);
        recent.slice(0, 100).forEach(function(session) {
          var row = document.createElement('tr');
          appendCells(recentTable, row, [
            session.email || t('admin_value_unknown', 'Unknown'),
            sessionClientLabel(session),
            session.networkId || t('admin_value_unavailable', 'Unavailable'),
            formatAdminDate(session.createdAt),
            session.active ? t('admin_sessions_active_state', 'Active') : t('admin_sessions_inactive_state', 'Inactive')
          ]);
          recentTable.body.append(row);
        });
        results.append(recentTable.wrap);
      }

      async function loadSessionReview(root, options) {
        if (!(root instanceof HTMLElement)) return;
        var force = options?.force === true;
        if (!force && ['loading', 'loaded'].includes(root.dataset.adminSessionState || '')) return;
        var status = root.querySelector('[data-admin-session-status]');
        root.dataset.adminSessionState = 'loading';
        if (!options?.preserveStatus) setText(status, t('admin_sessions_loading', 'Loading admin sessions...'));
        try {
          renderSessions(root, await requestJson('/admin/sessions', { method: 'GET' }));
          root.dataset.adminSessionState = 'loaded';
          if (!options?.preserveStatus) setText(status, '');
        } catch (error) {
          logger.error('Failed to load admin sessions', error);
          root.dataset.adminSessionState = 'failed';
          setText(status, t('admin_sessions_load_failed', 'Unable to load admin sessions.'));
        }
      }

      function createSessionReview() {
        var root = document.createElement('div');
        root.className = 'admin-session-review';
        root.dataset.adminSessionReview = 'true';
        var actions = document.createElement('div');
        actions.className = 'admin-settings-review__actions';
        var refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'btn btn--secondary btn--small';
        refresh.textContent = t('admin_sessions_refresh', 'Refresh sessions');
        refresh.addEventListener('click', function() { loadSessionReview(root, { force: true }); });
        actions.append(refresh);
        var status = document.createElement('p');
        status.className = 'admin-dashboard__status';
        status.dataset.adminSessionStatus = 'true';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        var results = document.createElement('div');
        results.className = 'admin-session-review__results';
        results.dataset.adminSessionResults = 'true';
        root.append(actions, status, results);
        return root;
      }

      function auditQuery(root) {
        var params = new URLSearchParams();
        ['date', 'action', 'email', 'campaignSlug', 'q'].forEach(function(name) {
          var value = String(root.querySelector('[name="' + name + '"]')?.value || '').trim();
          if (value) params.set(name, value);
        });
        return params.toString();
      }

      function identifierLabel(value) {
        var readable = String(value || '').trim().replace(/[:_-]+/g, ' ').replace(/\s+/g, ' ').trim();
        return readable ? readable.charAt(0).toLocaleUpperCase(lang || 'en') + readable.slice(1) : '';
      }

      var actionDefinitions = [
        ['abandoned_checkout_suppression_set', 'admin_audit_action_abandoned_checkout_suppression_set', 'Abandoned checkout emails paused'],
        ['abandoned_checkout_suppression_cleared', 'admin_audit_action_abandoned_checkout_suppression_cleared', 'Abandoned checkout emails resumed'],
        ['admin_session:revoke', 'admin_audit_action_admin_session_revoke', 'Administrator session revoked'],
        ['campaign:archive', 'admin_audit_action_campaign_archive', 'Campaign archived'],
        ['campaign:create_new', 'admin_audit_action_campaign_create_new', 'Campaign created'],
        ['campaign:publish_content', 'admin_audit_action_campaign_publish_content', 'Campaign content published'],
        ['campaign:publish_preview', 'admin_audit_action_campaign_publish_preview', 'Campaign preview published'],
        ['film_stripe_summary_adapter:read', 'admin_audit_action_film_stripe_summary_read', 'Film Stripe summary viewed'],
        ['marketing_announcement_send', 'admin_audit_action_marketing_announcement_send', 'Campaign announcement sent'],
        ['media:optimize', 'admin_audit_action_media_optimize', 'Media optimization started'],
        ['payment:reconcile', 'admin_audit_action_payment_reconcile', 'Campaign payments reconciled'],
        ['platform_inventory:manage', 'admin_audit_action_platform_inventory_manage', 'Platform add-on inventory updated'],
        ['settings:publish', 'admin_audit_action_settings_publish', 'Platform settings published']
      ];

      function campaignName(campaignSlug) {
        var campaign = getCampaigns().find(function(item) { return String(item?.slug || '') === campaignSlug; });
        var configuredTitle = String(campaign?.title || '').trim();
        var syntheticIdentity = [campaignSlug, configuredTitle].find(function(value) {
          return /(?:^|-)local-no-user(?:-\d{10,})?$/.test(String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-'));
        });
        if (syntheticIdentity) return t('admin_audit_target_local_test_campaign_unassigned', 'Local test campaign (unassigned)');
        if (configuredTitle) return configuredTitle;
        var stableSlug = String(campaignSlug || '').replace(/[-_]\d{10,}$/, '');
        return identifierLabel(stableSlug || campaignSlug);
      }

      function auditTarget(event) {
        var campaignSlug = String(event.campaignSlug || '').trim();
        if (campaignSlug) return {
          label: t('admin_audit_target_campaign', 'Campaign: %{name}', { name: campaignName(campaignSlug) }),
          raw: campaignSlug,
          rawLabel: 'campaign=' + campaignSlug
        };
        var orderId = String(event.orderId || '').trim();
        if (orderId) return {
          label: t('admin_audit_target_order', 'Order: %{id}', { id: orderId }),
          raw: orderId,
          rawLabel: 'order=' + orderId
        };
        var productId = String(event.productId || '').trim();
        if (productId) return {
          label: t('admin_audit_target_product', 'Product: %{name}', { name: identifierLabel(productId) }),
          raw: productId,
          rawLabel: 'product=' + productId
        };
        var actionTargets = {
          'admin_session:revoke': ['admin_audit_target_admin_sessions', 'Administrator sessions'],
          'media:optimize': ['admin_audit_target_media_library', 'Media library'],
          'platform_inventory:manage': ['admin_audit_target_platform_add_ons', 'Platform add-ons'],
          'settings:publish': ['admin_audit_target_platform_settings', 'Platform settings']
        };
        var actionTarget = actionTargets[String(event.action || '').trim().toLowerCase()];
        if (actionTarget) return { label: t(actionTarget[0], actionTarget[1]), raw: '', rawLabel: '' };
        var source = String(event.source || '').trim();
        if (source) {
          var knownSources = {
            dashboard: ['admin_audit_target_admin_dashboard', 'Admin dashboard'],
            pool: ['admin_audit_target_pool_platform', 'The Pool platform'],
            stripe: ['admin_audit_target_stripe', 'Stripe'],
            system: ['admin_audit_target_system', 'System']
          };
          var knownSource = knownSources[source.toLowerCase()];
          return {
            label: knownSource ? t(knownSource[0], knownSource[1]) : t('admin_audit_target_source', 'Source: %{name}', { name: identifierLabel(source) }),
            raw: source,
            rawLabel: 'source=' + source
          };
        }
        return { label: t('admin_audit_target_platform_wide', 'Platform-wide'), raw: '', rawLabel: '' };
      }

      function auditStatus(event) {
        var rawStatus = String(event.status || '').trim();
        var statuses = {
          active: ['admin_audit_status_active', 'Active'],
          available: ['admin_audit_status_available', 'Summary data available'],
          empty: ['admin_audit_status_empty', 'No matching summary data'],
          failed: ['admin_audit_status_failed', 'Failed'],
          inactive: ['admin_audit_status_inactive', 'Inactive'],
          ok: ['admin_audit_status_completed', 'Completed'],
          open: ['admin_audit_status_open', 'Open'],
          published: ['admin_audit_status_published', 'Published'],
          resolved: ['admin_audit_status_resolved', 'Resolved'],
          running: ['admin_audit_status_running', 'In progress'],
          started: ['admin_audit_status_started', 'Started'],
          succeeded: ['admin_audit_status_succeeded', 'Succeeded']
        };
        var fields = {
          content: ['admin_audit_field_content', 'Content'], description: ['admin_audit_field_description', 'Description'],
          email: ['admin_audit_field_email', 'Email'], goal: ['admin_audit_field_goal', 'Goal'],
          image: ['admin_audit_field_image', 'Image'], inventory: ['admin_audit_field_inventory', 'Inventory'],
          permissions: ['admin_audit_field_permissions', 'Permissions'], pricing: ['admin_audit_field_pricing', 'Pricing'],
          role: ['admin_audit_field_role', 'Role'], shipping: ['admin_audit_field_shipping', 'Shipping'],
          state: ['admin_audit_field_state', 'State'], status: ['admin_audit_field_status', 'Status'],
          tiers: ['admin_audit_field_tiers', 'Tiers'], title: ['admin_audit_field_title', 'Title']
        };
        var parts = [];
        if (rawStatus) {
          var knownStatus = statuses[rawStatus.toLowerCase()];
          parts.push(knownStatus ? t(knownStatus[0], knownStatus[1]) : identifierLabel(rawStatus));
        }
        var changed = (Array.isArray(event.changedFields) ? event.changedFields : []).map(function(field) {
          var rawField = String(field || '').trim();
          var knownField = fields[rawField.toLowerCase()];
          return knownField ? t(knownField[0], knownField[1]) : identifierLabel(rawField);
        }).filter(Boolean);
        if (changed.length) parts.push(t('admin_audit_status_fields_changed', 'Fields changed: %{fields}', { fields: changed.join(', ') }));
        return parts.join(' · ') || t('admin_audit_status_none', 'No additional details');
      }

      function actionLabel(action) {
        var rawAction = String(action || '').trim();
        if (!rawAction) return t('admin_value_unknown', 'Unknown');
        var known = actionDefinitions.find(function(definition) { return definition[0] === rawAction.toLowerCase(); });
        return known ? t(known[1], known[2]) : (identifierLabel(rawAction) || rawAction);
      }

      function renderAuditRows(root, data) {
        var results = root.querySelector('[data-admin-audit-results]');
        if (!results) return;
        results.replaceChildren();
        var rows = Array.isArray(data?.rows) ? data.rows : [];
        var matched = Number(data?.page?.matched ?? rows.length);
        var summary = document.createElement('p');
        summary.className = 'admin-app__muted';
        summary.textContent = t('admin_audit_summary', '%{count} matching events. Sensitive event payloads are excluded.', { count: formatNumber(matched) });
        results.append(summary);
        var statusHelp = createProductLabelRow(
          t('admin_audit_status', 'Status / changes'),
          t('admin_audit_status_help', 'Status / changes reports an event\'s outcome and any fields it changed. No additional details means the event did not report either.'),
          'admin-audit-status'
        );
        statusHelp.row.classList.add('admin-settings__label');
        results.append(statusHelp.row);
        if (data?.page?.truncated || Number(data?.page?.returned || 0) < matched) {
          var truncated = document.createElement('p');
          truncated.className = 'admin-app__muted';
          truncated.textContent = t('admin_audit_truncated', 'The table shows a limited result set. Export the filtered CSV for all available matching events.');
          results.append(truncated);
        }
        if (!rows.length) {
          var empty = document.createElement('p');
          empty.className = 'admin-app__muted';
          empty.textContent = t('admin_audit_empty', 'No matching audit events.');
          results.append(empty);
          return;
        }
        var auditTable = createReviewTable(t('admin_audit_caption', 'Administrator audit events'), [
          t('admin_audit_time', 'Time'), t('admin_audit_action', 'Action'), t('admin_audit_admin', 'Admin'),
          t('admin_audit_target', 'Target'), t('admin_audit_status', 'Status / changes')
        ]);
        rows.forEach(function(event) {
          var row = document.createElement('tr');
          var rawAction = String(event.action || '').trim();
          var target = auditTarget(event);
          appendCells(auditTable, row, [
            formatAdminDate(event.createdAt), actionLabel(rawAction),
            event.adminEmail || t('admin_audit_system', 'System'), target.label, auditStatus(event)
          ]);
          var actionCell = row.children[1];
          if (rawAction && actionCell instanceof HTMLElement) {
            actionCell.dataset.rawAction = rawAction;
            actionCell.title = t('admin_audit_action_internal_title', 'Internal action: %{action}', { action: rawAction });
          }
          var targetCell = row.children[3];
          if (target.raw && targetCell instanceof HTMLElement) {
            targetCell.dataset.rawTarget = target.raw;
            targetCell.title = t('admin_audit_target_internal_title', 'Internal target: %{target}', { target: target.rawLabel });
          }
          auditTable.body.append(row);
        });
        results.append(auditTable.wrap);
      }

      async function loadAuditReview(root) {
        if (!(root instanceof HTMLElement)) return;
        var status = root.querySelector('[data-admin-audit-status]');
        setText(status, t('admin_audit_loading', 'Loading audit events...'));
        try {
          var query = auditQuery(root);
          renderAuditRows(root, await requestJson('/admin/audit' + (query ? '?' + query : ''), { method: 'GET' }));
          setText(status, '');
          root.dataset.adminAuditState = 'loaded';
        } catch (error) {
          logger.error('Failed to load audit events', error);
          setText(status, t('admin_audit_load_failed', 'Unable to load audit events.'));
          root.dataset.adminAuditState = 'failed';
        }
      }

      async function downloadAuditCsv(root) {
        var status = root.querySelector('[data-admin-audit-status]');
        setText(status, t('admin_audit_exporting', 'Preparing audit CSV...'));
        try {
          var query = auditQuery(root);
          await downloadBlobResult(
            await requestBlob(
              '/admin/audit.csv' + (query ? '?' + query : ''),
              { method: 'GET' }
            ),
            'pool-admin-audit.csv'
          );
          setText(status, t('admin_audit_export_started', 'Audit CSV download started.'));
        } catch (error) {
          logger.error('Failed to download audit CSV', error);
          setText(status, t('admin_audit_export_failed', 'Unable to download the audit CSV.'));
        }
      }

      function createAuditReview() {
        var root = document.createElement('div');
        root.className = 'admin-audit-review';
        root.dataset.adminAuditReview = 'true';
        var form = document.createElement('form');
        form.className = 'admin-audit-review__filters';
        [
          { name: 'date', label: t('admin_audit_filter_date', 'Date'), type: 'date', help: t('admin_audit_filter_date_help', 'Show events recorded on one calendar date.') },
          { name: 'action', label: t('admin_audit_filter_action', 'Action'), type: 'action-select', help: t('admin_audit_filter_action_help', 'Choose the kind of administrator activity to review.') },
          { name: 'email', label: t('admin_audit_filter_email', 'Admin email'), type: 'email', placeholder: t('admin_audit_filter_email_placeholder', 'admin@example.com'), help: t('admin_audit_filter_email_help', 'Enter the complete email address for one administrator.') },
          { name: 'campaignSlug', label: t('admin_audit_filter_campaign', 'Campaign'), type: 'campaign-select', help: t('admin_audit_filter_campaign_help', 'Choose one campaign, or leave this set to all campaigns.') },
          { name: 'q', label: t('admin_audit_filter_search', 'Search'), type: 'search', placeholder: t('admin_audit_filter_search_placeholder', 'Target, status, or changed field'), help: t('admin_audit_filter_search_help', 'Search stored targets, outcomes, and changed-field names.') }
        ].forEach(function(field) {
          var wrapper = document.createElement('div');
          wrapper.className = 'admin-audit-review__field';
          var id = 'admin-audit-' + field.name;
          var labelRow = createProductLabelRow(field.label, field.help, id, { htmlFor: id });
          var control;
          if (field.type === 'action-select' || field.type === 'campaign-select') {
            control = document.createElement('select');
            var allOption = document.createElement('option');
            allOption.value = '';
            allOption.textContent = field.type === 'action-select'
              ? t('admin_audit_filter_all_actions', 'All actions')
              : t('admin_audit_filter_all_campaigns', 'All campaigns');
            control.append(allOption);
            if (field.type === 'action-select') {
              actionDefinitions.forEach(function(definition) {
                var option = document.createElement('option');
                option.value = definition[0];
                option.textContent = t(definition[1], definition[2]);
                control.append(option);
              });
            } else {
              getCampaigns().forEach(function(campaign) {
                var slug = String(campaign?.slug || '').trim();
                if (!slug) return;
                var option = document.createElement('option');
                option.value = slug;
                option.textContent = campaignName(slug);
                control.append(option);
              });
            }
          } else {
            control = document.createElement('input');
            control.type = field.type;
            control.autocomplete = 'off';
            if (field.placeholder) control.placeholder = field.placeholder;
          }
          control.id = id;
          control.name = field.name;
          control.className = 'admin-settings__input';
          appendDescribedBy(control, labelRow.helpId);
          wrapper.append(labelRow.row, control);
          form.append(wrapper);
        });
        var apply = document.createElement('button');
        apply.type = 'submit';
        apply.className = 'btn btn--secondary btn--small';
        apply.textContent = t('admin_audit_apply_filters', 'Apply filters');
        form.append(apply);
        form.addEventListener('submit', function(event) {
          event.preventDefault();
          loadAuditReview(root);
        });
        var actions = document.createElement('div');
        actions.className = 'admin-settings-review__actions';
        var exportButton = document.createElement('button');
        exportButton.type = 'button';
        exportButton.className = 'btn btn--secondary btn--small';
        exportButton.textContent = t('admin_audit_export', 'Export filtered CSV');
        exportButton.addEventListener('click', function() { downloadAuditCsv(root); });
        actions.append(exportButton);
        var status = document.createElement('p');
        status.className = 'admin-dashboard__status';
        status.dataset.adminAuditStatus = 'true';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        var results = document.createElement('div');
        results.className = 'admin-audit-review__results';
        results.dataset.adminAuditResults = 'true';
        root.append(form, actions, status, results);
        return root;
      }

      return {
        createAuditReview: createAuditReview,
        createSessionReview: createSessionReview,
        loadAuditReview: loadAuditReview,
        loadSessionReview: loadSessionReview
      };
    }
  };
})(window);
