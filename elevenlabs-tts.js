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

export async function synthesizeElevenLabsArabicSpeech(text, voiceId, env) {
  const apiKey = String(env?.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) throw new Error('ElevenLabs not configured (missing ELEVENLABS_API_KEY)');

  const selectedVoice = String(voiceId || env?.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID).trim() || DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId = String(env?.ELEVENLABS_MODEL_ID || DEFAULT_ELEVENLABS_MODEL_ID).trim() || DEFAULT_ELEVENLABS_MODEL_ID;
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
