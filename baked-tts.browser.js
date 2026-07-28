(function (g) {
  const BAKED_TTS_CACHE_VER = 'v29';
  const BAKED_TTS_VOICE = 'ZCXYdzd5Evtsll2EdoCi';

  function bakedTtsCacheKey(text, voice, cacheVer) {
    const v = voice || BAKED_TTS_VOICE;
    const ver = cacheVer || BAKED_TTS_CACHE_VER;
    return ver + '::' + v + '::' + String(text || '').slice(0, 600);
  }

  async function bakedTtsAssetPath(text, voice, cacheVer) {
    const key = bakedTtsCacheKey(text, voice, cacheVer);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
    return '/tts-baked/' + hex + '.mp3';
  }

  g.BAKED_TTS_CACHE_VER = BAKED_TTS_CACHE_VER;
  g.BAKED_TTS_VOICE = BAKED_TTS_VOICE;
  g.bakedTtsAssetPath = bakedTtsAssetPath;
})(typeof window !== 'undefined' ? window : globalThis);
