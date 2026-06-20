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
      'review-screen', 'feedback-screen', 'onboarding-overlay',
    ];
    const immersive = hide.includes(screenId);
    setBottomNavVisible(!immersive && !!state?.user);
    const map = {
      welcome: 'home',
      'leaderboard-screen': 'rank',
      'profile-screen': 'profile',
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

  function loadChallengeLeaderboard() {
    if (typeof showLeaderboard === 'function') showLeaderboard();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Version query MUST match CACHE in service-worker.js. When a worker
    // update is waiting, prompt it to take over on the NEXT page load by
    // sending SKIP_WAITING — avoids the previous "new JS, old HTML tab"
    // runtime error pattern from unconditional skipWaiting().
    navigator.serviceWorker.register('./service-worker.js?v=14').then((reg) => {
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
