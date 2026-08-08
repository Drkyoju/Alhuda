/** Azure Cognitive Services Speech — Neural TTS (Free F0: 0.5M chars/month). */

import { applyShortSpeechCarriers } from './short-speech-carriers.js';
import {
  fixAllahIrabInText,
  ALLAH_NOM,
  ALLAHUMMA as IRAB_ALLAHUMMA,
  LILLAH as IRAB_LILLAH,
  BILLAH as IRAB_BILLAH,
  WALLAH as IRAB_WALLAH,
  FALLAH as IRAB_FALLAH,
  TALLAH as IRAB_TALLAH,
  KALLAH as IRAB_KALLAH,
  WALILLAH as IRAB_WALILLAH,
  FALILLAH as IRAB_FALILLAH,
} from './allah-irab.js';

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

/**
 * Allah-family for Azure Hamed.
 * NEVER send bare الله without shadda — Hamed then says «اللاه» / mangled short forms.
 * Use NFC shadda-THEN-vowel forms from allah-irab (same as Fish-era fix).
 * Force IPA via <phoneme> + hosted PLS so bank-wide الله/بالله/والله/لله/تالله stay correct.
 */
const ALLAH = ALLAH_NOM;
const ALLAHUMMA = IRAB_ALLAHUMMA;
const LILLAH = IRAB_LILLAH;
const BILLAH = IRAB_BILLAH;
const WALLAH = IRAB_WALLAH;
const FALLAH = IRAB_FALLAH;
const TALLAH = IRAB_TALLAH;
const KALLAH = IRAB_KALLAH;
const WALILLAH = IRAB_WALILLAH;
const FALILLAH = IRAB_FALILLAH;

/** Bare grapheme → IPA (Microsoft ar-SA phoneme set / PLS). */
const ALLAH_IPA_BY_BARE = {
  اللهم: 'ʔalˈlaːhum.ma',
  بالله: 'bilˈlaːh',
  والله: 'walˈlaːh',
  فالله: 'falˈlaːh',
  تالله: 'talˈlaːh',
  كالله: 'kalˈlaːh',
  ولله: 'wa.lilˈlaːh',
  فلله: 'fa.lilˈlaːh',
  لله: 'lilˈlaːh',
  الله: 'ʔalˈlaːh',
};

/**
 * Spoken SSML body — wrap الله-family tokens in <phoneme> (same Hamed voice).
 * Do NOT inject Quran <audio> clips (second-voice problem).
 */
function textToSsmlBody(text, { usePhoneme = true } = {}) {
  const clean = String(text || '')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!usePhoneme) return escapeXml(clean);

  return clean.replace(/[\u0621-\u0671\u064B-\u065F\u0670\uFDF2]+/g, (tok) => {
    const bare = stripHarakatLocal(tok);
    const ph = ALLAH_IPA_BY_BARE[bare];
    if (!ph) return escapeXml(tok);
    return `<phoneme alphabet="ipa" ph="${escapeXml(ph)}">${escapeXml(tok)}</phoneme>`;
  });
}

/** Scrub only fake «اللاه» spellings → NFC iʿrāb forms (whole token). */
function scrubFakeAllahSpellings(text) {
  let s = String(text || '');
  s = s.replace(/\uFDF2/g, ALLAH);
  const scrubHack = (hack, repl) => {
    s = s.replace(
      new RegExp(`(^|[^\\u0621-\\u064A\\u0671])${hack}(?=[^\\u0621-\\u064A\\u0671]|$)`, 'g'),
      (_, p) => `${p}${repl}`
    );
  };
  scrubHack('اللاه', ALLAH);
  scrubHack('للاه', LILLAH);
  scrubHack('باللاه', BILLAH);
  scrubHack('واللاه', WALLAH);
  scrubHack('فاللاه', FALLAH);
  scrubHack('تاللاه', TALLAH);
  scrubHack('كاللاه', KALLAH);
  return s;
}

/**
 * Extra pronunciation anchors (bare → spoken).
 * Allah family is handled by fixAllahIrabInText — do NOT strip them to bare here.
 */
const AZURE_PRON_LEXICON = [
  ['اللاه', ALLAH],
  ['للاه', LILLAH],
  ['باللاه', BILLAH],
  ['واللاه', WALLAH],
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
    // Never let a generic lexicon entry collapse الله-family NFC forms.
    if (ALLAH_IPA_BY_BARE[bare]) return tok;
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

function normalizeForAzure(text) {
  // Whole-utterance carriers first (short MC options) — display stays bare in UI.
  let s = applyShortSpeechCarriers(String(text || '').trim());
  s = s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/ﷺ/g, ` صَلَّى ${ALLAH} عَلَيْهِ وَسَلَّمَ `)
    .replace(/ﷻ/g, ' جَلَّ جَلَالُهُ ')
    .replace(/رضي الله عنهما/g, ` رَضِيَ الله عَنْهُمَا `)
    .replace(/رضي الله عنها/g, ` رَضِيَ الله عَنْهَا `)
    .replace(/رضي الله عنه/g, ` رَضِيَ الله عَنْهُ `)
    .replace(/(\d+)\s*هـ?/g, (_, n) => ` ${numberToArabicWords(n)} هِجْرِيَّةً `)
    .replace(/\bهـ\b/g, ' هِجْرِيَّةً ')
    .replace(/\b(\d{1,4})\b/g, (_, n) => ` ${numberToArabicWords(n)} `)
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = applyAzurePronLexicon(s);
  // Bank-wide case-aware الله + NFC شدة ثم حركة (never bare strip → «اللاه»).
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

function buildSsml(text, voice, rate = AZURE_SSML_RATE_QUESTION, { lexiconUri, usePhoneme = true } = {}) {
  const lang = 'ar-SA';
  // Educational MSA: slight speedup + mild volume (SSML only — no client EQ).
  // Rate owned by speed path (v292); Allah/NFC/iʿrāb owned here.
  const rateResolved = resolveAzureSsmlRate(rate);
  const body = textToSsmlBody(normalizeForAzure(text), { usePhoneme });
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

export async function synthesizeAzureArabicSpeech(text, voiceShortName, env, opts = {}) {
  const key = env?.AZURE_SPEECH_KEY;
  const region = env?.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error('Azure Speech not configured (missing AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)');
  }
  const voice = resolveAzureArabicVoice(voiceShortName, env);
  const rate = resolveAzureSsmlRate(opts?.rate);
  const base = String(env?.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/$/, '');
  const lexiconUri = `${base}${ALLAH_LEXICON_PATH}`;
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  async function post(ssml, format = OUTPUT_FORMAT) {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': format,
        'User-Agent': 'AlhudaApp',
      },
      body: ssml,
    });
  }

  // 1) Phoneme + PLS lexicon (bank-wide الله).
  let res = await post(buildSsml(text, voice, rate, { lexiconUri, usePhoneme: true }));
  if (!res.ok && res.status === 400) {
    // 2) Lexicon only (some Neural builds reject IPA <phoneme> for ar-SA).
    res = await post(buildSsml(text, voice, rate, { lexiconUri, usePhoneme: false }));
  }
  if (!res.ok && res.status === 400) {
    // 3) NFC iʿrāb text only + softer format.
    res = await post(buildSsml(text, voice, rate, { usePhoneme: false }), OUTPUT_FORMAT_FALLBACK);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Azure TTS ${res.status}: ${detail.slice(0, 180)}`);
  }
  return res.body;
}

export function azureSpeechConfigured(env) {
  return !!(env?.AZURE_SPEECH_KEY && env?.AZURE_SPEECH_REGION);
}
