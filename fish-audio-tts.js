/** Fish Audio text-to-speech (Arabic-capable S1 / S2-Pro / S2.1-Pro). */

/**
 * Fallback only — prefer env FISH_VOICE_ID (your cloned / custom voice).
 * Do not ship a public library narrator as the product voice.
 */
export const DEFAULT_FISH_VOICE_ID = '';
/**
 * Best quality model on paid Fish plans (docs: recommend s2-pro).
 * Free-tier alternate was s2.1-pro-free — override with FISH_TTS_MODEL if needed.
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

export async function synthesizeFishArabicSpeech(text, voiceId, env = process.env) {
  const apiKey = String(env?.FISH_API_KEY || '').trim();
  if (!apiKey) throw new Error('Fish Audio not configured (missing FISH_API_KEY)');

  const selectedVoice = resolveFishVoiceId(voiceId, env);
  if (!selectedVoice) {
    throw new Error('Fish TTS missing voice — set FISH_VOICE_ID to your Fish Audio voice/model id');
  }
  const model = resolveFishModel(env);
  const clean = String(text || '').trim();
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
