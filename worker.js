const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

import { DEFAULT_ARABIC_VOICE, synthesizeArabicSpeech } from './edge-tts.js';
import {
  DEFAULT_ELEVENLABS_VOICE_ID,
  elevenLabsConfigured,
  synthesizeElevenLabsArabicSpeech,
  normalizeForElevenLabs,
} from './elevenlabs-tts.js';
import {
  DEFAULT_GOOGLE_ARABIC_VOICE,
  googleTtsConfigured,
  synthesizeGoogleArabicSpeech,
} from './google-tts.js';
import {
  DEFAULT_AZURE_ARABIC_VOICE,
  azureSpeechConfigured,
  synthesizeAzureArabicSpeech,
} from './azure-tts.js';
import { bakedTtsAssetPath, BAKED_TTS_VOICE } from './baked-tts.js';

/** Lightweight in-isolate error counters (reset when isolate recycles). */
const apiErrorCounters = {
  tts: { total: 0, byCode: {} },
  quran: { total: 0, byCode: {} },
};

/** Approximate Azure TTS chars billed in this isolate (not durable across deploys). */
let isolateAzureChars = 0;

function bumpApiError(kind, code) {
  const bucket = apiErrorCounters[kind];
  if (!bucket) return;
  bucket.total += 1;
  const key = String(code || 'unknown');
  bucket.byCode[key] = (bucket.byCode[key] || 0) + 1;
}

/** Popular mapped verses to warm into edge cache. */
const POPULAR_QURAN_VERSES = [
  '51:56', '4:48', '6:82', '2:256', '3:175', '47:19', '74:1', '16:125', '27:62', '9:31',
  '6:162', '1:2', '108:2', '96:1', '53:19', '6:57', '7:138', '41:53', '2:102', '4:142',
];

function corsHeaders(request, methods = 'GET, POST, OPTIONS') {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

const QURAN_RECITER_CDN = {
  hudhaify: { edition: 'ar.hudhaify', everyayah: 'Hudhaify_64kbps' },
};

const SURAH_AYAH_COUNTS_W = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59,
  37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

function verseKeyToGlobalAyahNumW(surah, ayah) {
  if (!surah || !ayah || surah < 1 || surah > 114) return 0;
  let offset = 0;
  for (let i = 0; i < surah - 1; i++) offset += SURAH_AYAH_COUNTS_W[i] || 0;
  return offset + ayah;
}

async function handleTtsStatus(request, env) {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  const bakedOnly = String(env?.BAKED_TTS_ONLY || '').trim() === '1';
  const eleven = elevenLabsConfigured(env);
  const google = googleTtsConfigured(env);
  const azure = azureSpeechConfigured(env);
  return new Response(JSON.stringify({
    ok: true,
    bakedTtsOnly: bakedOnly,
    elevenLabsConfigured: eleven,
    googleConfigured: google,
    azureConfigured: azure,
    provider: bakedOnly
      ? 'baked'
      : eleven ? 'elevenlabs' : google ? 'google' : azure ? 'azure' : 'edge',
    voice: bakedOnly
      ? BAKED_TTS_VOICE
      : eleven
      ? (String(env?.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID).trim() || DEFAULT_ELEVENLABS_VOICE_ID)
      : google
        ? DEFAULT_GOOGLE_ARABIC_VOICE
        : azure
          ? DEFAULT_AZURE_ARABIC_VOICE
          : DEFAULT_ARABIC_VOICE,
    errors: apiErrorCounters,
    isolateAzureChars,
    azureF0SoftLimit: 450000,
    azureF0HardLimit: 500000,
    keyRotationHint: azure
      ? '⚠️ أمان: إن ظهر مفتاح Azure في شات/سجل سابقاً — ألغِ المفتاح فوراً من Azure Portal → Keys، أنشئ مفتاحاً جديداً، ثم حدّث GitHub Secret AZURE_SPEECH_KEY وأعد النشر'
      : '',
  }), { status: 200, headers: { ...cors, ...JSON_HEADERS } });
}

async function handleQuranWarm(request, env) {
  const cors = corsHeaders(request, 'GET, OPTIONS');
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!rateLimit(request, 'quran-warm', 10, 60000)) {
    return rateLimitedResponse(cors);
  }
  const cache = caches.default;
  let warmed = 0;
  let hits = 0;
  for (const verseKey of POPULAR_QURAN_VERSES) {
    const [surah, ayah] = verseKey.split(':').map((n) => parseInt(n, 10));
    const cacheKey = new Request(`https://quran-audio.cache/hudhaify/${surah}/${ayah}`, { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) {
      hits += 1;
      continue;
    }
    const globalNum = verseKeyToGlobalAyahNumW(surah, ayah);
    const file = `${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;
    const upstreams = [
      `https://cdn.islamic.network/quran/audio/64/ar.hudhaify/${globalNum}.mp3`,
      `https://everyayah.com/data/Hudhaify_64kbps/${file}`,
    ];
    for (const upstream of upstreams) {
      try {
        const res = await fetch(upstream, { cf: { cacheTtl: 86400 * 30, cacheEverything: true } });
        if (!res.ok || !res.body) continue;
        const response = new Response(res.body, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=2592000, immutable',
          },
        });
        void cache.put(cacheKey, response.clone());
        warmed += 1;
        break;
      } catch {
        bumpApiError('quran', 'warm-fail');
      }
    }
  }
  return new Response(JSON.stringify({ ok: true, warmed, hits, total: POPULAR_QURAN_VERSES.length }), {
    status: 200,
    headers: { ...cors, ...JSON_HEADERS },
  });
}

async function handleQuranAudio(request, env) {
  const cors = corsHeaders(request, 'GET, OPTIONS');
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }
  if (!rateLimit(request, 'quran-audio', 60, 60000)) {
    return rateLimitedResponse(cors);
  }

  const url = new URL(request.url);
  const surah = parseInt(url.searchParams.get('surah') || '0', 10);
  const ayah = parseInt(url.searchParams.get('ayah') || '0', 10);
  // Hudhaify only — ignore legacy Afasy (or any other) reciter param.
  const reciterKey = 'hudhaify';
  const reciter = QURAN_RECITER_CDN.hudhaify;
  if (!surah || !ayah || ayah > (SURAH_AYAH_COUNTS_W[surah - 1] || 0)) {
    bumpApiError('quran', 400);
    return new Response(JSON.stringify({ ok: false, error: 'Invalid surah/ayah' }), {
      status: 400,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://quran-audio.cache/${reciterKey}/${surah}/${ayah}`, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('Access-Control-Allow-Origin', cors['Access-Control-Allow-Origin']);
    headers.set('X-Quran-Cache', 'HIT');
    return new Response(cached.body, { status: cached.status, headers });
  }

  const globalNum = verseKeyToGlobalAyahNumW(surah, ayah);
  const file = `${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;
  const upstreams = [
    `https://cdn.islamic.network/quran/audio/64/${reciter.edition}/${globalNum}.mp3`,
    `https://everyayah.com/data/${reciter.everyayah}/${file}`,
  ];

  let lastErr = null;
  for (const upstream of upstreams) {
    try {
      const res = await fetch(upstream, {
        cf: { cacheTtl: 86400 * 30, cacheEverything: true },
      });
      if (!res.ok || !res.body) {
        lastErr = `upstream ${res.status}`;
        continue;
      }
      const outHeaders = {
        ...cors,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=2592000, immutable',
        'X-Quran-Cache': 'MISS',
        'X-Quran-Reciter': reciterKey,
      };
      const response = new Response(res.body, { status: 200, headers: outHeaders });
      void cache.put(cacheKey, response.clone());
      return response;
    } catch (err) {
      lastErr = err;
    }
  }

  bumpApiError('quran', 502);
  return new Response(JSON.stringify({ ok: false, error: 'Audio fetch failed', detail: String(lastErr || '') }), {
    status: 502,
    headers: { ...cors, ...JSON_HEADERS },
  });
}

async function sendViaWeb3Forms(data, env) {
  const key = env.WEB3FORMS_ACCESS_KEY;
  if (!key) return false;
  const res = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: key,
      subject: '📨 رد جديد — المكتبة الثلاثية',
      from_name: 'Alhuda App',
      name: data.user_name || 'مجهول',
      rating: data.ratingLabel || String(data.rating ?? '—'),
      message: data.message || '—',
      source: data.source || 'demo',
    }),
  });
  const json = await res.json().catch(() => ({}));
  return !!json.success;
}

async function sendViaFormSubmit(data, to) {
  const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: '📨 رد جديد — المكتبة الثلاثية',
      _template: 'table',
      _captcha: 'false',
      الاسم: data.user_name || '—',
      التقييم: data.ratingLabel || String(data.rating ?? '—'),
      المصدر: data.source || 'demo',
      التفاصيل: data.message || '—',
    }),
  });
  if (!res.ok) return false;
  const json = await res.json().catch(() => ({}));
  return json.success === 'true' || json.success === true || res.ok;
}

const TTS_MAX_CHARS = 800;
const rateBuckets = new Map();

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}

function rateLimit(request, path, limit = 25, windowMs = 60000) {
  const key = `${clientIp(request)}:${path}`;
  const now = Date.now();
  let hits = rateBuckets.get(key) || [];
  hits = hits.filter((t) => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  rateBuckets.set(key, hits);
  return true;
}

function rateLimitedResponse(cors) {
  return new Response(JSON.stringify({ ok: false, error: 'Too many requests' }), {
    status: 429,
    headers: { ...cors, ...JSON_HEADERS },
  });
}

async function handleFeedbackNotify(request, env) {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }
  if (!rateLimit(request, 'feedback', 15, 60000)) {
    return rateLimitedResponse(cors);
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }

  if (!data?.user_name && !data?.message) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing feedback' }), {
      status: 400,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }

  const to = env.FEEDBACK_NOTIFY_EMAIL || 'hd.hk1444920@gmail.com';
  let sent = false;
  let provider = '';

  try {
    if (await sendViaWeb3Forms(data, env)) {
      sent = true;
      provider = 'web3forms';
    } else if (await sendViaFormSubmit(data, to)) {
      sent = true;
      provider = 'formsubmit';
    }
  } catch (err) {
    console.warn('[feedback-notify]', err);
  }

  return new Response(JSON.stringify({ ok: sent, provider, to: sent ? undefined : to }), {
    status: sent ? 200 : 502,
    headers: { ...cors, ...JSON_HEADERS },
  });
}

async function handleTts(request, env) {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }
  if (!rateLimit(request, 'tts', 40, 60000)) {
    return rateLimitedResponse(cors);
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }

  const textRaw = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!textRaw) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing text' }), {
      status: 400,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }
  // Align with bake keys + client prepareTtsPayload (keep اللَّهُ/ِ/َ).
  const text = normalizeForElevenLabs(textRaw) || textRaw;
  if (text.length > TTS_MAX_CHARS) {
    return new Response(JSON.stringify({ ok: false, error: 'Text too long' }), {
      status: 400,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }

  const voice = typeof body?.voice === 'string' && body.voice.trim()
    ? body.voice.trim()
    : (elevenLabsConfigured(env)
      ? (String(env?.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID).trim() || DEFAULT_ELEVENLABS_VOICE_ID)
      : googleTtsConfigured(env)
      ? DEFAULT_GOOGLE_ARABIC_VOICE
      : azureSpeechConfigured(env)
        ? DEFAULT_AZURE_ARABIC_VOICE
        : DEFAULT_ARABIC_VOICE);

  const bakedOnly = String(env?.BAKED_TTS_ONLY || '').trim() === '1';
  const lookupVoice =
    voice === BAKED_TTS_VOICE || voice.includes('Neural') ? BAKED_TTS_VOICE : voice;

  try {
    const bakedPath = await bakedTtsAssetPath(text, lookupVoice);
    const assetRes = await env.ASSETS.fetch(new URL(bakedPath, request.url));
    // SPA not_found can return index.html with 200 — reject non-audio.
    const ctype = (assetRes.headers.get('content-type') || '').toLowerCase();
    if (assetRes.ok && ctype.includes('audio')) {
      return new Response(assetRes.body, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-TTS-Provider': 'baked',
          'X-TTS-Chars': String(text.length),
        },
      });
    }
    if (bakedOnly) {
      return new Response(JSON.stringify({ ok: false, error: 'Baked TTS miss' }), {
        status: 404,
        headers: { ...cors, ...JSON_HEADERS },
      });
    }

    let stream;
    let provider = 'edge';
    if (elevenLabsConfigured(env)) {
      try {
        stream = await synthesizeElevenLabsArabicSpeech(text, voice, env);
        provider = 'elevenlabs';
      } catch (elevenErr) {
        console.warn('[tts] elevenlabs failed, falling back:', elevenErr);
        if (googleTtsConfigured(env)) {
          stream = await synthesizeGoogleArabicSpeech(text, DEFAULT_GOOGLE_ARABIC_VOICE, env);
          provider = 'google-fallback';
        } else if (azureSpeechConfigured(env)) {
          stream = await synthesizeAzureArabicSpeech(text, DEFAULT_AZURE_ARABIC_VOICE, env);
          provider = 'azure-fallback';
          isolateAzureChars += text.length;
        } else {
          stream = await synthesizeArabicSpeech(text, DEFAULT_ARABIC_VOICE);
          provider = 'edge-fallback';
        }
      }
    } else if (googleTtsConfigured(env)) {
      try {
        stream = await synthesizeGoogleArabicSpeech(text, voice, env);
        provider = 'google';
      } catch (googleErr) {
        console.warn('[tts] google failed, falling back:', googleErr);
        if (azureSpeechConfigured(env)) {
          stream = await synthesizeAzureArabicSpeech(text, DEFAULT_AZURE_ARABIC_VOICE, env);
          provider = 'azure-fallback';
          isolateAzureChars += text.length;
        } else {
          stream = await synthesizeArabicSpeech(text, DEFAULT_ARABIC_VOICE);
          provider = 'edge-fallback';
        }
      }
    } else if (azureSpeechConfigured(env)) {
      try {
        stream = await synthesizeAzureArabicSpeech(text, voice, env);
        provider = 'azure';
        isolateAzureChars += text.length;
      } catch (azureErr) {
        console.warn('[tts] azure failed, falling back to edge:', azureErr);
        stream = await synthesizeArabicSpeech(text, voice);
        provider = 'edge-fallback';
      }
    } else {
      stream = await synthesizeArabicSpeech(text, voice);
    }
    return new Response(stream, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=604800',
        'X-TTS-Provider': provider,
        'X-TTS-Chars': String(text.length),
      },
    });
  } catch (err) {
    console.warn('[tts]', err);
    bumpApiError('tts', 502);
    return new Response(JSON.stringify({ ok: false, error: 'TTS failed' }), {
      status: 502,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/feedback-notify') {
      return handleFeedbackNotify(request, env);
    }
    if (url.pathname === '/api/tts') {
      return handleTts(request, env);
    }
    if (url.pathname === '/api/tts-status') {
      return handleTtsStatus(request, env);
    }
    if (url.pathname === '/api/quran-warm') {
      return handleQuranWarm(request, env);
    }
    if (url.pathname === '/api/quran-audio') {
      return handleQuranAudio(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
