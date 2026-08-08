#!/usr/bin/env node
/**
 * Re-TTS + Whisper EVERY unique stubborn fail from v282 reports (not a sample).
 *
 *   node scripts/listen_stubborn_recheck_v284.mjs
 *   node scripts/listen_stubborn_recheck_v284.mjs --tts-only
 *   node scripts/listen_stubborn_recheck_v284.mjs --stt-only
 *   node scripts/listen_stubborn_recheck_v284.mjs --whisper=small
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { prepareFishTtsText } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda.ryodan71.workers.dev';
const WHISPER_MODEL =
  process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'small';
const TTS_ONLY = process.argv.includes('--tts-only');
const STT_ONLY = process.argv.includes('--stt-only');
const FORCE_TTS = process.argv.includes('--force-tts');
const CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(process.argv.find((a) => a.startsWith('--concurrency='))?.slice(14) || 3))
);
const PAUSE_MS = Number(process.argv.find((a) => a.startsWith('--pause='))?.slice(8) || 280);

const outDir = join(root, 'extracted/listen_stubborn_v284');
const mp3Dir = join(outDir, 'mp3');
const whisperDir = join(outDir, 'whisper_work');
const reportPath = join(root, 'extracted/listen_stt_stubborn_recheck_v284.json');
const uniquePath = join(root, 'extracted/stubborn_fails_v282_unique.json');

function bareLetters(t) {
  return String(t || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactLetters(t) {
  return bareLetters(t).replace(/\s+/g, '');
}

function letterCount(t) {
  return compactLetters(t).length;
}

function words(t) {
  return bareLetters(t).split(/\s+/).filter(Boolean);
}

function compactOverlap(a, b) {
  const ca = compactLetters(a);
  const cb = compactLetters(b);
  if (!ca.length && !cb.length) return 1;
  if (!ca.length || !cb.length) return 0;
  let shared = 0;
  const bag = [...cb];
  for (const ch of ca) {
    const i = bag.indexOf(ch);
    if (i >= 0) {
      shared++;
      bag.splice(i, 1);
    }
  }
  return shared / Math.max(ca.length, cb.length);
}

function editDistanceLimited(a, b, max = 2) {
  a = String(a);
  b = String(b);
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      rowMin = Math.min(rowMin, dp[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return dp[a.length][b.length];
}

function wordPresentFuzzy(w, heardCompact, hw) {
  if (heardCompact.includes(compactLetters(w))) return true;
  for (const h of hw) {
    if (editDistanceLimited(w, h, 1) <= 1) return true;
  }
  return false;
}

function judge(fish, transcript) {
  const heardNorm = String(transcript || '');
  const intendedCompact = compactLetters(fish);
  const heardCompact = compactLetters(heardNorm);
  const iw = words(fish);
  const hw = words(heardNorm);
  const flags = [];
  const missing = [];
  for (const w of iw) {
    if (w.length < 3) continue;
    if (!wordPresentFuzzy(w, heardCompact, hw)) missing.push(w);
  }
  const il = letterCount(fish);
  const hl = letterCount(heardNorm);
  const ratio = il ? hl / il : 1;
  const overlap = compactOverlap(fish, heardNorm);
  const dist = editDistanceLimited(intendedCompact, heardCompact, 2);

  if (il <= 16 && dist <= 1 && overlap >= 0.7) {
    return { pass: true, overlap, ratio, missing: [], flags: [{ kind: 'stt_letter_noise' }], hardFail: false };
  }
  if (il >= 12 && (ratio < 0.55 || overlap < 0.72)) {
    flags.push({ kind: 'missing_words', missing: missing.slice(0, 8) });
  } else if (il >= 4 && il < 12 && overlap < 0.55) {
    flags.push({ kind: 'missing_words', missing: missing.slice(0, 8) });
  } else if (il >= 4 && il < 12 && missing.length >= 1 && overlap < 0.62) {
    flags.push({ kind: 'missing_words', missing: missing.slice(0, 8) });
  }

  const mangled = [];
  for (const w of hw) {
    if (w.length < 4) continue;
    let best = 0;
    for (const t of iw) {
      const shared = [...w].filter((c) => t.includes(c)).length;
      best = Math.max(best, shared / Math.max(w.length, t.length));
    }
    if (best < 0.35 && !intendedCompact.includes(compactLetters(w))) mangled.push(w);
  }
  if (il >= 4 && il < 18 && mangled.length >= 1 && overlap < 0.55) {
    flags.push({ kind: 'mangled', words: mangled.slice(0, 6) });
  }

  const sttNoiseOnly = overlap >= 0.85 && ratio >= 0.75 && !flags.some((f) => f.kind === 'allah_misread');
  const hard = flags.filter((f) => f.kind === 'missing_words' || f.kind === 'mangled');
  const pass = sttNoiseOnly || (hard.length === 0 && (il < 4 || ratio >= 0.45));
  if (!pass) flags.push({ kind: 'fish_voice_limitation' });
  return {
    pass,
    overlap: Number(overlap.toFixed(3)),
    ratio: Number(ratio.toFixed(3)),
    missing: missing.slice(0, 8),
    flags,
    hardFail: !pass && hard.length > 0,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function loadUniqueItems() {
  const uniq = JSON.parse(readFileSync(uniquePath, 'utf8'));
  return (uniq.items || []).map((it, idx) => {
    const fish = prepareFishTtsText(it.spoken || it.bare);
    const hash = createHash('sha1').update(`v284|${fish}`).digest('hex').slice(0, 16);
    return {
      id: `u${idx}_${hash}`,
      bare: it.bare,
      spoken: it.spoken,
      fish_v282: it.fish_v282,
      stt_v282: it.stt_v282,
      count: it.count,
      books: it.books,
      fish,
      hash,
      prepChanged: fish !== it.fish_v282,
    };
  });
}

async function fetchTts(text) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: 'fish' }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, size: buf.length };
}

async function ensureMp3(row) {
  mkdirSync(mp3Dir, { recursive: true });
  const file = join(mp3Dir, `${row.hash}.mp3`);
  if (!FORCE_TTS && existsSync(file) && statSync(file).size > 800) {
    return { ...row, mp3: file, ttsOk: true, ttsStatus: 200, size: statSync(file).size, cached: true };
  }
  const { status, buf, size } = await fetchTts(row.fish);
  if (status >= 200 && status < 300 && size > 800) {
    writeFileSync(file, buf);
    return { ...row, mp3: file, ttsOk: true, ttsStatus: status, size, cached: false };
  }
  return { ...row, mp3: null, ttsOk: false, ttsStatus: status, size, cached: false };
}

function runWhisper(dir, model, outJson) {
  return new Promise((resolve, reject) => {
    const py = join(root, '.venv/bin/python');
    const script = join(root, 'scripts/whisper_transcribe.py');
    const child = spawn(py, [script, '--dir', dir, '--model', model, '--out', outJson, '--lang', 'ar'], {
      cwd: root,
    });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`whisper exit ${code}: ${stderr.slice(-500)}`));
      else resolve(JSON.parse(readFileSync(outJson, 'utf8')));
    });
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(mp3Dir, { recursive: true });
  mkdirSync(whisperDir, { recursive: true });

  let liveVersion = null;
  try {
    const vr = await fetch(`${base.replace(/\/$/, '')}/version.js?v=${Date.now()}`);
    const vt = await vr.text();
    const m = vt.match(/cache:\s*"([^"]+)"/);
    const sw = vt.match(/sw:\s*(\d+)/);
    const app = vt.match(/app:\s*(\d+)/);
    liveVersion = { cache: m?.[1], sw: Number(sw?.[1]), app: Number(app?.[1]) };
  } catch {
    liveVersion = { error: 'fetch_failed' };
  }

  const items = loadUniqueItems();
  console.log(`Stubborn unique items: ${items.length}; live=`, liveVersion);

  let rows = items;
  if (!STT_ONLY) {
    console.log(`TTS ${items.length} clips concurrency=${CONCURRENCY}…`);
    rows = await mapPool(items, CONCURRENCY, async (row, idx) => {
      const r = await ensureMp3(row);
      if ((idx + 1) % 20 === 0 || idx === 0) {
        console.log(`[tts ${idx + 1}/${items.length}] ${row.bare} → ${r.ttsOk ? r.size : 'FAIL'}`);
      }
      await sleep(PAUSE_MS);
      return r;
    });
    writeFileSync(join(outDir, 'tts_manifest.json'), JSON.stringify({ n: rows.length, rows }, null, 2));
  } else {
    const man = JSON.parse(readFileSync(join(outDir, 'tts_manifest.json'), 'utf8'));
    rows = man.rows;
  }

  if (TTS_ONLY) {
    console.log('TTS-only done');
    return;
  }

  // Stage mp3s for whisper
  for (const f of rows) {
    if (!f.ttsOk || !f.mp3) continue;
    const dest = join(whisperDir, `${f.hash}.mp3`);
    if (!existsSync(dest)) {
      writeFileSync(dest, readFileSync(f.mp3));
    }
  }

  const sttOut = join(outDir, `stt_${WHISPER_MODEL}.json`);
  console.log(`Whisper model=${WHISPER_MODEL} on ${whisperDir}…`);
  const sttRaw = await runWhisper(whisperDir, WHISPER_MODEL, sttOut);
  const byHash = new Map();
  for (const e of sttRaw) {
    const h = String(e.file || e.name || '').replace(/\.mp3$/i, '');
    byHash.set(h, e.transcript || e.text || '');
  }

  const scored = rows.map((r) => {
    const transcript = byHash.get(r.hash) || '';
    const j = r.ttsOk ? judge(r.fish, transcript) : { pass: false, flags: [{ kind: 'tts_fail' }], overlap: 0, ratio: 0, missing: [] };
    return {
      id: r.id,
      bare: r.bare,
      spoken: r.spoken,
      fish_v282: r.fish_v282,
      stt_v282: r.stt_v282,
      fish: r.fish,
      prepChanged: r.prepChanged,
      count: r.count,
      books: r.books,
      ttsOk: r.ttsOk,
      size: r.size,
      transcript,
      pass: j.pass,
      overlap: j.overlap,
      ratio: j.ratio,
      missing: j.missing,
      flags: j.flags,
      hardFail: j.hardFail,
      improved: j.pass,
    };
  });

  const pass = scored.filter((x) => x.pass).length;
  const fail = scored.filter((x) => !x.pass).length;
  const irreducible = scored
    .filter((x) => !x.pass)
    .map((x) => ({
      bare: x.bare,
      fish: x.fish,
      stt: x.transcript,
      stt_v282: x.stt_v282,
      overlap: x.overlap,
      count: x.count,
      notes: 'fish_voice_limitation / irreducible after iʿrāb+carrier',
    }));

  const report = {
    timestamp: new Date().toISOString(),
    versionTarget: 'v284',
    liveVersion,
    base,
    whisperModel: WHISPER_MODEL,
    source: 'extracted/stubborn_fails_v282_unique.json',
    totals: {
      stubbornUnique: scored.length,
      ttsOk: scored.filter((x) => x.ttsOk).length,
      pass,
      fail,
      passRate: scored.length ? Number((pass / scored.length).toFixed(4)) : 0,
      prepChanged: scored.filter((x) => x.prepChanged).length,
    },
    irreducible,
    fails: scored.filter((x) => !x.pass),
    passesSample: scored.filter((x) => x.pass).slice(0, 40),
    all: scored,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.totals, null, 2));
  console.log(`Wrote ${reportPath}`);
  console.log(`Irreducible ${irreducible.length}:`);
  for (const x of irreducible.slice(0, 40)) {
    console.log(`  ${x.bare} | fish=${x.fish} | stt=${String(x.stt).slice(0, 50)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
