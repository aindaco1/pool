(function() {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-community-page-script]');
  if (!script) return;

  var dataset = script.dataset || {};
  var workerBase = dataset.workerBase || '';
  var campaignSlug = dataset.campaignSlug || '';
  var currentLang = dataset.currentLang || document.documentElement.lang || 'en';
  var cookieName = 'supporter_' + campaignSlug;
  var tokenStorageKey = 'supporter_token_' + campaignSlug;
  var userToken = null;
  var RESULT_BAR_WIDTH_CLASS_PREFIX = 'result-bar__fill--w-';
  var runtimeMessages = {};

  if (dataset.runtimeMessages) {
    try {
      runtimeMessages = JSON.parse(dataset.runtimeMessages);
    } catch (_error) {
      runtimeMessages = {};
    }
  }

  function getRuntimeMessage(path, fallback) {
    var parts = String(path || '').split('.');
    var value = runtimeMessages;
    for (var index = 0; index < parts.length; index += 1) {
      if (!value || typeof value !== 'object') return fallback;
      value = value[parts[index]];
    }
    return typeof value === 'string' && value ? value : fallback;
  }

  function formatRuntimeMessage(path, fallback, replacements) {
    var template = getRuntimeMessage(path, fallback);
    if (!replacements || typeof template !== 'string') return template;
    return template.replace(/%\{(\w+)\}/g, function(match, key) {
      if (!Object.prototype.hasOwnProperty.call(replacements, key)) return match;
      return String(replacements[key]);
    });
  }

  function formatVoteCount(count) {
    if (count === 1) {
      return formatRuntimeMessage('community.voteSingular', '%{count} vote', { count: count });
    }
    return formatRuntimeMessage('community.votePlural', '%{count} votes', { count: count });
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    var secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + value + '; expires=' + expires + '; path=/; SameSite=Lax' + secure;
  }

  function clearCookie(name) {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  }

  function readStoredToken() {
    try {
      return window.sessionStorage.getItem(tokenStorageKey);
    } catch (_error) {
      return null;
    }
  }

  function writeStoredToken(token) {
    if (!token) return;
    try {
      window.sessionStorage.setItem(tokenStorageKey, token);
    } catch (_error) {}
  }

  function clearStoredToken() {
    try {
      window.sessionStorage.removeItem(tokenStorageKey);
    } catch (_error) {}
  }

  function showContent() {
    var loading = document.getElementById('community-loading');
    var content = document.getElementById('community-content');
    if (loading) loading.hidden = true;
    if (content) content.hidden = false;
  }

  function showDenied() {
    clearCookie(cookieName);
    clearStoredToken();

    var loading = document.getElementById('community-loading');
    var denied = document.getElementById('community-denied');
    if (loading) loading.hidden = true;
    if (denied) denied.hidden = false;
  }

  function toast(message, isError) {
    var toastNode = document.createElement('div');
    toastNode.className = 'community-toast' + (isError ? ' community-toast--error' : '');
    toastNode.textContent = message;
    document.body.appendChild(toastNode);
    setTimeout(function() {
      toastNode.remove();
    }, 2500);
  }

  function applyResultBarWidth(fillNode, percent) {
    if (!fillNode) return;
    var clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    Array.from(fillNode.classList).forEach(function(className) {
      if (className.indexOf(RESULT_BAR_WIDTH_CLASS_PREFIX) === 0) {
        fillNode.classList.remove(className);
      }
    });
    fillNode.classList.add(RESULT_BAR_WIDTH_CLASS_PREFIX + clampedPercent);
  }

  function showResults(card, payload) {
    var votingView = card.querySelector('[data-view="voting"]');
    var resultsView = card.querySelector('[data-view="results"]');
    if (!votingView || !resultsView) return;

    var userChoice = payload.userChoice;
    var results = payload.results || {};
    var totalVotes = payload.totalVotes || 0;
    var bars = resultsView.querySelectorAll('.result-bar');
    bars.forEach(function(bar) {
      var option = bar.dataset.option;
      var count = results[option] || 0;
      var percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

      var percentNode = bar.querySelector('.result-bar__percent');
      var fillNode = bar.querySelector('.result-bar__fill');
      var countNode = bar.querySelector('.result-bar__count');

      if (percentNode) percentNode.textContent = percent + '%';
      applyResultBarWidth(fillNode, percent);
      if (countNode) countNode.textContent = formatVoteCount(count);

      if (option === userChoice) {
        bar.classList.add('result-bar--selected');
      }
    });

    var choiceNode = resultsView.querySelector('[data-user-choice]');
    var totalNode = resultsView.querySelector('[data-total-votes]');
    if (choiceNode) choiceNode.textContent = userChoice;
    var totalLabelNode = resultsView.querySelector('.decision-card__total');
    if (totalLabelNode) {
      totalLabelNode.textContent = formatRuntimeMessage('community.totalVotes', '%{count} total votes', {
        count: totalVotes
      });
    } else if (totalNode) {
      totalNode.textContent = String(totalVotes);
    }

    votingView.hidden = true;
    resultsView.hidden = false;
  }

  function showClosedResults(card, payload) {
    var resultsContainer = card.querySelector('.decision-closed__results');
    var results = payload.results;
    var totalVotes = payload.totalVotes || 0;
    if (!resultsContainer || !results) return;

    var winner = card.dataset.winner;
    var sortedOptions = Object.entries(results).sort(function(a, b) {
      return b[1] - a[1];
    });

    var wrapper = document.createElement('div');
    wrapper.className = 'closed-results';

    sortedOptions.forEach(function(entry) {
      var option = entry[0];
      var count = entry[1];
      var percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      var isWinner = option === winner;

      var row = document.createElement('div');
      row.className = 'closed-result' + (isWinner ? ' closed-result--winner' : '');

      var optionNode = document.createElement('span');
      optionNode.className = 'closed-result__option';
      optionNode.textContent = option;

      var statsNode = document.createElement('span');
      statsNode.className = 'closed-result__stats';
      statsNode.textContent = percent + '% (' + formatVoteCount(count) + ')';

      row.appendChild(optionNode);
      row.appendChild(statsNode);
      wrapper.appendChild(row);
    });

    var totalNode = document.createElement('div');
    totalNode.className = 'closed-results__total';
    totalNode.textContent = formatRuntimeMessage('community.totalVotes', '%{count} total votes', {
      count: totalVotes
    });
    wrapper.appendChild(totalNode);

    resultsContainer.replaceChildren(wrapper);
  }

  async function loadVoteStatus() {
    if (!userToken) return;

    var cards = document.querySelectorAll('.decision-card');
    var decisionIds = Array.from(cards).map(function(card) {
      return card.dataset.decisionId;
    }).join(',');

    if (!decisionIds) return;

    try {
      var response = await fetch(workerBase + '/votes?token=' + encodeURIComponent(userToken) + '&decisions=' + decisionIds);
      if (!response.ok) return;

      var data = await response.json();
      Object.entries(data.decisions || {}).forEach(function(entry) {
        var decisionId = entry[0];
        var status = entry[1];
        var card = document.querySelector('[data-decision-id="' + decisionId + '"]');
        if (!card) return;

        if (card.dataset.status === 'closed') {
          showClosedResults(card, status);
        } else if (status.hasVoted) {
          showResults(card, status);
        }
      });
    } catch (error) {
      console.error('Failed to load vote status:', error);
    }
  }

  async function verifyAccess() {
    var params = new URLSearchParams(window.location.search);

    if (params.get('dev') === '1' && window.location.hostname === '127.0.0.1') {
      console.log('[DEV] Setting supporter cookie for testing');
      setCookie(cookieName, 'verified', 90);
      userToken = 'dev-token-' + campaignSlug;
      writeStoredToken(userToken);
      window.history.replaceState({}, '', window.location.pathname);
      showContent();
      loadVoteStatus();
      return;
    }

    var token = params.get('t') || readStoredToken();
    if (!token) {
      showDenied();
      return;
    }

    try {
      console.log('[Community] Verifying token with:', workerBase + '/pledge?token=' + token.substring(0, 20) + '...');
      var response = await fetch(workerBase + '/pledge?token=' + encodeURIComponent(token));
      console.log('[Community] Response status:', response.status);
      if (!response.ok) {
        var errorText = await response.text();
        console.error('[Community] Verification failed:', errorText);
        showDenied();
        return;
      }

      var pledge = await response.json();
      console.log('[Community] Pledge data:', {
        campaignSlug: pledge.campaignSlug,
        status: pledge.pledgeStatus,
        expected: campaignSlug
      });

      if (pledge.campaignSlug !== campaignSlug) {
        console.error('[Community] Campaign mismatch:', pledge.campaignSlug, '!==', campaignSlug);
        showDenied();
        return;
      }

      if (pledge.pledgeStatus === 'cancelled') {
        console.error('[Community] Pledge is cancelled');
        showDenied();
        return;
      }

      userToken = token;
      setCookie(cookieName, 'verified', 90);
      writeStoredToken(token);

      if (params.get('t')) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      showContent();
      loadVoteStatus();
    } catch (error) {
      console.error('Verification error:', error);
      showDenied();
    }
  }

  document.addEventListener('click', async function(event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-action="submit-vote"]') : null;
    if (!button) return;

    var decisionId = button.dataset.decision;
    var card = button.closest('.decision-card');
    var selected = document.querySelector('input[name="decision-' + decisionId + '"]:checked');

    if (!selected) {
      toast(getRuntimeMessage('community.selectOptionFirst', 'Please select an option first.'), true);
      return;
    }

    button.disabled = true;
    button.textContent = getRuntimeMessage('community.submittingVote', 'Submitting...');

    try {
      var response = await fetch(workerBase + '/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: userToken,
          decisionId: decisionId,
          option: selected.value
        })
      });

      var data = await response.json();
      if (!response.ok) {
        if (data.userChoice) {
          toast(formatRuntimeMessage('community.alreadyVotedFor', 'You already voted for "%{choice}".', {
            choice: data.userChoice
          }));
          showResults(card, { userChoice: data.userChoice, results: {}, totalVotes: 0 });
        } else {
          toast(data.error || getRuntimeMessage('community.failedToSubmitVote', 'Failed to submit vote'), true);
          button.disabled = false;
          button.textContent = getRuntimeMessage('community.submitVote', 'Submit Vote');
        }
        return;
      }

      toast(formatRuntimeMessage('community.voteSubmittedFor', 'Vote submitted for "%{choice}". Thanks!', {
        choice: data.userChoice
      }));
      showResults(card, data);
    } catch (error) {
      console.error('Vote error:', error);
      toast(getRuntimeMessage('community.failedToSubmitVote', 'Failed to submit vote'), true);
      button.disabled = false;
      button.textContent = getRuntimeMessage('community.submitVote', 'Submit Vote');
    }
  });

  verifyAccess();
})();
