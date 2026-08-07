#!/usr/bin/env node
/**
 * MARROW-depth adversarial TTS runtime audit — deeper than ultra_deep.
 *
 * For EVERY bank question, simulates:
 *   speechPart → buildQuestionSpeechParts → prepareTtsPayload → prepareFishTtsText
 * (brace-balanced extract from app.js + real maps + Fish).
 *
 * Hard fails (bugs prior audits missed):
 *   - empty Fish text when bank has Arabic
 *   - أنّ/بِأَنّ mangled into أنْ before ism (نزول/توحيد/يوم…)
 *   - أنّ+مضارع (imperfect) still surviving after prep+Fish
 *   - content loss vs bank (≥45% letter drop, non-ayah)
 *   - ayah markers left in Fish when verseKey
 *   - TF options not صح/خطأ
 *   - hadith misclassified as ayah → empty/over-stripped Fish
 *   - phrase-map overwrite of curated well-formed tashkeel (أنْ→أنّ)
 *
 * Also inventories silent/early-return paths in speakQuestion / fetchTtsBlob / speakTtsSegment.
 * Writes: extracted/marrow_deep_speech_audit.json
 *
 *   node scripts/marrow_deep_speech_audit.mjs
 *   node scripts/marrow_deep_speech_audit.mjs --strict
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
    const end = src.indexOf(';', i);
    return src.slice(start, end + 1);
  }
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
const fishSrc = readFileSync(join(root, 'fish-audio-tts.js'), 'utf8');

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

const fnNames = [
  'stripArabicDiacritics',
  'normalizeArabicForMatch',
  'scrubFakeAllahSpellings',
  'scrubSpeechDiacriticsNoise',
  'sanitizeTtsText',
  'hasWellFormedTashkeel',
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
  'prepareTtsPayload',
];

const constParts = [
  extractConstBlock(appSrc, 'ARABIC_HARAKAT_RE'),
  extractConstBlock(appSrc, 'MANUAL_SPEECH_DIACRITICS'),
  extractConstBlock(appSrc, 'SPEECH_WORD_RE'),
  'let _sortedManualSpeech = null;',
];
const allahMatch = appSrc.match(/const\s+ALLAH\s*=\s*[^;]+;/);
if (allahMatch) constParts.unshift(allahMatch[0]);

const boot = `
${constParts.join('\n')}
const window = __sandbox.window;
const state = __sandbox.state;
const fixAllahIrabInText = __sandbox.fixAllahIrabInText;
const lookupKnownVerseKey = __sandbox.lookupKnownVerseKey;
${allahMatch ? '' : 'const ALLAH = __sandbox.ALLAH;'}
${fnNames.map((n) => extractFn(appSrc, n)).join('\n\n')}
return {
  prepareTtsPayload,
  speechPart,
  buildQuestionSpeechParts,
  speechTextFor,
  speechMatchesDisplay,
  hasWellFormedTashkeel,
  applyManualSpeechDiacritics,
  scrubSpeechDiacriticsNoise,
  stripKnownAyahSnippetsForSpeech,
  removeQuranicVersesForSpeech,
  isHadithPassage,
  isQuranicAyahText,
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
    .replace(/لو\s+لا/g, 'لولا')
    .replace(/[؟?!.،,;؛:«»"'“”‘’()[\]{}✓✗—–\-…﴿﴾]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bareEq(a, b) {
  return normBare(a) === normBare(b);
}

function letterCount(s) {
  return (normBare(s).match(/[\u0621-\u064A]/g) || []).length;
}

function nfcShadda(s) {
  return String(s || '').replace(/([\u064E\u064F\u0650])(\u0651)/g, '$2$1');
}

/** أنّ + imperfect (ي/ت/ن + haraka) — should be scrubbed to أنْ */
function findAnnaImperfect(text) {
  const nfc = nfcShadda(text);
  const hits = [];
  const re = /(?:بِ)?أَنَّ(\s+)([يتن][\u064B-\u065F\u0670])/g;
  let m;
  while ((m = re.exec(nfc))) {
    const bare = m[2].replace(/[\u064B-\u065F\u0670]/g, '');
    // exclude ism stems (these SHOULD keep أنّ)
    if (/^(نزول|نفس|نوع|نحو|يوم|توحيد|توبة|ترك|يهود)/.test(bare + (nfc.slice(m.index + m[0].length).match(/^[\u0621-\u064A]*/)?.[0] || ''))) {
      continue;
    }
    // Re-check full word
    const full = nfc.slice(m.index).match(/(?:بِ)?أَنَّ\s+[يتن][\u064B-\u065F\u0670]*[\u0621-\u064A\u0671]*/)?.[0];
    const fullBare = (full || '').replace(/^(?:بِ)?أَنَّ\s+/, '').replace(/[\u064B-\u065F\u0670]/g, '');
    if (/^(نزول|نفس|نوع|نحو|يوم|توحيد|توبة|ترك|يهود|يوسف|يونس)/.test(fullBare)) continue;
    hits.push(full || m[0]);
  }
  return hits;
}

/** أنْ wrongly before ism — marrow landmine prior audits missed */
const ISM_AFTER_AN =
  /(?:بِ)?أَنْ\s+(نزول|نزور|نفس|نوع|نصيب|نحو|نهي|نور|نار|يوم|يوسف|يونس|يهود|توحيد|توبة|ترك|تميم)/g;

function findAnnaIsmCorruption(text) {
  const nfc = nfcShadda(text);
  const hits = [];
  let m;
  ISM_AFTER_AN.lastIndex = 0;
  while ((m = ISM_AFTER_AN.exec(nfc))) hits.push(m[0]);
  return hits;
}

function tfOk(prepared) {
  const b = normBare(prepared);
  return b === 'صح' || b === normBare('خطأ');
}

// ── Silent / early-return path inventory ──
function inventorySilentPaths() {
  const paths = [];
  const rate = (sev, id, note) => paths.push({ id, severity: sev, note });

  const fetchBody = extractFn(appSrc, 'fetchTtsBlob');
  const speakSeg = extractFn(appSrc, 'speakTtsSegment');
  const speakQ = extractFn(appSrc, 'speakQuestion');

  if (/ttsBlobMemoryCache\.has\(key\)[\s\S]{0,80}return null/.test(fetchBody)) {
    rate('info', 'fetchTtsBlob.memory-hit-returns-null', 'Intentional — ensureTtsObjectUrl re-reads memory URL');
  }
  if (/ttsKnownMissCache\.has\(key\)[\s\S]{0,60}throw/.test(fetchBody)) {
    rate('medium', 'fetchTtsBlob.known-miss-throw', 'Cached miss throws — speakTtsSegment soft-fails; option may stay silent');
  }
  if (/navigator\.onLine === false[\s\S]{0,80}throw/.test(fetchBody)) {
    rate('medium', 'fetchTtsBlob.offline-miss', 'Offline cache miss throws — no toast if baked-miss filtered');
  }
  if (/__alhudaBakedTtsOnly[\s\S]{0,80}throw/.test(fetchBody)) {
    rate('low', 'fetchTtsBlob.baked-only', 'Baked-only mode skips /api/tts');
  }
  if (/ctype\.includes\('html'\)/.test(fetchBody)) {
    rate('low', 'fetchTtsBlob.html-spa-reject', 'Rejects SPA HTML as audio — silent fallthrough');
  }
  if (/catch \{[\s\S]{0,40}\/\* fall through/.test(fetchBody) || /catch \{\s*\/\* fall through/.test(fetchBody)) {
    rate('info', 'fetchTtsBlob.baked-catch-fallthrough', 'Baked fetch errors fall through to network');
  }
  if (/if \(!clean\) return;/.test(speakSeg)) {
    rate('high', 'speakTtsSegment.empty-clean-silent', 'Empty prepareTtsPayload → silent return (no toast)');
  }
  if (/Do NOT fall back to browser SpeechSynthesis/.test(speakSeg)) {
    rate('medium', 'speakTtsSegment.no-speechSynthesis-fallback', 'Cloud fail clears audio and rethrows — correct voice policy, soft silence');
  }
  if (/if \(!q\?\.q \|\| !voiceOn\) return;/.test(speakQ)) {
    rate('info', 'speakQuestion.voice-off', 'Early return when voice off');
  }
  if (/if \(token !== hybridSpeechToken/.test(speakQ)) {
    rate('info', 'speakQuestion.token-abort', 'Navigation/token bump aborts mid-sequence (expected)');
  }
  if (/if \(!qProse\)/.test(speakQ) === false && /if \(qProse\) \{/.test(speakQ)) {
    rate('high', 'speakQuestion.empty-qProse-skips-question', 'Empty qProse after ayah strip → skip question Fish (Hudhaify may still play)');
  }
  if (/if \(!oClean\) continue;/.test(speakQ)) {
    rate('high', 'speakQuestion.empty-option-continue', 'Empty option prepare → silent answer slot');
  }
  if (/Last resort:[\s\S]{0,200}stripForSpeech/.test(speakQ)) {
    rate('medium', 'speakQuestion.last-resort-raw', 'After 3 fails may reintroduce less-scrubbed text');
  }
  if (/baked miss[\s\S]{0,80}toastTtsFail/.test(speakQ) || /!String\(e\?\.message[\s\S]{0,40}baked miss/.test(speakQ)) {
    rate('low', 'speakQuestion.baked-miss-no-toast', 'Baked misses suppress toast — student hears silence');
  }
  if (/Prefetch next\/answers only AFTER/.test(speakQ)) {
    rate('info', 'speakQuestion.prefetch-after-start', 'Latency win — answers warm after Q audio starts');
  }

  return paths;
}

// ── Landmine counterexamples (WORD_MAP / PHRASE_MAP / scrub) ──
function landmineCounterexamples() {
  const cases = [
    {
      id: 'bianna-nuzul-ism',
      text: "الْإِيمَانِ بِأَنَّ نزولها مِنْ عِنْدَ اللَّهِ",
      expectKeep: /بِأَنَّ\s+نزول/,
      expectFail: /بِأَنْ\s+نزول/,
    },
    {
      id: 'anna-nuzul-vocalized',
      text: "أَنَّ نُزُولَهَا مِنْ عِنْدِ اللَّهِ",
      expectKeep: /أَنَّ\s+نُزُول/,
      expectFail: /أَنْ\s+نُزُول/,
    },
    {
      id: 'anna-imperfect-muadh',
      text: "أَمَرَ مُعَاذًا أَنَّ يُعَلِّمَ أَهْلَ الْيَمَنِ",
      expectKeep: /أَنْ\s+يُعَلّ/,
      expectFail: /أَنَّ\s+يُعَلّ/,
    },
    {
      id: 'bianna-imperfect',
      text: "بِأَنَّ يَكُونَ شَيْئًا",
      expectKeep: /بِأَنْ\s+يَكُون/,
      expectFail: /بِأَنَّ\s+يَكُون/,
    },
    {
      id: 'ma-abd-passive',
      text: 'كل ما عبد من دون الله',
      expectKeep: /عُبِدَ/,
      expectFail: /عَبْدٌ\s+مِن|عَبْد\s+مِن/,
    },
    {
      id: 'laan-allah',
      text: 'لعن الله اليهود',
      expectKeep: /لَعَنَ\s+الل/,
      expectFail: null,
    },
    {
      id: 'abd-wahhab-construct',
      text: 'عَبْدٌ الْوَهَّابِ',
      expectKeep: /عَبْدِ\s+الْوَهّ/,
      expectFail: /عَبْدٌ\s+الْوَهّ/,
    },
  ];

  const results = [];
  for (const c of cases) {
    const scrubbed = api.scrubSpeechDiacriticsNoise(c.text);
    const prepared = api.prepareTtsPayload(c.text);
    const fish = prepareFishTtsText(prepared || scrubbed);
    const blob = nfcShadda(prepared + ' ' + fish);
    const okKeep = c.expectKeep ? c.expectKeep.test(blob) : true;
    const okFail = c.expectFail ? !c.expectFail.test(blob) : true;
    results.push({
      id: c.id,
      ok: okKeep && okFail,
      okKeep,
      okFail,
      prepared: prepared.slice(0, 120),
      fish: fish.slice(0, 120),
      wordMapBianna: wordMap['بأن'] || null,
    });
  }
  return results;
}

// ── Phrase-map overwrite of well-formed curated BY_ID ──
const phraseOverwrite = [];
for (const [id, fields] of Object.entries(byId)) {
  const curated = fields?.q;
  if (!curated || !api.hasWellFormedTashkeel(curated)) continue;
  const raw = all.find((q) => q.id === id);
  if (!raw) continue;
  const q = toAppQ(raw);
  const spoken = api.speechPart(q, 'q', q.q);
  // Curated أنْ before imperfect must not become أنّ via phrase path
  if (/أَنْ\s+[يتن]/.test(nfcShadda(curated)) && /أَنَّ\s+[يتن][\u064B-\u065F\u0670]/.test(nfcShadda(spoken))) {
    const fullBareC = normBare(curated);
    const fullBareS = normBare(spoken);
    if (fullBareC === fullBareS || bareEq(spoken, q.q)) {
      phraseOverwrite.push({
        id,
        kind: 'an-sukun-to-anna',
        curated: curated.slice(0, 100),
        spoken: spoken.slice(0, 100),
      });
    }
  }
}

// ── Full bank simulation ──
const emptyFish = [];
const annaImpFails = [];
const annaIsmFails = [];
const contentLoss = [];
const ayahFishLeaks = [];
const tfFails = [];
const hadithAsAyah = [];
const prepEmpty = [];
const wordingHard = [];
const ids = [];

for (const raw of all) {
  if (!raw?.id) continue;
  ids.push(raw.id);
  const q = toAppQ(raw);
  const { questionText, optionList } = api.buildQuestionSpeechParts(q);

  if (!bareEq(questionText, q.q) && letterCount(q.q) >= 8) {
    // spoken≠bank is soft (maps expand) — hard only if spoken emptied
    if (!questionText && letterCount(q.q) >= 3) {
      wordingHard.push({ id: q.id, field: 'q', kind: 'spoken-empty', bank: q.q });
    }
  }

  const fields = [{ field: 'q', bank: q.q, spoken: questionText }];
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
      fields.push({ field: `a${i}`, bank: opt, spoken: optionList[i] });
    });
  }

  // Hadith misclassified as ayah
  if (/حديث|ﷺ|رواه|قال النبي|قال رسول|القدسي/.test(normBare(q.q))) {
    const isH = api.isHadithPassage(questionText || q.q);
    const isA = api.isQuranicAyahText(questionText || q.q);
    if (!isH && isA) {
      hadithAsAyah.push({ id: q.id, kind: 'classified-ayah', bank: String(q.q).slice(0, 100) });
    }
    if (isH) {
      const removed = api.removeQuranicVersesForSpeech(questionText || q.q);
      if (letterCount(questionText || q.q) >= 30 && letterCount(removed) < letterCount(questionText || q.q) * 0.4) {
        hadithAsAyah.push({
          id: q.id,
          kind: 'overstrip',
          bank: String(q.q).slice(0, 80),
          removed: removed.slice(0, 80),
        });
      }
    }
  }

  for (const f of fields) {
    if (f.spoken == null || f.spoken === '') {
      if ((f.field === 'q' || (q.type === 'mc' && f.bank)) && letterCount(f.bank) >= 3) {
        prepEmpty.push({ id: q.id, field: f.field, stage: 'spoken' });
      }
      continue;
    }
    let prepared = api.prepareTtsPayload(f.spoken);
    if (f.field === 'q' && verseMap[q.id]) {
      const stripped = String(f.spoken || '')
        .replace(/﴿[^﴾]*﴾/g, ' ')
        .replace(/「[^」]*」/g, ' ');
      prepared = api.prepareTtsPayload(stripped) || prepared;
      const without = api.stripKnownAyahSnippetsForSpeech(prepared);
      prepared = without
        ? api.prepareTtsPayload(without) || api.sanitizeTtsText(without) || without
        : '';
    }
    if (!prepared && f.field === 'q' && !(verseMap[q.id] && letterCount(f.spoken) > 0)) {
      prepEmpty.push({ id: q.id, field: 'q', stage: 'prepared' });
    }

    const fish = prepared ? prepareFishTtsText(prepared) : '';
    const bankLetters = letterCount(f.bank);

    // Empty Fish when bank has Arabic (allow full ayah strip for verse-mapped q)
    if (bankLetters >= 8 && !fish) {
      const ayahOkEmpty =
        f.field === 'q' && verseMap[q.id] && letterCount(prepared) === 0;
      if (!ayahOkEmpty) {
        emptyFish.push({
          id: q.id,
          field: f.field,
          bank: String(f.bank).slice(0, 100),
          prepared: String(prepared).slice(0, 80),
        });
      }
    }

    if (fish && bankLetters >= 20 && !(f.field === 'q' && verseMap[q.id])) {
      const fl = letterCount(fish);
      if (fl < bankLetters * 0.55) {
        contentLoss.push({
          id: q.id,
          field: f.field,
          bankL: bankLetters,
          fishL: fl,
          bank: String(f.bank).slice(0, 100),
          fish: fish.slice(0, 100),
        });
      }
    }

    const annaImp = [...findAnnaImperfect(prepared), ...findAnnaImperfect(fish)];
    if (annaImp.length) {
      annaImpFails.push({
        id: q.id,
        field: f.field,
        matches: annaImp,
        fish: fish.slice(0, 140),
      });
    }

    const annaIsm = [...findAnnaIsmCorruption(prepared), ...findAnnaIsmCorruption(fish)];
    if (annaIsm.length) {
      annaIsmFails.push({
        id: q.id,
        field: f.field,
        matches: annaIsm,
        prepared: prepared.slice(0, 140),
        fish: fish.slice(0, 140),
      });
    }

    if (q.type === 'tf' && f.field.startsWith('tf') && prepared && !tfOk(prepared)) {
      tfFails.push({ id: q.id, field: f.field, prepared });
    }

    if (f.field === 'q' && verseMap[q.id] && /﴿|﴾/.test(prepared + fish)) {
      ayahFishLeaks.push({ id: q.id, verseKey: verseMap[q.id], prepared: prepared.slice(0, 120) });
    }
  }
}

// Phrase map values themselves must not corrupt under prepare+Fish
const phraseMapIsmHits = [];
for (const [plain, diac] of Object.entries(phraseMap)) {
  const prep = api.prepareTtsPayload(diac);
  const fish = prepareFishTtsText(prep);
  const ism = [...findAnnaIsmCorruption(prep), ...findAnnaIsmCorruption(fish)];
  if (ism.length) {
    phraseMapIsmHits.push({
      plain: plain.slice(0, 60),
      matches: ism,
      prepared: prep.slice(0, 100),
    });
  }
}

const silentPaths = inventorySilentPaths();
const landmines = landmineCounterexamples();
const landmineFails = landmines.filter((l) => !l.ok);

const guardOk =
  /hasWellFormedTashkeel\(base\)/.test(appSrc) &&
  /NEVER let SPEECH_PHRASE_MAP overwrite/.test(appSrc) &&
  /keepIsm|نزول\|/.test(appSrc) &&
  /keepIsm|نزول\|/.test(fishSrc);

const MUADH_ID = 'e0f8acf6-7366-94d9-1b93-49a30f6e34d2';
const muadhBank = all.find((q) => q.id === MUADH_ID);
let muadhTest = { ok: false };
if (muadhBank) {
  const muadhQ = toAppQ(muadhBank);
  const spoken = api.speechPart(muadhQ, 'q', muadhQ.q);
  const prepared = api.prepareTtsPayload(spoken);
  const fish = prepareFishTtsText(prepared);
  const hasAnSukun = /أَنْ\s+يُعَلّ/.test(nfcShadda(prepared + fish));
  const hasAnnaBad = findAnnaImperfect(prepared).length + findAnnaImperfect(fish).length > 0;
  muadhTest = {
    ok: bareEq(spoken, muadhQ.q) && hasAnSukun && !hasAnnaBad,
    hasAnSukun,
    hasAnnaBad,
    prepared: prepared.slice(0, 160),
    fish: fish.slice(0, 160),
  };
}

let versionMeta = {};
try {
  const v = readFileSync(join(root, 'version.js'), 'utf8');
  versionMeta = {
    cache: (v.match(/cache:\s*"([^"]+)"/) || [])[1],
    sw: Number((v.match(/\bsw:\s*(\d+)/) || [])[1]),
    app: Number((v.match(/\bapp:\s*(\d+)/) || [])[1]),
  };
} catch {
  /* ignore */
}

const hardFail =
  emptyFish.length > 0 ||
  annaImpFails.length > 0 ||
  annaIsmFails.length > 0 ||
  phraseMapIsmHits.length > 0 ||
  contentLoss.length > 0 ||
  ayahFishLeaks.length > 0 ||
  tfFails.length > 0 ||
  hadithAsAyah.length > 0 ||
  prepEmpty.length > 0 ||
  wordingHard.length > 0 ||
  phraseOverwrite.length > 0 ||
  landmineFails.length > 0 ||
  !muadhTest.ok ||
  !guardOk ||
  ids.length !== 652;

const report = {
  meta: {
    checked: ids.length,
    uniqueIds: new Set(ids).size,
    bankExpected: 652,
    timestamp: new Date().toISOString(),
    marrowDepth: true,
    deeperThan: 'ultra_deep_speech_audit',
    version: versionMeta,
  },
  summary: {
    emptyFish: emptyFish.length,
    annaImperfectFails: annaImpFails.length,
    annaIsmCorruption: annaIsmFails.length,
    phraseMapIsmHits: phraseMapIsmHits.length,
    contentLoss: contentLoss.length,
    ayahFishLeaks: ayahFishLeaks.length,
    tfFails: tfFails.length,
    hadithAsAyah: hadithAsAyah.length,
    prepEmpty: prepEmpty.length,
    wordingHard: wordingHard.length,
    phraseOverwrite: phraseOverwrite.length,
    landmineFails: landmineFails.length,
    muadhOk: muadhTest.ok,
    guardOk,
    hardFail,
  },
  bugsMissedByPriorAudits: [
    {
      id: 'anna-ism-scrub-false-positive',
      severity: 'critical',
      detail:
        'scrubSpeechDiacriticsNoise converted أَنَّ/بِأَنَّ + ي/ت/ن(+optional haraka) to أنْ even for ism stems (نزولها). Ultra-deep only checked أنّ+مضارع residual, not أنْ+اسم corruption. Fixed with keepIsm guard in app.js + fish-audio-tts.js.',
    },
    {
      id: 'broad-anna-bare-letter-line',
      severity: 'critical',
      detail:
        'Extra line /أَنَّ(\\s+)([يتن][\\u0621-\\u064A])/ mangled بِأَنَّ نزولها via substring match inside بِأَنَّ. Removed.',
    },
    {
      id: 'abd-tanween-construct',
      severity: 'medium',
      detail:
        'عَبْدٌ الْوَهَّابِ survived Fish (only matched الل). Extended construct rewrite to عَبْدِ ال…',
    },
  ],
  silentPaths,
  landmines,
  muadhTest,
  guardOk,
  wordMapLandmines: {
    بان: wordMap['بأن'],
    note: 'بِأَنَّ always — mitigated by scrub/Fish masdariyya before imperfect; ism kept via keepIsm',
    abd: wordMap['عبد'],
    an: wordMap['أن'],
    lan: wordMap['لعن'],
    anPrep: wordMap['عن'],
  },
  samples: {
    emptyFish: emptyFish.slice(0, 20),
    annaImpFails: annaImpFails.slice(0, 20),
    annaIsmFails: annaIsmFails.slice(0, 20),
    phraseMapIsmHits: phraseMapIsmHits.slice(0, 20),
    contentLoss: contentLoss.slice(0, 20),
    ayahFishLeaks: ayahFishLeaks.slice(0, 20),
    tfFails: tfFails.slice(0, 20),
    hadithAsAyah: hadithAsAyah.slice(0, 20),
    prepEmpty: prepEmpty.slice(0, 20),
    phraseOverwrite: phraseOverwrite.slice(0, 20),
  },
};

mkdirSync(join(root, 'extracted'), { recursive: true });
writeFileSync(join(root, 'extracted/marrow_deep_speech_audit.json'), JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      ...report.summary,
      checked: ids.length,
      silentPathCount: silentPaths.length,
      highSilent: silentPaths.filter((p) => p.severity === 'high').map((p) => p.id),
      landmines: landmines.map((l) => ({ id: l.id, ok: l.ok })),
      version: versionMeta,
    },
    null,
    2
  )
);

if (hardFail || (strict && landmineFails.length)) process.exitCode = 1;
