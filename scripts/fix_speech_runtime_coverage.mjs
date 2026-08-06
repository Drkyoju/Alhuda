#!/usr/bin/env node
/**
 * Fix SPEECH_BY_QUESTION_ID so bake keys match runtime prepareTtsPayload:
 * - Fill bare / partial-harakat fields via lexicon + word map
 * - Apply iʿrāb scrub (النبيُّ فاعل، مِنْ أَخْذ، …)
 * - Patch known OCR corruptions in SPEECH_PHRASE_MAP
 * - Rewrite speech-diacritics-map.js SPEECH_BY_QUESTION_ID (+ phrase OCR fixes)
 *
 * Usage: node scripts/fix_speech_runtime_coverage.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mapPath = join(root, 'speech-diacritics-map.js');
const bank = Object.values(JSON.parse(readFileSync(join(root, 'questions-bank.json'), 'utf8'))).flat();

const win = {};
new Function('window', readFileSync(mapPath, 'utf8'))(win);
new Function('window', readFileSync(join(root, 'speech-pronunciation-lexicon.js'), 'utf8'))(win);

const LEX = win.SPEECH_PRON_LEXICON || {};
const WORD = win.SPEECH_WORD_MAP || {};
const PHRASE = win.SPEECH_PHRASE_MAP || {};
const BY_ID = { ...(win.SPEECH_BY_QUESTION_ID || {}) };

const ARABIC_HARAKAT_RE = /[\u064B-\u065F\u0670\u0610-\u061A]/;
const SPEECH_WORD_RE = /[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g;
const stripHarakat = (s) => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');

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

function harakatRatio(s) {
  const words = String(s || '').match(/[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g) || [];
  if (!words.length) return 0;
  let h = 0;
  for (const w of words) if (ARABIC_HARAKAT_RE.test(w)) h++;
  return h / words.length;
}

function applyLexOrWord(text, useWordMap) {
  return String(text).replace(SPEECH_WORD_RE, (tok) => {
    if (ARABIC_HARAKAT_RE.test(tok)) return tok;
    const bare = stripHarakat(tok);
    if (LEX[bare]) return LEX[bare];
    if (useWordMap && WORD[bare]) return WORD[bare];
    return tok;
  });
}

/** Shared scrub — keep in sync with app.js + collect_tts_strings.mjs */
function scrubIrb(text) {
  let s = String(text || '');
  s = s.replace(/[\u0640\u200c\u200f]/g, '');
  s = s.replace(/ +[\u064B-\u065F\u0670]+/g, ' ');
  const pairs = [
    ['َّمَنْ', 'مَنْ'],
    ['َّوَمَنْ', 'وَمَنْ'],
    ['عُبِدَ', 'عَبْد'],
    ['الن ي', 'النبي'],
    ["اللََّّ", "اللَّه"],
    ["لَعَنَ اللَّهِ", "لَعَنَ اللَّهَ"],
    ['الْحِكْمَةُ مَنْ خَلَقَ', 'الْحِكْمَةُ مِنْ خَلْقِ'],
    ['الْحِكْمَةُ مَنْ', 'الْحِكْمَةُ مِنْ'],
    // النبيُّ as subject after common verbs
    ["بَعَثَ النَّبِيِّ", "بَعَثَ النَّبِيُّ"],
    ["أَمَرَ النَّبِيِّ", "أَمَرَ النَّبِيُّ"],
    ["حَذَّرَ النَّبِيِّ", "حَذَّرَ النَّبِيُّ"],
    ["حَذّرَ النَّبِيِّ", "حَذَّرَ النَّبِيُّ"],
    ["لَعَنَ النَّبِيِّ", "لَعَنَ النَّبِيُّ"],
    ["قَالَ النَّبِيِّ", "قَالَ النَّبِيُّ"],
    ["أَرْسَلَ النَّبِيِّ", "أَرْسَلَ النَّبِيُّ"],
    ["غَيَّرَ النَّبِيِّ", "غَيَّرَ النَّبِيُّ"],
    ["عَلَّمَ النَّبِيِّ", "عَلَّمَ النَّبِيُّ"],
    ["قال النبيُّ", "قَالَ النَّبِيُّ"],
    // مِنْ not مَنْ
    ['مَنْ أَخْذِ', 'مِنْ أَخْذِ'],
    ['مَنْ أَخْذ', 'مِنْ أَخْذ'],
    ['مَنْ دُون', 'مِنْ دُون'],
    ['مَنْ غَيْر', 'مِنْ غَيْر'],
    ['مَنْ أَهْل', 'مِنْ أَهْل'],
    ['مَنْ بَعْد', 'مِنْ بَعْد'],
    ['مَنْ قَبْل', 'مِنْ قَبْل'],
    ['مَنْ بَيْن', 'مِنْ بَيْن'],
    ['مَنْ عِنْد', 'مِنْ عِنْد'],
    ['مَنْ أَجْل', 'مِنْ أَجْل'],
    ['مَنْ خِلَال', 'مِنْ خِلَال'],
    ['يُخْرِجُ مَنْ', 'يُخْرِجُ مِنْ'],
    ['يَخْرُجُ مَنْ', 'يَخْرُجُ مِنْ'],
    ['مَنْ الْمِلَّة', 'مِنْ الْمِلَّة'],
    ['مَنْ الْعِبَاد', 'مِنْ الْعِبَاد'],
    ['مَنْ الْخَلْق', 'مِنْ الْخَلْق'],
    ['مَنْ الذُّنُوب', 'مِنْ الذُّنُوب'],
    ['مَنْ الْكَبَائِر', 'مِنْ الْكَبَائِر'],
    ['مَنْ أَعْظَم', 'مِنْ أَعْظَم'],
    ['مَنْ أَمْثِلَة', 'مِنْ أَمْثِلَة'],
    ['مَنْ أَرْكَان', 'مِنْ أَرْكَان'],
    ['مَنْ تَمَام', 'مِنْ تَمَام'],
    ['مَنْ شُرُوط', 'مِنْ شُرُوط'],
    ['مَنْ أَنْوَاع', 'مِنْ أَنْوَاع'],
    ['مَنْ أَقْسَام', 'مِنْ أَقْسَام'],
    ["مَنْ الشِّرْك", "مِنْ الشِّرْك"],
    ['مَنْ الشِّرْك', 'مِنْ الشِّرْك'],
    ['مَنْ فَوَائِدِ', 'مِنْ فَوَائِدِ'],
    ['لَا يُقْبَلُ مَنْ', 'لَا يُقْبَلُ مِنْ'],
    ['يُقْبَلُ مَنْ', 'يُقْبَلُ مِنْ'],
    ["تَعْبُدُ اللَّهِ", "تَعْبُدُ اللَّهَ"],
    ["يَعْبُدُ اللَّهِ", "يَعْبُدُ اللَّهَ"],
    ["نَعْبُدُ اللَّهِ", "نَعْبُدُ اللَّهَ"],
    ["يَعْبُدَ اللَّهِ", "يَعْبُدَ اللَّهَ"],
    ["تَعْبُدَ اللَّهِ", "تَعْبُدَ اللَّهَ"],
    // OCR
    ['وب فِيهِ للأم ة', 'وَبَيَّنَ فِيهِ لِلْأُمَّةِ'],
    ['وب فيه للأم ة', 'وَبَيَّنَ فِيهِ لِلْأُمَّةِ'],
    ['وب فِيهِ للأمة', 'وَبَيَّنَ فِيهِ لِلْأُمَّةِ'],
    ['الإسلامدين', 'الْإِسْلَامَ دِينُ'],
    ['المؤمنونإخوة', 'الْمُؤْمِنُونَ إِخْوَةٌ'],
    ['كلل يعرفه', 'كُلٌّ يَعْرِفُهُ'],
    ['تغي ي الْمُنْكَرِ', 'تَغْيِيرِ الْمُنْكَرِ'],
    ['يبأحكامه وأ مور', 'يَبْنِيَ أَحْكَامَهُ وَأُمُورَ'],
  ];
  for (const [a, b] of pairs) s = s.split(a).join(b);
  return s.replace(/\s+/g, ' ').trim();
}

function diacritizeFull(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  const key = stripHarakat(s)
    .replace(/[^\u0621-\u064A\u0671\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (PHRASE[key]) s = String(PHRASE[key]).trim();
  const useWord = !hasWellFormedTashkeel(s) || harakatRatio(s) < 0.85;
  s = applyLexOrWord(s, useWord);
  s = fixAllahIrabInText(s);
  s = scrubIrb(s);
  return s;
}

/** Hand-curated overrides for critical / ambiguous questions */
const CURATED = {
  '3c5586ce-b648-5692-8627-d7418aae60d9': {
    q: "إِلَى أَيْنَ بَعَثَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ مُعَاذَ بْنَ جَبَلٍ رَضِيَ اللَّهُ عَنْهُ؟",
    a0: 'الْيَمَنِ',
    a1: 'الشَّامِ',
    a2: 'مِصْرَ',
    a3: 'الْعِرَاقِ',
    exp: "بَعَثَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ مُعَاذًا إِلَى الْيَمَنِ دَاعِيًا وَمُعَلِّمًا.",
  },
  '7704f604-a213-51b3-4086-d4eb4310823e': {
    q: "حَذَّرَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ مُعَاذًا مِنْ أَخْذِ:",
  },
  'fac8127c-fbb2-ed3f-5253-963589a39e05': {
    q: "حَذَّرَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ مُعَاذًا مِنْ أَخْذِ كَرَائِمِ الْأَمْوَالِ، أَيْ:",
  },
  'b0d7fe00-2b72-a49e-2c28-309dd65fa569': {
    q: 'بَعْدَ التَّوْحِيدِ فِي حَدِيثِ مُعَاذٍ، مَاذَا فُرِضَ عَلَيْهِمْ مِنَ الصَّلَوَاتِ؟',
  },
  'ee419252-53dc-c1f9-383c-9a3023698050': {
    q: 'فِي حَدِيثِ مُعَاذٍ رَضِيَ اللَّهُ عَنْهُ لَمَّا بُعِثَ إِلَى الْيَمَنِ: مِنْ أَيْنَ تُؤْخَذُ الزَّكَاةُ وَإِلَى مَنْ تُرَدُّ؟',
    a0: 'مِنْ أَغْنِيَائِهِمْ وَتُرَدُّ عَلَى فُقَرَائِهِمْ',
    a1: 'مِنَ الْفُقَرَاءِ وَتُرَدُّ عَلَى الْأَغْنِيَاءِ',
    a2: 'مِنَ التُّجَّارِ وَتُرَدُّ إِلَى الْمَسَاجِدِ',
    a3: 'مِنَ الْجَمِيعِ وَتُرَدُّ إِلَى بَيْتِ الْمَالِ',
    exp: 'فِي وَصِيَّةِ النَّبِيِّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ لِمُعَاذٍ: فَإِنْ هُمْ أَطَاعُوا لِذَلِكَ فَأَخْبِرْهُمْ أَنَّ اللَّهَ قَدْ فَرَضَ عَلَيْهِمْ صَدَقَةً تُؤْخَذُ مِنْ أَغْنِيَائِهِمْ فَتُرَدُّ عَلَى فُقَرَائِهِمْ.',
  },
  '056c9e25-4057-d6bb-40b9-68c439b5ee1b': {
    q: 'مَاذَا قَالَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ عَنْ دَعْوَةِ الْمَظْلُومِ؟',
    a0: 'لَيْسَ بَيْنَهَا وَبَيْنَ اللَّهِ حِجَابٌ',
    a1: 'تُسْتَجَابُ بَعْدَ سَنَةٍ',
    a2: 'لَا تُسْتَجَابُ لِلْكَافِرِ',
    a3: 'تُرَدُّ عَلَى صَاحِبِهَا',
    exp: 'قَالَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ: وَاتَّقِ دَعْوَةَ الْمَظْلُومِ؛ فَإِنَّهُ لَيْسَ بَيْنَهَا وَبَيْنَ اللَّهِ حِجَابٌ.',
  },
};

const OCR_PHRASE_FIXES = [
  [
    'من فوائد الحديث 2 الايمان ان الله انزل علي رسوله الكتاب وب فيه للام ه ما تحتاج اليه من حلال وحرام',
    "مِنْ فَوَائِدِ الْحَدِيثِ (2- الْإِيمَانِ): أَنَّ اللَّهَ أَنْزَلَ عَلَى رَسُولِهِ الْكِتَابَ وَبَيَّنَ فِيهِ لِلْأُمَّةِ مَا تَحْتَاجُ إِلَيْهِ مِنْ حَلَالٍ وَحَرَامٍ؟",
  ],
  [
    'نعم ان الله انزل علي رسوله الكتاب وب فيه للام ه ما تحتاج اليه من حلال وحرام',
    "نَعَمْ، أَنَّ اللَّهَ أَنْزَلَ عَلَى رَسُولِهِ الْكِتَابَ وَبَيَّنَ فِيهِ لِلْأُمَّةِ مَا تَحْتَاجُ إِلَيْهِ مِنْ حَلَالٍ وَحَرَامٍ.",
  ],
];

let updatedFields = 0;
let curatedFields = 0;

for (const q of bank) {
  if (!q?.id) continue;
  const opts = q.a || q.options || [];
  const rawFields = {
    q: q.q || q.question_text || '',
    exp: q.explanation || q.exp || '',
    quote: q.source_quote || q.quote || '',
  };
  opts.forEach((o, i) => {
    if (o != null && o !== '') rawFields[`a${i}`] = o;
  });

  const entry = { ...(BY_ID[q.id] || {}) };
  const curated = CURATED[q.id] || {};
  let changed = false;

  for (const [field, raw] of Object.entries(rawFields)) {
    if (!raw) continue;
    if (curated[field]) {
      if (entry[field] !== curated[field]) {
        entry[field] = curated[field];
        curatedFields++;
        changed = true;
      }
      continue;
    }
    const current = entry[field] || raw;
    const ratio = harakatRatio(current);
    const well = hasWellFormedTashkeel(current);
    // Refresh incomplete / OCR-ish fields
    if (!well || ratio < 0.85 || /وب\s*ف|للأم\s*ة|الإسلامدين|المؤمنونإخوة|تغي ي|كلل |وأ مور/.test(current)) {
      const filled = diacritizeFull(current);
      if (filled && filled !== current) {
        entry[field] = filled;
        updatedFields++;
        changed = true;
      }
    } else {
      // Still scrub iʿrāb on well-formed maps
      const scrubbed = scrubIrb(fixAllahIrabInText(current));
      if (scrubbed && scrubbed !== current) {
        entry[field] = scrubbed;
        updatedFields++;
        changed = true;
      }
    }
  }

  if (changed) BY_ID[q.id] = entry;
}

for (const [k, v] of OCR_PHRASE_FIXES) {
  if (PHRASE[k] !== v) PHRASE[k] = v;
}

// Rebuild SPEECH_BY_QUESTION_ID section in the map file
const src = readFileSync(mapPath, 'utf8');
const marker = 'window.SPEECH_BY_QUESTION_ID = ';
const idx = src.indexOf(marker);
if (idx < 0) throw new Error('SPEECH_BY_QUESTION_ID not found');

const before = src.slice(0, idx);
// Also patch phrase OCR values in-place via simple replace of known bad strings
let beforePatched = before;
for (const bad of [
  'وب فِيهِ للأم ة',
  'وب فيه للأم ة',
]) {
  if (beforePatched.includes(bad)) {
    beforePatched = beforePatched.split(bad).join('وَبَيَّنَ فِيهِ لِلْأُمَّةِ');
  }
}

const byIdLiteral = `window.SPEECH_BY_QUESTION_ID = ${JSON.stringify(BY_ID, null, 2)};\n`;

writeFileSync(mapPath, beforePatched + byIdLiteral, 'utf8');

console.log(JSON.stringify({
  questions: bank.length,
  byIdEntries: Object.keys(BY_ID).length,
  updatedFields,
  curatedFields,
  phraseOcrFixes: OCR_PHRASE_FIXES.length,
}, null, 2));
