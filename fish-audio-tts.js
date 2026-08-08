/** Fish Audio text-to-speech — sole lesson TTS provider (Quran stays Hudhaify). */

import { fixAllahIrabInText } from './allah-irab.js';

/**
 * Fallback empty — product voice MUST come from env FISH_VOICE_ID
 * (user's cloned voice: 03ea787e74ac4cf088e90bb7db0a43ed).
 */
export const DEFAULT_FISH_VOICE_ID = '';
/**
 * Best Arabic-quality model on paid Fish plans.
 * Docs: s2.1-pro is recommended for production (better than s2-pro).
 * Override with FISH_TTS_MODEL if needed.
 */
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
    volume: 9,
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

export function resolveFishVoiceId(voiceId, env = process.env) {
  const fromEnv = String(env?.FISH_VOICE_ID || DEFAULT_FISH_VOICE_ID).trim();
  const fromArg = String(voiceId || '').trim();
  // Never pass Azure/legacy labels (ar-SA-HamedNeural, fish-live, …) as reference_id —
  // Fish returns 400 "Reference not found" and the whole lesson goes silent.
  if (isFishReferenceId(fromArg)) return fromArg;
  if (isFishReferenceId(fromEnv)) return fromEnv;
  return fromEnv || '';
}

export function resolveFishModel(env = process.env) {
  return String(env?.FISH_TTS_MODEL || DEFAULT_FISH_MODEL).trim() || DEFAULT_FISH_MODEL;
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
  return s;
}

export function prepareFishTtsText(text) {
  // Preserve formation (harakat); expand honorifics; drop marks spoken as words.
  // NEVER strip mid-word harakat — Fish needs tashkeel to avoid «اللاه» / mangled iʿrāb.
  let s = String(text || '');
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
  // Construct عبد + ال… (الوهاب / الله)
  s = s.replace(/عَبْد[\u064B-\u065F\u0670]*\s+(ال)/g, 'عَبْدِ $1');
  // Western/Eastern digits → fully vocalized Arabic (display may keep numerals)
  // After عَاشَ / عاش → accusative; otherwise nominative
  s = s.replace(/عَاشَ\s*63(?=[^\d]|$)/g, 'عَاشَ ثَلَاثًا وَسِتِّينَ');
  s = s.replace(/عاش\s*63(?=[^\d]|$)/g, 'عَاشَ ثَلَاثًا وَسِتِّينَ');
  s = s.replace(/عَاشَ\s*٦٣(?=[^\d٠-٩]|$)/g, 'عَاشَ ثَلَاثًا وَسِتِّينَ');
  s = s.replace(/(^|[^\d])63(?=[^\d]|$)/g, '$1ثَلَاثٌ وَسِتُّونَ');
  s = s.replace(/(^|[^\d٠-٩])٦٣(?=[^\d٠-٩]|$)/g, '$1ثَلَاثٌ وَسِتُّونَ');
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
  // High-mangled lesson tokens — NFC shadda+vowel order Fish clone prefers
  s = s.replace(/([\u064E\u064F\u0650])(\u0651)/g, '$2$1');
  s = s.replace(/الرِّيَاءُ/g, 'الرِّيَاءُ');
  s = s.replace(/الرِّيَاءِ/g, 'الرِّيَاءِ');
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
  // Micro-gaps AFTER strip (strip collapses whitespace) — clearer sahaba names
  s = s.replace(/عُقْبَةُ بْنُ عَامِرٍ/g, 'عُقْبَةُ  بْنُ  عَامِرٍ');
  s = s.replace(/ابْنُ مَسْعُودٍ/g, 'ابْنُ  مَسْعُودٍ');
  s = s.replace(/أَبُو هُرَيْرَةَ/g, 'أَبُو  هُرَيْرَةَ');
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
  // Tanween on أنواط → phantom ن; prefer fatha after ذات, clear fatha standalone
  s = s.replace(/أَنْوَاطٍ/g, 'أَنْوَاطَ');
  s = s.replace(/انواطٍ/g, 'أَنْوَاطَ');
  s = s.replace(/أَنْوَاطْ/g, 'أَنْوَاطَ');
  // Truncated fill-blank: sukun + gap so clone doesn't slur فرائض→فلا
  s = s.replace(/فَرَائِضَ\s*فَلَا/g, 'فَرَائِضْ  فَلَا');
  s = s.replace(/فَرَائِض\s*فَلَا/g, 'فَرَائِضْ  فَلَا');
  s = s.replace(/فرائض\s*فلا/g, 'فَرَائِضْ  فَلَا');
  // خطأ alone → شطأ; pad when whole utterance
  s = s.replace(/^خَطَأٌ$/u, 'هَذَا خَطَأٌ');
  s = s.replace(/^خطأ$/u, 'هَذَا خَطَأٌ');
  // المراد بـ → أوضح للـ clone (الواجهة تبقى «المراد»)
  s = s.replace(/مَا\s+اَلْمُرَادْ\s+بِ/g, 'مَا مَعْنَى ');
  s = s.replace(/مَا\s+الْمُرَادُ\s+بِ/g, 'مَا مَعْنَى ');
  s = s.replace(/مَا\s+الْمُرَادْ\s+بِ/g, 'مَا مَعْنَى ');
  s = s.replace(/(^|[\s،])اَلْمُرَادْ\s+بِ/g, '$1الْمَقْصُودُ بِ');
  s = s.replace(/(^|[\s،])الْمُرَادُ\s+بِ/g, '$1الْمَقْصُودُ بِ');
  s = s.replace(/(^|[\s،])المراد\s+ب/g, '$1الْمَقْصُودُ ب');
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
  // أنواط after ذات — keep genitive ذاتِ in construct; else ذاتَ
  s = s.replace(/ذَاتِ\s+أَنْوَاط[ٍَْ]?/g, 'ذَاتِ أَنْوَاطَ');
  s = s.replace(/ذَات[َ]?\s+أَنْوَاط[ٍَْ]?/g, 'ذَاتَ أَنْوَاطَ');
  // بُضْع clarity without tatweel: separate from أحدكم
  s = s.replace(/بُضْعِ\s+أَحَدِكُمْ/g, 'بُضْعِ  أَحَدِكُمْ');
  // TF / ultra-short options — صَحّ often heard as «صحن»; speak كامل
  s = s.replace(/(^|[\s،,])صَحّ(?=$|[\s،,])/g, '$1صَحِيحٌ');
  s = s.replace(/(^|[\s،,])صح(?=$|[\s،,])/g, '$1صَحِيحٌ');
  // Short single-token options: slight gap after article to reduce collapse (جن→جدا)
  s = s.replace(/^الْجِنَّ$/u, 'الْجِنّ');
  s = s.replace(/^الْإِنْسَ$/u, 'الْإِنْس');
  s = s.replace(/^عِبَادَةٌ$/u, 'عِبَادَة');
  // دم امرئ — micro-gaps (prep letters stay correct; helps clone not slur)
  s = s.replace(/دَمُ\s+امْرِئٍ\s+مُسْلِمٍ/g, 'دَمُ  امْرِئٍ  مُسْلِمٍ');
  // لا ضرر ولا ضرار — micro-gap before second ضر
  s = s.replace(/لَا\s+ضَرَرَ\s+وَلَا\s+ضِرَارَ/g, 'لَا ضَرَرَ  وَلَا ضِرَارَ');
  // DO NOT insert mid-word tatweel — v265 tried it for «clarity» and Whisper proved
  // بُضْـع/صَدَقَـة/رياء/ذُكِـرَت → mangled (بضعي/صديقاتون/رياق/لكرة).
  s = applySystematicCaseEndings(s);
  return fixAllahIrabInText(s);
}

function resolveFishProsodySpeed(env = process.env, overrideSpeed) {
  const q = FISH_QUALITY_DEFAULTS;
  const fromReq = Number(overrideSpeed);
  if (Number.isFinite(fromReq) && fromReq >= 0.5 && fromReq <= 2) return fromReq;
  const fromEnv = Number(env?.FISH_TTS_SPEED);
  if (Number.isFinite(fromEnv) && fromEnv >= 0.5 && fromEnv <= 2) return fromEnv;
  return q.prosody.speed;
}

function buildFishTtsBody(cleanText, selectedVoice, env = process.env, opts = {}) {
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
