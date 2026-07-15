/**
 * Orange cat mascot — Duolingo-style companion.
 * Idle wander + look at answers; happy on correct, sad on wrong.
 */
(function initAlhudaCat() {
  const REDUCE = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  function ensureDom() {
    let root = document.getElementById('alhuda-cat');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'alhuda-cat';
    root.className = 'alhuda-cat mood-idle pos-br';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="alhuda-cat-bounce">
        <div class="alhuda-cat-face">
          <svg class="alhuda-cat-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" focusable="false">
            <!-- ears -->
            <path class="cat-ear cat-ear-l" d="M28 42 L18 12 L48 32 Z" fill="#F97316"/>
            <path class="cat-ear-inner cat-ear-l" d="M30 38 L24 20 L44 32 Z" fill="#FDBA74"/>
            <path class="cat-ear cat-ear-r" d="M92 42 L102 12 L72 32 Z" fill="#EA580C"/>
            <path class="cat-ear-inner cat-ear-r" d="M90 38 L96 20 L76 32 Z" fill="#FDBA74"/>
            <!-- head -->
            <ellipse cx="60" cy="58" rx="38" ry="34" fill="#FB923C"/>
            <ellipse cx="60" cy="62" rx="30" ry="26" fill="#FDBA74" opacity="0.35"/>
            <!-- cheeks -->
            <circle class="cat-cheek" cx="32" cy="68" r="7" fill="#FB7185" opacity="0.45"/>
            <circle class="cat-cheek" cx="88" cy="68" r="7" fill="#FB7185" opacity="0.45"/>
            <!-- eyes group (moves for look) -->
            <g class="cat-eyes">
              <ellipse class="cat-eye cat-eye-l" cx="44" cy="54" rx="7" ry="9" fill="#163828"/>
              <ellipse class="cat-eye cat-eye-r" cx="76" cy="54" rx="7" ry="9" fill="#163828"/>
              <circle class="cat-shine" cx="41" cy="50" r="2.2" fill="#fff"/>
              <circle class="cat-shine" cx="73" cy="50" r="2.2" fill="#fff"/>
              <!-- happy crescents (hidden by default) -->
              <path class="cat-eye-happy cat-eye-happy-l" d="M37 54 Q44 46 51 54" fill="none" stroke="#163828" stroke-width="3.5" stroke-linecap="round"/>
              <path class="cat-eye-happy cat-eye-happy-r" d="M69 54 Q76 46 83 54" fill="none" stroke="#163828" stroke-width="3.5" stroke-linecap="round"/>
              <!-- sad eyes -->
              <path class="cat-eye-sad cat-eye-sad-l" d="M37 50 Q44 58 51 50" fill="none" stroke="#163828" stroke-width="3.2" stroke-linecap="round"/>
              <path class="cat-eye-sad cat-eye-sad-r" d="M69 50 Q76 58 83 50" fill="none" stroke="#163828" stroke-width="3.2" stroke-linecap="round"/>
            </g>
            <!-- nose -->
            <ellipse cx="60" cy="68" rx="5" ry="3.5" fill="#EA580C"/>
            <!-- mouth variants -->
            <path class="cat-mouth cat-mouth-neutral" d="M52 78 Q60 82 68 78" fill="none" stroke="#9A3412" stroke-width="2.4" stroke-linecap="round"/>
            <path class="cat-mouth cat-mouth-smile" d="M46 76 Q60 92 74 76" fill="none" stroke="#9A3412" stroke-width="2.8" stroke-linecap="round"/>
            <path class="cat-mouth cat-mouth-sad" d="M48 84 Q60 74 72 84" fill="none" stroke="#9A3412" stroke-width="2.6" stroke-linecap="round"/>
            <!-- whiskers -->
            <path d="M18 66 H38 M18 72 H36 M102 66 H82 M102 72 H84" stroke="#C2410C" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
            <!-- body hint -->
            <ellipse cx="60" cy="108" rx="22" ry="10" fill="#F97316"/>
            <!-- tail -->
            <path class="cat-tail" d="M78 104 Q108 88 98 70" fill="none" stroke="#EA580C" stroke-width="8" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  let moodTimer = null;
  let wanderTimer = null;
  let lookTimer = null;

  function clearMoodTimer() {
    if (moodTimer) {
      clearTimeout(moodTimer);
      moodTimer = null;
    }
  }

  function setMood(mood) {
    const root = ensureDom();
    root.classList.remove('mood-idle', 'mood-look', 'mood-happy', 'mood-sad', 'mood-jump');
    root.classList.add(`mood-${mood}`);
  }

  let lastReactAt = 0;
  function react(mood, holdMs = 2800) {
    const now = Date.now();
    if (mood === 'happy' || mood === 'sad') {
      if (now - lastReactAt < 400) return;
      lastReactAt = now;
    }
    const root = ensureDom();
    clearMoodTimer();
    if (mood === 'happy') {
      setMood('happy');
      root.classList.add('mood-jump');
      const jumpClear = setTimeout(() => root.classList.remove('mood-jump'), REDUCE ? 0 : 900);
      moodTimer = setTimeout(() => {
        clearTimeout(jumpClear);
        root.classList.remove('mood-jump');
        setMood('idle');
      }, holdMs);
    } else if (mood === 'sad') {
      setMood('sad');
      moodTimer = setTimeout(() => setMood('idle'), holdMs);
    } else {
      setMood(mood || 'idle');
    }
  }

  const POSITIONS = ['pos-br', 'pos-bl', 'pos-mr', 'pos-ml'];

  function setPosition(posClass) {
    const root = ensureDom();
    POSITIONS.forEach((p) => root.classList.remove(p));
    root.classList.add(posClass);
  }

  function lookAtAnswers() {
    const root = ensureDom();
    const grid = document.getElementById('ans-grid');
    if (!grid || !document.getElementById('game')?.classList.contains('active')) {
      setMood('idle');
      return;
    }
    const rect = grid.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const preferRight = midX < window.innerWidth * 0.55;
    setPosition(preferRight ? 'pos-br' : 'pos-bl');
    root.classList.toggle('look-left', !preferRight);
    root.classList.toggle('look-right', preferRight);
    setMood('look');
    clearTimeout(lookTimer);
    lookTimer = setTimeout(() => {
      if (root.classList.contains('mood-look')) setMood('idle');
    }, 2200);
  }

  function wander() {
    if (REDUCE) return;
    const root = ensureDom();
    if (root.classList.contains('mood-happy') || root.classList.contains('mood-sad')) return;
    const gameOn = document.getElementById('game')?.classList.contains('active');
    if (gameOn) {
      lookAtAnswers();
      // occasional little jump while idle near answers
      if (Math.random() < 0.35) {
        root.classList.add('mood-jump');
        setTimeout(() => root.classList.remove('mood-jump'), 700);
      }
      return;
    }
    const next = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
    setPosition(next);
    root.classList.toggle('look-left', next.includes('l'));
    root.classList.toggle('look-right', next.includes('r'));
    if (Math.random() < 0.4) {
      root.classList.add('mood-jump');
      setTimeout(() => root.classList.remove('mood-jump'), 700);
    }
  }

  function syncVisibility() {
    const root = ensureDom();
    const game = document.getElementById('game');
    const login = document.getElementById('login-screen');
    const welcome = document.getElementById('welcome');
    const onGame = game?.classList.contains('active');
    const onLogin = login?.classList.contains('active');
    const onWelcome = welcome?.classList.contains('active');
    const show = onGame || onLogin || onWelcome;
    root.hidden = !show;
    root.classList.toggle('on-game', !!onGame);
    root.classList.toggle('feedback-up', !!(onGame && document.getElementById('feedback')?.classList.contains('show')));
  }

  function start() {
    ensureDom();
    syncVisibility();
    setMood('idle');
    setPosition('pos-br');
    if (!wanderTimer) {
      wanderTimer = setInterval(wander, REDUCE ? 12000 : 5500);
    }
    // Hook screen changes if show() exists
    if (typeof window.show === 'function' && !window.show._catHooked) {
      const orig = window.show;
      window.show = function (id) {
        const r = orig.apply(this, arguments);
        queueMicrotask(() => {
          syncVisibility();
          if (id === 'game') setTimeout(lookAtAnswers, 280);
          else setMood('idle');
        });
        return r;
      };
      window.show._catHooked = true;
    }
    if (typeof window.renderQ === 'function' && !window.renderQ._catHooked) {
      const origR = window.renderQ;
      window.renderQ = function () {
        const r = origR.apply(this, arguments);
        queueMicrotask(() => {
          syncVisibility();
          react('idle');
          setTimeout(lookAtAnswers, 200);
        });
        return r;
      };
      window.renderQ._catHooked = true;
    }
    if (typeof window.pick === 'function' && !window.pick._catHooked) {
      const origP = window.pick;
      window.pick = function (btn, isOk) {
        const r = origP.apply(this, arguments);
        queueMicrotask(() => {
          syncVisibility();
          react(isOk ? 'happy' : 'sad');
        });
        return r;
      };
      window.pick._catHooked = true;
    }
    if (typeof window.onQuestionTimeUp === 'function' && !window.onQuestionTimeUp._catHooked) {
      const origT = window.onQuestionTimeUp;
      window.onQuestionTimeUp = function () {
        const r = origT.apply(this, arguments);
        queueMicrotask(() => {
          syncVisibility();
          react('sad');
        });
        return r;
      };
      window.onQuestionTimeUp._catHooked = true;
    }
    if (typeof window.setFeedbackPanelOpen === 'function' && !window.setFeedbackPanelOpen._catHooked) {
      const origF = window.setFeedbackPanelOpen;
      window.setFeedbackPanelOpen = function (open) {
        const r = origF.apply(this, arguments);
        queueMicrotask(syncVisibility);
        return r;
      };
      window.setFeedbackPanelOpen._catHooked = true;
    }
    // Fallback: watch feedback sheet classes for ok/bad
    const fb = document.getElementById('feedback');
    if (fb && !fb._catObserved) {
      const mo = new MutationObserver(() => {
        syncVisibility();
        if (!fb.classList.contains('show')) return;
        if (fb.classList.contains('ok')) react('happy');
        else if (fb.classList.contains('bad')) react('sad');
      });
      mo.observe(fb, { attributes: true, attributeFilter: ['class'] });
      fb._catObserved = true;
    }
  }

  window.AlhudaCat = {
    react,
    setMood,
    lookAtAnswers,
    syncVisibility,
    start,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
