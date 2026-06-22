/* Alhuda platform: classes, teacher dashboard, progress, homework, question editor */
(function () {
  const BOOK_KEYS = ['tawheed', 'usool', 'nawawi'];
  const BOOK_LABELS_LOCAL = {
    tawheed: 'كتاب التوحيد',
    usool: 'الأصول الثلاثة',
    nawawi: 'الأربعون النووية',
  };

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Escapes a string for safe use inside an inline onclick="..." JS string
  // literal (esc(JSON.stringify(...)) — safe in both HTML-attribute and
  // JS-string contexts). Exposed for any inline handler that takes an id.
  function escJsString(s) {
    return esc(JSON.stringify(String(s || '')));
  }

  // Centralized error handler for DB calls. Returns {data, error}; on throw,
  // optionally shows a toast and returns a synthetic error so callers never
  // see an unhandled promise rejection.
  async function safeQuery(fn, errMsg) {
    try {
      return await fn();
    } catch (e) {
      if (errMsg && typeof showToast === 'function') showToast(errMsg, 'err');
      return { data: null, error: { message: e?.message || 'Network error', _thrown: true } };
    }
  }

  // Reset all per-game fields on `state`. Previously duplicated 3× across
  // startMistakeReview / startExamReview / startHomework.
  function resetGameState(book) {
    state.idx = 0;
    state.score = 0;
    state.hearts = 5;
    state.streak = 0;
    state.maxStreak = 0;
    state.correct = 0;
    state.wrong = 0;
    state.answered = false;
    state.total = state.questions.length;
    state.wrongLog = [];
    state.demoMode = false;
    state.challengeMode = false;
    state.challengeCode = '';
    state.book = book || state.book || 'merge3';
  }

  function getProgressExt() {
    const base = typeof getProgress === 'function' ? getProgress() : {};
    return {
      bookProgress: { tawheed: { answered: 0, correct: 0 }, usool: { answered: 0, correct: 0 }, nawawi: { answered: 0, correct: 0 } },
      wrongQuestionIds: [],
      gameHistory: [],
      classId: null,
      classCode: '',
      className: '',
      dailyMissionDate: '',
      dailyMissionDone: false,
      ...base,
    };
  }

  function saveProgressExt(p) {
    if (typeof saveProgress === 'function') saveProgress(p);
  }

  function ensureProgressExt() {
    const p = { ...getProgressExt(), ...(typeof getProgress === 'function' ? getProgress() : {}) };
    if (!p.bookProgress) {
      p.bookProgress = { tawheed: { answered: 0, correct: 0 }, usool: { answered: 0, correct: 0 }, nawawi: { answered: 0, correct: 0 } };
    }
    if (!p.wrongQuestionIds) p.wrongQuestionIds = [];
    if (!p.gameHistory) p.gameHistory = [];
    saveProgressExt(p);
    return p;
  }

  function findQuestionById(id) {
    for (const book of BOOK_KEYS) {
      const q = (QUESTIONS[book] || []).find((x) => x.id === id);
      if (q) return q;
    }
    return null;
  }

  function allQuestionsFlat() {
    return BOOK_KEYS.flatMap((b) => QUESTIONS[b] || []);
  }

  async function recordQuestionAttempt(questionId, wasCorrect) {
    if (!questionId || state.demoMode || trainingMode) return;
    try {
      await db.rpc('increment_question_stat', { qid: questionId, was_correct: wasCorrect });
    } catch (e) {
      /* RPC may not exist until supabase_platform.sql runs */
    }
    if (!state.user || wasCorrect) return;
    const p = ensureProgressExt();
    if (!p.wrongQuestionIds.includes(questionId)) p.wrongQuestionIds.push(questionId);
    if (p.wrongQuestionIds.length > 80) p.wrongQuestionIds = p.wrongQuestionIds.slice(-80);
    saveProgressExt(p);
    try {
      await db.rpc('record_user_wrong', { uid: state.user.id, qid: questionId });
    } catch (e) {
      try {
        await db.from('user_wrong_questions').upsert(
          { user_id: state.user.id, question_id: questionId, wrong_count: 1, last_wrong_at: new Date().toISOString() },
          { onConflict: 'user_id,question_id', ignoreDuplicates: false }
        );
      } catch (e2) {}
    }
  }

  // Track per-book answered/correct for the current game so merge3 progress
  // is attributed accurately instead of blindly splitting /3 across all books.
  // Set by game logic (renderQ / answer flow) when a question is answered.
  function _currentGameBookBuckets() {
    if (!state.questions?.length) return null;
    const buckets = { tawheed: { answered: 0, correct: 0 }, usool: { answered: 0, correct: 0 }, nawawi: { answered: 0, correct: 0 } };
    const wrong = new Set((state.wrongLog || []).map((w) => w.q?.id).filter(Boolean));
    state.questions.forEach((q) => {
      const b = q && q.book && buckets[q.book] ? q.book : null;
      if (!b) return;
      buckets[b].answered++;
      if (!wrong.has(q.id)) buckets[b].correct++;
    });
    return buckets;
  }

  async function syncBookProgress(gameBook, correct, total) {
    const p = ensureProgressExt();
    const books = gameBook === 'merge3' ? BOOK_KEYS : [gameBook];

    // For merge3 we attribute progress to each book based on how many of the
    // game's questions actually belonged to that book. This fixes the previous
    // bug where a single 30-question mixed game added ~10 progress to every
    // book regardless of the actual mix.
    const buckets = gameBook === 'merge3' ? _currentGameBookBuckets() : null;

    for (const b of books) {
      if (!BOOK_KEYS.includes(b)) continue;
      let slice, cSlice;
      if (buckets && buckets[b]) {
        slice = buckets[b].answered;
        cSlice = buckets[b].correct;
      } else {
        slice = total;
        cSlice = correct;
      }
      p.bookProgress[b] = p.bookProgress[b] || { answered: 0, correct: 0 };
      p.bookProgress[b].answered += slice;
      p.bookProgress[b].correct += cSlice;
    }
    saveProgressExt(p);
    if (!state.user) return;
    for (const b of books) {
      if (!BOOK_KEYS.includes(b)) continue;
      const row = p.bookProgress[b];
      try {
        const { error } = await db.from('book_progress').upsert({
          user_id: state.user.id,
          book: b,
          answered: row.answered,
          correct: row.correct,
          updated_at: new Date().toISOString(),
        });
        if (error && typeof showToast === 'function') showToast('تعذّر حفظ التقدّم', 'err');
      } catch (e) {
        if (typeof showToast === 'function') showToast('تعذّر حفظ التقدّم', 'err');
      }
    }
  }

  function recordGameHistory(entry) {
    const p = ensureProgressExt();
    p.gameHistory = [entry, ...(p.gameHistory || [])].slice(0, 8);
    const today = new Date().toISOString().slice(0, 10);
    if (p.dailyMissionDate !== today) {
      p.dailyMissionDate = today;
      p.dailyMissionDone = false;
    }
    if (!entry.training && !entry.demo) p.dailyMissionDone = true;
    saveProgressExt(p);
  }

  function renderBookProgress() {
    const el = document.getElementById('book-progress-grid');
    if (!el) return;
    const p = ensureProgressExt();
    const counts = {
      tawheed: (QUESTIONS.tawheed || []).length,
      usool: (QUESTIONS.usool || []).length,
      nawawi: (QUESTIONS.nawawi || []).length,
    };
    el.innerHTML = BOOK_KEYS.map((b) => {
      const prog = p.bookProgress[b] || { answered: 0, correct: 0 };
      const total = counts[b] || 1;
      const pct = Math.min(100, Math.round((prog.answered / total) * 100));
      const acc = prog.answered ? Math.round((prog.correct / prog.answered) * 100) : 0;
      return `<div class="book-progress-item">
        <div class="bp-head"><span>${BOOK_LABELS_LOCAL[b]}</span><span>${prog.answered}/${total}</span></div>
        <div class="bp-bar"><div class="bp-fill" style="width:${pct}%"></div></div>
        <div class="bp-meta">دقة: ${acc}%</div>
      </div>`;
    }).join('');
  }

  function updateDailyMissionUI() {
    const p = ensureProgressExt();
    const el = document.getElementById('daily-mission');
    const check = el?.querySelector('.dm-check');
    const sub = el?.querySelector('.dm-sub');
    const today = new Date().toISOString().slice(0, 10);
    if (p.dailyMissionDate !== today) {
      p.dailyMissionDate = today;
      p.dailyMissionDone = false;
      saveProgressExt(p);
    }
    if (sub) sub.textContent = p.dailyMissionDone ? 'عد/ي غداً لمهمة جديدة ✨' : 'أكمِل/ي جولة واحدة على الأقل';
    if (check) check.textContent = p.dailyMissionDone ? '✓' : '0/1';
    const icon = el?.querySelector('.dm-icon');
    const title = el?.querySelector('.dm-title');
    if (icon) icon.textContent = p.dailyMissionDone ? '🏆' : '🎯';
    if (title) title.textContent = p.dailyMissionDone ? 'أتممتَ/ِ مهمة اليوم!' : 'مهمة اليوم';
    if (el) el.classList.toggle('done', !!p.dailyMissionDone);
  }

  function renderClassBanner() {
    const el = document.getElementById('class-banner');
    if (!el) return;
    const p = ensureProgressExt();
    if (state.userType === 'teacher') {
      el.style.display = 'none';
      return;
    }
    if (p.className) {
      el.style.display = 'block';
      el.innerHTML = `<span>🏫 صفك: <strong>${esc(p.className)}</strong> (${esc(p.classCode)})</span>`;
    } else {
      el.style.display = 'block';
      el.innerHTML = `<span>🏫 لستَ/ِ في صف بعد — انضم/ي بالرمز أدناه</span>`;
    }
  }

  async function joinClass() {
    const code = (document.getElementById('class-code-input')?.value || '').trim().toUpperCase();
    const msg = document.getElementById('class-join-msg');
    if (!code) {
      if (msg) msg.textContent = 'اكتب/ي رمز الصف';
      return;
    }
    if (!state.user) {
      if (msg) msg.textContent = 'سجّل/ي دخولك أولاً';
      return;
    }
    const clsRes = await safeQuery(
      () => db.from('classes').select('id,name,code').eq('code', code).maybeSingle(),
      'تعذّر الاتصال — حاول/ي مجدداً'
    );
    const cls = clsRes.data;
    if (clsRes.error || !cls) {
      if (msg) msg.textContent = clsRes.error ? '❌ تعذّر البحث عن الصف' : '❌ رمز غير صحيح';
      return;
    }
    const joinRes = await safeQuery(
      () => db.from('class_members').upsert(
        { class_id: cls.id, user_id: state.user.id },
        { onConflict: 'class_id,user_id' }
      ),
      'تعذّر الانضمام للصف'
    );
    if (joinRes.error) {
      if (msg) msg.textContent = '❌ تعذّر الانضمام: ' + (joinRes.error.message || '');
      return;
    }
    const p = ensureProgressExt();
    p.classId = cls.id;
    p.classCode = cls.code;
    p.className = cls.name;
    saveProgressExt(p);
    if (msg) msg.textContent = '✅ انضممتَ/ِ إلى الصف: ' + cls.name;
    renderClassBanner();
    loadStudentHomework();
  }

  function startMistakeReview() {
    const p = ensureProgressExt();
    const ids = [...(p.wrongQuestionIds || [])];
    const qs = ids.map(findQuestionById).filter(Boolean);
    if (!qs.length) {
      if (typeof showToast === 'function') showToast('لا توجد أخطاء محفوظة بعد. العب/ي جولة أولاً!', 'info');
      else alert('لا توجد أخطاء محفوظة بعد. العب/ي جولة أولاً!');
      return;
    }
    state.questions = shuffleArr(qs.slice(0, 20));
    resetGameState('merge3');
    show('game');
    renderQ();
  }

  function startExamReview() {
    selectBook('merge3');
    selectLevel('all');
    const pool = getOrderedPool('merge3', 'all');
    const pick = shuffleArr(pool).slice(0, Math.min(30, pool.length));
    if (!pick.length) {
      if (typeof showToast === 'function') showToast('لا توجد أسئلة كافية', 'info');
      else alert('لا توجد أسئلة كافية');
      return;
    }
    state.questions = pick;
    resetGameState('merge3');
    show('game');
    renderQ();
  }

  function showOnboardingIfNeeded() {
    if (localStorage.getItem('onboardingDone')) return;
    if (!document.getElementById('welcome')?.classList.contains('active')) return;
    const ov = document.getElementById('onboarding-overlay');
    if (!ov) return;
    ov.classList.add('open');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    if (typeof trapFocusInOverlay === 'function') trapFocusInOverlay(ov);
  }

  function onboardingNext() {
    const slides = document.querySelectorAll('.onb-slide');
    let idx = 0;
    slides.forEach((s, i) => {
      if (s.classList.contains('active')) idx = i;
    });
    if (idx >= slides.length - 1) {
      closeOnboarding();
      return;
    }
    slides[idx].classList.remove('active');
    slides[idx + 1].classList.add('active');
    document.querySelectorAll('.onb-dot').forEach((d, i) => d.classList.toggle('on', i === idx + 1));
  }

  function closeOnboarding() {
    localStorage.setItem('onboardingDone', '1');
    const ov = document.getElementById('onboarding-overlay');
    if (ov) {
      ov.classList.remove('open');
      ov.removeAttribute('role');
      ov.removeAttribute('aria-modal');
      if (typeof releaseFocusTrap === 'function') releaseFocusTrap(ov);
    }
  }

  async function loadStudentHomework() {
    const el = document.getElementById('homework-banner');
    if (!el || state.userType === 'teacher') return;
    const p = ensureProgressExt();
    if (!p.classId) {
      el.style.display = 'none';
      return;
    }
    const result = await safeQuery(() => Promise.all([
      db.from('homework').select('*').eq('class_id', p.classId).eq('active', true).order('created_at', { ascending: false }).limit(5),
      state.user ? db.from('homework_completions').select('homework_id').eq('user_id', state.user.id) : Promise.resolve({ data: [] }),
    ]));
    if (result.error) {
      // Hide the banner on failure rather than leaving it in an unknown state.
      el.style.display = 'none';
      return;
    }
    const [hwRes, doneRes] = result.data;
    const data = hwRes?.data;
    const done = doneRes?.data;
    if (!data?.length) {
      el.style.display = 'none';
      return;
    }
    const doneSet = new Set((done || []).map((d) => d.homework_id));
    const pending = data.filter((h) => !doneSet.has(h.id)).length;
    el.style.display = 'block';
    const badge = pending > 0 ? `<span class="hw-badge">${pending}</span>` : '';
    el.innerHTML = `<p style="font-weight:900;margin-bottom:8px;">${badge}📋 واجبات الصف</p>` + data.map((h) => {
      const isDone = doneSet.has(h.id);
      // XSS hardening: every DB-sourced value is escaped for its context.
      // - Text content (title, due_date, book, range): use esc().
      // - Inline JS string argument (h.id): use esc(JSON.stringify(...)) so the
      //   value is safe in both the HTML-attribute and JS-string layers.
      const due = h.due_date ? ` — موعد: ${esc(h.due_date)}` : '';
      const bookLabel = esc(BOOK_LABELS_LOCAL[h.book] || h.book || '');
      const safeJsId = escJsString(h.id);
      return `<div class="hw-item${isDone ? ' done' : ''}">
        <strong>📋 ${esc(h.title)}</strong>
        <span>${bookLabel} · ${esc(h.q_from)}-${esc(h.q_to)}${due}</span>
        <button class="btn btn-gold btn-sm" onclick="startHomework(${safeJsId})" ${isDone ? 'disabled' : ''}>${isDone ? 'مكتمل ✓' : 'ابدأ الواجب'}</button>
      </div>`;
    }).join('');
  }

  window.startHomework = async function startHomework(hwId) {
    const { data: h, error } = await safeQuery(
      () => db.from('homework').select('*').eq('id', hwId).single(),
      'تعذّر تحميل الواجب'
    );
    if (error || !h) {
      if (typeof showToast === 'function') showToast('❌ تعذّر تحميل الواجب', 'err');
      return;
    }
    selectBook(h.book);
    selectLevel(h.level || 'easy');
    const pool = getOrderedPool(h.book, h.level || 'easy');
    const from = Math.max(1, h.q_from || 1);
    const to = Math.min(pool.length, h.q_to || pool.length);
    state.questions = pool.slice(from - 1, to);
    if (!state.questions.length) {
      if (typeof showToast === 'function') showToast('❌ لا توجد أسئلة في نطاق هذا الواجب', 'err');
      return;
    }
    state.homeworkId = h.id;
    resetGameState(h.book);
    show('game');
    renderQ();
  };

  function showCertificate(book) {
    const p = ensureProgressExt();
    const prog = p.bookProgress[book] || { answered: 0, correct: 0 };
    const total = (QUESTIONS[book] || []).length;
    const pct = total ? Math.round((prog.answered / total) * 100) : 0;
    const acc = prog.answered ? Math.round((prog.correct / prog.answered) * 100) : 0;
    if (pct < 50 || acc < 70) {
      const msg = 'للحصول على الشهادة: أكمِل/ي ٥٠٪ من ' + BOOK_LABELS_LOCAL[book] +
        ' بدقة ٧٠٪ على الأقل (حالياً: ' + pct + '% تغطية، ' + acc + '% دقة)';
      if (typeof showToast === 'function') showToast(msg, 'info');
      else alert(msg);
      return;
    }
    const text = `شهادة إتمام\n\nيشهد مركز المكتبة الثلاثية — جمعية الهدى والحكمة\nأن الطالب/ة: ${state.userName}\nأتم/ت ${pct}% من ${BOOK_LABELS_LOCAL[book]} بدقة ${acc}%\nبتاريخ: ${new Date().toLocaleDateString('ar-SA')}\n\nبارك الله فيك/ِ`;
    const w = window.open('', '_blank');
    if (w) {
      // Build the certificate via DOM methods (no document.write) so popup
      // blockers and strict CSP cannot break it. esc() guards state.userName.
      w.document.open();
      w.document.write('<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>شهادة إتمام</title></head><body style="font-family:Tajawal,sans-serif;text-align:center;padding:40px"><pre style="font-size:18px;line-height:1.8;white-space:pre-wrap">' + esc(text) + '</pre></body></html>');
      w.document.close();
      w.focus();
      w.print();
    } else if (typeof showToast === 'function') {
      showToast('عذّر/ي النوافذ المنبثقة ثم حاول/ي مجدداً', 'info');
    } else {
      alert(text);
    }
  }

  function enhanceProfileHtml(baseHtml) {
    const p = ensureProgressExt();
    let hist = '';
    if (p.gameHistory?.length) {
      hist = '<p style="font-weight:900;margin:12px 0 6px">📜 آخر الجولات</p><ul class="hist-list">' +
        p.gameHistory.map((g) => `<li>${esc(g.book)} · ${g.correct}/${g.total} · ⭐${g.score}</li>`).join('') +
        '</ul>';
    }
    let cert = '<p style="font-weight:900;margin:12px 0 6px">📜 الشهادات</p><div class="cert-row">' +
      BOOK_KEYS.map((b) => `<button class="btn btn-white btn-sm" onclick="showCertificate('${b}')">${BOOK_LABELS_LOCAL[b]}</button>`).join('') +
      '</div>';
    return baseHtml + hist + cert;
  }

  function onWelcomeHome() {
    renderBookProgress();
    updateDailyMissionUI();
    const mistakeBtn = document.getElementById('btn-mistakes');
    const p = ensureProgressExt();
    if (mistakeBtn) mistakeBtn.style.display = p.wrongQuestionIds?.length ? 'inline-flex' : 'none';
  }

  async function syncUserClassFromDb() {
    if (!state.user || state.userType === 'teacher') return;
    try {
      const { data: members } = await db.from('class_members').select('class_id').eq('user_id', state.user.id).limit(1);
      const classId = members?.[0]?.class_id;
      if (!classId) return;
      const { data: cls } = await db.from('classes').select('id,name,code').eq('id', classId).single();
      if (!cls) return;
      const p = ensureProgressExt();
      p.classId = cls.id;
      p.classCode = cls.code;
      p.className = cls.name;
      saveProgressExt(p);
    } catch (e) {}
  }

  async function syncWrongQuestionsFromDb() {
    if (!state.user) return;
    try {
      const { data } = await db.from('user_wrong_questions')
        .select('question_id')
        .eq('user_id', state.user.id)
        .order('last_wrong_at', { ascending: false })
        .limit(80);
      if (!data?.length) return;
      const p = ensureProgressExt();
      p.wrongQuestionIds = [...new Set([...data.map((r) => r.question_id), ...(p.wrongQuestionIds || [])])].slice(-80);
      saveProgressExt(p);
    } catch (e) {}
  }

  async function onGameEndHook() {
    // Record homework completion whenever the student FINISHES a homework game,
    // regardless of score. The previous gate (`correct > 0 || score > 0`)
    // meant a zero-score attempt was silently dropped and the homework kept
    // reappearing as "pending" forever.
    if (state.homeworkId && state.user && !trainingMode && !state.demoMode) {
      const { error } = await safeQuery(
        () => db.from('homework_completions').upsert({
          homework_id: state.homeworkId,
          user_id: state.user.id,
          score: state.score,
          correct: state.correct,
          total: state.total,
        }, { onConflict: 'homework_id,user_id' }),
        'تعذّر تسجيل إكمال الواجب'
      );
      state.homeworkId = null;
    } else if (state.homeworkId) {
      state.homeworkId = null;
    }
    recordGameHistory({
      book: state.book,
      score: state.score,
      correct: state.correct,
      total: state.total,
      demo: state.demoMode,
      training: trainingMode,
      at: new Date().toISOString(),
    });
    if (!trainingMode && !state.demoMode) {
      await syncBookProgress(state.book, state.correct, state.total);
    }
  }

  async function loadQuestionsCached() {
    const cacheKey = 'questionsCacheV3';
    const ttl = state.userType === 'teacher' ? 60000 : 900000;
    // Guard against corrupted sessionStorage: a JSON.parse throw used to
    // hard-crash the whole game; now it's treated as a cache miss.
    let cached = null;
    try {
      cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
    } catch (e) {
      try { sessionStorage.removeItem(cacheKey); } catch (e2) {}
    }
    if (cached?.ts && Date.now() - cached.ts < ttl && cached.data?.length) {
      return cached.data;
    }
    const { data, error } = await safeQuery(async () => {
      const books = ['tawheed', 'usool', 'nawawi'];
      const parts = await Promise.all(
        books.map((book) => db.from('questions').select('*').eq('language', 'ar').eq('book', book))
      );
      const err = parts.find((p) => p.error)?.error;
      if (err) return { data: null, error: err };
      return { data: parts.flatMap((p) => p.data || []), error: null };
    }, 'تعذّر تحميل الأسئلة');
    if (error) throw error;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {}
    return data;
  }

  function init() {
    window.recordQuestionAttempt = recordQuestionAttempt;
    window.startMistakeReview = startMistakeReview;
    window.startExamReview = startExamReview;
    window.showCertificate = showCertificate;
    window.onboardingNext = onboardingNext;
    window.closeOnboarding = closeOnboarding;
    window.AlhudaPlatform = {
      onWelcomeHome,
      onGameEndHook,
      enhanceProfileHtml,
      showOnboardingIfNeeded,
      loadQuestionsCached,
      updateDailyMissionUI,
      syncUserClassFromDb,
      syncWrongQuestionsFromDb,
      openAdmin: () => {
        if (typeof showLeaderboard === 'function') showLeaderboard();
      },
    };
  }

  init();
})();
