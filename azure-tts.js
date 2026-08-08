/** Azure Cognitive Services Speech — Neural TTS (Free F0: 0.5M chars/month). */

import { prepareFishTtsText } from './fish-audio-tts.js';
import { fixAllahIrabInText, ALLAH_NOM } from './allah-irab.js';

/**
 * HamedNeural: Microsoft’s Arabic pronunciation/diacritic improvements
 * land best on this voice for MSA educational text.
 * @see https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-ai-voices-in-arabic-improved-pronunciation/4360306
 */
export const DEFAULT_AZURE_ARABIC_VOICE = 'ar-SA-HamedNeural';
/** Peer female Saudi MSA — not clearly better than Hamed for fusHa lessons; kept for reference only. */
export const FALLBACK_AZURE_ARABIC_VOICE = 'ar-SA-ZariyahNeural';

/** Near-fullband MP3 — clearer consonants for Arabic (Azure max common mono). */
const OUTPUT_FORMAT = 'audio-48khz-192kbitrate-mono-mp3';
/** Soft fallback if region rejects 48k/192. */
const OUTPUT_FORMAT_FALLBACK = 'audio-24khz-160kbitrate-mono-mp3';

/** Public base for Azure to fetch our PLS lexicon (must be absolute HTTPS). */
const DEFAULT_PUBLIC_BASE = 'https://alhuda.ryodan71.workers.dev';
const ALLAH_LEXICON_PATH = '/lexicons/ar-sa-allah.xml';

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHarakatLocal(s) {
  return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
}

/** Bare الله-family — never collapse NFC forms in generic lexicon. */
const ALLAH_BARE_SET = new Set([
  'اللهم',
  'بالله',
  'والله',
  'فالله',
  'تالله',
  'كالله',
  'ولله',
  'فلله',
  'لله',
  'الله',
]);

/**
 * Spoken SSML body — plain Hamed text.
 * Fish-prep already put NFC اللَّهُ/ِ/َ in the string; do not strip or fake «اللاه».
 * Do NOT use IPA <phoneme> (broke ar-SA). Do NOT inject Quran <audio> (second voice).
 */
function textToSsmlBody(text) {
  const clean = String(text || '')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return escapeXml(clean);
}

/** Scrub only fake «اللاه» spellings → NFC nominative (whole token). */
function scrubFakeAllahSpellings(text) {
  let s = String(text || '');
  s = s.replace(/\uFDF2/g, ALLAH_NOM);
  const scrubHack = (hack, repl) => {
    s = s.replace(
      new RegExp(`(^|[^\\u0621-\\u064A\\u0671])${hack}(?=[^\\u0621-\\u064A\\u0671]|$)`, 'g'),
      (_, p) => `${p}${repl}`
    );
  };
  scrubHack('اللاه', ALLAH_NOM);
  scrubHack('للاه', 'لِلَّهِ');
  scrubHack('باللاه', 'بِاللَّهِ');
  scrubHack('واللاه', 'وَاللَّهِ');
  scrubHack('فاللاه', 'فَاللَّهِ');
  scrubHack('تاللاه', 'تَاللَّهِ');
  scrubHack('كاللاه', 'كَاللَّهِ');
  return s;
}

/**
 * Extra pronunciation anchors (bare → spoken).
 * Allah family stays NFC from Fish prep — do NOT strip to bare.
 */
const AZURE_PRON_LEXICON = [
  ['اللاه', ALLAH_NOM],
  ['للاه', 'لِلَّهِ'],
  ['باللاه', 'بِاللَّهِ'],
  ['واللاه', 'وَاللَّهِ'],
  ['التوحيد', 'التَّوْحِيدُ'],
  ['توحيد', 'تَوْحِيدُ'],
  ['الألوهية', 'الْأُلُوهِيَّةِ'],
  ['الالوهية', 'الْأُلُوهِيَّةِ'],
  ['ألوهية', 'أُلُوهِيَّةٍ'],
  ['الربوبية', 'الرُّبُوبِيَّةِ'],
  ['ربوبية', 'رُبُوبِيَّةٍ'],
  ['الشرك', 'الشِّرْكِ'],
  ['شرك', 'شِرْكٌ'],
  ['الطاغوت', 'الطَّاغُوتِ'],
  ['طاغوت', 'طَاغُوتٌ'],
  ['الطواغيت', 'الطَّوَاغِيتِ'],
  ['بالطاغوت', 'بِالطَّاغُوتِ'],
  ['العبادة', 'الْعِبَادَةِ'],
  ['عبادة', 'عِبَادَةٌ'],
  ['إفراد', 'إِفْرَادُ'],
  ['افراد', 'إِفْرَادُ'],
  ['الأصنام', 'الْأَصْنَامِ'],
  ['النية', 'النِّيَّةِ'],
  ['نيات', 'نِيَّاتِ'],
  ['الكفر', 'الْكُفْرِ'],
  ['الإيمان', 'الْإِيمَانِ'],
  ['إبليس', 'إِبْلِيسَ'],
  ['الرقى', 'الرُّقَى'],
  ['التمائم', 'التَّمَائِمِ'],
  ['بالعبادة', 'بِالْعِبَادَةِ'],
  ['هو', 'هُوَ'],
  ['هي', 'هِيَ'],
  ['الطيرة', 'الطِّيَرَةُ'],
  ['تعالى', 'تَعَالَى'],
  ['صحيح', 'صَحِيحٌ'],
  ['خطأ', 'خَطَأٌ'],
  ['الإجابة', 'الْإِجَابَةُ'],
  ['الصحيحة', 'الصَّحِيحَةُ'],
  ['الحديث', 'الْحَدِيثُ'],
  ['النبي', 'النَّبِيُّ'],
  ['صلى', 'صَلَّى'],
  ['وسلم', 'وَسَلَّمَ'],
  ['رضي', 'رَضِيَ'],
  ['عنه', 'عَنْهُ'],
  ['عنها', 'عَنْهَا'],
  ['عنهما', 'عَنْهُمَا'],
  ['التميمة', 'التَّمِيمَةَ'],
  ['تميمة', 'تَمِيمَةً'],
  ['التولة', 'التِّوَلَةَ'],
  ['تولة', 'تِوَلَةً'],
  ['الذبح', 'الذَّبْحُ'],
  ['النذر', 'النَّذْرُ'],
  ['الحلف', 'الْحَلِفُ'],
  ['البدعة', 'الْبِدْعَةُ'],
  ['بدعة', 'بِدْعَةٌ'],
];

function applyAzurePronLexicon(text) {
  return String(text || '').replace(/[\u0621-\u0671\u064B-\u065F\u0670\uFDF2]+/g, (tok) => {
    const bare = stripHarakatLocal(tok);
    if (ALLAH_BARE_SET.has(bare)) return tok;
    for (const [from, to] of AZURE_PRON_LEXICON) {
      if (bare === from || tok === from) return to;
    }
    return tok;
  });
}

/** Digits → Arabic words (short numbers only) so Hamed does not spell digits. */
const ONES = ['', 'وَاحِد', 'اثْنَان', 'ثَلَاثَة', 'أَرْبَعَة', 'خَمْسَة', 'سِتَّة', 'سَبْعَة', 'ثَمَانِيَة', 'تِسْعَة'];
const TENS = ['', 'عَشَرَة', 'عِشْرُون', 'ثَلَاثُون', 'أَرْبَعُون', 'خَمْسُون', 'سِتُّون', 'سَبْعُون', 'ثَمَانُون', 'تِسْعُون'];
const TEENS = ['عَشَرَة', 'أَحَدَ عَشَر', 'اثْنَا عَشَر', 'ثَلَاثَةَ عَشَر', 'أَرْبَعَةَ عَشَر', 'خَمْسَةَ عَشَر', 'سِتَّةَ عَشَر', 'سَبْعَةَ عَشَر', 'ثَمَانِيَةَ عَشَر', 'تِسْعَةَ عَشَر'];

function numberToArabicWords(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0 || num > 9999) return String(n);
  if (num === 0) return 'صِفْر';
  if (num < 10) return ONES[num];
  if (num < 20) return TEENS[num - 10];
  if (num < 100) {
    const o = num % 10;
    const t = Math.floor(num / 10);
    return o ? `${ONES[o]} وَ${TENS[t]}` : TENS[t];
  }
  if (num < 1000) {
    const h = Math.floor(num / 100);
    const rest = num % 100;
    const hundreds = h === 1 ? 'مِائَة' : h === 2 ? 'مِائَتَان' : `${ONES[h]} مِائَة`;
    return rest ? `${hundreds} وَ${numberToArabicWords(rest)}` : hundreds;
  }
  const th = Math.floor(num / 1000);
  const rest = num % 1000;
  const thousands = th === 1 ? 'أَلْف' : th === 2 ? 'أَلْفَان' : `${numberToArabicWords(th)} آلَاف`;
  return rest ? `${thousands} وَ${numberToArabicWords(rest)}` : thousands;
}

/**
 * Hamed speaks Fish-era prepared text:
 * carriers + systematic case + NFC شدة ثم حركة + allah-irab.
 * Display in the UI stays bare — this is TTS-only.
 */
function normalizeForAzure(text) {
  let s = prepareFishTtsText(String(text || ''));
  s = s
    .replace(/(\d+)\s*هـ?/g, (_, n) => ` ${numberToArabicWords(n)} هِجْرِيَّةً `)
    .replace(/\bهـ\b/g, ' هِجْرِيَّةً ')
    .replace(/\b(\d{1,4})\b/g, (_, n) => ` ${numberToArabicWords(n)} `)
    .replace(/\s+/g, ' ')
    .trim();
  s = applyAzurePronLexicon(s);
  s = fixAllahIrabInText(s);
  return scrubFakeAllahSpellings(s);
}

export { normalizeForAzure };

/**
 * Lesson TTS is locked to Hamed — request/env voice switches are ignored.
 * Zariyah is a peer female voice, not a clearly better fusHa reader.
 */
export function resolveAzureArabicVoice(_requested, _env) {
  return DEFAULT_AZURE_ARABIC_VOICE;
}

/** Snappy fusHa (v292) — reverse v290 −8% slowdown; stay below chipmunk. */
export const AZURE_SSML_RATE_QUESTION = '+8%';
/** Answers/options — equal-or-slightly-faster than questions. */
export const AZURE_SSML_RATE_ANSWER = '+12%';
const AZURE_SSML_VOLUME = '+10%';

/** Allow only mild ±20% prosody rates from the client. */
export function resolveAzureSsmlRate(requested) {
  const raw = String(requested || '').trim();
  const m = raw.match(/^([+-]?\d{1,2})%$/);
  if (!m) return AZURE_SSML_RATE_QUESTION;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < -20 || n > 20) return AZURE_SSML_RATE_QUESTION;
  return `${n > 0 ? '+' : ''}${n}%`;
}

function buildSsml(text, voice, rate = AZURE_SSML_RATE_QUESTION, { lexiconUri } = {}) {
  const lang = 'ar-SA';
  // Rate owned by speed path (v292); Allah text = Fish prep + NFC.
  const rateResolved = resolveAzureSsmlRate(rate);
  const body = textToSsmlBody(normalizeForAzure(text));
  const lexiconTag = lexiconUri
    ? `<lexicon uri="${escapeXml(lexiconUri)}"/>`
    : '';
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${escapeXml(voice)}">` +
    `<lang xml:lang="${lang}">` +
    lexiconTag +
    `<prosody rate="${rateResolved}" volume="${AZURE_SSML_VOLUME}">${body}</prosody>` +
    `</lang>` +
    `</voice></speak>`
  );
}

export async function synthesizeAzureArabicSpeech(_text, _voiceShortName, _env, _opts = {}) {
  throw new Error('Azure TTS disabled — lesson voice is Fish راوٍ عربي حكيم only; Quran uses Hudhaify');
}

export function azureSpeechConfigured(_env) {
  // Never advertise Azure as available for lesson TTS.
  return false;
}
