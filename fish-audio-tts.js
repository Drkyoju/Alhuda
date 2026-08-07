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
  latency: 'normal', // best quality (vs balanced/low)
  normalize: false, // keep Arabic harakat — do not rewrite diacritics
  chunk_length: 280, // higher = better continuity/quality (100–300)
  temperature: 0.55, // lower = clearer, more consistent MSA reads
  top_p: 0.65,
  repetition_penalty: 1.25,
  prosody: {
    speed: 0.94, // slightly slower → clearer for students
    volume: 2, // mild lift (dB, -20..20)
    normalize_loudness: true, // S2-Pro consistent loudness
  },
});

export function fishAudioConfigured(env = process.env) {
  return !!String(env?.FISH_API_KEY || '').trim();
}

export function resolveFishVoiceId(voiceId, env = process.env) {
  return (
    String(voiceId || env?.FISH_VOICE_ID || DEFAULT_FISH_VOICE_ID).trim() ||
    String(env?.FISH_VOICE_ID || '').trim()
  );
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

export function prepareFishTtsText(text) {
  // Preserve formation (harakat); only drop marks that get spoken as words.
  return fixAllahIrabInText(stripTtsPunctuation(text));
}

function buildFishTtsBody(cleanText, selectedVoice, env = process.env) {
  const q = FISH_QUALITY_DEFAULTS;
  const speed = Number(env?.FISH_TTS_SPEED);
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
      speed: Number.isFinite(speed) && speed >= 0.5 && speed <= 2 ? speed : q.prosody.speed,
      volume: Number.isFinite(volume) && volume >= -20 && volume <= 20 ? volume : q.prosody.volume,
      normalize_loudness: q.prosody.normalize_loudness,
    },
  };
}

export async function synthesizeFishArabicSpeech(text, voiceId, env = process.env) {
  const apiKey = String(env?.FISH_API_KEY || '').trim();
  if (!apiKey) throw new Error('Fish Audio not configured (missing FISH_API_KEY)');

  const selectedVoice = resolveFishVoiceId(voiceId, env);
  if (!selectedVoice) {
    throw new Error('Fish TTS missing voice — set FISH_VOICE_ID to your Fish Audio voice/model id');
  }
  const model = resolveFishModel(env);
  const clean = prepareFishTtsText(text);
  if (!clean) throw new Error('Fish TTS empty text');

  const body = buildFishTtsBody(clean, selectedVoice, env);

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
