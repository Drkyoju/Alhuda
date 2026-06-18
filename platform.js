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
      .replace(/"/g, '&quot;');
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

  async function syncBookProgress(gameBook, correct, total) {
    const p = ensureProgressExt();
    const books = gameBook === 'merge3' ? BOOK_KEYS : [gameBook];
    for (const b of books) {
      if (!BOOK_KEYS.includes(b)) continue;
      const slice = gameBook === 'merge3' ? Math.round(total / 3) : total;
      const cSlice = gameBook === 'merge3' ? Math.round(correct / 3) : correct;
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
        await db.from('book_progress').upsert({
          user_id: state.user.id,
          book: b,
          answered: row.answered,
          correct: row.correct,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {}
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
    const { data: cls, error } = await db.from('classes').select('id,name,code').eq('code', code).maybeSingle();
    if (error || !cls) {
      if (msg) msg.textContent = '❌ رمز غير صحيح';
      return;
    }
    const { error: joinErr } = await db.from('class_members').upsert(
      { class_id: cls.id, user_id: state.user.id },
      { onConflict: 'class_id,user_id' }
    );
    if (joinErr) {
      if (msg) msg.textContent = '❌ تعذّر الانضمام: ' + joinErr.message;
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
      alert('لا توجد أخطاء محفوظة بعد. العب/ي جولة أولاً!');
      return;
    }
    state.demoMode = false;
    state.challengeMode = false;
    state.questions = shuffleArr(qs.slice(0, 20));
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
    state.book = 'merge3';
    show('game');
    renderQ();
  }

  function startExamReview() {
    selectBook('merge3');
    selectLevel('all');
    const pool = getOrderedPool('merge3', 'all');
    const pick = shuffleArr(pool).slice(0, Math.min(30, pool.length));
    if (!pick.length) {
      alert('لا توجد أسئلة كافية');
      return;
    }
    state.questions = pick;
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
    show('game');
    renderQ();
  }

  function showOnboardingIfNeeded() {
    if (localStorage.getItem('onboardingDone')) return;
    const ov = document.getElementById('onboarding-overlay');
    if (ov) ov.classList.add('open');
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
    document.getElementById('onboarding-overlay')?.classList.remove('open');
  }

  async function loadStudentHomework() {
    const el = document.getElementById('homework-banner');
    if (!el || state.userType === 'teacher') return;
    const p = ensureProgressExt();
    if (!p.classId) {
      el.style.display = 'none';
      return;
    }
    const { data } = await db.from('homework').select('*').eq('class_id', p.classId).eq('active', true).order('created_at', { ascending: false }).limit(3);
    if (!data?.length) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.innerHTML = data.map((h) => {
      const due = h.due_date ? ` — موعد: ${h.due_date}` : '';
      return `<div class="hw-item">
        <strong>📋 ${esc(h.title)}</strong>
        <span>${BOOK_LABELS_LOCAL[h.book] || h.book} · ${h.q_from}-${h.q_to}${due}</span>
        <button class="btn btn-gold btn-sm" onclick="startHomework('${h.id}')">ابدأ الواجب</button>
      </div>`;
    }).join('');
  }

  window.startHomework = async function startHomework(hwId) {
    try {
      const { data: h, error } = await db.from('homework').select('*').eq('id', hwId).single();
      if (error || !h) {
        alert('❌ تعذّر تحميل الواجب');
        return;
      }
      selectBook(h.book);
      selectLevel(h.level || 'easy');
      const pool = getOrderedPool(h.book, h.level || 'easy');
      const from = Math.max(1, h.q_from || 1);
      const to = Math.min(pool.length, h.q_to || pool.length);
      state.questions = pool.slice(from - 1, to);
      if (!state.questions.length) {
        alert('❌ لا توجد أسئلة في نطاق هذا الواجب');
        return;
      }
      state.homeworkId = h.id;
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
      show('game');
      renderQ();
    } catch (e) {
      alert('❌ تعذّر بدء الواجب');
    }
  };

  function showCertificate(book) {
    const p = ensureProgressExt();
    const prog = p.bookProgress[book] || { answered: 0, correct: 0 };
    const total = (QUESTIONS[book] || []).length;
    const pct = total ? Math.round((prog.answered / total) * 100) : 0;
    const acc = prog.answered ? Math.round((prog.correct / prog.answered) * 100) : 0;
    if (pct < 50 || acc < 70) {
      alert('للحصول على الشهادة: أكمِل/ي ٥٠٪ من ' + BOOK_LABELS_LOCAL[book] + ' بدقة ٧٠٪ على الأقل (حالياً: ' + pct + '% تغطية، ' + acc + '% دقة)');
      return;
    }
    const text = `شهادة إتمام\n\nيشهد مركز المكتبة الثلاثية — جمعية الهدى والحكمة\nأن الطالب/ة: ${state.userName}\nأتم/ت ${pct}% من ${BOOK_LABELS_LOCAL[book]} بدقة ${acc}%\nبتاريخ: ${new Date().toLocaleDateString('ar-SA')}\n\nبارك الله فيك/ِ`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<html dir="rtl"><body style="font-family:Tajawal,sans-serif;text-align:center;padding:40px"><pre style="font-size:18px;line-height:1.8">${esc(text)}</pre></body></html>`);
      w.print();
    } else alert(text);
  }

  function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('active', p.id === 'admin-tab-' + tab));
    if (tab === 'students') loadTeacherStudents();
    if (tab === 'classes') loadTeacherClasses();
    if (tab === 'stats') loadQuestionStats();
    if (tab === 'homework') loadTeacherHomeworkForm();
    if (tab === 'questions') loadQuestionEditorList();
    if (tab === 'feedback' && typeof showAdminFeedback === 'function') showAdminFeedback();
  }

  async function createClass() {
    const name = (document.getElementById('new-class-name')?.value || '').trim() || 'صف جديد';
    const code = 'CLS' + Date.now().toString(36).toUpperCase().slice(-5);
    const { data, error } = await db.from('classes').insert({ name, code, teacher_id: state.user?.id }).select().single();
    const msg = document.getElementById('class-create-msg');
    if (error) {
      if (msg) msg.textContent = '❌ شغّل/ي supabase_platform.sql أولاً';
      return;
    }
    if (msg) msg.innerHTML = `✅ تم إنشاء الصف: <strong>${esc(data.name)}</strong><br>الرمز: <strong>${esc(data.code)}</strong> — شاركه مع الطلاب`;
    loadTeacherClasses();
  }

  async function loadTeacherClasses() {
    const el = document.getElementById('teacher-classes-list');
    if (!el || !state.user) return;
    const { data } = await db.from('classes').select('*').eq('teacher_id', state.user.id).order('created_at', { ascending: false });
    if (!data?.length) {
      el.innerHTML = '<p style="color:var(--text-soft);font-size:0.85em">لا توجد صفوف بعد</p>';
      return;
    }
    el.innerHTML = data.map((c) => `<div class="admin-list-item"><strong>${esc(c.name)}</strong><span>رمز: ${esc(c.code)}</span></div>`).join('');
    const sel = document.getElementById('hw-class-select');
    if (sel) sel.innerHTML = data.map((c) => `<option value="${c.id}">${esc(c.name)} (${esc(c.code)})</option>`).join('');
  }

  async function loadTeacherStudents() {
    const el = document.getElementById('teacher-students-list');
    if (!el) return;
    el.innerHTML = '<p>جاري التحميل...</p>';
    const { data: classes } = await db.from('classes').select('id,name,code').eq('teacher_id', state.user?.id);
    if (!classes?.length) {
      el.innerHTML = '<p style="color:var(--text-soft)">أنشئ/ي صفاً أولاً وشارك/ي الرمز مع الطلاب</p>';
      return;
    }
    const classIds = classes.map((c) => c.id);
    const { data: members } = await db.from('class_members').select('user_id,class_id,joined_at').in('class_id', classIds);
    if (!members?.length) {
      el.innerHTML = '<p style="color:var(--text-soft)">لا يوجد طلاب منضمون بعد</p>';
      return;
    }
    const userIds = [...new Set(members.map((m) => m.user_id))];
    const [{ data: profiles }, { data: scores }] = await Promise.all([
      db.from('profiles').select('id,name').in('id', userIds),
      db.from('scores').select('user_id,score,correct,total,book,played_at').in('user_id', userIds).order('played_at', { ascending: false }),
    ]);
    const nameMap = Object.fromEntries((profiles || []).map((p) => [p.id, p.name]));
    const classMap = Object.fromEntries(classes.map((c) => [c.id, c.name]));
    const byUser = {};
    for (const m of members) {
      if (!byUser[m.user_id]) byUser[m.user_id] = { class: classMap[m.class_id], games: 0, best: 0, last: '' };
    }
    for (const s of scores || []) {
      const u = byUser[s.user_id];
      if (!u) continue;
      u.games++;
      u.best = Math.max(u.best, s.score || 0);
      if (!u.last) u.last = (s.played_at || '').slice(0, 10);
    }
    let html = '<div class="teacher-table-wrap"><table class="teacher-table"><thead><tr><th>الاسم</th><th>الصف</th><th>ألعاب</th><th>أفضل نتيجة</th><th>آخر لعب</th></tr></thead><tbody>';
    for (const [uid, info] of Object.entries(byUser)) {
      html += `<tr><td>${esc(nameMap[uid] || 'طالب/ة')}</td><td>${esc(info.class)}</td><td>${info.games}</td><td>⭐${info.best}</td><td>${info.last || '—'}</td></tr>`;
    }
    html += '</tbody></table></div>';
    html += `<button class="btn btn-white btn-sm" style="margin-top:10px;width:100%" onclick="exportStudentsCsv()">📥 تصدير CSV</button>`;
    el.innerHTML = html;
    window._teacherStudentsExport = Object.entries(byUser).map(([uid, info]) => ({
      name: nameMap[uid] || '',
      class: info.class,
      games: info.games,
      best: info.best,
      last: info.last,
    }));
  }

  window.exportStudentsCsv = function exportStudentsCsv() {
    const rows = window._teacherStudentsExport || [];
    const lines = [['الاسم', 'الصف', 'ألعاب', 'أفضل نتيجة', 'آخر لعب'], ...rows.map((r) => [r.name, r.class, r.games, r.best, r.last])];
    const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'students-report.csv';
    a.click();
  };

  async function loadQuestionStats() {
    const el = document.getElementById('teacher-stats-list');
    if (!el) return;
    const { data: stats } = await db.from('question_stats').select('question_id,correct_count,wrong_count').order('wrong_count', { ascending: false }).limit(15);
    if (!stats?.length) {
      el.innerHTML = '<p style="color:var(--text-soft);font-size:0.85em">لا توجد إحصائيات بعد — تظهر بعد لعب الطلاب</p>';
      return;
    }
    const qMap = Object.fromEntries(allQuestionsFlat().map((q) => [q.id, q]));
    el.innerHTML = stats.map((s) => {
      const q = qMap[s.question_id];
      const text = q ? q.q.slice(0, 70) : s.question_id;
      const total = (s.correct_count || 0) + (s.wrong_count || 0);
      const errPct = total ? Math.round((s.wrong_count / total) * 100) : 0;
      return `<div class="admin-list-item"><strong>${esc(text)}</strong><span>خطأ: ${errPct}% (${s.wrong_count}/${total})</span></div>`;
    }).join('');
  }

  async function loadQuestionEditorList() {
    const el = document.getElementById('question-editor-list');
    const search = (document.getElementById('q-edit-search')?.value || '').trim().toLowerCase();
    if (!el) return;
    let qs = allQuestionsFlat();
    if (search) qs = qs.filter((q) => q.q.toLowerCase().includes(search));
    el.innerHTML = qs.slice(0, 40).map((q) =>
      `<button type="button" class="admin-list-item q-edit-pick" data-id="${q.id}" style="width:100%;text-align:right;cursor:pointer;border:1px solid var(--border);background:var(--white)">
        <strong>${esc(q.q.slice(0, 80))}</strong><span>${BOOK_LABELS_LOCAL[q.book] || q.book}</span>
      </button>`
    ).join('');
    el.querySelectorAll('.q-edit-pick').forEach((btn) => {
      btn.onclick = () => loadQuestionEditorForm(btn.dataset.id);
    });
  }

  function loadQuestionEditorForm(id) {
    const q = findQuestionById(id);
    const form = document.getElementById('question-editor-form');
    if (!q || !form) return;
    form.style.display = 'block';
    form.dataset.id = id;
    document.getElementById('q-edit-text').value = q.q;
    document.getElementById('q-edit-exp').value = q.exp || '';
    form.dataset.type = q.type || 'mc';
    const mcFields = document.getElementById('q-edit-mc-fields');
    const tfFields = document.getElementById('q-edit-tf-fields');
    if (q.type === 'tf') {
      if (mcFields) mcFields.style.display = 'none';
      if (tfFields) tfFields.style.display = 'block';
      const tfEl = document.getElementById('q-edit-tf');
      if (tfEl) tfEl.value = q.tf ? 'true' : 'false';
    } else {
      if (mcFields) mcFields.style.display = 'block';
      if (tfFields) tfFields.style.display = 'none';
      if (q.a) {
        document.getElementById('q-edit-opt0').value = q.a[0] || '';
        document.getElementById('q-edit-opt1').value = q.a[1] || '';
        document.getElementById('q-edit-opt2').value = q.a[2] || '';
        document.getElementById('q-edit-opt3').value = q.a[3] || '';
        document.getElementById('q-edit-correct').value = String(q.c ?? 0);
      }
    }
    document.getElementById('q-edit-msg').textContent = '';
  }

  async function saveQuestionEdit() {
    const form = document.getElementById('question-editor-form');
    const id = form?.dataset.id;
    if (!id) return;
    const qType = form.dataset.type || findQuestionById(id)?.type || 'mc';
    const payload = {
      question_text: document.getElementById('q-edit-text').value.trim(),
      explanation: document.getElementById('q-edit-exp').value.trim(),
    };
    if (qType === 'tf') {
      payload.is_true = document.getElementById('q-edit-tf')?.value === 'true';
    } else {
      payload.options = [
        document.getElementById('q-edit-opt0').value.trim(),
        document.getElementById('q-edit-opt1').value.trim(),
        document.getElementById('q-edit-opt2').value.trim(),
        document.getElementById('q-edit-opt3').value.trim(),
      ];
      payload.correct_index = parseInt(document.getElementById('q-edit-correct').value, 10) || 0;
    }
    const { error } = await db.from('questions').update(payload).eq('id', id);
    const msg = document.getElementById('q-edit-msg');
    if (error) {
      if (msg) msg.textContent = '❌ ' + (error.message || 'فشل الحفظ — شغّل supabase_platform.sql');
      return;
    }
    if (msg) msg.textContent = '✅ تم الحفظ';
    sessionStorage.removeItem('questionsCacheV1');
    await loadQuestions();
    updateLevelCounts();
    updateQuestionRangeUI();
  }

  async function createHomework() {
    const classId = document.getElementById('hw-class-select')?.value;
    const title = (document.getElementById('hw-title')?.value || '').trim() || 'واجب';
    const book = document.getElementById('hw-book')?.value || 'tawheed';
    const level = document.getElementById('hw-level')?.value || 'easy';
    const qFrom = parseInt(document.getElementById('hw-from')?.value, 10) || 1;
    const qTo = parseInt(document.getElementById('hw-to')?.value, 10) || 20;
    const due = document.getElementById('hw-due')?.value || null;
    const msg = document.getElementById('hw-create-msg');
    if (!classId) {
      if (msg) msg.textContent = '❌ اختر/ي صفاً أولاً';
      return;
    }
    const { error } = await db.from('homework').insert({
      class_id: classId,
      teacher_id: state.user?.id,
      title,
      book,
      level,
      q_from: qFrom,
      q_to: qTo,
      due_date: due || null,
      active: true,
    });
    if (error) {
      if (msg) msg.textContent = '❌ ' + error.message;
      return;
    }
    if (msg) msg.textContent = '✅ تم إرسال الواجب للصف';
  }

  function loadTeacherHomeworkForm() {
    loadTeacherClasses();
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
    renderClassBanner();
    loadStudentHomework();
    const joinRow = document.getElementById('class-join-row');
    if (joinRow) joinRow.style.display = state.userType === 'student' ? 'flex' : 'none';
    const mistakeBtn = document.getElementById('btn-mistakes');
    const p = ensureProgressExt();
    if (mistakeBtn) mistakeBtn.style.display = (p.wrongQuestionIds?.length && state.userType !== 'teacher') ? 'inline-flex' : 'none';
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
    if (state.homeworkId && state.user && !trainingMode) {
      await db.from('homework_completions').upsert({
        homework_id: state.homeworkId,
        user_id: state.user.id,
        score: state.score,
        correct: state.correct,
        total: state.total,
      }, { onConflict: 'homework_id,user_id' });
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
    const cacheKey = 'questionsCacheV1';
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
    if (cached?.ts && Date.now() - cached.ts < 3600000 && cached.data?.length) {
      return cached.data;
    }
    const { data, error } = await db.from('questions').select('*').eq('language', 'ar');
    if (error) throw error;
    sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    return data;
  }

  function init() {
    window.recordQuestionAttempt = recordQuestionAttempt;
    window.joinClass = joinClass;
    window.createClass = createClass;
    window.switchAdminTab = switchAdminTab;
    window.saveQuestionEdit = saveQuestionEdit;
    window.createHomework = createHomework;
    window.startMistakeReview = startMistakeReview;
    window.startExamReview = startExamReview;
    window.showCertificate = showCertificate;
    window.onboardingNext = onboardingNext;
    window.closeOnboarding = closeOnboarding;
    window.loadQuestionEditorList = loadQuestionEditorList;
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
        show('admin');
        switchAdminTab('students');
        loadTeacherClasses();
      },
    };
  }

  init();
})();
