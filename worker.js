const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

import { DEFAULT_ARABIC_VOICE, synthesizeArabicSpeech } from './edge-tts.js';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
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

async function handleTts(request) {
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

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing text' }), {
      status: 400,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }
  if (text.length > TTS_MAX_CHARS) {
    return new Response(JSON.stringify({ ok: false, error: 'Text too long' }), {
      status: 400,
      headers: { ...cors, ...JSON_HEADERS },
    });
  }

  const voice = typeof body?.voice === 'string' && body.voice.trim()
    ? body.voice.trim()
    : DEFAULT_ARABIC_VOICE;

  try {
    const stream = await synthesizeArabicSpeech(text, voice);
    return new Response(stream, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.warn('[tts]', err);
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
      return handleTts(request);
    }
    return env.ASSETS.fetch(request);
  },
};
