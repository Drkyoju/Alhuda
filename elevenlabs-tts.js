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

export function elevenLabsConfigured(_env) {
  return false;
}

/** ElevenLabs voice ids are mixed alphanumeric (~20 chars). Fish refs are 32-hex. */
export function isElevenLabsVoiceId(id) {
  const s = String(id || '').trim();
  if (!s || s.length < 16 || s.length > 40) return false;
  if (/^[a-f0-9]{32}$/i.test(s)) return false;
  return /^[a-zA-Z0-9_-]+$/.test(s);
}

export function resolveElevenLabsVoiceId(_requested, _env) {
  return DEFAULT_ELEVENLABS_VOICE_ID;
}

export function resolveElevenLabsModelId(_env) {
  return DEFAULT_ELEVENLABS_MODEL_ID;
}

export async function synthesizeElevenLabsArabicSpeech(_text, _voiceId, _env) {
  throw new Error('ElevenLabs disabled — lesson voice is Fish راوٍ عربي حكيم only; Quran uses Hudhaify');
}
