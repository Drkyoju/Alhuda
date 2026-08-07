#!/usr/bin/env node
/** Collect every unique string the app may send to TTS (speech maps + common UI). */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';
import { normalizeForElevenLabs } from '../elevenlabs-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Must match app.js TTS_VOICE + TTS_CACHE_VER when baking. */
export const BAKE_TTS_CACHE_VER = 'v30';
/** Fish Audio Arabic narrator (راوي). */
export const BAKE_TTS_VOICE = 'c3e5d81d807f4cbc9a0c2872a4dea9ea';
export const BAKE_TTS_VOICE_LABEL = 'Fish Audio Arabic narrator (راوي)';

export function loadSpeechMaps() {
  const window = {};
  const fn = new Function('window', readFileSync(join(root, 'speech-diacritics-map.js'), 'utf8'));
  fn(window);
  try {
    new Function('window', readFileSync(join(root, 'speech-pronunciation-lexicon.js'), 'utf8'))(window);
  } catch {
    /* optional */
  }
  return window;
}

const ARABIC_HARAKAT_RE = /[\u064B-\u065F\u0670\u0610-\u061A]/;
const SPEECH_WORD_RE = /[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g;

function stripHarakat(s) {
  return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
}

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

function scrubSpeechDiacriticsNoise(text) {
  let s = String(text || '');
  if (!s) return '';
  // Match prepareArabicForSpeech — tatweel/ZWNJ must not diverge bake keys from runtime.
  s = s.replace(/[\u0640\u200c\u200f]/g, '');
  // Orphan marks AFTER spaces only — never strip mid-word harakat (shadda+fatha).
  s = s.replace(/ +[\u064B-\u065F\u0670]+/g, ' ');
  s = s.split('َّمَنْ').join('مَنْ');
  s = s.split('َّوَمَنْ').join('وَمَنْ');
  // Passive عُبِدَ; fix broken bare عبد/عَبْد after ما (whole token — not عبده / عبد الله).
  s = s.replace(
    /م[\u064B-\u065F\u0670]*ا[\u064B-\u065F\u0670]*\s+ع[\u064B-\u065F\u0670]*ب[\u064B-\u065F\u0670]*د[\u064B-\u065F\u0670]*(?![\u0621-\u064A])(?!\s*[اأإآٱ][\u064B-\u065F\u0670]*ل)/g,
    'مَا عُبِدَ'
  );
  s = s.replace(
    /ك[\u064B-\u065F\u0670]*ل[\u064B-\u065F\u0670]*\s+م[\u064B-\u065F\u0670]*ا[\u064B-\u065F\u0670]*\s+ع[\u064B-\u065F\u0670]*ب[\u064B-\u065F\u0670]*د[\u064B-\u065F\u0670]*(?![\u0621-\u064A])(?!\s*[اأإآٱ][\u064B-\u065F\u0670]*ل)/g,
    'كُلُّ مَا عُبِدَ'
  );
  s = s.replace(/حق\s+الله\s+على\s+العباد/g, "حَقُّ اللَّهِ عَلَى الْعِبَادِ");
  s = s.replace(/على العباد/g, 'عَلَى الْعِبَادِ');
  s = s.split('الن ي').join('النبي');
  s = s.split("اللََّّ").join("اللَّه");
  s = s.split("لَعَنَ اللَّهِ").join("لَعَنَ اللَّهُ");
  s = s.split("لَعَنَ اللَّهَ").join("لَعَنَ اللَّهُ");
  // أنْ لا + مضارع منصوب — sync with app.js scrubSpeechDiacriticsNoise
  s = s.replace(/أَنَّ\s+لَا/g, 'أَنْ لَا');
  s = s.replace(/أَنّ\s+لَا/g, 'أَنْ لَا');
  s = s.replace(/أَنْ\s+لَا\s+يُعْبَد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "أَنْ لَا يُعْبَدَ اللَّهُ");
  s = s.replace(/أَنْ\s+لَا\s+يَعْبُد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "أَنْ لَا يَعْبُدَ اللَّهَ");
  s = s.replace(/ان\s+لا\s+يعبد\s+الله/g, "أَنْ لَا يَعْبُدَ اللَّهَ");
  s = s.split('الْحِكْمَةُ مَنْ خَلَقَ').join('الْحِكْمَةُ مِنْ خَلْقِ');
  s = s.split('الْحِكْمَةُ مَنْ').join('الْحِكْمَةُ مِنْ');
  // النبيُّ فاعل بعد أفعال شائعة
  s = s.split("بَعَثَ النَّبِيِّ").join("بَعَثَ النَّبِيُّ");
  s = s.split("أَمَرَ النَّبِيِّ").join("أَمَرَ النَّبِيُّ");
  s = s.split("حَذَّرَ النَّبِيِّ").join("حَذَّرَ النَّبِيُّ");
  s = s.split("لَعَنَ النَّبِيِّ").join("لَعَنَ النَّبِيُّ");
  s = s.split("قَالَ النَّبِيِّ").join("قَالَ النَّبِيُّ");
  s = s.split("أَرْسَلَ النَّبِيِّ").join("أَرْسَلَ النَّبِيُّ");
  s = s.split("غَيَّرَ النَّبِيِّ").join("غَيَّرَ النَّبِيُّ");
  s = s.split("عَلَّمَ النَّبِيِّ").join("عَلَّمَ النَّبِيُّ");
  s = s.split("قال النبيُّ").join("قَالَ النَّبِيُّ");
  const prep = [
    ['مَنْ دُون', 'مِنْ دُون'],
    ['مَنْ غَيْر', 'مِنْ غَيْر'],
    ['مَنْ أَهْل', 'مِنْ أَهْل'],
    ['مَنْ بَعْد', 'مِنْ بَعْد'],
    ['مَنْ قَبْل', 'مِنْ قَبْل'],
    ['مَنْ بَيْن', 'مِنْ بَيْن'],
    ['مَنْ عِنْد', 'مِنْ عِنْد'],
    ['مَنْ أَجْل', 'مِنْ أَجْل'],
    ['مَنْ خِلَال', 'مِنْ خِلَال'],
    ['مَنْ أَخْذِ', 'مِنْ أَخْذِ'],
    ['مَنْ أَخْذ', 'مِنْ أَخْذ'],
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
    ['مَنْ الشِّرْك', 'مِنْ الشِّرْك'],
    ['مَنْ الشِّرْك', 'مِنْ الشِّرْك'],
    ['مَنْ فَوَائِدِ', 'مِنْ فَوَائِدِ'],
    ['لَا يُقْبَلُ مَنْ', 'لَا يُقْبَلُ مِنْ'],
    ['يُقْبَلُ مَنْ', 'يُقْبَلُ مِنْ'],
    ['تَعْبُدُ اللَّهِ', 'تَعْبُدُ اللَّهَ'],
    ['يَعْبُدُ اللَّهِ', 'يَعْبُدُ اللَّهَ'],
    ['نَعْبُدُ اللَّهِ', 'نَعْبُدُ اللَّهَ'],
    ['يَعْبُدَ اللَّهِ', 'يَعْبُدَ اللَّهَ'],
    ['تَعْبُدَ اللَّهِ', 'تَعْبُدَ اللَّهَ'],
    ['وب فِيهِ للأم ة', 'وَبَيَّنَ فِيهِ لِلْأُمَّةِ'],
    ['وب فيه للأم ة', 'وَبَيَّنَ فِيهِ لِلْأُمَّةِ'],
    ['الْفَرْقُ بَيِّنٌ', 'الْفَرْقُ بَيْنَ'],
    ['الإصلاح بَيِّنٌ', 'الْإِصْلَاحَ بَيْنَ'],
    ['منزلة بَيِّنٌ', 'مَنْزِلَةٌ بَيْنَ'],
    ['النَّصِيحَةُ بَيِّنٌ', 'النَّصِيحَةَ بَيْنَ'],
    ['بَيِّنٌ النَّاس', 'بَيْنَ النَّاس'],
    ['بَيِّنٌ الشِّرْك', 'بَيْنَ الشِّرْك'],
    ['بَيِّنٌ الْمُس', 'بَيْنَ الْمُس'],
    ['بَيِّنٌ الْحَلَالُ', 'بَيْنَ الْحَلَالِ'],
    ['الْحَلَالَ بَيْنَ', 'الْحَلَالَ بَيِّنٌ'],
    ['الْحَرَامَ بَيْنَ', 'الْحَرَامَ بَيِّنٌ'],
    ['الْحَلَالُ بَيْنَ', 'الْحَلَالُ بَيِّنٌ'],
    ['الْحَرَامُ بَيْنَ', 'الْحَرَامُ بَيِّنٌ'],
    ['لَوْلَا الل', 'لَوْ لَا الل'],
    ['عَلَى غَيَّرَ الل', 'عَلَى غَيْرِ الل'],
    ['تَعْظِيمُ غَيَّرَ الل', 'تَعْظِيمِ غَيْرِ الل'],
    ["غَيَّرَ اللَّهِ", "غَيْرِ اللَّهِ"],
    ['فِي غَيَّرَ مَوْضِع', 'فِي غَيْرِ مَوْضِع'],
    ['غَيَّرَ الْقُرْآنُ', 'غَيْرَ الْقُرْآنِ'],
    ['مَنْ غَيَّرَ عَمْد', 'مِنْ غَيْرِ عَمْد'],
    ['غَيَّرَ مَا خُلقت', 'غَيْرَ مَا خُلِقَتْ'],
    ['مَنْ الشِّرْك', 'مِنْ الشِّرْك'],
    ['الْبَرَاءَةُ مَنْ', 'الْبَرَاءَةُ مِنْ'],
    ['الْخَوْفِ مَنْ', 'الْخَوْفِ مِنْ'],
    ['مَنْ الْعَمَلِ', 'مِنَ الْعَمَلِ'],
    ['مَنْ الْأَسْمَاءِ', 'مِنَ الْأَسْمَاءِ'],
    ['مَنْ الْأَشْجَارِ', 'مِنَ الْأَشْجَارِ'],
    ['مَنْ الْأُصُولُ', 'مِنَ الْأُصُولِ'],
    ['مَنْ الْعَيْنِ', 'مِنَ الْعَيْنِ'],
    ['الإسلامدين', 'الْإِسْلَامَ دِينُ'],
    ['المؤمنونإخوة', 'الْمُؤْمِنُونَ إِخْوَةٌ'],
    ['تغي ي الْمُنْكَرِ', 'تَغْيِيرِ الْمُنْكَرِ'],
    ["اللَّهِِوُ", "اللَّهْوُ"],
    ['اللَّهِِوُ', 'اللَّهْوُ'],
    ["غَضَبُ اللَّهُ", "غَضَبُ اللَّهِ"],
    ["لَعْنَةُ اللَّهُ", "لَعْنَةُ اللَّهِ"],
    ["لَعَنَ اللَّهِ مَنْ", "لَعَنَ اللَّهُ مَنْ"],
    ["ذِكْرِ اللَّهُ", "ذِكْرِ اللَّهِ"],
    ['عَلَيْهَا مَنْ:', 'عَلَيْهَا مِنْ:'],
    ['تُخْلُوهَا مَنْ:', 'تُخْلُوهَا مِنْ:'],
    ['الْمَقْصُودُ مَنْ:', 'الْمَقْصُودُ مِنْ:'],
    ["نَهَى النَّبِيِّ", "نَهَى النَّبِيُّ"],
    ["قَالَ لَهُ النَّبِيِّ", "قَالَ لَهُ النَّبِيُّ"],
    ["شَبَّهَ النَّبِيِّ", "شَبَّهَ النَّبِيُّ"],
    ['خُ لقوا', 'خُلِقُوا'],
    ['استعا ذ', 'اسْتَعَاذَ'],
    ['لولي المر', 'لِوَلِيِّ الْأَمْرِ'],
    ['ا منزه عَنْ الظُّلْمِ', "اللَّهُ مُنَزَّهٌ عَنِ الظُّلْمِ"],
    ['ا منزه عن الظلم', "اللَّهُ مُنَزَّهٌ عَنِ الظُّلْمِ"],
    ['يفيدهمفي', 'يُفِيدُهُمْ فِي'],
    ['جميعً ا', 'جَمِيعًا'],
    ['يَرْضَ ى', 'يَرْضَى'],
    ['م عصيته', 'مَعْصِيَتِهِ'],
    ['القر آن', 'الْقُرْآنَ'],
    ['طل ب ال', 'طَلَبِ ال'],
    ['ب الْعَمَلِ', 'بِالْعَمَلِ'],
    ['فضلالهجرة', 'فَضْلُ الْهِجْرَةِ'],
    ['األمة', "الْأُمَّةِ"],
    ['اجل واب:', ''],
    ['اجل واب', ''],
    ['عَلَى الْمُسْلِمُ أَنَّ', 'عَلَى الْمُسْلِمِ أَنْ'],
    ['بَلَدِ الْإِسْلَامُ', 'بَلَدِ الْإِسْلَامِ'],
    ['عَلَى طَاعَةُ', 'عَلَى طَاعَةِ'],
    ['صب عَلَى طَاعَةِ', 'صَبْرٌ عَلَى طَاعَةِ'],
    ['محارم اللَّهُ', "مَحَارِمِ اللَّهِ"],
    ['أَقْدَارِ اللَّهُ', "أَقْدَارِ اللَّهِ"],
    ['مَنْ أسباب', 'مِنْ أَسْبَابِ'],
    ['مَنْ الإيذاء', 'مِنَ الْإِيذَاءِ'],
    
    ['ا لمسيح', 'الْمَسِيحَ'],
    ['ف يسمونه', 'فَيُسَمُّونَهُ'],
    ['وأو قاته', 'وَأَوْقَاتِهِ'],
    ['كثي مَنْ', 'كَثِيرٌ مِنَ'],
    ['[ورة ', '[سُورَةُ '],
    ['[الزم ر:', "[الزُّمَرِ:"],
    ['المران', 'الْأَمْرَانِ'],
    ['الاكثار مَنْ', 'الْإِكْثَارِ مِنَ'],
    ['؛ لنها ', "؛ لِأَنَّهَا "],
    ['بالملا ئكة', 'بِالْمَلَائِكَةِ'],
    ['أولهم نوح', "أَوَّلُهُمْ نُوحٌ"],

    ['التسميةبالأص', "التَّسْمِيَةَ بِالْأُصُولِ"],
    ['أكمليالحديث', 'أَكْمِلِ الْحَدِيثَ'],
    ["أَحْكَامِ اللَّهُ", "أَحْكَامِ اللَّهِ"],
    ["بِكَلِمَاتِ اللَّهُ", "بِكَلِمَاتِ اللَّهِ"],
    ['العراض', 'الْأَعْرَاضِ'],
    ['الخيات', 'الْخَيْرَاتِ'],
    ['عَمَلٌ الخيرات', 'عَمَلِ الْخَيْرَاتِ'],

  ];
  for (const [a, b] of prep) s = s.split(a).join(b);
  s = s.replace(/\u0640+/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function stripForTts(text) {
  // Must stay in sync with app.js sanitizeTtsText — otherwise baked keys miss at runtime.
  return scrubSpeechDiacriticsNoise(
    String(text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, ' ')
      .replace(/\uFDFA/g, ' صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ ')
      .replace(/\uFDFB/g, ' جَلَّ جَلَالُهُ ')
      .replace(/[\u00AB\u00BB\u2018-\u201F\u2039\u203A\u300C-\u300F\u301D\u301E\uFF02\uFF07«»"'“”‘’‹›「」『』„‚]/g, ' ')
      .replace(/[﴿﴾]/g, ' ')
      .replace(/[.؟!…,:：;؛،()\[\]{}*_#<>=+~^`\/\\|–—•·\-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function applyPronunciationLexicon(text, lex) {
  if (!lex) return text;
  return String(text).replace(SPEECH_WORD_RE, (tok) => {
    if (ARABIC_HARAKAT_RE.test(tok)) return tok;
    const bare = stripHarakat(tok);
    return lex[bare] || tok;
  });
}

function applyWordDiacritics(text, wordMap, lex) {
  if (!wordMap && !lex) return text;
  return String(text).replace(SPEECH_WORD_RE, (tok) => {
    if (ARABIC_HARAKAT_RE.test(tok)) return tok;
    const bare = stripHarakat(tok);
    if (lex?.[bare]) return lex[bare];
    return (wordMap && wordMap[bare]) || tok;
  });
}

function normalizeForBake(text, maps = null) {
  // Mirror app.js prepareTtsPayload exactly — bake keys must match runtime.
  let s = String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s.length < 2) return '';
  const lex = maps?.SPEECH_PRON_LEXICON || null;
  const wordMap = maps?.SPEECH_WORD_MAP || null;
  s = hasWellFormedTashkeel(s)
    ? applyPronunciationLexicon(s, lex)
    : applyPronunciationLexicon(applyWordDiacritics(s, wordMap, lex), lex);
  s = fixAllahIrabInText(s);
  s = s.replace(/[\u0640\u200c\u200f]/g, '').replace(/\s+/g, ' ').trim();
  s = stripForTts(s);
  if (!s || s.length < 2) return '';
  return s;
}

export function collectTtsStrings() {
  const maps = loadSpeechMaps();
  const out = new Set();

  const add = (raw) => {
    const s = normalizeForBake(raw, maps);
    if (s && s.length >= 2) out.add(s);
  };

  for (const v of Object.values(maps.SPEECH_PHRASE_MAP || {})) add(v);
  for (const fields of Object.values(maps.SPEECH_BY_QUESTION_ID || {})) {
    for (const v of Object.values(fields || {})) add(v);
  }

  add('صَحّ');
  add('خَطَأٌ');
  add('الْإِجَابَةُ الصَّحِيحَةُ');
  add('إِجَابَتُكَ خَاطِئَةٌ');
  // Live API smoke (tests/api-live.spec.js) — bake exact raw string too.
  out.add('السلام عليكم');
  // Standalone الله-family forms only when already baked (CI coverage stays green).
  // Full phrases containing these forms are already in speech maps above.

  return [...out].sort((a, b) => a.length - b.length);
}

export function bakedTtsKey(text, voice = BAKE_TTS_VOICE, cacheVer = BAKE_TTS_CACHE_VER) {
  // Array#map passes (item, index, array) — never treat index as voice id.
  const v = typeof voice === 'string' && voice ? voice : BAKE_TTS_VOICE;
  const ver = typeof cacheVer === 'string' && cacheVer ? cacheVer : BAKE_TTS_CACHE_VER;
  return `${ver}::${v}::${String(text || '').slice(0, 600)}`;
}

export function bakedTtsFileNameSync(text, voice = BAKE_TTS_VOICE, cacheVer = BAKE_TTS_CACHE_VER) {
  return createHash('sha256').update(bakedTtsKey(text, voice, cacheVer)).digest('hex') + '.mp3';
}

export function bakedTtsHashFromKey(cacheKey) {
  return createHash('sha256').update(String(cacheKey || '')).digest('hex') + '.mp3';
}
