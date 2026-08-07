#!/usr/bin/env node
/**
 * Listen/STT audit — TTS live Fish clips, Whisper-transcribe, compare bare letters.
 *
 * Sample (≥40, prefer 80+): Muadh Q+opts, Haqq TF, tawhid phrases, random MC,
 * ayah-linked Fish prose, historically OCR-fixed Qs.
 *
 *   node scripts/listen_stt_audit.mjs                 # select+TTS+manifest
 *   node scripts/listen_stt_audit.mjs --tts-only
 *   node scripts/listen_stt_audit.mjs --compare       # after whisper_transcribe.py
 *   node scripts/listen_stt_audit.mjs --static-only   # letter-level 652 pass
 *
 * Writes: extracted/listen_audit/*.mp3, extracted/listen_stt_audit.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';
import { prepareFishTtsText } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda.ryodan71.workers.dev';
const audioDir = join(root, 'extracted/listen_audit');
const manifestPath = join(root, 'extracted/listen_audit_manifest.json');
const sttRawPath = join(root, 'extracted/listen_stt_raw.json');
const reportPath = join(root, 'extracted/listen_stt_audit.json');

const TTS_ONLY = process.argv.includes('--tts-only');
const COMPARE = process.argv.includes('--compare');
const STATIC_ONLY = process.argv.includes('--static-only');
const PAUSE_MS = Number(process.argv.find((a) => a.startsWith('--pause='))?.slice(8) || 280);

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
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
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
const verseMap = win.QUESTION_VERSE_MAP || {};
const ayahSnippets = win.AYAH_SNIPPET_MAP || {};
const bank = JSON.parse(
  readFileSync(join(root, 'questions-bank.js'), 'utf8').match(
    /window\.QUESTIONS_BANK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/
  )[1]
);
const all = Object.values(bank).flat();

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
  stripKnownAyahSnippetsForSpeech,
  sanitizeTtsText,
  removeQuranicVersesForSpeech,
};
`;

const api = new Function('__sandbox', boot)(sandbox);

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

function bareLetters(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(s) {
  return bareLetters(s).split(/\s+/).filter(Boolean);
}

function letterCount(s) {
  return (bareLetters(s).match(/[\u0621-\u064A]/g) || []).length;
}

function nfcShadda(s) {
  return String(s || '').normalize('NFC').replace(/([\u064E\u064F\u0650])(\u0651)/g, '$2$1');
}

function findAnnaImperfect(s) {
  const t = nfcShadda(s);
  const out = [];
  const re = /(?:بِ)?أَنَّ?\s+([يتن][\u064B-\u065F\u0670]*[\u0621-\u064A])/g;
  let m;
  while ((m = re.exec(t))) {
    const bare = m[1].replace(/[\u064B-\u065F\u0670]/g, '');
    if (/^(نزول|نزور|نفس|نوع|نصيب|نحو|نهي|نور|نار|يوم|يوسف|يونس|يهود|توحيد|توبة|ترك|تميم|تيسير|يأس|يده)/.test(bare)) {
      continue;
    }
    // imperfect verb-ish: haraka after first letter OR common verb stems
    if (/^([يتن])[\u064B-\u065F\u0670]/.test(m[1]) || /^(يعل|يكون|تعب|نعبد|يقول|تعلم)/.test(bare)) {
      out.push(m[0]);
    }
  }
  return out;
}

/** Weak harakat density on non-trivial Arabic. */
function weakDensity(fish) {
  const letters = letterCount(fish);
  if (letters < 20) return false;
  const marks = (String(fish).match(/[\u064B-\u065F\u0670]/g) || []).length;
  return marks / letters < 0.12;
}

function prepareField(q, field, spoken, { stripAyah = false } = {}) {
  let prepared = api.prepareTtsPayload(spoken);
  if (stripAyah || (field === 'q' && verseMap[q.id])) {
    const stripped = String(spoken || '')
      .replace(/﴿[^﴾]*﴾/g, ' ')
      .replace(/「[^」]*」/g, ' ');
    prepared = api.prepareTtsPayload(stripped) || prepared;
    const without = api.stripKnownAyahSnippetsForSpeech(prepared);
    const bareOrig = String(prepared || '').replace(/[\u064B-\u065F\u0670\s]/g, '');
    const bareWithout = String(without || '').replace(/[\u064B-\u065F\u0670\s]/g, '');
    const stripOk = bareWithout.length >= 8
      && bareWithout.length >= Math.min(14, Math.floor(bareOrig.length * 0.4));
    prepared = without && stripOk
      ? api.prepareTtsPayload(without) || api.sanitizeTtsText(without) || without
      : prepared;
  }
  const fish = prepared ? prepareFishTtsText(prepared) : '';
  return { spoken: String(spoken || ''), prepared: prepared || '', fish };
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MUADH = 'e0f8acf6-7366-94d9-1b93-49a30f6e34d2';
const HAQQ = '07483021-8f6a-44c8-9f32-1040d095f0c5';
const OCR_IDS = [
  '91eb89af-4c29-f159-bea4-d6c351552f31',
  'a65b90a9-be7c-b2b5-de1f-1ed22818eedf',
  'e517de7c-d07a-33a1-43bc-5bc9ee685d4e',
  '39d543ed-8c5d-a3ba-9480-c85261e939ca',
  '27b4b080-cbd4-86d0-3038-c0d0ce2ade61',
];

const TAWHID_PHRASES = [
  { id: 'phrase_laan', label: 'لعن الله', text: "لَعَنَ اللَّهُ مَنْ ذَبَحَ لِغَيْرِ اللَّهِ" },
  { id: 'phrase_yabud', label: 'يعبد الله', text: "أَنْ لَا يَعْبُدَ اللَّهَ إِلَّا بِمَا شَرَعَ" },
  { id: 'phrase_ma_ubida', label: 'ما عُبِدَ', text: "كُلُّ مَا عُبِدَ مِنْ دُونِ اللَّهِ وَهُوَ رَاضٍ" },
  { id: 'phrase_tawhid', label: 'لا إله إلا الله', text: "مَا مَعْنَى لَا إِلَٰهَ إِلَّا اللَّهُ" },
  { id: 'phrase_inda', label: 'عند الله', text: "مَا أَعْظَمُ الذُّنُوبِ عِنْدَ اللَّهِ" },
  { id: 'phrase_ifrad', label: 'إفراد الله', text: "التَّوْحِيدُ إِفْرَادُ اللَّهِ بِالْعِبَادَةِ" },
  { id: 'phrase_haqq', label: 'حق الله على العباد', text: "حَقُّ اللَّهِ عَلَى الْعِبَادِ هُوَ عِبَادَتُهُ" },
  { id: 'phrase_min_dun', label: 'من دون الله', text: "مِنْ دُونِ اللَّهِ" },
  { id: 'phrase_shahada', label: 'شهادة أن لا إله', text: "شَهَادَةُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ" },
  { id: 'phrase_anna_yuallim', label: 'أنْ يعلّم', text: "أَمَرَ مُعَاذًا أَنْ يُعَلِّمَ أَهْلَ الْيَمَنِ" },
];

function selectClips() {
  const clips = [];
  const seen = new Set();
  const push = (clip) => {
    if (!clip?.fish || letterCount(clip.fish) < 2) return;
    if (seen.has(clip.id)) return;
    seen.add(clip.id);
    clips.push(clip);
  };

  // Muadh Q + 4 options
  const muadh = all.find((q) => q.id === MUADH);
  if (muadh) {
    const aq = toAppQ(muadh);
    const spokenQ = api.speechPart(aq, 'q', aq.q);
    const prepQ = prepareField(muadh, 'q', spokenQ);
    push({
      id: `muadh_q`,
      kind: 'muadh',
      qid: MUADH,
      field: 'q',
      ...prepQ,
    });
    const opts = aq.a || [];
    opts.forEach((opt, i) => {
      const spoken = api.speechPart(aq, `a${i}`, opt);
      const prep = prepareField(muadh, `a${i}`, spoken);
      push({ id: `muadh_a${i}`, kind: 'muadh', qid: MUADH, field: `a${i}`, ...prep });
    });
  }

  // Haqq Allah TF
  const haqq = all.find((q) => q.id === HAQQ);
  if (haqq) {
    const aq = toAppQ(haqq);
    const spokenQ = api.speechPart(aq, 'q', aq.q);
    push({ id: 'haqq_tf_q', kind: 'tf_haqq', qid: HAQQ, field: 'q', ...prepareField(haqq, 'q', spokenQ) });
    push({
      id: 'haqq_tf_sah',
      kind: 'tf_haqq',
      qid: HAQQ,
      field: 'tf0',
      ...prepareField(haqq, 'tf0', 'صَحّ'),
    });
    push({
      id: 'haqq_tf_khata',
      kind: 'tf_haqq',
      qid: HAQQ,
      field: 'tf1',
      ...prepareField(haqq, 'tf1', 'خَطَأ'),
    });
  }

  // 10 tawhid phrases (direct Fish prep)
  for (const p of TAWHID_PHRASES) {
    const prepared = api.prepareTtsPayload(p.text);
    const fish = prepareFishTtsText(prepared || p.text);
    push({
      id: p.id,
      kind: 'tawhid_phrase',
      label: p.label,
      spoken: p.text,
      prepared: prepared || p.text,
      fish,
    });
  }

  // 5 ayah-linked (Fish prose only)
  let ayahN = 0;
  for (const q of all) {
    if (ayahN >= 5) break;
    if (!verseMap[q.id]) continue;
    if (q.id === MUADH) continue;
    const aq = toAppQ(q);
    const spoken = api.speechPart(aq, 'q', aq.q);
    const prep = prepareField(q, 'q', spoken, { stripAyah: true });
    if (!prep.fish || letterCount(prep.fish) < 6) continue;
    // ensure no ayah body leftover
    push({
      id: `ayah_${q.id.slice(0, 8)}`,
      kind: 'ayah_prose',
      qid: q.id,
      verseKey: verseMap[q.id],
      field: 'q',
      ...prep,
    });
    ayahN += 1;
  }

  // 5 OCR-fixed
  for (const id of OCR_IDS) {
    const q = all.find((x) => x.id === id);
    if (!q) continue;
    const aq = toAppQ(q);
    const spoken = api.speechPart(aq, 'q', aq.q);
    push({
      id: `ocr_${id.slice(0, 8)}`,
      kind: 'ocr_fixed',
      qid: id,
      field: 'q',
      ...prepareField(q, 'q', spoken, { stripAyah: !!verseMap[id] }),
    });
  }

  // 15 random MC full question Fish
  const rng = mulberry32(20260807);
  const mcPool = all.filter((q) => q.type === 'mc' && !seen.has(`mc_${q.id.slice(0, 8)}`));
  let mcN = 0;
  const usedMc = new Set();
  while (mcN < 15 && usedMc.size < mcPool.length) {
    const q = mcPool[Math.floor(rng() * mcPool.length)];
    if (!q || usedMc.has(q.id)) continue;
    usedMc.add(q.id);
    if ([MUADH, HAQQ, ...OCR_IDS].includes(q.id)) continue;
    const aq = toAppQ(q);
    const spoken = api.speechPart(aq, 'q', aq.q);
    const prep = prepareField(q, 'q', spoken, { stripAyah: !!verseMap[q.id] });
    if (!prep.fish || letterCount(prep.fish) < 8) continue;
    push({
      id: `mc_${q.id.slice(0, 8)}`,
      kind: 'random_mc',
      qid: q.id,
      field: 'q',
      ...prep,
    });
    mcN += 1;
  }

  // Pad to ≥80 with more MC options + TF + extras
  let pad = 0;
  const padRng = mulberry32(20260808);
  while (clips.length < 80 && pad < 400) {
    pad += 1;
    const q = all[Math.floor(padRng() * all.length)];
    if (!q) continue;
    const aq = toAppQ(q);
    if (q.type === 'mc' && Array.isArray(aq.a) && aq.a.length) {
      const i = Math.floor(padRng() * aq.a.length);
      const spoken = api.speechPart(aq, `a${i}`, aq.a[i]);
      const prep = prepareField(q, `a${i}`, spoken);
      push({
        id: `pad_${q.id.slice(0, 8)}_a${i}`,
        kind: 'pad_option',
        qid: q.id,
        field: `a${i}`,
        ...prep,
      });
    } else if (q.type === 'tf') {
      const spoken = api.speechPart(aq, 'q', aq.q);
      push({
        id: `pad_tf_${q.id.slice(0, 8)}`,
        kind: 'pad_tf',
        qid: q.id,
        field: 'q',
        ...prepareField(q, 'q', spoken),
      });
    }
  }

  return clips;
}

function staticLetterPass() {
  const annaImp = [];
  const emptyFish = [];
  const weak = [];
  const allahHeuristic = [];
  const densityOk = [];

  for (const q of all) {
    const aq = toAppQ(q);
    const fields = [];
    const spokenQ = api.speechPart(aq, 'q', aq.q);
    fields.push({ field: 'q', spoken: spokenQ, bank: aq.q });
    if (Array.isArray(aq.a)) {
      aq.a.forEach((opt, i) => {
        fields.push({ field: `a${i}`, spoken: api.speechPart(aq, `a${i}`, opt), bank: opt });
      });
    }
    for (const f of fields) {
      if (!f.spoken) continue;
      const prep = prepareField(q, f.field, f.spoken, { stripAyah: f.field === 'q' && !!verseMap[q.id] });
      const fish = prep.fish;
      if (letterCount(f.bank) >= 8 && !fish && !(f.field === 'q' && verseMap[q.id])) {
        emptyFish.push({ id: q.id, field: f.field, bank: String(f.bank).slice(0, 80) });
      }
      const anna = findAnnaImperfect(prep.prepared + ' ' + fish);
      if (anna.length) {
        annaImp.push({ id: q.id, field: f.field, matches: anna, fish: fish.slice(0, 120) });
      }
      if (fish && weakDensity(fish)) {
        weak.push({ id: q.id, field: f.field, fish: fish.slice(0, 100), letters: letterCount(fish) });
      }
      // allah irab heuristics: لعن الله should be مرفوع; يعبد الله منصوب; عند الله مجرور-ish
      if (/لَعَنَ\s+الل[\u064B-\u065F\u0670]*ه/.test(fish) && !/لَعَنَ\s+اللَّهُ/.test(fish) && !/لَعَنَ\s+اللَّهُ/.test(fish)) {
        allahHeuristic.push({ id: q.id, field: f.field, kind: 'laan_not_marfu', fish: fish.slice(0, 100) });
      }
      if (/يَعْبُدُ\s+الل[\u064B-\u065F\u0670]*ه/.test(fish) && !/يَعْبُدُ\s+اللَّهَ/.test(fish) && !/يَعْبُدُ\s+اللَّهَ/.test(fish)) {
        allahHeuristic.push({ id: q.id, field: f.field, kind: 'yabud_not_mansub', fish: fish.slice(0, 100) });
      }
      if (fish) densityOk.push(1);
    }
  }

  return {
    checked: all.length,
    preparedOutputsApprox: densityOk.length,
    annaImperfectFails: annaImp.length,
    emptyFish: emptyFish.length,
    weakDensity: weak.length,
    allahHeuristicFails: allahHeuristic.length,
    hardFail:
      annaImp.length > 0 ||
      emptyFish.length > 0 ||
      allahHeuristic.length > 0,
    samples: {
      annaImp: annaImp.slice(0, 15),
      emptyFish: emptyFish.slice(0, 15),
      weak: weak.slice(0, 15),
      allahHeuristic: allahHeuristic.slice(0, 15),
    },
  };
}

async function fetchTts(text) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: 'fish' }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, size: buf.length };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Compare STT vs intended bare letters — flag missing/extra/mangled/known misreads. */
function judgeClip(clip, transcript) {
  const intended = bareLetters(clip.fish);
  const heard = bareLetters(transcript);
  const iw = words(clip.fish);
  const hw = words(transcript);
  const flags = [];

  // Known misreads / broken Arabic
  if (/اللاه/.test(transcript) || /اللاه/.test(heard.replace(/\s/g, ''))) {
    flags.push({ kind: 'allah_misread', detail: 'اللاه' });
  }
  if (/ما\s*عبد(?!\s*ا)/.test(heard) && /ما\s*عبد/.test(intended) === false && /عبيد/.test(intended) === false) {
    // intended has عبيد? skip
  }
  if (/عُبِدَ|عُبِد/.test(clip.fish) && /\bعبد\b/.test(heard) && !/عبد/.test(intended.replace(/عبيد|عباد/g, ''))) {
    // STT often drops passive — soft flag if عبد alone where عبيد/عباد not intended
  }
  if (/أنَّ\s+ي|ان\s+يعل|انّ\s+ي/.test(transcript) && /ان\s+يعلم/.test(intended)) {
    flags.push({ kind: 'anna_vs_an', detail: 'أنّ instead of أنْ (STT or voice)' });
  }

  // Word coverage: missing intended content words (≥3 letters)
  const missing = [];
  const extra = [];
  for (const w of iw) {
    if (w.length < 3) continue;
    if (!hw.includes(w) && !heard.includes(w)) missing.push(w);
  }
  for (const w of hw) {
    if (w.length < 3) continue;
    if (!iw.includes(w) && !intended.includes(w)) extra.push(w);
  }

  // Mangled: high letter drop or garbled
  const il = letterCount(clip.fish);
  const hl = letterCount(transcript);
  const ratio = il ? hl / il : 1;
  if (il >= 12 && ratio < 0.55) {
    flags.push({ kind: 'missing_words', detail: `letterRatio=${ratio.toFixed(2)}`, missing: missing.slice(0, 8) });
  } else if (missing.length >= 3 && il >= 20) {
    flags.push({ kind: 'missing_words', missing: missing.slice(0, 8) });
  }

  // Broken/mangled tokens: STT word shares <50% letters with any intended word
  const mangled = [];
  for (const w of hw) {
    if (w.length < 4) continue;
    let best = 0;
    for (const t of iw) {
      const shared = [...w].filter((c) => t.includes(c)).length;
      best = Math.max(best, shared / Math.max(w.length, t.length));
    }
    if (best < 0.4 && !intended.includes(w)) mangled.push(w);
  }
  if (mangled.length >= 2) {
    flags.push({ kind: 'mangled', words: mangled.slice(0, 6) });
  }

  // Specific: Muadh must hear أن يعلم-ish not أنّ يعلم as broken meaning — soft
  if (clip.kind === 'muadh' && clip.field === 'q') {
    if (/ان\s*يعلم|ان\s*يعل/.test(heard) === false && /يعلم|يعل/.test(heard) === false) {
      flags.push({ kind: 'muadh_missing_yuallim', detail: 'expected يعلم stem' });
    }
  }
  if (clip.id === 'phrase_ma_ubida' || /عُبِدَ/.test(clip.fish)) {
    // If STT clearly says عبد (active) without عبيد/عبادة context — note voice risk
    if (/\bعبد\b/.test(heard) && !/عبيد|عباد|عباده|عبادة/.test(heard) && /عبيد|عباد/.test(intended) === false) {
      flags.push({ kind: 'abd_vs_ubida', detail: 'STT heard عبد for عُبِدَ — check Fish voice' });
    }
  }

  // Pass if no hard flags (missing_words, mangled, allah_misread, muadh_missing)
  const hardKinds = new Set(['missing_words', 'mangled', 'allah_misread', 'muadh_missing_yuallim', 'anna_vs_an']);
  const hard = flags.filter((f) => hardKinds.has(f.kind));
  // Soft STT noise: ignore if letter ratio good and few missing
  const pass = hard.length === 0 && (il < 12 || ratio >= 0.5);

  return {
    pass,
    intendedBare: intended.slice(0, 160),
    transcriptBare: heard.slice(0, 160),
    letterRatio: Number(ratio.toFixed(3)),
    missing: missing.slice(0, 10),
    extra: extra.slice(0, 10),
    flags,
    hardFail: hard.length > 0,
  };
}

async function runTts(clips) {
  mkdirSync(audioDir, { recursive: true });
  const results = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const file = join(audioDir, `${clip.id}.mp3`);
    process.stdout.write(`[${i + 1}/${clips.length}] TTS ${clip.id}… `);
    try {
      const { status, buf, size } = await fetchTts(clip.fish);
      const ok = status === 200 && size > 800;
      if (ok) writeFileSync(file, buf);
      console.log(ok ? `ok ${size}B` : `FAIL status=${status} size=${size}`);
      results.push({
        ...clip,
        ttsStatus: status,
        size,
        file: ok ? file : null,
        ttsOk: ok,
      });
    } catch (e) {
      console.log('ERR', e.message || e);
      results.push({ ...clip, ttsOk: false, err: String(e?.message || e) });
    }
    await sleep(PAUSE_MS);
  }
  return results;
}

function runCompare(manifest) {
  if (!existsSync(sttRawPath)) {
    throw new Error(`Missing ${sttRawPath} — run whisper_transcribe.py first`);
  }
  const raw = JSON.parse(readFileSync(sttRawPath, 'utf8'));
  const byId = Object.fromEntries((raw.results || []).map((r) => [r.id, r]));
  const clips = [];
  let pass = 0;
  let fail = 0;
  const brokenExamples = [];

  for (const clip of manifest.clips || []) {
    const stt = byId[clip.id];
    const transcript = stt?.transcript || '';
    const judgment = judgeClip(clip, transcript);
    const entry = {
      id: clip.id,
      kind: clip.kind,
      qid: clip.qid || null,
      label: clip.label || null,
      fish: clip.fish,
      prepared: clip.prepared,
      transcript,
      ttsOk: clip.ttsOk,
      ...judgment,
    };
    if (judgment.pass) pass += 1;
    else {
      fail += 1;
      if (brokenExamples.length < 12) {
        brokenExamples.push({
          id: clip.id,
          kind: clip.kind,
          fish: clip.fish.slice(0, 100),
          transcript: transcript.slice(0, 100),
          flags: judgment.flags,
        });
      }
    }
    clips.push(entry);
  }

  return { pass, fail, clips, brokenExamples, whisperModel: raw.model };
}

// ——— main ———
const staticReport = staticLetterPass();
console.log('STATIC:', JSON.stringify({
  checked: staticReport.checked,
  preparedOutputsApprox: staticReport.preparedOutputsApprox,
  annaImperfectFails: staticReport.annaImperfectFails,
  emptyFish: staticReport.emptyFish,
  weakDensity: staticReport.weakDensity,
  allahHeuristicFails: staticReport.allahHeuristicFails,
  hardFail: staticReport.hardFail,
}, null, 2));

if (STATIC_ONLY) {
  mkdirSync(join(root, 'extracted'), { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        mode: 'static-only',
        timestamp: new Date().toISOString(),
        static: staticReport,
      },
      null,
      2
    )
  );
  process.exitCode = staticReport.hardFail ? 1 : 0;
  process.exit();
}

if (COMPARE) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const compared = runCompare(manifest);
  const report = {
    timestamp: new Date().toISOString(),
    base: manifest.base,
    sampled: compared.clips.length,
    listened: compared.clips.filter((c) => c.transcript).length,
    ttsFails: (manifest.clips || []).filter((c) => !c.ttsOk).length,
    pass: compared.pass,
    fail: compared.fail,
    whisperModel: compared.whisperModel,
    static: staticReport,
    brokenExamples: compared.brokenExamples,
    clips: compared.clips,
    fishVoiceLimitations: [],
    version: (() => {
      try {
        const v = readFileSync(join(root, 'version.js'), 'utf8');
        return {
          cache: (v.match(/cache:\s*"([^"]+)"/) || [])[1],
          sw: Number((v.match(/\bsw:\s*(\d+)/) || [])[1]),
          app: Number((v.match(/\bapp:\s*(\d+)/) || [])[1]),
        };
      } catch {
        return {};
      }
    })(),
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        sampled: report.sampled,
        pass: report.pass,
        fail: report.fail,
        broken: report.brokenExamples.slice(0, 5),
        staticHard: staticReport.hardFail,
      },
      null,
      2
    )
  );
  process.exitCode = report.fail > 0 || staticReport.hardFail ? 1 : 0;
  process.exit();
}

// Default / --tts-only: select + TTS
const clips = selectClips();
console.log(`Selected ${clips.length} clips`);
const ttsResults = await runTts(clips);
const manifest = {
  timestamp: new Date().toISOString(),
  base,
  n: ttsResults.length,
  kinds: ttsResults.reduce((acc, c) => {
    acc[c.kind] = (acc[c.kind] || 0) + 1;
    return acc;
  }, {}),
  clips: ttsResults,
  static: staticReport,
};
mkdirSync(join(root, 'extracted'), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${manifestPath}`);
console.log(
  JSON.stringify(
    {
      n: manifest.n,
      kinds: manifest.kinds,
      ttsOk: ttsResults.filter((c) => c.ttsOk).length,
      ttsFail: ttsResults.filter((c) => !c.ttsOk).length,
      staticHard: staticReport.hardFail,
      next: 'Run: .venv/bin/python scripts/whisper_transcribe.py --dir extracted/listen_audit --model small --out extracted/listen_stt_raw.json && node scripts/listen_stt_audit.mjs --compare',
    },
    null,
    2
  )
);
if (ttsResults.some((c) => !c.ttsOk) || staticReport.hardFail) process.exitCode = 1;
