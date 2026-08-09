/**
 * CranL / Docker staging server — parallel to Cloudflare worker.js.
 * Serves the static SPA + critical API routes. Does NOT replace wrangler deploy.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  fishAudioConfigured,
  resolveFishModel,
  resolveFishVoiceId,
  prepareFishTtsText,
  synthesizeFishArabicSpeech,
  DEFAULT_FISH_VOICE_ID,
} from './fish-audio-tts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const TTS_MAX_CHARS = 800;

const apiErrorCounters = {
  tts: { total: 0, byCode: {} },
  quran: { total: 0, byCode: {} },
};

function bumpApiError(kind, code) {
  const bucket = apiErrorCounters[kind];
  if (!bucket) return;
  bucket.total += 1;
  const key = String(code || 'unknown');
  bucket.byCode[key] = (bucket.byCode[key] || 0) + 1;
}

const POPULAR_QURAN_VERSES = [
  '51:56', '4:48', '6:82', '2:256', '3:175', '47:19', '74:1', '16:125', '27:62', '9:31',
  '6:162', '1:2', '108:2', '96:1', '53:19', '6:57', '7:138', '41:53', '2:102', '4:142',
];

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

/** In-process Quran audio cache (Workers uses caches.default). */
const quranCache = new Map();
const QURAN_CACHE_MAX = 200;

function quranCacheGet(key) {
  const hit = quranCache.get(key);
  if (!hit) return null;
  quranCache.delete(key);
  quranCache.set(key, hit);
  return hit;
}

function quranCacheSet(key, buf) {
  if (quranCache.has(key)) quranCache.delete(key);
  quranCache.set(key, buf);
  while (quranCache.size > QURAN_CACHE_MAX) {
    const oldest = quranCache.keys().next().value;
    quranCache.delete(oldest);
  }
}

const rateBuckets = new Map();

function clientIp(req) {
  return req.headers['cf-connecting-ip']
    || String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

function rateLimit(req, pathKey, limit = 25, windowMs = 60000) {
  const key = `${clientIp(req)}:${pathKey}`;
  const now = Date.now();
  let hits = rateBuckets.get(key) || [];
  hits = hits.filter((t) => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  rateBuckets.set(key, hits);
  return true;
}

function corsOrigin(req) {
  return req.headers.origin || '*';
}

function setCors(res, req, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
  res.status(status).set(JSON_HEADERS).send(JSON.stringify(body));
}

function rateLimited(res, req) {
  setCors(res, req);
  sendJson(res, 429, { ok: false, error: 'Too many requests' });
}

function envBag() {
  return process.env;
}

const BLOCKED_STATIC = new Set([
  '.dev.vars',
  '.env',
  '.gitignore',
  'wrangler.toml',
  'Dockerfile',
  'server.mjs',
  'package.json',
  'package-lock.json',
]);

function isBlockedStatic(relPath) {
  const base = path.basename(relPath);
  if (BLOCKED_STATIC.has(base)) return true;
  if (base.startsWith('.env')) return true;
  if (relPath.includes('node_modules') || relPath.includes('.git') || relPath.includes('.wrangler')) return true;
  return false;
}

async function fetchQuranMp3(surah, ayah) {
  const reciter = QURAN_RECITER_CDN.hudhaify;
  const globalNum = verseKeyToGlobalAyahNumW(surah, ayah);
  const file = `${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;
  const upstreams = [
    `https://cdn.islamic.network/quran/audio/64/${reciter.edition}/${globalNum}.mp3`,
    `https://everyayah.com/data/${reciter.everyayah}/${file}`,
  ];
  let lastErr = null;
  for (const upstream of upstreams) {
    try {
      const res = await fetch(upstream);
      if (!res.ok) {
        lastErr = `upstream ${res.status}`;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) {
        lastErr = 'empty body';
        continue;
      }
      return buf;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(String(lastErr || 'Audio fetch failed'));
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') {
    setCors(res, req);
    return res.status(204).end();
  }
  next();
});

app.get('/api/tts-status', (req, res) => {
  setCors(res, req);
  const env = envBag();
  const fish = fishAudioConfigured(env);
  const fishVoice = resolveFishVoiceId(null, env);
  const fishModel = resolveFishModel(env);
  sendJson(res, 200, {
    ok: true,
    bakedTtsOnly: false,
    skipBakedTts: true,
    fishConfigured: fish,
    fishModel: fish ? fishModel : null,
    fishVoiceConfigured: !!(fish && fishVoice),
    elevenLabsConfigured: false,
    googleConfigured: false,
    azureConfigured: false,
    provider: fish ? 'fish' : 'none',
    voiceLocked: true,
    quranReciter: 'hudhaify',
    voice: fishVoice || '(set FISH_VOICE_ID)',
    voiceName: 'راوٍ عربي حكيم',
    voiceId: fishVoice || DEFAULT_FISH_VOICE_ID,
    allahPrep: 'fish-nfc-irab',
    errors: apiErrorCounters,
    runtime: 'cranl-node',
  });
});

app.post('/api/tts', async (req, res) => {
  setCors(res, req);
  if (!rateLimit(req, 'tts', 200, 60000)) return rateLimited(res, req);

  const env = envBag();
  const textRaw = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!textRaw) return sendJson(res, 400, { ok: false, error: 'Missing text' });

  const text = prepareFishTtsText(textRaw);
  if (!text) return sendJson(res, 400, { ok: false, error: 'Empty after punctuation strip' });
  if (text.length > TTS_MAX_CHARS) return sendJson(res, 400, { ok: false, error: 'Text too long' });

  if (!fishAudioConfigured(env)) {
    return sendJson(res, 503, { ok: false, error: 'Fish Audio not configured' });
  }

  try {
    const fishVoice = resolveFishVoiceId(null, env);
    const reqSpeed = Number(req.body?.speed);
    const fishOpts =
      Number.isFinite(reqSpeed) && reqSpeed >= 0.5 && reqSpeed <= 2
        ? { speed: reqSpeed }
        : {};
    const stream = await synthesizeFishArabicSpeech(textRaw, fishVoice, env, fishOpts);
    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-TTS-Provider', 'fish');
    res.setHeader('X-TTS-Model', resolveFishModel(env));
    res.setHeader('X-TTS-Voice', fishVoice);
    res.setHeader('X-TTS-Voice-Name', 'raawi-arabi-hakim');
    res.setHeader('X-TTS-Quality', 'hq');
    res.setHeader('X-TTS-Chars', String(text.length));
    res.setHeader('X-TTS-Allah', 'fish-nfc-irab');
    if (fishOpts.speed != null) res.setHeader('X-TTS-Speed', String(fishOpts.speed));

    if (stream && typeof stream.getReader === 'function') {
      Readable.fromWeb(stream).pipe(res);
    } else if (Buffer.isBuffer(stream) || stream instanceof Uint8Array) {
      res.send(Buffer.from(stream));
    } else {
      Readable.from(stream).pipe(res);
    }
  } catch (err) {
    console.warn('[tts]', err);
    bumpApiError('tts', 502);
    const msg = String(err?.message || 'TTS failed').slice(0, 200);
    if (!res.headersSent) sendJson(res, 502, { ok: false, error: msg });
  }
});

app.get('/api/quran-audio', async (req, res) => {
  setCors(res, req, 'GET, OPTIONS');
  if (!rateLimit(req, 'quran-audio', 60, 60000)) return rateLimited(res, req);

  const surah = parseInt(String(req.query.surah || '0'), 10);
  const ayah = parseInt(String(req.query.ayah || '0'), 10);
  const reciterKey = 'hudhaify';
  if (!surah || !ayah || ayah > (SURAH_AYAH_COUNTS_W[surah - 1] || 0)) {
    bumpApiError('quran', 400);
    return sendJson(res, 400, { ok: false, error: 'Invalid surah/ayah' });
  }

  const cacheKey = `${reciterKey}/${surah}/${ayah}`;
  const cached = quranCacheGet(cacheKey);
  if (cached) {
    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('X-Quran-Cache', 'HIT');
    res.setHeader('X-Quran-Reciter', reciterKey);
    return res.send(cached);
  }

  try {
    const buf = await fetchQuranMp3(surah, ayah);
    quranCacheSet(cacheKey, buf);
    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('X-Quran-Cache', 'MISS');
    res.setHeader('X-Quran-Reciter', reciterKey);
    return res.send(buf);
  } catch (err) {
    bumpApiError('quran', 502);
    return sendJson(res, 502, { ok: false, error: 'Audio fetch failed', detail: String(err?.message || err || '') });
  }
});

app.get('/api/quran-warm', async (req, res) => {
  setCors(res, req, 'GET, OPTIONS');
  if (!rateLimit(req, 'quran-warm', 10, 60000)) return rateLimited(res, req);

  let warmed = 0;
  let hits = 0;
  for (const verseKey of POPULAR_QURAN_VERSES) {
    const [surah, ayah] = verseKey.split(':').map((n) => parseInt(n, 10));
    const cacheKey = `hudhaify/${surah}/${ayah}`;
    if (quranCacheGet(cacheKey)) {
      hits += 1;
      continue;
    }
    try {
      const buf = await fetchQuranMp3(surah, ayah);
      quranCacheSet(cacheKey, buf);
      warmed += 1;
    } catch {
      bumpApiError('quran', 'warm-fail');
    }
  }
  sendJson(res, 200, { ok: true, warmed, hits, total: POPULAR_QURAN_VERSES.length });
});

app.all('/api/student-creds', async (req, res) => {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!rateLimit(req, 'student-creds', 20, 60000)) return rateLimited(res, req);

  const pepper = String(process.env.AUTH_NAME_PEPPER || '').trim();
  if (!pepper) {
    return sendJson(res, 503, { ok: false, error: 'Auth pepper not configured' });
  }
  const name = String(req.body?.name || '').trim().normalize('NFC');
  if (!name || name.length > 80) {
    return sendJson(res, 400, { ok: false, error: 'Invalid name' });
  }
  const data = new TextEncoder().encode(`alhuda|${name}|name-only|${pepper}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const id = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  sendJson(res, 200, {
    ok: true,
    email: `alhuda.student.${id}@alhuda.students.internal`,
    password: `Ah!Nm#${id.slice(0, 14)}`,
  });
});

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const rel = decodeURIComponent(req.path).replace(/^\/+/, '');
  if (isBlockedStatic(rel)) return res.status(404).end();
  next();
});

app.use(express.static(ROOT, {
  index: 'index.html',
  fallthrough: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('service-worker.js')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Service-Worker-Allowed', '/');
    }
  },
}));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return sendJson(res, 404, { ok: false, error: 'Not found' });
  }
  const indexPath = path.join(ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res.status(500).send('index.html missing');
  }
  res.sendFile(indexPath);
});

const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(`[alhuda-cranl] listening on http://${HOST}:${PORT}`);
  console.log(`[alhuda-cranl] fishConfigured=${fishAudioConfigured(process.env)}`);
});
