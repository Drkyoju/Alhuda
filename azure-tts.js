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

/**
 * TTS-only spellings Azure Hamed actually pronounces as Allāh / lillāh.
 * Avoid ٱ (wasla) — Neural Arabic often mangles it into «أله»-like sounds.
 * Extra ألف lengthens ā: الله → اللاله، لله → للاه.
 */
const TTS_ALLAH = 'اللاه';
const TTS_ALLAHUMMA = 'اللهم';
const TTS_LILLAH = 'للاه';
const TTS_BILLAH = 'باللاه';
const TTS_WALLAH = 'واللاه';
const TTS_FALLAH = 'فاللاه';
const TTS_TALLAH = 'تاللاه';
const TTS_KALLAH = 'كاللاه';

/** Spoken SSML body — strip punctuation; slow/clear Allah-family tokens via <sub>. */
function textToSsmlBody(text) {
  const clean = String(text || '')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Match longest Allah-family forms first.
  const re =
    /(اللهم|باللاه|واللاه|فاللاه|تاللاه|كاللاه|للاه|اللاه)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(clean))) {
    if (m.index > last) out += escapeXml(clean.slice(last, m.index));
    const tok = m[0];
    const alias = allahSsmlAlias(tok);
    // <sub alias> is the reliable Neural hook (IPA phonemes break Arabic voices).
    out +=
      `<break time="40ms"/>` +
      `<sub alias="${escapeXml(alias)}">${escapeXml(tok)}</sub>` +
      `<break time="40ms"/>`;
    last = m.index + tok.length;
  }
  if (last < clean.length) out += escapeXml(clean.slice(last));
  return out;
}

function allahSsmlAlias(tok) {
  if (tok === TTS_ALLAHUMMA || tok === 'اللهم') return 'أللهم';
  if (tok === TTS_LILLAH || tok === 'للاه') return 'للاه';
  if (tok === TTS_BILLAH || tok === 'باللاه') return 'باللاه';
  if (tok === TTS_WALLAH || tok === 'واللاه') return 'واللاه';
  if (tok === TTS_FALLAH || tok === 'فاللاه') return 'فاللاه';
  if (tok === TTS_TALLAH || tok === 'تاللاه') return 'تاللاه';
  if (tok === TTS_KALLAH || tok === 'كاللاه') return 'كاللاه';
  return 'اللاه';
}

/**
 * Rewrite every الله-family token to TTS-friendly spellings.
 * Must stay in sync with app.js normalizeAllahForTts.
 */
function normalizeAllahForTts(text) {
  const H = '[\u064B-\u065F\u0670]*';
  let s = String(text || '');

  // اللهم first (before bare الله)
  s = s.replace(new RegExp(`[اأإآٱ]${H}ل${H}ل${H}ه${H}م${H}`, 'g'), TTS_ALLAHUMMA);

  // ب|و|ف|ك|ت + الله
  s = s.replace(new RegExp(`([بوفكت])[اأإآٱ]?${H}ل${H}ل${H}ه(${H})`, 'g'), (_, p) => {
    if (p === 'ب') return TTS_BILLAH;
    if (p === 'و') return TTS_WALLAH;
    if (p === 'ف') return TTS_FALLAH;
    if (p === 'ت') return TTS_TALLAH;
    return TTS_KALLAH;
  });

  // لله (li-llāh) — not the end of الله
  s = s.replace(
    new RegExp(`(^|[^\\u0621-\\u064A\\u0671])ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'),
    (_, pre) => `${pre}${TTS_LILLAH}`
  );

  // bare الله / اللَّه / ٱللَّه… — don't eat اللهم
  s = s.replace(
    new RegExp(`[اأإآٱ]${H}ل${H}ل${H}ه(${H})(?!(?:[\\u064B-\\u065F\\u0670]*[\\u0621-\\u064A]))`, 'g'),
    () => TTS_ALLAH
  );

  return s;
}

/** Extra pronunciation anchors for words Azure often mangles (bare → spoken). */
const AZURE_PRON_LEXICON = [
  ['الله', TTS_ALLAH],
  ['اللهم', TTS_ALLAHUMMA],
  ['لله', TTS_LILLAH],
  ['بالله', TTS_BILLAH],
  ['والله', TTS_WALLAH],
  ['فالله', TTS_FALLAH],
  ['تالله', TTS_TALLAH],
  ['كالله', TTS_KALLAH],
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
  ['الطيرة', 'الطِّيَرَةُ'],
  ['تعالى', 'تَعَالَى'],
];

function stripHarakatLocal(s) {
  return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
}

function applyAzurePronLexicon(text) {
  return String(text || '').replace(/[\u0621-\u0671\u064B-\u065F\u0670]+/g, (tok) => {
    const bare = stripHarakatLocal(tok);
    for (const [from, to] of AZURE_PRON_LEXICON) {
      if (bare === from) return to;
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
 * Normalize Arabic educational text for clearer Azure Neural pronunciation.
 * Keeps harakat; strips symbols the voice would literally say aloud.
 */
function normalizeForAzure(text) {
  let s = String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/ﷺ/g, ' صلى اللاله عليه وسلم ')
    .replace(/ﷻ/g, ' جل جلاله ')
    .replace(/رضي الله عنهما/g, ' رضي اللاله عنهما ')
    .replace(/رضي الله عنها/g, ' رضي اللاله عنها ')
    .replace(/رضي الله عنه/g, ' رضي اللاله عنه ')
    // Hijri year marker — never leave bare «هـ» for the voice to invent.
    .replace(/(\d+)\s*هـ?/g, (_, n) => ` ${numberToArabicWords(n)} هجرية `)
    .replace(/\bهـ\b/g, ' هجرية ')
    // Digits that remain (options like 1/2/3 alone) → words when short.
    .replace(/\b(\d{1,4})\b/g, (_, n) => ` ${numberToArabicWords(n)} `)
    // Strip all punctuation — skip/pass over; never speak mark names.
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = applyAzurePronLexicon(s);
  return normalizeAllahForTts(s);
}

function buildSsml(text, voice) {
  const lang = String(voice).startsWith('ar-EG') ? 'ar-EG' : 'ar-SA';
  // Slightly slower helps Hamed land long vowels on Allah-family words.
  const rate = '-20%';
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
