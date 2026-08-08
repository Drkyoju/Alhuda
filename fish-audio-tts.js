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

/** Strip harakat/tatweel for whole-utterance carrier lookup. */
export function bareArabicKey(text) {
  return String(text || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whole-utterance speech carriers for ultra-short MC/TF options Fish mangles.
 * UI display stays bare; spoken form keeps the same bare content words + فصيح إعراب.
 * Keys: undiacritized Arabic. Prefer هو/هي/هذا/أنْ/قد/أعني over invented content.
 */
export const SHORT_SPEECH_CARRIERS = Object.freeze({
  // ── high-freq judgments / TF ──
  صح: 'هَذَا صَحِيحٌ',
  'صحيح': 'هَذَا صَحِيحٌ',
  'خطأ': 'هَذَا خَطَأٌ',
  'خطا': 'هَذَا خَطَأٌ',
  'جائز': 'هَذَا جَائِزٌ',
  // ── stubborn shorts (v282 residual) ──
  'أنواط': 'شَجَرَةُ ذَاتِ أَنْوَاطْ',
  'انواط': 'شَجَرَةُ ذَاتِ أَنْوَاطْ',
  'ذات أنواط': 'شَجَرَةُ ذَاتِ أَنْوَاطْ',
  'الطب': 'عِلْمُ الطِّبِّ',
  'صدقة': 'أَعْنِي صَدَقَةً',
  'الصوم': 'صَوْمُ رَمَضَانَ',
  'صوم': 'صَوْمُ رَمَضَانَ',
  'الزنا': 'فَاحِشَةُ الزِّنَا',
  'زنا': 'فَاحِشَةُ الزِّنَا',
  'الظلم': 'الظُّلْمُ كَبِيرَةٌ',
  'ظلم': 'الظُّلْمُ كَبِيرَةٌ',
  'الرب': 'هُوَ الرَّبُّ سُبْحَانَهُ',
  'رب': 'هُوَ الرَّبُّ سُبْحَانَهُ',
  'ثلاثة': 'هِيَ ثَلَاثَةٌ',
  'النوم': 'هُوَ النَّوْمُ',
  'نوم': 'هُوَ النَّوْمُ',
  'الدعاء': 'هُوَ الدُّعَاءُ',
  'دعاء': 'هُوَ الدُّعَاءُ',
  'يهاجروا': 'أَنْ يُهَاجِرُوا',
  'بدعة': 'هِيَ بِدْعَةٌ',
  'الرياء': 'هُوَ الرِّيَاءُ',
  'رياء': 'هُوَ رِيَاءٌ',
  'صغيرة': 'هِيَ صَغِيرَةٌ',
  'الرقية': 'هِيَ الرُّقْيَةُ',
  'رقية': 'هِيَ رُقْيَةٌ',
  'الوضوء': 'هُوَ الْوُضُوءُ',
  'وضوء': 'هُوَ وُضُوءٌ',
  'النسيان': 'هُوَ النِّسْيَانُ',
  'الإخلاص': 'هُوَ الْإِخْلَاصُ',
  'الاخلاص': 'هُوَ الْإِخْلَاصُ',
  'كافر': 'هُوَ كَافِرٌ',
  'الربا': 'هُوَ الرِّبَا',
  'الجوع': 'هُوَ الْجُوعُ',
  'النفس': 'هِيَ النَّفْسُ',
  'موقوف': 'هُوَ مَوْقُوفٌ',
  'الزمان': 'هُوَ الزَّمَانُ',
  'زمان': 'هُوَ الزَّمَانُ',
  'التاريخ': 'هُوَ التَّارِيخُ',
  'الطائف': 'هُوَ الطَّائِفُ',
  'الصيام': 'هُوَ الصِّيَامُ',
  'خاتما': 'هُوَ خَاتَمًا',
  'ليلا': 'فِي اللَّيْلِ',
  'سافر': 'قَدْ سَافَرَ',
  'بالصلاة': 'أَعْنِي بِالصَّلَاةِ',
  'بالزكاة': 'أَعْنِي بِالزَّكَاةِ',
  'بالدعاء': 'أَعْنِي بِالدُّعَاءِ',
  'الأسماء': 'هِيَ الْأَسْمَاءُ',
  'اسماء': 'هِيَ الْأَسْمَاءُ',
  'أسماء': 'هِيَ أَسْمَاءٌ',
  'إكراه': 'الْإِكْرَاهُ',
  'اكراه': 'الْإِكْرَاهُ',
  'السحر': 'السِّحْرْ',
  'سحر': 'السِّحْرْ',
  'البر هو': 'مَا هُوَ الْبِرُّ',
  'أبو هريرة': 'هُوَ أَبُو هُرَيْرَةَ',
  'ابو هريرة': 'هُوَ أَبُو هُرَيْرَةَ',
  // ── unique one-word v282 fails ──
  'نافق': 'قَدْ نَافَقَ',
  'عوقب': 'قَدْ عُوقِبَ',
  'غفلة': 'هِيَ غَفْلَةٌ',
  'الغفلة': 'هِيَ الْغَفْلَةُ',
  'انحر': 'أَعْنِي انْحَرْ',
  'عمله': 'هُوَ عَمَلُهُ',
  'بصره': 'أَعْنِي بَصَرَهُ',
  'معاذ': 'هُوَ مُعَاذٌ',
  'صنما': 'هُوَ صَنَمًا',
  'حجره': 'أَعْنِي حَجَرَهُ',
  'تردد': 'هُوَ تَرَدُّدٌ',
  'يرضى': 'أَنْ يَرْضَى',
  'يصمت': 'أَنْ يَصْمُتَ',
  'يشهد': 'أَنْ يَشْهَدَ',
  'يصدق': 'أَنْ يَصْدُقَ',
  'يكثر': 'أَنْ يُكْثِرَ',
  'يكرر': 'أَنْ يُكَرِّرَ',
  'رزقا': 'أَعْنِي رِزْقًا',
  'سواه': 'مَا سِوَاهُ',
  'قبله': 'مِنْ قَبْلِهِ',
  'أصغر': 'هُوَ الْأَصْغَرْ',
  'اصغر': 'هُوَ الْأَصْغَرْ',
  'قطعه': 'أَعْنِي قَطْعَهُ',
  'تركه': 'أَعْنِي تَرْكَهُ',
  'آلهة': 'هِيَ آلِهَةٌ',
  'ذباب': 'هُوَ ذُبَابٌ',
  'بريء': 'هُوَ بَرِيءٌ',
  'قطعت': 'قَدْ قُطِعَتْ',
  'تركت': 'قَدْ تُرِكَتْ',
  'سبعة': 'هِيَ سَبْعَةٌ',
  'ماله': 'هُوَ مَالُهُ',
  'مسلم': 'هُوَ مُسْلِمٌ',
  'صامه': 'قَدْ صَامَهُ',
  'تاجر': 'هُوَ تَاجِرٌ',
  'اليد': 'هِيَ الْيَدُ',
  'قدسي': 'هُوَ حَدِيثٌ قُدْسِيٌّ',
  'طيبا': 'هُوَ طَيِّبًا',
  'صدرك': 'أَعْنِي صَدْرَكَ',
  'عقلك': 'أَعْنِي عَقْلَكَ',
  'حفظها': 'أَعْنِي حِفْظَهَا',
  'السنن': 'هِيَ السُّنَنُ',
  'عبادة': 'هِيَ عِبَادَةٌ',
  'طلبها': 'أَعْنِي طَلَبَهَا',
  'الأمر': 'هُوَ الْأَمْرُ',
  'الامر': 'هُوَ الْأَمْرُ',
  'بصيرة': 'هِيَ بَصِيرَةٌ',
  'بئرهم': 'أَعْنِي بِئْرَهُمْ',
  'البغي': 'هُوَ الْبَغْيُ',
  'الرجل': 'هُوَ الرَّجُلُ',
  'الصرع': 'هُوَ الصَّرَعُ',
  'الذبح': 'هُوَ الذَّبْحُ',
  'الطفل': 'هُوَ الطِّفْلُ',
  'الضيف': 'هُوَ الضَّيْفُ',
  'الواو': 'هِيَ الْوَاوُ',
  'مغفور': 'هُوَ مَغْفُورٌ',
  'الودع': 'هُوَ الْوَدَعُ',
  'رمضان': 'هُوَ شَهْرُ رَمَضَانَ',
  'الشرك': 'هُوَ الشِّرْكُ',
  'الناس': 'هُمْ النَّاسُ',
  'القوة': 'هِيَ الْقُوَّةُ',
  'استقم': 'أَعْنِي اسْتَقِمْ',
  'تضاعف': 'أَنْ تُضَاعَفَ',
  'أغناه': 'قَدْ أَغْنَاهُ',
  'اغناه': 'قَدْ أَغْنَاهُ',
  'ينصرك': 'أَنْ يَنْصُرَكَ',
  'يرزقك': 'أَنْ يَرْزُقَكَ',
  'الزهد': 'هُوَ الزُّهْدُ',
  'الشام': 'هِيَ الشَّامُ',
  'اليمن': 'هُوَ الْيَمَنْ',
  'تركته': 'قَدْ تَرَكْتُهُ',
  'الذكر': 'هُوَ الذِّكْرُ',
  'صلاته': 'هِيَ صَلَاتُهُ',
  'صدقته': 'هِيَ صَدَقَتُهُ',
  'تعليمه': 'أَعْنِي تَعْلِيمَهُ',
  'الزواج': 'هُوَ الزَّوَاجُ',
  'التطوع': 'هُوَ التَّطَوُّعُ',
  'الأثاث': 'هُوَ الْأَثَاثُ',
  'الاثاث': 'هُوَ الْأَثَاثُ',
  'الرجال': 'هُمْ الرِّجَالُ',
  'فليغضب': 'أَعْنِي فَلْيَغْضَبْ',
  'الفسوق': 'هُوَ الْفُسُوقُ',
  'الطيرة': 'هِيَ الطِّيَرَةُ',
  'الطائر': 'هُوَ الطَّائِرُ',
  'الغيبة': 'هِيَ الْغِيبَةُ',
  'السرقة': 'هِيَ السَّرِقَةُ',
  'بالقوة': 'أَعْنِي بِالْقُوَّةِ',
  'الصراخ': 'هُوَ الصُّرَاخُ',
  'بالسيف': 'أَعْنِي بِالسَّيْفِ',
  'بالصمت': 'أَعْنِي بِالصَّمْتِ',
  'اللسان': 'هُوَ اللِّسَانُ',
  'الرعاة': 'هُمْ الرُّعَاةُ',
  'تنظيفها': 'أَعْنِي تَنْظِيفَهَا',
  'العيينة': 'هِيَ الْعُيَيْنَةُ',
  'بالصيام': 'أَعْنِي بِالصِّيَامِ',
  'الصابئة': 'هُمُ الصَّابِئَةُ',
  'للتجارة': 'أَعْنِي لِلتِّجَارَةِ',
  'النافلة': 'هِيَ النَّافِلَةُ',
  'الطهارة': 'هِيَ الطَّهَارَةُ',
  'الإلزام': 'هُوَ الْإِلْزَامُ',
  'الالزام': 'هُوَ الْإِلْزَامُ',
  'بالتخمين': 'أَعْنِي بِالتَّخْمِينِ',
  'اليهودية': 'هِيَ الْيَهُودِيَّةُ',
  'المملوكة': 'هِيَ الْمَمْلُوكَةُ',
  'الأغنياء': 'هُمُ الْأَغْنِيَاءُ',
  'الاغنياء': 'هُمُ الْأَغْنِيَاءُ',
  'الشهادتان': 'هِيَ الشَّهَادَتَانِ',
  // ── short two-word / names ──
  'ابن عباس': 'هُوَ ابْنُ عَبَّاسٍ',
  'ابن مسعود': 'هُوَ ابْنْ مَسْعُودٍ',
  'عمر بن الخطاب': 'هُوَ عُمَرُ بْنُ الْخَطَّابِ',
  'عيسى بن مريم': 'هُوَ عِيسَى بْنُ مَرْيَمَ',
  'موسى بن عمران': 'هُوَ مُوسَى بْنُ عِمْرَانَ',
  'غزوة بدر': 'هِيَ غَزْوَةُ بَدْرٍ',
  'مئة ألف': 'هِيَ مِئَةُ أَلْفٍ',
  'ذكر مطلق': 'هُوَ ذِكْرٌ مُطْلَقٌ',
  'حبه فقط': 'حُبَّهُ  فَقَطْ',
  'ما يشاء': 'مَا  يَشَاءُ',
  'عشر سنين': 'عَشْرَ  سِنِينَ',
  'خمس سنين': 'خَمْسَ  سِنِينَ',
  'ذكره فقط': 'ذِكْرَهُ  فَقَطْ',
  'قتل النفس': 'قَتْلُ  النَّفْسِ',
  'البشر فقط': 'الْبَشَرُ  فَقَطْ',
  'فقط بالشر': 'فَقَطْ  بِالشَّرِّ',
  'ثلاث سنين': 'ثَلَاثَ  سِنِينَ',
  'عشرين سنة': 'عِشْرِينَ  سَنَةً',
  'علم اللغة': 'عِلْمُ  اللُّغَةِ',
  'على المال': 'عَلَى  الْمَالِ',
  'إلى تجارة': 'إِلَى  تِجَارَةٍ',
  'للنفس فقط': 'لِلنَّفْسِ  فَقَطْ',
  'الصدق فقط': 'الصِّدْقَ  فَقَطْ',
  'ما هو أحب': 'مَا هُوَ  أَحَبُّ',
  'صدقة تطوع': 'صَدَقَةُ  تَطَوُّعٍ',
  'ترك النوم': 'تَرْكُ  النَّوْمِ',
  'ترك متعمد': 'تَرْكٌ  مُتَعَمَّدٌ',
  'ثبت الكهان': 'قَدْ ثَبَتَ  الْكُهَّانُ',
  'بالكتب فقط': 'بِالْكُتُبِ  فَقَطْ',
  'معرفة الله': 'مَعْرِفَةُ  اللَّهِ',
  'الصدقة فقط': 'الصَّدَقَةُ  فَقَطْ',
  'الطواف فقط': 'الطَّوَافُ  فَقَطْ',
  'تعمد الذنب': 'تَعَمُّدُ  الذَّنْبِ',
  'بالسؤال فقط': 'بِالسُّؤَالِ  فَقَطْ',
  'الحب والخوف': 'الْحُبُّ  وَالْخَوْفُ',
  'كثرة الصلاة': 'كَثْرَةُ  الصَّلَاةِ',
  'الأكل والشرب': 'الْأَكْلُ  وَالشُّرْبُ',
  'يوفون بالنذر': 'أَنْ يُوفُوا  بِالنَّذْرِ',
  'العلم والعمل': 'الْعِلْمُ  وَالْعَمَلُ',
  'الصيام كثيرا': 'الصِّيَامُ  كَثِيرًا',
  'نفي الأنبياء': 'نَفْيُ  الْأَنْبِيَاءِ',
  'نفي الملائكة': 'نَفْيُ  الْمَلَائِكَةِ',
  'افترضته عليه': 'افْتَرَضْتُهُ  عَلَيْهِ',
  'كل ما سوى الله': 'كُلُّ مَا  سِوَى  اللَّهِ',
  'أن تلد الأمة ربتها': 'أَنْ تَلِدَ  الْأَمَةُ  رَبَّتَهَا',
  'كأنك تراه': 'كَأَنَّكَ  تَرَاهُ',
  'تزيد الرزق': 'أَنْ تَزِيدَ  الرِّزْقَ',
  'تطفئ الغضب': 'أَنْ تُطْفِئَ  الْغَضَبَ',
  'يصلون كثيرا': 'أَنْ يُصَلُّوا  كَثِيرًا',
  'عبادته وحده': 'عِبَادَتُهُ  وَحْدَهُ',
  'ابدأ بالجزية': 'أَعْنِي ابْدَأْ  بِالْجِزْيَةِ',
  'تجلب الزبائن': 'أَنْ تَجْلِبَ  الزَّبَائِنَ',
  'الملائكة فقط': 'الْمَلَائِكَةُ  فَقَطْ',
  'خيرا أو ليصمت': 'خَيْرًا  أَوْ  لِيَصْمُتْ',
  'الكلمة الطيبة صدقة': 'الْكَلِمَةُ  الطَّيِّبَةُ  صَدَقَةٌ',
  'لأنها فصول': 'لِأَنَّهَا ثَلَاثَةُ  فُصُولٍ',
  'لأنها أدلة': 'لِأَنَّهَا ثَلَاثَةُ  أَدِلَّةٍ',
  'لأنها مؤلفين': 'لِأَنَّهَا ثَلَاثَةُ  مُؤَلِّفِينَ',
});

/**
 * Apply whole-utterance carrier if bare key matches (diacritic-insensitive).
 */
export function applyShortSpeechCarriers(text) {
  const raw = String(text || '').trim();
  if (!raw) return raw;
  const key = bareArabicKey(raw);
  if (!key) return raw;
  const hit = SHORT_SPEECH_CARRIERS[key];
  return hit || raw;
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
  return s;
}

export function prepareFishTtsText(text) {
  // Preserve formation (harakat); expand honorifics; drop marks spoken as words.
  // NEVER strip mid-word harakat — Fish needs tashkeel to avoid «اللاه» / mangled iʿrāb.
  let s = String(text || '');
  // Ultra-short MC carriers BEFORE digit expand (so «لأنها 3 فصول» matches bare key)
  s = applyShortSpeechCarriers(s.trim());
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
  s = s.replace(/(^|[^\u0621-\u064A])ابن\s+مسعود(?=[^\u0621-\u064A]|$)/g, '$1ابْنْ مَسْعُودٍ');
  s = s.replace(/(^|[^\u0621-\u064A])أبو\s+هريرة(?=[^\u0621-\u064A]|$)/g, '$1أَبُو هُرَيْرَةَ');
  s = s.replace(/(^|[^\u0621-\u064A])ابو\s+هريرة(?=[^\u0621-\u064A]|$)/g, '$1أَبُو هُرَيْرَةَ');
  s = stripTtsPunctuation(s);
  // Early whole-utterance carriers (bare-key; catches «لأنها 3 فصول» before digit expand)
  s = applyShortSpeechCarriers(s);
  // Micro-gaps AFTER strip (strip collapses whitespace) — clearer sahaba names
  s = s.replace(/عُقْبَةُ بْنُ عَامِرٍ/g, 'عُقْبَةُ  بْنُ  عَامِرٍ');
  s = s.replace(/ابْن[ُِْ]?\s*مَسْعُودٍ/g, 'ابْنْ  مَسْعُودٍ');
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
  // Tanween on أنواط → phantom ن / أنواع; prefer sukun (not fatha→أنواع)
  s = s.replace(/أَنْوَاط[ٍَ]/g, 'أَنْوَاطْ');
  s = s.replace(/انواط[ٍَ]?/g, 'أَنْوَاطْ');
  s = s.replace(/(^|[^\u0621-\u064A])أنواط(?=[^\u0621-\u064A]|$)/g, '$1أَنْوَاطْ');
  // Truncated fill-blank: sukun + gap so clone doesn't slur فرائض→فلا
  s = s.replace(/فَرَائِضَ\s*فَلَا/g, 'فَرَائِضْ  فَلَا');
  s = s.replace(/فَرَائِض\s*فَلَا/g, 'فَرَائِضْ  فَلَا');
  s = s.replace(/فرائض\s*فلا/g, 'فَرَائِضْ  فَلَا');
  // خطأ alone → شطأ; pad when whole utterance
  s = s.replace(/^خَطَأٌ$/u, 'هَذَا خَطَأٌ');
  s = s.replace(/^خَطَأ$/u, 'هَذَا خَطَأٌ');
  s = s.replace(/^خطأ$/u, 'هَذَا خَطَأٌ');
  // Ultra-short MC options Fish mangles — article/pad like صح→صحيح (UI bare unchanged)
  s = s.replace(/^إِكْرَاه[ٍُِ]?$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^اكراه$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^إكراه$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^السِّحْر[َُِ]?$/u, 'السِّحْرْ');
  s = s.replace(/^السِّحْر[َُِ]?$/u, 'السِّحْرْ');
  s = s.replace(/^السحر$/u, 'السِّحْرْ');
  s = s.replace(/^الزَّمَان[َُِْ]?$/u, 'هُوَ الزَّمَانُ');
  s = s.replace(/^الزَّمَان[َُِْ]?$/u, 'هُوَ الزَّمَانُ');
  s = s.replace(/^الزمان$/u, 'هُوَ الزَّمَانُ');
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
  // أنواط after ذات — genitive ذاتِ + sukun أنواط (avoid أنواع)
  s = s.replace(/ذَات[َُِ]?\s+أَنْوَاطْ?/g, 'ذَاتِ  أَنْوَاطْ');
  s = s.replace(/ذات\s+أنواط/g, 'ذَاتِ  أَنْوَاطْ');
  // بُضْع clarity without tatweel: separate from أحدكم
  s = s.replace(/بُضْعِ\s+أَحَدِكُمْ/g, 'بُضْعِ  أَحَدِكُمْ');
  // TF / ultra-short options — صَحّ often heard as «صحن»; speak كامل
  s = s.replace(/(^|[\s،,])صَحّ(?=$|[\s،,])/g, '$1صَحِيحٌ');
  s = s.replace(/(^|[\s،,])صح(?=$|[\s،,])/g, '$1صَحِيحٌ');
  // صَحِيحٌ alone → سحيح; pad like خطأ→هذا خطأ (UI still «صح» / «صحيح»)
  s = s.replace(/^صَحِيح[ٌُ]?$/u, 'هَذَا صَحِيحٌ');
  s = s.replace(/^صحيح$/u, 'هَذَا صَحِيحٌ');
  // Short MC tokens Fish mangles into English/noise — speech carriers (display unchanged)
  s = s.replace(/^جَائِز[ٌَِ]?$/u, 'هَذَا جَائِزٌ');
  s = s.replace(/^جائز$/u, 'هَذَا جَائِزٌ');
  s = s.replace(/^أَنْوَاطْ$/u, 'شَجَرَةُ ذَاتِ أَنْوَاطْ');
  s = s.replace(/^أنواط$/u, 'شَجَرَةُ ذَاتِ أَنْوَاطْ');
  s = s.replace(/^ثَلَاثَة[ٌٍُِ]?$/u, 'هِيَ ثَلَاثَةٌ');
  s = s.replace(/^ثلاثة$/u, 'هِيَ ثَلَاثَةٌ');
  s = s.replace(/^النَّوْم[َُِْ]?$/u, 'هُوَ النَّوْمُ');
  s = s.replace(/^النوم$/u, 'هُوَ النَّوْمُ');
  s = s.replace(/^الدُّعَاء[َُِْ]?$/u, 'هُوَ الدُّعَاءُ');
  s = s.replace(/^الدعاء$/u, 'هُوَ الدُّعَاءُ');
  s = s.replace(/^يُهَاجِرُوا$/u, 'أَنْ يُهَاجِرُوا');
  s = s.replace(/^يهاجروا$/u, 'أَنْ يُهَاجِرُوا');
  s = s.replace(/^بِدْعَة[ٌٌ]?$/u, 'هِيَ بِدْعَةٌ');
  s = s.replace(/^بدعة$/u, 'هِيَ بِدْعَةٌ');
  s = s.replace(/^الطِّبّ?[َُِْ]?$/u, "عِلْمُ الطِّبِّ");
  s = s.replace(/^الطِّبّ?[َُِْ]?$/u, "عِلْمُ الطِّبِّ");
  s = s.replace(/^الطب$/u, "عِلْمُ الطِّبِّ");
  s = s.replace(/^الصَّوْم[َُِْ]?$/u, 'هُوَ الصَّوْمُ');
  s = s.replace(/^الصوم$/u, 'هُوَ الصَّوْمُ');
  s = s.replace(/^الصِّيَام[َُِْ]?$/u, 'هُوَ الصِّيَامُ');
  s = s.replace(/^الصِّيَام[َُِْ]?$/u, 'هُوَ الصِّيَامُ');
  s = s.replace(/^الصيام$/u, 'هُوَ الصِّيَامُ');
  s = s.replace(/^الزِّنَا$/u, 'هُوَ الزِّنَا');
  s = s.replace(/^الزِّنَا$/u, 'هُوَ الزِّنَا');
  s = s.replace(/^الزنا$/u, 'هُوَ الزِّنَا');
  s = s.replace(/^الرِّيَاء[َُِْ]?$/u, 'هُوَ الرِّيَاءُ');
  s = s.replace(/^الرِّيَاء[َُِْ]?$/u, 'هُوَ الرِّيَاءُ');
  s = s.replace(/^الرياء$/u, 'هُوَ الرِّيَاءُ');
  s = s.replace(/^رِيَاء[ٌٌ]?$/u, 'هُوَ رِيَاءٌ');
  s = s.replace(/^رياء$/u, 'هُوَ رِيَاءٌ');
  s = s.replace(/^صَغِيرَة[ٌٌ]?$/u, 'هِيَ صَغِيرَةٌ');
  s = s.replace(/^صغيرة$/u, 'هِيَ صَغِيرَةٌ');
  s = s.replace(/^الرُّقْيَة[َُِْ]?$/u, 'هِيَ الرُّقْيَةُ');
  s = s.replace(/^الرُّقْيَة[َُِْ]?$/u, 'هِيَ الرُّقْيَةُ');
  s = s.replace(/^الرقية$/u, 'هِيَ الرُّقْيَةُ');
  s = s.replace(/^رُقْيَة[ٌٌ]?$/u, 'هِيَ رُقْيَةٌ');
  s = s.replace(/^رقية$/u, 'هِيَ رُقْيَةٌ');
  s = s.replace(/^الْوُضُوء[َُِْ]?$/u, 'هُوَ الْوُضُوءُ');
  s = s.replace(/^الوضوء$/u, 'هُوَ الْوُضُوءُ');
  s = s.replace(/^وُضُوء[ٌٌ]?$/u, 'هُوَ وُضُوءٌ');
  s = s.replace(/^وضوء$/u, 'هُوَ وُضُوءٌ');
  s = s.replace(/^النِّسْيَان[َُِْ]?$/u, 'هُوَ النِّسْيَانُ');
  s = s.replace(/^النِّسْيَان[َُِْ]?$/u, 'هُوَ النِّسْيَانُ');
  s = s.replace(/^النسيان$/u, 'هُوَ النِّسْيَانُ');
  s = s.replace(/^الْإِخْلَاص[َُِْ]?$/u, 'هُوَ الْإِخْلَاصُ');
  s = s.replace(/^الإخلاص$/u, 'هُوَ الْإِخْلَاصُ');
  s = s.replace(/^كَافِر[ٌٌ]?$/u, 'هُوَ كَافِرٌ');
  s = s.replace(/^كافر$/u, 'هُوَ كَافِرٌ');
  s = s.replace(/^الظُّلْم[َُِْ]?$/u, 'هُوَ الظُّلْمُ');
  s = s.replace(/^الظُّلْم[َُِْ]?$/u, 'هُوَ الظُّلْمُ');
  s = s.replace(/^الظلم$/u, 'هُوَ الظُّلْمُ');
  s = s.replace(/^الرِّبَا$/u, 'هُوَ الرِّبَا');
  s = s.replace(/^الرِّبَا$/u, 'هُوَ الرِّبَا');
  s = s.replace(/^الربا$/u, 'هُوَ الرِّبَا');
  s = s.replace(/^صَدَقَة[ٌٌ]?$/u, 'هِيَ صَدَقَةٌ');
  s = s.replace(/^صدقة$/u, 'هِيَ صَدَقَةٌ');
  s = s.replace(/^الْجُوع[َُِْ]?$/u, 'هُوَ الْجُوعُ');
  s = s.replace(/^الجوع$/u, 'هُوَ الْجُوعُ');
  s = s.replace(/^النَّفْس[َُِْ]?$/u, 'هِيَ النَّفْسُ');
  s = s.replace(/^النَّفْس[َُِْ]?$/u, 'هِيَ النَّفْسُ');
  s = s.replace(/^النفس$/u, 'هِيَ النَّفْسُ');
  s = s.replace(/^مَوْقُوف[ٌٌ]?$/u, 'هُوَ مَوْقُوفٌ');
  s = s.replace(/^موقوف$/u, 'هُوَ مَوْقُوفٌ');
  s = s.replace(/^الرَّبّ[َُِْ]?$/u, 'هُوَ الرَّبُّ');
  s = s.replace(/^الرَّبّ[َُِْ]?$/u, 'هُوَ الرَّبُّ');
  s = s.replace(/^الرب$/u, 'هُوَ الرَّبُّ');
  s = s.replace(/^التَّارِيخ[َُِْ]?$/u, 'هُوَ التَّارِيخُ');
  s = s.replace(/^التَّارِيخ[َُِْ]?$/u, 'هُوَ التَّارِيخُ');
  s = s.replace(/^التاريخ$/u, 'هُوَ التَّارِيخُ');
  s = s.replace(/^خَاتَمًا$/u, 'هُوَ خَاتَمًا');
  s = s.replace(/^خاتما$/u, 'هُوَ خَاتَمًا');
  s = s.replace(/^لَيْلًا$/u, 'فِي اللَّيْلِ');
  s = s.replace(/^ليلا$/u, 'فِي اللَّيْلِ');
  s = s.replace(/^سَافَرَ?$/u, 'قَدْ سَافَرَ');
  s = s.replace(/^سافر$/u, 'قَدْ سَافَرَ');
  s = s.replace(/^الطَّائِف[َُِْ]?$/u, 'هُوَ الطَّائِفُ');
  s = s.replace(/^الطَّائِف[َُِْ]?$/u, 'هُوَ الطَّائِفُ');
  s = s.replace(/^الطائف$/u, 'هُوَ الطَّائِفُ');
  s = s.replace(/^بِالصَّلَاةِ$/u, 'أَعْنِي بِالصَّلَاةِ');
  s = s.replace(/^بالصلاة$/u, 'أَعْنِي بِالصَّلَاةِ');
  s = s.replace(/^بِالزَّكَاةِ$/u, 'أَعْنِي بِالزَّكَاةِ');
  s = s.replace(/^بالزكاة$/u, 'أَعْنِي بِالزَّكَاةِ');
  s = s.replace(/^بِالدُّعَاءِ$/u, 'أَعْنِي بِالدُّعَاءِ');
  s = s.replace(/^بِالدُّعَاءِ$/u, 'أَعْنِي بِالدُّعَاءِ');
  s = s.replace(/^بالدعاء$/u, 'أَعْنِي بِالدُّعَاءِ');
  s = s.replace(/^الْأَسْمَاء[َُِْ]?$/u, 'هِيَ الْأَسْمَاءُ');
  s = s.replace(/^الأسماء$/u, 'هِيَ الْأَسْمَاءُ');
  s = s.replace(/^أَسْمَاء[ٌٌ]?$/u, 'هِيَ أَسْمَاءٌ');
  s = s.replace(/^أسماء$/u, 'هِيَ أَسْمَاءٌ');
  // Truncated fill prompts — carriers so clone doesn't mangle stubs
  s = s.replace(/^الْبِرُّ\s+هُوَ\.?$/u, 'مَا هُوَ الْبِرُّ');
  s = s.replace(/^البر\s+هو\.?$/u, 'مَا هُوَ الْبِرُّ');
  s = s.replace(/^مَا\s+الْبِرُّ\s+هُوَ$/u, 'مَا هُوَ الْبِرُّ');
  // Residual short nouns — fuller carriers (keep bare content words)
  s = s.replace(/^هُوَ\s+الطِّبُّ$/u, "عِلْمُ الطِّبِّ");
  s = s.replace(/^هُوَ\s+الطِّبُّ$/u, "عِلْمُ الطِّبِّ");
  s = s.replace(/^الطِّبُّ\s+النَّبَوِيُّ$/u, "عِلْمُ الطِّبِّ");
  s = s.replace(/^الطِّبُّ\s+النَّبَوِيُّ$/u, "عِلْمُ الطِّبِّ");
  s = s.replace(/^هُوَ\s+الصَّوْمُ$/u, 'صَوْمُ رَمَضَانَ');
  s = s.replace(/^أَعْنِي\s+الصَّوْمَ$/u, 'صَوْمُ رَمَضَانَ');
  s = s.replace(/^هُوَ\s+الزِّنَا$/u, 'فَاحِشَةُ الزِّنَا');
  s = s.replace(/^هُوَ\s+الزِّنَا$/u, 'فَاحِشَةُ الزِّنَا');
  s = s.replace(/^هِيَ\s+صَدَقَةٌ$/u, 'أَعْنِي صَدَقَةً');
  s = s.replace(/^هُوَ\s+الظُّلْمُ$/u, 'الظُّلْمُ كَبِيرَةٌ');
  s = s.replace(/^هُوَ\s+الظُّلْمُ$/u, 'الظُّلْمُ كَبِيرَةٌ');
  s = s.replace(/^أَعْنِي\s+الظُّلْمَ$/u, 'الظُّلْمُ كَبِيرَةٌ');
  s = s.replace(/^أَعْنِي\s+الظُّلْمَ$/u, 'الظُّلْمُ كَبِيرَةٌ');
  s = s.replace(/^هُوَ\s+الرَّبُّ$/u, 'هُوَ الرَّبُّ سُبْحَانَهُ');
  s = s.replace(/^هُوَ\s+الرَّبُّ$/u, 'هُوَ الرَّبُّ سُبْحَانَهُ');
  // أنواط — شجرة carrier (ذاتي أنواق still weak without شجرة)
  s = s.replace(/^ذَات[َُِ]?\s+أَنْوَاطْ$/u, 'شَجَرَةُ ذَاتِ أَنْوَاطْ');
  s = s.replace(/^أَنْوَاطْ$/u, 'شَجَرَةُ ذَاتِ أَنْوَاطْ');
  // الزكاة شرعاً — nominative (not genitive from quotes) + gap
  s = s.replace(/الزَّكَاةِ\s+شَرْعًا/g, 'الزَّكَاةُ  شَرْعًا');
  s = s.replace(/الزكاة\s+شرعاً?/g, 'الزَّكَاةُ  شَرْعًا');
  s = s.replace(/^أَبُو\s+هُرَيْرَةَ$/u, 'هُوَ أَبُو هُرَيْرَةَ');
  s = s.replace(/^أبو\s+هريرة$/u, 'هُوَ أَبُو هُرَيْرَةَ');
  s = s.replace(/^عُقْبَةُ\s+بْنُ\s+عَامِرٍ$/u, 'هُوَ عُقْبَةُ بْنُ عَامِرٍ');
  s = s.replace(/وَآتُوا\s+الزَّكَاة[َُِ]?/g, 'وَآتُوا  الزَّكَاةَ');
  s = s.replace(/وآتوا\s+الزكاة/g, 'وَآتُوا  الزَّكَاةَ');
  s = s.replace(/^الصَّلَاة[َُِ]?\s+فَقَطْ$/u, 'الصَّلَاةُ  فَقَطْ');
  s = s.replace(/^الصلاة\s+فقط$/u, 'الصَّلَاةُ  فَقَطْ');
  // إكراه + tanween damma (ٌ) — article pad
  s = s.replace(/^إِكْرَاه[ٌٍُِ]?$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^اكراه$/u, 'الْإِكْرَاهُ');
  s = s.replace(/^إكراه$/u, 'الْإِكْرَاهُ');
  // Short single-token options: slight gap after article to reduce collapse (جن→جدا)
  s = s.replace(/^الْجِنَّ$/u, 'الْجِنّ');
  s = s.replace(/^الْإِنْسَ$/u, 'الْإِنْس');
  s = s.replace(/^عِبَادَةٌ$/u, 'هِيَ عِبَادَةٌ');
  // دم امرئ — micro-gaps (prep letters stay correct; helps clone not slur)
  s = s.replace(/دَمُ\s+امْرِئٍ\s+مُسْلِمٍ/g, 'دَمُ  امْرِئٍ  مُسْلِمٍ');
  // قرب ذبابا لصنم — gaps + للصنم (lam+article) clarity
  s = s.replace(/قَرَّبَ\s+ذُبَابًا\s+لِصَنَمٍ/g, 'قَرَّبَ  ذُبَابًا  لِلصَّنَمِ');
  s = s.replace(/قَرَّبَ\s+ذُبَابًا\s+لِصَنَمٍ/g, 'قَرَّبَ  ذُبَابًا  لِلصَّنَمِ');
  s = s.replace(/قرب\s+ذباباً?\s+لصنم/g, 'قَرَّبَ  ذُبَابًا  لِلصَّنَمِ');
  // الشرك الأصغر — gap + sukun so أصغر≠أصدر
  s = s.replace(/الشِّرْكِ\s+الْأَصْغَر[َُِ]?/g, "الشِّرْكِ  الْأَصْغَرْ");
  s = s.replace(/الشِّرْكِ\s+الْأَصْغَر[َُِ]?/g, "الشِّرْكِ  الْأَصْغَرْ");
  s = s.replace(/الشرك\s+الأصغر/g, "الشِّرْكِ  الْأَصْغَرْ");
  // رقى / تمائم / تولة / شرك — gaps; شركْ avoids شركم/شركة tanween slur
  s = s.replace(
    /إِنَّ\s+الرُّقَى\s+وَالتَّمَائِمَ\s+وَالتِّوَلَةَ\s+شِرْك[ٌْ]?/g,
    "إِنَّ الرُّقَى   وَالتَّمَائِمْ   وَالتِّوَلَةَ   شِرْكْ"
  );
  s = s.replace(
    /إِنَّ\s+الرُّقَى\s+وَالتَّمَائِمَ\s+وَالتِّوَلَةَ\s+شِرْك[ٌْ]?/g,
    "إِنَّ الرُّقَى   وَالتَّمَائِمْ   وَالتِّوَلَةَ   شِرْكْ"
  );
  s = s.replace(
    /ان\s+الرقى\s+والتمائم\s+والتولة\s+شرك/g,
    "إِنَّ الرُّقَى   وَالتَّمَائِمْ   وَالتِّوَلَةَ   شِرْكْ"
  );
  // التمائم alone / in questions — sukun ending + gap after article stem
  s = s.replace(/التَّمَائِم[َُِ]/g, 'التَّمَائِمْ');
  s = s.replace(/التَّمَائِم[َُِ]/g, 'التَّمَائِمْ');
  // أهل اليمن — sukun + gap (اليمان/اليمد)
  s = s.replace(/أَهْل[َِ]?\s+الْيَمَن[َُِ]?/g, 'أَهْلَ  الْيَمَنْ');
  s = s.replace(/اهل\s+اليمن/g, 'أَهْلَ  الْيَمَنْ');
  // ابن مسعود — pad carrier (damma→ابنو; bare still fails) like خطأ→هذا خطأ
  s = s.replace(/^ابْنْ?\s*مَسْعُودٍ$/u, 'هُوَ ابْنْ مَسْعُودٍ');
  s = s.replace(/ابْن[ُِْ]?\s+مَسْعُودٍ/g, 'ابْنْ  مَسْعُودٍ');
  s = s.replace(/^ابن\s+مسعود$/u, 'هُوَ ابْنْ مَسْعُودٍ');
  s = s.replace(/ابن\s+مسعود/g, 'ابْنْ  مَسْعُودٍ');
  // أنواط short phrase — contextual carrier شجرة (same lesson sense)
  s = s.replace(/^ذَاتِ\s+أَنْوَاطْ\s+كَانَتْ$/u, 'شَجَرَةُ ذَاتِ أَنْوَاطْ كَانَتْ');
  s = s.replace(/^ذَات[َُِ]?\s+أَنْوَاطْ?\s+كَانَتْ$/u, 'شَجَرَةُ ذَاتِ أَنْوَاطْ كَانَتْ');
  // عقبة بن عامر — reinforce micro-gaps (also set earlier; re-assert after strip)
  s = s.replace(/عُقْبَةُ\s+بْنُ\s+عَامِرٍ/g, 'عُقْبَةُ  بْنُ  عَامِرٍ');
  // أن تعبد الله — residual تعبو/دلله: clear mansub + gap before الله
  s = s.replace(/أَنْ\s+تَعْبُد[َُ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, "أَنْ تَعْبُدَ  اللَّهَ");
  s = s.replace(/ان\s+تعبد\s+الله/g, "أَنْ تَعْبُدَ  اللَّهَ");
  // لا ضرر ولا ضرار — wider gaps + sukun (ضرر→ذرر)
  s = s.replace(/لَا\s+ضَرَر[َْ]?\s+وَلَا\s+ضِرَار[َْ]?/g, 'لَا  ضَرَرْ  وَلَا  ضِرَارْ');
  s = s.replace(/لا\s+ضرر\s+ولا\s+ضرار/g, 'لَا  ضَرَرْ  وَلَا  ضِرَارْ');
  // Diacritic-insensitive whole-utterance carriers (covers case variants missed above)
  s = applyShortSpeechCarriers(s);
  // Two-word / phrase clarity — micro-gaps + nominative where needed
  s = s.replace(/^غَزْوَةِ\s+بَدْرٍ$/u, 'هِيَ غَزْوَةُ  بَدْرٍ');
  s = s.replace(/^ذِكْرٌ\s+مُطْلَقٌ$/u, 'هُوَ ذِكْرٌ  مُطْلَقٌ');
  s = s.replace(/^مِئَةُ\s+أَلْفٍ$/u, 'هِيَ مِئَةُ  أَلْفٍ');
  s = s.replace(/^يُصَلُّونَ\s+كَثِيرًا$/u, 'أَنْ يُصَلُّوا  كَثِيرًا');
  s = s.replace(/^تَزِيدُ\s+الرِّزْقَ$/u, 'أَنْ تَزِيدَ  الرِّزْقَ');
  s = s.replace(/^تُطْفِئُ\s+الْغَضَبَ$/u, 'أَنْ تُطْفِئَ  الْغَضَبَ');
  s = s.replace(/^ابْدَأْ\s+بِالْجِزْيَةِ$/u, 'أَعْنِي ابْدَأْ  بِالْجِزْيَةِ');
  s = s.replace(/^تَجْلِبُ\s+الزَّبَائِنَ$/u, 'أَنْ تَجْلِبَ  الزَّبَائِنَ');
  s = s.replace(/^الْمَلَائِكَةُ\s+فَقَطْ$/u, 'الْمَلَائِكَةُ  فَقَطْ');
  s = s.replace(/^عِبَادَتُهُ\s+وَحْدَهُ$/u, 'عِبَادَتُهُ  وَحْدَهُ');
  s = s.replace(/^خَيْرًا\s+أَوْ\s+لِيَصْمُتْ$/u, 'خَيْرًا  أَوْ  لِيَصْمُتْ');
  s = s.replace(/^كَأَنَّكَ\s+تَرَاهُ$/u, 'كَأَنَّكَ  تَرَاهُ');
  s = s.replace(/^الْكَلِمَةُ\s+الطَّيِّبَةُ\s+صَدَقَةٌ$/u, 'الْكَلِمَةُ  الطَّيِّبَةُ  صَدَقَةٌ');
  // DO NOT insert mid-word tatweel — v265 tried it for «clarity» and Whisper proved
  // بُضْـع/صَدَقَـة/رياء/ذُكِـرَت → mangled (بضعي/صديقاتون/رياق/لكرة).
  s = applySystematicCaseEndings(s);
  // Re-apply carriers after case endings (idempotent for framed forms)
  s = applyShortSpeechCarriers(s);
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
