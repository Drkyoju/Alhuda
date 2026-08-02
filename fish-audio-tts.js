/** Fish Audio text-to-speech (Arabic-capable S1 / S2-Pro). */

/** صوت راوي عربي — calm clear educational male MSA narrator. */
export const DEFAULT_FISH_VOICE_ID = 'c3e5d81d807f4cbc9a0c2872a4dea9ea';
/** Free S2.1 Pro tier (through Aug 31, 2026) — see https://fish.audio/blog/s2-1-pro-free-api/ */
export const DEFAULT_FISH_MODEL = 's2.1-pro-free';
export const FISH_TTS_ENDPOINT = 'https://api.fish.audio/v1/tts';

export function fishAudioConfigured(env = process.env) {
  return !!String(env?.FISH_API_KEY || '').trim();
}

export async function synthesizeFishArabicSpeech(text, voiceId, env = process.env) {
  const apiKey = String(env?.FISH_API_KEY || '').trim();
  if (!apiKey) throw new Error('Fish Audio not configured (missing FISH_API_KEY)');

  const selectedVoice =
    String(voiceId || env?.FISH_VOICE_ID || DEFAULT_FISH_VOICE_ID).trim() || DEFAULT_FISH_VOICE_ID;
  const model = String(env?.FISH_TTS_MODEL || DEFAULT_FISH_MODEL).trim() || DEFAULT_FISH_MODEL;
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
