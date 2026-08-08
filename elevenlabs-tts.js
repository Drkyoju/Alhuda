/** ElevenLabs Text-to-Speech (primary Arabic provider candidate). */

import { fixAllahIrabInText } from './allah-irab.js';

export const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';
/** Yousef — Modern Standard Arabic (not the English premade Sarah voice). */
export const DEFAULT_ELEVENLABS_VOICE_ID = 'ZCXYdzd5Evtsll2EdoCi';

const ELEVENLABS_TTS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

function stripTtsPunctuation(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForElevenLabs(text) {
  return fixAllahIrabInText(stripTtsPunctuation(text));
}

export { normalizeForElevenLabs };

export function elevenLabsConfigured(env) {
  return !!String(env?.ELEVENLABS_API_KEY || '').trim();
}

/** ElevenLabs voice ids are mixed alphanumeric (~20 chars). Fish refs are 32-hex. */
export function isElevenLabsVoiceId(id) {
  const s = String(id || '').trim();
  if (!s || s.length < 16 || s.length > 40) return false;
  if (/^[a-f0-9]{32}$/i.test(s)) return false;
  return /^[a-zA-Z0-9_-]+$/.test(s);
}

export function resolveElevenLabsVoiceId(requested, env) {
  const fromReq = String(requested || '').trim();
  if (isElevenLabsVoiceId(fromReq)) return fromReq;
  const fromEnv = String(env?.ELEVENLABS_VOICE_ID || '').trim();
  if (isElevenLabsVoiceId(fromEnv)) return fromEnv;
  return DEFAULT_ELEVENLABS_VOICE_ID;
}

export function resolveElevenLabsModelId(env) {
  return String(env?.ELEVENLABS_MODEL_ID || DEFAULT_ELEVENLABS_MODEL_ID).trim() || DEFAULT_ELEVENLABS_MODEL_ID;
}

export async function synthesizeElevenLabsArabicSpeech(text, voiceId, env) {
  const apiKey = String(env?.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) throw new Error('ElevenLabs not configured (missing ELEVENLABS_API_KEY)');

  const selectedVoice = resolveElevenLabsVoiceId(voiceId, env);
  const modelId = resolveElevenLabsModelId(env);
  // optimize_streaming_latency=3 → faster first audio byte; 64kbps → smaller/faster download.
  const endpoint = `${ELEVENLABS_TTS_ENDPOINT}/${encodeURIComponent(selectedVoice)}/stream?output_format=mp3_44100_64&optimize_streaming_latency=3`;
  const payload = {
    text: normalizeForElevenLabs(text),
    model_id: modelId,
    language_code: 'ar',
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.75,
      style: 0,
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
