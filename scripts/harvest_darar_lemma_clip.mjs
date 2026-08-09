#!/usr/bin/env node
/**
 * Harvest Fish Hakim clip for «لا ضرر ولا ضرار» until Whisper scores PASS_ضرر
 * without merge «اللاضر». Winner → tts-lemma-clips/ (keeps existing ذباب clips).
 *
 *   node scripts/harvest_darar_lemma_clip.mjs
 *   node scripts/harvest_darar_lemma_clip.mjs --retries=14 --local-fish
 *   node scripts/harvest_darar_lemma_clip.mjs --stability-only   # re-Whisper seed 5×
 */
import { writeFileSync, mkdirSync, readFileSync, copyFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { prepareFishTtsText, bareArabicKey } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadDevVars() {
  const p = join(root, '.dev.vars');
  if (!existsSync(p)) return {};
  const env = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return env;
}
Object.assign(process.env, loadDevVars());

const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda-zi6bbd.cranl.net';
const RETRIES = Number(process.argv.find((a) => a.startsWith('--retries='))?.slice(10) || 12);
const WHISPER = process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'small';
const USE_LOCAL = process.argv.includes('--local-fish');
const STABILITY_ONLY = process.argv.includes('--stability-only');
const STABILITY_N = Number(process.argv.find((a) => a.startsWith('--stability='))?.slice(12) || 5);

const outDir = join(root, 'extracted/listen_v309_darar_harvest');
const attemptDir = join(outDir, 'attempts');
const clipDir = join(root, 'tts-lemma-clips');
const MANIFEST_PATH = join(clipDir, 'manifest.json');
mkdirSync(attemptDir, { recursive: true });
mkdirSync(clipDir, { recursive: true });

const BARE = 'لا ضرر ولا ضرار';
const FILE = 'la_darara.mp3';
/** نصب بلا النافية للجنس؛ فواصل أوضح لكسر دمج لا+ضرر → اللاضر */
const SPOKEN =
  'أَعْنِي قَاعِدَةَ: لَا،  ضَرَرَ  عَلَى أَحَدٍ،  وَلَا،  ضِرَارَ';

const SEEDS = [
  'extracted/listen_v308_fragile/mp3/darar_r1.mp3',
  'extracted/listen_v308_fragile/mp3/darar_r3.mp3',
  'extracted/listen_v308_fragile/mp3/darar_r4.mp3',
  'extracted/listen_v308_fragile/mp3/darar_r5.mp3',
  'extracted/listen_v306_live/darar.mp3',
];

const SPEEDS = [0.92, 0.95, 1.0, 1.05, 1.08];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strict: ضرر + ضرار، بلا اللاضر / ضرري×2 */
function scoreDarar(t) {
  const s = String(t || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  const bare = s.replace(/[أإآٱ]/g, 'ا');
  if (/اللاضر|لاضر\b|لا\s*اضر/.test(bare)) return 'FAIL_اللاضر';
  if (/ضرري\s+ولا\s+ضرري/.test(bare)) return 'FAIL_ضرري';
  if (/ضرر/.test(bare) && /ضرار/.test(bare)) return 'PASS_ضرر';
  return 'no_darar';
}

async function fetchTtsCranl(text, speed) {
  const body = { text };
  if (speed != null) body.speed = speed;
  const res = await fetch(`${base.replace(/\/$/, '')}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, size: buf.length, provider: res.headers.get('x-tts-provider') };
}

async function fetchTtsLocal(text, speed) {
  const { synthesizeFishArabicSpeech } = await import('../fish-audio-tts.js');
  const stream = await synthesizeFishArabicSpeech(text, null, process.env, { speed });
  const reader = stream.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  const buf = Buffer.concat(chunks);
  return { status: 200, buf, size: buf.length, provider: 'fish-local' };
}

function runWhisper(dir, outJson) {
  return new Promise((resolve, reject) => {
    const py = join(root, '.venv/bin/python');
    const script = join(root, 'scripts/whisper_transcribe.py');
    const child = spawn(py, [script, '--dir', dir, '--model', WHISPER, '--out', outJson, '--lang', 'ar'], {
      cwd: root,
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`whisper exit ${code}`));
      else resolve(JSON.parse(readFileSync(outJson, 'utf8')));
    });
  });
}

function clearDirMp3(dir) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.mp3') || f.endsWith('.txt')) unlinkSync(join(dir, f));
  }
}

function loadExistingManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return { clips: {}, voice: 'راوٍ عربي حكيم' };
  }
}

async function stabilityCheck(absMp3) {
  const stabDir = join(outDir, 'stability');
  mkdirSync(stabDir, { recursive: true });
  clearDirMp3(stabDir);
  for (let i = 1; i <= STABILITY_N; i++) {
    copyFileSync(absMp3, join(stabDir, `stab_${i}.mp3`));
  }
  const stt = await runWhisper(stabDir, join(outDir, 'stability_stt.json'));
  const scored = (stt.results || []).map((r) => ({
    id: r.id,
    transcript: r.transcript,
    verdict: scoreDarar(r.transcript),
  }));
  const pass = scored.filter((s) => s.verdict === 'PASS_ضرر').length;
  console.log(`\n=== STABILITY ${pass}/${scored.length} ===`);
  for (const s of scored) console.log(`${s.verdict.padEnd(14)} ${s.id}: ${s.transcript}`);
  writeFileSync(join(outDir, 'stability_score.json'), JSON.stringify({ pass, scored }, null, 2), 'utf8');
  return { pass, total: scored.length, scored };
}

async function main() {
  const log = [];
  const fetchTts = USE_LOCAL ? fetchTtsLocal : fetchTtsCranl;

  // Score seeds
  const seedDir = join(outDir, 'seed');
  mkdirSync(seedDir, { recursive: true });
  clearDirMp3(seedDir);
  for (const src of SEEDS) {
    const abs = join(root, src);
    if (!existsSync(abs)) continue;
    const id = src.split('/').pop().replace('.mp3', '');
    copyFileSync(abs, join(seedDir, `${id}.mp3`));
  }

  let winner = null;
  if (readdirSync(seedDir).some((f) => f.endsWith('.mp3'))) {
    const seedStt = await runWhisper(seedDir, join(outDir, 'seed_stt.json'));
    for (const r of seedStt.results || []) {
      const v = scoreDarar(r.transcript);
      console.log(`seed ${v} ${r.id}: ${r.transcript}`);
      log.push({ kind: 'seed', id: r.id, verdict: v, transcript: r.transcript });
      if (v === 'PASS_ضرر' && !winner) {
        winner = { file: r.file, transcript: r.transcript, source: `seed:${r.id}`, abs: join(seedDir, r.file) };
      }
    }
  }

  if (STABILITY_ONLY) {
    if (!winner) {
      console.error('No PASS seed for stability-only');
      process.exit(2);
    }
    const stab = await stabilityCheck(winner.abs);
    if (stab.pass < stab.total) process.exit(3);
    process.exit(0);
  }

  // Harvest more candidates with paced spoken form
  clearDirMp3(attemptDir);
  for (let i = 0; i < RETRIES; i++) {
    const speed = SPEEDS[i % SPEEDS.length];
    const spoken = prepareFishTtsText(SPOKEN);
    const id = `darar_r${i + 1}`;
    writeFileSync(join(attemptDir, `${id}.txt`), spoken, 'utf8');
    const r = await fetchTts(spoken, speed);
    if (!(r.status >= 200 && r.status < 300 && r.size > 800)) {
      console.log(`tts fail ${id} ${r.status} provider=${r.provider}`);
      await sleep(400);
      continue;
    }
    // Skip if CranL already serving a lemma clip (would not harvest live Fish)
    if (String(r.provider || '').includes('lemma')) {
      console.log(`skip ${id}: already lemma-clip from server — use --local-fish`);
      continue;
    }
    writeFileSync(join(attemptDir, `${id}.mp3`), r.buf);
    console.log(`tts ok ${id} ${r.size}b speed=${speed} provider=${r.provider}`);
    await sleep(350);
  }

  if (readdirSync(attemptDir).some((f) => f.endsWith('.mp3'))) {
    const stt = await runWhisper(attemptDir, join(outDir, 'attempts_stt.json'));
    for (const r of stt.results || []) {
      const v = scoreDarar(r.transcript);
      console.log(`${v.padEnd(14)} ${r.id}: ${r.transcript}`);
      log.push({ kind: 'attempt', id: r.id, verdict: v, transcript: r.transcript });
      if (v === 'PASS_ضرر') {
        // Prefer harvest over seed if we get a clear «لا ضرر» (not just ضرار pair)
        const clear = /لا\s+ضرر/.test(String(r.transcript || '').replace(/[\u064B-\u065F\u0670\u0640]/g, ''));
        if (!winner || clear) {
          winner = {
            file: r.file,
            transcript: r.transcript,
            source: r.id,
            abs: join(attemptDir, r.file),
            clear,
          };
          if (clear) break;
        }
      }
    }
  }

  if (!winner) {
    console.error('No PASS_ضرر winner');
    writeFileSync(join(outDir, 'harvest_log.json'), JSON.stringify({ log, winner: null }, null, 2), 'utf8');
    process.exit(2);
  }

  // Stability gate on winner (≥5 identical PASS)
  const stab = await stabilityCheck(winner.abs);
  if (stab.pass < STABILITY_N) {
    console.error(`Stability failed ${stab.pass}/${STABILITY_N}`);
    process.exit(3);
  }

  copyFileSync(winner.abs, join(clipDir, FILE));
  const man = loadExistingManifest();
  man.at = new Date().toISOString();
  man.voice = man.voice || 'راوٍ عربي حكيم';
  man.note =
    'Pre-recorded Fish clips for stubborn lemmas (ذباب ذ/د؛ لا ضرر merge→اللاضر). Whisper-verified. UI display unchanged.';
  man.clips = man.clips || {};
  man.clips[bareArabicKey(BARE)] = {
    bare: BARE,
    file: FILE,
    transcript: winner.transcript,
    spoken: SPOKEN,
    source: winner.source,
    note: 'PASS_ضرر × stability; نصب ضررَ/ضرارَ',
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(man, null, 2), 'utf8');
  writeFileSync(
    join(outDir, 'harvest_log.json'),
    JSON.stringify({ log, winner: man.clips[bareArabicKey(BARE)], stability: stab }, null, 2),
    'utf8'
  );

  console.log('\n=== WINNER ===');
  console.log(JSON.stringify(man.clips[bareArabicKey(BARE)], null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
