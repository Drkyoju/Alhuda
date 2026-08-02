(function (g) {
  const BAKED_TTS_CACHE_VER = 'v30';
  const BAKED_TTS_VOICE = 'c3e5d81d807f4cbc9a0c2872a4dea9ea';
  const pathCache = new Map();

  async function bakedTtsAssetPath(text, voice, cacheVer) {
    const v = voice || BAKED_TTS_VOICE;
    const ver = cacheVer || BAKED_TTS_CACHE_VER;
    const key = `${ver}::${v}::${String(text || '').slice(0, 600)}`;
    if (pathCache.has(key)) return pathCache.get(key);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const path = `/tts-baked/${hex}.mp3`;
    pathCache.set(key, path);
    return path;
  }

  g.bakedTtsAssetPath = bakedTtsAssetPath;
  g.BAKED_TTS_CACHE_VER = BAKED_TTS_CACHE_VER;
  g.BAKED_TTS_VOICE = BAKED_TTS_VOICE;
})(typeof window !== 'undefined' ? window : globalThis);
