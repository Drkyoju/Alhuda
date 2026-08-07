#!/usr/bin/env node
/**
 * Live multi-sample Fish TTS against production worker.
 * Picks 25 diverse bank Qs (Muadh, Haqq-Allah TF, ayah-linked, OCR-ish).
 * Asserts HTTP 200 + MP3 magic; flags tiny files.
 *
 *   node scripts/live_tts_multisample.mjs
 *   node scripts/live_tts_multisample.mjs --base https://alhuda.ryodan71.workers.dev
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { prepareFishTtsText } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseIdx = process.argv.indexOf('--base');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  (baseIdx >= 0 ? process.argv[baseIdx + 1] : null) ||
  'https://alhuda.ryodan71.workers.dev';

function loadWindow(file) {
  const win = {};
  new Function('window', readFileSync(join(root, file), 'utf8'))(win);
  return win;
}

const win = {
  ...loadWindow('speech-pronunciation-lexicon.js'),
  ...loadWindow('speech-diacritics-map.js'),
};
try {
  Object.assign(win, loadWindow('question-verse-map.js'));
} catch {
  /* optional */
}

const byId = win.SPEECH_BY_QUESTION_ID || {};
const verseMap = win.QUESTION_VERSE_MAP || {};
const bank = JSON.parse(
  readFileSync(join(root, 'questions-bank.js'), 'utf8').match(
    /window\.QUESTIONS_BANK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/
  )[1]
);
const all = Object.values(bank).flat();

const MUST = [
  '07483021-8f6a-44c8-9f32-1040d095f0c5', // حق الله TF
  'e0f8acf6-7366-94d9-1b93-49a30f6e34d2', // Muadh أنْ يعلّم
  '91eb89af-4c29-f159-bea4-d6c351552f31', // لا تحلفوا spacing
];

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const picked = new Map();
for (const id of MUST) {
  const q = all.find((x) => x.id === id);
  if (q) picked.set(id, q);
}
// Prefer ayah-linked
for (const q of all) {
  if (picked.size >= 10) break;
  if (verseMap[q.id]) picked.set(q.id, q);
}
// OCR-ish: quotes / أكمل
for (const q of all) {
  if (picked.size >= 16) break;
  if (/أكمل|«|"/.test(q.question_text || '')) picked.set(q.id, q);
}
const rng = mulberry32(20260807);
while (picked.size < 25) {
  const q = all[Math.floor(rng() * all.length)];
  if (q?.id) picked.set(q.id, q);
}

function speechQ(q) {
  const hit = byId[q.id]?.q;
  return String(hit || q.question_text || '').trim();
}

/** Minimal local sanitize mirroring app prepare for live request text. */
function prepareLite(text) {
  let s = String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, '')
    .replace(/\uFDFA/g, ' صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ ')
    .replace(/﴿[^﴾]*﴾/g, ' ')
    .replace(/[؟?!.،,;؛:«»"'“”‘’()[\]{}✓✗—–…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

const TINY = 800; // bytes — suspiciously small MP3
const results = [];
let fails = 0;

for (const q of picked.values()) {
  const spoken = speechQ(q);
  let text = prepareLite(spoken);
  if (verseMap[q.id]) {
    // Don't send ﴿ayah﴾ — strip markers
    text = text.replace(/﴿[^﴾]*﴾/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Worker also runs prepareFishTtsText; send lesson text
  const body = { text, voice: 'fish' };
  const t0 = Date.now();
  let status = 0;
  let size = 0;
  let magic = '';
  let err = null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    status = res.status;
    const buf = Buffer.from(await res.arrayBuffer());
    size = buf.length;
    magic = buf.slice(0, 3).toString('hex');
    const isMp3 = magic === 'fff3' || magic === 'fff2' || magic === 'fffb' || magic === '4944' /* ID3 */ || buf[0] === 0xff;
    const id3 = buf.slice(0, 3).toString('ascii') === 'ID3';
    const ok = status === 200 && size > TINY && (isMp3 || id3);
    if (!ok) fails += 1;
    results.push({
      id: q.id,
      type: q.type,
      verseKey: verseMap[q.id] || null,
      must: MUST.includes(q.id),
      textLen: text.length,
      textPreview: text.slice(0, 80),
      status,
      size,
      magic: id3 ? 'ID3' : magic,
      ms: Date.now() - t0,
      tiny: size > 0 && size < TINY,
      ok,
    });
  } catch (e) {
    fails += 1;
    err = String(e?.message || e);
    results.push({
      id: q.id,
      status: 0,
      size: 0,
      err,
      ok: false,
      textPreview: text.slice(0, 80),
    });
  }
  // gentle pacing
  await new Promise((r) => setTimeout(r, 120));
}

const report = {
  base,
  sampled: results.length,
  fails,
  tinyCount: results.filter((r) => r.tiny).length,
  includesMuadh: results.some((r) => r.id === MUST[1]),
  includesHaqq: results.some((r) => r.id === MUST[0]),
  ayahSamples: results.filter((r) => r.verseKey).length,
  results,
};

mkdirSync(join(root, 'extracted'), { recursive: true });
writeFileSync(join(root, 'extracted/live_tts_multisample.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  sampled: report.sampled,
  fails: report.fails,
  tinyCount: report.tinyCount,
  includesMuadh: report.includesMuadh,
  includesHaqq: report.includesHaqq,
  ayahSamples: report.ayahSamples,
  sizes: results.map((r) => r.size),
  failIds: results.filter((r) => !r.ok).map((r) => ({ id: r.id, status: r.status, size: r.size, err: r.err })),
}, null, 2));

if (fails) process.exitCode = 1;
