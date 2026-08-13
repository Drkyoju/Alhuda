/** Fish Audio text-to-speech — sole lesson TTS provider (Quran stays Hudhaify). */

import { fixAllahIrabInText } from './allah-irab.js';

/**
 * PERMANENT lesson voice — «راوٍ عربي حكيم» only (sample set 19_fish_hakim_*).
 * No other Fish / Azure / ElevenLabs / Google voices are selectable.
 */
export const DEFAULT_FISH_VOICE_ID = 'aa9c8260269c411d9863ab1b1bfa3158';
export const FISH_VOICE_NAME_AR = 'راوٍ عربي حكيم';
/** Production Fish model — Quran ayahs stay Hudhaify, not this engine. */
export const DEFAULT_FISH_MODEL = 's2.1-pro';
export const FISH_TTS_ENDPOINT = 'https://api.fish.audio/v1/tts';

/** High-clarity defaults for vocalized Modern Standard Arabic (tashkeel). */
export const FISH_QUALITY_DEFAULTS = Object.freeze({
  format: 'mp3',
  mp3_bitrate: 192, // max documented MP3 quality
  sample_rate: 44100,
  // balanced = faster first byte; normal caused multi-second silence before audio.
  latency: 'balanced',
  normalize: false, // keep Arabic harakat — do not rewrite diacritics
  chunk_length: 300, // max continuity for long vocalized sentences
  temperature: 0.22, // stick tightly to provided tashkeel/iʿrāb (v265 baseline)
  top_p: 0.4,
  repetition_penalty: 1.35,
  prosody: {
    // v279+ question/default pace — slightly quicker, still natural (was 1.05).
    speed: 1.08,
    // Mild clarity — 13→14; never approach v267 volume 18.
    volume: 14,
    normalize_loudness: true,
  },
});

export function fishAudioConfigured(env = process.env) {
  return !!String(env?.FISH_API_KEY || '').trim();
}

export function isFishReferenceId(voiceId) {
  // Fish voice/model reference ids are 32-char hex (e.g. 03ea787e74ac4cf088e90bb7db0a43ed).
  return /^[a-f0-9]{32}$/i.test(String(voiceId || '').trim());
}

export function resolveFishVoiceId(_voiceId, _env = process.env) {
  // Hard lock — ignore request body, env overrides, and legacy voice catalogs.
  return DEFAULT_FISH_VOICE_ID;
}

export function resolveFishModel(_env = process.env) {
  return DEFAULT_FISH_MODEL;
}

/**
 * Keep harakat/tashkeel for correct Arabic reading.
 * Strip only punctuation/symbols Fish would vocalize («نقطتان», commas…).
 */
export function stripTtsPunctuation(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, ' ')
    .replace(/[\u00AB\u00BB\u2018-\u201F\u2039\u203A\u300C-\u300F\u301D\u301E\uFF02\uFF07«»"'“”‘’‹›「」『』„‚]/g, ' ')
    .replace(/[﴿﴾]/g, ' ')
    .replace(/[.؟!…‥∶::：;؛،٫٬%٪‰()\[\]{}*_#<>+=~^`\\/|–—―•·\-_٬،]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-token عبد/عَبْد… after ما → passive عُبِدَ (not عبده / عبد الله). */
const MA_UBIDA_RE =
  /م[\u064B-\u065F\u0670]*ا[\u064B-\u065F\u0670]*\s+ع[\u064B-\u065F\u0670]*ب[\u064B-\u065F\u0670]*د[\u064B-\u065F\u0670]*(?![\u0621-\u064A])(?!\s*[اأإآٱ][\u064B-\u065F\u0670]*ل)/g;
const KULLU_MA_UBIDA_RE =
  /ك[\u064B-\u065F\u0670]*ل[\u064B-\u065F\u0670]*\s+م[\u064B-\u065F\u0670]*ا[\u064B-\u065F\u0670]*\s+ع[\u064B-\u065F\u0670]*ب[\u064B-\u065F\u0670]*د[\u064B-\u065F\u0670]*(?![\u0621-\u064A])(?!\s*[اأإآٱ][\u064B-\u065F\u0670]*ل)/g;

import {
  bareArabicKey,
  SHORT_SPEECH_CARRIERS,
  applyShortSpeechCarriers,
} from './short-speech-carriers.js';
import { applyHarakatPolicy } from './speech-harakat-policy.js';

export { bareArabicKey, SHORT_SPEECH_CARRIERS, applyShortSpeechCarriers };

/**
 * Hijri year abbreviation → spoken «هِجْرِيَّة» (Fish misreads bare «ه» / «هـ»).
 * Speech-only — UI may keep «1206 ه» / «1115هـ». Idempotent if already «هجرية».
 * Western + Arabic-Indic digits; optional tatweel on هـ.
 */
export const HIJRI_YEAR_SPEECH = 'هِجْرِيَّة';

/** Spoken year bodies for ultra-short MC year options (digits alone confuse Fish/Whisper). */
const HIJRI_YEAR_WORDS = Object.freeze({
  '1115': 'أَلْفٍ وَمِائَةٍ وَخَمْسَةَ عَشَرَ',
  '1150': 'أَلْفٍ وَمِائَةٍ وَخَمْسِينَ',
  '1100': 'أَلْفٍ وَمِائَةٍ',
  '1206': 'أَلْفٍ وَمِائَتَيْنِ وَسِتٍّ',
  '1300': 'أَلْفٍ وَثَلَاثِمِائَةٍ',
});

/** Nawawi forty-hadith ordinals (feedback «فوائد حديث N- …»). */
const HADITH_NUM_WORDS = Object.freeze({
  1: 'الْأَوَّلِ',
  2: 'الثَّانِي',
  3: 'الثَّالِثِ',
  4: 'الرَّابِعِ',
  5: 'الْخَامِسِ',
  6: 'السَّادِسِ',
  7: 'السَّابِعِ',
  8: 'الثَّامِنِ',
  9: 'التَّاسِعِ',
  10: 'الْعَاشِرِ',
  11: 'الْحَادِيَ عَشَرَ',
  12: 'الثَّانِيَ عَشَرَ',
  13: 'الثَّالِثَ عَشَرَ',
  14: 'الرَّابِعَ عَشَرَ',
  15: 'الْخَامِسَ عَشَرَ',
  16: 'السَّادِسَ عَشَرَ',
  17: 'السَّابِعَ عَشَرَ',
  18: 'الثَّامِنَ عَشَرَ',
  19: 'التَّاسِعَ عَشَرَ',
  20: 'الْعِشْرِينَ',
  21: 'الْحَادِي وَالْعِشْرِينَ',
  22: 'الثَّانِي وَالْعِشْرِينَ',
  23: 'الثَّالِث وَالْعِشْرِينَ',
  24: 'الرَّابِع وَالْعِشْرِينَ',
  25: 'الْخَامِس وَالْعِشْرِينَ',
  26: 'السَّادِس وَالْعِشْرِينَ',
  27: 'السَّابِع وَالْعِشْرِينَ',
  28: 'الثَّامِن وَالْعِشْرِينَ',
  29: 'التَّاسِع وَالْعِشْرِينَ',
  30: 'الثَّلَاثِينَ',
  31: 'الْحَادِي وَالثَّلَاثِينَ',
  32: 'الثَّانِي وَالثَّلَاثِينَ',
  33: 'الثَّالِث وَالثَّلَاثِينَ',
  34: 'الرَّابِع وَالثَّلَاثِينَ',
  35: 'الْخَامِس وَالثَّلَاثِينَ',
  36: 'السَّادِس وَالثَّلَاثِينَ',
  37: 'السَّابِع وَالثَّلَاثِينَ',
  38: 'الثَّامِن وَالثَّلَاثِينَ',
  39: 'التَّاسِع وَالثَّلَاثِينَ',
  40: 'الْأَرْبَعِينَ',
});

function expandNawawiFawaidHadith(text) {
  let s = String(text || '');
  const toWest = (num) =>
    Number(String(num).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
  const ordOf = (num) => HADITH_NUM_WORDS[toWest(num)] || String(num);
  // هذه من فوائد حديث (18- التقوى)
  s = s.replace(
    /هذ[ههِ]\s+من\s+فوائد\s+حديث\s*\(\s*([0-9٠-٩]{1,2})\s*[-–—]\s*([^)]+)\)/g,
    (_, num, title) => `هَذِهِ مِنْ فَوَائِدِ الْحَدِيثِ ${ordOf(num)} فِي ${String(title).trim()}`
  );
  s = s.replace(
    /هَذِهِ\s+من\s+فَوَائِدِ\s+حَدِيث[ٌُِ]?\s*\(?\s*([0-9٠-٩]{1,2})\s*[-–—]?\s*([^)\s]+)/g,
    (_, num, title) => `هَذِهِ مِنْ فَوَائِدِ الْحَدِيثِ ${ordOf(num)} فِي ${String(title).trim()}`
  );
  // Prepared leftover: فَوَائِدِ حَدِيثٌ 18 التَّقْوَى
  s = s.replace(
    /فَوَائِدِ\s+حَدِيث[ٌُِ]?\s+([0-9٠-٩]{1,2})\s+/g,
    (_, num) => `فَوَائِدِ الْحَدِيثِ ${ordOf(num)} فِي `
  );
  return s;
}

function padHijriYearUtterance(yearToken) {
  const w = HIJRI_YEAR_WORDS[yearToken];
  // Fidelity: expand digits→words when known; always keep هجرية (abbrev expand). No أعني/عام inventing.
  return w ? `${w} هِجْرِيَّةً` : `${yearToken} هِجْرِيَّةً`;
}

export function expandHijriYearForSpeech(text) {
  let s = String(text || '');
  // 1115 ه / 1206هـ / ١١١٥ه — not «1206 هجرية» (negative lookahead on ج)
  s = s.replace(
    /([0-9٠-٩]{2,4})\s*ه\u0640?(?![\u064B-\u065F\u0670]*ج)/g,
    `$1 ${HIJRI_YEAR_SPEECH}`
  );
  // Lone «هـ» (tatweel form) after non-letter — not inside الله
  s = s.replace(/(^|[^\u0621-\u064A])ه\u0640(?=[^\u0621-\u064A]|$)/g, `$1${HIJRI_YEAR_SPEECH}`);
  // Ultra-short year-only MC options — pad (+ Arabic year words when known)
  s = s.replace(/^([0-9٠-٩]{2,4})\s+هِجْرِيَّةً?$/u, (_, y) => padHijriYearUtterance(y));
  s = s.replace(/^([0-9٠-٩]{2,4})\s+هجرية$/u, (_, y) => padHijriYearUtterance(y));
  s = s.replace(/^أَعْنِي\s+عَامَ\s+([0-9٠-٩]{2,4})\s+هِجْرِيَّةً?$/u, (_, y) => padHijriYearUtterance(y));
  return s;
}

/**
 * Systematic case endings for Fish: مجرور after حرف جر / ظرف، منصوب after أنْ لا،
 * إنّ/أنّ + الله. Safe ending swaps only — bare letters unchanged.
 */
export function applySystematicCaseEndings(text) {
  let s = String(text || '');
  // أنْ لا + مضارع → منصوب (َ)
  s = s.replace(/أن\s+لا\s+يعبد\s+الله/g, "أَنْ لَا يَعْبُدَ اللَّهَ");
  s = s.replace(/أَنْ\s+لَا\s+يَعْبُدُ/g, 'أَنْ لَا يَعْبُدَ');
  s = s.replace(/أَنْ\s+لَا\s+تَعْبُدُ/g, 'أَنْ لَا تَعْبُدَ');
  s = s.replace(/أَنْ\s+لَا\s+نَعْبُدُ/g, 'أَنْ لَا نَعْبُدَ');
  s = s.replace(/أَنْ\s+لَا\s+يُشْرِكُ/g, 'أَنْ لَا يُشْرِكَ');
  // حرف جر / ظرف + اسم معرف بـال wrong *final* damma → kasra (مجرور).
  // Greedy stem + trailing ُ — never touch mid-word damma (أُصُول).
  for (const prep of ['فِي', 'مِنْ', 'مِنَ', 'إِلَى', 'عَلَى', 'عَنْ', 'عَنِ', 'بَعْدَ', 'قَبْلَ', 'عِنْدَ', 'مَعَ']) {
    s = s.replace(
      new RegExp(`(${prep})\\s+((?:ال|الْ)[\\u0621-\\u064A\\u0671\\u064B-\\u065F\\u0670]*)ُ(?![\\u0621-\\u064A\\u0671])`, 'g'),
      '$1 $2ِ'
    );
  }
  s = s.replace(/(^|[^\u0621-\u064A])في\s+((?:ال|الْ)[\u0621-\u064A\u0671\u064B-\u065F\u0670]*)ُ(?![\u0621-\u064A\u0671])/g, '$1فِي $2ِ');
  s = s.replace(/(^|[^\u0621-\u064A])من\s+((?:ال|الْ)[\u0621-\u064A\u0671\u064B-\u065F\u0670]*)ُ(?![\u0621-\u064A\u0671])/g, '$1مِنْ $2ِ');
  s = s.replace(/(^|[^\u0621-\u064A])بعد\s+((?:ال|الْ)[\u0621-\u064A\u0671\u064B-\u065F\u0670]*)ُ(?![\u0621-\u064A\u0671])/g, '$1بَعْدَ $2ِ');
  // في قولُه → قولِه
  s = s.replace(/فِي\s+قَوْلُه/g, 'فِي قَوْلِه');
  s = s.replace(/في\s+قولُه/g, 'فِي قَوْلِه');
  s = s.replace(/في\s+قوله/g, 'فِي قَوْلِهِ');
  // مِنَ الشِّرْكُ → مجرور
  s = s.replace(/مِنَ\s+الشِّرْكُ/g, "مِنَ الشِّرْكِ");
  s = s.replace(/مِنَ\s+الشِّرْكُ/g, 'مِنَ الشِّرْكِ');
  s = s.replace(/من\s+الشركُ/g, "مِنَ الشِّرْكِ");
  // إنّ/أنّ الله — منصوب
  s = s.replace(/إِنَّ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "إِنَّ اللَّهَ");
  s = s.replace(/أَنَّ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "أَنَّ اللَّهَ");
  s = s.replace(/(^|[^\u0621-\u064A])إن\s+الله/g, "$1إِنَّ اللَّهَ");
  s = s.replace(/(^|[^\u0621-\u064A])أن\s+الله(?!\s*إلا)/g, "$1أَنَّ اللَّهَ");
  s = s.replace(/عَلَى\s+طَاعَةُ/g, 'عَلَى طَاعَةِ');
  s = s.replace(/عَلَى\s+مَعْصِيَةُ/g, 'عَلَى مَعْصِيَةِ');
  // v342: على + حُسْنُ → مجرور (map KEEP often leaves nominative)
  s = s.replace(/عَلَى\s+حُسْنُ/g, 'عَلَى حُسْنِ');
  s = s.replace(/لِأَنَّ\s+الْحُكْمُ/g, 'لِأَنَّ الْحُكْمَ');
  return s;
}

export function prepareFishTtsText(text) {
  // Preserve formation (harakat); expand honorifics; drop marks spoken as words.
  // NEVER strip mid-word harakat — Fish needs tashkeel to avoid «اللاه» / mangled iʿrāb.
  let s = String(text || '');
  // Ultra-short MC carriers BEFORE digit expand (so «لأنها 3 فصول» matches bare key)
  s = applyShortSpeechCarriers(s.trim());
  // Years: «1206 ه» / «1115هـ» → speak هجرية (before punctuation strip)
  s = expandHijriYearForSpeech(s);
  // Nawawi feedback: فوائد حديث (18- التقوى) → ordinal words (Fish mangles bare 18/31/32)
  s = expandNawawiFawaidHadith(s);
  s = s.replace(/\uFDFA/g, ' صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ ');
  s = s.replace(/\uFDFB/g, ' جَلَّ جَلَالُهُ ');
  s = s.replace(/صلعم/g, ' صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ ');
  s = s.replace(/\(ص\)/g, ' صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ ');
  // Critical passive «عُبِدَ» — bare/broken ما عبد / مَا عَبْد (not عبده / عبد الله).
  s = s.replace(MA_UBIDA_RE, 'مَا عُبِدَ');
  s = s.replace(KULLU_MA_UBIDA_RE, 'كُلُّ مَا عُبِدَ');
  // Verb لَعَنَ takes الله as فاعل مرفوع.
  s = s.replace(/لَعَنَ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "لَعَنَ اللَّهُ");
  s = s.replace(/لعن\s+الله/g, "لَعَنَ اللَّهُ");
  // يعبد/تعبد/نعبد + الله → منصوب
  s = s.replace(/يَعْبُدُ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "يَعْبُدُ اللَّهَ");
  s = s.replace(/تَعْبُدُ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "تَعْبُدُ اللَّهَ");
  s = s.replace(/نَعْبُدُ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "نَعْبُدُ اللَّهَ");
  s = s.replace(/أَنْ\s+تَعْبُد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "أَنْ تَعْبُدَ اللَّهَ");
  // أنْ لا + مضارع منصوب — never أنَّ لا يُعْبَدُ اللَّهِ (map OCR).
  s = s.replace(/أَنَّ\s+لَا/g, 'أَنْ لَا');
  s = s.replace(/أَنّ\s+لَا/g, 'أَنْ لَا');
  s = s.replace(/أَنْ\s+لَا\s+يُعْبَد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "أَنْ لَا يُعْبَدَ اللَّهُ");
  s = s.replace(/أَنْ\s+لَا\s+يَعْبُد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "أَنْ لَا يَعْبُدَ اللَّهَ");
  s = s.replace(/ان\s+لا\s+يعبد\s+الله/g, "أَنْ لَا يَعْبُدَ اللَّهَ");
  s = s.replace(/أن\s+لا\s+يعبد\s+الله/g, "أَنْ لَا يَعْبُدَ اللَّهَ");
  s = s.replace(/يعبد\s+الله/g, "يَعْبُدُ اللَّهَ");
  s = s.replace(/تعبد\s+الله/g, "تَعْبُدُ اللَّهَ");
  s = s.replace(/نعبد\s+الله/g, "نَعْبُدُ اللَّهَ");
  // OCR/map often puts fatha BEFORE shadda (أَنَّ); NFC wants shadda then vowel (أَنَّ).
  s = s.replace(/([\u064E\u064F\u0650])(\u0651)/g, '$2$1');
  // أن / بِأَن المصدرية + مضارع — wrong أنّ/بِأَنّ mangled clone voice («أنّ يعلّمهم»).
  // Keep أنّ before ism stems starting with ي/ت/ن (نزولها / توحيد / يوم) — haraka alone
  // is NOT enough (نُزُولَهَا has damma on ن and must stay أنّ).
  {
    const keepIsm =
      /^(نزول|نزور|نفس|نوع|نصيب|نحو|نهي|نور|نار|يوم|يوسف|يونس|يهود|توحيد|توبة|ترك|تميم|تيسير|يأس|يده)/;
    const toMasdar = (m, sp, verb) => {
      const bare = String(verb || '').replace(/[\u064B-\u065F\u0670]/g, '');
      if (keepIsm.test(bare)) return m;
      return (m.startsWith('بِ') ? 'بِأَنْ' : 'أَنْ') + sp + verb;
    };
    // Full vocalized token — «نُزُولَهَا» must keep أنّ (not stop at نُز).
    s = s.replace(/(?:بِ)?أَنَّ(\s+)([يتن][\u0621-\u064A\u0671\u064B-\u065F\u0670]*)/g, toMasdar);
    s = s.replace(/(?:بِ)?أَنّ(\s+)([يتن][\u0621-\u064A\u0671\u064B-\u065F\u0670]*)/g, toMasdar);
  }
  s = s.replace(/بَعْدَ\s+التَّوْحِيدُ/g, "بَعْدَ التَّوْحِيدِ");
  s = s.replace(/بَعْدَ\s+التَّوْحِيدُ/g, 'بَعْدَ التَّوْحِيدِ');
  s = s.replace(/أَمَرَ\s+مُعَاذٍ/g, 'أَمَرَ مُعَاذٌ');
  s = s.replace(/فَقَدْ\s+كُفْر[\u064B-\u065F\u0670]*/g, 'فَقَدْ كَفَرَ');
  s = s.replace(/فقد\s+كفر/g, 'فَقَدْ كَفَرَ');
  s = s.replace(/مَنْ\s+دُون/g, 'مِنْ دُون');
  s = s.replace(/من\s+دون\s+الله/g, "مِنْ دُونِ اللَّهِ");
  s = s.replace(/حق\s+الله\s+على\s+العباد/g, "حَقُّ اللَّهِ عَلَى الْعِبَادِ");
  s = s.replace(/حَقُّ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*\s+عَلَى\s+الْ?عِ?بَاد[\u064B-\u065F\u0670]*/g, "حَقُّ اللَّهِ عَلَى الْعِبَادِ");
  s = s.replace(/على العباد/g, 'عَلَى الْعِبَادِ');
  // Construct عبد + ال… after بن/جر فقط — لا تكسر عَبْدُ اللَّهِ المرفوع (هُوَ عَبْدُ…)
  s = s.replace(
    /((?:^|[^\u0621-\u064A])(?:بْن|ابْن|مِنْ|مِنَ|فِي|إِلَى|عَنْ|عَلَى|لِ)[\u064B-\u065F\u0670]*\s+)عَبْد[\u064B-\u065F\u0670]*\s+(ال)/g,
    '$1عَبْدِ $2'
  );
  s = s.replace(/((?:^|[^\u0621-\u064A])(?:بن|ابن|من|في|الى|إلى|عن|على)\s+)عبد\s+(ال)/g, '$1عَبْدِ $2');
  // Western/Eastern digits → fully vocalized Arabic (display may keep numerals)
  // After عَاشَ / عاش → accusative; otherwise nominative
  s = s.replace(/عَاشَ\s*63(?=[^\d]|$)/g, 'عَاشَ ثَلَاثًا وَسِتِّينَ');
  s = s.replace(/عاش\s*63(?=[^\d]|$)/g, 'عَاشَ ثَلَاثًا وَسِتِّينَ');
  s = s.replace(/عَاشَ\s*٦٣(?=[^\d٠-٩]|$)/g, 'عَاشَ ثَلَاثًا وَسِتِّينَ');
  s = s.replace(/(^|[^\d])63(?=[^\d]|$)/g, '$1ثَلَاثٌ وَسِتُّونَ');
  s = s.replace(/(^|[^\d٠-٩])٦٣(?=[^\d٠-٩]|$)/g, '$1ثَلَاثٌ وَسِتُّونَ');
  // لأنها 3 … / 3 فصول — expand lone 3 (not part of larger number)
  s = s.replace(/لِأَنَّهَا\s*3(?=[^\d]|$)/g, 'لِأَنَّهَا ثَلَاثَةُ');
  s = s.replace(/لأنها\s*3(?=[^\d]|$)/g, 'لِأَنَّهَا ثَلَاثَةُ');
  s = s.replace(/(^|[^\d])3(?=\s*فُ?[صس])/g, '$1ثَلَاثَةُ');
  s = s.replace(/(^|[^\d])3(?=\s*أَ?دِ?ل)/g, '$1ثَلَاثَةُ');
  s = s.replace(/(^|[^\d])3(?=\s*مُ?[ؤو]ل)/g, '$1ثَلَاثَةُ');
  // Hadith «في بُضْعِ أحدكم» — never بِضْع (a few). Cover hamza/bare/vocalized في.
  s = s.replace(/فِي\s+بِضْعِ?\s+أَ?حَدِكُمْ/g, 'فِي بُضْعِ أَحَدِكُمْ');
  s = s.replace(/فِي\s+بضع\s+أَ?حدكم/g, 'فِي بُضْعِ أَحَدِكُمْ');
  s = s.replace(/في\s+بضع\s+أ?حدكم/g, 'فِي بُضْعِ أَحَدِكُمْ');
  s = s.replace(/فِي\s+بِضْعِ?\s+أَ?حَد/g, 'فِي بُضْعِ أَحَد');
  s = s.replace(/فِي\s+بضع\s+أَ?حد/g, 'فِي بُضْعِ أَحَد');
  s = s.replace(/في\s+بضع\s+أ?حد/g, 'فِي بُضْعِ أَحَد');
  s = s.replace(/بِضْعِ\s+أَ?حَد/g, 'بُضْعِ أَحَد');
  s = s.replace(/بِضْعِ\s+احد/g, 'بُضْعِ أَحَد');
  s = s.replace(/فِي\s+بِضْع(?!\s*و)/g, 'فِي بُضْع');
  // Incomplete OCR tashkeel that Fish mangles
  s = s.replace(/شرعاً/g, 'شَرْعًا');
  s = s.replace(/شَرعاً/g, 'شَرْعًا');
  s = s.replace(/ذُكرت/g, 'ذُكِرَتْ');
  s = s.replace(/يُكنّى/g, 'يُكَنَّى');
  s = s.replace(/يُكَنّى/g, 'يُكَنَّى');
  s = s.replace(/يكنى/g, 'يُكَنَّى');
  s = s.replace(/والعزّى/g, 'وَالْعُزَّى');
  s = s.replace(/(^|[^\u0621-\u064A])العزّى/g, '$1الْعُزَّى');
  // العزى — final يْ (softBare ى≡ي) steers Fish away from «العزة» (alone + phrases)
  s = s.replace(/الْعُزَّى/g, 'الْعُزَّيْ');
  s = s.replace(/(^|[^\u0621-\u064A])العزى(?![\u0621-\u064A])/g, '$1الْعُزَّيْ');
  s = s.replace(/(^|[^\u0621-\u064A])العزّى(?![\u0621-\u064A])/g, '$1الْعُزَّيْ');
  s = s.replace(/^الْعُزَّى$/u, 'الْعُزَّيْ');
  s = s.replace(/^العزى$/u, 'الْعُزَّيْ');
  s = s.replace(/^العزّى$/u, 'الْعُزَّيْ');
  // High-mangled lesson tokens — NFC shadda+vowel order Fish clone prefers
  s = s.replace(/([\u064E\u064F\u0650])(\u0651)/g, '$2$1');
  s = s.replace(/الرِّيَاءُ/g, 'الرِّيَاءُ');
  s = s.replace(/الرِّيَاءِ/g, 'الرِّيَاءِ');
  s = s.replace(/الرِّيَاءَ/g, "الرِّيَاءْ");
  s = s.replace(/^الرِّيَاء[َُِ]?$/u, "الرِّيَاءْ");
  s = s.replace(/^الرياء$/u, "الرِّيَاءْ");
  s = s.replace(/رِيَاء/g, 'رِيَاء');
  s = s.replace(/الْقِصَّةُ/g, 'الْقِصَّةُ');
  s = s.replace(/الْأَطْفَالُ\s+لِلنَّوْمِ/g, 'الْأَطْفَالُ لِلنَّوْمِ');
  s = s.replace(/خَاصٌّ\s+بِالصَّلَاةِ/g, 'خَاصٌّ بِالصَّلَاةِ');
  // Soft-OCR torn stems (bank / worksheet harvest)
  s = s.replace(/الب\s*ضع/g, 'الْبِضْع');
  s = s.replace(/بالبِ?\s*ضع/g, 'بِالْبِضْعِ');
  s = s.replace(/ان\s*واط/g, 'أَنْوَاط');
  s = s.replace(/الري\s*اء/g, 'الرِّيَاء');
  s = s.replace(/فر\s*ائض/g, 'فَرَائِض');
  // التولة — always تِوَلَة (kasra); fatḥa → Fish «توالى» (lesson-wide)
  s = s.replace(/التَّوَلَة/g, 'التِّوَلَة');
  s = s.replace(/وَالتَّوَلَة/g, 'وَالتِّوَلَة');
  s = s.replace(/التّوَلَة/g, 'التِّوَلَة');
  s = s.replace(/(^|[^\u0621-\u064A])التولة(?=[^\u0621-\u064A]|$)/g, '$1التِّوَلَةَ');
  s = s.replace(/هَذَا الْحَدِيثِ/g, 'هَذَا الْحَدِيثُ');
  // Sahaba bare → vocalized (gaps added after stripTtsPunctuation)
  s = s.replace(/(^|[^\u0621-\u064A])عقبة\s+بن\s+عامر(?=[^\u0621-\u064A]|$)/g, '$1عُقْبَةُ بْنُ عَامِرٍ');
  s = s.replace(/(^|[^\u0621-\u064A])ابن\s+مسعود(?=[^\u0621-\u064A]|$)/g, '$1ابْنُ مَسْعُودٍ');
  s = s.replace(/(^|[^\u0621-\u064A])أبو\s+هريرة(?=[^\u0621-\u064A]|$)/g, '$1أَبُو هُرَيْرَةَ');
  s = s.replace(/(^|[^\u0621-\u064A])ابو\s+هريرة(?=[^\u0621-\u064A]|$)/g, '$1أَبُو هُرَيْرَةَ');
  s = stripTtsPunctuation(s);
  // Early whole-utterance carriers (bare-key; catches «لأنها 3 فصول» before digit expand)
  s = applyShortSpeechCarriers(s);
  // Micro-gaps AFTER strip (strip collapses whitespace) — clearer sahaba names
  s = s.replace(/عُقْبَةُ بْنُ عَامِرٍ/g, 'عُقْبَةُ  بْنُ  عَامِرٍ');
  // ابن مسعود — تشكيل فقط (لا اختراع عبد الله إن لم يُكتب)
  s = s.replace(/حَدِيث[ٍِ]?\s+ابْن[ُِْ]?\s*مَسْعُودٍ/g, 'حَدِيثِ  ابْنِ  مَسْعُودٍ');
  s = s.replace(/ابْن[ُِْ]?\s*مَسْعُودٍ/g, 'ابْنُ  مَسْعُودٍ');
  s = s.replace(/فِي\s+حَدِيثِ\s+ابْنُ/g, 'فِي حَدِيثِ ابْنِ');
  s = s.replace(/أَبُو هُرَيْرَةَ/g, 'أَبُو  هُرَيْرَةَ');
  // إضافة: مرتبة/ركن الإحسانِ (لا الإحسانُ)
  s = s.replace(/مَرْتَبَةُ\s+الْإِحْسَانُ/g, 'مَرْتَبَةُ الْإِحْسَانِ');
  s = s.replace(/رُكْنُ\s+الْإِحْسَانُ/g, 'رُكْنُ الْإِحْسَانِ');
  // After quote-strip: بِ «ثُمَّ» → بِ ثُمَّ (Fish reads «بسما»); glue particle
  // Only standalone particle بِ/ب — never word-final …بِ (بابِ / كتابِ / طَلَبِ).
  // Harakat before ب must not count as a boundary (طَلَبِ = letter+fatha+بِ).
  s = s.replace(/(?<![\u0621-\u064A\u0671][\u064B-\u065F\u0670]*)بِ\s+ثُمَّ/g, 'بِثُمَّ');
  s = s.replace(/(?<![\u0621-\u064A\u0671][\u064B-\u065F\u0670]*)بِ\s+ثم(?![ا-ي])/g, 'بِثُمَّ');
  s = s.replace(/(?<![\u0621-\u064A\u0671][\u064B-\u065F\u0670]*)بِ\s+(?=[\u0621-\u064A\u0671])/g, 'بِ');
  s = s.replace(/(?<![\u0621-\u064A\u0671][\u064B-\u065F\u0670]*)ب\s+(?=[\u0621-\u064A\u0671])/g, 'بِ');
  // Wrong case / OCR that Fish reads as different words
  s = s.replace(/الْعِبَادَةِ\s+شَرْعًا/g, 'الْعِبَادَةُ شَرْعًا');
  s = s.replace(/العبادةِ\s+شرعا/g, 'الْعِبَادَةُ شَرْعًا');
  s = s.replace(/(^|[^\u0621-\u064A])الذَّبْحِ\s+لِغَيْر/g, '$1الذَّبْحُ لِغَيْر');
  s = s.replace(/فِي\s+قَوْلُهُ/g, 'فِي قَوْلِهِ');
  s = s.replace(/فِي\s+الْأُصُولُ/g, 'فِي الْأُصُولِ');
  s = s.replace(/اَلطَّاعَةُ/g, 'الطَّاعَةِ');
  s = s.replace(/اَلطَّاعَةِ/g, 'الطَّاعَةِ');
  // Construct / nominative OCR slips that confuse clone pacing
  s = s.replace(/طَلَبٌ\s+الصَّحَابَة[ُِ]/g, 'طَلَبُ الصَّحَابَةِ');
  s = s.replace(/قَوْلُ\s+الصَّحَابَةُ/g, 'قَوْلُ الصَّحَابَةِ');
  s = s.replace(/لَم[َّ]*ا\s+طَلَبٌ/g, 'لَمَّا طَلَبَ');
  // Tanween on أنواط → phantom ن / أنواع; prefer sukun (not fatha→أنواع)
  s = s.replace(/أَنْوَاط[ٍَ]/g, 'أَنْوَاطْ');
  s = s.replace(/انواط[ٍَ]?/g, 'أَنْوَاطْ');
  s = s.replace(/(^|[^\u0621-\u064A])أنواط(?=[^\u0621-\u064A]|$)/g, '$1أَنْوَاطْ');
  // Truncated fill-blank: sukun + gap so clone doesn't slur فرائض→فلا
  s = s.replace(/فَرَائِضَ\s*فَلَا/g, 'فَرَائِضْ  فَلَا');
  s = s.replace(/فَرَائِض\s*فَلَا/g, 'فَرَائِضْ  فَلَا');
  s = s.replace(/فرائض\s*فلا/g, 'فَرَائِضْ  فَلَا');
  // خطأ alone — sukun (not dammatan→«خطأن»); no «هذا» invent
  s = s.replace(/^خَطَأٌ$/u, 'خَطَأْ');
  s = s.replace(/^خَطَأ$/u, 'خَطَأْ');
  s = s.replace(/^خطأ$/u, 'خَطَأْ');
  // Ultra-short MC options Fish mangles — article/pad only (never صح→صحيح)
  s = s.replace(/^إِكْرَاه[ٍُِ]?$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^اكراه$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^إكراه$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^السِّحْر[َُِ]?$/u, 'السِّحْرْ');
  s = s.replace(/^السِّحْر[َُِ]?$/u, 'السِّحْرْ');
  s = s.replace(/^السحر$/u, 'السِّحْرْ');
  // الزمان — تشكيل فقط (لا «هو»)
  s = s.replace(/^الزَّمَان[َُِْ]?$/u, "الزَّمَانُ");
  s = s.replace(/^الزَّمَان[َُِْ]?$/u, "الزَّمَانُ");
  s = s.replace(/^الزمان$/u, "الزَّمَانُ");
  // المراد بـ — فجوات/سكون فقط (لا معنى/مقصود invent)
  s = s.replace(/مَا\s+اَلْمُرَادْ\s+بِ/g, 'مَا اَلْمُرَادْ بِ');
  s = s.replace(/مَا\s+الْمُرَادُ\s+بِ/g, 'مَا اَلْمُرَادْ بِ');
  s = s.replace(/مَا\s+الْمُرَادْ\s+بِ/g, 'مَا اَلْمُرَادْ بِ');
  s = s.replace(/(^|[\s،])اَلْمُرَادْ\s+بِ/g, '$1اَلْمُرَادْ بِ');
  s = s.replace(/(^|[\s،])الْمُرَادُ\s+بِ/g, '$1اَلْمُرَادْ بِ');
  s = s.replace(/(^|[\s،])المراد\s+ب/g, '$1اَلْمُرَادْ ب');
  s = s.replace(/مَعْنَى(?=[\u0621-\u064A])/g, 'مَعْنَى ');
  s = s.replace(/الْمُرَادُ\s+بِالْبِضْع/g, 'اَلْمُرَادْ بِالْبِضْع');
  s = s.replace(/الْمُرَادُ\s+بالبِ?\s*ضع/g, 'اَلْمُرَادْ بِالْبِضْعِ');
  // Idol names — lam+sukun clarity; avoid shadda that collapses to «لا تـ»
  s = s.replace(/اللَّاتُ/g, 'الْلَاتُ');
  s = s.replace(/اللّاتُ/g, 'الْلَاتُ');
  s = s.replace(/اللَاتُ/g, 'الْلَاتُ');
  s = s.replace(/وَمَنَاةُ/g, 'وَمَنَاةُ');
  s = s.replace(/مَنَاةُ الثَّالِثَةُ/g, 'مَنَاةُ الثَّالِثَةِ');
  // المراد — wasla + sukun on د before بِ reduces «مراجب» liaison
  s = s.replace(/الْمُرَادُ\s+بِ/g, 'اَلْمُرَادْ بِ');
  s = s.replace(/اَلْمُرَادُ\s+بِ/g, 'اَلْمُرَادْ بِ');
  s = s.replace(/الْمُرَادُ/g, 'اَلْمُرَادْ');
  s = s.replace(/اَلْمُرَادُ/g, 'اَلْمُرَادْ');
  // أنواط after ذات — genitive ذاتِ + sukun أنواط (avoid أنواع)
  s = s.replace(/ذَات[َُِ]?\s+أَنْوَاطْ?/g, 'ذَاتِ  أَنْوَاطْ');
  s = s.replace(/ذات\s+أنواط/g, 'ذَاتِ  أَنْوَاطْ');
  // بُضْع clarity without tatweel: separate from أحدكم
  s = s.replace(/بُضْعِ\s+أَحَدِكُمْ/g, 'بُضْعِ  أَحَدِكُمْ');
  // ── v332 fidelity: never expand صح→صحيح (Fish→صحيحن); خطأ without dammatan→خطأن
  s = s.replace(/(^|[\s،,])صَحّ(?=$|[\s،,✓])/g, '$1صَحْ');
  s = s.replace(/(^|[\s،,])صح(?=$|[\s،,✓])/g, '$1صَحْ');
  // Collapse «هذا خطأ» invent BEFORE dammatan→sukun (order matters).
  s = s.replace(/^ه[\u064B-\u065F\u0670]*ذ[\u064B-\u065F\u0670]*ا\s+خ[\u064B-\u065F\u0670]*ط[\u064B-\u065F\u0670]*أ[\u064B-\u065F\u0670]*$/u, 'خَطَأْ');
  s = s.replace(/^هذا\s+خطأ$/u, 'خَطَأْ');
  s = s.replace(/(^|[\s،,])خَطَأٌ(?=$|[\s،,✗])/g, '$1خَطَأْ');
  // ذات أنواط / أنواط — تشكيل فقط
  s = s.replace(/ذَات[َُِ]?\s+أَنْوَاطْ?/g, 'ذَاتِ  أَنْوَاطْ');
  s = s.replace(/ذات\s+أنواط/g, 'ذَاتِ  أَنْوَاطْ');
  s = s.replace(/^أَنْوَاطْ$/u, 'أَنْوَاطْ');
  s = s.replace(/^أنواط$/u, 'أَنْوَاطْ');
  // الزكاة شرعاً — nominative
  s = s.replace(/الزَّكَاةِ\s+شَرْعًا/g, 'الزَّكَاةُ  شَرْعًا');
  s = s.replace(/الزكاة\s+شرعاً?/g, 'الزَّكَاةُ  شَرْعًا');
  s = s.replace(/وَآتُوا\s+الزَّكَاة[َُِ]?/g, 'وَآتُوا  الزَّكَاةَ');
  s = s.replace(/وآتوا\s+الزكاة/g, 'وَآتُوا  الزَّكَاةَ');
  // إكراه → الْإِكْرَاهُ (article only when bare stub)
  s = s.replace(/^إِكْرَاه[ٌٍُِ]?$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^اكراه$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^إكراه$/u, 'الْإِكْرَاهُ');
  // ذباب — تشكيل فقط (لا الذال ثم / حشرة)
  s = s.replace(/^ذباب$/u, 'ذُبَابٌ');
  s = s.replace(/^ذُبَاب$/u, 'ذُبَابٌ');
  s = s.replace(/^ذباباً?$/u, 'ذُبَابًا');
  s = s.replace(/^ذُبَابًا$/u, 'ذُبَابًا');
  s = s.replace(/^قرب\s+ذباباً?$/u, 'قَرَّبَ ذُبَابًا');
  s = s.replace(/^قرب\s+ذباباً?\s+لل?صنم$/u, 'قَرَّبَ ذُبَابًا لِلصَّنَمِ');
  s = s.replace(/قَرَّبَ\s+ذُبَابًا\s+لِلصَّنَمِ/g, 'قَرَّبَ  ذُبَابًا  لِلصَّنَمِ');
  s = s.replace(/قرب\s+ذباباً?\s+لل?صنم/g, 'قَرَّبَ  ذُبَابًا  لِلصَّنَمِ');
  // الشرك الأكبر / الأصغر — تشكيل + فجوات (يمنع أشرك/…)
  s = s.replace(/الشِّرْك[َُِ]?\s+الْأَكْبَر[َُِْ]?/g, "الشِّرْكُ  الْأَكْبَرْ");
  s = s.replace(/الشِّرْك[َُِ]?\s+الْأَكْبَر[َُِْ]?/g, "الشِّرْكُ  الْأَكْبَرْ");
  s = s.replace(/الشرك\s+الأكبر/g, "الشِّرْكُ  الْأَكْبَرْ");
  s = s.replace(/الشِّرْكِ\s+الْأَصْغَر[َُِ]?/g, "الشِّرْكِ  الْأَصْغَرْ");
  s = s.replace(/الشِّرْكِ\s+الْأَصْغَر[َُِ]?/g, "الشِّرْكِ  الْأَصْغَرْ");
  s = s.replace(/الشرك\s+الأصغر/g, "الشِّرْكِ  الْأَصْغَرْ");
  // رقى / تمائم / تولة / شرك — gaps only
  s = s.replace(
    /إِنَّ\s+الرُّقَى\s+وَالتَّمَائِمَ\s+وَالتِّوَلَةَ\s+شِرْك[ٌْ]?/g,
    "إِنَّ الرُّقَى   وَالتَّمَائِمْ   وَالتِّوَلَةَ   شِرْكْ"
  );
  s = s.replace(
    /إِنَّ\s+الرُّقَى\s+وَالتَّمَائِمَ\s+وَالتِّوَلَةَ\s+شِرْك[ٌْ]?/g,
    "إِنَّ الرُّقَى   وَالتَّمَائِمْ   وَالتِّوَلَةَ   شِرْكْ"
  );
  s = s.replace(/التَّمَائِم[َُِ]/g, 'التَّمَائِمْ');
  s = s.replace(/التَّمَائِم[َُِ]/g, 'التَّمَائِمْ');
  // أهل اليمن — تشكيل فقط (لا إقليم/بلاد)
  s = s.replace(/أَهْل[َِ]?\s+الْيَمَن[َُِْ]?/g, 'أَهْلَ  الْيَمَنِ');
  s = s.replace(/اهل\s+اليمن/g, 'أَهْلَ  الْيَمَنِ');
  s = s.replace(/أهل\s+اليمن/g, 'أَهْلَ  الْيَمَنِ');
  // ابن مسعود — لا اختراع عبد الله
  s = s.replace(/^ابْن[ُِْ]?\s*مَسْعُودٍ$/u, 'ابْنُ مَسْعُودٍ');
  s = s.replace(/^ابن\s+مسعود$/u, 'ابْنُ مَسْعُودٍ');
  s = s.replace(/قال\s+ابن\s+مسعود/g, 'قَالَ ابْنُ مَسْعُودٍ');
  s = s.replace(/ابن\s+مسعود/g, 'ابْنُ مَسْعُودٍ');
  // لا ضرر ولا ضرار — نصب + فجوات فقط
  s = s.replace(/لَا\s+ضَرَر[َْ]?\s+وَلَا\s+ضِرَار[َْ]?/g, 'لَا  ضَرَرَ  وَلَا  ضِرَارَ');
  s = s.replace(/لا\s+ضرر\s+ولا\s+ضرار/g, 'لَا  ضَرَرَ  وَلَا  ضِرَارَ');
  // Strip leftover inventing prefixes if any map still emits them
  s = s.replace(/^أَعْنِي\s+/u, '');
  s = s.replace(/^الذَّالُ\s+ثُمَّ\s+/u, '');
  s = s.replace(/أَعْنِي\s+قَاعِدَةَ[:،]?\s*/g, '');
  // year-only leftovers → Arabic year words when mapped (no أعني عام)
  s = s.replace(
    /^([0-9٠-٩]{2,4})\s+هِجْرِيَّةً?$/u,
    (_, y) => {
      const w = HIJRI_YEAR_WORDS[y];
      return w ? `${w} هِجْرِيَّةً` : `${y} هِجْرِيَّةً`;
    }
  );
  s = s.replace(/^أَعْنِي\s+عَامَ\s+/u, '');
  // أن تعبد الله — mansub + gap
  s = s.replace(/أَنْ\s+تَعْبُد[َُ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "أَنْ تَعْبُدَ  اللَّهَ");
  s = s.replace(/ان\s+تعبد\s+الله/g, "أَنْ تَعْبُدَ  اللَّهَ");
  s = s.replace(/عقبة\s+بن\s+عامر/g, 'عُقْبَةُ  بْنُ  عَامِرٍ');
  s = s.replace(/عُقْبَةُ\s+بْنُ\s+عَامِرٍ/g, 'عُقْبَةُ  بْنُ  عَامِرٍ');
  // Diacritic-insensitive whole-utterance carriers (fidelity-only map)
  s = applyShortSpeechCarriers(s);
  s = applySystematicCaseEndings(s);
  s = applyShortSpeechCarriers(s);

  // v328: critical verb/noun disambiguation (exact written words + tashkeel only).
  s = s.replace(/سنة\s+من\s+السنين/g, 'سَنَةٌ مِنَ السِّنِينَ');
  s = s.replace(/من\s+السنين/g, 'مِنَ السِّنِينَ');
  s = s.replace(/(^|[^\u0621-\u064A])السنين(?![\u0621-\u064A])/g, '$1السِّنِينَ');
  // أرسل verb — never let Fish invent إرسال (masdar)
  s = s.replace(/بماذا\s+أ[ُِ]?ر[ْ]?س[ِ]?ل[َ]?/g, 'بِمَاذَا أَرْسَلَ');
  s = s.replace(/بماذا\s+ارسل/g, 'بِمَاذَا أَرْسَلَ');
  s = s.replace(/(^|[^\u0621-\u064A])أُرْسِلَ(?=\s+الن)/g, '$1أَرْسَلَ');
  s = s.replace(/(^|[^\u0621-\u064A])أرسل(?=\s)/g, '$1أَرْسَلَ');
  s = s.replace(/(^|[^\u0621-\u064A])ارسل(?=\s)/g, '$1أَرْسَلَ');
  s = s.replace(/فاذكروني\s+اذكركم/g, 'فَاذْكُرُونِي أَذْكُرْكُمْ');
  s = s.replace(/فاذكروني\s+أذكركم/g, 'فَاذْكُرُونِي أَذْكُرْكُمْ');

  // v324: Fish Hakim A/B — strip harakat except KEEP (tawheed+usool+nawawi winners).
  // KEEP preserves contextual iʿrāb already on the token; bare often reads cleaner.
  s = applyHarakatPolicy(s);

  // AFTER KEEP: force العزى → يْ (KEEP form وَالْعُزَّى was reading as «العزة»).
  s = s.replace(/الْعُزَّى/g, 'الْعُزَّيْ');
  s = s.replace(/(^|[^\u0621-\u064A])العزى(?![\u0621-\u064A])/g, '$1الْعُزَّيْ');

  // v341: repair broken nominative iʿrāb leftovers (Verifier3 map fixes + defense in prepare).
  s = s.replace(/حَدِيثٍ\s+صَحِيحٌ/g, 'حَدِيثٌ صَحِيحٌ');
  s = s.replace(/حديثٍ\s+صحيحٌ/g, 'حَدِيثٌ صَحِيحٌ');
  s = s.replace(/حَدِيثٍ\s+حُسْنُ/g, 'حَدِيثٌ حَسَنٌ');
  s = s.replace(/حديثٍ\s+حسنُ?/g, 'حَدِيثٌ حَسَنٌ');
  s = s.replace(/^حديث\s+صحيح\.?$/u, 'حَدِيثٌ صَحِيحٌ');
  s = s.replace(/^حديث\s+حسن\.?$/u, 'حَدِيثٌ حَسَنٌ');
  s = s.replace(/غَيْرَ\s+صَحِيحٌ/g, 'غَيْرُ صَحِيحٍ');
  s = s.replace(/لَا\s+يُ?سْ?قِطُ?\s+حُقُوقُ/g, 'لَا يُسْقِطُ حُقُوقَ');
  s = s.replace(/لا\s+يسقط\s+حقوق/g, 'لَا يُسْقِطُ حُقُوقَ');
  s = s.replace(/يُسْقِطُ\s+حُقُوقُ/g, 'يُسْقِطُ حُقُوقَ');

  // v342 Reviewer B: noun حُسْن vs KEEP adjective حَسَنٌ; broken map iʿrāb (Q+options only).
  // KEEP bare «حسن» → حَسَنٌ is correct for «حديث حسن», wrong for «حسن الخلق / من حسن إسلام».
  s = s.replace(/حسن\s+الخلق/g, 'حُسْنُ الْخُلُقِ');
  s = s.replace(/حَسَنٌ\s+الْخَلْقِ/g, 'حُسْنُ الْخُلُقِ');
  s = s.replace(/حَسَنٌ\s+الْخُلُقِ/g, 'حُسْنُ الْخُلُقِ');
  s = s.replace(/الْحَثُّ\s+عَلَى\s+حُسْنُ/g, 'الْحَثُّ عَلَى حُسْنِ');
  s = s.replace(/عَلَى\s+حُسْنُ\s+الْخَلْقِ/g, 'عَلَى حُسْنِ الْخُلُقِ');
  s = s.replace(/عَلَى\s+حُسْنُ\s+الْخُلُقِ/g, 'عَلَى حُسْنِ الْخُلُقِ');
  s = s.replace(/عَلَى\s+حُسْنُ/g, 'عَلَى حُسْنِ');
  s = s.replace(/الحث\s+على\s+حسن\s+الخلق/g, 'الْحَثُّ عَلَى حُسْنِ الْخُلُقِ');
  s = s.replace(/من\s+حسن\s+إسلام\s+المرء/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/من\s+حسن\s+اسلام\s+المرء/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  // After KEEP, إسلام/المرء may be bare — still force hadith reading مِنْ حُسْنِ…
  s = s.replace(/مَنْ\s+حُسْنُ\s+إِسْلَامِ\s+الْمَرْءُ/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/مَنْ\s+حُسْنُ\s+اسلام\s+الْمَرْءُ/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/مَنْ\s+حُسْنُ\s+إسلام\s+الْمَرْءُ/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/مَنْ\s+حَسَنٌ\s+اسلام\s+الْمَرْءُ/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/مَنْ\s+حَسَنٌ\s+إسلام\s+الْمَرْءُ/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/مَنْ\s+حُسْنُ\s+إِسْلَامِ\s+الْمَرْءِ/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/مَنْ\s+حُسْنُ\s+اسلام\s+المرء/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/مَنْ\s+حُسْنُ\s+إسلام\s+المرء/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/مَنْ\s+حُسْنُ\s+إسلام\s+الْمَرْءِ/g, 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ');
  s = s.replace(/(^|[^\u0621-\u064A])حسن\s+تعليم/g, '$1حُسْنُ تَعْلِيمِ');
  s = s.replace(/حَسَنٌ\s+تعليم/g, 'حُسْنُ تَعْلِيمِ');
  s = s.replace(/حُسْنُ\s+تعليم\s+النَّبِيِّ/g, 'حُسْنُ تَعْلِيمِ النَّبِيِّ');
  s = s.replace(/تَعْلِيمِ\s+النَّبِيَّ/g, 'تَعْلِيمِ النَّبِيِّ');
  s = s.replace(/صَدَّقَ\s+النَّبِيِّ/g, 'صَدَّقَ النَّبِيُّ');
  s = s.replace(/حَدِيثٍ\s+ابْنُ\s+عَبَّاسٍ?/g, 'حَدِيثِ ابْنِ عَبَّاسٍ');
  s = s.replace(/حَدِيثٍ\s+ابْنُ\s+عباس/g, 'حَدِيثِ ابْنِ عَبَّاسٍ');
  s = s.replace(/في\s+حديث\s+ابن\s+عباس/g, 'فِي حَدِيثِ ابْنِ عَبَّاسٍ');
  // AFTER KEEP nominative حَدِيثٌ under في/إضافة
  s = s.replace(/فِي\s+حَدِيثٌ\s+ابْنُ/g, 'فِي حَدِيثِ ابْنِ');
  s = s.replace(/فِي\s+حَدِيثٌ\s+ابْن/g, 'فِي حَدِيثِ ابْن');
  s = s.replace(/صَدَّقَ\s+النَّبِيَّ/g, 'صَدَّقَ النَّبِيُّ');
  s = s.replace(/اسْمٌ\s+الرَّجُلُ/g, 'اسْمَ الرَّجُلِ');
  s = s.replace(/اسم\s+الرَّجُلُ/g, 'اسْمَ الرَّجُلِ');
  s = s.replace(/اسم\s+الرجل\s+المكن/g, 'اسْمَ الرَّجُلِ المكن');
  s = s.replace(/لِأَنَّ\s+الْحُكْمُ/g, 'لِأَنَّ الْحُكْمَ');
  s = s.replace(/لأن\s+الحكم/g, 'لِأَنَّ الْحُكْمَ');
  s = s.replace(/^الصَّلَاةِ\s+عَلَى/u, 'الصَّلَاةُ عَلَى');
  s = s.replace(/^الصلاة\s+على/u, 'الصَّلَاةُ عَلَى');
  // اللهو ≠ الله (Fish) — KEEP + explicit; واللعب paired option spelling
  s = s.replace(/(^|[^\u0621-\u064A])اللهو(?![\u0621-\u064A])/g, '$1اللَّهْوُ');
  s = s.replace(/(^|[^\u0621-\u064A])واللهو(?![\u0621-\u064A])/g, '$1وَاللَّهْوُ');
  s = s.replace(/(^|[^\u0621-\u064A])واللعب(?![\u0621-\u064A])/g, '$1وَاللَّعِبُ');

  // Final TF lemmas AFTER KEEP — «صح»/«خطأ» only (never expand to صحيحن/خطأن).
  // Do NOT collapse written «صحيح» → صح (MC options must stay صحيح).
  s = s.replace(/^صَحّ$/u, 'صَحْ');
  s = s.replace(/^صح$/u, 'صَحْ');
  s = s.replace(/^ه[َٰ]?ذَ?ا\s+خ[\u064B-\u065F\u0670]*ط[\u064B-\u065F\u0670]*أ[\u064B-\u065F\u0670]*$/u, 'خَطَأْ');
  s = s.replace(/^هذا\s+خطأ$/u, 'خَطَأْ');
  s = s.replace(/^خَطَأٌ$/u, 'خَطَأْ');
  s = s.replace(/^خَطَأْ?$/u, 'خَطَأْ');
  s = s.replace(/^خطأ$/u, 'خَطَأْ');

  s = fixAllahIrabInText(s);
  // Post-allah: لأنّ must stay accusative if context matcher missed vocalized لِأَنَّ
  s = s.replace(/لِأَنَّ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "لِأَنَّ اللَّهَ");
  s = s.replace(/لأن\s+الله/g, "لِأَنَّ اللَّهَ");
  // Defend اللهو if any residual الله-family rewrite leaked into اللهو
  s = s.replace(/وَاللَّهِْوُ/g, 'وَاللَّهْوُ');
  s = s.replace(/اللَّهِْوُ/g, 'اللَّهْوُ');
  s = s.replace(/(^|[^\u0621-\u064A])اللهو(?![\u0621-\u064A])/g, '$1اللَّهْوُ');
  s = s.replace(/(^|[^\u0621-\u064A])واللهو(?![\u0621-\u064A])/g, '$1وَاللَّهْوُ');
  s = s.replace(/(^|[^\u0621-\u064A])واللعب(?![\u0621-\u064A])/g, '$1وَاللَّعِبُ');
  return s;
}

function resolveFishProsodySpeed(env = process.env, overrideSpeed) {
  const q = FISH_QUALITY_DEFAULTS;
  const fromReq = Number(overrideSpeed);
  if (Number.isFinite(fromReq) && fromReq >= 0.5 && fromReq <= 2) return fromReq;
  const fromEnv = Number(env?.FISH_TTS_SPEED);
  if (Number.isFinite(fromEnv) && fromEnv >= 0.5 && fromEnv <= 2) return fromEnv;
  return q.prosody.speed;
}

export function buildFishTtsBody(cleanText, selectedVoice, env = process.env, opts = {}) {
  const q = FISH_QUALITY_DEFAULTS;
  const volume = Number(env?.FISH_TTS_VOLUME);
  const temperature = Number(env?.FISH_TTS_TEMPERATURE);
  const topP = Number(env?.FISH_TTS_TOP_P);
  return {
    text: cleanText,
    reference_id: selectedVoice,
    format: q.format,
    mp3_bitrate: Number(env?.FISH_TTS_BITRATE) === 128 || Number(env?.FISH_TTS_BITRATE) === 64
      ? Number(env.FISH_TTS_BITRATE)
      : q.mp3_bitrate,
    sample_rate: q.sample_rate,
    latency: String(env?.FISH_TTS_LATENCY || q.latency).trim() || q.latency,
    normalize: q.normalize,
    chunk_length: q.chunk_length,
    temperature: Number.isFinite(temperature) && temperature > 0 ? temperature : q.temperature,
    top_p: Number.isFinite(topP) && topP > 0 ? topP : q.top_p,
    repetition_penalty: q.repetition_penalty,
    prosody: {
      speed: resolveFishProsodySpeed(env, opts?.speed),
      volume: Number.isFinite(volume) && volume >= -20 && volume <= 20 ? volume : q.prosody.volume,
      normalize_loudness: q.prosody.normalize_loudness,
    },
  };
}

/** @param {{ speed?: number }} [opts] — per-request prosody speed (default 1.08). */
export async function synthesizeFishArabicSpeech(text, voiceId, env = process.env, opts = {}) {
  const apiKey = String(env?.FISH_API_KEY || '').trim();
  if (!apiKey) throw new Error('Fish Audio not configured (missing FISH_API_KEY)');

  const selectedVoice = resolveFishVoiceId(voiceId, env);
  if (!selectedVoice) {
    throw new Error('Fish TTS missing voice — set FISH_VOICE_ID to your Fish Audio voice/model id');
  }
  const model = resolveFishModel(env);
  const clean = prepareFishTtsText(text);
  if (!clean) throw new Error('Fish TTS empty text');

  const body = buildFishTtsBody(clean, selectedVoice, env, opts);

  const res = await fetch(FISH_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Fish TTS ${res.status}: ${detail.slice(0, 280)}`);
  }
  return res.body;
}
