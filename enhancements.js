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
    if (typeof show !== 'function' || show._enhanced) return;
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

  async function loadChallengeLeaderboard(code) {
    const list = document.getElementById('ch-lb-list');
    const title = document.getElementById('ch-lb-code');
    if (!list) return;
    if (title) title.textContent = code || '—';
    list.innerHTML = '<p style="text-align:center;color:var(--text-soft);padding:16px;">جاري التحميل...</p>';
    show('challenge-leaderboard-screen');

    const localKey = 'ch_results_' + code;
    const local = JSON.parse(localStorage.getItem(localKey) || '[]');
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
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./service-worker.js?v=8').catch(() => {});
  }

  function initEnhancements() {
    wrapShow();
    registerServiceWorker();
    const origToggle = window.toggleTrainingMode;
    if (origToggle) {
      window.toggleTrainingMode = function () {
        origToggle();
        document.body.classList.toggle('training-active', !!window.trainingMode);
      };
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
