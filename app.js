
const SUPABASE_URL = 'https://smcyaqwxbmhshhhhdece.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4OhSsWwIfV4QxGRf1fujLA_TjE111eU';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BOOK_LABELS = { tawheed:'كتاب التوحيد', usool:'الأصول الثلاثة', nawawi:'الأربعون النووية', merge3:'الكتب الثلاثة' };
const BOOK_BTN_MAP = { tawheed:'tawheed', usool:'usool', nawawi:'nawawi', merge3:'merge' };
const LEVEL_LABELS = { easy:'سهل', medium:'متوسط', hard:'صعب', all:'كل المستويات' };
const DEMO_COUNT = 5;
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
let state = { user:null, userType:'', userName:'', userEmail:'', book:'tawheed', level:'easy', questions:[], idx:0, score:0, hearts:5, streak:0, maxStreak:0, correct:0, wrong:0, answered:false, total:20, bankVersion:0, challengeMode:false, challengeCode:'', demoMode:false, wrongLog:[], reviewIdx:0, reviewReturn:'results', homeworkId:null };
let loginTab = 'student', trainingMode = false, soundOn = true, lastGameXp = 0, feedbackRating = 0, pendingLoginAfterDemo = false, loginInProgress = false;
let lastFeedbackItems = [], countdownTimer = null, adminFeedbackLoading = false;

const FEEDBACK_RATING_LABELS = {
  5: { emoji: '😍', label: 'أعجبني' },
  2: { emoji: '😕', label: 'يحتاج تحسين' },
  1: { emoji: '😞', label: 'ما أعجبني' },
};
const DEMO_FALLBACK = [
  { id:'demo1', book:'tawheed', type:'tf', q:'التوحيد هو إفراد الله تعالى بالعبادة.', tf:true, exp:'نعم! التوحيد هو إفراد الله في الربوبية والألوهية والأسماء والصفات.' },
  { id:'demo2', book:'usool', type:'mc', q:'ما هي الأصول الثلاثة؟', a:['معرفة الرب ومعرفة الدين ومعرفة نبيك','الصلاة والزكاة والصوم','الإيمان والإحسان والإخلاص','القرآن والسنة والإجماع'], c:0, exp:'الأصول الثلاثة: معرفة الرب، ومعرفة الدين بمعرفة دينك، ومعرفة نبيك محمد ﷺ.' },
  { id:'demo3', book:'nawawi', type:'tf', q:'أول حديث في الأربعون النووية: «إنما الأعمال بالنيات».', tf:true, exp:'صحيح! وهو أول حديث في الأربعون النووية للإمام النووي رحمه الله.' },
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
const QUOTES = [
  'من سار على الدرب وصل ✨',
  'طلب العلم فريضة على كل مسلم/ة 📖',
  'العلم نور والجهل ظلام 🌟',
  'واصل/ي التعلّم فأنت قادر/ة! 💪',
  'كل سؤال يقربك من المعرفة 📚',
  'الصبر مفتاح الفرج 🗝️',
];
const ENCOURAGE_OK = ['ممتاز! 🌟', 'أحسنت! 🎉', 'رائع! ⭐', 'مبدع/ة! 💫', 'بارك الله فيك! 🤲'];
const ENCOURAGE_BAD = ['لا بأس! حاول/ي مرة أخرى 💪', 'تعلّمنا من الخطأ 📖', 'واصل/ي! أنت قادر/ة 🌱'];
const DEFAULT_PLAYER = 'بطل/ة';

function feedbackRatingLabel(rating) {
  const r = FEEDBACK_RATING_LABELS[rating];
  return r ? `${r.emoji} ${r.label}` : `💬 ${rating}`;
}
async function syncPendingFeedback() {
  const backup = JSON.parse(localStorage.getItem('feedbackBackup') || '[]');
  let changed = false;
  for (const item of backup) {
    if (item.cloudSaved || item.id) continue;
    const ok = await saveFeedbackToCloud(buildFeedbackInsertRow(item));
    if (ok) {
      item.cloudSaved = true;
      changed = true;
    }
  }
  if (changed) localStorage.setItem('feedbackBackup', JSON.stringify(backup.slice(0, 200)));
  return backup;
}

function buildFeedbackInsertRow(item) {
  return {
    user_name: item.user_name,
    user_email: item.user_email || null,
    user_id: item.user_id || null,
    rating: item.rating,
    message: item.message,
    source: item.source || 'demo',
  };
}
async function saveFeedbackToCloud(row) {
  const { error } = await db.from('feedback').insert(row);
  if (error) console.warn('feedback insert:', error);
  return !error;
}

function getProgress() {
  return JSON.parse(localStorage.getItem('playerProgress') || '{}');
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

function buildDemoQuestions() {
  const picked = [];
  for (const book of ['tawheed', 'usool', 'nawawi']) {
    const easy = getOrderedPool(book, 'easy');
    const med = getOrderedPool(book, 'medium');
    picked.push(...easy.slice(0, 4), ...med.slice(0, 2));
  }
  const seen = new Set();
  const uniq = [];
  for (const q of picked) {
    if (!seen.has(q.id)) { seen.add(q.id); uniq.push(q); }
  }
  if (uniq.length >= DEMO_COUNT) return uniq.slice(0, DEMO_COUNT);
  const out = [...uniq];
  for (const q of DEMO_FALLBACK) {
    if (out.length >= DEMO_COUNT) break;
    if (!seen.has(q.id)) { seen.add(q.id); out.push(q); }
  }
  return out.slice(0, DEMO_COUNT);
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
  document.getElementById('levelup-title').textContent = title;
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
  const last = JSON.parse(localStorage.getItem('lastStats') || '{}');
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
async function shareScore() {
  const text = '🎮 ' + state.userName + ' حصل/ت على ' + state.score + ' نقطة في المكتبة الثلاثية! ⭐\nجرّب/ي أنت أيضاً!';
  if (navigator.share) {
    try { await navigator.share({ title: 'المكتبة الثلاثية', text }); return; } catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('share-btn').textContent = '✅ تم النسخ!';
    setTimeout(() => { document.getElementById('share-btn').textContent = '📤 شارك/ي نتيجتك'; }, 2000);
  } catch (e) { alert(text); }
}

/* ── Demo & Feedback ── */
function getCorrectAnswerText(q) {
  if (q.type === 'tf') return q.tf ? 'صح ✓' : 'خطأ ✗';
  return q.a && q.c != null ? q.a[q.c] : '';
}
function highlightCorrectAnswer(q) {
  const btns = document.querySelectorAll('.ans-btn');
  btns.forEach((btn, i) => {
    if (q.type === 'tf') {
      const isCorrect = (i === 0) === q.tf;
      if (isCorrect) btn.classList.add('reveal-correct');
    } else if (btn.textContent === q.a[q.c]) {
      btn.classList.add('reveal-correct');
    }
  });
}
function startDemoFromLogin() {
  document.getElementById('login-err').textContent = '';
  state.userName = '';
  state.demoMode = false;
  pendingLoginAfterDemo = true;
  const demoName = document.getElementById('demo-name');
  if (demoName) demoName.textContent = DEFAULT_PLAYER;
  show('demo-intro');
}
function showDemoIntro(name) {
  const demoName = document.getElementById('demo-name');
  if (demoName) demoName.textContent = name || DEFAULT_PLAYER;
  show('demo-intro');
}
async function beginDemo() {
  state.demoMode = true;
  state.wrongLog = [];
  state.questions = buildDemoQuestions();
  state.idx = 0; state.score = 0; state.hearts = 5; state.streak = 0;
  state.maxStreak = 0; state.correct = 0; state.wrong = 0; state.answered = false;
  state.total = state.questions.length;
  document.getElementById('demo-bar').textContent = `📝 نموذج تجريبي — ${state.total} أسئلة للتجربة`;
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
  state.demoMode = false;
  document.getElementById('demo-bar').style.display = 'none';
  feedbackRating = 0;
  document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('sel'));
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
async function submitFeedback() {
  const name = (document.getElementById('feedback-name')?.value || '').trim();
  const age = (document.getElementById('feedback-age')?.value || '').trim();
  const likeText = (document.getElementById('feedback-like')?.value || '').trim();
  const improveText = (document.getElementById('feedback-improve')?.value || '').trim();
  const msgEl = document.getElementById('feedback-msg');
  const btn = document.getElementById('btn-submit-feedback');
  if (!FEEDBACK_RATING_LABELS[feedbackRating]) { msgEl.style.color = 'var(--coral)'; msgEl.textContent = 'اختار/ي تقييماً أولاً'; return; }
  if (!name) { msgEl.style.color = 'var(--coral)'; msgEl.textContent = 'اكتب/ي اسمك من فضلك'; return; }
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  try {
  const parts = [];
  if (age) parts.push(`العمر: ${age}`);
  if (likeText) parts.push(`هل أعجبك البرنامج؟\n${likeText}`);
  if (improveText) parts.push(`اقتراحات وتحسينات:\n${improveText}`);
  if (state.total) parts.push(`(النموذج: ${state.correct}/${state.total} صحيحة)`);
  const fullMsg = parts.join('\n\n') || null;
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
  const cloudSaved = await saveFeedbackToCloud(buildFeedbackInsertRow(payload));
  payload.cloudSaved = cloudSaved;
  const backup = JSON.parse(localStorage.getItem('feedbackBackup') || '[]');
  backup.unshift(payload);
  localStorage.setItem('feedbackBackup', JSON.stringify(backup.slice(0, 200)));
  if (!cloudSaved) {
    await syncPendingFeedback();
    const refreshed = JSON.parse(localStorage.getItem('feedbackBackup') || '[]');
    if (refreshed.find(x => x.localId === payload.localId)?.cloudSaved) payload.cloudSaved = true;
  }
  if (payload.cloudSaved) {
    msgEl.style.color = 'var(--emerald)';
    msgEl.textContent = '✅ وصل رأيك/ِ وتم حفظه! شكراً لمساهمتك/ِ 💚';
  } else {
    msgEl.style.color = 'var(--orange)';
    msgEl.textContent = '⚠️ حُفظ على جهازك — شغّل/ي supabase_feedback.sql في Supabase لمزامنة الآراء';
  }
  state.userName = name;
  localStorage.setItem('savedName', name);
  const loginName = document.getElementById('login-name');
  if (loginName) loginName.value = name;
  localStorage.setItem('demoDone', '1');
  } finally {
    btn.disabled = false;
    btn.textContent = 'إرسال رأيي 📨';
  }
}
async function finishDemoFlow() {
  localStorage.setItem('demoDone', '1');
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
  if (state.user) {
    goHome();
  } else {
    show('login-screen');
  }
}
function mergeFeedbackItems(server, backup) {
  const items = [...(server || [])];
  const seen = new Set(items.map(f => feedbackItemKey(f)));
  for (const f of backup || []) {
    if (f.cloudSaved || f.id) continue;
    const key = f.localId || feedbackItemKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(f);
  }
  return items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}
function feedbackItemKey(f) {
  return `${f.user_name || ''}|${f.created_at || ''}|${f.rating || ''}|${(f.message || '').slice(0, 60)}`;
}

async function showAdminFeedback() {
  if (adminFeedbackLoading) return;
  const list = document.getElementById('admin-feedback-list');
  const status = document.getElementById('admin-feedback-status');
  if (!list || !status) return;
  adminFeedbackLoading = true;
  list.innerHTML = '<p style="text-align:center;color:var(--text-soft);padding:16px;">جاري التحميل...</p>';
  try {
  const backup = await syncPendingFeedback();
  const { data, error } = await db.from('feedback').select('*').order('created_at', { ascending: false }).limit(200);
  lastFeedbackItems = mergeFeedbackItems(data, backup);
  if (!lastFeedbackItems.length) {
    list.innerHTML = '<p style="text-align:center;color:var(--text-soft);padding:20px 0;">لا توجد آراء بعد.</p>';
    status.textContent = error ? 'تعذّر الاتصال بـ Supabase — شغّل/ي supabase_feedback.sql' : '';
    return;
  }
  list.innerHTML = lastFeedbackItems.map(f => `
    <div class="feedback-item">
      <div class="fb-head">
        <span>${escapeHtml(f.user_name || 'مجهول')}</span>
        <span>${escapeHtml(feedbackRatingLabel(f.rating))}</span>
      </div>
      <div class="fb-msg">${escapeHtml(f.message || '—').replace(/\n/g, '<br>')}</div>
      <div class="fb-meta">${f.created_at ? new Date(f.created_at).toLocaleString('ar') : ''}${f.source ? ' · ' + escapeHtml(f.source) : ''}${!f.cloudSaved && !f.id ? ' · بانتظار المزامنة' : ''}</div>
    </div>`).join('');
  status.textContent = `${lastFeedbackItems.length} رأي — ${data?.length || 0} في السحابة${error ? ' (تحذير: ' + error.message + ')' : ''}`;
  } finally {
    adminFeedbackLoading = false;
  }
}

function exportFeedbackCsv() {
  if (!lastFeedbackItems.length) { alert('لا توجد آراء للتصدير. اضغط/ي «تحديث الآراء» أولاً.'); return; }
  const rows = [['الاسم','التقييم','الرأي','المصدر','التاريخ']];
  for (const f of lastFeedbackItems) {
    rows.push([
      f.user_name || '',
      feedbackRatingLabel(f.rating),
      (f.message || '').replace(/\n/g, ' '),
      f.source || '',
      f.created_at || ''
    ]);
  }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'feedback-alhuda-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
}

function toggleSettings() {
  const ov = document.getElementById('settings-overlay');
  const open = ov.classList.toggle('open');
  document.body.style.overflow = open ? 'hidden' : '';
  if (!open) document.body.classList.remove('training-active');
}
function adjustFontSize(size) {
  document.documentElement.style.setProperty('--base-font-size', size + 'px');
  document.getElementById('fs-label').textContent = size;
  localStorage.setItem('fontSize', size);
}

/* ── Data ── */
async function loadQuestions() {
  let data;
  let error;
  if (window.AlhudaPlatform?.loadQuestionsCached) {
    try {
      data = await AlhudaPlatform.loadQuestionsCached();
    } catch (e) {
      const res = await db.from('questions').select('*').eq('language', 'ar');
      data = res.data;
      error = res.error;
    }
  } else {
    const res = await db.from('questions').select('*').eq('language', 'ar');
    data = res.data;
    error = res.error;
  }
  if (error) {
    console.error(error);
    const hint = document.getElementById('login-hint');
    if (hint) hint.textContent = '⚠️ تعذّر تحميل الأسئلة — تحقق من الاتصال';
    if (typeof showToast === 'function') showToast('تعذّر تحميل الأسئلة', 'err');
    return;
  }
  if (!data?.length) {
    const hint = document.getElementById('login-hint');
    if (hint) hint.textContent = '⚠️ لا توجد أسئلة في قاعدة البيانات';
    if (typeof showToast === 'function') showToast('لا توجد أسئلة متاحة', 'err');
    return;
  }
  const fmt = { tawheed:[], usool:[], nawawi:[] };
  data.forEach(q => {
    if (!fmt[q.book]) return;
    fmt[q.book].push({
      id:q.id, book:q.book, cat:q.chapter, level:q.level, type:q.type,
      q:q.question_text, a:q.type==='mc'?q.options:null,
      c:q.type==='mc'?q.correct_index:null, tf:q.type==='tf'?q.is_true:null, exp:q.explanation
    });
  });
  for (const book of Object.keys(fmt)) {
    fmt[book].sort((a, b) => {
      const ca = chapterSortIndex(book, a.cat);
      const cb = chapterSortIndex(book, b.cat);
      if (ca !== cb) return ca - cb;
      const lvl = { easy: 0, medium: 1, hard: 2 };
      return (lvl[a.level] || 1) - (lvl[b.level] || 1);
    });
  }
  QUESTIONS = fmt;
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
  return slice;
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
  state.bankVersion++;
  updateQuestionRangeUI();
  const btn = document.getElementById('btn-start-game');
  btn.textContent = '✅ تم التحديث!';
  setTimeout(() => { btn.textContent = 'ابدأ اللعبة'; }, 2000);
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
  if (id !== 'game') clearCountdown();
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
}

function updateWelcomeStats() {
  updateWelcomeGamification();
}

function goBackFromFeature() {
  if (state.user) goHome();
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

function goHome() {
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
  if (!state.user) {
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
  if (window.AlhudaPlatform?.showOnboardingIfNeeded) AlhudaPlatform.showOnboardingIfNeeded();
}

function logout() {
  db.auth.signOut();
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
  if (loginInProgress) return;
  document.getElementById('login-err').textContent = '';
  const btn = document.getElementById('btn-login');
  const btnLabel = btn?.textContent || 'دخول 🎮';
  loginInProgress = true;
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الدخول...'; }
  try {
    const name = document.getElementById('login-name').value.trim();
    if (!name) { document.getElementById('login-err').textContent = 'اكتب/ي اسمك من فضلك'; return; }

    const { data: { session: existingSession } } = await db.auth.getSession();
    if (existingSession?.user) {
      const { data: profile } = await db.from('profiles').select('name,role').eq('id', existingSession.user.id).maybeSingle();
      if (profile?.name && profile.name !== name) {
        await db.auth.signOut();
      }
    }

    const { data, error } = await studentSignIn(name);
    if (error) {
      document.getElementById('login-err').textContent = error.message || 'تعذّر الدخول';
      if (typeof showToast === 'function') showToast('تعذّر الدخول — تحقق/ي من الاسم', 'err');
      return;
    }
    const { data: existing } = await db.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    if (existing) {
      await db.from('profiles').update({ name, role: 'student' }).eq('id', data.user.id);
    } else {
      await db.from('profiles').upsert({ id: data.user.id, name, role: 'student' });
    }
    state.user = data.user; state.userType = 'student'; state.userName = name; state.userEmail = '';
    localStorage.setItem('savedName', name);
    if (typeof trackEvent === 'function') trackEvent('login', { role: 'student' });
    if (window.AlhudaPlatform?.syncUserClassFromDb) await AlhudaPlatform.syncUserClassFromDb();
    if (window.AlhudaPlatform?.syncWrongQuestionsFromDb) await AlhudaPlatform.syncWrongQuestionsFromDb();
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
function startCountdown() {
  if (countdownTimer) return;
  if (!state.demoMode && !state.challengeMode) {
    const qs = getQuestionsForGame();
    if (!qs.length) {
      alert('لا توجد أسئلة لهذا الاختيار. جرّب/ي كتاباً أو مستوى آخر، أو غيّر/ي نطاق الأسئلة.');
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
  if (!state.demoMode) {
    if (state.challengeMode) {
      const stored = JSON.parse(localStorage.getItem('ch_q_' + state.challengeCode) || 'null');
      if (stored?.length) state.questions = stored;
      else if (!state.questions?.length) {
        alert('لا توجد أسئلة لهذا التحدي.');
        return;
      }
    } else {
      state.questions = getQuestionsForGame();
    }
  }
  if (state.questions.length === 0) { alert('لا توجد أسئلة لهذا الاختيار.'); return; }
  if (typeof trackEvent === 'function') trackEvent('game_start', { book: state.book, level: state.level, training: trainingMode });
  state.qFrom = parseInt(document.getElementById('q-from-input')?.value, 10) || 1;
  state.idx = 0; state.score = 0; state.hearts = 5; state.streak = 0;
  state.maxStreak = 0; state.correct = 0; state.wrong = 0; state.wrongLog = []; state.answered = false;
  state.total = state.questions.length;
  renderHearts(); updateScore(); updateProgress();
  document.getElementById('feedback').classList.remove('show', 'ok', 'bad');
  document.getElementById('training-bar').style.display = trainingMode ? 'block' : 'none';
  document.getElementById('demo-bar').style.display = state.demoMode ? 'block' : 'none';
  document.getElementById('show-answer-btn').style.display = 'none';
  document.getElementById('res-xp-earned').style.display = 'none';
  show('game');
  renderQ();
}

function renderQ() {
  if (state.idx >= state.questions.length) { endGame(); return; }
  const q = state.questions[state.idx];
  state.answered = false;
  document.getElementById('show-answer-btn').style.display = 'none';
  document.getElementById('q-num').textContent = (state.demoMode || state.challengeMode)
    ? `السؤال ${state.idx + 1} من ${state.total}`
    : `سؤال ${state.qFrom + state.idx} — ${state.idx + 1}/${state.total}`;
  document.getElementById('q-text').textContent = q.q;
  document.getElementById('q-book-badge').textContent = BOOK_LABELS[q.book] || q.book;
  document.getElementById('q-type-badge').style.display = q.type === 'tf' ? 'inline-block' : 'none';
  updateProgress();
  const grid = document.getElementById('ans-grid');
  grid.innerHTML = '';
  if (q.type === 'tf') {
    ['صح ✓', 'خطأ ✗'].forEach((txt, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ans-btn';
      btn.textContent = txt;
      btn.onclick = () => pick(btn, (i === 0) === q.tf);
      grid.appendChild(btn);
    });
  } else {
    shuffleArr([0,1,2,3].slice(0, (q.a || []).length)).forEach(i => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ans-btn';
      btn.textContent = q.a[i];
      btn.onclick = () => pick(btn, i === q.c);
      grid.appendChild(btn);
    });
  }
}

function pick(btn, isOk) {
  if (state.answered) return;
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
    fb.className = 'feedback show ok';
    document.getElementById('fb-icon').textContent = '🎉';
    document.getElementById('fb-title').textContent = state.demoMode ? `أحسنت يا ${n}! 🌟` : ENCOURAGE_OK[Math.floor(Math.random() * ENCOURAGE_OK.length)];
    const why = q.exp || 'إجابة صحيحة — بارك الله فيك!';
    expEl.innerHTML = `<div class="why-correct-box"><strong>✅ لماذا صحيح؟</strong>${escapeHtml(why)}</div>`;
  } else {
    btn.classList.add('wrong');
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
        setTimeout(() => endGame(), 1800);
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
      expEl.textContent = '';
    } else {
      selfBox.style.display = 'none';
      expEl.textContent = '';
    }
    document.getElementById('show-answer-btn').style.display = trainingMode ? 'block' : 'none';
  }
}

function nextQ() {
  state.idx++;
  document.getElementById('feedback').classList.remove('show', 'ok', 'bad');
  document.getElementById('fb-self-correct').style.display = 'none';
  document.getElementById('fb-exp').textContent = '';
  if (state.idx >= state.questions.length) {
    if (state.demoMode) endDemo();
    else endGame();
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
  const pickedNote = item.picked ? `<br><span style="font-size:0.85em;color:var(--coral);">إجابتك: ${escapeHtml(item.picked)}</span>` : '';
  document.getElementById('review-answer').innerHTML =
    `📌 الإجابة الصحيحة:<br><strong>${escapeHtml(getCorrectAnswerText(q))}</strong>${pickedNote}`;
  const exp = q.exp || '—';
  document.getElementById('review-exp').innerHTML =
    `<strong>📖 الدليل والشرح:</strong>${escapeHtml(exp)}`;
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
  if (q?.exp) {
    expEl.innerHTML = `<div class="why-correct-box"><strong>💡 الإجابة والشرح (تدريب)</strong>${escapeHtml(q.exp)}</div>`;
  }
  document.getElementById('show-answer-btn').style.display = 'none';
}

async function endGame() {
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

  if (state.user && !isTraining) {
    const qFrom = parseInt(document.getElementById('q-from-input').value, 10) || 1;
    const gamePoints = state.score + xpGain;
    const { error: scoreErr } = await db.from('scores').insert({
      user_id: state.user.id, book: state.book, level: state.level,
      sub_level: qFrom, score: gamePoints, correct: state.correct, total: state.total,
      played_at: new Date().toISOString()
    });
    if (scoreErr && typeof showToast === 'function') {
      showToast('تعذّر حفظ النتيجة — تحقق من الاتصال', 'err');
    } else {
      invalidateLbCache();
    }
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
function updateProgress() { document.getElementById('progress-bar').style.width = (state.idx / Math.max(1, state.total) * 100) + '%'; }
function renderHearts() {
  const c = document.getElementById('hearts');
  c.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    c.innerHTML += `<span style="font-size:16px;transition:.3s;${i >= state.hearts ? 'filter:grayscale(1) opacity(.3);transform:scale(.75);' : ''}">❤️</span>`;
  }
}

function showCombo(s) {
  const c = document.getElementById('combo');
  c.textContent = '🔥 سلسلة × ' + s + '!';
  c.classList.add('show');
  setTimeout(() => c.classList.remove('show'), 2000);
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
    .limit(1000);
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

async function restoreSession() {
  const { data: { session } } = await db.auth.getSession();
  if (!session?.user) return false;
  const { data: profile } = await db.from('profiles').select('name,role').eq('id', session.user.id).single();
  if (!profile || profile.role !== 'student') {
    await db.auth.signOut();
    return false;
  }
  state.user = session.user;
  state.userType = 'student';
  state.userName = profile.name || localStorage.getItem('savedName') || DEFAULT_PLAYER;
  localStorage.setItem('savedName', state.userName);
  if (window.AlhudaPlatform?.syncUserClassFromDb) await AlhudaPlatform.syncUserClassFromDb();
  if (window.AlhudaPlatform?.syncWrongQuestionsFromDb) await AlhudaPlatform.syncWrongQuestionsFromDb();
  if (!localStorage.getItem('demoDone')) {
    showDemoIntro(state.userName);
    return true;
  }
  goHome();
  return true;
}

/* ── Init ── */
(async function init() {
  const s = localStorage.getItem('fontSize') || 18;
  adjustFontSize(s);
  document.getElementById('font-size-slider').value = s;
  soundOn = localStorage.getItem('soundOn') !== 'false';
  document.getElementById('sound-btn').textContent = soundOn ? '🔊 الأصوات (مفعل)' : '🔇 الأصوات (صامت)';
  const savedName = localStorage.getItem('savedName');
  const loginScreenActive = document.getElementById('login-screen')?.classList.contains('active');
  if (savedName && loginScreenActive) document.getElementById('login-name').value = savedName;
  document.getElementById('login-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
})();
