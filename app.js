
const SUPABASE_URL = 'https://smcyaqwxbmhshhhhdece.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4OhSsWwIfV4QxGRf1fujLA_TjE111eU';
/** Lazy client — Supabase CDN may load after first paint. */
let db = null;
function getDb() {
  if (db) return db;
  if (typeof window !== 'undefined' && window.supabase?.createClient) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return db;
}
Object.defineProperty(window, '__alhudaDb', { get: getDb });
// Compat: most code uses `db.` — bind via Proxy after first access pattern.
db = new Proxy({}, {
  get(_t, prop) {
    const client = getDb();
    if (!client) {
      if (prop === 'then') return undefined;
      throw new Error('Supabase not loaded yet');
    }
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

const BOOK_LABELS = { tawheed:'كتاب التوحيد', usool:'الأصول الثلاثة', nawawi:'الأربعون النووية', merge3:'الكتب الثلاثة' };
const BOOK_BTN_MAP = { tawheed:'tawheed', usool:'usool', nawawi:'nawawi', merge3:'merge' };
const LEVEL_LABELS = { easy:'سهل', medium:'متوسط', hard:'صعب', all:'كل المستويات' };
const DEMO_COUNT = 8;
/** Weekly featured pools (ISO week % 2) mixed into each demo, then filled randomly. */
const DEMO_FEATURED_POOLS = {
  tawheed: [
    [
      '6dea92e9-ae29-4fda-bbf1-55f3b0f2ac90',
      '8230d37a-f5c5-4dea-b8d2-ee499eec99e6',
      '39a35c94-3034-43c9-bcc0-3032b1b01381',
      '67831742-cfc3-4c12-a11c-4be748e40bda',
    ],
    [
      '40fd1b0a-b12e-4b92-9958-5241f6df5912',
      '5aeee9f3-c1a0-44e9-a85e-f26691ac1502',
      '213fc1f9-d919-4153-b28a-6e53cb13acce',
      '51990c98-78e7-45db-ac60-ae2b4110517f',
    ],
  ],
  usool: [
    [
      '45b11c1a-6569-4653-85ee-fc3397d5dce7',
      '07d01f29-b988-4574-8ca1-9cedad8ca864',
      'c68b2f57-38b0-4671-ad6d-c546eeea2945',
      '44c0fa04-4e25-40dc-8b0e-9a4ea3ff9291',
    ],
    [
      '3c6a55b5-9c87-4cbe-8963-9ea596edf789',
      '51b3515c-278d-4df5-a4fb-a7b71c920153',
      'cae566ed-4e67-442d-a8bd-df8c76928ebd',
      '4116d4b3-fd57-4fc9-a4de-0b12024fef7e',
    ],
  ],
  nawawi: [
    [
      'da89ed81-0fb5-4f49-a689-880a89271aed',
      'c222d45d-12aa-489b-b6d5-8c71d179b249',
      '45777616-94a2-45a0-81c4-1dbcc82a606b',
      '371c3a70-cb31-4f62-a927-3576432f673e',
    ],
    [
      '5d714abc-747b-4e95-8ab4-e31e6f985a3d',
      'ff19a316-58a1-4278-bee4-b6f49b4fc435',
      '41b189f4-a2e6-43a3-ba4f-e27fb4f6627b',
      'e3b8d209-b4b7-45cc-bfb0-78ac6d7ed91b',
    ],
  ],
};
function getDemoWeekIndex() {
  const now = new Date();
  const utc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNum = new Date(utc).getUTCDay() || 7;
  const thursday = new Date(utc);
  thursday.setUTCDate(new Date(utc).getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  return weekNo % 2;
}
function getDemoFeaturedIds(book) {
  const pools = DEMO_FEATURED_POOLS[book] || [];
  return pools[getDemoWeekIndex()] || pools[0] || [];
}
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
let state = { user:null, userType:'', userName:'', userEmail:'', book:'tawheed', level:'easy', questions:[], idx:0, score:0, hearts:5, streak:0, maxStreak:0, correct:0, wrong:0, answered:false, total:20, bankVersion:0, challengeMode:false, challengeCode:'', demoMode:false, demoBook:'', wrongLog:[], reviewIdx:0, reviewReturn:'results', homeworkId:null, activeStageNum:1, stageReviewMode:false, useManualRange:false };
let trainingMode = false, soundOn = true, voiceOn = true, voiceReadAnswers = true, lastGameXp = 0, feedbackRating = 0, feedbackWantProgram = null, pendingLoginAfterDemo = false, loginInProgress = false;
let countdownTimer = null, questionTimerId = null, questionTimerLeft = QUESTION_TIME_SEC;
let gameEndTimer = null, syncPendingScoresInFlight = null;
let questionShownAt = 0;
let lastDemoSessionStats = null;
const AZURE_TTS_USAGE_KEY = 'azureTtsCharsMonthV1';
const AZURE_F0_SOFT_LIMIT = 450000; // warn before free 500k/month

const FEEDBACK_RATING_LABELS = {
  3: { emoji: '😍', label: 'أعجبني' },
  2: { emoji: '😐', label: 'عادي' },
  1: { emoji: '😞', label: 'ما أعجبني' },
};
const DEMO_FALLBACK = [
  { id:'demo1', book:'tawheed', type:'tf', q:'التوحيد هو إفراد الله تعالى بالعبادة.', tf:true, exp:'نعم! التوحيد هو إفراد الله في الربوبية والألوهية والأسماء والصفات.', quote:'«العبادة هي التوحيد»', page:12, cat:'🕌 حق الله' },
  { id:'demo4', book:'tawheed', type:'tf', q:'الشرك الأكبر يُخرج من الملة.', tf:true, exp:'الشرك الأكبر من أعظم الكبائر ويُبقي صاحبه في النار إن مات عليه.' },
  { id:'demo6', book:'tawheed', type:'tf', q:'الدعاء عبادة لا تُصرف إلا لله.', tf:true, exp:'الدعاء من أعظم العبادات، وصرفه لغير الله شرك.' },
  { id:'demo7', book:'tawheed', type:'tf', q:'التوكل على الله واجب.', tf:true, exp:'التوكل عبادة القلب، وهو الاعتماد على الله مع فعل الأسباب.' },
  { id:'demo2', book:'usool', type:'mc', q:'ما هي الأصول الثلاثة؟', a:['معرفة الرب ومعرفة الدين ومعرفة نبيك','الصلاة والزكاة والصوم','الإيمان والإحسان والإخلاص','القرآن والسنة والإجماع'], c:0, exp:'الأصول الثلاثة: معرفة الرب، ومعرفة الدين بمعرفة دينك، ومعرفة نبيك محمد ﷺ.', quote:'«تَعَلَّمْ أَنَّهُ لَا يَجِبُ عَلَى أَحَدٍ مِنَ الْخَلْقِ أَنْ يُعَبَّدَ إِلَّا اللَّهُ»', page:8, cat:'📚 المسائل الأربع' },
  { id:'demo5', book:'usool', type:'tf', q:'العبادة هي الطاعة والخضوع لله.', tf:true, exp:'العبادة اسم جامع لكل ما يحبه الله ويرضاه من الأقوال والأعمال.' },
  { id:'demo8', book:'usool', type:'tf', q:'الإخلاص شرط لقبول العمل.', tf:true, exp:'لا يُقبل عمل بغير إخلاص لله ومتابعة للرسول ﷺ.' },
  { id:'demo9', book:'usool', type:'tf', q:'معرفة الرب أول الأصول الثلاثة.', tf:true, exp:'أول ما يجب معرفة الرب ثم معرفة الدين ثم معرفة النبي ﷺ.' },
  { id:'demo3', book:'nawawi', type:'tf', q:'أول حديث في الأربعون النووية: «إنما الأعمال بالنيات».', tf:true, exp:'صحيح! وهو أول حديث في الأربعون النووية للإمام النووي رحمه الله.', quote:'«إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ»', page:1, cat:'الأربعون النووية' },
  { id:'demo10', book:'nawawi', type:'tf', q:'بُني الإسلام على خمس.', tf:true, exp:'الشهادتان والصلاة والزكاة والصوم والحج.' },
  { id:'demo11', book:'nawawi', type:'tf', q:'الدين النصيحة.', tf:true, exp:'حديث عظيم يدل على أن النصيحة أصل في الدين لله ولكتابه ولرسوله وللأئمة وعامة المسلمين.' },
  { id:'demo12', book:'nawawi', type:'tf', q:'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه.', tf:true, exp:'من علامات كمال الإيمان محبة الخير للمسلمين كما تحبه لنفسك.' },
];

const OFFLINE_QUESTIONS_DB = 'alhudaQuestionsOffline';
const OFFLINE_QUESTIONS_STORE = 'books';
const OFFLINE_QUESTIONS_KEY = 'questionsOfflineV1';
const DEMO_ANALYTICS_KEY = 'demoAnalyticsV1';
const DEMO_ANALYTICS_MAX = 500;

function openOfflineQuestionsDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(OFFLINE_QUESTIONS_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUESTIONS_STORE)) {
        db.createObjectStore(OFFLINE_QUESTIONS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function saveQuestionsOffline(payload) {
  try {
    const db = await openOfflineQuestionsDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_QUESTIONS_STORE, 'readwrite');
      tx.objectStore(OFFLINE_QUESTIONS_STORE).put(payload, OFFLINE_QUESTIONS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    try {
      localStorage.setItem(OFFLINE_QUESTIONS_KEY, JSON.stringify({
        ts: payload.ts,
        slim: true,
        books: Object.fromEntries(
          Object.entries(payload.books || {}).map(([book, rows]) => [
            book,
            (rows || []).slice(0, 40).map((q) => ({
              id: q.id, book: q.book, type: q.type, q: q.q, a: q.a, c: q.c, tf: q.tf, exp: q.exp, quote: q.quote, page: q.page, cat: q.cat, level: q.level,
            })),
          ])
        ),
      }));
    } catch (e2) {
      console.warn('offline questions save:', e2);
    }
  }
}

async function loadQuestionsOffline() {
  try {
    const db = await openOfflineQuestionsDb();
    const data = await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_QUESTIONS_STORE, 'readonly');
      const req = tx.objectStore(OFFLINE_QUESTIONS_STORE).get(OFFLINE_QUESTIONS_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (data?.books) return data;
  } catch (e) { /* fall through */ }
  try {
    const raw = localStorage.getItem(OFFLINE_QUESTIONS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistLoadedQuestionsOffline() {
  const books = {};
  for (const book of QUESTION_BOOKS) {
    if (QUESTIONS[book]?.length) books[book] = QUESTIONS[book];
  }
  if (!Object.keys(books).length) return;
  void saveQuestionsOffline({ ts: Date.now(), books });
}

function recordDemoAnalytics(q, isOk, picked, elapsedMs) {
  if (!state.demoMode || !q) return;
  let rows = [];
  try { rows = JSON.parse(localStorage.getItem(DEMO_ANALYTICS_KEY) || '[]'); } catch { rows = []; }
  if (!Array.isArray(rows)) rows = [];
  const ms = Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : null;
  rows.push({
    questionId: q.id || '',
    book: q.book || state.demoBook || '',
    correct: !!isOk,
    picked: String(picked || '').slice(0, 120),
    q: String(q.q || '').slice(0, 100),
    ms,
    t: Date.now(),
  });
  if (rows.length > DEMO_ANALYTICS_MAX) rows = rows.slice(-DEMO_ANALYTICS_MAX);
  try { localStorage.setItem(DEMO_ANALYTICS_KEY, JSON.stringify(rows)); } catch (e) {}
}

function getQuestionElapsedMs() {
  if (!questionShownAt) return null;
  return Date.now() - questionShownAt;
}

function buildLastDemoSessionStats() {
  const total = state.total || (state.questions || []).length || DEMO_COUNT;
  const correct = state.correct || 0;
  const wrong = state.wrong || 0;
  let avgMs = null;
  try {
    const rows = JSON.parse(localStorage.getItem(DEMO_ANALYTICS_KEY) || '[]');
    const session = (Array.isArray(rows) ? rows : [])
      .filter((r) => r && r.book === (state.demoBook || r.book))
      .slice(-total)
      .filter((r) => Number.isFinite(r.ms));
    if (session.length) {
      avgMs = Math.round(session.reduce((s, r) => s + r.ms, 0) / session.length);
    }
  } catch (e) {}
  return { total, correct, wrong, avgMs, book: state.demoBook || '' };
}

function formatAvgAnswerTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const sec = Math.round(ms / 1000);
  return arabicNum(sec) + ' ث';
}

function renderDemoResultSummary() {
  const el = document.getElementById('demo-result-summary');
  if (!el) return;
  const stats = lastDemoSessionStats || buildLastDemoSessionStats();
  lastDemoSessionStats = stats;
  const book = BOOK_LABELS[stats.book] || stats.book || '';
  const avg = formatAvgAnswerTime(stats.avgMs);
  el.hidden = false;
  el.innerHTML =
    `<p class="demo-result-score">${arabicNum(stats.correct)} / ${arabicNum(stats.total)} صحيحة</p>` +
    `<p class="demo-result-meta">${book ? escapeHtml(book) + ' · ' : ''}` +
    `${arabicNum(stats.wrong)} خطأ` +
    (avg ? ` · متوسط الوقت ${avg}` : '') +
    `</p>`;
}

function getDemoHardQuestionsSummary(limit = 3) {
  let rows = [];
  try { rows = JSON.parse(localStorage.getItem(DEMO_ANALYTICS_KEY) || '[]'); } catch { return []; }
  const recent = rows.filter((r) => r && r.t && Date.now() - r.t < 1000 * 60 * 60 * 24 * 14);
  const byId = new Map();
  for (const r of recent) {
    if (!r.questionId) continue;
    const cur = byId.get(r.questionId) || { id: r.questionId, q: r.q, wrong: 0, total: 0 };
    cur.total++;
    if (!r.correct) cur.wrong++;
    if (r.q) cur.q = r.q;
    byId.set(r.questionId, cur);
  }
  return [...byId.values()]
    .filter((x) => x.wrong > 0)
    .sort((a, b) => (b.wrong / b.total) - (a.wrong / a.total) || b.wrong - a.wrong)
    .slice(0, limit);
}

function renderDemoAnalyticsSummary(targetId = 'demo-analytics-summary') {
  const el = document.getElementById(targetId);
  if (!el) return;
  const hard = getDemoHardQuestionsSummary(3);
  if (!hard.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = '<p class="demo-analytics-title">أصعب الأسئلة في تجربتك</p><ul>' +
    hard.map((h) => `<li>${escapeHtml(h.q || 'سؤال')} <span>(خطأ ${arabicNum(h.wrong)}/${arabicNum(h.total)})</span></li>`).join('') +
    '</ul>';
}

function refreshLoginAnalyticsPanel() {
  renderDemoAnalyticsSummary('login-analytics-summary');
}

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
const STAGE_SIZE = 20;

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
  if (state.demoMode) return; // demo: skip tutorial for faster first answer
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
  return { xp: 0, dailyStreak: 0, lastPlayDate: '', totalGames: 0, totalCorrect: 0, bestStreak: 0, bestScore: 0, completedStages: {}, stageProgress: {}, badges: [], bookProgress: { tawheed: { answered: 0, correct: 0 }, usool: { answered: 0, correct: 0 }, nawawi: { answered: 0, correct: 0 } }, wrongQuestionIds: [], gameHistory: [], classId: null, classCode: '', className: '', dailyMissionDate: '', dailyMissionDone: false };
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

function stageProgressKey(book, level) {
  return `${book}:${level}`;
}

function ensureStageProgressEntry(key) {
  const p = ensureProgress();
  if (!p.stageProgress) p.stageProgress = {};
  if (!p.stageProgress[key]) {
    p.stageProgress[key] = { solvedIds: [], completedStages: [], currentStage: 1 };
  }
  if (!Array.isArray(p.stageProgress[key].solvedIds)) p.stageProgress[key].solvedIds = [];
  if (!Array.isArray(p.stageProgress[key].completedStages)) p.stageProgress[key].completedStages = [];
  if (!p.stageProgress[key].currentStage) p.stageProgress[key].currentStage = 1;
  saveProgress(p);
  return p.stageProgress[key];
}

function splitPoolIntoStages(pool, size = STAGE_SIZE) {
  const stages = [];
  for (let i = 0; i < pool.length; i += size) {
    stages.push({
      num: stages.length + 1,
      from: i + 1,
      to: Math.min(i + size, pool.length),
      questions: pool.slice(i, i + size),
    });
  }
  return stages;
}

function getStageMeta(book, level) {
  const pool = getOrderedPool(book, level);
  const stages = splitPoolIntoStages(pool);
  const key = stageProgressKey(book, level);
  const prog = ensureStageProgressEntry(key);
  return { pool, stages, prog, key };
}

function markQuestionSolvedInStage(questionId) {
  if (!questionId || state.demoMode || trainingMode || state.challengeMode || state.homeworkId || state.stageReviewMode) return;
  const key = stageProgressKey(state.book, state.level);
  const prog = ensureStageProgressEntry(key);
  if (!prog.solvedIds.includes(questionId)) {
    prog.solvedIds.push(questionId);
    saveProgress(ensureProgress());
  }
}

function syncStageCompletion(stageNum) {
  const { stages, prog } = getStageMeta(state.book, state.level);
  const stage = stages[stageNum - 1];
  if (!stage) return false;
  const solved = stage.questions.filter((q) => prog.solvedIds.includes(q.id)).length;
  const allSolved = solved >= stage.questions.length;
  if (!allSolved) return false;
  if (!prog.completedStages.includes(stageNum)) {
    prog.completedStages.push(stageNum);
    prog.completedStages.sort((a, b) => a - b);
  }
  if (prog.currentStage <= stageNum && stageNum < stages.length) {
    prog.currentStage = stageNum + 1;
  }
  saveProgress(ensureProgress());
  return true;
}

function getQuestionsForStageGame() {
  if (state.useManualRange || state.homeworkId || state.challengeMode || trainingMode) return null;
  const { stages, prog } = getStageMeta(state.book, state.level);
  if (!stages.length) return [];

  if (state.stageReviewMode) {
    const stageNum = Math.max(1, Math.min(state.activeStageNum || 1, stages.length));
    const stage = stages[stageNum - 1];
    state.activeStageNum = stageNum;
    state.qFrom = stage.from;
    return dedupeGameQuestions([...stage.questions]);
  }

  for (let s = Math.max(1, prog.currentStage || 1); s <= stages.length; s++) {
    const stage = stages[s - 1];
    const unsolved = stage.questions.filter((q) => !prog.solvedIds.includes(q.id));
    if (unsolved.length) {
      state.activeStageNum = s;
      state.qFrom = stage.from;
      return dedupeGameQuestions(unsolved);
    }
    syncStageCompletion(s);
  }

  state.activeStageNum = stages.length;
  return [];
}

function updateStagePickerUI() {
  const el = document.getElementById('stage-picker');
  const hint = document.getElementById('stage-hint');
  if (!el) return;
  const { stages, prog, pool } = getStageMeta(state.book, state.level);
  if (!stages.length) {
    el.innerHTML = '<p class="stage-empty">لا توجد أسئلة لهذا الاختيار</p>';
    if (hint) hint.textContent = '';
    return;
  }
  if (!state.stageReviewMode) state.activeStageNum = prog.currentStage || 1;

  el.innerHTML = stages.map((st) => {
    const solved = st.questions.filter((q) => prog.solvedIds.includes(q.id)).length;
    const total = st.questions.length;
    const done = prog.completedStages.includes(st.num) || solved >= total;
    const current = st.num === (prog.currentStage || 1) && !done;
    const locked = !done && !current;
    const selected = st.num === state.activeStageNum;
    const cls = ['stage-chip', done ? 'done' : '', current ? 'current' : '', selected ? 'selected' : '', locked ? 'locked' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-stage="${st.num}" ${locked ? 'disabled' : ''} onclick="selectStage(${st.num}, ${done ? 'true' : 'false'})">
      <span class="stage-chip-top">${done ? '✓' : `مرحلة ${arabicNum(st.num)}`}</span>
      <span class="stage-chip-meta">${arabicNum(solved)}/${arabicNum(total)}</span>
    </button>`;
  }).join('');

  const totalSolved = prog.solvedIds.filter((id) => pool.some((q) => q.id === id)).length;
  const allDone = prog.completedStages.length >= stages.length;
  if (hint) {
    let text = allDone
      ? `🎉 أنهيت كل المراحل (${arabicNum(totalSolved)} سؤالاً)! اضغط/ي أي مرحلة للمراجعة`
      : `المرحلة الحالية: ${arabicNum(prog.currentStage || 1)} من ${arabicNum(stages.length)} — ${arabicNum(totalSolved)} من ${arabicNum(pool.length)} سؤالاً محلولاً`;
    if (state.useManualRange) text += ' — وضع النطاق اليدوي مفعّل (المراحل معطّلة)';
    hint.textContent = text;
  }
  updateStartButtonLabel();
}

function selectStage(num, isDone) {
  state.activeStageNum = num;
  state.stageReviewMode = !!isDone;
  updateStagePickerUI();
}

function updateStartButtonLabel() {
  const btn = document.getElementById('btn-start-game');
  if (!btn) return;
  const { stages, prog } = getStageMeta(state.book, state.level);
  if (!stages.length) {
    btn.textContent = 'ابدأ اللعبة 🎮';
    return;
  }
  const num = state.stageReviewMode ? state.activeStageNum : (prog.currentStage || 1);
  if (state.stageReviewMode) {
    btn.textContent = `مراجعة المرحلة ${arabicNum(num)} 🔁`;
  } else if (prog.completedStages.length >= stages.length) {
    btn.textContent = 'مراجعة مرحلة 🔄';
  } else {
    btn.textContent = `ابدأ المرحلة ${arabicNum(num)} 🎮`;
  }
}

function updateStageGameBadge() {
  const el = document.getElementById('stage-game-badge');
  if (!el || state.demoMode || state.challengeMode || state.homeworkId || state.useManualRange) {
    if (el) el.style.display = 'none';
    return;
  }
  const { stages, prog } = getStageMeta(state.book, state.level);
  const num = state.activeStageNum || prog.currentStage || 1;
  const stage = stages[num - 1];
  if (!stage) {
    el.style.display = 'none';
    return;
  }
  const solved = stage.questions.filter((q) => prog.solvedIds.includes(q.id)).length;
  const mode = state.stageReviewMode ? 'مراجعة' : 'مرحلة';
  el.style.display = '';
  el.textContent = `🏁 ${mode} ${arabicNum(num)} — ${arabicNum(solved)}/${arabicNum(stage.questions.length)} مكتمل`;
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
  updateStagePickerUI();
}

function onRangeInputChange() {
  state.useManualRange = true;
  updateQuestionRangeUI();
}

function buildDemoQuestions(book) {
  const seen = new Set();
  const out = [];
  const pushUnique = (list, limit = DEMO_COUNT) => {
    for (const q of list || []) {
      if (!q || seen.has(q.id)) continue;
      if (q.book && q.book !== book) continue;
      seen.add(q.id);
      out.push(q);
      if (out.length >= limit) return true;
    }
    return false;
  };

  const pool = dedupeQuestionList(getOrderedPool(book, 'all'));
  const byId = new Map(pool.map((q) => [q.id, q]));
  const featuredIds = getDemoFeaturedIds(book);
  const featured = featuredIds.map((id) => byId.get(id)).filter(Boolean);

  // Mix: up to 4 curated featured + fill with random from pool/bundle/fallback.
  const featuredTarget = Math.min(4, DEMO_COUNT);
  pushUnique(featured, featuredTarget);

  const restPool = shuffleArray(pool.filter((q) => !seen.has(q.id)));
  if (pushUnique(restPool)) return shuffleArray(out).slice(0, DEMO_COUNT);

  const bundled = (typeof window !== 'undefined' && window.DEMO_QUESTIONS_BUNDLE?.[book]) || [];
  if (pushUnique(shuffleArray([...bundled]))) return shuffleArray(out).slice(0, DEMO_COUNT);

  pushUnique(DEMO_FALLBACK.filter((q) => q.book === book));
  return shuffleArray(out).slice(0, DEMO_COUNT);
}

function shuffleArray(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

/* ── Voice reading (Azure Neural TTS preferred; Edge Hamed fallback) ── */
const TTS_VOICE = 'ar-SA-HamedNeural';
const TTS_VOICE_FALLBACK = 'ar-EG-SalmaNeural';
let cachedArabicVoice = null;
const TTS_BLOB_CACHE_MAX = 120;
const ttsBlobMemoryCache = new Map(); // key -> objectUrl
const ttsPrefetchInFlight = new Map();
const TTS_IDB_NAME = 'alhudaTtsCache';
const TTS_IDB_STORE = 'audio';

function ttsCacheKey(text, voice) {
  return `${voice || TTS_VOICE}::${String(text || '').slice(0, 600)}`;
}

function openTtsIdb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('no idb'));
      return;
    }
    const req = indexedDB.open(TTS_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TTS_IDB_STORE)) db.createObjectStore(TTS_IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getTtsBlobFromIdb(key) {
  try {
    const db = await openTtsIdb();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(TTS_IDB_STORE, 'readonly');
      const r = tx.objectStore(TTS_IDB_STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}

async function putTtsBlobInIdb(key, blob) {
  try {
    const db = await openTtsIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TTS_IDB_STORE, 'readwrite');
      tx.objectStore(TTS_IDB_STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('tts idb put:', e);
  }
}

function rememberTtsObjectUrl(key, objectUrl) {
  if (!key || !objectUrl) return;
  if (ttsBlobMemoryCache.has(key)) {
    const prev = ttsBlobMemoryCache.get(key);
    if (prev && prev !== objectUrl) URL.revokeObjectURL(prev);
    ttsBlobMemoryCache.delete(key);
  }
  ttsBlobMemoryCache.set(key, objectUrl);
  while (ttsBlobMemoryCache.size > TTS_BLOB_CACHE_MAX) {
    const oldest = ttsBlobMemoryCache.keys().next().value;
    const old = ttsBlobMemoryCache.get(oldest);
    if (old) URL.revokeObjectURL(old);
    ttsBlobMemoryCache.delete(oldest);
  }
}

async function fetchTtsBlob(text, voice = TTS_VOICE, signal) {
  const key = ttsCacheKey(text, voice);
  if (ttsBlobMemoryCache.has(key)) {
    const url = ttsBlobMemoryCache.get(key);
    const res = await fetch(url);
    return res.blob();
  }
  const cached = await getTtsBlobFromIdb(key);
  if (cached?.size) {
    const objectUrl = URL.createObjectURL(cached);
    rememberTtsObjectUrl(key, objectUrl);
    return cached;
  }
  if (ttsPrefetchInFlight.has(key)) return ttsPrefetchInFlight.get(key);

  const work = (async () => {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
      signal,
    });
    if (!res.ok) throw new Error('tts failed');
    const blob = await res.blob();
    if (!blob.size) throw new Error('empty audio');
    rememberTtsObjectUrl(key, URL.createObjectURL(blob));
    void putTtsBlobInIdb(key, blob);
    recordAzureTtsUsage(text.length, res.headers.get('X-TTS-Provider'));
    return blob;
  })();

  ttsPrefetchInFlight.set(key, work);
  try {
    return await work;
  } finally {
    ttsPrefetchInFlight.delete(key);
  }
}

function prefetchTtsText(text, voice = TTS_VOICE) {
  void ensureSpeechMapsLoaded().then(() => {
    const clean = sanitizeTtsText(prepareArabicForSpeech(applyManualSpeechDiacritics(text || '')));
    if (!clean || clean.length < 2) return;
    const key = ttsCacheKey(clean, voice);
    if (ttsBlobMemoryCache.has(key) || ttsPrefetchInFlight.has(key)) return;
    void fetchTtsBlob(clean, voice).catch(() => {});
  });
}

function prefetchUpcomingTts(fromIdx = state.idx) {
  const slice = (state.questions || []).slice(Math.max(0, fromIdx | 0), (fromIdx | 0) + 5);
  for (const q of slice) {
    if (!q) continue;
    prefetchTtsText(q.q);
    if (q.exp) prefetchTtsText(String(q.exp).slice(0, 280));
    const cite = pickCitationTextForSpeech?.(q) || '';
    if (cite) prefetchTtsText(String(cite).slice(0, 220));
  }
}

/** Warm edge-cached Quran audio for popular mapped verses (faster first recite). */
function warmPopularQuranAyahs() {
  if (navigator.onLine === false) return;
  const map = (typeof window !== 'undefined' && window.QUESTION_VERSE_MAP) || {};
  const keys = [...new Set(Object.values(map))].slice(0, 12);
  for (const verseKey of keys) {
    void fetchQuranAudioObjectUrl(verseKey).catch(() => {});
  }
  void fetch('/api/quran-warm', { cache: 'no-store' }).catch(() => {});
}

function warmDemoSessionAudio() {
  prefetchUpcomingTts(0);
  prefetchUpcomingQuran(0);
  const slice = (state.questions || []).slice(0, 5);
  for (const q of slice) {
    const key = getQuestionVerseKey(q?.id);
    if (key) void fetchQuranAudioObjectUrl(key).catch(() => {});
  }
  warmPopularQuranAyahs();
}

function azureUsageMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getAzureTtsUsage() {
  try {
    const raw = JSON.parse(localStorage.getItem(AZURE_TTS_USAGE_KEY) || '{}');
    if (raw && raw.month === azureUsageMonthKey()) return { month: raw.month, chars: Number(raw.chars) || 0 };
  } catch (e) {}
  return { month: azureUsageMonthKey(), chars: 0 };
}

function recordAzureTtsUsage(charCount, provider) {
  if (!provider || !String(provider).startsWith('azure')) return;
  const n = Math.max(0, Number(charCount) || 0);
  if (!n) return;
  const cur = getAzureTtsUsage();
  const next = { month: azureUsageMonthKey(), chars: cur.chars + n };
  try { localStorage.setItem(AZURE_TTS_USAGE_KEY, JSON.stringify(next)); } catch (e) {}
  maybeWarnAzureQuota(next.chars);
}

function maybeWarnAzureQuota(chars) {
  if (chars < AZURE_F0_SOFT_LIMIT) return;
  const flagKey = `azureQuotaWarned:${azureUsageMonthKey()}`;
  if (sessionStorage.getItem(flagKey) === '1') return;
  sessionStorage.setItem(flagKey, '1');
  if (typeof showToast === 'function') {
    showToast('تنبيه: اقتربت من حد أحرف Azure المجاني هذا الشهر', 'err');
  }
}

async function refreshTtsProviderBadge() {
  const badge = document.getElementById('tts-provider-badge');
  if (!badge) return;
  const showDiag = localStorage.getItem('showTtsDiag') === '1'
    || /[?&]diag=1(?:&|$)/.test(location.search);
  if (!showDiag) {
    badge.hidden = true;
    return;
  }
  try {
    const res = await fetch('/api/tts-status', { cache: 'no-store' });
    const data = await res.json();
    const usage = getAzureTtsUsage();
    const pct = Math.min(100, Math.round((usage.chars / 500000) * 100));
    badge.hidden = false;
    badge.textContent = (data.azureConfigured ? 'TTS: Azure' : 'TTS: Edge') +
      ` · ${usage.chars}/${500000} (~${pct}%)` +
      (data.isolateAzureChars != null ? ` · isolate ${data.isolateAzureChars}` : '');
    badge.classList.toggle('is-azure', !!data.azureConfigured);
    badge.classList.toggle('is-warn', usage.chars >= AZURE_F0_SOFT_LIMIT);
    badge.setAttribute('aria-hidden', 'false');
    if (data.keyRotationHint) badge.title = data.keyRotationHint;
  } catch {
    badge.hidden = false;
    badge.textContent = 'TTS: ?';
  }
}

/** Strip punctuation/symbols the neural voice vocalizes (e.g. ":" → "نقطتان"). Keeps Arabic harakat. */
function sanitizeTtsText(text) {
  return (text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, ' ')
    .replace(/[:：]/g, '، ')
    .replace(/[;؛]/g, '، ')
    .replace(/[()\[\]{}«»"'“”‘’*_#<>=+~^`]/g, ' ')
    .replace(/[\/\\|]/g, ' ')
    .replace(/[–—]/g, ' ')
    .replace(/(^|\s)[-•·](\s|$)/g, ' ')
    .replace(/\s+([،.؟!])/g, '$1')
    .replace(/،(\s*،)+/g, '،')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARABIC_HARAKAT_RE = /[\u064B-\u065F\u0670\u0610-\u061A]/;

function hasWellFormedTashkeel(s) {
  if (!s || !ARABIC_HARAKAT_RE.test(s)) return false;
  const tokens = String(s).split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const singles = tokens.filter((t) => t.replace(/[^\u0621-\u064A]/g, '').length <= 1).length;
  if (singles / tokens.length >= 0.4) return false;
  const letters = (s.match(/[\u0621-\u064A\u0671]/g) || []).length;
  const marks = (s.match(/[\u064B-\u065F\u0670]/g) || []).length;
  return marks >= 3 && marks >= letters * 0.12;
}

/** Attach detached fatha/damma/kasra/sukun to the nearest Arabic letter. */
function fixDetachedHarakat(s) {
  let out = (s || '');
  for (let i = 0; i < 8; i++) {
    const next = out
      .replace(/([\u0621-\u064A\u0671])\s+([\u064B-\u065F\u0670\u0610-\u061A]+)/g, '$1$2')
      .replace(/([\u064B-\u065F\u0670\u0610-\u061A]+)\s+([\u0621-\u064A\u0671])/g, '$2$1');
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Keep valid tashkil for TTS; only strip broken OCR marks that confuse pronunciation. */
function prepareArabicForSpeech(s) {
  if (!s) return '';
  let t = String(s).replace(/[\u0640\u200c\u200f]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (hasWellFormedTashkeel(t)) return t;
  if (hasOcrTashkeelGaps(t) || hasBrokenArabicSpacing(t)) return collapseBrokenArabicSpaces(t);
  if (ARABIC_HARAKAT_RE.test(t)) return fixDetachedHarakat(t);
  return t;
}

function pickCitationTextForSpeech(q) {
  const raw = String(q?.quote || '').replace(/^«|»$/g, '').trim();
  if (raw && (hasWellFormedTashkeel(raw) || (ARABIC_HARAKAT_RE.test(raw) && !hasOcrTashkeelGaps(raw) && !hasBrokenArabicSpacing(raw)))) {
    return prepareArabicForSpeech(raw);
  }
  if (q?.id && getCanonicalQuote(q.id)) return getCanonicalQuote(q.id);
  const cleaned = pickCitationText(q).replace(/^«|»$/g, '').trim();
  return cleaned ? prepareArabicForSpeech(cleaned) : '';
}

const MANUAL_SPEECH_DIACRITICS = [
  ['قال الله تعالى', 'قَالَ اللهُ تَعَالَى'],
  ['قوله تعالى', 'قَوْلُهُ تَعَالَى'],
  ['الإجابة الصحيحة', 'الْإِجَابَةُ الصَّحِيحَةُ'],
  ['التوحيد هو إفراد الله تعالى بالعبادة', 'التَّوْحِيدُ هُوَ إِفْرَادُ اللهِ تَعَالَى بِالْعِبَادَةِ'],
  ['التوحيد هو إفراد الله بالعبادة', 'التَّوْحِيدُ هُوَ إِفْرَادُ اللهِ بِالْعِبَادَةِ'],
  ['العبادة هي التوحيد', 'الْعِبَادَةُ هِيَ التَّوْحِيدُ'],
  ['ما هي الأصول الثلاثة', 'مَا هِيَ الْأُصُولُ الثَّلَاثَةُ'],
  ['معرفة الرب ومعرفة الدين ومعرفة نبيك', 'مَعْرِفَةُ الرَّبِّ وَمَعْرِفَةُ الدِّينِ وَمَعْرِفَةُ نَبِيِّكَ'],
  ['إنما الأعمال بالنيات', 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ'],
  ['إنما الأعمال بالنيات وإنما لكل امرئ ما نوى', 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى'],
  ['إنك تأتي قوما من أهل الكتاب فليكن أول ما تدعوهم إليه شهادة أن لا إله إلا الله', 'إِنَّكَ تَأْتِي قَوْمًا مِنْ أَهْلِ الْكِتَابِ، فَلْيَكُنْ أَوَّلَ مَا تَدْعُوهُمْ إِلَيْهِ شَهَادَةُ أَنْ لَا إِلَهَ إِلَّا اللهُ'],
  ['إن الحلال بين وإن الحرام بين وبينهما أمور مشتبهات', 'إِنَّ الْحَلَالَ بَيِّنٌ، وَإِنَّ الْحَرَامَ بَيِّنٌ، وَبَيْنَهُمَا أُمُورٌ مُشْتَبِهَاتٌ'],
  ['لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه', 'لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ'],
  ['البر حسن الخلق والإثم ما حاك في صدرك وكرهت أن يطلع عليه الناس', 'الْبِرُّ حُسْنُ الْخُلُقِ، وَالْإِثْمُ مَا حَاكَ فِي صَدْرِكَ، وَكَرِهْتَ أَنْ يَطَّلِعَ عَلَيْهِ النَّاسُ'],
  ['إن الله فرض فرائض فلا تضيعوها وحد حدودا فلا تعتدوها وحرم أشياء فلا تنتهكوها', 'إِنَّ اللهَ فَرَضَ فَرَائِضَ فَلَا تُضَيِّعُوهَا، وَحَدَّ حُدُودًا فَلَا تَعْتَدُوهَا، وَحَرَّمَ أَشْيَاءَ فَلَا تَنْتَهِكُوهَا'],
  ['إن الله تجاوز عن أمتي الخطأ والنسيان وما استكرهوا عليه', 'إِنَّ اللهَ تَجَاوَزَ عَنْ أُمَّتِي الْخَطَأَ وَالنِّسْيَانَ وَمَا اسْتُكْرِهُوا عَلَيْهِ'],
  ['كل بدعة ضلالة', 'كُلُّ بِدْعَةٍ ضَلَالَةٌ'],
  ['لعن الله من ذبح لغير الله', 'لَعَنَ اللهُ مَنْ ذَبَحَ لِغَيْرِ اللهِ'],
  ['إن الرقى والتمائم والتولة شرك', 'إِنَّ الرُّقَى وَالتَّمَائِمَ وَالتِّوَلَةَ شِرْكٌ'],
  ['دعاء الأموات شرك أكبر', 'دُعَاءُ الْأَمْوَاتِ شِرْكٌ أَكْبَرُ'],
  ['النذر عبادة لا تصرف إلا لله', 'النَّذْرُ عِبَادَةٌ لَا تُصْرَفُ إِلَّا لِلَّهِ'],
  ['من حلف بغير الله فقد كفر أو أشرك', 'مَنْ حَلَفَ بِغَيْرِ اللهِ فَقَدْ كَفَرَ أَوْ أَشْرَكَ'],
  ['دخل الجنة رجل في ذباب ودخل النار رجل في ذباب', 'دَخَلَ الْجَنَّةَ رَجُلٌ فِي ذُبَابٍ، وَدَخَلَ النَّارَ رَجُلٌ فِي ذُبَابٍ'],
  ['من تعلق تميمة فقد أشرك', 'مَنْ تَعَلَّقَ تَمِيمَةً فَقَدْ أَشْرَكَ'],
  ['اللهم لا تجعل قبري وثنا يعبد', 'اللَّهُمَّ لَا تَجْعَلْ قَبْرِي وَثَنًا يُعْبَدُ'],
  ['الطيرة شرك', 'الطِّيَرَةُ شِرْكٌ'],
  ['الشرك الأكبر يخرج من الملة', 'الشِّرْكُ الْأَكْبَرُ يُخْرِجُ مِنَ الْمِلَّةِ'],
  ['العبادة اسم جامع لكل ما يحبه الله ويرضاه من الأقوال والأعمال', 'الْعِبَادَةُ اسْمٌ جَامِعٌ لِكُلِّ مَا يُحِبُّهُ اللهُ وَيَرْضَاهُ مِنَ الْأَقْوَالِ وَالْأَعْمَالِ'],
];

const SPEECH_WORD_RE = /[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g;
let _sortedManualSpeech = null;
let _speechMapsPromise = null;

function getSortedManualSpeech() {
  if (!_sortedManualSpeech) {
    _sortedManualSpeech = [...MANUAL_SPEECH_DIACRITICS].sort((a, b) => b[0].length - a[0].length);
  }
  return _sortedManualSpeech;
}

function ensureSpeechMapsLoaded() {
  if (typeof window !== 'undefined' && window.SPEECH_PHRASE_MAP) return Promise.resolve();
  if (_speechMapsPromise) return _speechMapsPromise;
  _speechMapsPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-speech-maps]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => resolve());
      return;
    }
    const s = document.createElement('script');
    s.src = 'speech-diacritics-map.js';
    s.async = true;
    s.dataset.speechMaps = '1';
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return _speechMapsPromise;
}

function stripHarakat(s) {
  return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
}

/** Word-level diacritization fallback — covers every word using the generated map. */
function applyWordDiacritics(text) {
  const wordMap = (typeof window !== 'undefined' && window.SPEECH_WORD_MAP) || null;
  if (!wordMap) return text;
  return String(text).replace(SPEECH_WORD_RE, (tok) => {
    const bare = stripHarakat(tok);
    return wordMap[bare] || tok;
  });
}

/**
 * Diacritize text for TTS with priority:
 *   1. exact verified phrase (whole chunk)
 *   2. critical multi-word phrase replacement (hadith / ayat intros)
 *   3. per-word fallback dictionary (full coverage)
 */
function applyManualSpeechDiacritics(text) {
  let out = String(text || '').trim();
  if (!out) return '';
  const phraseMap = (typeof window !== 'undefined' && window.SPEECH_PHRASE_MAP) || {};
  const exact = normalizeArabicForMatch(out);
  if (phraseMap[exact]) return phraseMap[exact];
  for (const [plain, diacritized] of MANUAL_SPEECH_DIACRITICS) {
    if (exact === normalizeArabicForMatch(plain)) return diacritized;
  }
  for (const [plain, diacritized] of getSortedManualSpeech()) {
    if (plain.length >= 5 && out.includes(plain)) out = out.split(plain).join(diacritized);
  }
  return applyWordDiacritics(out);
}

function speechTextFor(q, field, raw) {
  const byId = (typeof window !== 'undefined' && window.SPEECH_BY_QUESTION_ID) || {};
  const hit = q?.id && byId[q.id]?.[field];
  return prepareArabicForSpeech(applyManualSpeechDiacritics(hit || raw));
}
let ttsAudio = null;
let ttsAbort = null;
let ttsObjectUrl = null;
let hybridSpeechToken = 0;

function stripForSpeech(text) {
  return prepareArabicForSpeech(
    removeQuranicVersesForSpeech(
      applyManualSpeechDiacritics(
        (text || '')
          .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
    )
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

function isHadithQudsiText(s) {
  const t = (s || '').replace(/[،.؛:!؟«»"[\]]/g, ' ').trim();
  if (/يؤذيني\s+ابن\s+آدم|إنما\s+الأعمال\s+بالنيات|إنك\s+تأتي\s+قوم|من\s+لقي\s+الله\s+لا\s+يشرك|إن\s+الله\s+تجاوز\s+عن|أقرب\s+ما\s+يكون\s+العبد/i.test(t)) return true;
  if (/رواه|حديث|قال\s*النبي|رسول\s*الله|ﷺ|رضي\s*الله|البر\s+حسن\s+الخلق|لا\s+يؤمن\s+أحدكم\s+حتى\s+يحب|لا\s+ضرر\s+ولا\s+ضرار|كل\s+بدعة\s+ضلالة|لا\s+تجعلوا\s+بيوتكم\s+قبور|لا\s+تتخذوا\s+قبري|الرقى\s+والتمائم|لا\s+عدوى\s+ولا\s+طيرة|إن\s+الله\s+فرض\s+فرائض/i.test(t)) return true;
  return false;
}

function isQuranicAyahText(s) {
  const t = (s || '').replace(/[،.؛:!؟«»"[\]]/g, '').trim();
  if (!t || t.length < 10) return false;
  if (isHadithQudsiText(t)) return false;
  if (/^الإجابة\s*الصحيحة/i.test(t)) return false;
  if (/^(إنما\s+الأعمال|إن\s+الله\s+تجاوز|لا\s+يؤمن|من\s+حلف|إن\s+الحلال|البر\s+حسن)/i.test(t)) return false;
  if (/^(إن|إني|إنا|الذين|فمن|ومن|يا\s+أيها|تبارك|سبحان|قل|لقد|وما\s+خلقت|فلا\s+تخاف|فلا\s+تجعل)/i.test(t)) return true;
  if (t.length >= 28 && /الله|إيمان|كفر|شرك|جنة|نار|عباد|ربك/i.test(t)) return true;
  return false;
}

function getQuestionContentBlob(q, extra = '') {
  const parts = [q?.q, q?.exp, extra, q?.quote];
  if (typeof pickCitationText === 'function') parts.push(pickCitationText(q));
  if (Array.isArray(q?.a)) parts.push(...q.a);
  return parts.filter(Boolean).join(' ');
}

function textIsSubstantiallyContained(needle, haystack) {
  const n = normalizeArabicForMatch(String(needle || '').replace(/^«|»$/g, ''));
  const h = normalizeArabicForMatch(String(haystack || ''));
  if (!n || !h) return false;
  if (h.includes(n)) return true;
  const words = n.split(' ').filter((w) => w.length > 2);
  if (words.length < 3) return false;
  const hits = words.filter((w) => h.includes(w)).length;
  return hits / words.length >= 0.72;
}

function dedupeTtsPlan(plan) {
  const out = [];
  for (const seg of plan) {
    if (seg.type !== 'tts') {
      out.push(seg);
      continue;
    }
    const t = seg.text?.trim();
    if (!t) continue;
    const prev = out[out.length - 1];
    if (prev?.type === 'tts') {
      if (textIsSubstantiallyContained(t, prev.text) || textIsSubstantiallyContained(prev.text, t)) {
        if (t.length > prev.text.length) prev.text = t;
        continue;
      }
    }
    if (out.some((s) => s.type === 'tts' && textIsSubstantiallyContained(t, s.text))) continue;
    out.push({ type: 'tts', text: t });
  }
  return out;
}

/**
 * Choose speech text for one part. If it carries a Quran ayah, keep the ORIGINAL
 * text so buildSpeechPlan can split it out for Hudhaify; otherwise use the
 * per-field diacritized form for best Hamed / Azure pronunciation.
 */
function speechPart(q, field, raw) {
  const original = String(raw || '').trim();
  if (!original) return '';
  if (textMayHaveQuranAyah(original, q) || findVerseKeysSync(original).length) return original;
  return speechTextFor(q, field, original);
}

function buildQuestionSpeechText(q) {
  const parts = [speechPart(q, 'q', q?.q)].filter(Boolean);
  const rawCite = String(q?.quote || '').replace(/^«|»$/g, '').trim()
    || (q?.id && getCanonicalQuote(q.id)) || pickCitationText(q);
  const cite = speechPart(q, 'quote', rawCite);
  if (cite && !textIsSubstantiallyContained(cite, parts[0] || '')) parts.push(cite);
  if (q?.type === 'mc' && Array.isArray(q.a) && q.a.length) {
    const labels = ['أ', 'ب', 'ج', 'د'];
    q.a.forEach((opt, i) => {
      const t = speechPart(q, `a${i}`, opt);
      if (t) parts.push(`${labels[i] || ''} ${t}`.trim());
    });
  }
  return parts.join('، ');
}

function buildFeedbackSpeechText(q, wrongText) {
  const parts = [];
  if (wrongText) parts.push(speechPart(q, 'wrong', wrongText));
  const correct = getCorrectAnswerText(q);
  if (correct) {
    const correctIdx = q?.type === 'mc' && q.c != null ? `a${q.c}` : 'correct';
    parts.push(`الْإِجَابَةُ الصَّحِيحَةُ، ${speechPart(q, correctIdx, correct)}`);
  }
  const exp = speechPart(q, 'exp', (q?.exp || '').trim());
  const rawCite = String(q?.quote || '').replace(/^«|»$/g, '').trim()
    || (q?.id && getCanonicalQuote(q.id)) || pickCitationText(q);
  const quote = speechPart(q, 'quote', rawCite);
  if (exp) {
    parts.push(exp);
    if (quote && !textIsSubstantiallyContained(quote, exp)) parts.push(quote);
  } else if (quote) {
    parts.push(quote);
  }
  if (!exp && !quote) {
    const book = BOOK_LABELS[q?.book] || q?.book || '';
    if (book) parts.push(`من كتاب ${book}`);
    const pageLabel = q?.page != null ? formatPageLabel(q.page) : '';
    if (pageLabel) parts.push(pageLabel);
  }
  return parts.filter(Boolean).join('، ');
}

async function speakFeedbackOnce(q, wrongText, btn) {
  if (!q) return;
  await ensureSpeechMapsLoaded();
  const text = buildFeedbackSpeechText(q, wrongText);
  const clean = stripForSpeech(text);
  if (!clean) return;
  stopSpeaking();
  const token = hybridSpeechToken;
  if (btn) btn.classList.add('speaking');
  try {
    await speakTtsSegment(clean, btn, { keepBtnState: false });
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.warn('feedback tts:', e);
      toastTtsFail();
    }
  } finally {
    if (token === hybridSpeechToken && btn) btn.classList.remove('speaking');
  }
}

function onFeedbackSpeakerClick() {
  const q = state.questions?.[state.idx];
  if (!q) return;
  void speakFeedbackOnce(q, state.lastFeedbackWrong || '', document.getElementById('btn-speak-feedback'));
}

/* ── Quran recitation (حذيفي / عفاسي — عبر بروكسي Cloudflare + prefetch) ── */
const QURAN_RECITERS = {
  hudhaify: {
    key: 'hudhaify',
    label: 'الحذيفي',
    edition: 'ar.hudhaify',
    everyayah: 'Hudhaify_64kbps',
  },
  alafasy: {
    key: 'alafasy',
    label: 'العفاسي',
    edition: 'ar.alafasy',
    everyayah: 'Alafasy_64kbps',
  },
};
let quranReciterKey = localStorage.getItem('quranReciter') || 'hudhaify';
if (!QURAN_RECITERS[quranReciterKey]) quranReciterKey = 'hudhaify';

function getActiveQuranReciter() {
  return QURAN_RECITERS[quranReciterKey] || QURAN_RECITERS.hudhaify;
}

function setQuranReciter(key) {
  if (!QURAN_RECITERS[key]) return;
  quranReciterKey = key;
  localStorage.setItem('quranReciter', key);
  // Clear blob cache when switching reciter (different audio files).
  for (const url of quranAudioBlobCache.values()) {
    try { URL.revokeObjectURL(url); } catch (e) {}
  }
  quranAudioBlobCache.clear();
  updateReciterSettingsUI();
  const q = state.questions?.[state.idx];
  if (q) {
    updateQuranReciteSlot(q);
    prefetchUpcomingQuran(state.idx);
  }
}

function updateReciterSettingsUI() {
  const label = getActiveQuranReciter().label;
  document.querySelectorAll('[data-reciter]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-reciter') === quranReciterKey);
  });
  const el = document.getElementById('reciter-label');
  if (el) el.textContent = label;
}

const QURAN_RECITE_BTN_LABEL = `🎧 تلاوة`;
function getQuranReciteAria() {
  return `استمع لتلاوة الآية — ${getActiveQuranReciter().label}`;
}
const QURAN_RECITER_BITRATE = 64;
const QURAN_BLOB_CACHE_MAX = 32;
const quranAudioBlobCache = new Map(); // cacheKey -> objectUrl
const quranPrefetchInFlight = new Map();
let quranAudio = null;
let quranPlayToken = 0;
const quranVerseKeyCache = new Map();

function quranBlobCacheKey(verseKey) {
  return `${quranReciterKey}:${verseKey}`;
}
const SURAH_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59,
  37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

const SURAH_BY_ARABIC_NAME = {
  'الفاتحة': 1, 'البقرة': 2, 'آل عمران': 3, 'النساء': 4, 'المائدة': 5, 'الأنعام': 6,
  'الأعراف': 7, 'الأنفال': 8, 'التوبة': 9, 'يونس': 10, 'هود': 11, 'يوسف': 12, 'الرعد': 13,
  'إبراهيم': 14, 'الحجر': 15, 'النحل': 16, 'الإسراء': 17, 'الكهف': 18, 'مريم': 19, 'طه': 20,
  'الأنبياء': 21, 'الحج': 22, 'المؤمنون': 23, 'النور': 24, 'الفرقان': 25, 'الشعراء': 26,
  'النمل': 27, 'القصص': 28, 'العنكبوت': 29, 'الروم': 30, 'لقمان': 31, 'السجدة': 32,
  'الأحزاب': 33, 'سبأ': 34, 'فاطر': 35, 'يس': 36, 'الصافات': 37, 'ص': 38, 'الزمر': 39,
  'غافر': 40, 'فصلت': 41, 'الشورى': 42, 'الزخرف': 43, 'الدخان': 44, 'الجاثية': 45,
  'الأحقاف': 46, 'محمد': 47, 'الفتح': 48, 'الحجرات': 49, 'ق': 50, 'الذاريات': 51,
  'الطور': 52, 'النجم': 53, 'القمر': 54, 'الرحمن': 55, 'الواقعة': 56, 'الحديد': 57,
  'المجادلة': 58, 'الحشر': 59, 'الممتحنة': 60, 'الصف': 61, 'الجمعة': 62, 'المنافقون': 63,
  'التغابن': 64, 'الطلاق': 65, 'التحريم': 66, 'الملك': 67, 'القلم': 68, 'الحاقة': 69,
  'المعارج': 70, 'نوح': 71, 'الجن': 72, 'المزمل': 73, 'المدثر': 74, 'القيامة': 75,
  'الإنسان': 76, 'المرسلات': 77, 'النبأ': 78, 'النازعات': 79, 'عبس': 80, 'التكوير': 81,
  'الانفطار': 82, 'المطففين': 83, 'الانشقاق': 84, 'البروج': 85, 'الطارق': 86, 'الأعلى': 87,
  'الغاشية': 88, 'الفجر': 89, 'البلد': 90, 'الشمس': 91, 'الليل': 92, 'الضحى': 93,
  'الشرح': 94, 'التين': 95, 'العلق': 96, 'القدر': 97, 'البينة': 98, 'الزلزلة': 99,
  'العاديات': 100, 'القارعة': 101, 'التكاثر': 102, 'العصر': 103, 'الهمزة': 104,
  'الفيل': 105, 'قريش': 106, 'الماعون': 107, 'الكوثر': 108, 'الكافرون': 109, 'النصر': 110,
  'المسد': 111, 'الإخلاص': 112, 'الفلق': 113, 'الناس': 114,
  'المدّثر': 74,
};

function findSurahByFuzzyName(rawName) {
  const name = normalizeArabicForMatch(rawName).replace(/^ورة\s*/, '').replace(/^س\s*/, '');
  const folded = name.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  if (SURAH_BY_ARABIC_NAME[name]) return SURAH_BY_ARABIC_NAME[name];
  for (const [k, v] of Object.entries(SURAH_BY_ARABIC_NAME)) {
    const nk = k.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    if (nk === folded || nk.includes(folded) || folded.includes(nk)) return v;
  }
  return null;
}

function getQuestionVerseKey(questionId) {
  if (!questionId) return null;
  const map = (typeof window !== 'undefined' && window.QUESTION_VERSE_MAP) || {};
  return map[questionId] || null;
}

function normalizeArabicForMatch(s) {
  return stripArabicDiacritics(s)
    .replace(/[«»()"[\]،.؛:!؟\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function verseKeyToGlobalAyahNum(verseKey) {
  const [surah, ayah] = String(verseKey).split(':').map((n) => parseInt(n, 10));
  if (!surah || !ayah || surah < 1 || surah > 114) return 0;
  let offset = 0;
  for (let i = 0; i < surah - 1; i++) offset += SURAH_AYAH_COUNTS[i] || 0;
  return offset + ayah;
}

function getQuranRecitationUrls(verseKey) {
  const [surah, ayah] = String(verseKey).split(':').map((n) => parseInt(n, 10));
  if (!surah || !ayah) return [];
  const reciter = getActiveQuranReciter();
  const urls = [];
  // Prefer Cloudflare Worker edge cache proxy.
  urls.push(`/api/quran-audio?surah=${surah}&ayah=${ayah}&reciter=${encodeURIComponent(reciter.key)}`);
  const globalNum = verseKeyToGlobalAyahNum(verseKey);
  if (globalNum) {
    urls.push(`https://cdn.islamic.network/quran/audio/${QURAN_RECITER_BITRATE}/${reciter.edition}/${globalNum}.mp3`);
  }
  const file = `${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;
  urls.push(`https://everyayah.com/data/${reciter.everyayah}/${file}`);
  return [...new Set(urls)];
}

function verseKeyToRecitationUrl(verseKey) {
  return getQuranRecitationUrls(verseKey)[0] || '';
}

function rememberQuranBlob(verseKey, objectUrl) {
  const cacheKey = quranBlobCacheKey(verseKey);
  if (!verseKey || !objectUrl) return;
  if (quranAudioBlobCache.has(cacheKey)) {
    const prev = quranAudioBlobCache.get(cacheKey);
    if (prev && prev !== objectUrl) URL.revokeObjectURL(prev);
    quranAudioBlobCache.delete(cacheKey);
  }
  quranAudioBlobCache.set(cacheKey, objectUrl);
  while (quranAudioBlobCache.size > QURAN_BLOB_CACHE_MAX) {
    const oldest = quranAudioBlobCache.keys().next().value;
    const oldUrl = quranAudioBlobCache.get(oldest);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    quranAudioBlobCache.delete(oldest);
  }
}

async function fetchQuranAudioObjectUrl(verseKey) {
  if (!verseKey) return null;
  const cacheKey = quranBlobCacheKey(verseKey);
  if (quranAudioBlobCache.has(cacheKey)) return quranAudioBlobCache.get(cacheKey);
  if (quranPrefetchInFlight.has(cacheKey)) {
    await quranPrefetchInFlight.get(cacheKey);
    return quranAudioBlobCache.get(cacheKey) || null;
  }
  const work = (async () => {
    const urls = getQuranRecitationUrls(verseKey);
    for (const url of urls) {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (!blob || !blob.size) continue;
        const objectUrl = URL.createObjectURL(blob);
        rememberQuranBlob(verseKey, objectUrl);
        return objectUrl;
      } catch (e) {
        console.warn('quran prefetch:', url, e);
      }
    }
    return null;
  })();
  quranPrefetchInFlight.set(cacheKey, work);
  try {
    return await work;
  } finally {
    quranPrefetchInFlight.delete(cacheKey);
  }
}

function prefetchQuranForQuestion(q) {
  if (!q || !hasQuranAyahContent(q)) return;
  void (async () => {
    try {
      const verseKey = await resolveVerseKeyForQuestion(q);
      if (!verseKey) {
        setQuranReciteStatus(q, '');
        return;
      }
      const cacheKey = quranBlobCacheKey(verseKey);
      if (quranAudioBlobCache.has(cacheKey)) {
        setQuranReciteStatus(q, 'ready');
        return;
      }
      setQuranReciteStatus(q, 'loading');
      const url = await fetchQuranAudioObjectUrl(verseKey);
      setQuranReciteStatus(q, url ? 'ready' : '');
    } catch (e) {
      console.warn('quran prefetch question:', e);
      setQuranReciteStatus(q, '');
    }
  })();
}

function prefetchUpcomingQuran(fromIdx = state.idx) {
  const start = Math.max(0, fromIdx | 0);
  const slice = (state.questions || []).slice(start, start + 3);
  for (const q of slice) prefetchQuranForQuestion(q);
}

function setQuranReciteStatus(q, status) {
  const roots = [
    document.getElementById('quran-recite-slot'),
    document.getElementById('feedback'),
    document.getElementById('review-exp'),
  ];
  for (const root of roots) {
    if (!root) continue;
    root.querySelectorAll('.quran-recite-status').forEach((el) => {
      if (status === 'loading') {
        el.textContent = 'جاري تحميل التلاوة…';
        el.hidden = false;
      } else if (status === 'ready') {
        el.textContent = 'جاهزة';
        el.hidden = false;
      } else {
        el.textContent = '';
        el.hidden = true;
      }
    });
  }
}

function parseSurahAyahReferences(text) {
  const refs = [];
  const cleaned = (text || '').replace(/\s+/g, ' ');
  const re = /(?:\[?\s*س\s*ورة\s*|سورة\s*)([^\]:]+?)\s*[:：]\s*(\d+)(?:\s*[-–.]\s*(\d+))?/gi;
  let m;
  while ((m = re.exec(cleaned))) {
    const surah = findSurahByFuzzyName(m[1]);
    const ayah = parseInt(m[2], 10);
    if (surah && ayah) refs.push(`${surah}:${ayah}`);
  }
  const re2 = /([^\s\d]{3,18})\s*[:：]\s*(\d{1,3})\s*»/g;
  while ((m = re2.exec(cleaned))) {
    const surah = findSurahByFuzzyName(m[1]);
    const ayah = parseInt(m[2], 10);
    if (surah && ayah) refs.push(`${surah}:${ayah}`);
  }
  return refs;
}

function extractAyahSnippets(text) {
  const snippets = [];
  const src = text || '';
  for (const m of src.matchAll(/\(([^)]{8,})\)/g)) snippets.push(m[1].trim());
  for (const m of src.matchAll(/"([^"]{8,})"/g)) snippets.push(m[1].trim());
  for (const m of src.matchAll(/«([^»]{8,})»/g)) {
    const inner = m[1].trim();
    if (/قال\s+(الله\s+)?تعالى|قوله\s+تعالى/i.test(inner)) continue;
    snippets.push(inner);
  }
  return snippets;
}

function lookupKnownVerseKey(snippet) {
  const norm = normalizeArabicForMatch(snippet);
  const map = (typeof window !== 'undefined' && window.AYAH_SNIPPET_MAP) || {};
  if (map[norm]) return map[norm];
  for (const [key, verseKey] of Object.entries(map)) {
    const nk = normalizeArabicForMatch(key);
    if (norm.includes(nk) || nk.includes(norm)) return verseKey;
  }
  return null;
}

function findVerseKeysSync(text) {
  const keys = new Set();
  for (const ref of parseSurahAyahReferences(text)) keys.add(ref);
  for (const snippet of extractAyahSnippets(text)) {
    const key = lookupKnownVerseKey(snippet);
    if (key) keys.add(key);
  }
  return [...keys];
}

function hasQuranAyahContent(q) {
  if (!q) return false;
  if (getQuestionVerseKey(q.id)) return true;
  const blob = getQuestionContentBlob(q);
  if (/قال\s+(الله\s+)?تعالى|قوله\s+تعالى|قول\s*الله\s+تعالى|﴿|\[?\s*سورة/i.test(blob)) return true;
  return findVerseKeysSync(blob).length > 0;
}

async function resolveAllVerseKeysForQuestion(q) {
  const keys = [];
  const seen = new Set();
  const add = (k) => { if (k && !seen.has(k)) { seen.add(k); keys.push(k); } };
  add(getQuestionVerseKey(q?.id));
  const blob = getQuestionContentBlob(q);
  for (const k of findVerseKeysSync(blob)) add(k);
  for (const snippet of extractAyahSnippets(blob)) {
    if (isHadithQudsiText(snippet)) continue;
    const known = lookupKnownVerseKey(snippet);
    if (known) add(known);
    else add(await searchVerseKey(snippet));
  }
  return keys;
}

const TAALA_AYAH_RE = /(قال|قوله|قالت|قول)\s+(الله\s+)?تعالى\s*[:،]?\s*(?:\(([^)]*)\)|"([^"]*)"|«([^»]*)»)?/gi;
const STANDALONE_AYAH_RE = /(\(([^)]{10,})\)|"([^"]{10,})"|«([^»]{10,})»)/g;

async function appendStandaloneAyahSegments(text, plan, fallbackKeys) {
  let lastIndex = 0;
  for (const m of text.matchAll(STANDALONE_AYAH_RE)) {
    const inner = (m[2] || m[3] || m[4] || '').trim();
    if (!isQuranicAyahText(inner) || isHadithQudsiText(inner)) continue;
    const before = text.slice(lastIndex, m.index);
    const ttsBefore = stripForSpeech(before);
    if (ttsBefore) plan.push({ type: 'tts', text: ttsBefore });
    let verseKey = lookupKnownVerseKey(inner) || await searchVerseKey(inner);
    if (!verseKey && fallbackKeys.length) verseKey = fallbackKeys.shift();
    if (verseKey) plan.push({ type: 'quran', verseKey });
    lastIndex = m.index + m[0].length;
  }
  const tail = text.slice(lastIndex);
  const ttsTail = stripForSpeech(tail);
  if (ttsTail) plan.push({ type: 'tts', text: ttsTail });
}

async function buildSpeechPlan(text, q) {
  const plan = [];
  const raw = (text || '').trim();
  if (!raw) return plan;
  const fallbackKeys = q ? await resolveAllVerseKeysForQuestion(q) : [];
  const pool = [...fallbackKeys];
  let lastIndex = 0;
  let matchedTaala = false;
  for (const match of raw.matchAll(TAALA_AYAH_RE)) {
    matchedTaala = true;
    const before = raw.slice(lastIndex, match.index);
    const ttsBefore = stripForSpeech(before);
    if (ttsBefore) plan.push({ type: 'tts', text: ttsBefore });
    const intro = applyManualSpeechDiacritics(`${match[1]} ${match[2] ? 'الله ' : ''}تعالى`.replace(/\s+/g, ' ').trim());
    if (intro) plan.push({ type: 'tts', text: intro });
    const ayahText = (match[3] || match[4] || match[5] || '').trim();
    let verseKey = null;
    if (ayahText && !isHadithQudsiText(ayahText)) {
      verseKey = lookupKnownVerseKey(ayahText) || await searchVerseKey(ayahText);
    }
    if (!verseKey && pool.length) verseKey = pool.shift();
    if (verseKey) plan.push({ type: 'quran', verseKey });
    lastIndex = match.index + match[0].length;
  }
  const tail = raw.slice(lastIndex);
  if (matchedTaala) {
    if (tail.trim()) await appendStandaloneAyahSegments(tail, plan, pool);
  } else {
    await appendStandaloneAyahSegments(raw, plan, pool);
  }
  const hasQuran = plan.some((s) => s.type === 'quran');
  if (!hasQuran && pool.length && !isHadithQudsiText(raw) && /تعالى|﴿|سورة/i.test(raw)) {
    if (!plan.some((s) => s.type === 'tts')) {
      const ttsOnly = stripForSpeech(raw);
      if (ttsOnly) plan.push({ type: 'tts', text: ttsOnly });
    }
    plan.push({ type: 'quran', verseKey: pool[0] });
  } else if (!plan.length) {
    const ttsOnly = stripForSpeech(raw);
    if (ttsOnly) plan.push({ type: 'tts', text: ttsOnly });
  }
  if (q && pool.length) {
    for (const verseKey of pool) {
      if (!plan.some((s) => s.type === 'quran' && s.verseKey === verseKey)) {
        plan.push({ type: 'quran', verseKey });
      }
    }
  }
  return dedupeTtsPlan(plan.filter((s) => (s.type === 'tts' && s.text?.trim()) || (s.type === 'quran' && s.verseKey)));
}

function textMayHaveQuranAyah(text, q) {
  const src = text || '';
  if (isQuranicAyahText(src)) return true;
  if (/قال\s+(الله\s+)?تعالى|قوله\s+تعالى|﴿|\[?\s*سورة|الذاريات\s*[:：]/i.test(src)) {
    if (!isHadithQudsiText(src)) return true;
  }
  if (extractAyahSnippets(src).some(isQuranicAyahText)) return true;
  if (findVerseKeysSync(src).length) return true;
  if (q && getQuestionVerseKey(q.id)) {
    const blob = getQuestionContentBlob(q, src);
    if (/تعالى|﴿|سورة/i.test(blob) && findVerseKeysSync(blob).length) return true;
    if (isQuranicAyahText(src) || extractAyahSnippets(blob).some(isQuranicAyahText)) return true;
  }
  return false;
}

async function searchVerseKey(snippet) {
  const cacheKey = normalizeArabicForMatch(snippet);
  if (quranVerseKeyCache.has(cacheKey)) return quranVerseKeyCache.get(cacheKey);
  const known = lookupKnownVerseKey(snippet);
  if (known) {
    quranVerseKeyCache.set(cacheKey, known);
    return known;
  }
  try {
    const q = encodeURIComponent(snippet.slice(0, 60));
    const res = await fetch(`https://api.quran.com/api/v4/search?q=${q}&size=5&language=ar`);
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.search?.results || [];
    const target = normalizeArabicForMatch(snippet);
    let best = null;
    let bestScore = 0;
    for (const row of results) {
      const verseNorm = normalizeArabicForMatch(row.text || '');
      const words = target.split(' ').filter((w) => w.length > 2);
      const hits = words.filter((w) => verseNorm.includes(w)).length;
      const score = hits / Math.max(1, words.length);
      if (score > bestScore) {
        bestScore = score;
        best = row.verse_key;
      }
    }
    if (best && bestScore >= 0.45) {
      quranVerseKeyCache.set(cacheKey, best);
      return best;
    }
  } catch (e) {
    console.warn('quran search:', e);
  }
  return null;
}

async function resolveVerseKeyForQuestion(q) {
  const mapped = getQuestionVerseKey(q?.id);
  if (mapped) return mapped;
  const keys = await resolveAllVerseKeysForQuestion(q);
  return keys[0] || null;
}

function stopQuranAudio() {
  quranPlayToken += 1;
  if (!quranAudio) {
    document.querySelectorAll('.quran-recite-btn.playing').forEach((b) => b.classList.remove('playing'));
    return;
  }
  quranAudio.onended = null;
  quranAudio.onerror = null;
  quranAudio.pause();
  quranAudio = null;
  document.querySelectorAll('.quran-recite-btn.playing').forEach((b) => b.classList.remove('playing'));
}

function buildQuranReciteButtonHtml() {
  return `<span class="quran-recite-wrap"><button type="button" class="quran-recite-btn" data-quran-recite aria-label="${getQuranReciteAria()}">${QURAN_RECITE_BTN_LABEL}</button><span class="quran-recite-status" hidden></span></span>`;
}

function bindQuranReciteButton(root, q) {
  if (!root || !q) return;
  root.querySelectorAll('[data-quran-recite]').forEach((btn) => {
    btn.onclick = () => playQuranForQuestion(q, btn);
  });
  prefetchQuranForQuestion(q);
}

async function playQuranRecitation(verseKey, btn, { interruptAll = true } = {}) {
  const urls = getQuranRecitationUrls(verseKey);
  if (!urls.length) {
    if (typeof showToast === 'function') showToast('تعذّر تحديد الآية', 'err');
    return;
  }
  if (interruptAll) {
    clearTtsAudio();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  stopQuranAudio();
  const playToken = quranPlayToken;
  if (btn) btn.classList.add('playing');

  // Prefer prefetched blob for near-instant start.
  let objectUrl = quranAudioBlobCache.get(quranBlobCacheKey(verseKey)) || null;
  if (!objectUrl) {
    try {
      setQuranReciteStatus(null, 'loading');
      objectUrl = await fetchQuranAudioObjectUrl(verseKey);
      if (playToken !== quranPlayToken) return;
      setQuranReciteStatus(null, objectUrl ? 'ready' : '');
    } catch (e) {
      console.warn('quran cache fetch:', e);
      setQuranReciteStatus(null, '');
    }
  } else {
    setQuranReciteStatus(null, 'ready');
  }
  if (playToken !== quranPlayToken) return;

  const tryPlay = async (src) => {
    if (playToken !== quranPlayToken) return;
    quranAudio = new Audio(src);
    quranAudio.preload = 'auto';
    await quranAudio.play();
    await new Promise((resolve, reject) => {
      quranAudio.onended = resolve;
      quranAudio.onerror = () => reject(new Error('quran audio error'));
    });
  };

  try {
    if (objectUrl) {
      await tryPlay(objectUrl);
      return;
    }
  } catch (e) {
    console.warn('quran cached play failed:', e);
    stopQuranAudio();
  }

  let lastErr = null;
  for (const url of urls) {
    if (playToken !== quranPlayToken) return;
    try {
      await tryPlay(url);
      // Warm cache in background for next time.
      void fetchQuranAudioObjectUrl(verseKey);
      return;
    } catch (e) {
      lastErr = e;
      console.warn('quran play:', url, e);
      stopQuranAudio();
    }
  }
  if (playToken !== quranPlayToken) return;
  if (typeof showToast === 'function') showToast('تعذّر تشغيل التلاوة — تحقق من الاتصال', 'err');
  console.warn('quran play failed:', lastErr);
  if (btn) btn.classList.remove('playing');
}

async function playQuranForQuestion(q, btn) {
  if (!q) return;
  stopSpeaking();
  if (btn) btn.disabled = true;
  try {
    const verseKey = await resolveVerseKeyForQuestion(q);
    if (!verseKey) {
      if (typeof showToast === 'function') showToast('لم نتمكن من تحديد الآية في القرآن', 'err');
      return;
    }
    const ready = quranAudioBlobCache.has(quranBlobCacheKey(verseKey));
    if (!ready) setQuranReciteStatus(q, 'loading');
    if (btn && !ready) btn.textContent = '⏳...';
    if (btn) btn.textContent = QURAN_RECITE_BTN_LABEL;
    await playQuranRecitation(verseKey, btn);
    const nowReady = quranAudioBlobCache.has(quranBlobCacheKey(verseKey));
    setQuranReciteStatus(q, nowReady ? 'ready' : '');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = QURAN_RECITE_BTN_LABEL;
    }
  }
}

function updateQuranReciteSlot(q) {
  let slot = document.getElementById('quran-recite-slot');
  if (!slot) {
    slot = document.createElement('div');
    slot.id = 'quran-recite-slot';
    slot.className = 'quran-recite-slot';
    document.querySelector('.q-box-row')?.insertAdjacentElement('afterend', slot);
  }
  slot.innerHTML = '';
  if (!hasQuranAyahContent(q)) {
    slot.style.display = 'none';
    return;
  }
  slot.style.display = '';
  slot.innerHTML = buildQuranReciteButtonHtml();
  bindQuranReciteButton(slot, q);
  prefetchQuranForQuestion(q);
}

function scoreArabicVoice(v) {
  const name = (v.name || '').toLowerCase();
  const lang = (v.lang || '').toLowerCase();
  let score = 0;
  if (lang === 'ar-sa') score += 40;
  else if (lang.startsWith('ar')) score += 25;
  if (/hamed|salma|maj(ed)?|tarik|naayf|shakir|zariyah|premium|enhanced|neural|google|microsoft|natural/.test(name)) score += 30;
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
  // Don't revoke URLs that live in the TTS memory cache — reuse them next time.
  if (ttsObjectUrl) {
    const cached = [...ttsBlobMemoryCache.values()].includes(ttsObjectUrl);
    if (!cached) URL.revokeObjectURL(ttsObjectUrl);
    ttsObjectUrl = null;
  }
  if (btn) btn.classList.remove('speaking');
}

function stopSpeaking() {
  hybridSpeechToken += 1;
  clearTtsAudio();
  stopQuranAudio();
  document.querySelectorAll('.voice-btn.speaking').forEach(b => b.classList.remove('speaking'));
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function speakTextBrowser(text, btn) {
  if (!('speechSynthesis' in window)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ar-SA';
    const voice = cachedArabicVoice || loadArabicVoice();
    if (voice) u.voice = voice;
    u.rate = 0.78;
    u.pitch = 1;
    if (btn) btn.classList.add('speaking');
    u.onend = () => {
      if (btn) btn.classList.remove('speaking');
      resolve(true);
    };
    u.onerror = () => {
      if (btn) btn.classList.remove('speaking');
      resolve(false);
    };
    speechSynthesis.speak(u);
  });
}

async function speakTextCloud(text, btn, voice = TTS_VOICE) {
  ttsAbort = new AbortController();
  const blob = await fetchTtsBlob(text, voice, ttsAbort.signal);
  const key = ttsCacheKey(text, voice);
  ttsObjectUrl = ttsBlobMemoryCache.get(key) || URL.createObjectURL(blob);
  if (!ttsBlobMemoryCache.has(key)) rememberTtsObjectUrl(key, ttsObjectUrl);
  ttsAudio = new Audio(ttsObjectUrl);
  if (btn) btn.classList.add('speaking');
  await ttsAudio.play();
  await new Promise((resolve, reject) => {
    ttsAudio.onended = resolve;
    ttsAudio.onerror = () => reject(new Error('audio error'));
  });
}

async function speakTtsSegment(text, btn, { keepBtnState = true } = {}) {
  const clean = sanitizeTtsText(prepareArabicForSpeech(applyManualSpeechDiacritics(text)));
  if (!clean) return;
  try {
    await speakTextCloud(clean, btn, TTS_VOICE);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    try {
      await speakTextCloud(clean, btn, TTS_VOICE_FALLBACK);
    } catch (e2) {
      if (e2.name === 'AbortError') throw e2;
      clearTtsAudio(keepBtnState ? null : btn);
      const ok = await speakTextBrowser(clean, btn);
      if (!ok) throw e2;
      return;
    }
  }
  clearTtsAudio(keepBtnState ? null : btn);
}

async function speakHybrid(text, q, btn, { allowAnswers = false } = {}) {
  const maySpeak = voiceOn || (allowAnswers && voiceReadAnswers);
  if (!maySpeak || !text) return;
  stopSpeaking();
  const token = hybridSpeechToken;
  if (btn) btn.classList.add('speaking');
  try {
    const plan = await buildSpeechPlan(text, q);
    if (!plan.length) {
      const clean = stripForSpeech(text);
      if (clean) await speakTtsSegment(clean, btn);
      return;
    }
    for (const seg of plan) {
      if (token !== hybridSpeechToken) break;
      if (seg.type === 'quran' && seg.verseKey) {
        await playQuranRecitation(seg.verseKey, btn, { interruptAll: false });
      } else if (seg.type === 'tts' && seg.text?.trim()) {
        await speakTtsSegment(seg.text, btn);
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('hybrid speech:', e);
  } finally {
    if (token === hybridSpeechToken && btn) btn.classList.remove('speaking');
    clearTtsAudio();
  }
}

function toastTtsFail() {
  if (typeof showToast === 'function') showToast('تعذّر تشغيل الصوت — تحقق من الاتصال', 'err');
}

async function speakText(text, btn, { allowAnswers = false, question = null } = {}) {
  const maySpeak = voiceOn || (allowAnswers && voiceReadAnswers);
  if (!maySpeak || !text) return;
  const q = question ?? state.questions?.[state.idx] ?? null;
  if (textMayHaveQuranAyah(text, q)) {
    await speakHybrid(text, q, btn, { allowAnswers });
    return;
  }
  const clean = stripForSpeech(text);
  if (!clean) return;
  stopSpeaking();
  try {
    await speakTtsSegment(clean, btn, { keepBtnState: false });
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.warn('cloud tts:', e);
    toastTtsFail();
  }
}

function speakQuestion() {
  const q = state.questions[state.idx];
  if (!q?.q || !voiceOn) return;
  if (navigator.onLine === false) {
    applyOfflineVoicePolicy();
    return;
  }
  void ensureSpeechMapsLoaded().then(() => {
    speakHybrid(buildQuestionSpeechText(q), q, document.getElementById('btn-speak-question'));
  });
}

function applyOfflineVoicePolicy() {
  if (navigator.onLine !== false) return;
  if (voiceOn) {
    voiceOn = false;
    localStorage.setItem('voiceOn', 'false');
    stopSpeaking();
    updateVoiceUI();
  }
  if (sessionStorage.getItem('offlineVoiceNoted') === '1') return;
  sessionStorage.setItem('offlineVoiceNoted', '1');
  if (typeof showToast === 'function') {
    showToast('الصوت والتلاوة تحتاج اتصالاً — تم إيقاف القراءة مؤقتاً', 'err');
  }
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

function updateFeedbackSpeakBtn(show) {
  const btn = document.getElementById('btn-speak-feedback');
  if (!btn) return;
  btn.style.display = show ? 'inline-flex' : 'none';
  btn.classList.remove('speaking');
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

function appendAnswerOption(grid, text, isOk, colorIdx, q) {
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
    sp.onclick = (e) => { e.stopPropagation(); speakText(text, sp, { allowAnswers: true, question: q }); };
    wrap.appendChild(btn);
    wrap.appendChild(sp);
    grid.appendChild(wrap);
    return;
  }
  wrap.appendChild(btn);
  grid.appendChild(wrap);
}

async function shareScore() {
  const text = state.demoMode || document.getElementById('feedback-screen')?.classList.contains('active')
    ? `📝 أنهيتُ نموذجاً تجريبياً في المكتبة الثلاثية — صحيح: ${arabicNum(state.correct)} / ${arabicNum(state.total)}\nجمعية الهدى والحكمة\nhttps://alhuda.ryodan71.workers.dev/`
    : '🎮 ' + state.userName + ' حصل/ت على ' + state.score + ' نقطة في المكتبة الثلاثية! ⭐\nجرّب/ي أنت أيضاً!\nhttps://alhuda.ryodan71.workers.dev/';
  const shareBtn = document.getElementById('share-btn') || document.getElementById('btn-share-demo');
  if (navigator.share) {
    try { await navigator.share({ title: 'المكتبة الثلاثية', text }); return; } catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    if (shareBtn) {
      const prev = shareBtn.textContent;
      shareBtn.textContent = '✅ تم النسخ!';
      setTimeout(() => { shareBtn.textContent = prev; }, 2000);
    }
  } catch (e) { showAlert(text); }
}

async function shareDemoResult() {
  const stats = lastDemoSessionStats || buildLastDemoSessionStats();
  const book = BOOK_LABELS[stats.book] || stats.book || '';
  const avg = stats.avgMs ? ` · متوسط ${Math.round(stats.avgMs / 1000)} ث` : '';
  const text =
    `📝 أنهيتُ نموذجاً تجريبياً في المكتبة الثلاثية` +
    (book ? ` (${book})` : '') +
    `\nصحيح: ${arabicNum(stats.correct)} / ${arabicNum(stats.total)}${avg}` +
    `\nجمعية الهدى والحكمة\nhttps://alhuda.ryodan71.workers.dev/`;
  const shareBtn = document.getElementById('btn-share-demo');
  if (navigator.share) {
    try { await navigator.share({ title: 'المكتبة الثلاثية', text }); return; } catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    if (shareBtn) {
      const prev = shareBtn.textContent;
      shareBtn.textContent = '✅ تم النسخ!';
      setTimeout(() => { shareBtn.textContent = prev; }, 2000);
    }
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
  return /اكتبي|أجيبي|أجيب على|معاني الكلمات|اذكري مناسبة|الأسئلة التالية|س\s*:|ج\s*:|الدليل على أنه|لشيخ الإسلام محمد بن عبدالوهاب.*\d|^[\/.]|ماذا تعرف عن مؤلف/i.test(s || '');
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
    .replace(/منحلفبغيرلله/g, 'من حلف بغير الله')
    .replace(/فقدكفرأوأشرك/g, 'فقد كفر أو أشرك')
    .replace(/دخلالجنةرجل/g, 'دخل الجنة رجل')
    .replace(/ودخلالناررجل/g, 'و دخل النار رجل')
    .replace(/فيذباب/g, 'في ذباب')
    .replace(/منتعلقتميمة/g, 'من تعلق تميمة')
    .replace(/فقدأشرك/g, 'فقد أشرك')
    .replace(/منعلّقتميمة/g, 'من علّق تميمة')
    .replace(/فلاأتمالله/g, 'فلا أتم الله')
    .replace(/الشركالأكبر/g, 'الشرك الأكبر')
    .replace(/والشركالأصغر/g, 'والشرك الأصغر')
    .replace(/الطيرةشرك/g, 'الطيرة شرك')
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
  // Strip PDF/OCR private-use glyphs and presentation forms leftovers.
  s = s.replace(/[\uE000-\uF8FF]/g, '');
  s = s.replace(/[\uFD3E\uFD3F]/g, ''); // ornate Quran paren ornaments often OCR'd empty
  s = s.replace(/[\uFE00-\uFE0F]/g, ''); // variation selectors
  s = s.replace(/^كتاب التوحيد[^.«]{0,120}?\d+\s*/u, '');
  s = s.replace(/لشيخ الإسلام محمد بن عبدالوهاب[^\n«]*/gi, '');
  s = s.replace(/[]/g, '');
  s = s.replace(/أجل\s*واب|واب\s*جلا|اجلا واب|اجل واب/gi, '');
  s = s.replace(/الإجابة\s*الصحيحة\s*:?\s*/gi, '');
  s = s.replace(/\bص\s*\.?\s*\d{1,4}\b/gi, '');
  s = s.replace(/[|]{2,}|_{3,}|\.{4,}/g, ' ');
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
  // Recitation control sits above the ayah so mobile layout reads top→bottom: listen, then read.
  if (hasQuranAyahContent(q)) {
    inner += `<div class="quran-recite-above">${buildQuranReciteButtonHtml()}</div>`;
  }
  if (quote) {
    const ayahClass = hasQuranAyahContent(q) ? 'book-cite-quote book-cite-ayah' : 'book-cite-quote';
    inner += `<p class="${ayahClass}">${escapeHtml(quote)}</p>`;
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
  const rawExp = String(q.exp || '').trim();
  let showedExp = false;
  if (rawExp && !isWorksheetCitation(rawExp) && rawExp.length >= 8) {
    const cleanedExp = cleanArabicCitation(rawExp, q.id) || collapseBrokenArabicSpaces(rawExp);
    if (cleanedExp && !isGarbageCitation(cleanedExp)) {
      html += `<div class="fb-explanation"><p class="fb-exp-label"><strong>💡 الشرح:</strong></p><p class="fb-exp-text">${escapeHtml(cleanedExp)}</p></div>`;
      showedExp = true;
    }
  }
  if (!showedExp) {
    const cite = pickCitationText(q);
    if (cite) {
      html += `<div class="fb-explanation"><p class="fb-exp-label"><strong>💡 الشرح:</strong></p><p class="fb-exp-text">${escapeHtml(cite)}</p></div>`;
    }
  }
  html += buildBookCitationHtml(q);
  html += '</div>';
  return html;
}

function mountAnswerFeedback(q, html) {
  const expEl = document.getElementById('fb-exp');
  if (!expEl) return;
  expEl.innerHTML = html;
  bindQuranReciteButton(expEl, q);
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
    recordDemoAnalytics(q, false, '—', getQuestionElapsedMs());
  }
  fb.className = 'feedback show bad';
  document.getElementById('fb-icon').textContent = '⏱️';
  document.getElementById('fb-title').textContent = `${n}، انتهى الوقت!`;
  selfBox.style.display = 'none';
  mountAnswerFeedback(q, buildAnswerFeedbackHtml(q, false));
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
    // Offline fallback still allows demo via DEMO_FALLBACK.
    console.warn('demo load:', e);
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
  // Prefetch audio during countdown for snappier first question.
  warmDemoSessionAudio();
  startDemoCountdown();
}

function startDemoCountdown() {
  if (countdownTimer) return;
  const ov = document.getElementById('countdown-overlay');
  const num = document.getElementById('countdown-num');
  if (!ov || !num) {
    finishDemoCountdownEnter();
    return;
  }
  ov.style.display = 'flex';
  // Demo: shorter countdown (2) for faster start.
  let n = state.demoMode ? 2 : 3;
  num.textContent = n;
  num.style.animation = 'none';
  void num.offsetWidth;
  num.style.animation = '';
  warmDemoSessionAudio();
  const iv = setInterval(() => {
    n--;
    if (n >= 1) warmDemoSessionAudio();
    if (n <= 0) {
      clearInterval(iv);
      countdownTimer = null;
      ov.style.display = 'none';
      finishDemoCountdownEnter();
      return;
    }
    num.textContent = n;
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
  }, state.demoMode ? 550 : 700);
  countdownTimer = iv;
}

function finishDemoCountdownEnter() {
  renderHearts(); updateScore(); updateProgress();
  show('game');
  renderQ();
  prefetchUpcomingQuran(0);
  prefetchUpcomingTts(0);
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
  lastDemoSessionStats = buildLastDemoSessionStats();
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
  renderDemoResultSummary();
  renderDemoAnalyticsSummary();
  const shareDemo = document.getElementById('btn-share-demo');
  if (shareDemo) shareDemo.style.display = 'block';
  const finishBtn = document.getElementById('btn-finish-demo');
  if (finishBtn) finishBtn.style.display = '';
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
  if (!name) { setFormError(msgEl, 'اكتب/ي اسمك من فضلك'); return; }
  if (!age) { setFormError(msgEl, 'اكتب/ي عمرك من فضلك'); return; }
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  try {
  const parts = [];
  parts.push(`العمر: ${age}`);
  if (feedbackWantProgram !== null) {
    parts.push(`هل تريد/ين البرنامج؟ ${feedbackWantProgram ? 'نعم ✅' : 'لا ❌'}`);
  }
  parts.push(`التقييم: ${feedbackRatingLabel(feedbackRating)}`);
  if (state.demoBook) parts.push(`الكتاب: ${BOOK_LABELS[state.demoBook] || state.demoBook}`);
  if (improveText) parts.push(`اقتراحات وتحسينات:\n${improveText}`);
  if (likeText) parts.push(`ملاحظات إضافية:\n${likeText}`);
  if (state.total) parts.push(`نتيجة النموذج: ${state.correct}/${state.total} صحيحة`);
  const stats = lastDemoSessionStats || buildLastDemoSessionStats();
  if (stats?.avgMs) parts.push(`متوسط زمن الإجابة: ${Math.round(stats.avgMs / 1000)} ث`);
  const hard = getDemoHardQuestionsSummary(5);
  if (hard.length) {
    parts.push(
      'تحليلات التجربة (أصعب الأسئلة محلياً):\n' +
      hard.map((h) => `- ${h.q || h.id} (خطأ ${h.wrong}/${h.total})`).join('\n')
    );
  }
  try {
    const analytics = JSON.parse(localStorage.getItem(DEMO_ANALYTICS_KEY) || '[]');
    const sessionRows = Array.isArray(analytics)
      ? analytics.filter((r) => r && r.book === state.demoBook).slice(-DEMO_COUNT)
      : [];
    if (sessionRows.length) {
      const wrongIds = sessionRows.filter((r) => !r.correct).map((r) => r.questionId).filter(Boolean);
      if (wrongIds.length) parts.push(`معرّفات الأسئلة الخاطئة: ${wrongIds.join(', ')}`);
    }
  } catch (e) {}
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
  // Feedback is encouraged but not a gate — allow trying another book immediately.
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
  const n = Number(size) || 18;
  document.documentElement.style.setProperty('--base-font-size', n + 'px');
  const names = { 16: 'صغير', 18: 'متوسط', 20: 'كبير', 22: 'كبير جداً' };
  const label = document.getElementById('fs-label');
  if (label) label.textContent = names[n] || String(n);
  localStorage.setItem('fontSize', n);
  document.querySelectorAll('.font-preset-btn').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.size) === n);
  });
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark-mode', dark);
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f1f18' : '#163828');
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = dark ? '🌙 الوضع الليلي (مفعل)' : '☀️ الوضع الليلي';
}

function toggleDarkMode() {
  applyTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
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
  persistLoadedQuestionsOffline();
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

function refreshBookFromNetwork(book) {
  if (!QUESTION_BOOKS.includes(book) || navigator.onLine === false) return;
  if (!getDb()) return;
  void (async () => {
    try {
      const { data, error } = await fetchBookQuestions(book);
      if (error || !data?.length) return;
      ingestBookQuestions(book, data);
      bookLoadState[book] = true;
      updateLevelCounts();
      updateDemoBookPicker();
      updateLoginQuestionHint();
    } catch (e) {
      console.warn('background refresh', book, e);
    }
  })();
}

async function loadBookQuestions(book) {
  if (!QUESTION_BOOKS.includes(book)) return [];
  if (bookLoadState[book] && QUESTIONS[book]?.length) {
    if (navigator.onLine !== false && getDb()) refreshBookFromNetwork(book);
    return QUESTIONS[book];
  }
  if (QUESTIONS[book]?.length) {
    bookLoadState[book] = true;
    refreshBookFromNetwork(book);
    return QUESTIONS[book];
  }
  if (bookLoadPromises[book]) return bookLoadPromises[book];
  bookLoadPromises[book] = (async () => {
    try {
      if (!getDb()) throw new Error('no supabase');
      const { data, error } = await fetchBookQuestions(book);
      if (error) throw error;
      ingestBookQuestions(book, data || []);
      bookLoadState[book] = true;
    } catch (netErr) {
      const offline = await loadQuestionsOffline();
      const cached = offline?.books?.[book];
      if (cached?.length) {
        QUESTIONS[book] = dedupeQuestionList(cached);
        bookLoadState[book] = true;
        console.info(`[questions] loaded ${book} from offline cache`);
      } else {
        seedQuestionsFromBundle();
        if (QUESTIONS[book]?.length) {
          bookLoadState[book] = true;
          console.info(`[questions] loaded ${book} from demo bundle`);
        } else {
          throw netErr;
        }
      }
    }
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

function seedQuestionsFromBundle() {
  const bundle = (typeof window !== 'undefined' && window.DEMO_QUESTIONS_BUNDLE) || null;
  if (!bundle) return false;
  let seeded = false;
  for (const book of QUESTION_BOOKS) {
    if (QUESTIONS[book]?.length) {
      bookLoadState[book] = true;
      continue;
    }
    const rows = bundle[book];
    if (rows?.length) {
      QUESTIONS[book] = dedupeQuestionList(rows);
      bookLoadState[book] = true;
      seeded = true;
    }
  }
  if (seeded || QUESTION_BOOKS.some((b) => QUESTIONS[b]?.length)) updateDemoBookPicker();
  return QUESTION_BOOKS.some((b) => QUESTIONS[b]?.length);
}

async function loadQuestions() {
  // Bundle-first: unlock UI without waiting for network.
  const hasBundle = seedQuestionsFromBundle();
  if (hasBundle) {
    updateLoginQuestionHint();
    updateLevelCounts();
    updateDemoBookPicker();
    if (navigator.onLine !== false) {
      void (async () => {
        try {
          if (window.AlhudaPlatform?.loadQuestionsCached) {
            const data = await AlhudaPlatform.loadQuestionsCached();
            const fmt = { tawheed: [], usool: [], nawawi: [] };
            (data || []).forEach((q) => { if (fmt[q.book]) fmt[q.book].push(q); });
            for (const book of QUESTION_BOOKS) {
              if (fmt[book]?.length) {
                ingestBookQuestions(book, fmt[book]);
                bookLoadState[book] = true;
              }
            }
          } else {
            loadRemainingBooksInBackground();
          }
          updateLoginQuestionHint();
          updateLevelCounts();
        } catch (e) {
          console.warn('background question refresh:', e);
        }
      })();
    }
    return;
  }

  setAppLoading(true, 'جاري تحميل الأسئلة...');
  try {
    seedQuestionsFromBundle();
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
      } catch (e) { /* cache miss — try offline then lazy load */ }
    }
    const offline = await loadQuestionsOffline();
    if (offline?.books) {
      let any = false;
      for (const book of QUESTION_BOOKS) {
        const rows = offline.books[book];
        if (rows?.length) {
          QUESTIONS[book] = dedupeQuestionList(rows);
          bookLoadState[book] = true;
          any = true;
        }
      }
      if (any) {
        updateLoginQuestionHint();
        updateLevelCounts();
        updateDemoBookPicker();
        if (navigator.onLine !== false) loadRemainingBooksInBackground();
        return;
      }
    }
    await loadBookQuestions('tawheed');
    updateLoginQuestionHint();
    loadRemainingBooksInBackground();
  } catch (e) {
    console.error(e);
    seedQuestionsFromBundle();
    const offline = await loadQuestionsOffline();
    if (offline?.books) {
      for (const book of QUESTION_BOOKS) {
        const rows = offline.books[book];
        if (rows?.length) {
          QUESTIONS[book] = dedupeQuestionList(rows);
          bookLoadState[book] = true;
        }
      }
      updateLoginQuestionHint();
      updateDemoBookPicker();
      if (typeof showToast === 'function') showToast('وضع دون اتصال — أسئلة محفوظة محلياً', 'ok');
      return;
    }
    if (QUESTION_BOOKS.some((b) => QUESTIONS[b]?.length)) {
      updateLoginQuestionHint();
      updateDemoBookPicker();
      return;
    }
    const hint = document.getElementById('login-hint');
    if (hint) {
      hint.textContent = navigator.onLine === false
        ? '⚠️ لا يوجد اتصال — يمكن تجربة النموذج بالأسئلة المحفوظة'
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
  const stageQs = getQuestionsForStageGame();
  if (stageQs !== null) return stageQs;

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
    updateStagePickerUI();
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
  updateStagePickerUI();
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
  state.useManualRange = false;
  state.stageReviewMode = false;
  updateBookButtons();
  updateLevelCounts();
  selectLevel('easy');
  const toLoad = b === 'merge3' ? QUESTION_BOOKS : [b];
  toLoad.forEach((book) => loadBookQuestions(book).catch(() => {}));
}
function selectLevel(l) {
  state.level = l;
  state.bankVersion = 0;
  state.useManualRange = false;
  state.stageReviewMode = false;
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
  updateStagePickerUI();
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
    if (!state.useManualRange && !state.stageReviewMode && !state.challengeMode && !state.homeworkId) {
      const { stages, prog } = getStageMeta(state.book, state.level);
      if (stages.length && prog.completedStages.length >= stages.length) {
        showAlert('أنهيت كل المراحل! اختر/ي مرحلة مكتملة (✓) للمراجعة ثم اضغط/ي الزر.');
        return;
      }
    }
    const qs = getQuestionsForGame();
    if (!qs.length) {
      if (!state.useManualRange && !state.stageReviewMode) {
        showAlert('لا توجد أسئلة متبقية في المرحلة الحالية. اختر/ي مرحلة للمراجعة أو كتاباً آخر.');
      } else {
        showAlert('لا توجد أسئلة لهذا الاختيار. جرّب/ي كتاباً أو مستوى آخر.');
      }
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
  if (!state.demoMode && !state.useManualRange && !state.challengeMode && !state.homeworkId) {
    // qFrom set by getQuestionsForStageGame
  } else if (!state.demoMode) {
    state.qFrom = parseInt(document.getElementById('q-from-input')?.value, 10) || 1;
  }
  if (typeof trackEvent === 'function') trackEvent('game_start', { book: state.book, level: state.level, training: trainingMode, stage: state.activeStageNum, review: state.stageReviewMode });
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
  updateStageGameBadge();
  show('game');
  renderQ();
}

function renderQ() {
  if (state.idx >= state.questions.length) { void endGame(); return; }
  stopSpeaking();
  const q = state.questions[state.idx];
  state.answered = false;
  document.getElementById('show-answer-btn').style.display = 'none';
  const stagePrefix = (!state.demoMode && !state.challengeMode && !state.homeworkId && !state.useManualRange)
    ? `مرحلة ${arabicNum(state.activeStageNum || 1)} — `
    : '';
  document.getElementById('q-num').textContent = (state.demoMode || state.challengeMode)
    ? `السؤال ${state.idx + 1} من ${state.total}`
    : `${stagePrefix}سؤال ${state.qFrom + state.idx} — ${state.idx + 1}/${state.total}`;
  updateStageGameBadge();
  document.getElementById('q-text').textContent = q.q;
  document.getElementById('q-book-badge').textContent = BOOK_LABELS[q.book] || q.book;
  document.getElementById('q-type-badge').style.display = q.type === 'tf' ? 'inline-block' : 'none';
  updateVoiceUI();
  updateProgress();
  const grid = document.getElementById('ans-grid');
  grid.innerHTML = '';
  if (q.type === 'tf') {
    ['صح ✓', 'خطأ ✗'].forEach((txt, i) => {
      appendAnswerOption(grid, txt, (i === 0) === q.tf, i === 0 ? 0 : 3, q);
    });
  } else {
    shuffleArr([0,1,2,3].slice(0, (q.a || []).length)).forEach((i, orderIdx) => {
      appendAnswerOption(grid, q.a[i], i === q.c, orderIdx, q);
    });
  }
  startQuestionTimer();
  questionShownAt = Date.now();
  updateQuranReciteSlot(q);
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
  if (state.demoMode) recordDemoAnalytics(q, isOk, isOk ? '' : (btn?.textContent || ''), getQuestionElapsedMs());

  if (isOk) {
    btn.classList.add('correct');
    btn.setAttribute('aria-pressed', 'true');
    selfBox.style.display = 'none';
    if (!trainingMode && !state.demoMode) {
      state.streak++; state.correct++;
      markQuestionSolvedInStage(q?.id);
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
    mountAnswerFeedback(q, buildAnswerFeedbackHtml(q, true));
    setFeedbackPanelOpen(true);
    setFeedbackContinueVisible(true);
    state.lastFeedbackWrong = '';
    updateFeedbackSpeakBtn(true);
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
      mountAnswerFeedback(q, buildAnswerFeedbackHtml(q, false, picked));
    } else {
      selfBox.style.display = 'none';
      mountAnswerFeedback(q, buildAnswerFeedbackHtml(q, false, picked));
    }
    document.getElementById('show-answer-btn').style.display = trainingMode ? 'block' : 'none';
    setFeedbackPanelOpen(true);
    setFeedbackContinueVisible(true);
    state.lastFeedbackWrong = picked;
    updateFeedbackSpeakBtn(true);
  }
  persistGameSession();
}

function nextQ() {
  if (state.gameEnding || state.gameEnded) return;
  stopSpeaking();
  updateFeedbackSpeakBtn(false);
  state.lastFeedbackWrong = '';
  state.idx++;
  document.getElementById('feedback').classList.remove('show', 'ok', 'bad');
  setFeedbackPanelOpen(false);
  document.getElementById('fb-self-correct').style.display = 'none';
  document.getElementById('fb-exp').textContent = '';
  if (state.idx >= state.questions.length) {
    if (state.demoMode) endDemo();
    else void endGame();
  } else {
    renderQ();
    prefetchUpcomingQuran(state.idx);
    prefetchUpcomingTts(state.idx);
  }
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
  const reviewExp = document.getElementById('review-exp');
  reviewExp.innerHTML = buildAnswerFeedbackHtml(q, false, item.picked || '');
  bindQuranReciteButton(reviewExp, q);
  const actions = document.getElementById('review-voice-actions');
  if (actions) {
    actions.innerHTML = `
      <button type="button" class="btn btn-white btn-sm" id="btn-review-speak">🔊 اقرأ الشرح</button>
      ${hasQuranAyahContent(q) ? `<button type="button" class="btn btn-white btn-sm" id="btn-review-recite">${QURAN_RECITE_BTN_LABEL}</button>` : ''}
    `;
    document.getElementById('btn-review-speak')?.addEventListener('click', (e) => {
      void speakFeedbackOnce(q, item.picked || '', e.currentTarget);
    });
    document.getElementById('btn-review-recite')?.addEventListener('click', (e) => {
      void playQuranForQuestion(q, e.currentTarget);
    });
  }
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
    mountAnswerFeedback(q, buildAnswerFeedbackHtml(q, false));
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
    let resSub = isTraining ? 'وضع التدريب — لا يُحسب في النقاط أو اللوحة' : (stars === 3 ? 'نتيجة ذهبية! أنت بطل/ة! 🌟' : stars >= 2 ? 'نتيجة رائعة! واصل/ي التعلّم 🌟' : 'واصل/ي المحاولة، أنت قادر/ة! 💪');
    if (!isTraining && !state.useManualRange && !state.challengeMode && !state.homeworkId) {
      const stageDone = syncStageCompletion(state.activeStageNum);
      const { stages, prog } = getStageMeta(state.book, state.level);
      if (stageDone) {
        if (prog.completedStages.length >= stages.length) {
          resSub = '🎉 أنهيت كل المراحل! يمكنك مراجعة أي مرحلة من الشاشة الرئيسية';
          state.stageReviewMode = false;
        } else {
          resSub = `✅ أتممت المرحلة ${arabicNum(state.activeStageNum)}! المرحلة التالية: ${arabicNum(prog.currentStage)}`;
          state.stageReviewMode = false;
        }
      } else if (!state.stageReviewMode && state.correct >= state.total) {
        resSub = `✅ أنهيت أسئلة هذه الجولة — واصل/ي المرحلة ${arabicNum(prog.currentStage || state.activeStageNum)}`;
      }
    }
    document.getElementById('res-sub').textContent = resSub;
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
  const cols = ['#34D399', '#FCD34D', '#7DD3FC'];
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'cp cp-soft';
      p.style.left = (30 + Math.random() * 40) + 'vw';
      p.style.top = '42vh';
      p.style.background = cols[Math.floor(Math.random() * cols.length)];
      p.style.animationDuration = (0.7 + Math.random() * 0.4) + 's';
      p.style.width = (4 + Math.random() * 4) + 'px';
      p.style.height = (4 + Math.random() * 4) + 'px';
      p.style.opacity = '0.75';
      w.appendChild(p);
      setTimeout(() => p.remove(), 1100);
    }, i * 40);
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
    refreshLoginAnalyticsPanel();
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
  applyTheme(localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
  updateReciterSettingsUI();
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
  refreshLoginAnalyticsPanel();
  void refreshTtsProviderBadge();
  // Defer Quran warm until demo/game start — avoid competing with first paint.
  window.addEventListener('offline', () => applyOfflineVoicePolicy());
  if (navigator.onLine === false) applyOfflineVoicePolicy();
  document.getElementById('login-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !LOGIN_LOCKED) doLogin();
  });
  document.getElementById('btn-login')?.addEventListener('click', () => {
    if (!LOGIN_LOCKED) doLogin();
  });
  window.addEventListener('pagehide', () => persistGameSession());
})();
