
const SUPABASE_URL = 'https://smcyaqwxbmhshhhhdece.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4OhSsWwIfV4QxGRf1fujLA_TjE111eU';
/** Lazy client — Supabase CDN may load after first paint. */
let dbClient = null;
function getDb() {
  if (dbClient) return dbClient;
  if (typeof window !== 'undefined' && window.supabase?.createClient) {
    dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return dbClient;
}
Object.defineProperty(window, '__alhudaDb', { get: getDb });
// Compat: most code uses `db.` — bind via Proxy after first access pattern.
const db = new Proxy({}, {
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
const GAME_RESUME_KEY = 'alhudaGameResumeV1';
const PENDING_SCORES_KEY = 'pendingScores';
const QUESTION_TIME_SEC = 45;
const TIMER_SAND_TOP_H = 18;
const TIMER_SAND_BOTTOM_H = 22;
const TIMER_SAND_TOP_Y = 12;
const TIMER_SAND_BOTTOM_Y = 56;
const LOGIN_LOCKED = false;
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
let state = { user:null, userType:'', userName:'', userEmail:'', book:'tawheed', level:'easy', questions:[], idx:0, score:0, hearts:5, streak:0, maxStreak:0, correct:0, wrong:0, answered:false, total:15, bankVersion:0, wrongLog:[], answerLog:[], reviewIdx:0, reviewReturn:'results', homeworkId:null, activeStageNum:1, stageReviewMode:false, useManualRange:false, displayAnswerOrder:null, roundSize:15 };
let trainingMode = false, soundOn = true, voiceOn = true, voiceReadAnswers = true, lastGameXp = 0, loginInProgress = false;
let countdownTimer = null, questionTimerId = null, questionTimerLeft = QUESTION_TIME_SEC;
let gameEndTimer = null, syncPendingScoresInFlight = null;
let questionShownAt = 0;
const AZURE_TTS_USAGE_KEY = 'azureTtsCharsMonthV1';
const AZURE_F0_SOFT_LIMIT = 450000; // warn before free 500k/month
const TTS_ERROR_STATS_KEY = 'ttsErrorStatsV1';
let ttsSessionFailCount = 0;
let ttsLastErrorMsg = '';

const OFFLINE_QUESTIONS_DB = 'alhudaQuestionsOffline';
const OFFLINE_QUESTIONS_STORE = 'books';
const OFFLINE_QUESTIONS_KEY = 'questionsOfflineV1';

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
    const idb = await openOfflineQuestionsDb();
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(OFFLINE_QUESTIONS_STORE, 'readwrite');
      tx.objectStore(OFFLINE_QUESTIONS_STORE).put(payload, OFFLINE_QUESTIONS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    idb.close();
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
    const idb = await openOfflineQuestionsDb();
    const data = await new Promise((resolve, reject) => {
      const tx = idb.transaction(OFFLINE_QUESTIONS_STORE, 'readonly');
      const req = tx.objectStore(OFFLINE_QUESTIONS_STORE).get(OFFLINE_QUESTIONS_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    idb.close();
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

function getQuestionElapsedMs() {
  if (!questionShownAt) return null;
  return Date.now() - questionShownAt;
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
const STAGE_SIZE = 20; // legacy fallback only
/** Max questions per difficulty tier (rebalanced by real easy→hard order). */
const LEVEL_CAPS = { easy: 80, medium: 100, hard: 120 };
const ROUND_SIZE_OPTIONS = [15, 20, 30, 40];
const ROUND_SIZE_MIN = 15;
const ROUND_SIZE_MAX = 80;
const ROUND_SIZE_DEFAULT = 15;
const LEVEL_FLOW = ['easy', 'medium', 'hard'];
const LEVEL_LABELS_AR = { easy: 'سهل', medium: 'متوسط', hard: 'صعب', all: 'الكل' };
/** Unlock next tier after this fraction of the current tier is solved (not 100%). */
const TIER_UNLOCK_RATIO = 0.5;
let tierCloudPushTimer = null;

function isRealGameLocked() {
  return LOGIN_LOCKED;
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
  // Show for demo and full play — many first-timers skip understanding voice/ayah/continue.
  if (localStorage.getItem('alhudaTutorialV2') === '1') return;
  if (sessionStorage.getItem('skipGameTutorial')) return;
  const ov = document.getElementById('game-tutorial-overlay');
  if (!ov) return;
  // Reset to first slide each first-open.
  ov.querySelectorAll('.gt-slide').forEach((s, i) => s.classList.toggle('active', i === 0));
  ov.querySelectorAll('.gt-dot').forEach((d, i) => d.classList.toggle('on', i === 0));
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
  localStorage.setItem('alhudaTutorialV2', '1');
  localStorage.setItem('gameTutorialDone', '1');
  const ov = document.getElementById('game-tutorial-overlay');
  if (ov) {
    ov.classList.remove('open');
    ov.setAttribute('aria-hidden', 'true');
    releaseFocusTrap(ov);
  }
}

function getProgress() {
  try { return JSON.parse(localStorage.getItem('playerProgress') || '{}'); } catch { return {}; }
}
function progressNameKey(name) {
  return String(name || '').trim().normalize('NFC').toLowerCase();
}
function getProgressStore() {
  try { return JSON.parse(localStorage.getItem('alhudaProgressByNameV1') || '{}'); } catch { return {}; }
}
function saveProgressStore(store) {
  localStorage.setItem('alhudaProgressByNameV1', JSON.stringify(store || {}));
}
function loadProgressForName(name) {
  const key = progressNameKey(name);
  if (!key) return getDefaultProgress();
  const store = getProgressStore();
  if (store[key]) return { ...getDefaultProgress(), ...store[key] };
  // Migrate legacy single blob once for this name.
  const legacy = getProgress();
  if (legacy && (legacy.xp || legacy.totalGames)) return { ...getDefaultProgress(), ...legacy };
  return getDefaultProgress();
}
function saveProgress(p) {
  localStorage.setItem('playerProgress', JSON.stringify(p));
  const name = state.userName || localStorage.getItem('savedName') || '';
  const key = progressNameKey(name);
  if (key) {
    const store = getProgressStore();
    store[key] = p;
    saveProgressStore(store);
  }
}
function getDefaultProgress() {
  return { xp: 0, dailyStreak: 0, lastPlayDate: '', totalGames: 0, totalCorrect: 0, bestStreak: 0, bestScore: 0, completedStages: {}, stageProgress: {}, badges: [], bookProgress: { tawheed: { answered: 0, correct: 0 }, usool: { answered: 0, correct: 0 }, nawawi: { answered: 0, correct: 0 } }, wrongQuestionIds: [], wrongCounts: {}, gameHistory: [], classId: null, classCode: '', className: '', dailyMissionDate: '', dailyMissionDone: false };
}
function ensureProgress() {
  const raw = getProgress();
  const p = { ...getDefaultProgress(), ...raw };
  const needsNorm =
    !raw
    || typeof raw !== 'object'
    || typeof raw.wrongCounts !== 'object'
    || !Array.isArray(raw.wrongQuestionIds)
    || typeof raw.stageProgress !== 'object';
  if (!p.wrongCounts || typeof p.wrongCounts !== 'object') p.wrongCounts = {};
  if (!Array.isArray(p.wrongQuestionIds)) p.wrongQuestionIds = [];
  if (!p.stageProgress || typeof p.stageProgress !== 'object') p.stageProgress = {};
  if (needsNorm) saveProgress(p);
  return p;
}
function adoptProgressForName(name) {
  const p = loadProgressForName(name);
  localStorage.setItem('playerProgress', JSON.stringify(p));
  return p;
}
function getPrimaryName() {
  return localStorage.getItem('alhudaPrimaryName') || localStorage.getItem('savedName') || '';
}
function setPrimaryName(name) {
  const n = String(name || '').trim();
  if (n) localStorage.setItem('alhudaPrimaryName', n);
}
function wipeLocalProgressForName(name) {
  const key = progressNameKey(name);
  const store = getProgressStore();
  if (key) delete store[key];
  saveProgressStore(store);
  const fresh = getDefaultProgress();
  localStorage.setItem('playerProgress', JSON.stringify(fresh));
  localStorage.removeItem('demoDone');
  localStorage.removeItem('lastStats');
  localStorage.removeItem('gameResume');
  try { localStorage.removeItem(GAME_RESUME_KEY); } catch { /* ignore */ }
  return fresh;
}
function getBookQuestionCounts(book) {
  const pools = buildDifficultyPools(book);
  return {
    easy: pools.easy.length,
    medium: pools.medium.length,
    hard: pools.hard.length,
    all: pools.easy.length + pools.medium.length + pools.hard.length,
  };
}

function difficultyRank(q) {
  const lvl = { easy: 0, medium: 1, hard: 2 };
  return lvl[q?.level] ?? 1;
}

/**
 * Build playable pools from each question's stored level (easy|medium|hard).
 * Caps limit how long a tier feels (80/100/120); leftover of that same label
 * stays out of other tiers (still available via «الكل»).
 */
function buildDifficultyPools(book) {
  const sortTier = (list) =>
    list.slice().sort((a, b) => {
      const c = chapterSortIndex(a.book, a.cat) - chapterSortIndex(b.book, b.cat);
      if (c !== 0) return c;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

  const buckets = { easy: [], medium: [], hard: [] };
  for (const q of getAllQuestions(book)) {
    const lvl = q?.level === 'easy' || q?.level === 'hard' ? q.level : 'medium';
    buckets[lvl].push(q);
  }
  buckets.easy = sortTier(buckets.easy);
  buckets.medium = sortTier(buckets.medium);
  buckets.hard = sortTier(buckets.hard);

  const total = buckets.easy.length + buckets.medium.length + buckets.hard.length;
  if (!total) return { easy: [], medium: [], hard: [] };

  let easyCap = LEVEL_CAPS.easy;
  let mediumCap = LEVEL_CAPS.medium;
  let hardCap = LEVEL_CAPS.hard;
  // Small books: ~30/35/35 of that book's total, still ceilings.
  if (total < easyCap + mediumCap + hardCap) {
    easyCap = Math.min(LEVEL_CAPS.easy, Math.max(8, Math.round(total * 0.30)));
    mediumCap = Math.min(LEVEL_CAPS.medium, Math.max(8, Math.round(total * 0.35)));
    hardCap = Math.max(0, total - easyCap - mediumCap);
  }

  return {
    easy: buckets.easy.slice(0, Math.min(easyCap, buckets.easy.length)),
    medium: buckets.medium.slice(0, Math.min(mediumCap, buckets.medium.length)),
    hard: buckets.hard.slice(0, Math.min(hardCap, buckets.hard.length)),
  };
}

function getOrderedPool(book, level) {
  if (level === 'all') {
    // Full bank — not capped (tiers alone use LEVEL_CAPS).
    return getAllQuestions(book).slice().sort((a, b) => {
      const d = difficultyRank(a) - difficultyRank(b);
      if (d !== 0) return d;
      const c = chapterSortIndex(a.book, a.cat) - chapterSortIndex(b.book, b.cat);
      if (c !== 0) return c;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }
  if (LEVEL_FLOW.includes(level)) {
    return buildDifficultyPools(book)[level] || [];
  }
  // Fallback: raw filter
  let pool = getAllQuestions(book);
  if (level !== 'all') pool = pool.filter(q => q.level === level);
  return pool;
}

function getTierProgress(book, level) {
  const pool = getOrderedPool(book, level);
  const key = stageProgressKey(book, level);
  const prog = ensureStageProgressEntry(key);
  const solved = prog.solvedIds.filter((id) => pool.some((q) => q.id === id)).length;
  const unlockNeed = unlockThreshold(pool.length);
  return {
    pool,
    prog,
    solved,
    total: pool.length,
    done: pool.length > 0 && solved >= pool.length,
    unlockNeed,
    unlockReady: pool.length === 0 || solved >= unlockNeed,
  };
}

function unlockThreshold(total) {
  if (!total) return 0;
  return Math.max(1, Math.ceil(total * TIER_UNLOCK_RATIO));
}

function isTierReadyToUnlockNext(book, level) {
  return getTierProgress(book, level).unlockReady;
}

function isLevelUnlocked(book, level) {
  // All difficulty tiers stay open — no progressive lock.
  return true;
}

function nextLockedLevelMessage(book, level) {
  if (level === 'medium') {
    const t = getTierProgress(book, 'easy');
    const left = Math.max(0, t.unlockNeed - t.solved);
    return `افتح المتوسط بعد حل ${arabicNum(t.unlockNeed)} من ${arabicNum(t.total)} سهل (متبقي ${arabicNum(left)})`;
  }
  if (level === 'hard') {
    if (!isTierReadyToUnlockNext(book, 'easy')) {
      const t = getTierProgress(book, 'easy');
      const left = Math.max(0, t.unlockNeed - t.solved);
      return `أكمل/ي نصف السهل أولاً (متبقي ${arabicNum(left)}) ثم المتوسط`;
    }
    const t = getTierProgress(book, 'medium');
    const left = Math.max(0, t.unlockNeed - t.solved);
    return `افتح الصعب بعد حل ${arabicNum(t.unlockNeed)} من ${arabicNum(t.total)} متوسط (متبقي ${arabicNum(left)})`;
  }
  return '';
}

function stageProgressKey(book, level) {
  return `${book}:${level}`;
}

function ensureStageProgressEntry(key) {
  const p = ensureProgress();
  if (!p.stageProgress) p.stageProgress = {};
  let dirty = false;
  if (!p.stageProgress[key]) {
    p.stageProgress[key] = { solvedIds: [], completedStages: [], currentStage: 1 };
    dirty = true;
  }
  const entry = p.stageProgress[key];
  if (!Array.isArray(entry.solvedIds)) { entry.solvedIds = []; dirty = true; }
  if (!Array.isArray(entry.completedStages)) { entry.completedStages = []; dirty = true; }
  if (!entry.currentStage) { entry.currentStage = 1; dirty = true; }
  if (dirty) saveProgress(p);
  return entry;
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
  if (!questionId || trainingMode || state.homeworkId || state.stageReviewMode) return;
  const q = findQuestionRecord(questionId);
  const tier = LEVEL_FLOW.includes(state.level)
    ? state.level
    : (LEVEL_FLOW.includes(q?.level) ? q.level : 'medium');
  const book = (q && QUESTION_BOOKS.includes(q.book))
    ? q.book
    : (QUESTION_BOOKS.includes(state.book) ? state.book : null);
  if (!book) return;
  markSolvedForBookTier(book, tier, questionId);
}

function findQuestionRecord(questionId) {
  const cur = state.questions?.[state.idx];
  if (cur?.id === questionId) return cur;
  for (const b of QUESTION_BOOKS) {
    const found = (QUESTIONS[b] || []).find((x) => x.id === questionId);
    if (found) return found;
  }
  return null;
}

function markSolvedForBookTier(book, tier, questionId) {
  const key = stageProgressKey(book, tier);
  const p = ensureProgress();
  if (!p.stageProgress) p.stageProgress = {};
  if (!p.stageProgress[key]) {
    p.stageProgress[key] = { solvedIds: [], completedStages: [], currentStage: 1 };
  }
  const prog = p.stageProgress[key];
  if (!Array.isArray(prog.solvedIds)) prog.solvedIds = [];
  if (prog.solvedIds.includes(questionId)) return;
  prog.solvedIds.push(questionId);
  saveProgress(p);
  scheduleTierProgressCloudPush();
}

function getSolvedIdSet(book) {
  const p = ensureProgress();
  const books = book === 'merge3' ? QUESTION_BOOKS.slice() : (QUESTION_BOOKS.includes(book) ? [book] : QUESTION_BOOKS.slice());
  const set = new Set();
  for (const b of books) {
    for (const lvl of LEVEL_FLOW) {
      const entry = p.stageProgress?.[stageProgressKey(b, lvl)];
      for (const id of entry?.solvedIds || []) set.add(id);
    }
  }
  return set;
}

function mergeRemoteStageProgress(remote) {
  if (!remote || typeof remote !== 'object') return false;
  const p = ensureProgress();
  if (!p.stageProgress) p.stageProgress = {};
  let changed = false;
  for (const [key, entry] of Object.entries(remote)) {
    if (!entry || typeof entry !== 'object') continue;
    const local = p.stageProgress[key] || { solvedIds: [], completedStages: [], currentStage: 1 };
    const solvedIds = [...new Set([...(local.solvedIds || []), ...(entry.solvedIds || [])])];
    const completedStages = [...new Set([...(local.completedStages || []), ...(entry.completedStages || [])])]
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const currentStage = Math.max(Number(local.currentStage) || 1, Number(entry.currentStage) || 1);
    const same =
      solvedIds.length === (local.solvedIds || []).length
      && solvedIds.every((id) => (local.solvedIds || []).includes(id))
      && currentStage === (local.currentStage || 1);
    if (!same) changed = true;
    p.stageProgress[key] = { solvedIds, completedStages, currentStage };
  }
  if (changed) saveProgress(p);
  return changed;
}

function scheduleTierProgressCloudPush() {
  if (!state.user) return;
  clearTimeout(tierCloudPushTimer);
  tierCloudPushTimer = setTimeout(() => {
    void pushTierProgressToCloud();
  }, 1800);
}

async function pushTierProgressToCloud() {
  if (!state.user) return;
  const client = typeof getDb === 'function' ? getDb() : null;
  if (!client?.auth?.updateUser) return;
  const p = ensureProgress();
  const backup = {
    stageProgress: p.stageProgress || {},
    xp: p.xp || 0,
    badges: p.badges || [],
    wrongQuestionIds: p.wrongQuestionIds || [],
    wrongCounts: p.wrongCounts || {},
    bookProgress: p.bookProgress || {},
    totalGames: p.totalGames || 0,
    totalCorrect: p.totalCorrect || 0,
    bestStreak: p.bestStreak || 0,
    bestScore: p.bestScore || 0,
    dailyStreak: p.dailyStreak || 0,
    lastPlayDate: p.lastPlayDate || '',
  };
  try {
    const { error } = await client.auth.updateUser({
      data: {
        // Full progress blob is the source of truth; keep tier as a thin
        // stageProgress mirror for older clients that only read alhuda_tier_v1.
        alhuda_backup_v1: backup,
        alhuda_backup_v1_at: new Date().toISOString(),
        alhuda_tier_v1: backup.stageProgress,
        alhuda_tier_v1_at: new Date().toISOString(),
      },
    });
    if (error) console.warn('tier cloud push:', error.message);
  } catch (e) {
    console.warn('tier cloud push:', e);
  }
}

function mergeRemoteBackup(remote) {
  if (!remote || typeof remote !== 'object') return false;
  let changed = mergeRemoteStageProgress(remote.stageProgress || {});
  const p = ensureProgress();
  const takeMax = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
  const next = { ...p };
  next.xp = takeMax(p.xp, remote.xp);
  next.totalGames = takeMax(p.totalGames, remote.totalGames);
  next.totalCorrect = takeMax(p.totalCorrect, remote.totalCorrect);
  next.bestStreak = takeMax(p.bestStreak, remote.bestStreak);
  next.bestScore = takeMax(p.bestScore, remote.bestScore);
  next.dailyStreak = takeMax(p.dailyStreak, remote.dailyStreak);
  if ((remote.lastPlayDate || '') > (p.lastPlayDate || '')) next.lastPlayDate = remote.lastPlayDate;
  next.badges = [...new Set([...(p.badges || []), ...(remote.badges || [])])];
  next.wrongCounts = { ...(p.wrongCounts || {}) };
  for (const [id, n] of Object.entries(remote.wrongCounts || {})) {
    next.wrongCounts[id] = takeMax(next.wrongCounts[id], n);
  }
  next.wrongQuestionIds = [...new Set([
    ...(p.wrongQuestionIds || []),
    ...(remote.wrongQuestionIds || []),
    ...Object.keys(next.wrongCounts),
  ])].slice(-80);
  if (remote.bookProgress && typeof remote.bookProgress === 'object') {
    next.bookProgress = next.bookProgress || {};
    for (const [b, row] of Object.entries(remote.bookProgress)) {
      const local = next.bookProgress[b] || { answered: 0, correct: 0 };
      next.bookProgress[b] = {
        answered: takeMax(local.answered, row?.answered),
        correct: takeMax(local.correct, row?.correct),
      };
    }
  }
  const same =
    next.xp === p.xp
    && next.totalGames === p.totalGames
    && next.totalCorrect === p.totalCorrect
    && next.bestScore === p.bestScore
    && next.badges.length === (p.badges || []).length
    && JSON.stringify(next.wrongCounts) === JSON.stringify(p.wrongCounts || {});
  if (!same) {
    saveProgress(next);
    changed = true;
  }
  return changed;
}

async function pullTierProgressFromCloud() {
  if (!state.user) return false;
  const client = typeof getDb === 'function' ? getDb() : null;
  if (!client?.auth?.getUser) return false;
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return false;
    const remoteBackup = data?.user?.user_metadata?.alhuda_backup_v1;
    const remoteTier = data?.user?.user_metadata?.alhuda_tier_v1;
    let changed = false;
    if (remoteBackup) changed = mergeRemoteBackup(remoteBackup) || changed;
    else if (remoteTier) changed = mergeRemoteStageProgress(remoteTier) || changed;
    if (changed) {
      updateLevelCounts();
      if (typeof updateStagePickerUI === 'function') updateStagePickerUI();
      if (window.AlhudaPlatform?.onWelcomeHome) AlhudaPlatform.onWelcomeHome();
    }
    // Always push merged local∪remote so the other device gets newer local solves.
    scheduleTierProgressCloudPush();
    return changed;
  } catch (e) {
    console.warn('tier cloud pull:', e);
    return false;
  }
}

function syncStageCompletion(stageNum) {
  if (!LEVEL_FLOW.includes(state.level)) return false;
  const key = stageProgressKey(state.book, state.level);
  const p = ensureProgress();
  if (!p.stageProgress) p.stageProgress = {};
  if (!p.stageProgress[key]) {
    p.stageProgress[key] = { solvedIds: [], completedStages: [], currentStage: 1 };
  }
  const prog = p.stageProgress[key];
  if (!Array.isArray(prog.solvedIds)) prog.solvedIds = [];
  if (!Array.isArray(prog.completedStages)) prog.completedStages = [];
  const pool = getOrderedPool(state.book, state.level);
  const stages = splitPoolIntoStages(pool);
  const stage = stages[stageNum - 1];
  if (!stage) return false;
  const solved = stage.questions.filter((q) => prog.solvedIds.includes(q.id)).length;
  const allSolved = solved >= stage.questions.length;
  if (!allSolved) return false;
  if (!prog.completedStages.includes(stageNum)) {
    prog.completedStages.push(stageNum);
    prog.completedStages.sort((a, b) => a - b);
  }
  if ((prog.currentStage || 1) <= stageNum && stageNum < stages.length) {
    prog.currentStage = stageNum + 1;
  }
  saveProgress(p);
  return true;
}

function getQuestionsForStageGame() {
  // Pick up to roundSize unsolved questions from the capped difficulty tier.
  // Solved questions stay out until the learner explicitly starts review.
  if (state.useManualRange || state.homeworkId || trainingMode) return null;
  if (state.level === 'all' || !LEVEL_FLOW.includes(state.level)) return null;
  if (!isLevelUnlocked(state.book, state.level)) return [];

  const { pool, prog, done } = getTierProgress(state.book, state.level);
  if (!pool.length) return [];

  const round = Math.max(ROUND_SIZE_MIN, Math.min(ROUND_SIZE_MAX, state.roundSize || ROUND_SIZE_DEFAULT));

  if (state.stageReviewMode) {
    const solvedQs = pool.filter((q) => prog.solvedIds.includes(q.id));
    if (!solvedQs.length) return [];
    const size = Math.min(round, solvedQs.length);
    const shuffled = shuffleArr(solvedQs);
    const next = shuffled.slice(0, size);
    state.qFrom = 1;
    state.activeStageNum = 1;
    return dedupeQuestionList(next);
  }

  // Finished the tier — do not auto-recycle into review.
  if (done) return [];

  const unsolved = pool.filter((q) => !prog.solvedIds.includes(q.id));
  if (!unsolved.length) return [];

  const size = Math.min(round, unsolved.length);
  const next = unsolved.slice(0, size);
  const firstIdx = pool.findIndex((q) => q.id === next[0]?.id);
  state.qFrom = firstIdx >= 0 ? firstIdx + 1 : 1;
  const solvedBefore = pool.length - unsolved.length;
  state.activeStageNum = Math.max(1, Math.floor(solvedBefore / round) + 1);
  return dedupeQuestionList(next);
}

function updateStagePickerUI() {
  const el = document.getElementById('stage-picker');
  const hint = document.getElementById('stage-hint');
  const note = document.getElementById('round-progress-note');
  if (!el) return;

  if (!LEVEL_FLOW.includes(state.level)) {
    el.innerHTML = '<p class="stage-empty">اختَر/ي مستوى سهل أو متوسط أو صعب — أو استخدم/ي النطاق اليدوي من الخيارات المتقدمة</p>';
    if (hint) hint.textContent = state.level === 'all' ? 'وضع «الكل»: مراجعة مختلطة بدون مسار التدرّج' : '';
    if (note) note.textContent = '';
    updateStartButtonLabel();
    updateLevelLockUI();
    return;
  }

  const unlocked = isLevelUnlocked(state.book, state.level);
  if (!unlocked) {
    el.innerHTML = `<p class="stage-empty">🔒 ${escapeHtml(nextLockedLevelMessage(state.book, state.level))}</p>`;
    if (hint) hint.textContent = '';
    if (note) note.textContent = '';
    updateStartButtonLabel();
    updateLevelLockUI();
    return;
  }

  const { pool, solved, total, done } = getTierProgress(state.book, state.level);
  if (!total) {
    el.innerHTML = '<p class="stage-empty">لا توجد أسئلة لهذا المستوى</p>';
    if (hint) hint.textContent = '';
    if (note) note.textContent = '';
    updateStartButtonLabel();
    updateLevelLockUI();
    return;
  }

  const remaining = Math.max(0, total - solved);
  const maxPick = Math.max(1, Math.min(ROUND_SIZE_MAX, done ? total : (remaining || total)));
  if ((state.roundSize || ROUND_SIZE_DEFAULT) > maxPick) state.roundSize = maxPick;
  if ((state.roundSize || ROUND_SIZE_DEFAULT) < ROUND_SIZE_MIN && maxPick >= ROUND_SIZE_MIN) {
    state.roundSize = ROUND_SIZE_MIN;
  }

  const roundBtns = ROUND_SIZE_OPTIONS.filter((n) => n <= maxPick).map((n) => {
    const on = (state.roundSize || ROUND_SIZE_DEFAULT) === n ? 'sel' : '';
    return `<button type="button" class="level-btn round-size-btn ${on}" data-round="${n}" onclick="selectRoundSize(${n})">${arabicNum(n)}</button>`;
  }).join('');

  const reviewBtn = solved > 0
    ? `<button type="button" class="btn btn-white btn-sm review-tier-btn" onclick="startTierReview()">🔁 مراجعة ما حلّيته (${arabicNum(solved)})</button>`
    : '';

  const minPick = Math.min(ROUND_SIZE_MIN, maxPick);
  el.innerHTML = `
    <div class="round-size-wrap">
      <div class="level-row round-size-row">${roundBtns}</div>
      <div class="round-custom-row">
        <label for="round-custom-input">أو اكتب العدد بالضبط</label>
        <input type="number" id="round-custom-input" class="q-range-input round-custom-input" min="${minPick}" max="${maxPick}" value="${state.roundSize || ROUND_SIZE_DEFAULT}" inputmode="numeric" onchange="onRoundCustomInput()" oninput="onRoundCustomInput()">
        <span class="round-custom-max">إلى ${arabicNum(maxPick)}</span>
      </div>
      ${reviewBtn}
    </div>`;

  if (hint) {
    const label = LEVEL_LABELS_AR[state.level] || state.level;
    const round = Math.min(state.roundSize || ROUND_SIZE_DEFAULT, maxPick);
    if (state.useManualRange) {
      hint.textContent = 'وضع النطاق اليدوي مفعّل — مسار التدرّج معطّل لهذه الجولة';
    } else if (done) {
      hint.textContent = `🎉 أنهيت ${label} بالكامل (${arabicNum(total)} سؤال). الأسئلة المحلولة لن تظهر إلا إذا ضغطت مراجعة.`;
    } else {
      hint.textContent = `${label}: حلّيت ${arabicNum(solved)} من ${arabicNum(total)} — متبقي ${arabicNum(remaining)} · اختر ${arabicNum(round)} سؤال لهذه الجولة`;
    }
  }
  if (note) {
    note.textContent = done
      ? '✅ كل أسئلة هذا المستوى محلولة — استخدم المراجعة إذا أردت إعادة التدريب'
      : `📌 السؤال الذي تجيب عليه صح يُحفظ ولن يعود في الجولات التالية (إلا بالمراجعة)`;
  }
  updateStartButtonLabel();
  updateLevelLockUI();
}

function selectRoundSize(n) {
  const num = Math.max(ROUND_SIZE_MIN, Math.min(ROUND_SIZE_MAX, Number(n) || ROUND_SIZE_DEFAULT));
  state.roundSize = num;
  state.useManualRange = false;
  state.stageReviewMode = false;
  const custom = document.getElementById('round-custom-input');
  if (custom && Number(custom.value) !== num) custom.value = String(num);
  updateStagePickerUI();
}

function onRoundCustomInput() {
  const el = document.getElementById('round-custom-input');
  if (!el) return;
  let n = parseInt(el.value, 10);
  if (!Number.isFinite(n)) return;
  const { solved, total, done } = getTierProgress(state.book, state.level);
  const remaining = Math.max(0, total - solved);
  const maxPick = Math.max(1, Math.min(ROUND_SIZE_MAX, done ? total : (remaining || total || ROUND_SIZE_MAX)));
  const minPick = Math.min(ROUND_SIZE_MIN, maxPick);
  n = Math.max(minPick, Math.min(maxPick, n));
  el.value = String(n);
  state.roundSize = n;
  state.useManualRange = false;
  state.stageReviewMode = false;
  document.querySelectorAll('.round-size-btn').forEach((b) => {
    b.classList.toggle('sel', Number(b.dataset.round) === n);
  });
  updateStartButtonLabel();
  const hint = document.getElementById('stage-hint');
  if (hint && LEVEL_FLOW.includes(state.level)) {
    const label = LEVEL_LABELS_AR[state.level] || state.level;
    hint.textContent = `${label}: الجولة = ${arabicNum(n)} سؤال` + (done ? ' (مراجعة)' : ` — متبقي ${arabicNum(remaining)}`);
  }
}

function startTierReview() {
  const { solved, total } = getTierProgress(state.book, state.level);
  if (!solved || !total) {
    if (typeof showToast === 'function') showToast('لا يوجد محلول بعد للمراجعة', 'err');
    else showAlert('لا يوجد محلول بعد للمراجعة');
    return;
  }
  state.stageReviewMode = true;
  state.useManualRange = false;
  // Start immediately — rebuilding the picker can clear stageReviewMode via round-size handlers.
  void startCountdown();
}

function selectStage(num, isDone) {
  // Legacy hook kept for any old UI; map to review offset within tier.
  state.activeStageNum = Math.max(1, num || 1);
  state.stageReviewMode = !!isDone;
  updateStagePickerUI();
}

function getNextPlayableLevel(book, level) {
  if (level === 'easy' && isLevelUnlocked(book, 'medium')) return 'medium';
  if (level === 'medium' && isLevelUnlocked(book, 'hard')) return 'hard';
  return null;
}

function continueToNextLevel() {
  const next = getNextPlayableLevel(state.book, state.level);
  goHome();
  if (next) {
    selectLevel(next);
    if (typeof showToast === 'function') {
      showToast(`انتقلتَ/ِ إلى مستوى «${LEVEL_LABELS_AR[next] || next}»`, 'ok');
    }
  }
}

function updateNextLevelButton() {
  const btn = document.getElementById('btn-next-level');
  if (!btn) return;
  if (trainingMode || state.homeworkId || state.stageReviewMode) {
    btn.style.display = 'none';
    return;
  }
  const next = getNextPlayableLevel(state.book, state.level);
  if (!next) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  btn.textContent = `ابدأ المستوى التالي: ${LEVEL_LABELS_AR[next] || next} ←`;
}

function updateLevelLockUI() {
  for (const lvl of LEVEL_FLOW) {
    const btn = document.getElementById('btn-' + lvl);
    if (!btn) continue;
    const unlocked = isLevelUnlocked(state.book, lvl);
    btn.classList.toggle('locked', !unlocked);
    btn.toggleAttribute('disabled', !unlocked);
    btn.title = unlocked ? '' : nextLockedLevelMessage(state.book, lvl);
    const lockMark = unlocked ? '' : ' 🔒';
    const label = LEVEL_LABELS_AR[lvl] || lvl;
    const textNode = [...btn.childNodes].find((n) => n.nodeType === 3);
    if (textNode) textNode.textContent = label + lockMark;
  }
}

function updateStartButtonLabel() {
  const btn = document.getElementById('btn-start-game');
  if (!btn) return;
  if (!LEVEL_FLOW.includes(state.level)) {
    btn.textContent = 'ابدأ اللعبة 🎮';
    return;
  }
  if (!isLevelUnlocked(state.book, state.level)) {
    btn.textContent = '🔒 المستوى مقفل';
    return;
  }
  const { solved, total, done, pool } = getTierProgress(state.book, state.level);
  if (!pool.length) {
    btn.textContent = 'ابدأ اللعبة 🎮';
    return;
  }
  const remaining = Math.max(0, total - solved);
  const n = Math.min(state.roundSize || ROUND_SIZE_DEFAULT, state.stageReviewMode || done ? total : (remaining || total));
  if (state.stageReviewMode) {
    btn.textContent = `مراجعة ${arabicNum(n)} سؤال 🔁`;
  } else if (done) {
    btn.textContent = 'أنهيت المستوى — اختر مراجعة أو مستوى آخر';
  } else {
    btn.textContent = `ابدأ ${arabicNum(n)} سؤال 🎮`;
  }
}

function updateStageGameBadge() {
  const el = document.getElementById('stage-game-badge');
  if (!el || state.homeworkId || state.useManualRange) {
    if (el) el.style.display = 'none';
    return;
  }
  if (!LEVEL_FLOW.includes(state.level)) {
    el.style.display = 'none';
    return;
  }
  const { solved, total } = getTierProgress(state.book, state.level);
  const label = LEVEL_LABELS_AR[state.level] || '';
  el.style.display = '';
  el.textContent = `📊 ${label}: ${arabicNum(solved)}/${arabicNum(total)} — جولة ${arabicNum(state.roundSize || ROUND_SIZE_DEFAULT)}`;
}

function updateLevelCounts() {
  const c = getBookQuestionCounts(state.book);
  const setProg = (id, level) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (LEVEL_FLOW.includes(level)) {
      const { solved, total } = getTierProgress(state.book, level);
      if (!total) {
        el.textContent = '(٠)';
        return;
      }
      const left = Math.max(0, total - solved);
      el.textContent = left ? `(متبقي ${arabicNum(left)})` : '(مكتمل ✓)';
      el.title = `حلّيت ${arabicNum(solved)} من ${arabicNum(total)} في هذا المستوى`;
    } else if (level === 'all') {
      const total = c[level] || 0;
      if (!total) {
        el.textContent = '(٠)';
        return;
      }
      const poolIds = new Set(getOrderedPool(state.book, 'all').map((q) => q.id));
      const solved = [...getSolvedIdSet(state.book)].filter((id) => poolIds.has(id)).length;
      const left = Math.max(0, total - solved);
      el.textContent = left ? `(متبقي ${arabicNum(left)})` : '(مكتمل ✓)';
      el.title = `محلولة ${arabicNum(solved)} من ${arabicNum(total)} — المحلول لا يُعاد في «الكل»`;
    } else {
      el.textContent = c[level] ? `(${arabicNum(c[level])})` : '(٠)';
      el.title = '';
    }
  };
  setProg('cnt-easy', 'easy');
  setProg('cnt-medium', 'medium');
  setProg('cnt-hard', 'hard');
  setProg('cnt-all', 'all');
  updateLevelLockUI();
  updateUnlockReminder();
  updateLevelPathUI();
}

function getUnlockReminderInfo(book = state.book) {
  if (!isLevelUnlocked(book, 'medium')) {
    const t = getTierProgress(book, 'easy');
    const left = Math.max(0, t.unlockNeed - t.solved);
    if (!t.total || left <= 0) return null;
    return {
      next: 'medium',
      nextLabel: 'المتوسط',
      left,
      solved: t.solved,
      need: t.unlockNeed,
      total: t.total,
      fromLabel: 'السهل',
    };
  }
  if (!isLevelUnlocked(book, 'hard')) {
    const t = getTierProgress(book, 'medium');
    const left = Math.max(0, t.unlockNeed - t.solved);
    if (!t.total || left <= 0) return null;
    return {
      next: 'hard',
      nextLabel: 'الصعب',
      left,
      solved: t.solved,
      need: t.unlockNeed,
      total: t.total,
      fromLabel: 'المتوسط',
    };
  }
  return null;
}

function updateUnlockReminder() {
  const el = document.getElementById('unlock-reminder');
  if (!el) return;
  const info = getUnlockReminderInfo(state.book);
  if (!info) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = `<span class="ur-icon" aria-hidden="true">🌱</span><span class="ur-text">باقي عليك <strong>${arabicNum(info.left)}</strong> سؤال لفتح <strong>${info.nextLabel}</strong></span>`;
}

function updateLevelPathUI() {
  const el = document.getElementById('level-path');
  if (!el) return;
  const book = state.book;
  const steps = LEVEL_FLOW.map((lvl) => {
    const t = getTierProgress(book, lvl);
    const unlocked = isLevelUnlocked(book, lvl);
    const done = !!t.done;
    const active = state.level === lvl;
    let status = 'locked';
    if (done) status = 'done';
    else if (unlocked) status = active ? 'active' : 'open';
    const leftUnlock = unlocked
      ? Math.max(0, t.total - t.solved)
      : Math.max(0, (lvl === 'medium'
        ? getTierProgress(book, 'easy').unlockNeed - getTierProgress(book, 'easy').solved
        : getTierProgress(book, 'medium').unlockNeed - getTierProgress(book, 'medium').solved));
    let meta = '';
    if (!unlocked) meta = `يفتح بعد ${arabicNum(leftUnlock)}`;
    else if (done) meta = 'مكتمل';
    else meta = `متبقي ${arabicNum(Math.max(0, t.total - t.solved))}`;
    const pct = t.total ? Math.min(100, Math.round((t.solved / t.total) * 100)) : 0;
    return `<div class="lp-step lp-${status}" data-level="${lvl}" role="listitem">
      <button type="button" class="lp-btn" onclick="selectLevel('${lvl}')" ${unlocked ? '' : 'disabled'} aria-current="${active ? 'step' : 'false'}">
        <span class="lp-label">${LEVEL_LABELS_AR[lvl]}</span>
        <span class="lp-bar"><span class="lp-fill" style="width:${pct}%"></span></span>
        <span class="lp-meta">${meta}</span>
      </button>
    </div>`;
  }).join('<div class="lp-arrow" aria-hidden="true">←</div>');
  el.innerHTML = steps;
}

function exportProgressBackup() {
  try {
    const payload = {
      v: 1,
      app: 'alhuda',
      exportedAt: new Date().toISOString(),
      name: state.userName || getPrimaryName() || '',
      progress: ensureProgress(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `alhuda-progress-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (typeof showToast === 'function') showToast('تم تنزيل نسخة التقدّم', 'ok');
  } catch (e) {
    console.warn(e);
    showAlert('تعذّر تصدير التقدّم');
  }
}

function importProgressBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const incoming = raw?.progress && typeof raw.progress === 'object' ? raw.progress : raw;
      if (!incoming || typeof incoming !== 'object') throw new Error('bad file');
      const ok = window.confirm('دمج ملف التقدّم مع تقدّمك الحالي؟ (يُؤخذ الأعلى من كل جهاز)');
      if (!ok) return;
      if (incoming.stageProgress || incoming.xp != null || incoming.wrongCounts) {
        mergeRemoteBackup({
          stageProgress: incoming.stageProgress || {},
          xp: incoming.xp,
          badges: incoming.badges,
          wrongQuestionIds: incoming.wrongQuestionIds,
          wrongCounts: incoming.wrongCounts,
          bookProgress: incoming.bookProgress,
          totalGames: incoming.totalGames,
          totalCorrect: incoming.totalCorrect,
          bestStreak: incoming.bestStreak,
          bestScore: incoming.bestScore,
          dailyStreak: incoming.dailyStreak,
          lastPlayDate: incoming.lastPlayDate,
        });
      } else {
        mergeRemoteStageProgress(incoming);
      }
      updateLevelCounts();
      updateWelcomeGamification();
      if (typeof updateStagePickerUI === 'function') updateStagePickerUI();
      if (window.AlhudaPlatform?.onWelcomeHome) AlhudaPlatform.onWelcomeHome();
      scheduleTierProgressCloudPush();
      if (typeof showToast === 'function') showToast('تم استيراد ودمج التقدّم', 'ok');
    } catch (e) {
      console.warn(e);
      showAlert('ملف التقدّم غير صالح');
    }
  });
  input.click();
}

async function syncProgressAcrossDevices() {
  if (!state.user) {
    if (typeof showToast === 'function') showToast('سجّل/ي الدخول لمزامنة التقدّم بين الأجهزة', 'err');
    else showAlert('سجّل/ي الدخول لمزامنة التقدّم بين الأجهزة');
    return;
  }
  if (typeof showToast === 'function') showToast('جاري مزامنة التقدّم…', 'ok');
  const changed = await pullTierProgressFromCloud();
  await pushTierProgressToCloud();
  updateLevelCounts();
  updateWelcomeGamification();
  if (typeof updateStagePickerUI === 'function') updateStagePickerUI();
  if (window.AlhudaPlatform?.onWelcomeHome) AlhudaPlatform.onWelcomeHome();
  if (typeof showToast === 'function') {
    showToast(changed ? 'تم دمج التقدّم من السحابة' : 'التقدّم محدّث ومتزامن', 'ok');
  }
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


function arabicNum(n) {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
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
  if (open) {
    // Restore last dragged height (persisted) or default mid size
    applyFeedbackSheetHeight(feedbackSheetHeightPx || loadFeedbackSheetHeight() || null);
    ensureFeedbackSheetDragBound();
  } else {
    const qArea = document.querySelector('#game .q-area');
    if (qArea) qArea.style.paddingBottom = '';
  }
}

function setFeedbackContinueVisible(visible) {
  const btn = document.querySelector('#feedback .fb-continue-btn');
  if (btn) btn.style.display = visible ? '' : 'none';
}

let feedbackSheetHeightPx = 0;
let feedbackSheetDragBound = false;
const FB_SHEET_HEIGHT_KEY = 'alhudaFbSheetHeightV1';

function loadFeedbackSheetHeight() {
  if (feedbackSheetHeightPx) return feedbackSheetHeightPx;
  try {
    const n = parseInt(localStorage.getItem(FB_SHEET_HEIGHT_KEY) || '', 10);
    if (Number.isFinite(n) && n >= 120) feedbackSheetHeightPx = n;
  } catch (e) {}
  return feedbackSheetHeightPx;
}

function saveFeedbackSheetHeight() {
  if (!feedbackSheetHeightPx) return;
  try { localStorage.setItem(FB_SHEET_HEIGHT_KEY, String(feedbackSheetHeightPx)); } catch (e) {}
}

function feedbackSheetHeightBounds() {
  const vh = window.innerHeight || 640;
  return {
    min: Math.round(vh * 0.28),
    max: Math.round(vh * 0.88),
    def: Math.round(vh * 0.48),
  };
}

function applyFeedbackSheetHeight(px) {
  const fb = document.getElementById('feedback');
  if (!fb) return;
  const { min, max, def } = feedbackSheetHeightBounds();
  const preferred = px || loadFeedbackSheetHeight() || def;
  const h = Math.max(min, Math.min(max, Math.round(preferred)));
  feedbackSheetHeightPx = h;
  fb.style.maxHeight = h + 'px';
  fb.style.height = h + 'px';
  const handle = document.getElementById('fb-sheet-handle');
  if (handle) {
    const { min, max } = feedbackSheetHeightBounds();
    const pct = Math.round(((h - min) / Math.max(1, max - min)) * 100);
    handle.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, pct))));
  }
  // Keep question area clear of the sheet
  const qArea = document.querySelector('#game .q-area');
  if (qArea && document.getElementById('game')?.classList.contains('feedback-open')) {
    qArea.style.paddingBottom = Math.max(h + 24, 100) + 'px';
  }
}

function ensureFeedbackSheetDragBound() {
  if (feedbackSheetDragBound) return;
  const handle = document.getElementById('fb-sheet-handle');
  const fb = document.getElementById('feedback');
  if (!handle || !fb) return;
  feedbackSheetDragBound = true;

  let dragging = false;
  let startY = 0;
  let startH = 0;

  const onMove = (clientY) => {
    if (!dragging) return;
    // Drag up → taller sheet; drag down → shorter
    const dy = startY - clientY;
    applyFeedbackSheetHeight(startH + dy);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    fb.classList.remove('is-dragging');
    saveFeedbackSheetHeight();
    try { handle.releasePointerCapture?.(handle._fbPointerId); } catch (e) {}
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    dragging = true;
    startY = e.clientY;
    startH = fb.getBoundingClientRect().height || feedbackSheetHeightPx || feedbackSheetHeightBounds().def;
    fb.classList.add('is-dragging');
    handle._fbPointerId = e.pointerId;
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    onMove(e.clientY);
  });
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  // Keyboard: expand / collapse
  handle.addEventListener('keydown', (e) => {
    const { min, max, def } = feedbackSheetHeightBounds();
    const cur = feedbackSheetHeightPx || loadFeedbackSheetHeight() || def;
    if (e.key === 'ArrowUp') {
      applyFeedbackSheetHeight(cur + 40);
      saveFeedbackSheetHeight();
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      applyFeedbackSheetHeight(cur - 40);
      saveFeedbackSheetHeight();
      e.preventDefault();
    } else if (e.key === 'Home') {
      applyFeedbackSheetHeight(max);
      saveFeedbackSheetHeight();
      e.preventDefault();
    } else if (e.key === 'End') {
      applyFeedbackSheetHeight(min);
      saveFeedbackSheetHeight();
      e.preventDefault();
    }
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('game')?.classList.contains('feedback-open')) {
      applyFeedbackSheetHeight(feedbackSheetHeightPx || null);
    }
  }, { passive: true });
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
  if (!state.user?.id || String(state.user.id).startsWith('local-')) {
    document.body.dataset.scoreSave = 'local';
    return;
  }
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
function updateBookProgress() {
  const map = { tawheed: 'book-btn-tawheed', usool: 'book-btn-usool', nawawi: 'book-btn-nawawi', merge3: 'book-btn-merge' };
  for (const [book, id] of Object.entries(map)) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    let easy = 0, medium = 0, hard = 0, solved = 0, total = 0;
    const books = book === 'merge3' ? ['tawheed', 'usool', 'nawawi'] : [book];
    for (const b of books) {
      for (const lvl of LEVEL_FLOW) {
        const t = getTierProgress(b, lvl);
        if (lvl === 'easy') easy += t.solved;
        if (lvl === 'medium') medium += t.solved;
        if (lvl === 'hard') hard += t.solved;
        solved += t.solved;
        total += t.total;
      }
    }
    let prog = btn.querySelector('.book-progress');
    if (!prog) {
      prog = document.createElement('div');
      prog.className = 'book-progress';
      btn.appendChild(prog);
    }
    prog.textContent = total
      ? `${arabicNum(solved)}/${arabicNum(total)} · س${arabicNum(easy)} م${arabicNum(medium)} ص${arabicNum(hard)}`
      : '٠ سؤال';
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

/* ── Voice reading (Yousef baked MP3s; no browser/Edge fallback for lesson TTS) ── */
/** Fish Audio Arabic narrator (راوي) — all bank clips baked under this id. */
const TTS_VOICE = 'c3e5d81d807f4cbc9a0c2872a4dea9ea';
/** Must match baked-tts.js / collect_tts_strings.mjs (file hashes use this ver). */
const TTS_CACHE_VER = 'v30';
/** Bump to drop stale IndexedDB blobs from prior Yousef/v29 bake. */
const TTS_IDB_NAME = 'alhudaTtsCache_v3';
const TTS_BLOB_CACHE_MAX = 120;
const ttsBlobMemoryCache = new Map(); // key -> objectUrl
const ttsPrefetchInFlight = new Map();
const ttsKnownMissCache = new Set(); // avoid /api/tts storms for known baked misses
if (typeof window !== 'undefined' && window.__alhudaBakedTtsOnly == null) {
  // Refined by /api/tts-status on boot (wrangler BAKED_TTS_ONLY).
  window.__alhudaBakedTtsOnly = false;
}
const ttsPreloadedAudio = new Map(); // key -> HTMLAudioElement (decoded ahead of play)
const TTS_IDB_STORE = 'audio';



function ttsCacheKey(text, voice) {
  return `${TTS_CACHE_VER}::${voice || TTS_VOICE}::${String(text || '').slice(0, 600)}`;
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
  // Decode ahead so play() starts without a cold media-pipeline stall.
  try {
    const warm = new Audio();
    warm.preload = 'auto';
    warm.src = objectUrl;
    ttsPreloadedAudio.set(key, warm);
  } catch { /* ignore */ }
  while (ttsBlobMemoryCache.size > TTS_BLOB_CACHE_MAX) {
    const oldest = ttsBlobMemoryCache.keys().next().value;
    const old = ttsBlobMemoryCache.get(oldest);
    if (old) URL.revokeObjectURL(old);
    ttsBlobMemoryCache.delete(oldest);
    ttsPreloadedAudio.delete(oldest);
  }
}

async function fetchTtsBlob(text, voice = TTS_VOICE, signal) {
  const lookupVoice =
    voice === TTS_VOICE || /Neural|google|Wavenet/i.test(String(voice || ''))
      ? TTS_VOICE
      : voice;
  const key = ttsCacheKey(text, lookupVoice);
  // Memory hit = already playable via object URL — do not re-materialize a Blob
  // (that was an extra await tick before every warm/prefetch join).
  if (ttsBlobMemoryCache.has(key)) {
    return null;
  }
  if (ttsKnownMissCache.has(key)) {
    throw new Error('tts baked miss');
  }
  // Prefer static baked Yousef MP3s over IndexedDB (IDB may hold older wrong-provider audio).
  if (typeof bakedTtsAssetPath === 'function') {
    try {
      const bakedUrl = await bakedTtsAssetPath(text, lookupVoice);
      const bakedRes = await fetch(bakedUrl, { signal, cache: 'force-cache' });
      if (bakedRes.ok) {
        const ctype = (bakedRes.headers.get('content-type') || '').toLowerCase();
        // SPA fallback may serve HTML for missing /tts-baked/* — never treat as audio.
        if (!ctype.includes('audio') && !ctype.includes('mpeg') && !ctype.includes('octet-stream')) {
          /* miss */
        } else {
          const blob = await bakedRes.blob();
          if (blob.size > 500) {
            const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
            const isMp3 =
              (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) ||
              (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33); // ID3
            if (isMp3) {
              rememberTtsObjectUrl(key, URL.createObjectURL(blob));
              void putTtsBlobInIdb(key, blob);
              return blob;
            }
          }
        }
      }
    } catch {
      /* fall through */
    }
  }
  const cached = await getTtsBlobFromIdb(key);
  if (cached?.size) {
    const objectUrl = URL.createObjectURL(cached);
    rememberTtsObjectUrl(key, objectUrl);
    return cached;
  }
  // Offline: play from memory/IDB only — never turn voice off globally.
  if (navigator.onLine === false) {
    throw new Error('tts offline cache miss');
  }
  // Baked-only deploy: skip /api/tts after a static miss — POSTs only 404 and burn the rate limit.
  if (window.__alhudaBakedTtsOnly === true) {
    ttsKnownMissCache.add(key);
    throw new Error('tts baked miss');
  }
  if (ttsPrefetchInFlight.has(key)) return ttsPrefetchInFlight.get(key);

  const work = (async () => {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const ctrl = new AbortController();
        const onAbort = () => ctrl.abort();
        if (signal) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          signal.addEventListener('abort', onAbort, { once: true });
        }
        const timer = setTimeout(() => ctrl.abort(), 7000);
        let res;
        try {
          res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: lookupVoice }),
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', onAbort);
        }
        if (res.status === 429 || res.status === 503) {
          lastErr = new Error(`tts failed:${res.status}`);
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        if (res.status === 404) {
          ttsKnownMissCache.add(key);
          throw new Error('tts baked miss');
        }
        if (!res.ok) throw new Error(`tts failed:${res.status}`);
        const blob = await res.blob();
        if (!blob.size) throw new Error('empty audio');
        const provider = (res.headers.get('X-TTS-Provider') || '').toLowerCase();
        rememberTtsObjectUrl(key, URL.createObjectURL(blob));
        if (provider === 'baked' || provider === 'elevenlabs') {
          void putTtsBlobInIdb(key, blob);
        }
        recordAzureTtsUsage(text.length, res.headers.get('X-TTS-Provider'));
        return blob;
      } catch (e) {
        if (e?.name === 'AbortError') {
          // Prefer treating long hangs as miss so the next segment can play.
          lastErr = e;
          if (signal?.aborted) throw e;
          break;
        }
        lastErr = e;
        if (attempt < 1) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    throw lastErr || new Error('tts failed');
  })();

  ttsPrefetchInFlight.set(key, work);
  try {
    return await work;
  } catch (e) {
    if (e?.name !== 'AbortError') recordTtsError(e, 'fetchTtsBlob');
    throw e;
  } finally {
    ttsPrefetchInFlight.delete(key);
  }
}

/** Resolve a playable object URL for TTS text (memory → IDB → network). */
async function ensureTtsObjectUrl(text, voice = TTS_VOICE, signal) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const key = ttsCacheKey(clean, voice);
  if (ttsBlobMemoryCache.has(key)) return ttsBlobMemoryCache.get(key);
  const blob = await fetchTtsBlob(clean, voice, signal);
  if (ttsBlobMemoryCache.has(key)) return ttsBlobMemoryCache.get(key);
  if (!blob) throw new Error('empty audio');
  const url = URL.createObjectURL(blob);
  rememberTtsObjectUrl(key, url);
  return url;
}

/** Single TTS text pipeline — prefetch and playback MUST share this or cache misses.
 *  Policy: full harakat on normal lesson text; hadith kept as curated; ayahs never
 *  go through here (Hudhaify only via buildSpeechPlan). */
function prepareTtsPayload(text) {
  const cleaned = String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  // Hadith: speak the curated wording as-is — do not rewrite tokens via word map.
  if (isHadithPassage(cleaned)) {
    const hadith = prepareArabicForSpeech(cleaned);
    return sanitizeTtsText(
      typeof fixAllahIrabInText === 'function' ? fixAllahIrabInText(hadith) : hadith
    );
  }
  // Speech-map / already-tashkeeled text: keep mark order for baked TTS keys.
  // Only fill bare words when the chunk lacks well-formed harakat.
  let forTts = hasWellFormedTashkeel(cleaned)
    ? cleaned
    : applyPronunciationLexicon(applyWordDiacritics(applyManualSpeechDiacritics(cleaned)));
  forTts = typeof fixAllahIrabInText === 'function' ? fixAllahIrabInText(forTts) : forTts;
  return sanitizeTtsText(prepareArabicForSpeech(forTts));
}

function prefetchTtsText(text, voice = TTS_VOICE) {
  void ensureSpeechMapsLoaded().then(() => {
    const clean = prepareTtsPayload(text);
    if (!clean || clean.length < 2) return;
    const key = ttsCacheKey(clean, voice);
    if (ttsBlobMemoryCache.has(key) || ttsPrefetchInFlight.has(key)) return;
    void fetchTtsBlob(clean, voice).catch(() => {});
  });
}

const questionSpeechWarmPromises = new WeakMap();

/** Prefetch question audio first (resolves ASAP); options warm in parallel. */
function ttsPayloadReadyInMemory(preparedText, voice = TTS_VOICE) {
  const clean = String(preparedText || '').trim();
  if (!clean || clean.length < 2) return true;
  return ttsBlobMemoryCache.has(ttsCacheKey(clean, voice));
}

async function warmQuestionSpeech(q) {
  if (!q) return null;
  const existing = questionSpeechWarmPromises.get(q);
  if (existing) return existing;
  const work = (async () => {
    if (typeof window === 'undefined' || !window.SPEECH_BY_QUESTION_ID) {
      await Promise.race([
        ensureSpeechMapsLoaded(),
        new Promise((r) => setTimeout(r, 80)),
      ]);
    }
    const { questionText, optionList } = buildQuestionSpeechParts(q);
    const primaryVerse = getPrimaryVerseKeyForQuestion(q);
    if (primaryVerse) void fetchQuranAudioObjectUrl(primaryVerse).catch(() => null);
    const opts = optionList?.length ? optionList : [];
    // Options warm in background — never block "question ready" on them.
    if (voiceReadAnswers) {
      for (const opt of opts) prefetchTtsText(opt);
    }
    const qClean = prepareTtsPayload(questionText);
    try {
      if (qClean && qClean.length >= 2) {
        const key = ttsCacheKey(qClean);
        if (!ttsBlobMemoryCache.has(key)) {
          await fetchTtsBlob(qClean).catch(() => null);
        }
      }
      return null;
    } catch {
      return null;
    }
  })().finally(() => {
    questionSpeechWarmPromises.delete(q);
  });
  questionSpeechWarmPromises.set(q, work);
  return work;
}

async function prefetchHybridSpeechForQuestion(q) {
  if (!q) return;
  try {
    await Promise.race([
      ensureSpeechMapsLoaded(),
      new Promise((r) => setTimeout(r, 400)),
    ]);
    const primaryVerse = getPrimaryVerseKeyForQuestion(q);
    if (primaryVerse) void fetchQuranAudioObjectUrl(primaryVerse).catch(() => {});
    const { questionText, optionList } = buildQuestionSpeechParts(q);
    if (questionText?.trim()) prefetchTtsText(questionText);
    if (voiceReadAnswers) {
      for (const opt of (optionList || [])) prefetchTtsText(opt);
    }
  } catch (e) {
    console.warn('hybrid prefetch:', e);
    if (q.q) prefetchTtsText(q.q);
  }
}

function prefetchUpcomingTts(fromIdx = state.idx) {
  // Warm current + next two — enough for seamless continue without Azure 429 storms.
  const start = Math.max(0, fromIdx | 0);
  const qs = state.questions || [];
  for (let i = start; i < start + 3 && i < qs.length; i++) {
    const q = qs[i];
    if (!q) continue;
    void prefetchHybridSpeechForQuestion(q);
    // Fully resolve blobs for current + immediate next only.
    if (i <= start + 1) void warmQuestionSpeech(q);
  }
}

/** Warm edge-cached Quran audio for popular mapped verses (faster first recite). */
function warmPopularQuranAyahs() {
  if (navigator.onLine === false) return;
  if (sessionStorage.getItem('quranWarmDone') === '1') return;
  sessionStorage.setItem('quranWarmDone', '1');
  const map = (typeof window !== 'undefined' && window.QUESTION_VERSE_MAP) || {};
  const keys = [...new Set(Object.values(map))].slice(0, 12);
  for (const verseKey of keys) {
    void fetchQuranAudioObjectUrl(verseKey).catch(() => {});
  }
  void fetch('/api/quran-warm', { cache: 'no-store' }).catch(() => {});
}

/** Prefetch full round TTS + Quran into IDB/SW while online so replay works offline. */
async function warmRoundAudioForOffline(questions, { notify = true } = {}) {
  if (!questions?.length || navigator.onLine === false) return;
  const list = questions.slice(0, 40);
  await ensureSpeechMapsLoaded();
  let cursor = 0;
  const workers = Math.min(3, list.length);
  const run = async () => {
    while (cursor < list.length) {
      const q = list[cursor++];
      if (!q) continue;
      try {
        await warmQuestionSpeech(q);
      } catch { /* ignore */ }
      try {
        await prefetchHybridSpeechForQuestion(q);
      } catch { /* ignore */ }
      const verseKey = getPrimaryVerseKeyForQuestion(q);
      if (verseKey) {
        try { await fetchQuranAudioObjectUrl(verseKey); } catch { /* ignore */ }
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, () => run()));
  if (notify && list.length >= 5 && typeof showToast === 'function' && document.getElementById('game')?.classList.contains('active')) {
    showToast('الصوت جاهز لهذه الجولة (يعمل أوفلاين) ✓', 'ok');
  }
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

function getTtsErrorStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(TTS_ERROR_STATS_KEY) || '{}');
    const day = new Date().toISOString().slice(0, 10);
    if (raw && raw.day === day) return { day, fails: Number(raw.fails) || 0, last: raw.last || '' };
  } catch (e) {}
  return { day: new Date().toISOString().slice(0, 10), fails: 0, last: '' };
}

function recordTtsError(err, context = 'tts') {
  if (err?.name === 'AbortError') return;
  ttsSessionFailCount += 1;
  ttsLastErrorMsg = String(err?.message || err || context).slice(0, 120);
  const stats = getTtsErrorStats();
  stats.fails += 1;
  stats.last = ttsLastErrorMsg;
  try { localStorage.setItem(TTS_ERROR_STATS_KEY, JSON.stringify(stats)); } catch (e) {}
  console.warn('[tts-monitor]', context, ttsLastErrorMsg, { session: ttsSessionFailCount, today: stats.fails });
}

function maybeRemindAzureKeyRotation(hint) {
  if (!hint) return;
  const day = new Date().toISOString().slice(0, 10);
  const flagKey = `azureKeyRotateRemind:${day}`;
  if (localStorage.getItem(flagKey) === '1') return;
  try { localStorage.setItem(flagKey, '1'); } catch (e) {}
  console.warn('[azure-key]', hint);
  const showDiag = localStorage.getItem('showTtsDiag') === '1'
    || /[?&]diag=1(?:&|$)/.test(location.search);
  if (showDiag && typeof showToast === 'function') {
    showToast('تنبيه أمان: دوّر مفتاح Azure Speech إن ظهر في شات سابقاً', 'err');
  }
}

async function refreshTtsProviderBadge() {
  const badge = document.getElementById('tts-provider-badge');
  try {
    const res = await fetch('/api/tts-status', { cache: 'no-store' });
    const data = await res.json();
    if (typeof data?.bakedTtsOnly === 'boolean') {
      window.__alhudaBakedTtsOnly = data.bakedTtsOnly;
    }
  } catch { /* ignore */ }
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
    if (typeof data?.bakedTtsOnly === 'boolean') {
      window.__alhudaBakedTtsOnly = data.bakedTtsOnly;
    }
    const usage = getAzureTtsUsage();
    const pct = Math.min(100, Math.round((usage.chars / 500000) * 100));
    const errStats = getTtsErrorStats();
    const serverFails = data.errors?.tts ? Object.values(data.errors.tts).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
    badge.hidden = false;
    badge.textContent = (data.azureConfigured ? 'TTS: Azure' : 'TTS: Edge') +
      ` · ${usage.chars}/${500000} (~${pct}%)` +
      (data.isolateAzureChars != null ? ` · isolate ${data.isolateAzureChars}` : '') +
      ` · fails ${ttsSessionFailCount}/${errStats.fails}` +
      (serverFails ? ` · srv ${serverFails}` : '');
    badge.classList.toggle('is-azure', !!data.azureConfigured);
    badge.classList.toggle('is-warn', usage.chars >= AZURE_F0_SOFT_LIMIT || ttsSessionFailCount > 0 || errStats.fails >= 3);
    badge.setAttribute('aria-hidden', 'false');
    if (data.keyRotationHint) {
      badge.title = data.keyRotationHint;
      maybeRemindAzureKeyRotation(data.keyRotationHint);
    }
  } catch {
    badge.hidden = false;
    badge.textContent = 'TTS: ?';
  }
}

/** Strip punctuation/symbols the neural voice vocalizes (e.g. ":" → "نقطتان"). Keeps Arabic harakat.
 *  Keep case-aware اللَّهُ/ِ/َ — collapsing to bare الله broke baked Yousef keys and fell
 *  through to browser SpeechSynthesis (wrong voice, «اللاه»). */
function sanitizeTtsText(text) {
  return scrubFakeAllahSpellings(
    (text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, ' ')
      // Keep ﷺ/ﷻ as-is — bake keys use the symbol, not expanded phrases.
      .replace(/رضي الله عنهما/g, ' رضي الله عنهما ')
      .replace(/رضي الله عنها/g, ' رضي الله عنها ')
      .replace(/رضي الله عنه/g, ' رضي الله عنه ')
      // Drop ALL quote / bracket / punctuation marks so TTS never says «نقطتان» or reads « ».
      .replace(/[\u00AB\u00BB\u2018-\u201F\u2039\u203A\u300C-\u300F\u301D\u301E\uFF02\uFF07«»"'“”‘’‹›「」『』„‚]/g, ' ')
      .replace(/[﴿﴾]/g, ' ')
      .replace(/[.؟!…,:：;؛،()\[\]{}*_#<>=+~^`\/\\|–—•·\-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Remove only fake «اللاه» spellings. Do NOT strip harakat from اللَّهُ/اللَّهِ/اللَّهَ —
 * Yousef baked MP3s are keyed on the iʿrāb forms.
 */
function scrubFakeAllahSpellings(text) {
  let s = String(text || '');
  s = s.replace(/\uFDF2/g, 'الله');
  const scrubHack = (hack, repl) => {
    s = s.replace(
      new RegExp(`(^|[^\\u0621-\\u064A\\u0671])${hack}(?=[^\\u0621-\\u064A\\u0671]|$)`, 'g'),
      (_, p) => `${p}${repl}`
    );
  };
  scrubHack('اللاه', 'الله');
  scrubHack('للاه', 'لله');
  scrubHack('باللاه', 'بالله');
  scrubHack('واللاه', 'والله');
  scrubHack('فاللاه', 'فالله');
  scrubHack('تاللاه', 'تالله');
  scrubHack('كاللاه', 'كالله');
  return s;
}

/**
 * Legacy bare-orthography normalize for Azure/Hamed only (not used for Yousef/baked).
 * Kept for reference / emergency Hamed path.
 */
function normalizeAllahForTts(text) {
  const H = '[\u064B-\u065F\u0670]*';
  const ALLAH = 'الله';
  const ALLAHUMMA = 'اللهم';
  const LILLAH = 'لله';
  const BILLAH = 'بالله';
  const WALLAH = 'والله';
  const FALLAH = 'فالله';
  const TALLAH = 'تالله';
  const KALLAH = 'كالله';
  const WALILLAH = 'ولله';
  const FALILLAH = 'فلله';
  let s = String(text || '');
  s = s.replace(/\uFDF2/g, ALLAH);
  s = s.replace(new RegExp(`[اأإآٱ]${H}ل${H}ل${H}ه${H}م${H}`, 'g'), ALLAHUMMA);
  // ب|و|ف|ك|ت + الله — alef REQUIRED (otherwise ولله becomes والله).
  s = s.replace(new RegExp(`([بوفكت])${H}[اأإآٱ]${H}ل${H}ل${H}ه(${H})`, 'g'), (_, p) => {
    if (p === 'ب') return BILLAH;
    if (p === 'و') return WALLAH;
    if (p === 'ف') return FALLAH;
    if (p === 'ت') return TALLAH;
    return KALLAH;
  });
  s = s.replace(
    new RegExp(`(^|[^\\u0621-\\u064A\\u0671])([وف])${H}ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'),
    (_, pre, p) => `${pre}${p === 'و' ? WALILLAH : FALILLAH}`
  );
  s = s.replace(
    new RegExp(`(^|[^\\u0621-\\u064A\\u0671])ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'),
    (_, pre) => `${pre}${LILLAH}`
  );
  s = s.replace(
    new RegExp(
      `(^|[^\\u0621-\\u064A\\u0671\\u064B-\\u065F\\u0670])[اأإآٱ]${H}ل${H}ل${H}ه(${H})(?!(?:[\\u064B-\\u065F\\u0670]*[\\u0621-\\u064A]))`,
      'g'
    ),
    (_, pre) => `${pre}${ALLAH}`
  );
  return scrubFakeAllahSpellings(s);
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
  if (typeof window !== 'undefined' && window.SPEECH_MAPS_FULL) return Promise.resolve();
  if (typeof window !== 'undefined' && window.SPEECH_BY_QUESTION_ID && !_speechMapsPromise) {
    // Core map already in index.html — resolve instantly; full map loads idle.
    const ver = window.ALHUDA_ASSETS?.sw || 172;
    const idle = typeof requestIdleCallback === 'function'
      ? (fn) => requestIdleCallback(fn, { timeout: 4000 })
      : (fn) => setTimeout(fn, 1800);
    idle(() => {
      if (window.SPEECH_MAPS_FULL) return;
      void loadSpeechScript(`speech-diacritics-map.js?v=${ver}`, 'speech-maps-full').then(() => {
        window.SPEECH_MAPS_FULL = true;
      });
    });
    return Promise.resolve();
  }
  if (_speechMapsPromise) return _speechMapsPromise;
  _speechMapsPromise = (async () => {
    const ver = (typeof window !== 'undefined' && window.ALHUDA_ASSETS?.sw) || 87;
    // 1) Tiny core (~45KB) — enough for demo + curated lexicon quality.
    if (!window.SPEECH_BY_QUESTION_ID) {
      await loadSpeechScript(`speech-diacritics-core.js?v=${ver}`, 'speech-maps-core');
    }
    // 2) Full map idle — upgrades word/phrase coverage without blocking first 🔊.
    const idle = typeof requestIdleCallback === 'function'
      ? (fn) => requestIdleCallback(fn, { timeout: 4000 })
      : (fn) => setTimeout(fn, 1800);
    idle(() => {
      if (window.SPEECH_MAPS_FULL) return;
      void loadSpeechScript(`speech-diacritics-map.js?v=${ver}`, 'speech-maps-full').then(() => {
        window.SPEECH_MAPS_FULL = true;
      });
    });
  })();
  return _speechMapsPromise;
}

function loadSpeechScript(src, marker) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[data-${marker}]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset[marker.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = '1';
    // data-speech-maps-core style
    s.setAttribute(`data-${marker}`, '1');
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

/** Lexicon fills bare words only — never rewrite curated/speech-map harakat
 *  (wrong shadda/kasra order breaks baked Yousef MP3 keys). */
function applyPronunciationLexicon(text) {
  const lex = (typeof window !== 'undefined' && window.SPEECH_PRON_LEXICON) || null;
  if (!lex) return text;
  return String(text).replace(SPEECH_WORD_RE, (tok) => {
    if (ARABIC_HARAKAT_RE.test(tok)) return tok;
    const bare = stripHarakat(tok);
    return lex[bare] || tok;
  });
}

function stripHarakat(s) {
  return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
}

/** Word-level diacritization fallback — covers every word using the generated map.
 *  Never overwrite a token that already has harakat: Gemini / per-question fields
 *  are authoritative (e.g. عُبِدَ must not become عَبْد from the bare-word map). */
function applyWordDiacritics(text) {
  const wordMap = (typeof window !== 'undefined' && window.SPEECH_WORD_MAP) || null;
  const lex = (typeof window !== 'undefined' && window.SPEECH_PRON_LEXICON) || null;
  if (!wordMap && !lex) return text;
  return String(text).replace(SPEECH_WORD_RE, (tok) => {
    // Curated tashkeel wins — lexicon/word-map must not reorder marks.
    if (ARABIC_HARAKAT_RE.test(tok)) return tok;
    const bare = stripHarakat(tok);
    if (lex?.[bare]) return lex[bare];
    return (wordMap && wordMap[bare]) || tok;
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
  const base = String(hit || raw || '').trim();
  if (!base) return '';
  // Hadith / quote-hadith: keep curated form (Gemini or source) — no word-map rewrite.
  if (isHadithPassage(base) || (field === 'quote' && isHadithPassage(base))) {
    return prepareArabicForSpeech(base);
  }
  return prepareArabicForSpeech(applyManualSpeechDiacritics(base));
}
let ttsAudio = null;
let ttsAbort = null;
let ttsObjectUrl = null;
let hybridSpeechToken = 0;

function stripForSpeech(text) {
  const cleaned = (text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  // Hadith stays as-is (after dropping any embedded Quran markers).
  if (isHadithPassage(cleaned)) {
    const hadith = prepareArabicForSpeech(removeQuranicVersesForSpeech(cleaned));
    return sanitizeTtsText(
      typeof fixAllahIrabInText === 'function' ? fixAllahIrabInText(hadith) : hadith
    );
  }
  let forTts = hasWellFormedTashkeel(cleaned)
    ? cleaned
    : applyWordDiacritics(applyManualSpeechDiacritics(cleaned));
  forTts = removeQuranicVersesForSpeech(forTts);
  forTts = prepareArabicForSpeech(forTts);
  forTts = typeof fixAllahIrabInText === 'function' ? fixAllahIrabInText(forTts) : forTts;
  return sanitizeTtsText(forTts);
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

/** Broader hadith detection — these stay as curated text (no word-map rewrite, never Hudhaify). */
function isHadithPassage(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (isHadithQudsiText(t)) return true;
  if (/ﷺ/.test(t)) return true;
  if (/قال\s*(رسول|النبي)\s*الله|عن\s+النبي|حديث\s+(قدسي|صحيح|حسن)|رواه\s+\S+|أخرجه\s+\S+/i.test(t)) return true;
  if (/قال\s*صلى\s*الله|فيما\s+يرويه\s+عن\s*(ربه|الله)/i.test(t)) return true;
  return false;
}

function isQuranicAyahText(s) {
  const t = (s || '').replace(/[،.؛:!؟«»"[\]]/g, '').trim();
  if (!t || t.length < 10) return false;
  if (isHadithPassage(t)) return false;
  if (/^الإجابة\s*الصحيحة/i.test(t)) return false;
  if (/^(إنما\s+الأعمال|إن\s+الله\s+تجاوز|لا\s+يؤمن|من\s+حلف|إن\s+الحلال|البر\s+حسن)/i.test(t)) return false;
  if (/^(إن|إني|إنا|الذين|فمن|ومن|يا\s+أيها|تبارك|سبحان|قل|لقد|وما\s+خلقت|فلا\s+تخاف|فلا\s+تجعل)/i.test(t)) return true;
  if (t.length >= 28 && /الله|إيمان|كفر|شرك|جنة|نار|عباد|ربك/i.test(t)) return true;
  return false;
}

function getQuestionContentBlob(q, extra = '') {
  const parts = [q?.q, q?.exp, extra, q?.quote];
  if (typeof getCitationBodyText === 'function') parts.push(getCitationBodyText(q));
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
 * True only when the text LITERALLY contains a Quran verse we can split out for
 * Hudhaify — a resolvable verse key inside quotes/brackets, or an explicit
 * «قال تعالى / ﴿…﴾» marker. Deliberately does NOT use the loose isQuranicAyahText
 * heuristic, which wrongly flagged normal questions/answers (e.g. any text ≥28
 * chars containing "الله/كفر/إيمان") and stripped their diacritics.
 */
function fieldHasEmbeddedAyah(text) {
  const src = String(text || '');
  if (!src.trim()) return false;
  if (/﴿|قال\s+(الله\s+)?تعالى|قوله\s+تعالى/.test(src)) return true;
  return findVerseKeysSync(src).length > 0;
}

/**
 * Choose speech text for one part. Always prefer the diacritized per-field form.
 * buildSpeechPlan can still split ﴿…﴾ / قال تعالى from diacritized text — returning
 * the bare original here used to strip tashkeel whenever a parenthetical phrase
 * (e.g. لا إله إلا الله) matched a known verse key.
 */
function speechPart(q, field, raw) {
  const original = String(raw || '').trim();
  if (!original) return '';
  return speechTextFor(q, field, original);
}

/** Question text and options as SEPARATE strings so speakQuestion can play:
 *  سؤال → آية (Hudhaify إن وُجدت) → إجابات. */
function buildQuestionSpeechParts(q) {
  const questionText = speechPart(q, 'q', q?.q) || '';
  const optionList = buildQuestionOptionSpeechList(q);
  return { questionText, optionsText: optionList.join('، '), optionList };
}

/** One speech string per answer — baked TTS keys match single fields, not joined blobs. */
function buildQuestionOptionSpeechList(q) {
  const items = [];
  if (q?.type === 'mc' && Array.isArray(q.a) && q.a.length) {
    const order = Array.isArray(state.displayAnswerOrder) && state.displayAnswerOrder.length
      ? state.displayAnswerOrder
      : q.a.map((_, i) => i);
    order.forEach((origIdx) => {
      const opt = q.a[origIdx];
      if (opt == null || opt === '') return;
      const t = speechPart(q, `a${origIdx}`, opt);
      if (t) items.push(t);
    });
  } else if (q?.type === 'tf') {
    // Must match baked clips (not "أولاً، صح" composites).
    items.push('صَحّ');
    items.push('خَطَأٌ');
  }
  return items;
}

function buildQuestionSpeechText(q) {
  // Speak only what the player sees: question + options in DISPLAY order.
  // Do NOT append book citations — that sounded like "extra weird words".
  const { questionText, optionsText } = buildQuestionSpeechParts(q);
  return [questionText, optionsText].filter(Boolean).join('، ');
}


/** Speak ONLY what is on screen in the feedback panel — never invent extra شرح/آية. */

/**
 * Return the verified fully-diacritized form of a raw field value by matching it
 * against this question's diacritized fields (by id), regardless of which field
 * it came from. Falls back to the manual/word diacritizer. This is what lets the
 * feedback panel pronounce answers and explanations with correct harakat.
 */
function diacritizeFieldText(q, rawText) {
  const raw = String(rawText || '').replace(/^«|»$/g, '').trim();
  if (!raw) return '';
  const fields = (typeof window !== 'undefined' && window.SPEECH_BY_QUESTION_ID?.[q?.id]) || {};
  const target = normalizeArabicForMatch(raw);
  for (const v of Object.values(fields)) {
    if (v && normalizeArabicForMatch(v) === target) {
      // Hadith: return curated value unchanged (no further word-map pass).
      if (isHadithPassage(v)) return prepareArabicForSpeech(v);
      return prepareArabicForSpeech(applyWordDiacritics(v));
    }
  }
  if (isHadithPassage(raw)) return prepareArabicForSpeech(raw);
  return prepareArabicForSpeech(applyManualSpeechDiacritics(raw));
}

/**
 * Ordered speech plan for the feedback panel that mirrors exactly what is shown:
 * (wrong answer →) correct answer → citation.
 * Ayah citations → Hudhaify only; hadith citations → TTS as curated; else full harakat.
 */
function buildFeedbackSpeechPlan(q, wrongText) {
  const plan = [];
  const wrong = String(wrongText || '').trim();
  if (wrong) plan.push({ type: 'tts', text: `إِجَابَتُكَ خَاطِئَةٌ، ${diacritizeFieldText(q, wrong)}` });
  const correct = getCorrectAnswerText(q);
  if (correct) plan.push({ type: 'tts', text: `الْإِجَابَةُ الصَّحِيحَةُ، ${diacritizeFieldText(q, correct)}` });
  const verseKey = getPrimaryVerseKeyForQuestion(q);
  const citeBody = (typeof getCitationBodyText === 'function' ? getCitationBodyText(q) : '') || '';
  const quoteIsAyah = typeof citationLooksLikeAyah === 'function'
    ? citationLooksLikeAyah(citeBody, verseKey)
    : false;
  // Hadith / book prose → TTS. Quran ayah only → Hudhaify (never TTS the ayah wording).
  if (isHadithPassage(citeBody) || (citeBody && !quoteIsAyah && !fieldHasEmbeddedAyah(citeBody))) {
    plan.push({ type: 'tts', text: diacritizeFieldText(q, citeBody) });
  } else if (verseKey && quoteIsAyah) {
    plan.push({ type: 'quran', verseKey });
  } else if (citeBody) {
    // Mixed or unresolved — TTS the prose (ayah markers stripped in prepareTtsPayload path).
    plan.push({ type: 'tts', text: diacritizeFieldText(q, citeBody) });
  } else if (verseKey) {
    plan.push({ type: 'quran', verseKey });
  }
  return plan;
}

/** After answering: read correct answer + hadith (TTS) or ayah (Hudhaify only). */
function maybeSpeakFeedbackAfterAnswer(q, wrongText) {
  if (!voiceOn || !q || state.gameEnding || state.gameEnded) return;
  const btn = document.getElementById('btn-speak-question');
  void speakFeedbackOnce(q, wrongText || '', btn);
}

/** True when this question should play Hudhaify (ayah), not when the citation is a hadith. */
function shouldReciteHudhaifyForQuestion(q, questionText = '') {
  if (!q) return false;
  const verseKey = getPrimaryVerseKeyForQuestion(q);
  if (!verseKey) return false;
  const cite = (typeof getCitationBodyText === 'function' ? getCitationBodyText(q) : '') || String(q?.quote || '');
  const map = (typeof window !== 'undefined' && window.QUESTION_VERSE_MAP) || {};
  // Explicit map entry = intentional ayah link → always recite Hudhaify.
  if (map[q.id]) return true;
  // Citation is clearly a hadith (not Quran) → don't Hudhaify.
  if (
    cite
    && isHadithPassage(cite)
    && !(typeof citationLooksLikeAyah === 'function' && citationLooksLikeAyah(cite, verseKey))
    && !fieldHasEmbeddedAyah(cite)
  ) {
    return false;
  }
  // Don't block just because the question text mentions النبي ﷺ — many ayah Qs do.
  if (typeof citationLooksLikeAyah === 'function' && citationLooksLikeAyah(cite, verseKey)) return true;
  const blob = `${questionText || q.q || ''} ${cite}`;
  return /قال\s+(الله\s+)?تعالى|قوله\s+تعالى|﴿/.test(blob) || fieldHasEmbeddedAyah(blob);
}

async function speakFeedbackOnce(q, wrongText, btn) {
  if (!q) return;
  // Don't block feedback audio on full map load — core map is enough.
  if (typeof window === 'undefined' || !window.SPEECH_BY_QUESTION_ID) {
    await Promise.race([
      ensureSpeechMapsLoaded(),
      new Promise((r) => setTimeout(r, 80)),
    ]);
  }
  stopSpeaking();
  const token = hybridSpeechToken;
  if (btn) btn.classList.add('speaking');
  try {
    const plan = buildFeedbackSpeechPlan(q, wrongText);
    for (const seg of plan) {
      if (token !== hybridSpeechToken) break;
      if (seg.type === 'quran' && seg.verseKey) {
        await playQuranRecitation(seg.verseKey, btn, { interruptAll: false });
      } else if (seg.type === 'tts' && seg.text?.trim()) {
        const clean = prepareTtsPayload(seg.text) || stripForSpeech(seg.text);
        if (clean) await speakTtsSegment(clean, btn, { alreadyPrepared: true });
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.warn('feedback tts:', e);
      toastTtsFail();
    }
  } finally {
    if (token === hybridSpeechToken && btn) btn.classList.remove('speaking');
    clearTtsAudio();
  }
}

function onFeedbackSpeakerClick() {
  replayFeedbackSpeech();
}

function replayFeedbackSpeech() {
  const q = state.questions?.[state.idx];
  if (!q) return;
  const btn = document.getElementById('btn-fb-speak') || document.getElementById('btn-speak-question');
  void speakFeedbackOnce(q, state.lastFeedbackWrong || '', btn);
}

function updateFeedbackSpeakBtn(show) {
  const btn = document.getElementById('btn-fb-speak');
  if (!btn) return;
  btn.style.display = show === false ? 'none' : '';
}

/* ── Quran recitation (الحذيفي فقط — عبر بروكسي Cloudflare + prefetch) ── */
const QURAN_RECITERS = {
  hudhaify: {
    key: 'hudhaify',
    label: 'الحذيفي',
    edition: 'ar.hudhaify',
    everyayah: 'Hudhaify_64kbps',
  },
};
let quranReciterKey = 'hudhaify';
try {
  // Force Hudhaify only — migrate away from any previous Afasy preference.
  if (localStorage.getItem('quranReciter') !== 'hudhaify') {
    localStorage.setItem('quranReciter', 'hudhaify');
  }
} catch (e) {}

function getActiveQuranReciter() {
  return QURAN_RECITERS.hudhaify;
}

function setQuranReciter(_key) {
  // Kept for backwards compatibility; Afasy and others are ignored.
  quranReciterKey = 'hudhaify';
  try { localStorage.setItem('quranReciter', 'hudhaify'); } catch (e) {}
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
  const el = document.getElementById('reciter-label');
  if (el) el.textContent = 'الحذيفي';
}

const QURAN_RECITE_BTN_LABEL = `🎧 تلاوة`;
function getQuranReciteAria() {
  return `استمع لتلاوة الآية — ${getActiveQuranReciter().label}`;
}
const QURAN_RECITER_BITRATE = 64;
/** Faster than natural pace so تلاوة finishes sooner without sounding rushed. */
const QURAN_PLAYBACK_RATE = 1.28;
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

/** Prefer mapped verse, else first sync key found in question content. */
function getPrimaryVerseKeyForQuestion(q) {
  if (!q) return null;
  return getQuestionVerseKey(q.id) || findVerseKeysSync(getQuestionContentBlob(q))[0] || null;
}

const ayahTextCache = new Map();

/** Longest local snippet known for a verse key (offline fallback). */
function getLocalAyahSnippet(verseKey) {
  if (!verseKey) return '';
  const map = (typeof window !== 'undefined' && window.AYAH_SNIPPET_MAP) || {};
  let best = '';
  for (const [snippet, key] of Object.entries(map)) {
    if (key === verseKey && String(snippet).length > best.length) best = String(snippet);
  }
  return best;
}

function formatAyahDisplay(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (/^[﴿]/.test(t)) return t;
  return `﴿ ${t} ﴾`;
}

/** Compact ayah for the question card — snippet first, never dump a full long verse. */
function compactAyahForQuestion(text, maxLen = 110) {
  let t = String(text || '').trim().replace(/^﴿\s*|\s*﴾$/g, '').trim();
  if (!t) return '';
  if (t.length <= maxLen) return formatAyahDisplay(t);
  const cut = t.slice(0, maxLen).replace(/\s+\S*$/, '').trim();
  return formatAyahDisplay(`${cut || t.slice(0, maxLen)}…`);
}

/** Uthmani ayah text for a verse key (cached; local snippet fallback). */
async function fetchAyahUthmani(verseKey) {
  if (!verseKey) return '';
  if (ayahTextCache.has(verseKey)) return ayahTextCache.get(verseKey);
  const local = getLocalAyahSnippet(verseKey);
  try {
    const res = await fetch(
      `https://api.quran.com/api/v4/quran/verses/uthmani?verse_key=${encodeURIComponent(verseKey)}`,
      { cache: 'force-cache' }
    );
    if (res.ok) {
      const data = await res.json();
      const text = data?.verses?.[0]?.text_uthmani || '';
      if (text) {
        ayahTextCache.set(verseKey, text);
        return text;
      }
    }
  } catch (e) {
    console.warn('ayah text fetch:', e);
  }
  if (local) ayahTextCache.set(verseKey, local);
  return local || '';
}

function buildQuranAyahBlockHtml(verseKey, { withButton = true, id = '', compact = false } = {}) {
  const local = getLocalAyahSnippet(verseKey);
  const idAttr = id ? ` id="${id}"` : '';
  const text = compact
    ? (compactAyahForQuestion(local) || '…')
    : (formatAyahDisplay(local) || '…');
  return (
    `<div class="q-ayah-block${compact ? ' q-ayah-block--compact' : ''}" data-verse-key="${escapeHtml(verseKey || '')}">` +
    `<p class="q-ayah-text"${idAttr} data-ayah-text>${escapeHtml(text)}</p>` +
    (withButton ? buildQuranReciteButtonHtml() : '') +
    `</div>`
  );
}

async function fillAyahTextElements(root, verseKey, { preferSnippet = false, compact = false } = {}) {
  if (!root || !verseKey) return;
  const local = getLocalAyahSnippet(verseKey);
  let text = '';
  if (preferSnippet && local) {
    text = local;
  } else {
    text = await fetchAyahUthmani(verseKey);
    if (!text && local) text = local;
  }
  if (!text) return;
  const display = compact ? compactAyahForQuestion(text) : formatAyahDisplay(text);
  const targets = [];
  if (root.matches?.('[data-ayah-text]')) targets.push(root);
  root.querySelectorAll?.('[data-ayah-text]')?.forEach((el) => targets.push(el));
  targets.forEach((el) => {
    el.textContent = display;
  });
}

function normalizeArabicForMatch(s) {
  return stripArabicDiacritics(s)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[«»()"[\]،.؛:!؟\-✓✗✅❌]/g, ' ')
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
  // Only when we can resolve a concrete verse — avoids empty تلاوة buttons.
  return !!getPrimaryVerseKeyForQuestion(q);
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
    // Hadith in quotes/parens → Azure TTS as curated, never Hudhaify.
    if (isHadithPassage(inner)) {
      const before = text.slice(lastIndex, m.index);
      const ttsBefore = stripForSpeech(before);
      if (ttsBefore) plan.push({ type: 'tts', text: ttsBefore });
      const ttsHadith = prepareTtsPayload(inner);
      if (ttsHadith) plan.push({ type: 'tts', text: ttsHadith });
      lastIndex = m.index + m[0].length;
      continue;
    }
    if (!isQuranicAyahText(inner)) continue;
    const before = text.slice(lastIndex, m.index);
    const ttsBefore = stripForSpeech(before);
    if (ttsBefore) plan.push({ type: 'tts', text: ttsBefore });
    const verseKey = lookupKnownVerseKey(inner) || await searchVerseKey(inner);
    if (verseKey) {
      plan.push({ type: 'quran', verseKey });
    } else {
      // Not a resolvable Quran verse — speak with full harakat TTS.
      const ttsInner = stripForSpeech(inner);
      if (ttsInner) plan.push({ type: 'tts', text: ttsInner });
    }
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
  // Only resolve mapped verse keys when the spoken text actually looks like it
  // embeds an ayah — otherwise this was a multi-second network stall on every Q.
  const needsVersePool = /قال\s+(الله\s+)?تعالى|قوله\s+تعالى|﴿/.test(raw)
    || (typeof parseSurahAyahReferences === 'function' && parseSurahAyahReferences(raw).length > 0);
  const fallbackKeys = (needsVersePool && q) ? await resolveAllVerseKeysForQuestion(q) : [];
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
      // Local map / pool first — never stall question start on Quran.com search.
      verseKey = lookupKnownVerseKey(ayahText);
      if (!verseKey && pool.length) verseKey = pool.shift();
      if (!verseKey) {
        verseKey = await Promise.race([
          searchVerseKey(ayahText),
          new Promise((r) => setTimeout(() => r(null), 200)),
        ]);
      }
    }
    if (!verseKey && pool.length) verseKey = pool.shift();
    if (verseKey) {
      plan.push({ type: 'quran', verseKey });
    } else if (ayahText) {
      // No verse resolved — speak the quoted text (e.g. a hadith) instead of dropping it.
      const ttsAyah = stripForSpeech(ayahText);
      if (ttsAyah) plan.push({ type: 'tts', text: ttsAyah });
    }
    lastIndex = match.index + match[0].length;
  }
  const tail = raw.slice(lastIndex);
  if (matchedTaala) {
    if (tail.trim()) await appendStandaloneAyahSegments(tail, plan, pool);
  } else if (needsVersePool) {
    await appendStandaloneAyahSegments(raw, plan, pool);
  }
  const hasQuran = plan.some((s) => s.type === 'quran');
  if (!plan.length) {
    const ttsOnly = stripForSpeech(raw);
    if (ttsOnly) plan.push({ type: 'tts', text: ttsOnly });
  } else if (!hasQuran && !plan.some((s) => s.type === 'tts')) {
    const ttsOnly = stripForSpeech(raw);
    if (ttsOnly) plan.push({ type: 'tts', text: ttsOnly });
  }
  // Never auto-inject mapped verses that were not matched in the spoken text.
  return dedupeTtsPlan(plan.filter((s) => (s.type === 'tts' && s.text?.trim()) || (s.type === 'quran' && s.verseKey)));
}

function textMayHaveQuranAyah(text, q) {
  const src = text || '';
  if (!src.trim()) return false;
  // Explicit Quran citation markers only. Matching known short phrases inside
  // parentheses (e.g. لا إله إلا الله → 47:19) forced a slow hybrid/API path
  // and stripped diacritics on ordinary questions.
  if (/قال\s+(الله\s+)?تعالى|قوله\s+تعالى|﴿/.test(src)) {
    if (!isHadithQudsiText(src)) return true;
  }
  if (typeof parseSurahAyahReferences === 'function' && parseSurahAyahReferences(src).length) {
    return true;
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
    quranAudio.playbackRate = QURAN_PLAYBACK_RATE;
    quranAudio.preservesPitch = true;
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
    const cluster = document.getElementById('q-controls-cluster')
      || document.querySelector('#game .q-box-row');
    if (cluster) cluster.insertBefore(slot, cluster.firstChild);
    else document.querySelector('.q-box-row')?.appendChild(slot);
  }

  let inline = document.getElementById('q-ayah-inline');
  const qText = document.getElementById('q-text');
  if (!inline && qText) {
    inline = document.createElement('span');
    inline.id = 'q-ayah-inline';
    inline.className = 'q-ayah-inline q-ayah-text';
    inline.setAttribute('data-ayah-text', '');
    inline.hidden = true;
    qText.insertAdjacentElement('afterend', inline);
  }

  const verseKey = getPrimaryVerseKeyForQuestion(q);
  const main = document.querySelector('#game .q-main');
  if (!verseKey || !shouldReciteHudhaifyForQuestion(q)) {
    slot.style.display = 'none';
    slot.innerHTML = '';
    if (inline) {
      inline.hidden = true;
      inline.textContent = '';
    }
    main?.classList.remove('has-ayah');
    return;
  }

  main?.classList.add('has-ayah');
  // Full ayah Hudhaify will recite — inline after the question mark (not a separate box).
  if (inline) {
    inline.hidden = false;
    const local = getLocalAyahSnippet(verseKey);
    inline.textContent = formatAyahDisplay(local) || '…';
  }
  slot.style.display = '';
  slot.innerHTML = buildQuranReciteButtonHtml();
  bindQuranReciteButton(slot, q);
  prefetchQuranForQuestion(q);
  void fillAyahTextElements(inline || slot, verseKey, { preferSnippet: false, compact: false });
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


async function speakTextCloud(text, btn, voice = TTS_VOICE) {
  const key = ttsCacheKey(text, voice);
  // Hot path: play from memory URL immediately — no IDB / network / blob re-fetch.
  let url = ttsBlobMemoryCache.get(key) || null;
  if (!url) {
    ttsAbort = new AbortController();
    url = await ensureTtsObjectUrl(text, voice, ttsAbort.signal);
  }
  if (!url) throw new Error('empty audio');
  ttsObjectUrl = url;
  const preloaded = ttsPreloadedAudio.get(key);
  if (preloaded) {
    ttsAudio = preloaded;
    try { ttsAudio.currentTime = 0; } catch { /* ignore */ }
  } else {
    ttsAudio = new Audio(url);
  }
  if (btn) btn.classList.add('speaking');
  await ttsAudio.play();
  await new Promise((resolve, reject) => {
    ttsAudio.onended = resolve;
    ttsAudio.onerror = () => reject(new Error('audio error'));
  });
}

/** Play a preloaded Audio element with no fetch gap (used to chain Q → answers). */
async function playPreloadedAudio(audio, btn) {
  if (!audio) return;
  // Swap in without aborting in-flight prefetches (clearTtsAudio aborts ttsAbort).
  if (ttsAudio) {
    ttsAudio.onended = null;
    ttsAudio.onerror = null;
    ttsAudio.pause();
  }
  ttsAudio = audio;
  ttsObjectUrl = audio.src || ttsObjectUrl;
  if (btn) btn.classList.add('speaking');
  await ttsAudio.play();
  await new Promise((resolve, reject) => {
    ttsAudio.onended = resolve;
    ttsAudio.onerror = () => reject(new Error('audio error'));
  });
}

async function speakTtsSegment(text, btn, { keepBtnState = true, clearAfter = true, alreadyPrepared = false } = {}) {
  // Same pipeline as prefetchTtsText — shared cache key = instant when warmed.
  // alreadyPrepared: caller already ran prepareTtsPayload (avoid double-normalize cache miss).
  const clean = alreadyPrepared ? String(text || '').trim() : prepareTtsPayload(text);
  if (!clean) return;
  try {
    try {
      await speakTextCloud(clean, btn, TTS_VOICE);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      // Do NOT fall back to browser SpeechSynthesis — it is a different voice
      // and commonly mispronounces الله. Soft-fail instead of wrong audio.
      clearTtsAudio(keepBtnState ? null : btn);
      throw e;
    }
  } finally {
    if (clearAfter) clearTtsAudio(keepBtnState ? null : btn);
  }
}

/**
 * Play one text as an ordered sequence: Azure TTS for normal words, Hudhaify
 * recitation for any ayah found inside it. Does NOT reset hybridSpeechToken —
 * the caller owns the sequence token so multiple calls chain seamlessly.
 * Returns the set of verse keys that were recited (to avoid double-reciting).
 */
async function playSpeechForText(text, q, btn, token) {
  const recited = new Set();
  const src = String(text || '').trim();
  if (!src) return recited;
  if (textMayHaveQuranAyah(src, q)) {
    const plan = await buildSpeechPlan(src, q);
    if (token !== hybridSpeechToken) return recited;
    if (plan.length) {
      for (const seg of plan) {
        if (token !== hybridSpeechToken) break;
        if (seg.type === 'quran' && seg.verseKey) {
          recited.add(seg.verseKey);
          await playQuranRecitation(seg.verseKey, btn, { interruptAll: false });
        } else if (seg.type === 'tts' && seg.text?.trim()) {
          await speakTtsSegment(seg.text, btn);
        }
      }
      return recited;
    }
  }
  await speakTtsSegment(src, btn);
  return recited;
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
    if (e.name !== 'AbortError') {
      recordTtsError(e, 'speakHybrid');
      console.warn('hybrid speech:', e);
    }
  } finally {
    if (token === hybridSpeechToken && btn) btn.classList.remove('speaking');
    clearTtsAudio();
  }
}

function toastTtsFail() {
  const stats = getTtsErrorStats();
  // Soft baked misses are expected for uncovered bank strings — don't alarm the student.
  if (String(ttsLastErrorMsg || '').includes('baked miss') && ttsSessionFailCount < 3 && stats.fails < 5) {
    return;
  }
  const msg = ttsSessionFailCount >= 3 || stats.fails >= 5
    ? 'تعذّر الصوت عدة مرات — تحقق من الاتصال أو جرّب لاحقاً'
    : 'تعذّر تشغيل الصوت — تحقق من الاتصال';
  if (typeof showToast === 'function') showToast(msg, 'err');
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
    recordTtsError(e, 'speakText');
    console.warn('cloud tts:', e);
    toastTtsFail();
  }
}

/** Best-effort unlock so later async Audio.play() works on iOS/Safari. */
function unlockTtsAudio() {
  try {
    const silent = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAGAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==';
    const a = new Audio(silent);
    a.volume = 0.01;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { try { a.pause(); } catch { /* ignore */ } }).catch(() => {});
    }
  } catch { /* ignore */ }
}

function speakQuestion() {
  const q = state.questions[state.idx];
  if (!q?.q || !voiceOn) return;
  if (navigator.onLine === false) {
    applyOfflineVoicePolicy();
  }
  const btn = document.getElementById('btn-speak-question');
  const askIdx = state.idx;
  // Cut previous audio instantly so the new question never waits behind feedback.
  stopSpeaking();
  unlockTtsAudio();
  void (async () => {
    try {
      const warmP = questionSpeechWarmPromises.get(q) || warmQuestionSpeech(q);
      // Core speech map is inline — only wait briefly on cold boot.
      if (typeof window === 'undefined' || !window.SPEECH_BY_QUESTION_ID) {
        await Promise.race([
          ensureSpeechMapsLoaded(),
          new Promise((r) => setTimeout(r, 50)),
        ]);
      }
      if (!voiceOn || state.idx !== askIdx) return;

      const { questionText, optionList } = buildQuestionSpeechParts(q);
      const qClean = prepareTtsPayload(questionText);
      const opts = optionList || [];
      const verseKey = getPrimaryVerseKeyForQuestion(q);

      if (verseKey) void fetchQuranAudioObjectUrl(verseKey).catch(() => {});
      if (voiceReadAnswers) {
        for (const opt of opts) prefetchTtsText(opt);
      }
      const next = state.questions[askIdx + 1];
      if (next) {
        void prefetchHybridSpeechForQuestion(next);
        void warmQuestionSpeech(next);
      }

      // Join in-flight question warm only — tiny cap so we never hang on start.
      if (qClean && !ttsPayloadReadyInMemory(qClean)) {
        await Promise.race([
          warmP,
          new Promise((r) => setTimeout(r, 160)),
        ]);
      }
      if (!voiceOn || state.idx !== askIdx) return;

      const token = hybridSpeechToken;
      if (btn) btn.classList.add('speaking');
      try {
        const recited = new Set();

        // 1) Question — start ASAP; soft-fail and continue to answers.
        if (qClean && textMayHaveQuranAyah(questionText, q)) {
          try {
            // Prefer mapped Hudhaify + TTS prose; avoid network search stalls.
            const mappedKey = getPrimaryVerseKeyForQuestion(q);
            if (mappedKey && shouldReciteHudhaifyForQuestion(q, questionText)) {
              const prose = prepareTtsPayload(
                String(questionText || '')
                  .replace(/﴿[^﴾]*﴾/g, ' ')
                  .replace(/「[^」]*」/g, ' ')
              );
              if (prose) {
                await speakTtsSegment(prose, btn, { clearAfter: false, alreadyPrepared: true });
              }
              if (token !== hybridSpeechToken || state.idx !== askIdx) return;
              recited.add(mappedKey);
              try {
                await Promise.race([
                  playQuranRecitation(mappedKey, btn, { interruptAll: false }),
                  new Promise((_, rej) => setTimeout(() => rej(new Error('quran timeout')), 5000)),
                ]);
              } catch (e) {
                console.warn('quran skip:', e?.message || e);
              }
            } else {
              const fromQ = await playSpeechForText(questionText, q, btn, token);
              fromQ.forEach((k) => recited.add(k));
            }
          } catch (e) {
            if (e?.name === 'AbortError') return;
            console.warn('question hybrid tts:', e);
          }
        } else if (qClean) {
          try {
            await speakTtsSegment(qClean, btn, { clearAfter: false, alreadyPrepared: true });
          } catch (e) {
            if (e?.name === 'AbortError') return;
            console.warn('question tts:', e);
            if (!String(e?.message || '').includes('baked miss')) toastTtsFail();
          }
        }
        if (token !== hybridSpeechToken || state.idx !== askIdx) return;

        // 1b) Hadith / book citation — read aloud after the question (never as Hudhaify).
        const citeRaw = String(q.quote || '').trim();
        if (citeRaw && isHadithPassage(citeRaw) && !citationLooksLikeAyah(citeRaw, verseKey)) {
          const citeSpeak = speechPart(q, 'quote', citeRaw) || citeRaw;
          const citeClean = prepareTtsPayload(citeSpeak);
          if (citeClean) {
            try {
              await speakTtsSegment(citeClean, btn, { clearAfter: false, alreadyPrepared: true });
            } catch (e) {
              if (e?.name === 'AbortError') return;
              console.warn('hadith cite tts:', e?.message || e);
            }
          }
        }
        if (token !== hybridSpeechToken || state.idx !== askIdx) return;

        // 2) Ayah — الحذيفي فقط (never TTS ayah text; never Hudhaify a hadith).
        const verseKeyForRecite = getPrimaryVerseKeyForQuestion(q);
        if (
          verseKeyForRecite
          && !recited.has(verseKeyForRecite)
          && shouldReciteHudhaifyForQuestion(q, questionText)
        ) {
          recited.add(verseKeyForRecite);
          try {
            await Promise.race([
              playQuranRecitation(verseKeyForRecite, btn, { interruptAll: false }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('quran timeout')), 5000)),
            ]);
          } catch (e) {
            console.warn('quran skip:', e?.message || e);
          }
        }
        if (token !== hybridSpeechToken || state.idx !== askIdx) return;

        // 3) Answers — every option via baked TTS.
        //    Hadith wording in options/questions stays TTS; mapped Quran ayahs use Hudhaify above.
        if (voiceReadAnswers && opts.length) {
          for (const opt of opts) {
            if (token !== hybridSpeechToken || state.idx !== askIdx) return;
            const oClean = prepareTtsPayload(opt);
            if (!oClean) continue;
            try {
              await speakTtsSegment(oClean, btn, { clearAfter: false, alreadyPrepared: true });
            } catch (e) {
              if (e?.name === 'AbortError') return;
              // Fallback: sanitize again (never speak raw punctuation/quotes).
              try {
                const rawClean = prepareTtsPayload(String(opt || '').trim());
                if (rawClean && rawClean !== oClean) {
                  await speakTtsSegment(rawClean, btn, { clearAfter: false, alreadyPrepared: true });
                }
              } catch (e2) {
                console.warn('option tts miss:', e2?.message || e2);
              }
            }
          }
        }
      } finally {
        if (token === hybridSpeechToken && btn) btn.classList.remove('speaking');
        clearTtsAudio();
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        recordTtsError(e, 'speakQuestion');
        console.warn('speakQuestion:', e);
        if (!String(e?.message || '').includes('baked miss')) toastTtsFail();
      }
    }
  })();
}

function applyOfflineVoicePolicy() {
  if (navigator.onLine !== false) return;
  // Keep voiceOn — cached clips in IndexedDB/memory still play offline.
  if (sessionStorage.getItem('offlineVoiceNoted') === '1') return;
  sessionStorage.setItem('offlineVoiceNoted', '1');
  if (typeof showToast === 'function') {
    showToast('بدون نت: الصوت يعمل من الكاش إن سبق تحميله', 'ok');
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

function appendAnswerOption(grid, text, isOk, colorIdx, q, speechField = null) {
  const wrap = document.createElement('div');
  wrap.className = 'ans-row ans-row-single';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ans-btn ans-color-' + (colorIdx ?? 0);
  const raw = String(text || '');
  const shown = speechField
    ? displayFieldText(q, speechField, raw)
    : displayFieldText(q, null, raw);
  btn.textContent = shown;
  btn.dataset.raw = raw;
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
    const rawSpeak = raw.replace(/[✓✗]/g, '').trim();
    const toSpeak = speechField
      ? speechPart(q, speechField, rawSpeak)
      : prepareArabicForSpeech(applyManualSpeechDiacritics(rawSpeak));
    prefetchTtsText(toSpeak);
    sp.onclick = (e) => {
      e.stopPropagation();
      // Do not pass question — avoids injecting mapped Quran into option TTS.
      speakText(toSpeak, sp, { allowAnswers: true, question: null });
    };
    wrap.appendChild(btn);
    wrap.appendChild(sp);
    grid.appendChild(wrap);
    return;
  }
  wrap.appendChild(btn);
  grid.appendChild(wrap);
}

async function shareScore() {
  const text = '🎮 ' + state.userName + ' حصل/ت على ' + state.score + ' نقطة في مكتبة جمعية الهدى والحكمة التعليمية! ⭐\nجرّب/ي أنت أيضاً!\nhttps://alhuda.ryodan71.workers.dev/';
  const shareBtn = document.getElementById('share-btn');
  if (navigator.share) {
    try { await navigator.share({ title: 'مكتبة جمعية الهدى والحكمة التعليمية', text }); return; } catch (e) {}
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

function getCorrectAnswerText(q) {
  if (q.type === 'tf') return q.tf ? 'صَحّ ✓' : 'خَطَأٌ ✗';
  const raw = q.a && q.c != null ? q.a[q.c] : '';
  if (!raw) return '';
  return speechPart(q, `a${q.c}`, raw) || raw;
}

/** Visible label without tashkeel — speech maps keep harakat for TTS only. */
function displayFieldText(q, field, raw) {
  const src = String(raw || '');
  if (!src.trim()) return src;
  const marks = src.match(/[✓✗]/g);
  const bare = src.replace(/[✓✗]/g, '').trim();
  const shown = stripArabicDiacritics(bare).replace(/\s+/g, ' ').trim() || bare;
  return marks?.length ? `${shown} ${marks.join('')}` : shown;
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
  // OCR artifacts only: diacritic torn away from its letter (e.g. "ا ً" / " ً ل"),
  // NOT normal Arabic like «شيئاً دخل» where tanween sits on the last letter before a space.
  return /[\u0621-\u064A]\s+[\u064B-\u065F]/.test(s || '')
    || /[\u064B-\u065F]\s+[\u064B-\u065F]/.test(s || '')
    || /(^|\s)[\u064B-\u065F]/.test(s || '');
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
  // Leftovers after stripping «الإجابة الصحيحة:» are usually the answer option, not a book quote.
  if (/^(صح|خطأ|شرك\s*أكبر|شرك\s*أصغر|الأسماء\s*والصفات)\s*$/i.test(String(s).trim())) return true;
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
  const t = stripArabicDiacritics((s || '').trim()).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.startsWith('«')) return t;
  return `«${t}»`;
}

/** True when explanation is the same (or nearly the same) as the book citation — don't show both. */
function explanationDuplicatesCitation(exp, q) {
  const expBare = normalizeArabicForMatch(String(exp || '').replace(/^«|»$/g, ''));
  if (!expBare || expBare.length < 8) return true;
  // Real book quote / canonical only — never compare against exp-derived "citation".
  const quoteRaw = cleanArabicCitation(q?.quote, q?.id)
    || (q?.id && typeof getCanonicalQuote === 'function' && getCanonicalQuote(q.id))
    || '';
  if (!quoteRaw) {
    // No separate book quote: citation box must not re-print the explanation.
    return false;
  }
  const citeBare = normalizeArabicForMatch(String(quoteRaw).replace(/^«|»$/g, ''));
  if (!citeBare) return false;
  if (expBare === citeBare) return true;
  if (textIsSubstantiallyContained(exp, citeBare) || textIsSubstantiallyContained(citeBare, exp)) return true;
  const withoutLead = expBare
    .replace(/^الاجابه\s*الصحيحه\s*/g, '')
    .replace(/^العباره\s*(غير\s*)?صحيحه\s*/g, '')
    .trim();
  if (withoutLead && (withoutLead === citeBare || textIsSubstantiallyContained(withoutLead, citeBare) || textIsSubstantiallyContained(citeBare, withoutLead))) {
    return true;
  }
  return false;
}

/** True when «الشرح» mostly repeats «الإجابة الصحيحة» — hide the redundant block. */
function explanationDuplicatesCorrectAnswer(exp, q) {
  const correct = getCorrectAnswerText(q);
  if (!correct) return false;
  const expBare = normalizeArabicForMatch(String(exp || ''));
  const corBare = normalizeArabicForMatch(String(correct));
  if (!expBare || expBare.length < 6 || !corBare) return false;
  if (expBare === corBare) return true;
  const stripped = expBare
    .replace(/^الاجابه\s*الصحيحه\s*/g, '')
    .replace(/^العباره\s*(غير\s*)?صحيحه\s*/g, '')
    .replace(/^الصحيح\s*(هو|ان)?\s*/g, '')
    .trim();
  if (stripped && stripped === corBare) return true;
  if (textIsSubstantiallyContained(expBare, corBare)) return true;
  if (textIsSubstantiallyContained(corBare, expBare)) {
    // Correct answer sits inside the explanation — keep شرح only if it adds real unique text.
    const leftover = expBare.split(corBare).join(' ').replace(/\s+/g, ' ').trim();
    if (!leftover) return true;
    if (leftover.length <= 22) return true;
    if (leftover.length / Math.max(1, expBare.length) < 0.38) return true;
  }
  // MC options: «الإجابة الصحيحة: الأسماء والصفات» after strip → option text.
  if (q?.type === 'mc' && Array.isArray(q.a)) {
    for (const opt of q.a) {
      const ob = normalizeArabicForMatch(String(opt || ''));
      if (ob && (expBare === ob || stripped === ob)) return true;
    }
  }
  return false;
}

function shouldShowExplanation(exp, q) {
  // Legacy helper — UI no longer shows a separate «الشرح» block.
  const raw = String(exp || '').trim();
  if (!raw || raw.length < 8 || isWorksheetCitation(raw)) return false;
  const cleaned = cleanArabicCitation(raw, null) || collapseBrokenArabicSpaces(raw);
  if (!cleaned || cleaned.length < 8) return false;
  if (isGarbageCitation(cleaned)) return false;
  if (explanationDuplicatesCitation(cleaned, q)) return false;
  if (explanationDuplicatesCorrectAnswer(cleaned, q)) return false;
  return true;
}

/** True when the stored book citation is itself a Quran ayah (not prose from the book). */
function citationLooksLikeAyah(bookQuote, verseKey) {
  const raw = String(bookQuote || '').replace(/^«|»$/g, '').trim();
  if (!raw) return false;
  if (/[﴿﴾]/.test(raw)) return true;
  const bare = normalizeArabicForMatch(raw);
  // Short «قال تعالى …» lines are almost always ayah citations.
  if (/^(قال|قوله)\s*تعالى/.test(bare) && bare.length <= 180) return true;
  if (!verseKey) return false;
  const ayahLocal = getLocalAyahSnippet(verseKey);
  if (!ayahLocal) return false;
  const ayahBare = normalizeArabicForMatch(ayahLocal);
  if (!ayahBare) return false;
  if (bare === ayahBare) return true;
  // Require a strong containment match — loose word overlap must NOT hide book prose.
  if (bare.length >= 18 && ayahBare.includes(bare)) return true;
  if (ayahBare.length >= 18 && bare.includes(ayahBare)) return true;
  return false;
}

function citationTextsEquivalent(a, b) {
  const aBare = normalizeArabicForMatch(String(a || '').replace(/^«|»$/g, ''));
  const bBare = normalizeArabicForMatch(String(b || '').replace(/^«|»$/g, ''));
  if (!aBare || !bBare || aBare.length < 6 || bBare.length < 6) return false;
  if (aBare === bBare) return true;
  if (textIsSubstantiallyContained(aBare, bBare) || textIsSubstantiallyContained(bBare, aBare)) return true;
  return false;
}

function looksLikeBookCitationText(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 8) return false;
  if (/[«»﴿﴾]/.test(t)) return true;
  if (/(قال|قوله)\s+(الله\s+)?تعالى|صلى الله|ﷺ|رواه\s|الحديث|وفي الحديث|عن\s+النبي|رضي الله/i.test(t)) return true;
  if (/^من\s+(حلف|تعلق|علّق|مات)|دخل\s+الجنة|الطيرة\s+شرك|إنما\s+الأعمال/i.test(t)) return true;
  return false;
}

function getCleanExplanationText(q) {
  let raw = String(q?.exp || '').trim();
  if (!raw || raw.length < 8 || isWorksheetCitation(raw)) return '';
  // Drop answer-label lead-ins so the remaining prose can sit under الاستشهاد.
  raw = raw
    .replace(/^الإجابة\s*الصحيحة\s*[:：]?\s*[^.!؟\n]{0,80}[.!؟]\s*/i, '')
    .replace(/^العبارة\s*(غير\s*)?صحيحة\s*[.!؟]?\s*/i, '')
    .replace(/^الصحيح\s*(هو|أن|ان)?\s*[:：]?\s*/i, '')
    .trim();
  if (!raw || raw.length < 8) return '';
  // null id — do not swap explanation for canonical while cleaning.
  const cleaned = cleanArabicCitation(raw, null) || collapseBrokenArabicSpaces(raw);
  if (!cleaned || cleaned.length < 8 || isGarbageCitation(cleaned)) return '';
  // Only drop if the whole text is literally the answer option (not a longer book sentence that contains it).
  const bare = normalizeArabicForMatch(cleaned.replace(/^«|»$/g, ''));
  const cor = normalizeArabicForMatch(getCorrectAnswerText(q));
  if (cor && bare === cor) return '';
  if (q?.type === 'mc' && Array.isArray(q.a)) {
    for (const opt of q.a) {
      const ob = normalizeArabicForMatch(String(opt || ''));
      if (ob && bare === ob) return '';
    }
  }
  return cleaned;
}

/**
 * Search for the real book citation only (canonical map → source_quote).
 * Do NOT pull explanation snippets here — full explanation is handled in getCitationBodyText.
 */
function findBookCitation(q) {
  const rejectAsAnswerOnly = (text) => {
    const bare = normalizeArabicForMatch(String(text || '').replace(/^«|»$/g, ''));
    if (!bare || bare.length < 3) return true;
    const cor = normalizeArabicForMatch(getCorrectAnswerText(q));
    if (cor && bare === cor) return true;
    const stripped = bare.replace(/^الاجابه\s*الصحيحه\s*/g, '').trim();
    if (cor && stripped === cor) return true;
    if (q?.type === 'mc' && Array.isArray(q.a)) {
      for (const opt of q.a) {
        const ob = normalizeArabicForMatch(String(opt || ''));
        if (ob && (bare === ob || stripped === ob)) return true;
      }
    }
    return false;
  };

  const canonRaw = q?.id ? getCanonicalQuote(q.id) : '';
  if (canonRaw) {
    const canon = cleanArabicCitation(canonRaw, null) || collapseBrokenArabicSpaces(canonRaw);
    if (canon && !isGarbageCitation(canon) && !rejectAsAnswerOnly(canon)) {
      return formatCitationQuote(canon);
    }
  }

  const quoteRaw = String(q?.quote || '').trim();
  if (quoteRaw) {
    const cleaned = cleanArabicCitation(quoteRaw, null);
    if (cleaned && !isGarbageCitation(cleaned) && !rejectAsAnswerOnly(cleaned)) {
      return formatCitationQuote(cleaned);
    }
  }
  return '';
}

/** Book quote only — real source_quote / canonical, not explanation. */
function getBookQuoteOnly(q) {
  return findBookCitation(q);
}

/**
 * Text under «الاستشهاد من الكتاب» — no separate «شرح» UI:
 * 1) Real book/canonical quote when available
 * 2) Otherwise the FULL explanation text (never leave empty book-title-only)
 */
function getCitationBodyText(q) {
  const book = findBookCitation(q);
  if (book) return book;
  const exp = getCleanExplanationText(q);
  if (exp) return formatCitationQuote(exp);
  return '';
}


function sanitizeBookQuote(text, questionId) {
  return cleanArabicCitation(text, questionId);
}

/**
 * الاستشهاد من الكتاب:
 * - نص يمين تحت العنوان + مصدر في نهاية نفس السطر
 * - تلاوة فوق يسار إن وجدت آية
 * Never show an empty box with only the book title.
 */
function buildCitationMetaInline(q, { verseKey = '', showedAyah = false } = {}) {
  const book = BOOK_LABELS[q.book] || q.book || '';
  const pageLabel = formatPageLabel(q.page);
  const parts = [];
  if (book) parts.push(escapeHtml(book));
  if (pageLabel) parts.push(pageLabel);
  else if (showedAyah && verseKey) parts.push(escapeHtml(String(verseKey).replace(':', '∶')));
  if (!parts.length) return '';
  return `<span class="book-cite-meta"> · ${parts.join(' · ')}</span>`;
}

function buildBookCitationHtml(q) {
  const bookQuote = getBookQuoteOnly(q);
  const citeBody = getCitationBodyText(q);
  const verseKey = getPrimaryVerseKeyForQuestion(q);
  const quoteIsAyah = citationLooksLikeAyah(citeBody || bookQuote, verseKey);

  if (!citeBody && !verseKey) return '';

  let showedAyah = false;
  let bodyHtml = '';
  let actionsHtml = '';

  if (citeBody && !quoteIsAyah) {
    bodyHtml = `<span class="book-cite-quote">${escapeHtml(citeBody)}</span>${buildCitationMetaInline(q)}`;
  } else if (verseKey && (quoteIsAyah || !citeBody)) {
    const local = getLocalAyahSnippet(verseKey);
    bodyHtml =
      `<span class="q-ayah-text book-cite-ayah" data-ayah-text>${escapeHtml(formatAyahDisplay(local) || '…')}</span>` +
      buildCitationMetaInline(q, { verseKey, showedAyah: true });
    actionsHtml = `<div class="book-cite-actions">${buildQuranReciteButtonHtml()}</div>`;
    showedAyah = true;
  } else if (citeBody) {
    bodyHtml = `<span class="book-cite-quote">${escapeHtml(citeBody)}</span>${buildCitationMetaInline(q)}`;
  }

  if (!bodyHtml) return '';

  const heading = showedAyah && !citeBody
    ? '📖 الدليل من القرآن'
    : '📖 الاستشهاد من الكتاب';

  return (
    `<p class="book-cite-heading">${heading}</p>` +
    `<div class="book-cite-box">` +
      `<div class="book-cite-row">` +
        `<div class="book-cite-body">${bodyHtml}</div>` +
        actionsHtml +
      `</div>` +
    `</div>`
  );
}

function buildAnswerFeedbackHtml(q, isCorrect = true, wrongText = '') {
  const correctText = getCorrectAnswerText(q);
  const wrong = (wrongText || '').trim();
  let html = '<div class="answer-feedback">';
  if (!isCorrect && wrong) {
    html += '<div class="why-correct-box is-wrong">';
    // Label + picked answer on ONE line after the colon.
    html += `<p class="fb-wrong-line">❌ <span class="fb-wrong-label">إجابتك خاطئة:</span> <span class="fb-wrong-answer">${escapeHtml(wrong)}</span></p>`;
    html += '</div>';
  }
  if (correctText) {
    const boxClass = isCorrect ? 'why-correct-box is-correct' : 'why-correct-box is-correct-reveal';
    html += `<div class="${boxClass}">`;
    // Label + correct answer on ONE line after the colon.
    html += `<p class="fb-correct-line">✅ <span class="fb-correct-label">الإجابة الصحيحة:</span> <span class="fb-correct-answer">${escapeHtml(correctText)}</span></p>`;
    html += '</div>';
  }
  // Never render «الشرح» — any explanation text lives under الاستشهاد من الكتاب.
  html += buildBookCitationHtml(q);
  html += '</div>';
  return html;
}

function mountAnswerFeedback(q, html) {
  const expEl = document.getElementById('fb-exp');
  if (!expEl) return;
  expEl.innerHTML = html;
  bindQuranReciteButton(expEl, q);
  const verseKey = getPrimaryVerseKeyForQuestion(q);
  // Readable ayah in citation (snippet if mapped; not over-truncated).
  if (verseKey) void fillAyahTextElements(expEl, verseKey, { preferSnippet: true, compact: false });
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
  if (!trainingMode) {
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
  if (LOGIN_LOCKED) {
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
  if (removed > 0) console.debug(`[questions] removed ${removed} near-duplicate(s) in ${book}`);
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
    hint.textContent = 'النموذج التجريبي فقط — ٨ أسئلة لكل كتاب';
    return;
  }
  const total = QUESTION_BOOKS.reduce((n, b) => n + (QUESTIONS[b]?.length || 0), 0);
  if (total <= 0) return;
  const allLoaded = QUESTION_BOOKS.every((b) => bookLoadState[b]);
  if (allLoaded) {
    hint.textContent = arabicNum(total) + ' سؤال في انتظارك';
  } else {
    hint.textContent = 'جاري تجهيز الأسئلة… (حالياً ' + arabicNum(total) + ')';
  }
}

function refreshBookFromNetwork(book) {
  if (LOGIN_LOCKED) return;
  if (!QUESTION_BOOKS.includes(book) || navigator.onLine === false) return;
  if (!getDb()) return;
  void (async () => {
    try {
      const { data, error } = await fetchBookQuestions(book);
      if (error || !data?.length) return;
      ingestBookQuestions(book, data);
      bookLoadState[book] = true;
      updateLevelCounts();
      updateLoginQuestionHint();
      updateBookProgress?.();
    } catch (e) {
      console.warn('background refresh', book, e);
    }
  })();
}

async function loadBookQuestions(book) {
  if (!QUESTION_BOOKS.includes(book)) return [];
  // Only trust cache when the full bank was loaded from network/offline — not demo seed.
  if (bookLoadState[book] && QUESTIONS[book]?.length) {
    if (navigator.onLine !== false && getDb()) refreshBookFromNetwork(book);
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
      if (cached?.length && cached.length > 30) {
        // Offline full-ish cache only
        QUESTIONS[book] = dedupeQuestionList(cached);
        bookLoadState[book] = true;
        console.debug(`[questions] loaded ${book} from offline cache`);
      } else if (!QUESTIONS[book]?.length) {
        seedQuestionsFromBundle();
        console.debug(`[questions] provisional ${book} from demo bundle`);
        throw netErr;
      } else {
        // Keep provisional demo rows; mark not fully loaded.
        bookLoadState[book] = false;
      }
    }
    updateLevelCounts();
    updateLoginQuestionHint();
    return QUESTIONS[book];
  })();
  try {
    return await bookLoadPromises[book];
  } catch (e) {
    delete bookLoadPromises[book];
    // Still return provisional demo if present.
    if (QUESTIONS[book]?.length) return QUESTIONS[book];
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
  // Prefer static full bank (works offline / without Supabase).
  const bank = (typeof window !== 'undefined' && window.QUESTIONS_BANK) || null;
  if (bank) {
    let seeded = false;
    for (const book of QUESTION_BOOKS) {
      const rows = bank[book];
      if (rows?.length) {
        ingestBookQuestions(book, rows);
        bookLoadState[book] = true;
        delete bookLoadPromises[book];
        seeded = true;
      }
    }
    if (seeded) {
      updateLoginQuestionHint();
      updateLevelCounts();
      return true;
    }
  }
  return false;
}

async function refreshFullQuestionBank({ quiet = false } = {}) {
  if (LOGIN_LOCKED) return false;
  // Static bank already loaded — treat as complete; still try cloud refresh if available.
  const staticReady = QUESTION_BOOKS.every((b) => bookLoadState[b] && (QUESTIONS[b]?.length || 0) > 30);
  if (staticReady) {
    updateLoginQuestionHint();
    updateLevelCounts();
    // Optional background cloud refresh — never block login/play.
    if (navigator.onLine !== false && getDb()) {
      void (async () => {
        try {
          if (!window.AlhudaPlatform?.loadQuestionsCached) return;
          const data = await Promise.race([
            AlhudaPlatform.loadQuestionsCached(true),
            new Promise((_, rej) => setTimeout(() => rej(new Error('bank refresh timeout')), 6000)),
          ]);
          const fmt = { tawheed: [], usool: [], nawawi: [] };
          (data || []).forEach((q) => { if (fmt[q.book]) fmt[q.book].push(q); });
          for (const book of QUESTION_BOOKS) {
            if (fmt[book]?.length > 30) {
              ingestBookQuestions(book, fmt[book]);
              bookLoadState[book] = true;
            }
          }
          updateLoginQuestionHint();
          updateLevelCounts();
        } catch (e) {
          console.warn('background bank refresh skipped', e?.message || e);
        }
      })();
    }
    return true;
  }
  if (navigator.onLine === false || !getDb()) {
    seedQuestionsFromBundle();
    return QUESTION_BOOKS.every((b) => bookLoadState[b]);
  }
  if (!quiet && typeof showToast === 'function') showToast('جاري تحميل الأسئلة الكاملة…', 'ok');
  try {
    if (window.AlhudaPlatform?.loadQuestionsCached) {
      const data = await Promise.race([
        AlhudaPlatform.loadQuestionsCached(true),
        new Promise((_, rej) => setTimeout(() => rej(new Error('bank refresh timeout')), 8000)),
      ]);
      const fmt = { tawheed: [], usool: [], nawawi: [] };
      (data || []).forEach((q) => { if (fmt[q.book]) fmt[q.book].push(q); });
      let got = false;
      for (const book of QUESTION_BOOKS) {
        if (fmt[book]?.length > 30) {
          ingestBookQuestions(book, fmt[book]);
          bookLoadState[book] = true;
          delete bookLoadPromises[book];
          got = true;
        }
      }
      if (!got) seedQuestionsFromBundle();
    } else {
      seedQuestionsFromBundle();
    }
    updateLoginQuestionHint();
    updateLevelCounts();
    updateBookButtons();
    updateBookProgress?.();
    const total = QUESTION_BOOKS.reduce((n, b) => n + (QUESTIONS[b]?.length || 0), 0);
    if (!quiet && typeof showToast === 'function') {
      showToast(`تم تحميل ${arabicNum(total)} سؤال ✓`, 'ok');
    }
    return QUESTION_BOOKS.every((b) => bookLoadState[b]);
  } catch (e) {
    console.warn('refreshFullQuestionBank', e);
    seedQuestionsFromBundle();
    if (!quiet && typeof showToast === 'function') showToast('تعذّر تحميل البنك الكامل', 'err');
    return QUESTION_BOOKS.every((b) => bookLoadState[b]);
  }
}

async function loadQuestions() {
  // Bundle-first: unlock UI without waiting for network (provisional counts).
  const hasBundle = seedQuestionsFromBundle();
  if (hasBundle) {
    updateLoginQuestionHint();
    updateLevelCounts();
    if (!LOGIN_LOCKED && navigator.onLine !== false) {
      void refreshFullQuestionBank({ quiet: true });
    }
    return;
  }

  setAppLoading(true, 'جاري تحميل الأسئلة...');
  try {
    seedQuestionsFromBundle();
    const ok = await refreshFullQuestionBank({ quiet: true });
    if (ok) {
      updateLoginQuestionHint();
      return;
    }
    const offline = await loadQuestionsOffline();
    if (offline?.books) {
      let any = false;
      for (const book of QUESTION_BOOKS) {
        const rows = offline.books[book];
        if (rows?.length) {
          QUESTIONS[book] = dedupeQuestionList(rows);
          bookLoadState[book] = rows.length > 30;
          any = true;
        }
      }
      if (any) {
        updateLoginQuestionHint();
        updateLevelCounts();
        if (navigator.onLine !== false) void refreshFullQuestionBank({ quiet: true });
        return;
      }
    }
    await loadBookQuestions('tawheed');
    updateLoginQuestionHint();
    loadRemainingBooksInBackground();
  } catch (e) {
    console.error(e);
    seedQuestionsFromBundle();
    updateLoginQuestionHint();
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
  // Respect solved questions for «الكل» and manual range (same as tier path).
  if (!state.homeworkId && !trainingMode && !state.stageReviewMode) {
    const solved = getSolvedIdSet(state.book);
    if (solved.size) {
      const filtered = slice.filter((q) => !solved.has(q.id));
      slice = filtered;
    }
  }
  return dedupeQuestionList(slice);
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
  const btn = document.getElementById('btn-start-game');
  if (btn) btn.textContent = 'جاري التحديث...';
  refreshFullQuestionBank({ quiet: false }).then((ok) => {
    if (!ok) {
      sessionStorage.removeItem('questionsCacheV3');
      QUESTION_BOOKS.forEach((b) => {
        bookLoadState[b] = false;
        delete bookLoadPromises[b];
      });
      return ensureBooksLoaded(booksForState(state.book));
    }
  }).then(() => {
    state.bankVersion++;
    updateQuestionRangeUI();
    updateStagePickerUI();
    updateLoginQuestionHint();
    updateLevelCounts();
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
  document.getElementById('welcome-user').textContent = 'متعلم/ة';
  document.getElementById('welcome-greeting').textContent = 'مرحباً يا ' + state.userName + '!';
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
  trainingMode = false;
  updateTopbarStats();
  const loginName = document.getElementById('login-name');
  const primary = getPrimaryName();
  if (loginName) loginName.value = primary || '';
  document.getElementById('login-err').textContent = '';
  const switchHint = document.getElementById('login-switch-hint');
  if (switchHint && primary) {
    switchHint.hidden = false;
    switchHint.textContent = `الاسم المحفوظ: ${primary} — يمكنك الدخول به أو كتابة اسم آخر`;
  }
  show('login-screen');
}

async function doLogin() {
  if (LOGIN_LOCKED) {
    document.getElementById('login-err').textContent = '🔒 الدخول مغلق مؤقتاً';
    return;
  }
  if (loginInProgress) return;
  document.getElementById('login-err').textContent = '';
  const btn = document.getElementById('btn-login');
  const btnLabel = btn?.textContent || 'دخول 🎮';
  loginInProgress = true;
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الدخول...'; }
  try {
    const rawName = document.getElementById('login-name').value.trim();
    const name = (typeof normalizeStudentName === 'function' ? normalizeStudentName(rawName) : rawName);
    if (!name) { setFormError(document.getElementById('login-err'), 'اكتب/ي اسمك من فضلك'); return; }
    if (name.length < 2) { setFormError(document.getElementById('login-err'), 'الاسم قصير جداً (حرفان على الأقل)'); return; }
    if (name.length > 40) { setFormError(document.getElementById('login-err'), 'الاسم طويل جداً (٤٠ حرفاً كحد أقصى)'); return; }

    try {
      const { data: { session: existingSession } } = await Promise.race([
        db.auth.getSession(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('session timeout')), 4000)),
      ]);
      if (existingSession?.user) {
        const { data: profile } = await Promise.race([
          db.from('profiles').select('name,role').eq('id', existingSession.user.id).maybeSingle(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('profile timeout')), 4000)),
        ]);
        if (profile?.name && profile.name !== name) {
          await db.auth.signOut().catch(() => {});
        }
      }
    } catch {
      /* cloud optional */
    }

    const { data, error } = await studentSignIn(name);
    if (error || !data?.user) {
      setFormError(document.getElementById('login-err'), error?.message || 'تعذّر الدخول');
      if (typeof showToast === 'function') showToast('تعذّر الدخول — حاول/ي مجدداً', 'err');
      return;
    }

    const isLocal = !!data.local || String(data.user.id || '').startsWith('local-');
    if (!isLocal) {
      try {
        const { data: existing } = await db.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
        let profileErr;
        if (existing) {
          ({ error: profileErr } = await db.from('profiles').update({ name, role: 'student' }).eq('id', data.user.id));
        } else {
          ({ error: profileErr } = await db.from('profiles').upsert({ id: data.user.id, name, role: 'student' }));
        }
        if (profileErr) console.warn('profile save:', profileErr.message);
      } catch (e) {
        console.warn('profile save skipped:', e);
      }
    }

    state.user = data.user;
    state.userType = 'student';
    state.userName = name;
    state.userEmail = '';
    localStorage.setItem('savedName', name);
    localStorage.setItem('demoDone', '1');
    if (!getPrimaryName()) setPrimaryName(name);
    adoptProgressForName(name);
    if (typeof trackEvent === 'function') trackEvent('login', { role: 'student', local: isLocal });
    if (!isLocal && window.AlhudaPlatform?.syncUserClassFromDb) await AlhudaPlatform.syncUserClassFromDb();
    if (!isLocal && window.AlhudaPlatform?.syncWrongQuestionsFromDb) await AlhudaPlatform.syncWrongQuestionsFromDb();
    if (!isLocal && typeof pullTierProgressFromCloud === 'function') await pullTierProgressFromCloud();
    void syncPendingScores();
    await refreshFullQuestionBank({ quiet: true });
    goHome();
  } finally {
    loginInProgress = false;
    if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
  }
}

/** Auto-login with saved / typed name — returns true if login started successfully to home. */
async function tryAutoLoginByName() {
  if (LOGIN_LOCKED || loginInProgress || state.user) return false;
  const input = document.getElementById('login-name');
  const saved = getPrimaryName() || localStorage.getItem('savedName') || '';
  const typed = (input?.value || '').trim();
  const name = typed || saved;
  if (!name || name.length < 2) return false;
  if (input && !typed) input.value = name;
  await doLogin();
  return !!state.user;
}

let loginNameDebounceTimer = null;
function scheduleAutoLoginFromNameInput() {
  if (LOGIN_LOCKED || loginInProgress || state.user) return;
  clearTimeout(loginNameDebounceTimer);
  loginNameDebounceTimer = setTimeout(() => {
    const name = (document.getElementById('login-name')?.value || '').trim();
    if (name.length >= 2) void doLogin();
  }, 700);
}

async function switchLoginName() {
  const primary = getPrimaryName();
  await logout();
  const loginName = document.getElementById('login-name');
  if (loginName) {
    loginName.value = '';
    loginName.focus();
  }
  if (typeof showToast === 'function') {
    showToast(primary ? `الاسم الأساسي محفوظ (${primary}) — اكتب اسماً آخر للدخول` : 'اكتب اسماً جديداً للدخول', 'ok');
  }
}

async function usePrimaryNameLogin() {
  const primary = getPrimaryName();
  if (!primary) {
    if (typeof showToast === 'function') showToast('لا يوجد اسم أساسي محفوظ بعد', 'err');
    return;
  }
  const loginName = document.getElementById('login-name');
  if (loginName) loginName.value = primary;
  await doLogin();
}

async function wipeMyProgress() {
  if (!state.userName && !state.user) {
    show('login-screen');
    return;
  }
  const name = state.userName || localStorage.getItem('savedName') || '';
  const ok = window.confirm(
    `حذف كل التقدّم المحلي للاسم «${name}» والبدء من جديد؟\n(يُصفَّر أيضاً تقدّم المستويات السحابي إن وُجد حساب)`
  );
  if (!ok) return;
  wipeLocalProgressForName(name);
  if (state.user) {
    const client = typeof getDb === 'function' ? getDb() : null;
    if (client?.auth?.updateUser) {
      void client.auth.updateUser({
        data: {
          alhuda_tier_v1: {},
          alhuda_tier_v1_at: new Date().toISOString(),
          alhuda_backup_v1: null,
          alhuda_backup_v1_at: new Date().toISOString(),
        },
      }).catch(() => {});
    }
  }
  updateTopbarStats();
  updateBookProgress?.();
  updateLevelCounts();
  if (typeof showToast === 'function') showToast('تم تصفير التقدّم — يمكنك البدء من جديد بنفس الاسم', 'ok');
  goHome();
}

function setAsPrimaryName() {
  if (!state.userName) return;
  setPrimaryName(state.userName);
  if (typeof showToast === 'function') showToast(`تم حفظ «${state.userName}» كاسم أساسي ✓`, 'ok');
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
  if (LEVEL_FLOW.includes(l) && !isLevelUnlocked(state.book, l)) {
    const msg = nextLockedLevelMessage(state.book, l);
    if (typeof showToast === 'function') showToast(msg || 'المستوى مقفل', 'err');
    else showAlert(msg || 'المستوى مقفل');
    updateLevelLockUI();
    return;
  }
  state.level = l;
  state.bankVersion = 0;
  state.useManualRange = false;
  state.stageReviewMode = false;
  document.querySelectorAll('.level-btn[data-level]').forEach((b) => b.classList.remove('sel'));
  const el = document.getElementById('btn-' + l);
  if (el) el.classList.add('sel');
  const pool = getOrderedPool(state.book, l);
  const max = pool.length;
  const toEl = document.getElementById('q-to-input');
  const fromEl = document.getElementById('q-from-input');
  if (fromEl) fromEl.value = 1;
  if (toEl) toEl.value = max ? Math.min(Math.max(state.roundSize || ROUND_SIZE_DEFAULT, ROUND_SIZE_MIN), max) : 1;
  updateQuestionRangeUI();
  updateStagePickerUI();
  updateLevelCounts();
}
function updateBookButtons() {
  document.querySelectorAll('.book-btn').forEach(b => b.classList.remove('sel'));
  const id = 'book-btn-' + (BOOK_BTN_MAP[state.book] || state.book);
  const el = document.getElementById(id);
  if (el) el.classList.add('sel');
}
async function startCountdown() {
  if (countdownTimer) return;
  unlockTtsAudio();
  if (isRealGameLocked()) {
    showRealGameLockedAlert();
    return;
  }
  try {
    await ensureBooksLoaded(booksForState(state.book));
  } catch (e) {
    if (typeof showToast === 'function') showToast('تعذّر تحميل أسئلة هذا الكتاب', 'err');
    return;
  }
  if (!state.useManualRange && !state.stageReviewMode && !state.homeworkId) {
    if (LEVEL_FLOW.includes(state.level) && !isLevelUnlocked(state.book, state.level)) {
      showAlert(nextLockedLevelMessage(state.book, state.level) || 'المستوى مقفل');
      return;
    }
  }
  const qs = getQuestionsForGame();
  if (!qs.length) {
    const counts = getBookQuestionCounts(state.book);
    const needFull = !QUESTION_BOOKS.every((b) => bookLoadState[b])
      || ((state.level === 'hard' || state.level === 'medium') && (counts[state.level] || 0) === 0);
    if (needFull) {
      if (typeof showToast === 'function') showToast('جاري تحميل الأسئلة الكاملة…', 'ok');
      const ok = await refreshFullQuestionBank({ quiet: true });
      updateLevelCounts();
      const qs2 = getQuestionsForGame();
      if (qs2.length) {
        clearCountdown();
        startGame();
        return;
      }
      if (!ok) {
        showAlert('البنك الكامل لم يكتمل بعد. اضغط/ي «تحديث» ثم حاول مجدداً.');
        return;
      }
    }
    if (!state.useManualRange && LEVEL_FLOW.includes(state.level)) {
      const { done, total, solved } = getTierProgress(state.book, state.level);
      if (done) {
        showAlert('أنهيت أسئلة هذا المستوى! الأسئلة المحلولة لن تعود تلقائياً. اضغط «مراجعة ما حلّيته» إذا أردت التدريب عليها، أو انتقل لمستوى آخر.');
      } else if (!total) {
        showAlert('لا توجد أسئلة لهذا المستوى. جرّب/ي كتاباً آخر.');
      } else if (solved > 0 && total - solved === 0) {
        showAlert('لا توجد أسئلة متبقية. اضغط مراجعة أو غيّر المستوى.');
      } else {
        showAlert('لا توجد أسئلة متبقية لهذه الجولة. صغّر العدد أو حدّث/ي البنك.');
      }
    } else {
      showAlert('لا توجد أسئلة لهذا الاختيار. جرّب/ي كتاباً أو مستوى آخر.');
    }
    return;
  }
  // Skip 3-2-1 overlay — start questions immediately.
  clearCountdown();
  startGame();
}

function startGame() {
  if (isRealGameLocked()) {
    showRealGameLockedAlert();
    return;
  }
  state.questions = getQuestionsForGame();
  if (state.questions.length === 0) { showAlert('لا توجد أسئلة لهذا الاختيار.'); return; }
  if (!state.useManualRange && !state.homeworkId) {
    // qFrom set by getQuestionsForStageGame
  } else {
    state.qFrom = parseInt(document.getElementById('q-from-input')?.value, 10) || 1;
  }
  if (typeof trackEvent === 'function') trackEvent('game_start', { book: state.book, level: state.level, training: trainingMode, stage: state.activeStageNum, review: state.stageReviewMode });
  state.idx = 0; state.score = 0; state.hearts = 5; state.streak = 0;
  state.maxStreak = 0; state.correct = 0; state.wrong = 0; state.wrongLog = []; state.answered = false;
  state.answerLog = [];
  state.gameEnded = false; state.gameEnding = false;
  clearTimeout(gameEndTimer);
  state.total = state.questions.length;
  renderHearts(); updateScore(); updateProgress();
  document.getElementById('feedback').classList.remove('show', 'ok', 'bad');
  setFeedbackPanelOpen(false);
  setFeedbackContinueVisible(true);
  document.getElementById('training-bar').style.display = trainingMode ? 'block' : 'none';
  document.getElementById('show-answer-btn').style.display = 'none';
  document.getElementById('res-xp-earned').style.display = 'none';
  updateStageGameBadge();
  unlockTtsAudio();
  show('game');
  renderQ();
  // Warm the whole round into IDB + SW cache so audio survives going offline mid-game.
  if (navigator.onLine !== false) {
    void warmRoundAudioForOffline(state.questions, { notify: false });
  }
}

function renderQ() {
  if (state.idx >= state.questions.length) { void endGame(); return; }
  stopSpeaking();
  const q = state.questions[state.idx];
  void warmQuestionSpeech(q);
  const prior = state.answerLog?.[state.idx] || null;
  state.answered = !!prior;
  document.getElementById('show-answer-btn').style.display = 'none';
  const stagePrefix = (!state.homeworkId && !state.useManualRange && LEVEL_FLOW.includes(state.level))
    ? `${LEVEL_LABELS_AR[state.level] || ''} — `
    : '';
  document.getElementById('q-num').textContent =
    `${stagePrefix}سؤال ${state.qFrom + state.idx} — ${state.idx + 1}/${state.total}`;
  updateStageGameBadge();
  // Show bare text (no tashkeel) — speech maps keep harakat for TTS only.
  const qEl = document.getElementById('q-text');
  const paintQuestionText = () => {
    qEl.textContent = displayFieldText(q, 'q', q.q) || stripArabicDiacritics(q.q || '');
  };
  paintQuestionText();
  // No re-paint with speech-map tashkeel — user asked for undiacritized display.
  document.getElementById('q-book-badge').textContent = BOOK_LABELS[q.book] || q.book;
  document.getElementById('q-type-badge').style.display = q.type === 'tf' ? 'inline-block' : 'none';
  updateVoiceUI();
  updateProgress();
  const grid = document.getElementById('ans-grid');
  grid.innerHTML = '';
  if (q.type === 'tf') {
    state.displayAnswerOrder = null;
    ['صح ✓', 'خطأ ✗'].forEach((txt, i) => {
      appendAnswerOption(grid, txt, (i === 0) === q.tf, i === 0 ? 0 : 3, q, null);
    });
  } else {
    const order = (prior?.displayAnswerOrder?.length
      ? prior.displayAnswerOrder.slice()
      : shuffleArr([0, 1, 2, 3].slice(0, (q.a || []).length)));
    state.displayAnswerOrder = order.slice();
    order.forEach((i, orderIdx) => {
      appendAnswerOption(grid, q.a[i], i === q.c, orderIdx, q, `a${i}`);
    });
  }
  updateQuranReciteSlot(q);
  // Start current-question audio fetch immediately so speakQuestion joins the
  // in-flight request (shared cache) instead of waiting cold on Azure (~1.2s).
  void warmQuestionSpeech(q);
  const nextQ = state.questions[state.idx + 1];
  if (nextQ) void prefetchHybridSpeechForQuestion(nextQ);
  if (prior) {
    clearQuestionTimer();
    setTimerVisible(false);
    applyAnsweredStateToGrid(prior);
    reopenFeedbackForPrior(q, prior);
  } else {
    document.getElementById('feedback').classList.remove('show', 'ok', 'bad');
    setFeedbackPanelOpen(false);
    document.getElementById('fb-self-correct').style.display = 'none';
    startQuestionTimer();
    questionShownAt = Date.now();
    // Speak only AFTER the question is painted and visible (never before the user sees it).
    const askIdx = state.idx;
    const askId = q.id;
    if (voiceOn) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (!voiceOn) return;
            if (state.idx !== askIdx || state.questions[state.idx]?.id !== askId) return;
            if (!document.getElementById('game')?.classList.contains('active')) return;
            const painted = document.getElementById('q-text')?.textContent?.trim();
            if (!painted) return;
            speakQuestion();
          }, 400);
        });
      });
    }
  }
  updatePrevQBtn();
  persistGameSession();
}

function rememberAnswer(isOk, picked) {
  if (!Array.isArray(state.answerLog)) state.answerLog = [];
  state.answerLog[state.idx] = {
    isOk: !!isOk,
    picked: String(picked || ''),
    displayAnswerOrder: state.displayAnswerOrder ? state.displayAnswerOrder.slice() : null,
  };
}

function applyAnsweredStateToGrid(prior) {
  document.querySelectorAll('#ans-grid .ans-btn').forEach((b) => {
    b.disabled = true;
    const isCorrectBtn = b.dataset.correct === '1';
    if (isCorrectBtn) b.classList.add('correct');
    if (prior.isOk && isCorrectBtn) b.setAttribute('aria-pressed', 'true');
    const label = b.dataset.raw || b.textContent;
    if (!prior.isOk && prior.picked
      && normalizeArabicForMatch(label) === normalizeArabicForMatch(prior.picked)) {
      b.classList.add('wrong');
      b.setAttribute('aria-pressed', 'true');
    }
  });
}

function reopenFeedbackForPrior(q, prior) {
  const fb = document.getElementById('feedback');
  const n = state.userName || DEFAULT_PLAYER;
  const selfBox = document.getElementById('fb-self-correct');
  if (selfBox) selfBox.style.display = 'none';
  if (prior.isOk) {
    fb.className = 'feedback show ok';
    document.getElementById('fb-icon').textContent = '✅';
    document.getElementById('fb-title').textContent = `مراجعة السؤال ${arabicNum(state.idx + 1)} — إجابة صحيحة`;
    mountAnswerFeedback(q, buildAnswerFeedbackHtml(q, true));
    state.lastFeedbackWrong = '';
    updateInRoundReviewBtn(false);
  } else {
    fb.className = 'feedback show bad';
    document.getElementById('fb-icon').textContent = '🤔';
    document.getElementById('fb-title').textContent = `مراجعة السؤال ${arabicNum(state.idx + 1)} — إجابة خاطئة`;
    mountAnswerFeedback(q, buildAnswerFeedbackHtml(q, false, prior.picked));
    state.lastFeedbackWrong = prior.picked || '';
    updateInRoundReviewBtn(true);
  }
  setFeedbackPanelOpen(true);
  setFeedbackContinueVisible(true);
  updateFeedbackSpeakBtn(true);
  updatePrevQBtn();
}

function updatePrevQBtn() {
  const show = state.idx > 0 && !state.gameEnded && !state.gameEnding;
  ['btn-prev-q', 'btn-prev-q-top'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
}

function prevQ() {
  if (state.gameEnding || state.gameEnded) return;
  if (state.idx <= 0) return;
  stopSpeaking();
  updateFeedbackSpeakBtn(false);
  state.lastFeedbackWrong = '';
  state.idx--;
  renderQ();
  prefetchUpcomingQuran(state.idx);
  prefetchUpcomingTts(state.idx);
}

function nextQ() {
  if (state.gameEnding || state.gameEnded) return;
  stopSpeaking();
  updateFeedbackSpeakBtn(false);
  updateInRoundReviewBtn(false);
  state.lastFeedbackWrong = '';
  state.idx++;
  document.getElementById('feedback').classList.remove('show', 'ok', 'bad');
  setFeedbackPanelOpen(false);
  document.getElementById('fb-self-correct').style.display = 'none';
  document.getElementById('fb-exp').textContent = '';
  if (state.idx >= state.questions.length) {
    void endGame();
  } else {
    renderQ();
    prefetchUpcomingQuran(state.idx);
    prefetchUpcomingTts(state.idx);
  }
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
  const pickedText = btn?.textContent || '';
  rememberAnswer(isOk, isOk ? pickedText : pickedText);
  if (q?.id && typeof recordQuestionAttempt === 'function') recordQuestionAttempt(q.id, isOk);

  if (isOk) {
    btn.classList.add('correct');
    btn.setAttribute('aria-pressed', 'true');
    selfBox.style.display = 'none';
    if (!trainingMode) {
      state.streak++; state.correct++;
      markQuestionSolvedInStage(q?.id);
      const pts = 10 + Math.min(state.streak * 2, 20);
      state.score += pts;
      if (state.streak > state.maxStreak) state.maxStreak = state.streak;
      updateScore();
      showXpFloat(pts, btn);
      if (state.streak >= 3) showCombo(state.streak);
      playSound('correct');
    }
    launchCorrectBurst();
    fb.className = 'feedback show ok';
    document.getElementById('fb-icon').textContent = '🎉';
    document.getElementById('fb-title').textContent = ENCOURAGE_OK[Math.floor(Math.random() * ENCOURAGE_OK.length)];
    mountAnswerFeedback(q, buildAnswerFeedbackHtml(q, true));
    setFeedbackPanelOpen(true);
    setFeedbackContinueVisible(true);
    state.lastFeedbackWrong = '';
    updateFeedbackSpeakBtn(true);
    updateInRoundReviewBtn(false);
    updatePrevQBtn();
    maybeSpeakFeedbackAfterAnswer(q, '');
  } else {
    btn.classList.add('wrong');
    btn.setAttribute('aria-pressed', 'true');
    const picked = pickedText;
    if (!trainingMode) {
      state.wrongLog.push({ q, index: state.idx, picked });
    }
    if (!trainingMode) {
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
        updatePrevQBtn();
        return;
      }
    } else if (trainingMode) {
      playSound('wrong');
    }
    fb.className = 'feedback show bad';
    document.getElementById('fb-icon').textContent = '🤔';
    document.getElementById('fb-title').textContent =
      `${n}، إجابة خاطئة — راجع/يها لاحقاً في «مراجعة الأخطاء»`;
    if (trainingMode) {
      selfBox.style.display = 'block';
      selfBox.innerHTML = '<p style="font-size:0.85em;margin-bottom:8px;color:var(--text-soft);">وضع التدريب — لا يُحسب ضدك</p><button type="button" class="btn btn-blue btn-sm" style="width:100%;" onclick="revealAnswer()">💡 إظهار الإجابة والاستشهاد</button>';
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
    updateInRoundReviewBtn(true);
    updatePrevQBtn();
    maybeSpeakFeedbackAfterAnswer(q, picked);
  }
  persistGameSession();
}

function updateReviewButtons() {
  const show = state.wrongLog.length > 0;
  ['btn-review-mistakes', 'btn-review-mistakes-go'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'inline-block' : 'none';
  });
}

function updateInRoundReviewBtn(_forceShow) {
  // Mid-round review removed — mistakes are reviewed only at session end.
}

function startInRoundReview() {
  // no-op: use end-of-session «مراجعة الأخطاء» instead
}

function startReview(from) {
  if (!state.wrongLog.length) return;
  state.reviewIdx = 0;
  if (from) {
    state.reviewReturn = from;
  } else if (document.getElementById('game')?.classList.contains('active')) {
    state.reviewReturn = 'game';
  } else {
    state.reviewReturn = document.getElementById('gameover')?.classList.contains('active') ? 'gameover' : 'results';
  }
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
  const verseKey = getPrimaryVerseKeyForQuestion(q);
  if (verseKey) void fillAyahTextElements(reviewExp, verseKey, { preferSnippet: true, compact: false });
  const actions = document.getElementById('review-voice-actions');
  if (actions) {
    actions.innerHTML = `
      <button type="button" class="btn btn-white btn-sm" id="btn-review-speak">🔊 اقرأ الاستشهاد</button>
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
  const ret = state.reviewReturn || 'results';
  show(ret);
  if (ret === 'game') {
    const fb = document.getElementById('feedback');
    if (fb?.classList.contains('show')) {
      setFeedbackPanelOpen(true);
    }
  }
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
  const pct = state.correct / Math.max(1, state.total);
  const isTraining = trainingMode;

  if (!isTraining) {
    localStorage.setItem('lastStats', JSON.stringify({ score: state.score, streak: state.maxStreak }));

    const p = ensureProgress();
    p.totalGames = (p.totalGames || 0) + 1;
    p.totalCorrect = (p.totalCorrect || 0) + state.correct;
    if (state.maxStreak > (p.bestStreak || 0)) p.bestStreak = state.maxStreak;
    if (state.score > (p.bestScore || 0)) p.bestScore = state.score;
    if (pct >= 0.5) {
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
    if (!state.useManualRange && !state.homeworkId && LEVEL_FLOW.includes(state.level)) {
      syncStageCompletion(state.activeStageNum);
      scheduleTierProgressCloudPush();
      updateLevelCounts();
    }
    updateReviewButtons();
    show('gameover');
  } else {
    const stars = renderStars(pct);
    document.getElementById('res-icon').textContent = isTraining ? '🏋️' : (stars === 3 ? '🏆' : stars >= 2 ? '🎉' : '📚');
    document.getElementById('res-title').textContent = isTraining ? 'انتهى التدريب' : (stars === 3 ? 'مذهلة!' : stars >= 2 ? 'أحسنت!' : 'جيد!');
    let resSub = isTraining ? 'وضع التدريب — لا يُحسب في النقاط أو اللوحة' : (stars === 3 ? 'نتيجة ذهبية! أنت بطل/ة! 🌟' : stars >= 2 ? 'نتيجة رائعة! واصل/ي التعلّم 🌟' : 'واصل/ي المحاولة، أنت قادر/ة! 💪');
    if (!isTraining && !state.useManualRange && !state.homeworkId && LEVEL_FLOW.includes(state.level)) {
      // Keep legacy stage markers in sync for older progress blobs.
      syncStageCompletion(state.activeStageNum);
      const { solved, total, done, unlockReady, unlockNeed } = getTierProgress(state.book, state.level);
      const label = LEVEL_LABELS_AR[state.level] || state.level;
      if (done) {
        if (state.level === 'easy') {
          resSub = `🎉 أنهيت المستوى السهل (${arabicNum(total)})! المتوسط مفتوح — اضغط/ي الزر أدناه للبدء`;
        } else if (state.level === 'medium') {
          resSub = `🎉 أنهيت المستوى المتوسط (${arabicNum(total)})! الصعب مفتوح — اضغط/ي الزر أدناه للبدء`;
        } else {
          resSub = `🎉 أنهيت المستوى الصعب (${arabicNum(total)})! أحسنت — المسار مكتمل`;
        }
        state.stageReviewMode = false;
      } else if (unlockReady && state.level === 'easy' && isLevelUnlocked(state.book, 'medium')) {
        resSub = `🔓 فُتح المتوسط! (حللتَ/ِ ${arabicNum(solved)} من ${arabicNum(total)} في السهل) — يمكنك البدء فيه الآن`;
      } else if (unlockReady && state.level === 'medium' && isLevelUnlocked(state.book, 'hard')) {
        resSub = `🔓 فُتح الصعب! (حللتَ/ِ ${arabicNum(solved)} من ${arabicNum(total)} في المتوسط) — يمكنك البدء فيه الآن`;
      } else if (!state.stageReviewMode) {
        const left = Math.max(0, unlockNeed - solved);
        const nextHint = state.level === 'hard' || unlockReady
          ? ''
          : ` — متبقي ${arabicNum(left)} لفتح المستوى التالي`;
        resSub = `✅ تقدّم ${label}: ${arabicNum(solved)}/${arabicNum(total)}${nextHint}`;
      }
      scheduleTierProgressCloudPush();
      updateLevelCounts();
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
    updateNextLevelButton();
    show('results');
  }

  if (window.AlhudaPlatform?.onGameEndHook) await AlhudaPlatform.onGameEndHook();
}

function shuffleArr(arr) {
  const a = [...(arr || [])];
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
    c.innerHTML += `<span class="heart-pip${i >= state.hearts ? ' is-lost' : ''}" aria-hidden="true">❤️</span>`;
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
let lbCache = { day: null, week: null, month: null };
let topLeaderLoading = false;
const LB_CACHE_MS = 45000;

function invalidateLbCache() {
  lbCache = { day: null, week: null, month: null };
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
    .limit(1000);
  if (error) return cached?.ranked || [];
  const ranked = aggregateTotalPoints(scores);
  const userIds = [...new Set(ranked.map(s => s.user_id).filter(Boolean))].slice(0, 120);
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
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
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
  else if (period === 'month') end.setMonth(end.getMonth() + 1);
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
  if (period === 'month') {
    if (days > 0) return `يتجدد لوحة الشهر خلال ${days} يوم`;
    return `يتجدد لوحة الشهر خلال ${hours} ساعة`;
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
  const monthEl = document.getElementById('top-leader-month');
  if (!dayEl || !weekEl) return;
  if (topLeaderLoading) return;
  topLeaderLoading = true;
  const hadCache = lbCache.day && lbCache.week && (!monthEl || lbCache.month) && !forceRefresh;
  if (!hadCache) {
    dayEl.textContent = 'جاري التحميل...';
    weekEl.textContent = 'جاري التحميل...';
    if (monthEl) monthEl.textContent = 'جاري التحميل...';
  }
  try {
    const [dayRank, weekRank, monthRank] = await Promise.all([
      fetchLeaderboardRankings('day', forceRefresh),
      fetchLeaderboardRankings('week', forceRefresh),
      monthEl ? fetchLeaderboardRankings('month', forceRefresh) : Promise.resolve([]),
    ]);
    dayEl.textContent = formatTopLeaderLine(dayRank[0]);
    weekEl.textContent = formatTopLeaderLine(weekRank[0]);
    if (monthEl) monthEl.textContent = formatTopLeaderLine(monthRank[0]);
  } catch (e) {
    dayEl.textContent = 'تعذّر التحميل';
    weekEl.textContent = 'تعذّر التحميل';
    if (monthEl) monthEl.textContent = 'تعذّر التحميل';
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
      : lbPeriod === 'month'
        ? 'لا توجد نتائج هذا الشهر بعد. كن/ي أول/ة! 🌟'
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
      : period === 'month'
        ? 'مجموع نقاط الشهر — تُصفّر مع بداية كل شهر'
        : 'مجموع نقاط الأسبوع — تُصفّر كل أحد';
  }

  const list = document.getElementById('lb-list');
  if (!list) return;

  if (!state.user && !LOGIN_LOCKED) {
    list.innerHTML = '<p style="text-align:center;color:var(--text-soft);padding:20px 0;">ادخل/ي باسمك لعرض لوحة المتصدرين 🔐</p>';
    return;
  }

  const cached = lbCache[period];
  if (!forceRefresh && cached && Date.now() - cached.at < LB_CACHE_MS) {
    renderLeaderboardList(cached.ranked, cached.nameMap);
    return;
  }

  list.innerHTML = '<p style="text-align:center;color:var(--text-soft);padding:20px 0;">جاري التحميل...</p>';

  const ranked = await fetchLeaderboardRankings(period, forceRefresh);
  if (!ranked.length && !lbCache[period]) {
    list.innerHTML = '<p style="text-align:center;color:var(--coral);padding:20px 0;">تعذّر تحميل اللوحة — تأكد/ي من الدخول بالاسم</p>';
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
    <p style="text-align:center;color:var(--text-soft);font-size:0.8em;margin-top:4px;">الاسم الأساسي: ${escapeHtml(getPrimaryName() || state.userName)}</p>
    <div class="profile-stat-row">
      <div class="profile-stat"><div class="val">${totalGames}</div><div class="lbl">ألعاب</div></div>
      <div class="profile-stat"><div class="val">${bestScore}</div><div class="lbl">أفضل نتيجة</div></div>
      <div class="profile-stat"><div class="val">${p.xp||0}</div><div class="lbl">خبرة</div></div>
    </div>
    <div style="display:grid;gap:8px;margin:12px 0;">
      <button type="button" class="btn btn-white btn-sm" onclick="setAsPrimaryName()">⭐ اجعل هذا الاسم الأساسي</button>
      <button type="button" class="btn btn-white btn-sm" onclick="switchLoginName()">الدخول باسم آخر</button>
      <button type="button" class="btn btn-white btn-sm" onclick="syncProgressAcrossDevices()">☁️ مزامنة التقدّم بين الأجهزة</button>
      <button type="button" class="btn btn-white btn-sm" onclick="exportProgressBackup()">⬇️ تصدير نسخة احتياطية</button>
      <button type="button" class="btn btn-white btn-sm" onclick="importProgressBackup()">⬆️ استيراد تقدّم</button>
      <button type="button" class="btn btn-white btn-sm" onclick="wipeMyProgress()">🧹 تصفير التقدّم والبدء من جديد</button>
      <button type="button" class="btn btn-white btn-sm" onclick="logout()">🚪 خروج</button>
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
    if (title) title.textContent = 'الدخول مغلق مؤقتاً';
    if (notice) { notice.hidden = false; notice.style.display = ''; notice.textContent = 'الدخول مغلق مؤقتاً'; }
    updateLoginQuestionHint();
  } else {
    if (block) block.style.display = '';
    if (divider) divider.style.display = '';
    if (features) features.style.display = '';
    nameInput.disabled = false;
    nameInput.removeAttribute('aria-disabled');
    nameInput.placeholder = 'اكتب/ي اسمك هنا...';
    loginBtn.disabled = false;
    loginBtn.removeAttribute('aria-disabled');
    loginBtn.textContent = 'دخول';
    block?.classList.remove('is-locked');
    if (title) title.textContent = 'اكتب/ي اسمك للدخول';
    if (notice) { notice.hidden = true; notice.style.display = 'none'; }
    if (loginBtn) loginBtn.style.display = 'none';
  }
}

async function restoreSession() {
  const client = getDb();
  if (LOGIN_LOCKED) {
    await client?.auth.signOut().catch(() => {});
    state.user = null;
    state.userType = '';
    state.userName = '';
    return false;
  }
  if (!client) return false;
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return false;
    const { data: profile, error } = await client.from('profiles').select('name,role').eq('id', session.user.id).maybeSingle();
    if (error || !profile || profile.role !== 'student') {
      await client.auth.signOut().catch(() => {});
      return false;
    }
    state.user = session.user;
    state.userType = 'student';
    state.userName = profile.name || localStorage.getItem('savedName') || DEFAULT_PLAYER;
    const savedName = localStorage.getItem('savedName');
    if (savedName && profile.name && profile.name !== savedName) {
      await client.auth.signOut().catch(() => {});
      return false;
    }
    localStorage.setItem('savedName', state.userName);
    localStorage.setItem('demoDone', '1');
    if (!getPrimaryName()) setPrimaryName(state.userName);
    adoptProgressForName(state.userName);
    if (window.AlhudaPlatform?.syncUserClassFromDb) await AlhudaPlatform.syncUserClassFromDb();
    if (window.AlhudaPlatform?.syncWrongQuestionsFromDb) await AlhudaPlatform.syncWrongQuestionsFromDb();
    if (typeof pullTierProgressFromCloud === 'function') await pullTierProgressFromCloud();
    void syncPendingScores();
    void refreshFullQuestionBank({ quiet: true });
    goHome();
    return true;
  } catch (e) {
    console.warn('restoreSession skipped (cloud unavailable):', e);
    return false;
  }
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
  // One-time: turn answer read-aloud on for everyone (was default-off).
  // V3: re-enable after Fish full-bank bake so every option is spoken again.
  if (localStorage.getItem('voiceReadAnswersMigratedV3') !== '1') {
    localStorage.setItem('voiceReadAnswers', 'true');
    localStorage.setItem('voiceReadAnswersMigratedV3', '1');
    localStorage.setItem('voiceReadAnswersMigratedV2', '1');
  }
  voiceReadAnswers = localStorage.getItem('voiceReadAnswers') !== 'false';
  if (localStorage.getItem('voiceOn') == null) localStorage.setItem('voiceOn', 'true');
  if (localStorage.getItem('voiceReadAnswers') == null) localStorage.setItem('voiceReadAnswers', 'true');
  updateVoiceUI();
  // Start diacritics map immediately (not idle) so the first speak never waits
  // on a ~670 KB script download after the question is already on screen.
  void ensureSpeechMapsLoaded();
  const savedName = getPrimaryName() || localStorage.getItem('savedName');
  const loginScreenActive = document.getElementById('login-screen')?.classList.contains('active');
  if (savedName && loginScreenActive && !LOGIN_LOCKED) document.getElementById('login-name').value = savedName;
  const switchHint = document.getElementById('login-switch-hint');
  if (switchHint && getPrimaryName()) {
    switchHint.hidden = false;
    switchHint.textContent = `الاسم الأساسي: ${getPrimaryName()}`;
  }
  applyLoginLockUI();
  void refreshTtsProviderBadge();
  // Defer Quran warm until demo/game start — avoid competing with first paint.
  window.addEventListener('offline', () => applyOfflineVoicePolicy());
  if (navigator.onLine === false) applyOfflineVoicePolicy();
  document.getElementById('login-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !LOGIN_LOCKED) {
      clearTimeout(loginNameDebounceTimer);
      doLogin();
    }
  });
  document.getElementById('login-name')?.addEventListener('input', () => {
    scheduleAutoLoginFromNameInput();
  });
  document.getElementById('btn-login')?.addEventListener('click', () => {
    if (!LOGIN_LOCKED) doLogin();
  });
  window.addEventListener('pagehide', () => persistGameSession());
})();
