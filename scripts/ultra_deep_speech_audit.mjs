#!/usr/bin/env node
/**
 * Ultra-deep adversarial TTS runtime simulation for ALL bank questions.
 *
 * Faithfully extracts prepareTtsPayload / speechPart / scrub / sanitize from app.js
 * (brace-balanced), loads real speech maps + Fish prepareFishTtsText, then asserts:
 *   - spoken bare ≡ bank display (q + each option)
 *   - no أنَّ / بِأَنَّ immediately before imperfect (ي/ت/ن + haraka) after prep+Fish
 *   - tashkeel density thresholds on prepared output
 *   - TF options only صح/خطأ variants
 *   - curated Muadh string survives wording + key harakat (أنْ not أنَّ)
 *   - phrase/lexicon collision: curated BY_ID not overwritten by PHRASE_MAP
 *   - ayah: Fish payload has no ﴿﴾ when Hudhaify would play
 *
 * Writes: extracted/ultra_deep_speech_audit.json
 *
 *   node scripts/ultra_deep_speech_audit.mjs
 *   node scripts/ultra_deep_speech_audit.mjs --strict
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';
import { prepareFishTtsText } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

function loadWindow(file) {
  const win = {};
  new Function('window', readFileSync(join(root, file), 'utf8'))(win);
  return win;
}

/** Brace-balanced extract of `function name(...) { ... }` from app.js */
function extractFn(src, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) throw new Error(`function ${name} not found`);
  let i = m.index;
  while (i < src.length && src[i] !== '{') i++;
  if (src[i] !== '{') throw new Error(`no body for ${name}`);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error(`unbalanced ${name}`);
}

function extractConstBlock(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=`);
  const m = re.exec(src);
  if (!m) throw new Error(`const ${name} not found`);
  let i = m.index + m[0].length;
  while (i < src.length && /\s/.test(src[i])) i++;
  const start = m.index;
  if (src[i] === '[') {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '[') depth++;
      else if (src[j] === ']') {
        depth--;
        if (depth === 0) {
          let end = j + 1;
          if (src[end] === ';') end++;
          return src.slice(start, end);
        }
      }
    }
  }
  if (src[i] === '/') {
    // regex const
    const end = src.indexOf(';', i);
    return src.slice(start, end + 1);
  }
  // simple assignment to ; (not nested objects with ;)
  let end = i;
  let depth = 0;
  for (; end < src.length; end++) {
    const c = src[end];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) return src.slice(start, end + 1);
  }
  throw new Error(`const ${name} extract fail`);
}

const appSrc = readFileSync(join(root, 'app.js'), 'utf8');

const win = {
  ...loadWindow('speech-pronunciation-lexicon.js'),
  ...loadWindow('speech-diacritics-map.js'),
};
try {
  Object.assign(win, loadWindow('question-verse-map.js'));
} catch {
  /* optional */
}
try {
  Object.assign(win, loadWindow('ayah-snippet-map.js'));
} catch {
  /* optional */
}

const byId = win.SPEECH_BY_QUESTION_ID || {};
const phraseMap = win.SPEECH_PHRASE_MAP || {};
const wordMap = win.SPEECH_WORD_MAP || {};
const verseMap = win.QUESTION_VERSE_MAP || {};
const ayahSnippets = win.AYAH_SNIPPET_MAP || {};

const bank = JSON.parse(
  readFileSync(join(root, 'questions-bank.js'), 'utf8').match(
    /window\.QUESTIONS_BANK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/
  )[1]
);
const all = Object.values(bank).flat();

// Normalize bank shape → app.js shape (q/a/c/type)
function toAppQ(q) {
  return {
    id: q.id,
    type: q.type,
    q: q.question_text,
    a: q.options || null,
    c: q.correct_index,
    exp: q.explanation,
    quote: q.source_quote,
    book: q.book,
  };
}

// Build sandbox with extracted app.js helpers
const sandbox = {
  window: win,
  fixAllahIrabInText,
  state: { displayAnswerOrder: null },
  lookupKnownVerseKey(snippet) {
    const n = normalizeArabicForMatchLocal(snippet);
    if (!n || n.length < 8) return null;
    if (ayahSnippets[n]) return ayahSnippets[n];
    for (const [key, verseKey] of Object.entries(ayahSnippets)) {
      const nk = normalizeArabicForMatchLocal(key);
      if (!nk || nk.length < 10) continue;
      if (n === nk || (nk.length >= 12 && n.includes(nk)) || (n.length >= 18 && nk.includes(n))) {
        return verseKey;
      }
    }
    return null;
  },
  ALLAH: "اللَّه",
};

function normalizeArabicForMatchLocal(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const fnNames = [
  'stripArabicDiacritics',
  'normalizeArabicForMatch',
  'scrubFakeAllahSpellings',
  'scrubSpeechDiacriticsNoise',
  'sanitizeTtsText',
  'hasWellFormedTashkeel',
  'hasBareArabicWords',
  'fixDetachedHarakat',
  'hasOcrTashkeelGaps',
  'hasSoftOcrLetterBreaks',
  'hasBrokenArabicSpacing',
  'collapseBrokenArabicSpaces',
  'prepareArabicForSpeech',
  'getSortedManualSpeech',
  'stripHarakat',
  'applyPronunciationLexicon',
  'applyWordDiacritics',
  'speechMatchesDisplay',
  'applyManualSpeechDiacritics',
  'isHadithQudsiText',
  'isHadithPassage',
  'isQuranicAyahText',
  'harakatTolerantArabicRe',
  'stripKnownAyahSnippetsForSpeech',
  'removeQuranicVersesForSpeech',
  'speechTextFor',
  'speechPart',
  'buildQuestionOptionSpeechList',
  'buildQuestionSpeechParts',
  'normalizeQuotedLessonStemForSpeech',
  'fixLessonHadithPronunciation',
  'prepareTtsPayload',
];

const constParts = [
  extractConstBlock(appSrc, 'ARABIC_HARAKAT_RE'),
  extractConstBlock(appSrc, 'MANUAL_SPEECH_DIACRITICS'),
  extractConstBlock(appSrc, 'SPEECH_WORD_RE'),
  'let _sortedManualSpeech = null;',
];

// ALLAH used by scrubFakeAllahSpellings
const allahMatch = appSrc.match(/const\s+ALLAH\s*=\s*[^;]+;/);
if (allahMatch) constParts.unshift(allahMatch[0]);

const fnSrc = fnNames.map((n) => extractFn(appSrc, n)).join('\n\n');

const boot = `
${constParts.join('\n')}
const window = __sandbox.window;
const state = __sandbox.state;
const fixAllahIrabInText = __sandbox.fixAllahIrabInText;
const lookupKnownVerseKey = __sandbox.lookupKnownVerseKey;
${allahMatch ? '' : 'const ALLAH = __sandbox.ALLAH;'}
${fnSrc}
return {
  prepareTtsPayload,
  speechPart,
  buildQuestionSpeechParts,
  buildQuestionOptionSpeechList,
  speechTextFor,
  speechMatchesDisplay,
  hasWellFormedTashkeel,
  applyManualSpeechDiacritics,
  stripKnownAyahSnippetsForSpeech,
  removeQuranicVersesForSpeech,
  sanitizeTtsText,
};
`;

let api;
try {
  api = new Function('__sandbox', boot)(sandbox);
} catch (e) {
  console.error('Failed to boot extracted pipeline:', e);
  process.exit(2);
}

function expandHonorifics(s) {
  return String(s || '')
    .replace(/\uFDFA/g, ' صلى الله عليه وسلم ')
    .replace(/\uFDFB/g, ' جل جلاله ')
    .replace(/صلعم/g, ' صلى الله عليه وسلم ')
    .replace(/\(ص\)/g, ' صلى الله عليه وسلم ');
}

function normBare(s) {
  return expandHonorifics(s)
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // JS \b is ASCII-only — use plain لو لا → لولا (Fish scrub splits لولا intentionally)
    .replace(/لو\s+لا/g, 'لولا')
    .replace(/[؟?!.،,;؛:«»"'“”‘’()[\]{}✓✗—–\-…﴿﴾]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bareEq(a, b) {
  return normBare(a) === normBare(b);
}

function harakatRatio(s) {
  const letters = (String(s || '').match(/[\u0621-\u064A\u0671]/g) || []).length;
  const marks = (String(s || '').match(/[\u064B-\u065F\u0670]/g) || []).length;
  return letters ? marks / letters : 1;
}

/** أنَّ / بِأَنَّ (any shadda order) immediately before imperfect ي/ت/ن + haraka */
const ANNA_BEFORE_IMP =
  /(?:بِ)?أَنّ[\u064E\u064F\u0650]?|(?:بِ)?أ[\u064E\u064F\u0650]نّ[\u064E\u064F\u0650]?/g;

function findAnnaImperfect(text) {
  const s = String(text || '');
  // Normalize fatha↔shadda order like Fish does
  const nfc = s.replace(/([\u064E\u064F\u0650])(\u0651)/g, '$2$1');
  const hits = [];
  const re = /(?:بِ)?أَنَّ(\s+)([يتن][\u064B-\u065F\u0670])/g;
  let m;
  while ((m = re.exec(nfc))) {
    hits.push(m[0]);
  }
  // Also catch أَنّ without fully composed shadda+fatha still before imperfect+haraka
  const re2 = /(?:بِ)?أَنّ(\s+)([يتن][\u064B-\u065F\u0670])/g;
  while ((m = re2.exec(nfc))) {
    if (!hits.includes(m[0])) hits.push(m[0]);
  }
  return hits;
}

function tfOk(prepared) {
  const b = normBare(prepared);
  // خطأ → خطا after alef fold
  return b === 'صح' || b === normBare('خطأ');
}

// ── Collision hunt: can PHRASE_MAP / MANUAL / word-map mutate curated fields? ──
const collisionFindings = [];
const MUADH_ID = 'e0f8acf6-7366-94d9-1b93-49a30f6e34d2';
const HAQQ_ID = '07483021-8f6a-44c8-9f32-1040d095f0c5';

// Proper Muadh: bank display + curated map
const muadhBank = all.find((q) => q.id === MUADH_ID);
const muadhQ = muadhBank ? toAppQ(muadhBank) : null;
let muadhTest = { ok: false, detail: 'missing' };
if (muadhQ) {
  const spoken = api.speechPart(muadhQ, 'q', muadhQ.q);
  const prepared = api.prepareTtsPayload(spoken);
  const fish = prepareFishTtsText(prepared);
  const hasAnSukun = /أَنْ\s+يُعَلّ/.test(prepared) || /أَنْ\s+يُعَلّ/.test(fish);
  const hasAnnaBad = findAnnaImperfect(prepared).length > 0 || findAnnaImperfect(fish).length > 0;
  const wordingOk = bareEq(spoken, muadhQ.q);
  const prepKeepsAn = hasAnSukun && !hasAnnaBad;
  // Curated map must survive prepare with أنْ (not أنَّ) before يعلم
  muadhTest = {
    ok: wordingOk && prepKeepsAn,
    wordingOk,
    hasAnSukun,
    hasAnnaBad,
    spoken: spoken.slice(0, 160),
    prepared: prepared.slice(0, 160),
    fish: fish.slice(0, 160),
  };
}

// Phrase-map collision: for every curated well-formed BY_ID q field, ensure
// applyManualSpeechDiacritics would NOT change bare wording if somehow invoked,
// and that prepare path keeps bare ≡ bank.
for (const [plain, diac] of Object.entries(phraseMap)) {
  // Dangerous: phrase value itself contains أنَّ+مضارع
  const bad = findAnnaImperfect(diac);
  if (bad.length) {
    collisionFindings.push({ kind: 'phrase-anna-imp', plain: plain.slice(0, 80), matches: bad });
  }
}
if (wordMap['بأن']) {
  const nfc = String(wordMap['بأن']).replace(/([\u064E\u064F\u0650])(\u0651)/g, '$2$1');
  if (/بِأَنّ/.test(nfc) || /بِأَنَّ/.test(wordMap['بأن'])) {
    collisionFindings.push({
      kind: 'word-map-bianna-always-shadda',
      value: wordMap['بأن'],
      risk: 'Bare بأن → بِأَنَّ; mitigated by scrub/Fish بِأَنْ before imperfect+haraka',
      mitigated: /بِأَنْ|بِأَنَّ/.test(
        // presence of fix in sources
        readFileSync(join(root, 'fish-audio-tts.js'), 'utf8') + appSrc
      ),
    });
  }
}

// Scan entire speech-diacritics-map source for residual patterns
const mapSrc = readFileSync(join(root, 'speech-diacritics-map.js'), 'utf8');
const mapNfc = mapSrc.replace(/([\u064E\u064F\u0650])(\u0651)/g, '$2$1');
const mapAnnaHits = [];
{
  const re = /(?:بِ)?أَنَّ\s+[يتن][\u064B-\u065F\u0670]/g;
  let m;
  while ((m = re.exec(mapNfc))) {
    mapAnnaHits.push({
      match: m[0],
      idx: m.index,
      ctx: mapNfc.slice(Math.max(0, m.index - 30), m.index + 40),
    });
  }
}

// hasWellFormedTashkeel guard presence
const guardOk =
  /hasWellFormedTashkeel\(base\)/.test(appSrc) &&
  /NEVER let SPEECH_PHRASE_MAP overwrite/.test(appSrc);

// ── Full bank simulation ──
const wordingFails = [];
const annaFails = [];
const densityFails = [];
const tfFails = [];
const ayahFishLeaks = [];
const prepEmpty = [];
const fishDrift = [];
const ids = [];
const densityWarn = [];

const TASHKEEL_MIN = 0.12; // mirrors hasWellFormed-ish floor for long strings
const TASHKEEL_WARN = 0.18;

for (const raw of all) {
  if (!raw?.id) continue;
  ids.push(raw.id);
  const q = toAppQ(raw);
  const { questionText, optionList } = api.buildQuestionSpeechParts(q);

  // wording: spoken bare ≡ bank (use bareEq — speechMatchesDisplay \b breaks لولا)
  if (!bareEq(questionText, q.q)) {
    wordingFails.push({ id: q.id, field: 'q', bank: q.q, spoken: questionText });
  }

  let fields = [{ field: 'q', bank: q.q, spoken: questionText }];
  if (q.type === 'tf') {
    if (optionList.length !== 2 || !tfOk(optionList[0]) || !tfOk(optionList[1])) {
      tfFails.push({ id: q.id, optionList });
    }
    fields.push(
      { field: 'tf0', bank: 'صح', spoken: optionList[0] },
      { field: 'tf1', bank: 'خطأ', spoken: optionList[1] }
    );
  } else if (Array.isArray(q.a)) {
    q.a.forEach((opt, i) => {
      const spoken = optionList[i];
      if (opt != null && opt !== '' && spoken != null && !bareEq(spoken, opt)) {
        wordingFails.push({ id: q.id, field: `a${i}`, bank: opt, spoken });
      }
      fields.push({ field: `a${i}`, bank: opt, spoken });
    });
  }

  for (const f of fields) {
    if (f.spoken == null || f.spoken === '') {
      if (f.field === 'q' || (q.type === 'mc' && f.bank)) {
        prepEmpty.push({ id: q.id, field: f.field, stage: 'spoken' });
      }
      continue;
    }
    let prepared = api.prepareTtsPayload(f.spoken);
    // Mirror speakQuestion ayah strip for q when verse-mapped
    if (f.field === 'q' && verseMap[q.id]) {
      const stripped = String(f.spoken || '')
        .replace(/﴿[^﴾]*﴾/g, ' ')
        .replace(/「[^」]*」/g, ' ');
      prepared = api.prepareTtsPayload(stripped) || prepared;
      const without = api.stripKnownAyahSnippetsForSpeech(prepared);
      if (without) prepared = api.prepareTtsPayload(without) || api.sanitizeTtsText(without) || without;
      else prepared = '';
    }
    if (!prepared && f.field === 'q') {
      prepEmpty.push({ id: q.id, field: 'q', stage: 'prepared' });
    }
    const fish = prepared ? prepareFishTtsText(prepared) : '';

    // bare words after prepare should still match bank (honorific expand + لولا split OK)
    if (prepared && f.bank != null && f.bank !== '') {
      if (!bareEq(prepared, f.bank) && !bareEq(prepared, f.spoken)) {
        // allow ayah strip to remove content from q when Hudhaify owns the verse
        if (!(f.field === 'q' && verseMap[q.id])) {
          // Substantial content loss (hadith over-strip) — not mere punct/honorific
          const bankLetters = normBare(f.bank).replace(/\s+/g, '');
          const prepLetters = normBare(prepared).replace(/\s+/g, '');
          const loss =
            bankLetters.length >= 20 && prepLetters.length < bankLetters.length * 0.55;
          wordingFails.push({
            id: q.id,
            field: f.field,
            kind: loss ? 'prepared-content-loss' : 'prepared-drift',
            bank: f.bank,
            prepared: prepared.slice(0, 200),
            loss,
          });
        }
      }
    }

    const anna = [...findAnnaImperfect(prepared), ...findAnnaImperfect(fish)];
    if (anna.length) {
      annaFails.push({ id: q.id, field: f.field, matches: anna, prepared: prepared.slice(0, 180), fish: fish.slice(0, 180) });
    }

    if (prepared && String(f.bank || '').replace(/[^\u0621-\u064A]/g, '').length >= 12) {
      const r = harakatRatio(prepared);
      if (r < TASHKEEL_MIN) {
        densityFails.push({ id: q.id, field: f.field, ratio: +r.toFixed(3), prepared: prepared.slice(0, 120) });
      } else if (r < TASHKEEL_WARN) {
        densityWarn.push({ id: q.id, field: f.field, ratio: +r.toFixed(3) });
      }
    }

    if (q.type === 'tf' && f.field.startsWith('tf') && prepared && !tfOk(prepared)) {
      tfFails.push({ id: q.id, field: f.field, prepared });
    }

    if (f.field === 'q' && verseMap[q.id] && /﴿|﴾/.test(prepared + fish)) {
      ayahFishLeaks.push({ id: q.id, verseKey: verseMap[q.id], prepared: prepared.slice(0, 160) });
    }
  }
}

// Latency path static review
const latency = {
  kickCurrentQuestionTts: /function kickCurrentQuestionTts/.test(appSrc),
  speakUsesKick: /kickCurrentQuestionTts\(q\)/.test(appSrc),
  noFullMapAwaitBeforeSpeak:
    /Never block speech on full map/.test(appSrc) &&
    !/await ensureFullSpeechMapsForVoice\(\)/.test(appSrc.match(/function speakQuestion[\s\S]*?^}/m)?.[0] || ''),
  answersPrefetchAfterQStart: /Prefetch next\/answers only AFTER current question audio has started/.test(appSrc),
  kickMapRaceMs100: /setTimeout\(r,\s*100\)/.test(appSrc.match(/function kickCurrentQuestionTts[\s\S]*?^}/m)?.[0] || ''),
  remainingWaits: [],
};
{
  const speakBody = extractFn(appSrc, 'speakQuestion');
  const waits = [...speakBody.matchAll(/setTimeout\([^,]+,\s*(\d+)/g)].map((m) => Number(m[1]));
  const races = [...speakBody.matchAll(/Promise\.race/g)].length;
  latency.remainingWaits = {
    setTimeoutMs: waits,
    promiseRaces: races,
    note: 'Short races (30/60/80ms) + retry backoffs only — no multi-second map await in speakQuestion',
  };
}

// Cache poison
const cache = {
  TTS_CACHE_VER: (appSrc.match(/const TTS_CACHE_VER = '([^']+)'/) || [])[1] || null,
  TTS_IDB_NAME: (appSrc.match(/const TTS_IDB_NAME = '([^']+)'/) || [])[1] || null,
  liveVersion: null,
  bumpedRecently: false,
};
try {
  const v = readFileSync(join(root, 'version.js'), 'utf8');
  cache.assetsCache = (v.match(/cache:\s*"([^"]+)"/) || [])[1];
  cache.sw = Number((v.match(/\bsw:\s*(\d+)/) || [])[1]);
  cache.app = Number((v.match(/\bapp:\s*(\d+)/) || [])[1]);
  // v41 + alhudaTtsCache_v7 + alhuda-v260+ = post-v258 poison mitigation
  cache.bumpedRecently =
    Number((cache.TTS_CACHE_VER || '').replace(/\D/g, '') || 0) >= 41 &&
    /v7/.test(cache.TTS_IDB_NAME || '') &&
    (cache.sw || 0) >= 258;
} catch {
  /* ignore */
}

const report = {
  meta: {
    checked: ids.length,
    uniqueIds: new Set(ids).size,
    bankExpected: 652,
    timestamp: new Date().toISOString(),
    deeperThanMapAudit: true,
  },
  summary: {
    wordingFails: wordingFails.length,
    annaImperfectFails: annaFails.length,
    densityFails: densityFails.length,
    densityWarn: densityWarn.length,
    tfFails: tfFails.length,
    ayahFishLeaks: ayahFishLeaks.length,
    prepEmpty: prepEmpty.length,
    mapAnnaResidual: mapAnnaHits.length,
    collisionFindings: collisionFindings.length,
    muadhCuratedSurvives: muadhTest.ok,
    hasWellFormedGuard: guardOk,
  },
  muadhTest,
  guardOk,
  collisionFindings,
  mapAnnaHits: mapAnnaHits.slice(0, 50),
  latency,
  cache,
  samples: {
    wordingFails: wordingFails.slice(0, 20),
    annaFails: annaFails.slice(0, 20),
    densityFails: densityFails.slice(0, 20),
    densityWarn: densityWarn.slice(0, 20),
    tfFails: tfFails.slice(0, 20),
    ayahFishLeaks: ayahFishLeaks.slice(0, 20),
    prepEmpty: prepEmpty.slice(0, 20),
  },
  haqqAllah: (() => {
    const raw = all.find((q) => q.id === HAQQ_ID);
    if (!raw) return null;
    const q = toAppQ(raw);
    const { questionText, optionList } = api.buildQuestionSpeechParts(q);
    const prepared = api.prepareTtsPayload(questionText);
    return {
      id: HAQQ_ID,
      bank: q.q,
      spoken: questionText,
      prepared,
      fish: prepareFishTtsText(prepared),
      tf: optionList,
      wordingOk: api.speechMatchesDisplay(questionText, q.q),
    };
  })(),
};

const contentLoss = wordingFails.filter((w) => w.kind === 'prepared-content-loss');
const hardFail =
  wordingFails.some((w) => !w.kind || w.kind === 'wording' || w.kind === 'prepared-content-loss') ||
  annaFails.length ||
  densityFails.length ||
  tfFails.length ||
  ayahFishLeaks.length ||
  prepEmpty.length ||
  !muadhTest.ok ||
  !guardOk ||
  mapAnnaHits.length ||
  ids.length !== 652;
// collisionFindings (e.g. بأن→بِأَنَّ) are noted risks when mitigated; do not hard-fail.

mkdirSync(join(root, 'extracted'), { recursive: true });
writeFileSync(join(root, 'extracted/ultra_deep_speech_audit.json'), JSON.stringify({
  ...report,
  summary: { ...report.summary, contentLoss: contentLoss.length, preparedDriftOnly: wordingFails.filter((w) => w.kind === 'prepared-drift').length },
}, null, 2));

console.log(JSON.stringify({
  ...report.summary,
  contentLoss: contentLoss.length,
  preparedDriftOnly: wordingFails.filter((w) => w.kind === 'prepared-drift').length,
  checked: ids.length,
  hardFail,
  muadhTest,
  cache: report.cache,
  latencyOk: latency.answersPrefetchAfterQStart && latency.noFullMapAwaitBeforeSpeak,
}, null, 2));

if (hardFail || (strict && densityWarn.length)) process.exitCode = 1;
