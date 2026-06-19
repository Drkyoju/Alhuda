/* Toasts, analytics, bottom nav, challenge leaderboard, service worker */
(function () {
  let toastTimer;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type) {
    let el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.className = 'app-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.className = 'app-toast ' + (type || 'info');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function trackEvent(name, data) {
    try {
      const log = JSON.parse(localStorage.getItem('analyticsLog') || '[]');
      log.push({ name, data: data || {}, at: new Date().toISOString() });
      localStorage.setItem('analyticsLog', JSON.stringify(log.slice(-200)));
    } catch (e) {}
  }

  function setBottomNavVisible(visible) {
    document.body.classList.toggle('has-bottom-nav', !!visible);
  }

  function setBottomNavActive(tab) {
    document.querySelectorAll('.mobile-bottom-nav [data-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === tab);
    });
  }

  function syncBottomNav(screenId) {
    const hide = [
      'login-screen', 'game', 'results', 'gameover', 'countdown-overlay', 'demo-intro',
      'review-screen', 'feedback-screen', 'challenge-leaderboard-screen', 'onboarding-overlay',
    ];
    const immersive = hide.includes(screenId);
    setBottomNavVisible(!immersive && !!state?.user);
    const map = {
      welcome: 'home',
      'leaderboard-screen': 'rank',
      'profile-screen': 'profile',
      'challenge-screen': 'challenge',
      'challenge-leaderboard-screen': 'challenge',
      admin: 'admin',
    };
    setBottomNavActive(map[screenId] || 'home');
  }

  function wrapShow() {
    if (show && show._enhanced) return; // already wrapped — nothing to do
    if (typeof show !== 'function') {
      // The global `show` function lives in index.html's inline script and
      // may not yet be defined if enhancements.js evaluated too early. Retry
      // once on the next microtask. Previously this path silently returned
      // and the bottom-nav / training-active toggling never worked for the
      // whole session.
      if (!wrapShow._retried) {
        wrapShow._retried = true;
        setTimeout(wrapShow, 0);
      }
      return;
    }
    const orig = show;
    show = function (id) {
      orig(id);
      syncBottomNav(id);
      if (id === 'game') {
        document.body.classList.toggle('training-active', !!window.trainingMode);
      } else {
        document.body.classList.remove('training-active');
      }
    };
    show._enhanced = true;
  }

  function loadChallengeLeaderboard(code) {
    const list = document.getElementById('ch-lb-list');
    const title = document.getElementById('ch-lb-code');
    if (!list) return;
    if (title) title.textContent = code || '—';
    list.innerHTML = '<p style="text-align:center;color:var(--text-soft);padding:16px;">جاري التحميل...</p>';
    show('challenge-leaderboard-screen');

    const localKey = 'ch_results_' + code;
    // Guard against corrupted localStorage entries — previously an uncaught
    // JSON.parse throw killed the whole leaderboard flow.
    let local = [];
    try {
      local = JSON.parse(localStorage.getItem(localKey) || '[]');
    } catch (e) {
      try { localStorage.removeItem(localKey); } catch (e2) {}
    }
    (async () => {
      let remote = [];
      try {
        const { data } = await db.from('challenge_results')
          .select('user_name,score,correct,total,created_at,user_id')
          .eq('code', code)
          .order('score', { ascending: false })
          .limit(50);
        remote = data || [];
      } catch (e) {}

      const merged = [...remote, ...local.map((r) => ({ ...r, user_name: r.name }))];
      const best = {};
      for (const r of merged) {
        const k = r.user_id || r.user_name || r.name || 'x';
        if (!best[k] || (r.score || 0) > (best[k].score || 0)) best[k] = r;
      }
      const ranked = Object.values(best).sort((a, b) => (b.score || 0) - (a.score || 0));

      if (!ranked.length) {
        list.innerHTML = '<p style="text-align:center;color:var(--text-soft);padding:24px;">لا توجد نتائج بعد. كن/ي أول/ة!</p>';
        return;
      }

      list.innerHTML = ranked.map((r, i) => {
        const isYou = state?.userName && (r.user_name === state.userName || r.name === state.userName);
        const name = escapeHtml(r.user_name || r.name || 'مجهول');
        return `<div class="ch-lb-row${isYou ? ' you' : ''}">
          <span class="ch-lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
          <span class="ch-lb-name">${name}${isYou ? ' (أنت)' : ''}</span>
          <span class="ch-lb-score">⭐${r.score || 0} <small style="opacity:0.7">(${r.correct || 0}/${r.total || 0})</small></span>
        </div>`;
      }).join('');
    })();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Version query MUST match CACHE in service-worker.js. When a worker
    // update is waiting, prompt it to take over on the NEXT page load by
    // sending SKIP_WAITING — avoids the previous "new JS, old HTML tab"
    // runtime error pattern from unconditional skipWaiting().
    navigator.serviceWorker.register('./service-worker.js?v=10').then((reg) => {
      // If a new SW is waiting, hand it control on the next reload.
      if (reg.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
      }
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && reg.waiting) {
            // Defer activation to the next navigation; current tab keeps the
            // currently-running JS/HTML pair consistent.
            reg.waiting.postMessage('SKIP_WAITING');
          }
        });
      });
    }).catch((err) => {
      // Was previously `.catch(() => {})` which made SW issues undebuggable.
      console.warn('[SW] registration failed:', err);
    });
  }

  function initEnhancements() {
    wrapShow();
    registerServiceWorker();
    // Idempotency guard: previously a second initEnhancements() call (e.g.,
    // from a deferred script) would wrap toggleTrainingMode again, double-
    // toggling the class.
    if (window._alhudaEnhancementsInited) return;
    window._alhudaEnhancementsInited = true;

    const origToggle = window.toggleTrainingMode;
    if (origToggle && !origToggle._enhanced) {
      const wrapped = function () {
        origToggle();
        document.body.classList.toggle('training-active', !!window.trainingMode);
      };
      wrapped._enhanced = true;
      window.toggleTrainingMode = wrapped;
    }
  }

  window.showToast = showToast;
  window.trackEvent = trackEvent;
  window.loadChallengeLeaderboard = loadChallengeLeaderboard;
  window.syncBottomNav = syncBottomNav;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnhancements);
  } else {
    initEnhancements();
  }
})();
