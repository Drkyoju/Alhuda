/** Fish Audio text-to-speech — sole lesson TTS provider (Quran stays Hudhaify). */

import { fixAllahIrabInText } from './allah-irab.js';

/**
 * Fallback empty — product voice MUST come from env FISH_VOICE_ID.
 */
export const DEFAULT_FISH_VOICE_ID = '';
/**
 * Best quality model on paid Fish plans (docs recommend s2-pro).
 */
export const DEFAULT_FISH_MODEL = 's2-pro';
export const FISH_TTS_ENDPOINT = 'https://api.fish.audio/v1/tts';

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

/** Strip punctuation/symbols so Fish never vocalizes «نقطتان» / commas / quotes. */
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
  return fixAllahIrabInText(stripTtsPunctuation(text));
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

  const res = await fetch(FISH_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model,
    },
    body: JSON.stringify({
      text: clean,
      reference_id: selectedVoice,
      format: 'mp3',
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Fish TTS ${res.status}: ${detail.slice(0, 280)}`);
  }
  return res.body;
}
