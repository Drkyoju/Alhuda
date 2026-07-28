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
 * Allah-family for Azure: BARE Arabic orthography only.
 * Heavy tashkeel (اللَّهُ / لِلّٰه) + per-token SSML breaks made Hamed say «اللاه»
 * and chop the sentence. Keep natural flow; never fake «اللاه» spellings.
 * Sync with app.js normalizeAllahForTts.
 */
const ALLAH = 'الله';
const ALLAHUMMA = 'اللهم';
const LILLAH = 'لله';
const BILLAH = 'بالله';
const WALLAH = 'والله';
const FALLAH = 'فالله';
const TALLAH = 'تالله';
const KALLAH = 'كالله';
const WALILLAH = 'ولله'; // ≠ والله
const FALILLAH = 'فلله';

/** Spoken SSML body — plain text, no per-token breaks/emphasis (those made speech choppy). */
function textToSsmlBody(text) {
  const clean = String(text || '')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return escapeXml(clean);
}

/**
 * Collapse every الله-family token to bare orthography (no harakat / dagger / ligature).
 * Must stay in sync with app.js normalizeAllahForTts.
 */
function normalizeAllahForTts(text) {
  const H = '[\u064B-\u065F\u0670]*';
  let s = String(text || '');

  // ligature → bare
  s = s.replace(/\uFDF2/g, ALLAH);

  // اللهم first
  s = s.replace(new RegExp(`[اأإآٱ]${H}ل${H}ل${H}ه${H}م${H}`, 'g'), ALLAHUMMA);

  // ب|و|ف|ك|ت + الله — alef REQUIRED (otherwise ولله becomes والله).
  s = s.replace(new RegExp(`([بوفكت])${H}[اأإآٱ]${H}ل${H}ل${H}ه(${H})`, 'g'), (_, p) => {
    if (p === 'ب') return BILLAH;
    if (p === 'و') return WALLAH;
    if (p === 'ف') return FALLAH;
    if (p === 'ت') return TALLAH;
    return KALLAH;
  });

  // ولله / فلله (no alef)
  s = s.replace(
    new RegExp(`(^|[^\\u0621-\\u064A\\u0671])([وف])${H}ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'),
    (_, pre, p) => `${pre}${p === 'و' ? WALILLAH : FALILLAH}`
  );

  // لله
  s = s.replace(
    new RegExp(`(^|[^\\u0621-\\u064A\\u0671])ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'),
    (_, pre) => `${pre}${LILLAH}`
  );

  // bare الله — only at token start (do not re-write inside بالله / والله)
  s = s.replace(
    new RegExp(
      `(^|[^\\u0621-\\u064A\\u0671\\u064B-\\u065F\\u0670])[اأإآٱ]${H}ل${H}ل${H}ه(${H})(?!(?:[\\u064B-\\u065F\\u0670]*[\\u0621-\\u064A]))`,
      'g'
    ),
    (_, pre) => `${pre}${ALLAH}`
  );

  // Scrub legacy whole-token hacks only — never touch للاهتداء.
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

/** Extra pronunciation anchors (bare → spoken). Allah family stays bare. */
const AZURE_PRON_LEXICON = [
  ['الله', ALLAH],
  ['اللهم', ALLAHUMMA],
  ['لله', LILLAH],
  ['ولله', WALILLAH],
  ['فلله', FALILLAH],
  ['بالله', BILLAH],
  ['والله', WALLAH],
  ['فالله', FALLAH],
  ['تالله', TALLAH],
  ['كالله', KALLAH],
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
  ['الطيرة', 'الطِّيَرَةُ'],
  ['تعالى', 'تَعَالَى'],
];

function stripHarakatLocal(s) {
  return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
}

function applyAzurePronLexicon(text) {
  return String(text || '').replace(/[\u0621-\u0671\u064B-\u065F\u0670\uFDF2]+/g, (tok) => {
    const bare = stripHarakatLocal(tok);
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
  let s = String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/ﷺ/g, ` صَلَّى ${ALLAH} عَلَيْهِ وَسَلَّمَ `)
    .replace(/ﷻ/g, ' جَلَّ جَلَالُهُ ')
    .replace(/رضي الله عنهما/g, ` رَضِيَ ${ALLAH} عَنْهُمَا `)
    .replace(/رضي الله عنها/g, ` رَضِيَ ${ALLAH} عَنْهَا `)
    .replace(/رضي الله عنه/g, ` رَضِيَ ${ALLAH} عَنْهُ `)
    .replace(/(\d+)\s*هـ?/g, (_, n) => ` ${numberToArabicWords(n)} هِجْرِيَّةً `)
    .replace(/\bهـ\b/g, ' هِجْرِيَّةً ')
    .replace(/\b(\d{1,4})\b/g, (_, n) => ` ${numberToArabicWords(n)} `)
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = applyAzurePronLexicon(s);
  return normalizeAllahForTts(s);
}

function buildSsml(text, voice) {
  const lang = String(voice).startsWith('ar-EG') ? 'ar-EG' : 'ar-SA';
  // Mild slowdown only — heavy rate + per-token wrapping made Allah sound wrong/choppy.
  const rate = '-8%';
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
