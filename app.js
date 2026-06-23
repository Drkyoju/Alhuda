
const SUPABASE_URL = 'https://smcyaqwxbmhshhhhdece.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4OhSsWwIfV4QxGRf1fujLA_TjE111eU';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BOOK_LABELS = { tawheed:'كتاب التوحيد', usool:'الأصول الثلاثة', nawawi:'الأربعون النووية', merge3:'الكتب الثلاثة' };
const BOOK_BTN_MAP = { tawheed:'tawheed', usool:'usool', nawawi:'nawawi', merge3:'merge' };
const LEVEL_LABELS = { easy:'سهل', medium:'متوسط', hard:'صعب', all:'كل المستويات' };
const DEMO_COUNT = 8;
const GAME_RESUME_KEY = 'alhudaGameResumeV1';
const PENDING_SCORES_KEY = 'pendingScores';
const QUESTION_TIME_SEC = 45;
const TIMER_SAND_TOP_H = 18;
const TIMER_SAND_BOTTOM_H = 22;
const TIMER_SAND_TOP_Y = 12;
const TIMER_SAND_BOTTOM_Y = 56;
const LOGIN_LOCKED = true;
const FEEDBACK_NOTIFY_EMAIL = 'hd.hk1444920@gmail.com';
const CHAPTER_ORDER = {
  tawheed: ['🕌 حق الله','🕌 حق الله على العباد','📖 لماذا خُلقنا','🌟 فضل التوحيد','✅ تحقيق التوحيد','⚠️ الخوف من الشرك','⚠️ الشرك','📿 الرقى والتمائم','📚 مسائل متنوعة'],
  usool: ['👤 المؤلف','📖 الكتاب','📚 المسائل الأربع','📚 العلم','🕌 الرب','🙏 العبادة','👤 النبي','📿 الدين','🤲 الدعاء','🛡️ التوكل','🆘 الاستعانة','📿 الاستعاذة']
};
function chapterSortIndex(book, chapter) {
  const order = CHAPTER_ORDER[book];
  if (order) {
    const idx = order.indexOf(chapter);
    if (idx >= 0) return idx;
  }
  const m = (chapter || '').match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

let QUESTIONS = { tawheed:[], usool:[], nawawi:[] };
let state = { user:null, userType:'', userName:'', userEmail:'', book:'tawheed', level:'easy', questions:[], idx:0, score:0, hearts:5, streak:0, maxStreak:0, correct:0, wrong:0, answered:false, total:20, bankVersion:0, challengeMode:false, challengeCode:'', demoMode:false, demoBook:'', wrongLog:[], reviewIdx:0, reviewReturn:'results', homeworkId:null };
let trainingMode = false, soundOn = true, voiceOn = true, voiceReadAnswers = true, lastGameXp = 0, feedbackRating = 0, feedbackWantProgram = null, pendingLoginAfterDemo = false, loginInProgress = false;
let countdownTimer = null, questionTimerId = null, questionTimerLeft = QUESTION_TIME_SEC;
let gameEndTimer = null, syncPendingScoresInFlight = null;

const FEEDBACK_RATING_LABELS = {
  3: { emoji: '😍', label: 'أعجبني' },
  2: { emoji: '😐', label: 'عادي' },
  1: { emoji: '😞', label: 'ما أعجبني' },
};
const DEMO_FALLBACK = [
  { id:'demo1', book:'tawheed', type:'tf', q:'التوحيد هو إفراد الله تعالى بالعبادة.', tf:true, exp:'نعم! التوحيد هو إفراد الله في الربوبية والألوهية والأسماء والصفات.', quote:'«العبادة هي التوحيد»', page:12, cat:'🕌 حق الله' },
  { id:'demo2', book:'usool', type:'mc', q:'ما هي الأصول الثلاثة؟', a:['معرفة الرب ومعرفة الدين ومعرفة نبيك','الصلاة والزكاة والصوم','الإيمان والإحسان والإخلاص','القرآن والسنة والإجماع'], c:0, exp:'الأصول الثلاثة: معرفة الرب، ومعرفة الدين بمعرفة دينك، ومعرفة نبيك محمد ﷺ.', quote:'«تَعَلَّمْ أَنَّهُ لَا يَجِبُ عَلَى أَحَدٍ مِنَ الْخَلْقِ أَنْ يُعَبَّدَ إِلَّا اللَّهُ»', page:8, cat:'📚 المسائل الأربع' },
  { id:'demo3', book:'nawawi', type:'tf', q:'أول حديث في الأربعون النووية: «إنما الأعمال بالنيات».', tf:true, exp:'صحيح! وهو أول حديث في الأربعون النووية للإمام النووي رحمه الله.', quote:'«إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ»', page:1, cat:'الأربعون النووية' },
  { id:'demo4', book:'tawheed', type:'tf', q:'الشرك الأكبر يُخرج من الملة.', tf:true, exp:'الشرك الأكبر من أعظم الكبائر ويُبقي صاحبه في النار إن مات عليه.' },
  { id:'demo5', book:'usool', type:'tf', q:'العبادة هي الطاعة والخضوع لله.', tf:true, exp:'العبادة اسم جامع لكل ما يحبه الله ويرضاه من الأقوال والأعمال.' },
];

const LEVELS = [
  { min: 0, title: 'مبتدئ/ة 🌱' },
  { min: 100, title: 'طالب/ة 📖' },
  { min: 300, title: 'متعلم/ة ⭐' },
  { min: 600, title: 'باحث/ة 🔍' },
  { min: 1000, title: 'عالم/ة 🎓' },
  { min: 2000, title: 'حافظ/ة 📚' },
];
const BADGES = {
  first_game: { icon: '🎮', name: 'أول لعبة', desc: 'لعبت أول مرة!' },
  streak_3: { icon: '🔥', name: 'سلسلة نار', desc: '٣ إجابات متتالية' },
  streak_5: { icon: '💫', name: 'نجمة لامعة', desc: '٥ إجابات متتالية' },
  perfect: { icon: '💯', name: 'كمال', desc: 'كل الإجابات صحيحة!' },
  daily_3: { icon: '📅', name: 'ملتزم/ة', desc: '٣ أيام متتالية' },
  score_100: { icon: '⭐', name: 'مئة نقطة', desc: 'جمعتَ/ِ ١٠٠ نقطة' },
  games_10: { icon: '🏆', name: 'محترف/ة', desc: 'لعبتَ/ِ ١٠ ألعاب' },
  stage_clear: { icon: '🏅', name: 'جولة ناجحة', desc: 'أنهيتَ/ِ جولة بنجاح!' },
};
const ENCOURAGE_OK = ['ممتاز! 🌟', 'أحسنت! 🎉', 'رائع! ⭐', 'مبدع/ة! 💫', 'بارك الله فيك! 🤲'];
const ENCOURAGE_BAD = ['لا بأس! حاول/ي مرة أخرى 💪', 'تعلّمنا من الخطأ 📖', 'واصل/ي! أنت قادر/ة 🌱'];
const DEFAULT_PLAYER = 'بطل/ة';

function isRealGameLocked() {
  return LOGIN_LOCKED && !state.demoMode;
}

function showRealGameLockedAlert() {
  showAlert('🔒 الأسئلة الكاملة مغلقة حالياً — جرّب/ي النموذج التجريبي فقط (٨ أسئلة لكل كتاب)');
}

function setAppLoading(show, msg) {
  const el = document.getElementById('app-loading');
  if (!el) return;
  el.classList.toggle('show', !!show);
  el.setAttribute('aria-busy', show ? 'true' : 'false');
  el.setAttribute('aria-hidden', show ? 'false' : 'true');
  const p = el.querySelector('p');
  if (p && msg) p.textContent = msg;
}

function setFontPreset(size) {
  adjustFontSize(size);
  document.querySelectorAll('.font-preset-btn').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.size) === Number(size));
  });
}

function showGameTutorialIfNeeded() {
  if (localStorage.getItem('gameTutorialDone')) return;
  if (sessionStorage.getItem('skipGameTutorial')) return;
  const ov = document.getElementById('game-tutorial-overlay');
  if (!ov) return;
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  trapFocusInOverlay(ov);
}

function gameTutorialNext() {
  const slides = document.querySelectorAll('.gt-slide');
  let idx = 0;
  slides.forEach((s, i) => { if (s.classList.contains('active')) idx = i; });
  if (idx >= slides.length - 1) {
    closeGameTutorial();
    return;
  }
  slides[idx].classList.remove('active');
  slides[idx + 1].classList.add('active');
  document.querySelectorAll('.gt-dot').forEach((d, i) => d.classList.toggle('on', i === idx + 1));
}

function closeGameTutorial() {
  localStorage.setItem('gameTutorialDone', '1');
  const ov = document.getElementById('game-tutorial-overlay');
  if (ov) {
    ov.classList.remove('open');
    ov.setAttribute('aria-hidden', 'true');
    releaseFocusTrap(ov);
  }
}

function feedbackRatingLabel(rating) {
  const r = FEEDBACK_RATING_LABELS[rating];
  return r ? `${r.emoji} ${r.label}` : `💬 ${rating}`;
}

async function syncPendingFeedback() {
  let backup;
  try { backup = JSON.parse(localStorage.getItem('feedbackBackup') || '[]'); } catch { return []; }
  let changed = false;
  for (const item of backup) {
    if (item.cloudSaved) continue;
    const result = await saveFeedbackToCloud(buildFeedbackInsertRow(item));
    if (result.ok) {
      item.cloudSaved = true;
      changed = true;
    }
  }
  if (changed) localStorage.setItem('feedbackBackup', JSON.stringify(backup.slice(0, 200)));
  return backup;
}

function buildFeedbackInsertRow(item) {
  const demoGuest = (item.source || 'demo') === 'demo';
  return {
    user_name: item.user_name,
    user_email: item.user_email || null,
    user_id: demoGuest ? null : (item.user_id || null),
    rating: item.rating,
    message: item.message,
    source: item.source || 'demo',
  };
}
async function saveFeedbackToCloud(row) {
  const { error } = await db.from('feedback').insert(row, { returning: 'minimal' });
  if (error) {
    console.warn('feedback insert:', error.message, error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function notifyFeedbackEmail(payload) {
  const emailBody = {
    user_name: payload.user_name,
    rating: payload.rating,
    ratingLabel: feedbackRatingLabel(payload.rating),
    message: payload.message,
    source: payload.source || 'demo',
  };

  try {
    const res = await fetch('/api/feedback-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailBody),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.ok) return true;
    }
  } catch (e) {
    console.warn('feedback email worker:', e);
  }
  return false;
}

function getProgress() {
  try { return JSON.parse(localStorage.getItem('playerProgress') || '{}'); } catch { return {}; }
}
function saveProgress(p) {
  localStorage.setItem('playerProgress', JSON.stringify(p));
}
function getDefaultProgress() {
  return { xp: 0, dailyStreak: 0, lastPlayDate: '', totalGames: 0, totalCorrect: 0, bestStreak: 0, bestScore: 0, completedStages: {}, badges: [], bookProgress: { tawheed: { answered: 0, correct: 0 }, usool: { answered: 0, correct: 0 }, nawawi: { answered: 0, correct: 0 } }, wrongQuestionIds: [], gameHistory: [], classId: null, classCode: '', className: '', dailyMissionDate: '', dailyMissionDone: false };
}
function ensureProgress() {
  const p = { ...getDefaultProgress(), ...getProgress() };
  saveProgress(p);
  return p;
}
function getBookQuestionCounts(book) {
  const all = getAllQuestions(book);
  return {
    easy: all.filter(q => q.level === 'easy').length,
    medium: all.filter(q => q.level === 'medium').length,
    hard: all.filter(q => q.level === 'hard').length,
    all: all.length
  };
}

function getOrderedPool(book, level) {
  let pool = getAllQuestions(book);
  if (level !== 'all') pool = pool.filter(q => q.level === level);
  if (book === 'merge3') {
    const bookOrder = { tawheed: 0, usool: 1, nawawi: 2 };
    pool.sort((a, b) => {
      const bb = (bookOrder[a.book] ?? 9) - (bookOrder[b.book] ?? 9);
      if (bb !== 0) return bb;
      const ca = chapterSortIndex(a.book, a.cat) - chapterSortIndex(b.book, b.cat);
      if (ca !== 0) return ca;
      const lvl = { easy: 0, medium: 1, hard: 2 };
      return (lvl[a.level] || 1) - (lvl[b.level] || 1);
    });
  }
  return pool;
}

function updateLevelCounts() {
  const c = getBookQuestionCounts(state.book);
  const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n ? `(${n})` : '(٠)'; };
  set('cnt-easy', c.easy);
  set('cnt-medium', c.medium);
  set('cnt-hard', c.hard);
  set('cnt-all', c.all);
}

function updateQuestionRangeUI() {
  const pool = getOrderedPool(state.book, state.level);
  const max = pool.length;
  const fromEl = document.getElementById('q-from-input');
  const toEl = document.getElementById('q-to-input');
  fromEl.max = Math.max(1, max);
  toEl.max = Math.max(1, max);
  if (max === 0) {
    fromEl.value = 1;
    toEl.value = 1;
    document.getElementById('pool-info').textContent = 'لا توجد أسئلة لهذا الاختيار';
    document.getElementById('q-range-hint').textContent = 'اختار/ي كتاباً أو مستوى آخر';
    document.getElementById('pool-breakdown').innerHTML = '';
    return;
  }
  let from = parseInt(fromEl.value, 10) || 1;
  let to = parseInt(toEl.value, 10) || Math.min(20, max);
  from = Math.max(1, Math.min(from, max));
  to = Math.max(from, Math.min(to, max));
  fromEl.value = from;
  toEl.value = to;
  const count = to - from + 1;
  const lvl = LEVEL_LABELS[state.level] || state.level;
  const book = BOOK_LABELS[state.book] || state.book;
  document.getElementById('pool-info').textContent = `${book} — ${lvl}: ${max} سؤال`;
  document.getElementById('q-range-hint').textContent = `${count} سؤالاً (من ${from} إلى ${to}) بالترتيب`;
  const counts = getBookQuestionCounts(state.book);
  document.getElementById('pool-breakdown').innerHTML = `
    <span class="pool-chip${state.level==='easy'?' on':''}">سهل ${counts.easy}</span>
    <span class="pool-chip${state.level==='medium'?' on':''}">متوسط ${counts.medium}</span>
    <span class="pool-chip${state.level==='hard'?' on':''}">صعب ${counts.hard}</span>
    <span class="pool-chip${state.level==='all'?' on':''}">الكل ${counts.all}</span>`;
}

function onRangeInputChange() {
  updateQuestionRangeUI();
}

function buildDemoQuestions(book) {
  const pool = dedupeQuestionList(getOrderedPool(book, 'all'));
  const out = [];
  const seen = new Set();
  for (const q of pool) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
    if (out.length >= DEMO_COUNT) return out;
  }
  for (const q of DEMO_FALLBACK) {
    if (q.book !== book) continue;
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
    if (out.length >= DEMO_COUNT) break;
  }
  return out.slice(0, DEMO_COUNT);
}

function arabicNum(n) {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

function updateDemoBookPicker() {
  const counts = { tawheed: 0, usool: 0, nawawi: 0 };
  for (const book of Object.keys(counts)) {
    counts[book] = buildDemoQuestions(book).length;
    const el = document.getElementById('demo-pick-count-' + book);
    if (el) el.textContent = arabicNum(counts[book]) + ' أسئلة';
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function setFormError(el, msg) {
  if (!el) return;
  el.style.color = 'var(--coral)';
  el.textContent = msg;
  el.setAttribute('role', 'alert');
}

function showAlert(message) {
  if (typeof showToast === 'function') showToast(message, 'err');
  else console.warn(message);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const ov = document.getElementById('confirm-overlay');
    const title = document.getElementById('confirm-title');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    if (!ov || !title || !ok || !cancel) {
      resolve(window.confirm(message));
      return;
    }
    title.textContent = message;
    ov.hidden = false;
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    const done = (val) => {
      ov.removeEventListener('keydown', onKey);
      ov.classList.remove('open');
      ov.hidden = true;
      document.body.style.overflow = '';
      ok.onclick = null;
      cancel.onclick = null;
      if (typeof releaseFocusTrap === 'function') releaseFocusTrap(ov);
      resolve(val);
    };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
    };
    ov.addEventListener('keydown', onKey);
    if (typeof trapFocusInOverlay === 'function') trapFocusInOverlay(ov, document.activeElement);
    ov.setAttribute('tabindex', '-1');
    ov.focus();
  });
}

async function insertScoreRow(row) {
  const uid = row.user_id || state.user?.id;
  if (!uid) return { ok: false, error: 'no user' };
  const { error: rpcErr } = await db.rpc('submit_score', {
    p_book: row.book,
    p_level: row.level,
    p_sub_level: row.sub_level || 1,
    p_score: row.score,
    p_correct: row.correct,
    p_total: row.total,
  });
  if (!rpcErr) return { ok: true };
  return { ok: false, error: rpcErr };
}

function queuePendingScore(row) {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_SCORES_KEY) || '[]');
    list.unshift({ ...row, queuedAt: Date.now() });
    localStorage.setItem(PENDING_SCORES_KEY, JSON.stringify(list.slice(0, 50)));
  } catch (e) {}
}

async function syncPendingScores() {
  if (!state.user?.id) return;
  if (syncPendingScoresInFlight) return syncPendingScoresInFlight;
  syncPendingScoresInFlight = (async () => {
    let list;
    try { list = JSON.parse(localStorage.getItem(PENDING_SCORES_KEY) || '[]'); } catch { return; }
    if (!list.length) return;
    const kept = [];
    for (const row of list) {
      if (row.user_id && row.user_id !== state.user.id) {
        kept.push(row);
        continue;
      }
      const r = await insertScoreRow({ ...row, user_id: state.user.id });
      if (r.ok) invalidateLbCache();
      else kept.push(row);
    }
    localStorage.setItem(PENDING_SCORES_KEY, JSON.stringify(kept));
  })().finally(() => { syncPendingScoresInFlight = null; });
  return syncPendingScoresInFlight;
}

function setFeedbackPanelOpen(open) {
  document.getElementById('game')?.classList.toggle('feedback-open', !!open);
}

function setFeedbackContinueVisible(visible) {
  const btn = document.querySelector('#feedback .fb-continue-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
}

function scheduleEndGame(delay = 1800) {
  if (state.gameEnded || state.gameEnding) return;
  state.gameEnding = true;
  setFeedbackContinueVisible(false);
  clearTimeout(gameEndTimer);
  gameEndTimer = setTimeout(() => {
    gameEndTimer = null;
    void endGame();
  }, delay);
}

async function saveGameScore(gamePoints, qFrom) {
  const row = {
    user_id: state.user.id,
    book: state.book,
    level: state.level,
    sub_level: qFrom,
    score: gamePoints,
    correct: state.correct,
    total: state.total,
    played_at: new Date().toISOString(),
  };
  const r = await insertScoreRow(row);
  if (r.ok) {
    document.body.dataset.scoreSave = 'ok';
    return;
  }
  queuePendingScore(row);
  document.body.dataset.scoreSave = 'error';
  showAlert('تعذّر حفظ النتيجة — سنحاول لاحقاً عند الاتصال');
}
function getLevelInfo(xp) {
  let lvl = LEVELS[0];
  for (const l of LEVELS) { if (xp >= l.min) lvl = l; }
  const idx = LEVELS.indexOf(lvl);
  const next = LEVELS[idx + 1];
  const curMin = lvl.min;
  const nextMin = next ? next.min : lvl.min + 500;
  const pct = next ? ((xp - curMin) / (nextMin - curMin)) * 100 : 100;
  return { title: lvl.title, xp, curMin, nextMin: next ? next.min : null, pct: Math.min(100, pct) };
}
function updateDailyStreak() {
  const p = ensureProgress();
  const today = new Date().toISOString().slice(0, 10);
  if (p.lastPlayDate === today) return p;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  p.dailyStreak = p.lastPlayDate === yesterday ? (p.dailyStreak || 0) + 1 : 1;
  p.lastPlayDate = today;
  saveProgress(p);
  return p;
}
function awardXP(amount) {
  const p = ensureProgress();
  const prevInfo = getLevelInfo(p.xp || 0);
  p.xp = (p.xp || 0) + amount;
  saveProgress(p);
  const newInfo = getLevelInfo(p.xp);
  if (amount > 0 && newInfo.title !== prevInfo.title) showLevelUp(newInfo.title);
  return p.xp;
}
function showLevelUp(title) {
  const el = document.getElementById('levelup-title-text');
  if (el) el.textContent = title;
  document.getElementById('levelup-overlay').classList.add('show');
  playSound('achievement');
}
function closeLevelUp() {
  document.getElementById('levelup-overlay').classList.remove('show');
}
function getBookProgress(book) {
  const c = getBookQuestionCounts(book);
  return { done: 0, total: c.all, counts: c };
}
function updateBookProgress() {
  const map = { tawheed: 'book-btn-tawheed', usool: 'book-btn-usool', nawawi: 'book-btn-nawawi', merge3: 'book-btn-merge' };
  for (const [book, id] of Object.entries(map)) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    let counts;
    if (book === 'merge3') {
      const t = getBookQuestionCounts('tawheed'), u = getBookQuestionCounts('usool'), n = getBookQuestionCounts('nawawi');
      counts = { easy: t.easy + u.easy + n.easy, medium: t.medium + u.medium + n.medium, hard: t.hard + u.hard + n.hard, all: t.all + u.all + n.all };
    } else {
      counts = getBookQuestionCounts(book);
    }
    let prog = btn.querySelector('.book-progress');
    if (!prog) {
      prog = document.createElement('div');
      prog.className = 'book-progress';
      btn.appendChild(prog);
    }
    prog.textContent = `${counts.all} سؤال`;
  }
}
function updateDailyMission() {
  if (window.AlhudaPlatform?.updateDailyMissionUI) {
    AlhudaPlatform.updateDailyMissionUI();
    return;
  }
  const p = ensureProgress();
  const el = document.getElementById('daily-mission');
  if (!el) return;
  const today = new Date().toISOString().slice(0, 10);
  if (p.dailyMissionDate !== today) {
    p.dailyMissionDate = today;
    p.dailyMissionDone = false;
    saveProgress(p);
  }
  const done = !!p.dailyMissionDone;
  el.classList.toggle('done', done);
  el.querySelector('.dm-icon').textContent = done ? '🏆' : '🎯';
  el.querySelector('.dm-sub').textContent = done ? 'عد/ي غداً لمهمة جديدة ✨' : 'أكمِل/ي جولة واحدة على الأقل';
  el.querySelector('.dm-title').textContent = done ? 'أتممتَ/ِ مهمة اليوم!' : 'مهمة اليوم';
  el.querySelector('.dm-check').textContent = done ? '✓' : '0/1';
}
function updateTopbarStats() {
  const xpChip = document.getElementById('topbar-xp');
  if (!state.userName) {
    xpChip.classList.remove('show');
    return;
  }
  const p = ensureProgress();
  xpChip.textContent = '✨ ' + (p.xp || 0);
  xpChip.classList.add('show');
}
function unlockBadge(id) {
  const p = ensureProgress();
  if (!p.badges) p.badges = [];
  if (p.badges.includes(id)) return false;
  p.badges.push(id);
  saveProgress(p);
  const b = BADGES[id];
  if (b) showAchievement(b.icon, b.name, b.desc);
  return true;
}
function showAchievement(icon, name, desc) {
  const t = document.getElementById('ach-toast');
  document.getElementById('ach-icon').textContent = icon;
  document.getElementById('ach-name').textContent = name;
  document.getElementById('ach-desc').textContent = desc;
  t.classList.add('show');
  playSound('achievement');
  setTimeout(() => t.classList.remove('show'), 3500);
}
function showXpFloat(amount, el) {
  const rect = el ? el.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
  const pop = document.createElement('div');
  pop.className = 'xp-float';
  pop.textContent = '+' + amount + ' ✨';
  pop.style.left = (rect.left + rect.width / 2 - 20) + 'px';
  pop.style.top = (rect.top - 10) + 'px';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1000);
}
function renderStars(pct) {
  const stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.5 ? 1 : 0;
  let h = '';
  for (let i = 0; i < 3; i++) h += i < stars ? '⭐' : '<span class="star-empty">⭐</span>';
  document.getElementById('res-stars').innerHTML = h;
  return stars;
}
function updateWelcomeGamification() {
  const p = ensureProgress();
  let last = {};
  try { last = JSON.parse(localStorage.getItem('lastStats') || '{}'); } catch { last = {}; }
  const info = getLevelInfo(p.xp || 0);
  document.getElementById('level-title').textContent = info.title;
  document.getElementById('level-xp-text').textContent = (p.xp || 0) + (info.nextMin ? ' / ' + info.nextMin : '') + ' نقطة خبرة';
  document.getElementById('xp-bar-fill').style.width = info.pct + '%';
  document.getElementById('stat-stars').textContent = last.score || 0;
  document.getElementById('stat-xp').textContent = p.xp || 0;
  document.getElementById('stat-games').textContent = p.totalGames || 0;
  updateDailyMission();
  updateBookProgress();
  updateTopbarStats();
  updateTopLeaderPreview();
}
function checkBadges(gameResult) {
  const p = ensureProgress();
  if (p.totalGames === 1) unlockBadge('first_game');
  if (gameResult.maxStreak >= 3) unlockBadge('streak_3');
  if (gameResult.maxStreak >= 5) unlockBadge('streak_5');
  if (gameResult.correct === gameResult.total && gameResult.total > 0) unlockBadge('perfect');
  if (p.dailyStreak >= 3) unlockBadge('daily_3');
  if (gameResult.score >= 100) unlockBadge('score_100');
  if (p.totalGames >= 10) unlockBadge('games_10');
}
let audioCtx;
function playSound(type) {
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    const freqs = { correct: 523, wrong: 200, achievement: 659, start: 440 };
    o.frequency.value = freqs[type] || 440;
    o.type = type === 'wrong' ? 'sawtooth' : 'sine';
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    o.start(); o.stop(audioCtx.currentTime + 0.2);
  } catch (e) {}
}
function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem('soundOn', soundOn);
  document.getElementById('sound-btn').textContent = soundOn ? '🔊 الأصوات (مفعل)' : '🔇 الأصوات (صامت)';
  if (soundOn) playSound('correct');
}

/* ── Voice reading (Edge Neural TTS + browser fallback) ── */
const TTS_VOICE = 'ar-SA-ZariyahNeural';
let cachedArabicVoice = null;
let ttsAudio = null;
let ttsAbort = null;
let ttsObjectUrl = null;

function stripForSpeech(text) {
  return removeQuranicVersesForSpeech(
    (text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Remove Quranic ayat from TTS — hadith and lesson text stay. */
function removeQuranicVersesForSpeech(text) {
  let s = (text || '').trim();
  if (!s) return '';

  s = s.replace(/﴿[\s\S]*?﴾/g, ' ');
  s = s.replace(/[\uFD40-\uFDFF\uFDF0-\uFDFF]+/g, ' ');
  s = s.replace(/\[[^\]]*سورة[^\]]*\]/gi, ' ');
  s = s.replace(/[-–—]\s*[^\s.]+\s*:\s*\d+/g, ' ');

  s = s.replace(
    /(قال|قوله|قالت)\s+(الله\s+)?تعالى\s*[:،]?\s*(?:\([^)]*\)|«[^»]*»|"[^"]*"|'[^']*')/gi,
    (_, verb, allah) => `${verb} ${allah ? 'الله ' : ''}تعالى`
  );
  s = s.replace(
    /(قال|قوله|قالت)\s+(الله\s+)?تعالى\s*"[^"]*"/gi,
    (_, verb, allah) => `${verb} ${allah ? 'الله ' : ''}تعالى`
  );
  s = s.replace(/«\s*(قال|قوله|قالت)\s+(الله\s+)?تعالى[^»]*»/gi, '«$1 $2تعالى»');

  s = s.replace(/\(\s*([^)]{10,})\s*\)/g, (m, inner) => (isQuranicAyahText(inner) ? ' ' : m));
  s = s.replace(/"([^"]{10,})"/g, (m, inner) => (isQuranicAyahText(inner) ? ' ' : m));

  return s.replace(/\s+/g, ' ').replace(/\s+([،.؛:])/g, '$1').trim();
}

function isQuranicAyahText(s) {
  const t = (s || '').replace(/[،.؛:!؟«»"[\]]/g, '').trim();
  if (!t || t.length < 10) return false;
  if (/^الإجابة\s*الصحيحة/i.test(t)) return false;
  if (/رواه|حديث|قال\s*النبي|رسول\s*الله|ﷺ|رضي\s*الله/i.test(t)) return false;
  if (/^(إنما\s+الأعمال|إن\s+الله\s+تجاوز|لا\s+يؤمن|من\s+حلف|إن\s+الحلال|البر\s+حسن)/i.test(t)) return false;
  if (/^(إن|إني|إنا|الذين|فمن|ومن|يا\s+أيها|تبارك|سبحان|قل|لقد|وما\s+خلقت|فلا\s+تخاف)/i.test(t)) return true;
  if (t.length >= 28 && /الله|إيمان|كفر|شرك|جنة|نار|عباد|ربك/i.test(t)) return true;
  return false;
}

function buildQuestionSpeechText(q) {
  return q?.q || '';
}

function buildFeedbackSpeechText(q) {
  const parts = [];
  const correct = getCorrectAnswerText(q);
  if (correct) parts.push(`الإجابة الصحيحة: ${correct}`);
  if (q?.exp) parts.push(q.exp);
  const quote = typeof pickCitationText === 'function' ? pickCitationText(q) : (q?.quote || '');
  if (quote) parts.push(String(quote).replace(/^«|»$/g, ''));
  const book = BOOK_LABELS[q?.book] || q?.book || '';
  if (book) parts.push(`من كتاب ${book}`);
  const pageLabel = q?.page != null ? formatPageLabel(q.page) : '';
  if (pageLabel) parts.push(pageLabel);
  return parts.filter(Boolean).join('. ');
}

function speakFeedback(q, wrongText) {
  if (!voiceOn || !q) return;
  const parts = [buildFeedbackSpeechText(q)];
  if (wrongText) parts.unshift(`إجابتك: ${wrongText}`);
  const text = parts.filter(Boolean).join('. ');
  if (text) speakText(text, null);
}

function scoreArabicVoice(v) {
  const name = (v.name || '').toLowerCase();
  const lang = (v.lang || '').toLowerCase();
  let score = 0;
  if (lang === 'ar-sa') score += 40;
  else if (lang.startsWith('ar')) score += 25;
  if (/zariyah|hamed|maj(ed)?|tarik|naayf|salma|shakir|premium|enhanced|neural|google|microsoft|natural/.test(name)) score += 30;
  if (/compact|low|robot|espeak|festival/.test(name)) score -= 40;
  if (v.localService === false) score += 10;
  return score;
}

function loadArabicVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices().filter(v => (v.lang || '').toLowerCase().includes('ar'));
  if (!voices.length) return null;
  voices.sort((a, b) => scoreArabicVoice(b) - scoreArabicVoice(a));
  cachedArabicVoice = voices[0];
  return cachedArabicVoice;
}

function clearTtsAudio(btn) {
  if (ttsAbort) {
    ttsAbort.abort();
    ttsAbort = null;
  }
  if (ttsAudio) {
    ttsAudio.onended = null;
    ttsAudio.onerror = null;
    ttsAudio.pause();
    ttsAudio = null;
  }
  if (ttsObjectUrl) {
    URL.revokeObjectURL(ttsObjectUrl);
    ttsObjectUrl = null;
  }
  if (btn) btn.classList.remove('speaking');
}

function stopSpeaking() {
  clearTtsAudio();
  document.querySelectorAll('.voice-btn.speaking').forEach(b => b.classList.remove('speaking'));
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function speakTextBrowser(text, btn) {
  if (!('speechSynthesis' in window)) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ar-SA';
  const voice = cachedArabicVoice || loadArabicVoice();
  if (voice) u.voice = voice;
  u.rate = 0.85;
  u.pitch = 1;
  if (btn) {
    btn.classList.add('speaking');
    u.onend = () => btn.classList.remove('speaking');
    u.onerror = () => btn.classList.remove('speaking');
  }
  speechSynthesis.speak(u);
  return true;
}

async function speakTextCloud(text, btn) {
  ttsAbort = new AbortController();
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: TTS_VOICE }),
    signal: ttsAbort.signal,
  });
  if (!res.ok) throw new Error('tts failed');
  const blob = await res.blob();
  if (!blob.size) throw new Error('empty audio');
  ttsObjectUrl = URL.createObjectURL(blob);
  ttsAudio = new Audio(ttsObjectUrl);
  if (btn) btn.classList.add('speaking');
  await ttsAudio.play();
  await new Promise((resolve, reject) => {
    ttsAudio.onended = resolve;
    ttsAudio.onerror = () => reject(new Error('audio error'));
  });
}

function toastTtsFail() {
  if (typeof showToast === 'function') showToast('تعذّر تشغيل الصوت — تحقق من الاتصال', 'err');
}

async function speakText(text, btn, { allowAnswers = false } = {}) {
  const maySpeak = voiceOn || (allowAnswers && voiceReadAnswers);
  if (!maySpeak || !text) return;
  const clean = stripForSpeech(text);
  if (!clean) return;
  stopSpeaking();
  try {
    await speakTextCloud(clean, btn);
  } catch (e) {
    if (e.name === 'AbortError') return;
    clearTtsAudio();
    console.warn('cloud tts:', e);
    if (!speakTextBrowser(clean, btn)) toastTtsFail();
    return;
  }
  clearTtsAudio(btn);
}

function speakQuestion() {
  const q = state.questions[state.idx];
  if (!q?.q || !voiceOn) return;
  speakText(buildQuestionSpeechText(q), document.getElementById('btn-speak-question'));
}

function onQuestionSpeakerClick() {
  if (voiceOn) {
    voiceOn = false;
    localStorage.setItem('voiceOn', 'false');
    stopSpeaking();
    updateVoiceUI();
    return;
  }
  voiceOn = true;
  localStorage.setItem('voiceOn', 'true');
  updateVoiceUI();
  speakQuestion();
}

function updateVoiceUI() {
  const voiceBtn = document.getElementById('voice-btn');
  const answersBtn = document.getElementById('voice-answers-btn');
  const qSpeak = document.getElementById('btn-speak-question');
  if (voiceBtn) {
    voiceBtn.textContent = voiceOn ? '🗣️ القراءة الصوتية (مفعل)' : '🔇 القراءة الصوتية (متوقف)';
    voiceBtn.classList.toggle('btn-green', voiceOn);
  }
  if (answersBtn) {
    answersBtn.textContent = voiceReadAnswers ? '📢 قراءة الإجابات (مفعل)' : '📢 قراءة الإجابات (متوقف)';
    answersBtn.classList.toggle('btn-green', voiceReadAnswers);
  }
  if (qSpeak) {
    qSpeak.textContent = voiceOn ? '🔊' : '🔇';
    qSpeak.classList.toggle('voice-on', voiceOn);
    qSpeak.classList.toggle('voice-off', !voiceOn);
    qSpeak.setAttribute('aria-label', voiceOn ? 'إيقاف الصوت' : 'تشغيل الصوت');
    qSpeak.setAttribute('aria-pressed', voiceOn ? 'true' : 'false');
  }
}

function toggleGameVoice() {
  toggleVoice();
}

function toggleVoice() {
  voiceOn = !voiceOn;
  localStorage.setItem('voiceOn', voiceOn);
  if (!voiceOn) stopSpeaking();
  updateVoiceUI();
  if (document.getElementById('game')?.classList.contains('active') && state.questions.length) renderQ();
}

function toggleVoiceAnswers() {
  voiceReadAnswers = !voiceReadAnswers;
  localStorage.setItem('voiceReadAnswers', voiceReadAnswers);
  updateVoiceUI();
  if (document.getElementById('game')?.classList.contains('active') && state.questions.length) renderQ();
}

function appendAnswerOption(grid, text, isOk, colorIdx) {
  const wrap = document.createElement('div');
  wrap.className = 'ans-row ans-row-single';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ans-btn ans-color-' + (colorIdx ?? 0);
  btn.textContent = text;
  btn.dataset.correct = isOk ? '1' : '0';
  btn.setAttribute('aria-pressed', 'false');
  btn.onclick = () => pick(btn, isOk);
  if (voiceReadAnswers) {
    wrap.className = 'ans-row';
    const sp = document.createElement('button');
    sp.type = 'button';
    sp.className = 'voice-btn voice-btn-sm';
    sp.setAttribute('aria-label', 'اقرأ الإجابة');
    sp.textContent = '🔊';
    sp.onclick = (e) => { e.stopPropagation(); speakText(text, sp, { allowAnswers: true }); };
    wrap.appendChild(btn);
    wrap.appendChild(sp);
    grid.appendChild(wrap);
    return;
  }
  wrap.appendChild(btn);
  grid.appendChild(wrap);
}

async function shareScore() {
  const text = '🎮 ' + state.userName + ' حصل/ت على ' + state.score + ' نقطة في المكتبة الثلاثية! ⭐\nجرّب/ي أنت أيضاً!';
  if (navigator.share) {
    try { await navigator.share({ title: 'المكتبة الثلاثية', text }); return; } catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('share-btn').textContent = '✅ تم النسخ!';
    setTimeout(() => { document.getElementById('share-btn').textContent = '📤 شارك/ي نتيجتك'; }, 2000);
  } catch (e) { showAlert(text); }
}

/* ── Demo & Feedback ── */
function getCorrectAnswerText(q) {
  if (q.type === 'tf') return q.tf ? 'صح ✓' : 'خطأ ✗';
  return q.a && q.c != null ? q.a[q.c] : '';
}

function formatPageLabel(page) {
  if (page == null || page === '') return '';
  const n = Number(page);
  if (!Number.isFinite(n)) return '';
  return 'ص ' + arabicNum(n);
}

function getCanonicalQuote(questionId) {
  return (window.CANONICAL_QUOTES || {})[questionId] || '';
}

function hasOcrTashkeelGaps(s) {
  return /[\u064B-\u065F]\s+[\u0621-\u064A]/.test(s || '') || /\s[\u064B-\u065F]/.test(s || '');
}

function stripArabicDiacritics(s) {
  return (s || '').replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '');
}

function hasBrokenArabicSpacing(s) {
  if (hasOcrTashkeelGaps(s)) return true;
  const toks = (s || '').split(/\s+/).filter(Boolean);
  if (toks.length < 4) return false;
  const singles = toks.filter((t) => t.replace(/[^\u0621-\u064A]/g, '').length <= 1).length;
  return singles / toks.length >= 0.35;
}

function collapseBrokenArabicSpaces(s) {
  if (!hasBrokenArabicSpacing(s)) {
    return stripArabicDiacritics(s).replace(/\s+/g, ' ').trim();
  }
  let out = stripArabicDiacritics(s);
  for (let i = 0; i < 50; i++) {
    const n = out.replace(/([\u0621-\u064A\u0671])\s+(?=[\u0621-\u064A\u0671])/g, '$1');
    if (n === out) return out;
    out = n;
  }
  return out;
}

function isWorksheetCitation(s) {
  return /اكتبي|أجيبي|أجيب على|معاني الكلمات|اذكري مناسبة|الأسئلة التالية|س\s*:|ج\s*:|الدليل على أنه|لشيخ الإسلام محمد بن عبدالوهاب.*\d|^[\/.]/i.test(s || '');
}

function hasGluedWords(s) {
  for (const tok of (s || '').split(/\s+/)) {
    const ar = tok.replace(/[^\u0621-\u064A]/g, '');
    if (ar.length > 15) return true;
  }
  return false;
}

function isGarbageCitation(s) {
  if (!s) return true;
  if (isWorksheetCitation(s)) return true;
  if (hasOcrTashkeelGaps(s)) return true;
  if (hasGluedWords(s)) return true;
  if ((s.match(/[a-zA-Z]/g) || []).length > 2) return true;
  return citationTextQuality(s) < 0.45;
}

function postFixCitationPhrases(s) {
  return (s || '')
    .replace(/\bأن ل إله\b/g, 'أن لا إله')
    .replace(/\bإلل لا\b/g, 'إلا الله')
    .replace(/\bإله إلل لا\b/g, 'إله إلا الله')
    .replace(/\bلا إله إلا الله\b/g, 'لا إله إلا الله')
    .replace(/\s+/g, ' ')
    .trim();
}

function citationTextQuality(s) {
  if (!s) return 0;
  const toks = s.split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  const short = toks.filter((t) => t.replace(/[^\u0621-\u064A]/g, '').length <= 1).length;
  const latin = (s.match(/[a-zA-Z]/g) || []).length;
  let score = 1 - short / toks.length - latin * 0.15;
  if (hasOcrTashkeelGaps(s)) score -= 0.4;
  if (isWorksheetCitation(s)) score = 0;
  return Math.max(0, score);
}

function cleanArabicCitation(raw, questionId) {
  if (questionId && getCanonicalQuote(questionId)) return getCanonicalQuote(questionId);
  if (!raw || isWorksheetCitation(raw)) return '';
  let s = raw.trim();
  s = s.replace(/^كتاب التوحيد[^.«]{0,120}?\d+\s*/u, '');
  s = s.replace(/لشيخ الإسلام محمد بن عبدالوهاب[^\n«]*/gi, '');
  s = s.replace(/[]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || isWorksheetCitation(s)) return '';
  s = postFixCitationPhrases(collapseBrokenArabicSpaces(s));
  if (isGarbageCitation(s)) return '';
  return s;
}

function extractExplanationSnippet(exp) {
  const text = (exp || '').trim();
  if (!text || isWorksheetCitation(text)) return '';
  const quoted = text.match(/«([^»]+)»/);
  if (quoted?.[1]) {
    const c = cleanArabicCitation(quoted[1]);
    if (!isGarbageCitation(c)) return c;
  }
  const sentences = text.split(/[.!؟\n]/).map((x) => x.trim()).filter((x) => x.length >= 12);
  let best = '';
  let bestQ = 0;
  for (const sent of sentences) {
    if (isWorksheetCitation(sent)) continue;
    const c = cleanArabicCitation(sent);
    const q = citationTextQuality(c);
    if (q > bestQ && !isGarbageCitation(c)) {
      best = c;
      bestQ = q;
    }
  }
  return best;
}

function formatCitationQuote(s) {
  const t = (s || '').trim();
  if (!t) return '';
  if (t.startsWith('«')) return t;
  return `«${t}»`;
}

function pickCitationText(q) {
  const candidates = [];
  const fromQuote = cleanArabicCitation(q.quote, q.id);
  if (fromQuote) candidates.push({ t: fromQuote, q: citationTextQuality(fromQuote) });
  const fromExp = extractExplanationSnippet(q.exp);
  if (fromExp) candidates.push({ t: fromExp, q: citationTextQuality(fromExp) });
  candidates.sort((a, b) => b.q - a.q);
  const best = candidates.find((c) => !isGarbageCitation(c.t));
  return best ? formatCitationQuote(best.t) : '';
}

function sanitizeBookQuote(text, questionId) {
  return cleanArabicCitation(text, questionId);
}

function buildBookCitationHtml(q) {
  const book = BOOK_LABELS[q.book] || q.book || '';
  const chapter = q.cat || '';
  const pageLabel = formatPageLabel(q.page);
  const quote = pickCitationText(q);
  if (!book && !chapter && !pageLabel && !quote) return '';
  let inner = '';
  if (quote) {
    inner += `<p class="book-cite-quote">${escapeHtml(quote)}</p>`;
  }
  const meta = [];
  if (book) meta.push(escapeHtml(book));
  if (chapter) meta.push(escapeHtml(chapter));
  if (pageLabel) meta.push(pageLabel);
  inner += `<p class="book-cite-meta">${meta.join(' · ') || 'راجع/ي نصّ الكتاب في هذا الباب'}</p>`;
  return `<p class="book-cite-heading">📖 الاستشهاد من الكتاب</p><div class="book-cite-box">${inner}</div>`;
}

function buildAnswerFeedbackHtml(q, isCorrect = true, wrongText = '') {
  const correctText = getCorrectAnswerText(q);
  const wrong = (wrongText || '').trim();
  let html = '<div class="answer-feedback">';
  if (!isCorrect && wrong) {
    html += '<div class="why-correct-box is-wrong">';
    html += '<p class="fb-wrong-label"><strong>❌ الإجابة الخاطئة:</strong></p>';
    html += `<p class="fb-wrong-answer">${escapeHtml(wrong)}</p>`;
    html += '</div>';
  }
  if (correctText) {
    const boxClass = isCorrect ? 'why-correct-box is-correct' : 'why-correct-box is-correct-reveal';
    html += `<div class="${boxClass}">`;
    html += '<p class="fb-correct-label"><strong>✅ الإجابة الصحيحة:</strong></p>';
    html += `<p class="fb-correct-answer">${escapeHtml(correctText)}</p>`;
    html += '</div>';
  }
  html += buildBookCitationHtml(q);
  html += '</div>';
  return html;
}

function clearQuestionTimer() {
  if (questionTimerId) {
    clearInterval(questionTimerId);
    questionTimerId = null;
  }
}

function updateTimerUI() {
  const sandTop = document.getElementById('q-timer-sand-top');
  const sandBottom = document.getElementById('q-timer-sand-bottom');
  const stream = document.getElementById('q-timer-stream');
  const num = document.getElementById('q-timer-num');
  const wrap = document.getElementById('q-timer');
  if (!num || !wrap) return;
  const pct = Math.max(0, questionTimerLeft / QUESTION_TIME_SEC);
  num.textContent = String(questionTimerLeft);
  if (sandTop) {
    const h = TIMER_SAND_TOP_H * pct;
    sandTop.setAttribute('height', String(h));
    sandTop.setAttribute('y', String(TIMER_SAND_TOP_Y + TIMER_SAND_TOP_H - h));
  }
  if (sandBottom) {
    const h = TIMER_SAND_BOTTOM_H * (1 - pct);
    sandBottom.setAttribute('height', String(h));
    sandBottom.setAttribute('y', String(TIMER_SAND_BOTTOM_Y - h));
  }
  if (stream) stream.style.opacity = pct > 0.02 && pct < 0.98 ? '1' : '0';
  wrap.setAttribute('aria-label', 'الوقت المتبقي ' + arabicNum(questionTimerLeft) + ' ثانية');
  wrap.classList.toggle('timer-warn', questionTimerLeft <= 10 && questionTimerLeft > 5);
  wrap.classList.toggle('timer-danger', questionTimerLeft <= 5);
}

function setTimerVisible(show) {
  const wrap = document.getElementById('q-timer');
  if (wrap) wrap.style.display = show ? 'flex' : 'none';
}

function startQuestionTimer() {
  clearQuestionTimer();
  if (trainingMode) {
    setTimerVisible(false);
    return;
  }
  setTimerVisible(true);
  questionTimerLeft = QUESTION_TIME_SEC;
  const deadline = Date.now() + QUESTION_TIME_SEC * 1000;
  updateTimerUI();
  questionTimerId = setInterval(() => {
    questionTimerLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    updateTimerUI();
    if (questionTimerLeft <= 0) {
      clearQuestionTimer();
      onQuestionTimeUp();
    }
  }, 250);
}

function onQuestionTimeUp() {
  if (state.answered) return;
  state.answered = true;
  document.querySelectorAll('.ans-btn').forEach(b => b.disabled = true);
  stopSpeaking();
  const q = state.questions[state.idx];
  const fb = document.getElementById('feedback');
  const n = state.userName || DEFAULT_PLAYER;
  const expEl = document.getElementById('fb-exp');
  const selfBox = document.getElementById('fb-self-correct');
  if (!trainingMode) state.wrongLog.push({ q, index: state.idx, picked: '—' });
  if (!trainingMode && !state.demoMode) {
    state.hearts--; state.streak = 0; state.wrong++;
    renderHearts();
    playSound('wrong');
    if (state.hearts <= 0) {
      fb.className = 'feedback show bad';
      document.getElementById('fb-icon').textContent = '💔';
      document.getElementById('fb-title').textContent = `${n}، انتهت المحاولات — راجع/ي أخطاءك لاحقاً 💪`;
      selfBox.style.display = 'none';
      expEl.textContent = '';
      setFeedbackPanelOpen(true);
      scheduleEndGame(1800);
      return;
    }
  } else if (state.demoMode) {
    state.wrong++;
    playSound('wrong');
  }
  fb.className = 'feedback show bad';
  document.getElementById('fb-icon').textContent = '⏱️';
  document.getElementById('fb-title').textContent = `${n}، انتهى الوقت!`;
  selfBox.style.display = 'none';
  expEl.innerHTML = buildAnswerFeedbackHtml(q, false);
  setFeedbackPanelOpen(true);
  setFeedbackContinueVisible(true);
}

function highlightCorrectAnswer(q) {
  document.querySelectorAll('.ans-btn').forEach((btn) => {
    if (btn.dataset.correct === '1') btn.classList.add('reveal-correct');
  });
}
function startDemoFromLogin() {
  document.getElementById('login-err').textContent = '';
  state.userName = '';
  state.demoMode = false;
  pendingLoginAfterDemo = true;
  updateDemoBookPicker();
  show('demo-intro');
}
function showDemoIntro(name) {
  const demoName = document.getElementById('demo-name');
  if (demoName) demoName.textContent = name || DEFAULT_PLAYER;
  updateDemoBookPicker();
  show('demo-intro');
}
async function beginDemo(book) {
  if (!book) book = state.demoBook || 'tawheed';
  const demoBtns = document.querySelectorAll('.demo-book-pick');
  demoBtns.forEach((b) => { b.disabled = true; });
  try {
    await loadBookQuestions(book);
  } catch (e) {
    showAlert('تعذّر تحميل أسئلة هذا الكتاب — تحقق/ي من الاتصال');
    show('demo-intro');
    return;
  } finally {
    demoBtns.forEach((b) => { b.disabled = false; });
  }
  state.demoBook = book;
  state.demoMode = true;
  state.wrongLog = [];
  state.questions = buildDemoQuestions(book);
  if (!state.questions.length) {
    showAlert('لا توجد أسئلة لهذا الكتاب — حاول/ي لاحقاً');
    show('demo-intro');
    return;
  }
  state.idx = 0; state.score = 0; state.hearts = 5; state.streak = 0;
  state.maxStreak = 0; state.correct = 0; state.wrong = 0; state.answered = false;
  state.total = state.questions.length;
  const bookLabel = BOOK_LABELS[book] || book;
  document.getElementById('demo-bar').textContent = `📝 نموذج تجريبي — ${bookLabel} — ${arabicNum(state.total)} أسئلة`;
  document.getElementById('demo-bar').style.display = 'block';
  document.getElementById('training-bar').style.display = 'none';
  document.getElementById('feedback').classList.remove('show', 'ok', 'bad');
  document.getElementById('fb-self-correct').style.display = 'none';
  renderHearts(); updateScore(); updateProgress();
  show('game');
  renderQ();
}
async function skipDemo() {
  localStorage.setItem('demoDone', '1');
  if (LOGIN_LOCKED) {
    pendingLoginAfterDemo = false;
    show('login-screen');
    return;
  }
  if (pendingLoginAfterDemo && !state.user) {
    pendingLoginAfterDemo = false;
    const name = (document.getElementById('login-name')?.value || '').trim();
    if (name) {
      await doLogin();
      return;
    }
    show('login-screen');
    return;
  }
  goHome();
}
function endDemo() {
  clearGameSession();
  state.demoMode = false;
  document.getElementById('demo-bar').style.display = 'none';
  feedbackRating = 0;
  feedbackWantProgram = null;
  document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('sel'));
  document.querySelectorAll('.want-program-btn').forEach(b => b.classList.remove('sel'));
  const fbName = document.getElementById('feedback-name');
  const fbAge = document.getElementById('feedback-age');
  if (fbName) fbName.value = state.user ? (state.userName || '') : '';
  if (fbAge) fbAge.value = '';
  const fbLike = document.getElementById('feedback-like');
  const fbImprove = document.getElementById('feedback-improve');
  if (fbLike) fbLike.value = '';
  if (fbImprove) fbImprove.value = '';
  document.getElementById('feedback-msg').textContent = '';
  const rd = document.getElementById('btn-review-demo');
  if (rd) rd.style.display = state.wrongLog.length ? 'block' : 'none';
  show('feedback-screen');
}
function setRating(r, el) {
  feedbackRating = r;
  document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
}
function setWantProgram(want, el) {
  feedbackWantProgram = want;
  document.querySelectorAll('.want-program-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
}
async function submitFeedback() {
  const name = (document.getElementById('feedback-name')?.value || '').trim();
  const age = (document.getElementById('feedback-age')?.value || '').trim();
  const likeText = (document.getElementById('feedback-like')?.value || '').trim();
  const improveText = (document.getElementById('feedback-improve')?.value || '').trim();
  const msgEl = document.getElementById('feedback-msg');
  const btn = document.getElementById('btn-submit-feedback');
  if (!FEEDBACK_RATING_LABELS[feedbackRating]) { setFormError(msgEl, 'اختار/ي: هل أعجبك البرنامج؟'); return; }
  if (feedbackWantProgram === null) { setFormError(msgEl, 'اختار/ي: هل تريد/ين استخدام البرنامج؟'); return; }
  if (!name) { setFormError(msgEl, 'اكتب/ي اسمك من فضلك'); return; }
  if (!age) { setFormError(msgEl, 'اكتب/ي عمرك من فضلك'); return; }
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  try {
  const parts = [];
  parts.push(`العمر: ${age}`);
  parts.push(`هل تريد/ين البرنامج؟ ${feedbackWantProgram ? 'نعم ✅' : 'لا ❌'}`);
  parts.push(`التقييم: ${feedbackRatingLabel(feedbackRating)}`);
  if (state.demoBook) parts.push(`الكتاب: ${BOOK_LABELS[state.demoBook] || state.demoBook}`);
  if (improveText) parts.push(`اقتراحات وتحسينات:\n${improveText}`);
  if (likeText) parts.push(`ملاحظات إضافية:\n${likeText}`);
  if (state.total) parts.push(`نتيجة النموذج: ${state.correct}/${state.total} صحيحة`);
  const fullMsg = parts.join('\n\n');
  const payload = {
    user_name: name || state.userName || 'مجهول',
    user_email: state.userEmail || null,
    user_id: state.user?.id || null,
    rating: feedbackRating,
    message: fullMsg,
    source: 'demo',
    created_at: new Date().toISOString(),
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    cloudSaved: false,
  };
  const saveResult = await saveFeedbackToCloud(buildFeedbackInsertRow(payload));
  payload.cloudSaved = saveResult.ok;
  payload.cloudError = saveResult.error || '';
  const emailSent = await notifyFeedbackEmail(payload);
  payload.emailSent = emailSent;
  const backup = JSON.parse(localStorage.getItem('feedbackBackup') || '[]');
  backup.unshift(payload);
  localStorage.setItem('feedbackBackup', JSON.stringify(backup.slice(0, 200)));
  if (!payload.cloudSaved) {
    await syncPendingFeedback();
    const refreshed = JSON.parse(localStorage.getItem('feedbackBackup') || '[]');
    if (refreshed.find(x => x.localId === payload.localId)?.cloudSaved) payload.cloudSaved = true;
  }
  if (payload.cloudSaved && emailSent) {
    msgEl.style.color = 'var(--emerald)';
    msgEl.textContent = '✅ شكراً! وصل رأيك/ِ بنجاح 💚';
    if (typeof showToast === 'function') showToast('تم إرسال رأيك بنجاح', 'info');
  } else if (payload.cloudSaved) {
    msgEl.style.color = 'var(--emerald)';
    msgEl.textContent = '✅ شكراً! تم حفظ رأيك/ِ 💚';
    if (typeof showToast === 'function') showToast('تم حفظ رأيك', 'info');
  } else if (emailSent) {
    msgEl.style.color = 'var(--orange)';
    msgEl.textContent = '⚠️ وصل رأيك/ِ — شكراً! حاول/ي لاحقاً إن لم يظهر في السجل';
    if (typeof showToast === 'function') showToast('تم الإرسال جزئياً', 'err');
  } else {
    msgEl.style.color = 'var(--orange)';
    msgEl.textContent = '⚠️ تعذّر الإرسال — تحقق/ي من الاتصال وحاول/ي مرة أخرى';
    if (typeof showToast === 'function') showToast('تعذّر الإرسال — حاول/ي لاحقاً', 'err');
  }
  state.userName = name;
  localStorage.setItem('savedName', name);
  const loginName = document.getElementById('login-name');
  if (loginName) loginName.value = name;
  localStorage.setItem('demoDone', '1');
  localStorage.setItem('demoFeedbackSubmitted', '1');
  const finishBtn = document.getElementById('btn-finish-demo');
  if (finishBtn) finishBtn.style.display = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'إرسال وحفظ رأيي 📨';
  }
}
async function finishDemoFlow() {
  if (localStorage.getItem('demoFeedbackSubmitted') !== '1') {
    const skip = await showConfirm('لم تُرسل/ِ التقييم بعد. هل تريد/ين المتابعة بدون إرسال؟');
    if (!skip) return;
  }
  localStorage.setItem('demoDone', '1');
  if (LOGIN_LOCKED) {
    pendingLoginAfterDemo = true;
    updateDemoBookPicker();
    show('demo-intro');
    return;
  }
  if (!state.user) {
    if (pendingLoginAfterDemo) {
      pendingLoginAfterDemo = false;
      const name = (document.getElementById('login-name')?.value || '').trim();
      if (name) {
        await doLogin();
        return;
      }
    }
    show('login-screen');
    return;
  }
  goHome();
}
function getFocusable(root) {
  if (!root) return [];
  return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
}

function trapFocusInOverlay(overlay, returnFocusEl) {
  if (!overlay) return;
  releaseFocusTrap(overlay);
  overlay._focusReturn = returnFocusEl || null;
  const focusables = getFocusable(overlay);
  focusables[0]?.focus();
  overlay._trapKeydown = (e) => {
    if (e.key !== 'Tab' || !focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('keydown', overlay._trapKeydown);
}

function releaseFocusTrap(overlay) {
  if (!overlay?._trapKeydown) return;
  overlay.removeEventListener('keydown', overlay._trapKeydown);
  overlay._trapKeydown = null;
  overlay._focusReturn?.focus();
  overlay._focusReturn = null;
}

function clearGameSession() {
  try { sessionStorage.removeItem(GAME_RESUME_KEY); } catch (e) {}
}

function persistGameSession() {
  if (!document.getElementById('game')?.classList.contains('active')) return;
  if (!state.questions?.length || state.idx >= state.questions.length) {
    clearGameSession();
    return;
  }
  try {
    sessionStorage.setItem(GAME_RESUME_KEY, JSON.stringify({
      at: Date.now(),
      demoMode: !!state.demoMode,
      demoBook: state.demoBook || '',
      book: state.book,
      level: state.level,
      qFrom: state.qFrom || 1,
      idx: state.idx,
      score: state.score,
      hearts: state.hearts,
      streak: state.streak,
      maxStreak: state.maxStreak,
      correct: state.correct,
      wrong: state.wrong,
      total: state.total,
      trainingMode: !!trainingMode,
      questionIds: state.questions.map((q) => q.id).filter(Boolean),
      wrongLog: state.wrongLog || [],
    }));
  } catch (e) {}
}

async function tryRestoreGameSession() {
  let data;
  try {
    const raw = sessionStorage.getItem(GAME_RESUME_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch (e) {
    clearGameSession();
    return false;
  }
  if (LOGIN_LOCKED && !data?.demoMode) {
    clearGameSession();
    return false;
  }
  if (!data?.questionIds?.length || Date.now() - (data.at || 0) > 3600000) {
    clearGameSession();
    return false;
  }
  if (!(await showConfirm('لديك/ِ جولة غير مكتملة. هل تريد/ين متابعتها؟'))) {
    clearGameSession();
    return false;
  }
  try {
    await ensureBooksLoaded(QUESTION_BOOKS);
  } catch (e) {
    clearGameSession();
    if (typeof showToast === 'function') showToast('تعذّر استئناف الجولة — تحقق/ي من الاتصال', 'err');
    return false;
  }
  const qs = resolveQuestionsByIds(data.questionIds);
  if (qs.length !== data.questionIds.length) {
    clearGameSession();
    if (typeof showToast === 'function') showToast('تعذّر استئناف الجولة — حمّل/ي الأسئلة مجدداً', 'err');
    return false;
  }
  state.questions = qs;
  state.demoMode = !!data.demoMode;
  state.demoBook = data.demoBook || '';
  state.book = data.book || 'tawheed';
  state.level = data.level || 'easy';
  state.qFrom = data.qFrom || 1;
  state.idx = data.idx || 0;
  state.score = data.score || 0;
  state.hearts = data.hearts ?? 5;
  state.streak = data.streak || 0;
  state.maxStreak = data.maxStreak || 0;
  state.correct = data.correct || 0;
  state.wrong = data.wrong || 0;
  state.total = data.total || qs.length;
  state.wrongLog = data.wrongLog || [];
  state.answered = false;
  trainingMode = !!data.trainingMode;
  document.getElementById('demo-bar').style.display = state.demoMode ? 'block' : 'none';
  document.getElementById('training-bar').style.display = trainingMode ? 'block' : 'none';
  show('game');
  renderQ();
  if (typeof showToast === 'function') showToast('تم استئناف الجولة', 'info');
  return true;
}

function toggleSettings() {
  const ov = document.getElementById('settings-overlay');
  const open = ov.classList.toggle('open');
  document.body.style.overflow = open ? 'hidden' : '';
  ov.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (!open) {
    document.body.classList.remove('training-active');
    releaseFocusTrap(ov);
    if (ov._escHandler) {
      document.removeEventListener('keydown', ov._escHandler);
      ov._escHandler = null;
    }
  } else {
    trapFocusInOverlay(ov, document.getElementById('settings-btn'));
    ov._escHandler = (e) => { if (e.key === 'Escape') toggleSettings(); };
    document.addEventListener('keydown', ov._escHandler);
  }
}
function adjustFontSize(size) {
  document.documentElement.style.setProperty('--base-font-size', size + 'px');
  const label = document.getElementById('fs-label');
  if (label) label.textContent = size;
  localStorage.setItem('fontSize', size);
  document.querySelectorAll('.font-preset-btn').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.size) === Number(size));
  });
}

/* ── Data ── */
function normQuestionText(text) {
  return (text || '')
    .replace(/[\uf000-\uf0ff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\w\u0600-\u06FF\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNearDuplicateQuestion(a, b) {
  const na = normQuestionText(a);
  const nb = normQuestionText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length > 15 && (na.includes(nb) || nb.includes(na))) return true;
  const aw = na.split(' ');
  const bw = nb.split(' ');
  if (!aw.length || !bw.length) return false;
  let inter = 0;
  const bwSet = new Set(bw);
  for (const w of aw) if (bwSet.has(w)) inter++;
  return inter / Math.max(aw.length, bw.length) >= 0.9;
}

function pickBetterQuestion(a, b) {
  const la = (a.q || '').length;
  const lb = (b.q || '').length;
  if (la !== lb) return la > lb ? a : b;
  return a;
}

function dedupeQuestionList(questions) {
  const kept = [];
  for (const q of questions) {
    const idx = kept.findIndex(k => k.book === q.book && isNearDuplicateQuestion(k.q, q.q));
    if (idx === -1) {
      kept.push(q);
      continue;
    }
    const better = pickBetterQuestion(kept[idx], q);
    if (better === q) kept[idx] = q;
  }
  return kept;
}

function dedupeGameQuestions(questions) {
  return dedupeQuestionList(questions);
}

function ingestBookQuestions(book, rows) {
  if (!['tawheed', 'usool', 'nawawi'].includes(book)) return;
  const mapped = (rows || []).map((q) => ({
    id: q.id, book: q.book, cat: q.chapter, level: q.level, type: q.type,
    q: q.question_text, a: q.type === 'mc' ? q.options : null,
    c: q.type === 'mc' ? q.correct_index : null, tf: q.type === 'tf' ? q.is_true : null, exp: q.explanation,
    quote: q.source_quote || null, page: q.book_page != null ? q.book_page : null,
  }));
  mapped.sort((a, b) => {
    const ca = chapterSortIndex(book, a.cat);
    const cb = chapterSortIndex(book, b.cat);
    if (ca !== cb) return ca - cb;
    const lvl = { easy: 0, medium: 1, hard: 2 };
    return (lvl[a.level] || 1) - (lvl[b.level] || 1);
  });
  const before = mapped.length;
  QUESTIONS[book] = dedupeQuestionList(mapped);
  const removed = before - QUESTIONS[book].length;
  if (removed > 0) console.info(`[questions] removed ${removed} near-duplicate(s) in ${book}`);
}

async function fetchBookQuestions(book) {
  const res = await db.from('questions').select('*').eq('language', 'ar').eq('book', book);
  return { data: res.data, error: res.error };
}

const QUESTION_BOOKS = ['tawheed', 'usool', 'nawawi'];
const bookLoadState = { tawheed: false, usool: false, nawawi: false };
const bookLoadPromises = {};

function booksForState(book) {
  if (book === 'merge3') return [...QUESTION_BOOKS];
  if (QUESTION_BOOKS.includes(book)) return [book];
  return [...QUESTION_BOOKS];
}

function updateLoginQuestionHint() {
  const hint = document.getElementById('login-hint');
  if (!hint) return;
  if (LOGIN_LOCKED) {
    hint.textContent = '📝 النموذج التجريبي فقط — ٨ أسئلة لكل كتاب';
    return;
  }
  const total = QUESTION_BOOKS.reduce((n, b) => n + (QUESTIONS[b]?.length || 0), 0);
  if (total <= 0) return;
  const allLoaded = QUESTION_BOOKS.every((b) => bookLoadState[b]);
  hint.textContent = allLoaded
    ? '📚 ' + total + ' سؤال في انتظارك!'
    : '📚 ' + total + '+ سؤال — جاري تحميل الباقي...';
}

async function loadBookQuestions(book) {
  if (!QUESTION_BOOKS.includes(book)) return [];
  if (bookLoadState[book] && QUESTIONS[book]?.length) return QUESTIONS[book];
  if (bookLoadPromises[book]) return bookLoadPromises[book];
  bookLoadPromises[book] = (async () => {
    const { data, error } = await fetchBookQuestions(book);
    if (error) throw error;
    ingestBookQuestions(book, data || []);
    bookLoadState[book] = true;
    updateLevelCounts();
    updateDemoBookPicker();
    updateLoginQuestionHint();
    return QUESTIONS[book];
  })();
  try {
    return await bookLoadPromises[book];
  } catch (e) {
    delete bookLoadPromises[book];
    throw e;
  }
}

async function ensureBooksLoaded(books) {
  await Promise.all([...new Set(books)].map((b) => loadBookQuestions(b)));
}

function loadRemainingBooksInBackground() {
  Promise.all(
    QUESTION_BOOKS.filter((b) => !bookLoadState[b]).map((b) => loadBookQuestions(b))
  ).then(() => {
    updateLoginQuestionHint();
    updateLevelCounts();
  }).catch((e) => console.warn('background question load:', e));
}

async function loadQuestions() {
  setAppLoading(true, 'جاري تحميل الأسئلة...');
  try {
    if (window.AlhudaPlatform?.loadQuestionsCached) {
      try {
        const data = await AlhudaPlatform.loadQuestionsCached();
        const fmt = { tawheed: [], usool: [], nawawi: [] };
        (data || []).forEach((q) => { if (fmt[q.book]) fmt[q.book].push(q); });
        for (const book of QUESTION_BOOKS) {
          ingestBookQuestions(book, fmt[book]);
          bookLoadState[book] = true;
        }
        updateLoginQuestionHint();
        return;
      } catch (e) { /* cache miss — lazy load */ }
    }
    await loadBookQuestions('tawheed');
    updateLoginQuestionHint();
    loadRemainingBooksInBackground();
  } catch (e) {
    console.error(e);
    const hint = document.getElementById('login-hint');
    if (hint) {
      hint.textContent = navigator.onLine === false
        ? '⚠️ لا يوجد اتصال — تحقق/ي من الشبكة'
        : '⚠️ تعذّر تحميل الأسئلة — تحقق من الاتصال';
    }
    if (typeof showToast === 'function') {
      showToast(
        navigator.onLine === false ? 'لا يوجد اتصال بالإنترنت' : 'تعذّر تحميل الأسئلة — تحقق من الاتصال',
        'err'
      );
    }
  } finally {
    setAppLoading(false);
  }
}

function getAllQuestions(book) {
  if (book === 'tawheed') return QUESTIONS.tawheed || [];
  if (book === 'usool') return QUESTIONS.usool || [];
  if (book === 'nawawi') return QUESTIONS.nawawi || [];
  if (book === 'merge3') return [...(QUESTIONS.tawheed||[]), ...(QUESTIONS.usool||[]), ...(QUESTIONS.nawawi||[])];
  return [];
}

function resolveQuestionsByIds(ids) {
  const map = new Map();
  for (const q of getAllQuestions('merge3')) {
    if (q?.id) map.set(q.id, q);
  }
  return (ids || []).map((id) => map.get(id)).filter(Boolean);
}

function parseChallengePayload(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (raw.v >= 2 && Array.isArray(raw.ids) && raw.ids.length) {
    return resolveQuestionsByIds(raw.ids);
  }
  if (Array.isArray(raw.ids) && raw.ids.length) {
    return resolveQuestionsByIds(raw.ids);
  }
  return [];
}

function getQuestionsForGame() {
  const pool = getOrderedPool(state.book, state.level);
  if (!pool.length) return [];
  const fromEl = document.getElementById('q-from-input');
  const toEl = document.getElementById('q-to-input');
  let from = parseInt(fromEl.value, 10) || 1;
  let to = parseInt(toEl.value, 10) || pool.length;
  from = Math.max(1, Math.min(from, pool.length));
  to = Math.max(from, Math.min(to, pool.length));
  fromEl.value = from;
  toEl.value = to;
  let slice = pool.slice(from - 1, to);
  if (state.bankVersion > 0) {
    const seed = (state.book === 'tawheed' ? 1 : state.book === 'usool' ? 2 : state.book === 'nawawi' ? 4 : 7) * 10000 + from * 100 + state.bankVersion;
    slice = seededShuffle(slice, seed);
  }
  return dedupeGameQuestions(slice);
}

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function refreshQuestions() {
  sessionStorage.removeItem('questionsCacheV3');
  QUESTION_BOOKS.forEach((b) => {
    bookLoadState[b] = false;
    delete bookLoadPromises[b];
    QUESTIONS[b] = [];
  });
  const btn = document.getElementById('btn-start-game');
  if (btn) btn.textContent = 'جاري التحديث...';
  ensureBooksLoaded(booksForState(state.book)).then(() => {
    state.bankVersion++;
    updateQuestionRangeUI();
    updateLoginQuestionHint();
    if (btn) {
      btn.textContent = '✅ تم التحديث!';
      setTimeout(() => { btn.textContent = 'ابدأ اللعبة 🎮'; }, 2000);
    }
  }).catch(() => {
    if (typeof showToast === 'function') showToast('تعذّر تحديث الأسئلة', 'err');
    if (btn) btn.textContent = 'ابدأ اللعبة 🎮';
  });
}

function updateBismillahPadding() {
  const crown = document.getElementById('bismillah-crown');
  if (!crown) return;
  const h = crown.offsetHeight || 118;
  document.documentElement.style.setProperty('--bismillah-crown-h', h + 'px');
}

function clearCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  const ov = document.getElementById('countdown-overlay');
  if (ov) ov.style.display = 'none';
}

/* ── Navigation ── */
function show(id) {
  if (LOGIN_LOCKED && id === 'welcome') {
    show('login-screen');
    return;
  }
  if (id !== 'game') {
    clearCountdown();
    stopSpeaking();
    clearQuestionTimer();
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (!screen) {
    console.warn('show: unknown screen', id);
    return;
  }
  screen.classList.add('active');
  document.body.classList.toggle('login-mode', id === 'login-screen');
  document.body.classList.toggle('game-mode', id === 'game');
  document.body.classList.toggle('immersive-mode', id === 'game' || id === 'results' || id === 'gameover');
  document.body.style.overflow = '';
  updateBismillahPadding();
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  if (id === 'game') showGameTutorialIfNeeded();
}

function updateWelcomeStats() {
  updateWelcomeGamification();
}

function goBackFromFeature() {
  if (state.user && !LOGIN_LOCKED) goHome();
  else show('login-screen');
}

function showLevelsPreview() {
  const el = document.getElementById('levels-preview-content');
  if (!el) return;
  const levelsHtml = LEVELS.map((l, i) => {
    const next = LEVELS[i + 1];
    const range = next ? `${l.min} – ${next.min - 1} نقطة` : `${l.min}+ نقطة`;
    return `<div class="levels-preview-row"><span>${l.title}</span><span class="levels-preview-pts">${range}</span></div>`;
  }).join('');
  const badgesHtml = Object.values(BADGES).map(b =>
    `<div class="levels-preview-badge"><span class="b-icon">${b.icon}</span><span class="b-name">${b.name}</span><span class="b-desc">${b.desc}</span></div>`
  ).join('');
  el.innerHTML = `
    <p class="section-label" style="margin-top:0;">📈 المستويات</p>
    <div class="levels-preview-list">${levelsHtml}</div>
    <p class="section-label">🏅 الشارات</p>
    <div class="levels-preview-badges">${badgesHtml}</div>
    <p style="font-size:0.8em;color:var(--text-soft);text-align:center;margin-top:12px;font-weight:700;">ادخل/ي باسمك والعب/ي لتحصل/ين عليها!</p>`;
  show('levels-preview-screen');
}

function shouldConfirmLeaveGame() {
  const gameEl = document.getElementById('game');
  if (!gameEl?.classList.contains('active')) return false;
  if (!state.questions?.length) return false;
  return state.idx < state.questions.length;
}

async function requestLeaveGame() {
  if (shouldConfirmLeaveGame()) {
    if (!(await showConfirm('هل تريد/ين الخروج؟ ستفقد/ين تقدّم هذه الجولة.'))) return;
  }
  stopSpeaking();
  clearQuestionTimer();
  clearGameSession();
  goHome();
}

function goHome() {
  clearGameSession();
  state.homeworkId = null;
  state.challengeMode = false;
  state.challengeCode = '';
  state.demoMode = false;
  trainingMode = false;
  const trainingBtn = document.getElementById('training-btn');
  if (trainingBtn) {
    trainingBtn.textContent = '🏋️ وضع التدريب';
    trainingBtn.classList.remove('btn-green');
  }
  if (LOGIN_LOCKED || !state.user) {
    show('login-screen');
    return;
  }
  document.getElementById('welcome-user').textContent = '🎓 متعلم/ة · ' + state.userName;
  document.getElementById('welcome-greeting').textContent = 'مرحباً يا ' + state.userName + '! 👋';
  updateBookButtons();
  updateLevelCounts();
  updateQuestionRangeUI();
  updateWelcomeStats();
  if (window.AlhudaPlatform?.onWelcomeHome) AlhudaPlatform.onWelcomeHome();
  show('welcome');
  void syncPendingScores();
  if (window.AlhudaPlatform?.showOnboardingIfNeeded) AlhudaPlatform.showOnboardingIfNeeded();
}

function logout() {
  void db.auth.signOut().catch(() => {});
  state.user = null; state.userType = ''; state.userName = '';
  state.homeworkId = null;
  state.challengeMode = false;
  state.challengeCode = '';
  state.demoMode = false;
  trainingMode = false;
  updateTopbarStats();
  const loginName = document.getElementById('login-name');
  if (loginName) loginName.value = '';
  document.getElementById('login-err').textContent = '';
  show('login-screen');
}

async function doLogin() {
  if (LOGIN_LOCKED) {
    document.getElementById('login-err').textContent = '🔒 الدخول مغلق مؤقتاً — جرّب/ي النموذج التجريبي';
    return;
  }
  if (loginInProgress) return;
  document.getElementById('login-err').textContent = '';
  const btn = document.getElementById('btn-login');
  const btnLabel = btn?.textContent || 'دخول 🎮';
  loginInProgress = true;
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الدخول...'; }
  try {
    const name = document.getElementById('login-name').value.trim();
    if (!name) { setFormError(document.getElementById('login-err'), 'اكتب/ي اسمك من فضلك'); return; }
    if (name.length < 2) { setFormError(document.getElementById('login-err'), 'الاسم قصير جداً (حرفان على الأقل)'); return; }
    if (name.length > 40) { setFormError(document.getElementById('login-err'), 'الاسم طويل جداً (٤٠ حرفاً كحد أقصى)'); return; }

    const { data: { session: existingSession } } = await db.auth.getSession();
    if (existingSession?.user) {
      const { data: profile } = await db.from('profiles').select('name,role').eq('id', existingSession.user.id).maybeSingle();
      if (profile?.name && profile.name !== name) {
        await db.auth.signOut();
      }
    }

    const { data, error } = await studentSignIn(name);
    if (error) {
      setFormError(document.getElementById('login-err'), error.message || 'تعذّر الدخول');
      if (typeof showToast === 'function') showToast('تعذّر الدخول — تحقق/ي من الاسم', 'err');
      return;
    }
    const { data: existing } = await db.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    let profileErr;
    if (existing) {
      ({ error: profileErr } = await db.from('profiles').update({ name, role: 'student' }).eq('id', data.user.id));
    } else {
      ({ error: profileErr } = await db.from('profiles').upsert({ id: data.user.id, name, role: 'student' }));
    }
    if (profileErr) {
      setFormError(document.getElementById('login-err'), 'تعذّر حفظ الملف — حاول/ي مرة أخرى');
      return;
    }
    state.user = data.user; state.userType = 'student'; state.userName = name; state.userEmail = '';
    localStorage.setItem('savedName', name);
    if (typeof trackEvent === 'function') trackEvent('login', { role: 'student' });
    if (window.AlhudaPlatform?.syncUserClassFromDb) await AlhudaPlatform.syncUserClassFromDb();
    if (window.AlhudaPlatform?.syncWrongQuestionsFromDb) await AlhudaPlatform.syncWrongQuestionsFromDb();
    void syncPendingScores();
    if (!localStorage.getItem('demoDone')) {
      pendingLoginAfterDemo = false;
      showDemoIntro(name);
    } else {
      goHome();
    }
  } finally {
    loginInProgress = false;
    if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
  }
}

/* ── Book / Level selection ── */
function selectBook(b) {
  state.book = b;
  state.level = 'easy';
  state.bankVersion = 0;
  updateBookButtons();
  updateLevelCounts();
  selectLevel('easy');
  const toLoad = b === 'merge3' ? QUESTION_BOOKS : [b];
  toLoad.forEach((book) => loadBookQuestions(book).catch(() => {}));
}
function selectLevel(l) {
  state.level = l;
  state.bankVersion = 0;
  document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('sel'));
  const el = document.getElementById('btn-' + l);
  if (el) el.classList.add('sel');
  const pool = getOrderedPool(state.book, l);
  const max = pool.length;
  const toEl = document.getElementById('q-to-input');
  const fromEl = document.getElementById('q-from-input');
  if (fromEl) fromEl.value = 1;
  if (toEl) toEl.value = max ? Math.min(20, max) : 1;
  updateQuestionRangeUI();
}
function updateBookButtons() {
  document.querySelectorAll('.book-btn').forEach(b => b.classList.remove('sel'));
  const id = 'book-btn-' + (BOOK_BTN_MAP[state.book] || state.book);
  const el = document.getElementById(id);
  if (el) el.classList.add('sel');
}
async function startCountdown() {
  if (countdownTimer) return;
  if (isRealGameLocked()) {
    showRealGameLockedAlert();
    return;
  }
  if (!state.demoMode && !state.challengeMode) {
    try {
      await ensureBooksLoaded(booksForState(state.book));
    } catch (e) {
      if (typeof showToast === 'function') showToast('تعذّر تحميل أسئلة هذا الكتاب', 'err');
      return;
    }
    const qs = getQuestionsForGame();
    if (!qs.length) {
      showAlert('لا توجد أسئلة لهذا الاختيار. جرّب/ي كتاباً أو مستوى آخر.');
      return;
    }
  }
  const ov = document.getElementById('countdown-overlay');
  const num = document.getElementById('countdown-num');
  ov.style.display = 'flex';
  let n = 3;
  num.textContent = n;
  num.style.animation = 'none';
  void num.offsetWidth;
  num.style.animation = '';
  const iv = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(iv);
      countdownTimer = null;
      ov.style.display = 'none';
      startGame();
    } else {
      num.textContent = n;
      num.style.animation = 'none';
      void num.offsetWidth;
      num.style.animation = '';
      playSound('start');
    }
  }, 700);
  countdownTimer = iv;
}

function startGame() {
  if (isRealGameLocked()) {
    showRealGameLockedAlert();
    return;
  }
  if (!state.demoMode) {
    if (state.challengeMode) {
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem('ch_q_' + state.challengeCode) || 'null'); } catch { stored = null; }
      if (stored?.length) state.questions = stored;
      else if (!state.questions?.length) {
        showAlert('لا توجد أسئلة لهذا التحدي.');
        return;
      }
    } else {
      state.questions = getQuestionsForGame();
    }
  }
  if (state.questions.length === 0) { showAlert('لا توجد أسئلة لهذا الاختيار.'); return; }
  if (typeof trackEvent === 'function') trackEvent('game_start', { book: state.book, level: state.level, training: trainingMode });
  state.qFrom = parseInt(document.getElementById('q-from-input')?.value, 10) || 1;
  state.idx = 0; state.score = 0; state.hearts = 5; state.streak = 0;
  state.maxStreak = 0; state.correct = 0; state.wrong = 0; state.wrongLog = []; state.answered = false;
  state.gameEnded = false; state.gameEnding = false;
  clearTimeout(gameEndTimer);
  state.total = state.questions.length;
  renderHearts(); updateScore(); updateProgress();
  document.getElementById('feedback').classList.remove('show', 'ok', 'bad');
  setFeedbackPanelOpen(false);
  setFeedbackContinueVisible(true);
  document.getElementById('training-bar').style.display = trainingMode ? 'block' : 'none';
  document.getElementById('demo-bar').style.display = state.demoMode ? 'block' : 'none';
  document.getElementById('show-answer-btn').style.display = 'none';
  document.getElementById('res-xp-earned').style.display = 'none';
  show('game');
  renderQ();
}

function renderQ() {
  if (state.idx >= state.questions.length) { void endGame(); return; }
  stopSpeaking();
  const q = state.questions[state.idx];
  state.answered = false;
  document.getElementById('show-answer-btn').style.display = 'none';
  document.getElementById('q-num').textContent = (state.demoMode || state.challengeMode)
    ? `السؤال ${state.idx + 1} من ${state.total}`
    : `سؤال ${state.qFrom + state.idx} — ${state.idx + 1}/${state.total}`;
  document.getElementById('q-text').textContent = q.q;
  document.getElementById('q-book-badge').textContent = BOOK_LABELS[q.book] || q.book;
  document.getElementById('q-type-badge').style.display = q.type === 'tf' ? 'inline-block' : 'none';
  updateVoiceUI();
  updateProgress();
  const grid = document.getElementById('ans-grid');
  grid.innerHTML = '';
  if (q.type === 'tf') {
    ['صح ✓', 'خطأ ✗'].forEach((txt, i) => {
      appendAnswerOption(grid, txt, (i === 0) === q.tf, i === 0 ? 0 : 3);
    });
  } else {
    shuffleArr([0,1,2,3].slice(0, (q.a || []).length)).forEach((i, orderIdx) => {
      appendAnswerOption(grid, q.a[i], i === q.c, orderIdx);
    });
  }
  startQuestionTimer();
  if (voiceOn) speakQuestion();
  persistGameSession();
}

function pick(btn, isOk) {
  if (state.answered) return;
  clearQuestionTimer();
  stopSpeaking();
  state.answered = true;
  document.querySelectorAll('.ans-btn').forEach(b => b.disabled = true);
  const fb = document.getElementById('feedback');
  const q = state.questions[state.idx];
  const n = state.userName || DEFAULT_PLAYER;
  const expEl = document.getElementById('fb-exp');
  const selfBox = document.getElementById('fb-self-correct');
  if (q?.id && typeof recordQuestionAttempt === 'function') recordQuestionAttempt(q.id, isOk);

  if (isOk) {
    btn.classList.add('correct');
    btn.setAttribute('aria-pressed', 'true');
    selfBox.style.display = 'none';
    if (!trainingMode && !state.demoMode) {
      state.streak++; state.correct++;
      const pts = 10 + Math.min(state.streak * 2, 20);
      state.score += pts;
      if (state.streak > state.maxStreak) state.maxStreak = state.streak;
      updateScore();
      showXpFloat(pts, btn);
      if (state.streak >= 3) showCombo(state.streak);
      playSound('correct');
    } else if (state.demoMode) {
      state.correct++;
      playSound('correct');
    }
    launchCorrectBurst();
    fb.className = 'feedback show ok';
    document.getElementById('fb-icon').textContent = '🎉';
    document.getElementById('fb-title').textContent = state.demoMode ? `أحسنت يا ${n}! 🌟` : ENCOURAGE_OK[Math.floor(Math.random() * ENCOURAGE_OK.length)];
    expEl.innerHTML = buildAnswerFeedbackHtml(q, true);
    setFeedbackPanelOpen(true);
    setFeedbackContinueVisible(true);
    if (voiceOn) speakFeedback(q);
  } else {
    btn.classList.add('wrong');
    btn.setAttribute('aria-pressed', 'true');
    const picked = btn.textContent;
    if (!trainingMode) {
      state.wrongLog.push({ q, index: state.idx, picked });
    }
    if (!trainingMode && !state.demoMode) {
      state.hearts--; state.streak = 0; state.wrong++;
      renderHearts();
      playSound('wrong');
      if (state.hearts <= 0) {
        fb.className = 'feedback show bad';
        document.getElementById('fb-icon').textContent = '💔';
        document.getElementById('fb-title').textContent = `${n}، انتهت المحاولات — راجع/ي أخطاءك لاحقاً 💪`;
        selfBox.style.display = 'none';
        expEl.textContent = '';
        setFeedbackPanelOpen(true);
        scheduleEndGame(1800);
        return;
      }
    } else if (state.demoMode) {
      state.wrong++;
      playSound('wrong');
    } else if (trainingMode) {
      playSound('wrong');
    }
    fb.className = 'feedback show bad';
    document.getElementById('fb-icon').textContent = '🤔';
    document.getElementById('fb-title').textContent = `${n}، إجابة خاطئة — راجع/يها لاحقاً في «مراجعة الأخطاء»`;
    if (trainingMode) {
      selfBox.style.display = 'block';
      selfBox.innerHTML = '<p style="font-size:0.85em;margin-bottom:8px;color:var(--text-soft);">وضع التدريب — لا يُحسب ضدك</p><button type="button" class="btn btn-blue btn-sm" style="width:100%;" onclick="revealAnswer()">💡 إظهار الإجابة والشرح</button>';
      expEl.innerHTML = buildAnswerFeedbackHtml(q, false, picked);
    } else {
      selfBox.style.display = 'none';
      expEl.innerHTML = buildAnswerFeedbackHtml(q, false, picked);
    }
    document.getElementById('show-answer-btn').style.display = trainingMode ? 'block' : 'none';
    setFeedbackPanelOpen(true);
    setFeedbackContinueVisible(true);
    if (voiceOn) speakFeedback(q, picked);
  }
  persistGameSession();
}

function nextQ() {
  if (state.gameEnding || state.gameEnded) return;
  stopSpeaking();
  state.idx++;
  document.getElementById('feedback').classList.remove('show', 'ok', 'bad');
  setFeedbackPanelOpen(false);
  document.getElementById('fb-self-correct').style.display = 'none';
  document.getElementById('fb-exp').textContent = '';
  if (state.idx >= state.questions.length) {
    if (state.demoMode) endDemo();
    else void endGame();
  } else renderQ();
}

function updateReviewButtons() {
  const show = state.wrongLog.length > 0;
  ['btn-review-mistakes', 'btn-review-mistakes-go'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'inline-block' : 'none';
  });
}

function startReview(from) {
  if (!state.wrongLog.length) return;
  state.reviewIdx = 0;
  state.reviewReturn = from || (document.getElementById('gameover').classList.contains('active') ? 'gameover' : 'results');
  renderReviewItem();
  show('review-screen');
}

function renderReviewItem() {
  const item = state.wrongLog[state.reviewIdx];
  const q = item.q;
  const total = state.wrongLog.length;
  document.getElementById('review-progress').textContent = `خطأ ${state.reviewIdx + 1} من ${total}`;
  document.getElementById('review-q').textContent = q.q;
  document.getElementById('review-answer').innerHTML = '';
  document.getElementById('review-exp').innerHTML = buildAnswerFeedbackHtml(q, false, item.picked || '');
  const btn = document.getElementById('btn-review-next');
  btn.textContent = state.reviewIdx >= total - 1 ? 'إنهاء المراجعة ✓' : 'التالي ←';
}

function nextReview() {
  if (state.reviewIdx >= state.wrongLog.length - 1) {
    exitReview();
    return;
  }
  state.reviewIdx++;
  renderReviewItem();
}

function exitReview() {
  show(state.reviewReturn || 'results');
}

function revealAnswer() {
  if (!trainingMode) return;
  const q = state.questions[state.idx];
  if (q) highlightCorrectAnswer(q);
  const expEl = document.getElementById('fb-exp');
  if (q?.exp || q?.quote || q?.page) {
    expEl.innerHTML = buildAnswerFeedbackHtml(q, false);
  }
  document.getElementById('show-answer-btn').style.display = 'none';
}

async function endGame() {
  if (state.gameEnded) return;
  state.gameEnded = true;
  state.gameEnding = true;
  clearTimeout(gameEndTimer);
  setFeedbackPanelOpen(false);
  clearGameSession();
  if (state.demoMode) { endDemo(); return; }
  const pct = state.correct / Math.max(1, state.total);
  const isTraining = trainingMode;

  if (!isTraining) {
    localStorage.setItem('lastStats', JSON.stringify({ score: state.score, streak: state.maxStreak }));

    const p = ensureProgress();
    p.totalGames = (p.totalGames || 0) + 1;
    p.totalCorrect = (p.totalCorrect || 0) + state.correct;
    if (state.maxStreak > (p.bestStreak || 0)) p.bestStreak = state.maxStreak;
    if (state.score > (p.bestScore || 0)) p.bestScore = state.score;
    if (pct >= 0.5 && !state.demoMode) {
      unlockBadge('stage_clear');
    }
    saveProgress(p);
  }

  let xpGain = 0;
  if (!isTraining) {
    xpGain = Math.round(state.score * 0.5 + state.correct * 5 + (pct >= 0.7 ? 20 : 0));
    lastGameXp = xpGain;
    awardXP(xpGain);
    checkBadges({ score: state.score, correct: state.correct, total: state.total, maxStreak: state.maxStreak });
  } else {
    lastGameXp = 0;
  }

  if (state.user && !isTraining) {
    const qFrom = parseInt(document.getElementById('q-from-input')?.value, 10) || 1;
    const gamePoints = state.score + xpGain;
    await saveGameScore(gamePoints, qFrom);
  }

  if (state.hearts <= 0 && !isTraining) {
    document.getElementById('go-score').textContent = state.score;
    document.getElementById('go-cor').textContent = state.correct;
    document.getElementById('go-wr').textContent = state.wrong;
    updateReviewButtons();
    show('gameover');
  } else {
    const stars = renderStars(pct);
    document.getElementById('res-icon').textContent = isTraining ? '🏋️' : (stars === 3 ? '🏆' : stars >= 2 ? '🎉' : '📚');
    document.getElementById('res-title').textContent = isTraining ? 'انتهى التدريب' : (stars === 3 ? 'مذهلة!' : stars >= 2 ? 'أحسنت!' : 'جيد!');
    document.getElementById('res-sub').textContent = isTraining ? 'وضع التدريب — لا يُحسب في النقاط أو اللوحة' : (stars === 3 ? 'نتيجة ذهبية! أنت بطل/ة! 🌟' : stars >= 2 ? 'نتيجة رائعة! واصل/ي التعلّم 🌟' : 'واصل/ي المحاولة، أنت قادر/ة! 💪');
    document.getElementById('fin-score').textContent = state.score;
    document.getElementById('fin-correct').textContent = state.correct + '/' + state.total;
    document.getElementById('fin-streak').textContent = state.maxStreak;
    const xpEl = document.getElementById('res-xp-earned');
    if (isTraining) {
      xpEl.style.display = 'none';
    } else {
      xpEl.style.display = 'inline-block';
      xpEl.textContent = '+' + xpGain + ' نقطة خبرة ✨';
    }
    if (!isTraining && stars >= 2) launchConfetti();
    if (!isTraining && stars === 3) playSound('achievement');
    updateReviewButtons();
    show('results');
  }

  if (window.AlhudaPlatform?.onGameEndHook) await AlhudaPlatform.onGameEndHook();
}

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function updateScore() { document.getElementById('score-display').textContent = state.score; }
function updateProgress() {
  const pct = (state.idx / Math.max(1, state.total) * 100);
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = pct + '%';
  const strip = document.getElementById('q-progress-fill');
  const stripWrap = document.querySelector('.q-progress-strip');
  if (strip) strip.style.width = pct + '%';
  if (stripWrap) {
    stripWrap.setAttribute('aria-valuenow', String(Math.round(pct)));
    stripWrap.setAttribute('aria-valuetext', `السؤال ${state.idx + 1} من ${state.total}`);
  }
}
function renderHearts() {
  const c = document.getElementById('hearts');
  if (!c) return;
  const labels = ['لا محاولات', 'محاولة واحدة', 'محاولتان', '٣ محاولات', '٤ محاولات', '٥ محاولات'];
  c.setAttribute('aria-label', labels[state.hearts] || `${state.hearts} محاولات متبقية`);
  c.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    c.innerHTML += `<span aria-hidden="true" style="font-size:16px;transition:.3s;${i >= state.hearts ? 'filter:grayscale(1) opacity(.3);transform:scale(.75);' : ''}">❤️</span>`;
  }
}

function showCombo(s) {
  const c = document.getElementById('combo');
  c.textContent = '🔥 سلسلة × ' + s + '!';
  c.setAttribute('role', 'status');
  c.setAttribute('aria-live', 'polite');
  c.classList.add('show');
  setTimeout(() => c.classList.remove('show'), 2000);
}

function launchCorrectBurst() {
  const w = document.getElementById('confetti-wrap');
  if (!w) return;
  const cols = ['#34D399', '#FCD34D', '#7DD3FC', '#FB7185'];
  for (let i = 0; i < 12; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'cp';
      p.style.left = (20 + Math.random() * 60) + 'vw';
      p.style.top = '40vh';
      p.style.background = cols[Math.floor(Math.random() * cols.length)];
      p.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
      p.style.width = (6 + Math.random() * 6) + 'px';
      p.style.height = (6 + Math.random() * 6) + 'px';
      w.appendChild(p);
      setTimeout(() => p.remove(), 1500);
    }, i * 25);
  }
}

function launchConfetti() {
  const w = document.getElementById('confetti-wrap');
  if (!w) return;
  const cols = ['#2D5A3D', '#B8956B', '#3BA4C7', '#FF6B6B', '#9B6FD4', '#F59E0B'];
  const count = 28;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'cp';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.top = '-20px';
      p.style.background = cols[Math.floor(Math.random() * cols.length)];
      p.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      p.style.width = (8 + Math.random() * 10) + 'px';
      p.style.height = (8 + Math.random() * 10) + 'px';
      w.appendChild(p);
      setTimeout(() => p.remove(), 3000);
    }, i * 30);
  }
}

function toggleTrainingMode() {
  trainingMode = !trainingMode;
  document.getElementById('training-btn').textContent = trainingMode ? '🏋️ تدريب (مفعل ✓)' : '🏋️ وضع التدريب';
  if (trainingMode) document.getElementById('training-btn').classList.add('btn-green');
  else document.getElementById('training-btn').classList.remove('btn-green');
}

/* ── Leaderboard & Profile ── */
let lbPeriod = 'week';
let lbCache = { day: null, week: null };
let topLeaderLoading = false;
const LB_CACHE_MS = 45000;

function invalidateLbCache() {
  lbCache = { day: null, week: null };
}

async function fetchLeaderboardRankings(period, forceRefresh) {
  const cached = lbCache[period];
  if (!forceRefresh && cached && Date.now() - cached.at < LB_CACHE_MS) {
    return cached.ranked;
  }
  const start = getLbPeriodStart(period);
  const { data: scores, error } = await db.from('scores')
    .select('user_id,score')
    .gte('played_at', start.toISOString())
    .limit(300);
  if (error) return cached?.ranked || [];
  const ranked = aggregateTotalPoints(scores);
  const userIds = [...new Set(ranked.map(s => s.user_id).filter(Boolean))].slice(0, 80);
  const nameMap = await fetchNameMap(userIds);
  const withNames = ranked.map(r => ({ ...r, name: nameMap[r.user_id] || 'مجهول' }));
  lbCache[period] = { at: Date.now(), ranked: withNames, scores, nameMap };
  return withNames;
}

function getLbPeriodStart(period) {
  const now = new Date();
  if (period === 'day') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function getLbPeriodEnd(period) {
  const start = getLbPeriodStart(period);
  const end = new Date(start);
  if (period === 'day') end.setDate(end.getDate() + 1);
  else end.setDate(end.getDate() + 7);
  return end;
}

function formatLbCountdown(period) {
  const end = getLbPeriodEnd(period);
  const ms = Math.max(0, end - Date.now());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (period === 'day') {
    if (hours > 0) return `يتجدد لوحة اليوم خلال ${hours} ساعة و ${mins} دقيقة`;
    return `يتجدد لوحة اليوم خلال ${mins} دقيقة`;
  }
  if (days > 0) return `يتجدد لوحة الأسبوع خلال ${days} يوم و ${hours} ساعة`;
  return `يتجدد لوحة الأسبوع خلال ${hours} ساعة و ${mins} دقيقة`;
}

function aggregateTotalPoints(scores) {
  const byUser = {};
  for (const s of scores || []) {
    if (!s.user_id) continue;
    if (!byUser[s.user_id]) byUser[s.user_id] = { user_id: s.user_id, score: 0, games: 0 };
    byUser[s.user_id].score += (s.score || 0);
    byUser[s.user_id].games += 1;
  }
  return Object.values(byUser).sort((a, b) => b.score - a.score);
}

async function fetchNameMap(userIds) {
  if (!userIds.length) return {};
  const ids = [...new Set(userIds)].slice(0, 80);
  const { data: profiles } = await db.from('profiles').select('id,name').in('id', ids);
  return Object.fromEntries((profiles || []).map(p => [p.id, p.name]));
}

function formatTopLeaderLine(entry) {
  if (!entry) return 'لا أحد بعد — كن/ي الأول/ة! 🌟';
  return `🥇 ${entry.name} — ⭐${entry.score} (${entry.games} لعبة)`;
}

async function updateTopLeaderPreview(forceRefresh) {
  const dayEl = document.getElementById('top-leader-day');
  const weekEl = document.getElementById('top-leader-week');
  if (!dayEl || !weekEl) return;
  if (topLeaderLoading) return;
  topLeaderLoading = true;
  const hadCache = lbCache.day && lbCache.week && !forceRefresh;
  if (!hadCache) {
    dayEl.textContent = 'جاري التحميل...';
    weekEl.textContent = 'جاري التحميل...';
  }
  try {
    const [dayRank, weekRank] = await Promise.all([
      fetchLeaderboardRankings('day', forceRefresh),
      fetchLeaderboardRankings('week', forceRefresh),
    ]);
    dayEl.textContent = formatTopLeaderLine(dayRank[0]);
    weekEl.textContent = formatTopLeaderLine(weekRank[0]);
  } catch (e) {
    dayEl.textContent = 'تعذّر التحميل';
    weekEl.textContent = 'تعذّر التحميل';
  } finally {
    topLeaderLoading = false;
  }
}

function renderLeaderboardList(ranked, nameMap) {
  const list = document.getElementById('lb-list');
  if (!list) return;
  if (!ranked.length) {
    const emptyMsg = lbPeriod === 'day'
      ? 'لا توجد نتائج اليوم بعد. كن/ي أول/ة! 🌟'
      : 'لا توجد نتائج هذا الأسبوع بعد. كن/ي أول/ة! 🌟';
    list.innerHTML = `<p style="text-align:center;color:var(--text-soft);padding:20px 0;">${emptyMsg}</p>`;
    return;
  }
  let myRank = 0;
  if (state.user) myRank = ranked.findIndex(s => s.user_id === state.user.id) + 1;
  const rankHtml = myRank > 0 ? `<div class="rank-badge">🏅 ترتيبك: #${myRank}</div>` : '';
  list.innerHTML = rankHtml + ranked.slice(0, 30).map((s, i) => {
    const isYou = state.user && s.user_id === state.user.id;
    const name = nameMap[s.user_id] || s.name || 'مجهول';
    return `<div class="lb-row ${i===0?'top1':i===1?'top2':i===2?'top3':''}${isYou?' lb-you':''}"><span class="lb-rank">${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)}</span><span class="lb-name">${escapeHtml(name)}${isYou?' (أنت)':''}</span><span class="lb-score">⭐${s.score}${s.games ? ' <small style="opacity:0.7">(' + s.games + ')</small>' : ''}</span></div>`;
  }).join('');
}

async function loadLeaderboard(period, forceRefresh) {
  lbPeriod = period;
  document.querySelectorAll('.lb-tabs .tab-btn').forEach(t => t.classList.toggle('active', t.dataset.period === period));
  const resetHint = document.getElementById('lb-reset-hint');
  const heroSub = document.getElementById('lb-hero-sub');
  if (resetHint) resetHint.textContent = formatLbCountdown(period);
  if (heroSub) {
    heroSub.textContent = period === 'day'
      ? 'مجموع نقاط اليوم — تُصفّر عند منتصف الليل'
      : 'مجموع نقاط الأسبوع — تُصفّر كل أحد';
  }

  const list = document.getElementById('lb-list');
  if (!list) return;

  const cached = lbCache[period];
  if (!forceRefresh && cached && Date.now() - cached.at < LB_CACHE_MS) {
    renderLeaderboardList(cached.ranked, cached.nameMap);
    return;
  }

  list.innerHTML = '<p style="text-align:center;color:var(--text-soft);padding:20px 0;">جاري التحميل...</p>';

  const ranked = await fetchLeaderboardRankings(period, forceRefresh);
  if (!ranked.length && !lbCache[period]) {
    list.innerHTML = '<p style="text-align:center;color:var(--coral);padding:20px 0;">تعذّر تحميل اللوحة</p>';
    return;
  }
  const nameMap = lbCache[period]?.nameMap || Object.fromEntries(ranked.map(r => [r.user_id, r.name]));
  renderLeaderboardList(ranked, nameMap);
}

function setLbPeriod(period) {
  if (period === lbPeriod) return;
  loadLeaderboard(period);
}

async function showLeaderboard() {
  await loadLeaderboard(lbPeriod);
  show('leaderboard-screen');
}

async function showProfile() {
  if (!state.user) {
    show('login-screen');
    return;
  }
  const p = ensureProgress();
  const info = getLevelInfo(p.xp || 0);
  let totalGames = p.totalGames || 0, bestScore = p.bestScore || 0, totalCorrect = p.totalCorrect || 0;
  if (state.user) {
    const { data } = await db.from('scores').select('score,correct,total').eq('user_id', state.user.id);
    if (data?.length) {
      totalGames = Math.max(totalGames, data.length);
      bestScore = Math.max(bestScore, ...data.map(s => s.score));
      totalCorrect = Math.max(totalCorrect, data.reduce((a, s) => a + s.correct, 0));
    }
  }
  const avatar = '👩‍🎓';
  let badgesHtml = '<div class="badges-grid">';
  for (const [id, b] of Object.entries(BADGES)) {
    const unlocked = (p.badges || []).includes(id);
    badgesHtml += `<div class="badge-item ${unlocked?'unlocked':'locked'}"><div class="b-icon">${unlocked?b.icon:'🔒'}</div><div class="b-name">${b.name}</div></div>`;
  }
  badgesHtml += '</div>';
  document.getElementById('profile-content').innerHTML = `
    <div class="profile-hero">${avatar}</div>
    <h3 style="text-align:center;margin-bottom:4px;">${escapeHtml(state.userName)}</h3>
    <p style="text-align:center;color:var(--emerald);font-weight:800;font-size:0.9em;">${info.title}</p>
    <p style="text-align:center;color:var(--text-soft);font-size:0.85em;">متعلم/ة · 🏅 ${(p.badges||[]).length} / ${Object.keys(BADGES).length} شارة</p>
    <div class="profile-stat-row">
      <div class="profile-stat"><div class="val">${totalGames}</div><div class="lbl">ألعاب</div></div>
      <div class="profile-stat"><div class="val">${bestScore}</div><div class="lbl">أفضل نتيجة</div></div>
      <div class="profile-stat"><div class="val">${p.xp||0}</div><div class="lbl">خبرة</div></div>
    </div>
    <p style="text-align:center;font-weight:900;color:var(--emerald-dark);margin-bottom:4px;">🏅 الإنجازات</p>
    ${badgesHtml}`;
  if (window.AlhudaPlatform?.enhanceProfileHtml) {
    document.getElementById('profile-content').innerHTML = AlhudaPlatform.enhanceProfileHtml(document.getElementById('profile-content').innerHTML);
  }
  show('profile-screen');
}

function applyLoginLockUI() {
  const nameInput = document.getElementById('login-name');
  const loginBtn = document.getElementById('btn-login');
  const block = document.getElementById('login-locked-block');
  const divider = document.getElementById('login-or-divider');
  const features = document.getElementById('login-features');
  const title = document.getElementById('login-title');
  const notice = document.querySelector('.login-lock-notice');
  if (!nameInput || !loginBtn) return;
  if (LOGIN_LOCKED) {
    nameInput.disabled = true;
    nameInput.setAttribute('aria-disabled', 'true');
    loginBtn.disabled = true;
    loginBtn.setAttribute('aria-disabled', 'true');
    block?.classList.add('is-locked');
    if (block) block.style.display = 'none';
    if (divider) divider.style.display = 'none';
    if (features) features.style.display = 'none';
    if (title) title.textContent = '🔒 الدخول مغلق مؤقتاً';
    if (notice) { notice.hidden = false; notice.style.display = ''; notice.textContent = 'الأسئلة الكاملة مغلقة — النموذج التجريبي فقط (٨ أسئلة لكل كتاب)'; }
    const demoOnlyNotice = document.getElementById('login-demo-only-notice');
    if (demoOnlyNotice) demoOnlyNotice.hidden = false;
    updateLoginQuestionHint();
  } else {
    const demoOnlyNotice = document.getElementById('login-demo-only-notice');
    if (demoOnlyNotice) demoOnlyNotice.hidden = true;
    if (block) block.style.display = '';
    if (divider) divider.style.display = '';
    if (features) features.style.display = '';
    nameInput.disabled = false;
    nameInput.removeAttribute('aria-disabled');
    nameInput.placeholder = 'اكتب/ي اسمك هنا...';
    loginBtn.disabled = false;
    loginBtn.removeAttribute('aria-disabled');
    loginBtn.textContent = 'دخول 🎮';
    block?.classList.remove('is-locked');
    if (title) title.textContent = 'ادخل/ي باسمك وابدأ/ي 🎮';
    if (notice) { notice.hidden = true; notice.style.display = 'none'; }
  }
}

async function restoreSession() {
  if (LOGIN_LOCKED) {
    await db.auth.signOut().catch(() => {});
    state.user = null;
    state.userType = '';
    state.userName = '';
    return false;
  }
  const { data: { session } } = await db.auth.getSession();
  if (!session?.user) return false;
  const { data: profile, error } = await db.from('profiles').select('name,role').eq('id', session.user.id).maybeSingle();
  if (error || !profile || profile.role !== 'student') {
    await db.auth.signOut();
    return false;
  }
  state.user = session.user;
  state.userType = 'student';
  state.userName = profile.name || localStorage.getItem('savedName') || DEFAULT_PLAYER;
  const savedName = localStorage.getItem('savedName');
  if (savedName && profile.name && profile.name !== savedName) {
    await db.auth.signOut();
    return false;
  }
  localStorage.setItem('savedName', state.userName);
  if (window.AlhudaPlatform?.syncUserClassFromDb) await AlhudaPlatform.syncUserClassFromDb();
  if (window.AlhudaPlatform?.syncWrongQuestionsFromDb) await AlhudaPlatform.syncWrongQuestionsFromDb();
  void syncPendingScores();
  const progress = ensureProgress();
  if (!localStorage.getItem('demoDone') && !(progress.totalGames > 0)) {
    showDemoIntro(state.userName);
    return true;
  }
  goHome();
  return true;
}

/* ── Init ── */
(async function init() {
  const s = localStorage.getItem('fontSize') || 18;
  setFontPreset(s);
  soundOn = localStorage.getItem('soundOn') !== 'false';
  document.getElementById('sound-btn').textContent = soundOn ? '🔊 الأصوات (مفعل)' : '🔇 الأصوات (صامت)';
  voiceOn = localStorage.getItem('voiceOn') !== 'false';
  voiceReadAnswers = localStorage.getItem('voiceReadAnswers') !== 'false';
  if (localStorage.getItem('voiceOn') == null) localStorage.setItem('voiceOn', 'true');
  if (localStorage.getItem('voiceReadAnswers') == null) localStorage.setItem('voiceReadAnswers', 'true');
  updateVoiceUI();
  if ('speechSynthesis' in window) {
    loadArabicVoice();
    speechSynthesis.onvoiceschanged = loadArabicVoice;
  }
  const savedName = localStorage.getItem('savedName');
  const loginScreenActive = document.getElementById('login-screen')?.classList.contains('active');
  if (savedName && loginScreenActive && !LOGIN_LOCKED) document.getElementById('login-name').value = savedName;
  applyLoginLockUI();
  document.getElementById('login-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !LOGIN_LOCKED) doLogin();
  });
  document.getElementById('btn-login')?.addEventListener('click', () => {
    if (!LOGIN_LOCKED) doLogin();
  });
  window.addEventListener('pagehide', () => persistGameSession());
})();
