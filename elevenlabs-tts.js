/** ElevenLabs Text-to-Speech (primary Arabic provider candidate). */

export const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';
export const DEFAULT_ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

const ELEVENLABS_TTS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';
const ELEVENLABS_HARAKAT_RE = /[\u064B-\u065F\u0670]/g;

const EL_ALLAH = 'اللّٰه';
const EL_ALLAHUMMA = 'اللّٰهُمَّ';
const EL_LILLAH = 'لِلّٰه';
const EL_BILLAH = 'بِاللّٰه';
const EL_WALLAH = 'وَاللّٰه';
const EL_FALLAH = 'فَاللّٰه';
const EL_TALLAH = 'تَاللّٰه';
const EL_KALLAH = 'كَاللّٰه';
const EL_WALILLAH = 'وَلِلّٰه';
const EL_FALILLAH = 'فَلِلّٰه';
const EL_ILLA_ALLAH = 'إِلَّا اللّٰه';
const EL_LA_ILAHA_ILLA_ALLAH = 'لَا إِلَهَ إِلَّا اللّٰه';
const EL_LA_MABUDA_BIHAQQ_ILLA_ALLAH = 'لَا مَعْبُودَ بِحَقٍّ إِلَّا اللّٰه';

const ELEVENLABS_PHRASE_RULES = [
  [/شهادة أن لا إله إلا الله/g, 'شَهَادَةُ أَنْ لَا إِلَهَ إِلَّا اللّٰه'],
  [/شهادة ان لا اله الا الله/g, 'شَهَادَةُ أَنْ لَا إِلَهَ إِلَّا اللّٰه'],
  [/لا إله إلا الله/g, EL_LA_ILAHA_ILLA_ALLAH],
  [/لا اله الا الله/g, EL_LA_ILAHA_ILLA_ALLAH],
  [/لا معبود بحق إلا الله/g, EL_LA_MABUDA_BIHAQQ_ILLA_ALLAH],
  [/لا معبود بحق الا الله/g, EL_LA_MABUDA_BIHAQQ_ILLA_ALLAH],
  [/إلا الله/g, EL_ILLA_ALLAH],
  [/الا الله/g, EL_ILLA_ALLAH],
  [/بالله عليك/g, `${EL_BILLAH} عَلَيْكَ`],
  [/والله أعلم/g, `${EL_WALLAH} أَعْلَمُ`],
  [/والله اعلم/g, `${EL_WALLAH} أَعْلَمُ`],
  [/إن شاء الله/g, `إِنْ شَاءَ ${EL_ALLAH}`],
  [/ان شاء الله/g, `إِنْ شَاءَ ${EL_ALLAH}`],
  [/ما شاء الله/g, `مَا شَاءَ ${EL_ALLAH}`],
];

function stripHarakat(text) {
  return String(text || '').replace(ELEVENLABS_HARAKAT_RE, '');
}

function stripTtsPunctuation(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyPhraseRules(text) {
  let s = String(text || '');
  for (const [pattern, replacement] of ELEVENLABS_PHRASE_RULES) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

function normalizeAllahForElevenLabs(text) {
  const H = '[\\u064B-\\u065F\\u0670]*';
  let s = String(text || '');
  s = s.replace(/\uFDF2/g, EL_ALLAH);
  s = s.replace(new RegExp(`ل${H}ا${H}\\s+إ${H}ل${H}ه${H}\\s+إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), EL_LA_ILAHA_ILLA_ALLAH);
  s = s.replace(new RegExp(`إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), EL_ILLA_ALLAH);
  s = s.replace(new RegExp(`[اأإآٱ]${H}ل${H}ل${H}ه${H}م${H}`, 'g'), EL_ALLAHUMMA);

  s = s.replace(new RegExp(`([بوفكت])${H}[اأإآٱ]${H}ل${H}ل${H}ه(${H})`, 'g'), (_, p) => {
    if (p === 'ب') return EL_BILLAH;
    if (p === 'و') return EL_WALLAH;
    if (p === 'ف') return EL_FALLAH;
    if (p === 'ت') return EL_TALLAH;
    return EL_KALLAH;
  });
  s = s.replace(new RegExp(`(^|[^\\u0621-\\u064A\\u0671])([وف])${H}ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'), (_, pre, p) => `${pre}${p === 'و' ? EL_WALILLAH : EL_FALILLAH}`);
  s = s.replace(new RegExp(`(^|[^\\u0621-\\u064A\\u0671])ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'), (_, pre) => `${pre}${EL_LILLAH}`);
  s = s.replace(new RegExp(`(^|[^\\u0621-\\u064A\\u0671\\u064B-\\u065F\\u0670])[اأإآٱ]${H}ل${H}ل${H}ه(${H})(?!(?:[\\u064B-\\u065F\\u0670]*[\\u0621-\\u064A]))`, 'g'), (_, pre) => `${pre}${EL_ALLAH}`);
  s = s.replace(/(^|[\s(«"'])تعالى(?=$|[\s).،؟!؛»"'])/g, '$1تَعَالَى');
  return s;
}

function applyWordLexicon(text) {
  return String(text || '').replace(/[\u0621-\u0671\u064B-\u065F\u0670\uFDF2]+/g, (token) => {
    const bare = stripHarakat(token);
    if (bare === 'الله') return EL_ALLAH;
    if (bare === 'اللهم') return EL_ALLAHUMMA;
    if (bare === 'لله') return EL_LILLAH;
    if (bare === 'ولله') return EL_WALILLAH;
    if (bare === 'فلله') return EL_FALILLAH;
    if (bare === 'بالله') return EL_BILLAH;
    if (bare === 'والله') return EL_WALLAH;
    if (bare === 'فالله') return EL_FALLAH;
    if (bare === 'تالله') return EL_TALLAH;
    if (bare === 'كالله') return EL_KALLAH;
    if (bare === 'إلاالله' || bare === 'الاالله') return EL_ILLA_ALLAH;
    if (bare === 'لاإلهإلاالله' || bare === 'لاالهالاالله' || bare === 'لاالهإلاالله') return EL_LA_ILAHA_ILLA_ALLAH;
    if (bare === 'تعالى') return 'تَعَالَى';
    return token;
  });
}

function normalizeForElevenLabs(text) {
  return applyWordLexicon(normalizeAllahForElevenLabs(applyPhraseRules(stripTtsPunctuation(text))));
}

export function elevenLabsConfigured(env) {
  return !!String(env?.ELEVENLABS_API_KEY || '').trim();
}

export async function synthesizeElevenLabsArabicSpeech(text, voiceId, env) {
  const apiKey = String(env?.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) throw new Error('ElevenLabs not configured (missing ELEVENLABS_API_KEY)');

  const selectedVoice = String(voiceId || env?.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID).trim() || DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId = String(env?.ELEVENLABS_MODEL_ID || DEFAULT_ELEVENLABS_MODEL_ID).trim() || DEFAULT_ELEVENLABS_MODEL_ID;
  const endpoint = `${ELEVENLABS_TTS_ENDPOINT}/${encodeURIComponent(selectedVoice)}/stream?output_format=mp3_44100_128`;
  const payload = {
    text: normalizeForElevenLabs(text),
    model_id: modelId,
    language_code: 'ar',
    voice_settings: {
      stability: 0.45,
      similarity_boost: 0.8,
      style: 0.05,
      use_speaker_boost: true,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS ${res.status}: ${detail.slice(0, 220)}`);
  }
  return res.body;
}
