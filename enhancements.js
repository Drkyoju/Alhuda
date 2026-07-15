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

  function showToast(message, type, opts) {
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
    el.style.cursor = opts?.onClick ? 'pointer' : '';
    el.onclick = typeof opts?.onClick === 'function' ? opts.onClick : null;
    clearTimeout(toastTimer);
    const ms = opts?.duration || (opts?.onClick ? 8000 : 3200);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      el.onclick = null;
      el.style.cursor = '';
    }, ms);
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
      'review-screen', 'feedback-screen', 'onboarding-overlay', 'game-tutorial-overlay', 'levels-preview-screen',
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
    const swVer = window.ALHUDA_ASSETS?.sw || 39;
    const isAutomation = !!navigator.webdriver;
    let pendingReg = null;
    let refreshing = false;
    let userRequestedUpdate = false;
    const activateWaiting = () => {
      if (pendingReg?.waiting) pendingReg.waiting.postMessage('SKIP_WAITING');
    };
    const promptUpdate = () => {
      if (!pendingReg?.waiting) return;
      showToast('تحديث متاح — اضغط للتطبيق الآن', 'info', {
        duration: 15000,
        onClick: () => {
          userRequestedUpdate = true;
          activateWaiting();
          showToast('جاري تطبيق التحديث...', 'ok', { duration: 4000 });
        },
      });
    };
    // Only reload when the user tapped the update toast (never auto-reload — breaks smoke).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!userRequestedUpdate || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    window.addEventListener('pagehide', activateWaiting);
    navigator.serviceWorker.register(`./service-worker.js?v=${swVer}`).then((reg) => {
      pendingReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller && reg.waiting) {
            promptUpdate();
          }
        });
      });
      try { reg.update(); } catch (e) {}
    }).catch((err) => {
      console.warn('[SW] registration failed:', err);
    });

    // Stale-cache detector: if network version.js is newer, prompt (don't auto-reload in tests).
    if (!isAutomation) {
      void (async () => {
        try {
          const res = await fetch(`./version.js?_=${Date.now()}`, { cache: 'no-store' });
          const text = await res.text();
          const m = text.match(/cache:\s*'([^']+)'/);
          const live = m?.[1];
          const local = window.ALHUDA_ASSETS?.cache;
          if (!live || !local || live === local) return;
          showToast('نسخة أحدث متاحة — اضغط للتحديث', 'info', {
            duration: 20000,
            onClick: async () => {
              userRequestedUpdate = true;
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const r of regs) {
                if (r.waiting) r.waiting.postMessage('SKIP_WAITING');
              }
              if (window.caches) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
              window.location.reload();
            },
          });
        } catch (e) {}
      })();
    }
  }

  function initKidsUI() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.ans-btn');
      if (!btn || btn.disabled) return;
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--rx', ((e.clientX - rect.left) / rect.width * 100) + '%');
      btn.style.setProperty('--ry', ((e.clientY - rect.top) / rect.height * 100) + '%');
      btn.classList.remove('kid-ripple');
      void btn.offsetWidth;
      btn.classList.add('kid-ripple');
    }, { passive: true });

    if (typeof updateScore === 'function' && !updateScore._kids) {
      const origScore = updateScore;
      updateScore = function () {
        origScore();
        const badge = document.querySelector('.score-badge');
        if (badge) {
          badge.classList.remove('score-pop');
          void badge.offsetWidth;
          badge.classList.add('score-pop');
        }
      };
      updateScore._kids = true;
    }
  }

  function initPwaInstall() {
    const banner = document.getElementById('pwa-install-banner');
    const btn = document.getElementById('pwa-install-btn');
    const dismiss = document.getElementById('pwa-install-dismiss');
    if (!banner || !btn) return;
    if (localStorage.getItem('pwaInstallDismissed')) return;
    let deferred;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      banner.hidden = false;
    });
    btn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice.catch(() => ({}));
      banner.hidden = true;
      deferred = null;
    });
    dismiss?.addEventListener('click', () => {
      banner.hidden = true;
      localStorage.setItem('pwaInstallDismissed', '1');
    });
  }

  function initOfflineBanner() {
    const el = document.getElementById('offline-banner');
    if (!el) return;
    let toasted = false;
    const sync = () => {
      const off = !navigator.onLine;
      el.hidden = !off;
      if (off && !toasted && typeof showToast === 'function') {
        showToast('لا يوجد اتصال — الصوت والتلاوة تحتاج نت', 'err');
        toasted = true;
      }
      if (!off) toasted = false;
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
  }

  function initEnhancements() {
    wrapShow();
    registerServiceWorker();
    initPwaInstall();
    initKidsUI();
    initOfflineBanner();
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
