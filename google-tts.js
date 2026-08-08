/** Google Cloud Text-to-Speech (paid; primary fallback candidate for Allah). */

import { fixAllahIrabInText } from './allah-irab.js';

export const DEFAULT_GOOGLE_ARABIC_VOICE = 'ar-XA-Chirp3-HD-Achird';
export const FALLBACK_GOOGLE_ARABIC_VOICE = 'ar-XA-Wavenet-B';

const GOOGLE_TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const GOOGLE_HARAKAT_RE = /[\u064B-\u065F\u0670]/g;

const GOOGLE_ALLAH = 'اللّٰه';
const GOOGLE_ALLAHUMMA = 'اللّٰهُمَّ';
const GOOGLE_LILLAH = 'لِلّٰه';
const GOOGLE_BILLAH = 'بِاللّٰه';
const GOOGLE_WALLAH = 'وَاللّٰه';
const GOOGLE_FALLAH = 'فَاللّٰه';
const GOOGLE_TALLAH = 'تَاللّٰه';
const GOOGLE_KALLAH = 'كَاللّٰه';
const GOOGLE_WALILLAH = 'وَلِلّٰه';
const GOOGLE_FALILLAH = 'فَلِلّٰه';
const GOOGLE_ILLA_ALLAH = 'إِلَّا اللّٰه';
const GOOGLE_LA_ILAHA_ILLA_ALLAH = 'لَا إِلَهَ إِلَّا اللّٰه';
const GOOGLE_LA_MABUDA_BIHAQQ_ILLA_ALLAH = 'لَا مَعْبُودَ بِحَقٍّ إِلَّا اللّٰه';
const GOOGLE_PHRASE_RULES = [
  [/شهادة أن لا إله إلا الله/g, 'شَهَادَةُ أَنْ لَا إِلَهَ إِلَّا اللّٰه'],
  [/شهادة ان لا اله الا الله/g, 'شَهَادَةُ أَنْ لَا إِلَهَ إِلَّا اللّٰه'],
  [/لا إله إلا الله/g, GOOGLE_LA_ILAHA_ILLA_ALLAH],
  [/لا اله الا الله/g, GOOGLE_LA_ILAHA_ILLA_ALLAH],
  [/لا معبود بحق إلا الله/g, GOOGLE_LA_MABUDA_BIHAQQ_ILLA_ALLAH],
  [/لا معبود بحق الا الله/g, GOOGLE_LA_MABUDA_BIHAQQ_ILLA_ALLAH],
  [/إلا الله/g, GOOGLE_ILLA_ALLAH],
  [/الا الله/g, GOOGLE_ILLA_ALLAH],
  [/إفراد الله بالعبادة/g, `إِفْرَادُ ${GOOGLE_ALLAH} بِالْعِبَادَةِ`],
  [/افراد الله بالعباده/g, `إِفْرَادُ ${GOOGLE_ALLAH} بِالْعِبَادَةِ`],
  [/لعن الله من ذبح لغير الله/g, `لَعَنَ ${GOOGLE_ALLAH} مَنْ ذَبَحَ لِغَيْرِ ${GOOGLE_ALLAH}`],
  [/بالله عليك/g, `${GOOGLE_BILLAH} عَلَيْكَ`],
  [/والله أعلم/g, `${GOOGLE_WALLAH} أَعْلَمُ`],
  [/والله اعلم/g, `${GOOGLE_WALLAH} أَعْلَمُ`],
  [/إن شاء الله/g, `إِنْ شَاءَ ${GOOGLE_ALLAH}`],
  [/ان شاء الله/g, `إِنْ شَاءَ ${GOOGLE_ALLAH}`],
  [/ما شاء الله/g, `مَا شَاءَ ${GOOGLE_ALLAH}`],
];

function stripHarakat(text) {
  return String(text || '').replace(GOOGLE_HARAKAT_RE, '');
}

function applyGooglePhraseRules(text) {
  let s = String(text || '');
  for (const [pattern, replacement] of GOOGLE_PHRASE_RULES) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

function normalizeAllahForGoogleTts(text) {
  const H = '[\\u064B-\\u065F\\u0670]*';
  let s = String(text || '');

  s = s.replace(/\uFDF2/g, GOOGLE_ALLAH);
  s = s.replace(new RegExp(`ل${H}ا${H}\\s+إ${H}ل${H}ه${H}\\s+إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), GOOGLE_LA_ILAHA_ILLA_ALLAH);
  s = s.replace(new RegExp(`إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), GOOGLE_ILLA_ALLAH);
  s = s.replace(new RegExp(`ل${H}ا${H}\\s+م${H}ع${H}ب${H}و${H}د${H}\\s+ب${H}ح${H}ق${H}\\s+إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), GOOGLE_LA_MABUDA_BIHAQQ_ILLA_ALLAH);
  s = s.replace(new RegExp(`[اأإآٱ]${H}ل${H}ل${H}ه${H}م${H}`, 'g'), GOOGLE_ALLAHUMMA);

  s = s.replace(new RegExp(`([بوفكت])${H}[اأإآٱ]${H}ل${H}ل${H}ه(${H})`, 'g'), (_, p) => {
    if (p === 'ب') return GOOGLE_BILLAH;
    if (p === 'و') return GOOGLE_WALLAH;
    if (p === 'ف') return GOOGLE_FALLAH;
    if (p === 'ت') return GOOGLE_TALLAH;
    return GOOGLE_KALLAH;
  });

  s = s.replace(
    new RegExp(`(^|[^\\u0621-\\u064A\\u0671])([وف])${H}ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'),
    (_, pre, p) => `${pre}${p === 'و' ? GOOGLE_WALILLAH : GOOGLE_FALILLAH}`
  );

  s = s.replace(
    new RegExp(`(^|[^\\u0621-\\u064A\\u0671])ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'),
    (_, pre) => `${pre}${GOOGLE_LILLAH}`
  );

  s = s.replace(
    new RegExp(
      `(^|[^\\u0621-\\u064A\\u0671\\u064B-\\u065F\\u0670])[اأإآٱ]${H}ل${H}ل${H}ه(${H})(?!(?:[\\u064B-\\u065F\\u0670]*[\\u0621-\\u064A]))`,
      'g'
    ),
    (_, pre) => `${pre}${GOOGLE_ALLAH}`
  );

  const scrubHack = (hack, repl) => {
    s = s.replace(
      new RegExp(`(^|[^\\u0621-\\u064A\\u0671])${hack}(?=[^\\u0621-\\u064A\\u0671]|$)`, 'g'),
      (_, p) => `${p}${repl}`
    );
  };
  scrubHack('اللاه', GOOGLE_ALLAH);
  scrubHack('للاه', GOOGLE_LILLAH);
  scrubHack('باللاه', GOOGLE_BILLAH);
  scrubHack('واللاه', GOOGLE_WALLAH);
  scrubHack('فاللاه', GOOGLE_FALLAH);
  scrubHack('تاللاه', GOOGLE_TALLAH);
  scrubHack('كاللاه', GOOGLE_KALLAH);
  scrubHack('الا الله', GOOGLE_ILLA_ALLAH);
  scrubHack('إلا الله', GOOGLE_ILLA_ALLAH);

  return s.replace(/(^|[\s(«"'])تعالى(?=$|[\s).،؟!؛»"'])/g, '$1تَعَالَى');
}

function applyGooglePronunciationLexicon(text) {
  return String(text || '').replace(/[\u0621-\u0671\u064B-\u065F\u0670\uFDF2]+/g, (token) => {
    const bare = stripHarakat(token);
    if (bare === 'الله') return GOOGLE_ALLAH;
    if (bare === 'اللهم') return GOOGLE_ALLAHUMMA;
    if (bare === 'لله') return GOOGLE_LILLAH;
    if (bare === 'ولله') return GOOGLE_WALILLAH;
    if (bare === 'فلله') return GOOGLE_FALILLAH;
    if (bare === 'بالله') return GOOGLE_BILLAH;
    if (bare === 'والله') return GOOGLE_WALLAH;
    if (bare === 'فالله') return GOOGLE_FALLAH;
    if (bare === 'تالله') return GOOGLE_TALLAH;
    if (bare === 'كالله') return GOOGLE_KALLAH;
    if (bare === 'إلاالله' || bare === 'الاالله') return GOOGLE_ILLA_ALLAH;
    if (bare === 'لاإلهإلاالله' || bare === 'لاالهالاالله' || bare === 'لاالهإلاالله') return GOOGLE_LA_ILAHA_ILLA_ALLAH;
    if (bare === 'تعالى') return 'تَعَالَى';
    return token;
  });
}

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripTtsPunctuation(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildGoogleSsml(text) {
  const clean = fixAllahIrabInText(stripTtsPunctuation(text));
  return (
    `<speak version="1.0" xml:lang="ar-XA">` +
    `<prosody rate="92%">${escapeXml(clean)}</prosody>` +
    `</speak>`
  );
}

export function googleTtsConfigured(_env) {
  return false;
}

export async function synthesizeGoogleArabicSpeech(_text, _voiceName, _env) {
  throw new Error('Google TTS disabled — lesson voice is Fish راوٍ عربي حكيم only; Quran uses Hudhaify');
}
