/** Azure Cognitive Services Speech — Neural TTS (Free F0: 0.5M chars/month). */

/**
 * HamedNeural: Microsoft’s Arabic pronunciation/diacritic improvements
 * land best on this voice for MSA educational text.
 * @see https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-ai-voices-in-arabic-improved-pronunciation/4360306
 */
export const DEFAULT_AZURE_ARABIC_VOICE = 'ar-SA-HamedNeural';
export const FALLBACK_AZURE_ARABIC_VOICE = 'ar-SA-ZariyahNeural';

/** Near-fullband MP3 — clearer consonants for Arabic. */
const OUTPUT_FORMAT = 'audio-48khz-192kbitrate-mono-mp3';

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Spoken SSML body only — punctuation must never appear (voices say «نقطة»). */
function textToSsmlBody(text) {
  const clean = String(text || '')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return escapeXml(clean);
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
 * Normalize Arabic educational text for clearer Azure Neural pronunciation.
 * Keeps harakat; strips symbols the voice would literally say aloud.
 */
function normalizeForAzure(text) {
  let s = String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/ﷺ/g, ' صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ ')
    .replace(/ﷻ/g, ' جَلَّ جَلَالُهُ ')
    .replace(/رضي الله عنهما/g, ' رَضِيَ اللَّهُ عَنْهُمَا ')
    .replace(/رضي الله عنها/g, ' رَضِيَ اللَّهُ عَنْهَا ')
    .replace(/رضي الله عنه/g, ' رَضِيَ اللَّهُ عَنْهُ ')
    // Hijri year marker — never leave bare «هـ» for the voice to invent.
    .replace(/(\d+)\s*هـ?/g, (_, n) => ` ${numberToArabicWords(n)} هِجْرِيَّةً `)
    .replace(/\bهـ\b/g, ' هِجْرِيَّةً ')
    // Digits that remain (options like 1/2/3 alone) → words when short.
    .replace(/\b(\d{1,4})\b/g, (_, n) => ` ${numberToArabicWords(n)} `)
    // Strip all punctuation — skip/pass over; never speak mark names.
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function buildSsml(text, voice) {
  const lang = String(voice).startsWith('ar-EG') ? 'ar-EG' : 'ar-SA';
  // Slower = clearer tashkeel adherence for educational MSA.
  const rate = '-18%';
  const body = textToSsmlBody(normalizeForAzure(text));
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${escapeXml(voice)}">` +
    `<lang xml:lang="${lang}">` +
    `<prosody rate="${rate}">${body}</prosody>` +
    `</lang>` +
    `</voice></speak>`
  );
}

/**
 * Synthesize Arabic speech via Azure Speech REST.
 * Requires env: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (e.g. eastus, westeurope).
 * Free F0 tier: 500,000 characters / month.
 */
export async function synthesizeAzureArabicSpeech(text, voiceShortName, env) {
  const key = env?.AZURE_SPEECH_KEY;
  const region = env?.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error('Azure Speech not configured (missing AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)');
  }
  const voice = (voiceShortName || DEFAULT_AZURE_ARABIC_VOICE).trim() || DEFAULT_AZURE_ARABIC_VOICE;
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      'User-Agent': 'AlhudaApp',
    },
    body: buildSsml(text, voice),
  });
  if (!res.ok) {
    // Some F0 regions reject 48kHz — fall back to 24kHz once.
    if (res.status === 400) {
      const retry = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3',
          'User-Agent': 'AlhudaApp',
        },
        body: buildSsml(text, voice),
      });
      if (retry.ok) return retry.body;
      const d2 = await retry.text().catch(() => '');
      throw new Error(`Azure TTS ${retry.status}: ${d2.slice(0, 180)}`);
    }
    const detail = await res.text().catch(() => '');
    throw new Error(`Azure TTS ${res.status}: ${detail.slice(0, 180)}`);
  }
  return res.body;
}

export function azureSpeechConfigured(env) {
  return !!(env?.AZURE_SPEECH_KEY && env?.AZURE_SPEECH_REGION);
}
