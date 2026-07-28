/** Static baked TTS paths — must match scripts/collect_tts_strings.mjs + app.js TTS_CACHE_VER. */

export const BAKED_TTS_CACHE_VER = 'v29';
/** Yousef — ElevenLabs MSA voice id (must match app.js TTS_VOICE). */
export const BAKED_TTS_VOICE = 'ZCXYdzd5Evtsll2EdoCi';

export function bakedTtsCacheKey(text, voice = BAKED_TTS_VOICE, cacheVer = BAKED_TTS_CACHE_VER) {
  return `${cacheVer}::${voice}::${String(text || '').slice(0, 600)}`;
}

export async function bakedTtsAssetPath(text, voice = BAKED_TTS_VOICE, cacheVer = BAKED_TTS_CACHE_VER) {
  const key = bakedTtsCacheKey(text, voice, cacheVer);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `/tts-baked/${hex}.mp3`;
}

export async function fetchBakedTtsResponse(baseUrl, text, voice = BAKED_TTS_VOICE, cacheVer = BAKED_TTS_CACHE_VER) {
  const path = await bakedTtsAssetPath(text, voice, cacheVer);
  const url = baseUrl ? new URL(path, baseUrl) : path;
  return fetch(url);
}
