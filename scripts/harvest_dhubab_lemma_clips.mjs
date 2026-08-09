#!/usr/bin/env node
/**
 * Harvest Fish Hakim clips for ذباب lemmas until Whisper scores PASS_ذ.
 * Winners land in tts-lemma-clips/ for server override (live Fish mixes ذ/د).
 *
 *   node scripts/harvest_dhubab_lemma_clips.mjs
 *   node scripts/harvest_dhubab_lemma_clips.mjs --retries=12 --local-fish
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
const RETRIES = Number(process.argv.find((a) => a.startsWith('--retries='))?.slice(10) || 10);
const WHISPER = process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'small';
const USE_LOCAL = process.argv.includes('--local-fish');

const outDir = join(root, 'extracted/listen_v308_dhubab_harvest');
const attemptDir = join(outDir, 'attempts');
const clipDir = join(root, 'tts-lemma-clips');
mkdirSync(attemptDir, { recursive: true });
mkdirSync(clipDir, { recursive: true });

const TARGETS = [
  {
    bare: 'ذباب',
    file: 'dhubab.mp3',
    spoken: 'الذَّالُ  ثُمَّ الذُّبَابُ  حَشَرَةٌ تَطِيرُ',
  },
  {
    bare: 'ذبابا',
    file: 'dhubaban.mp3',
    spoken: 'الذَّالُ  ثُمَّ الذُّبَابَ  حَشَرَةً تَطِيرُ',
  },
  {
    bare: 'قرب ذبابا',
    file: 'qarraba_dhubaban.mp3',
    spoken: 'الذَّالُ  ثُمَّ الذُّبَابُ  قَرَّبَ حَشَرَةً لِلصَّنَمِ',
  },
  {
    bare: 'قرب ذبابا لصنم',
    file: 'qarraba_dhubaban_sanam.mp3',
    spoken: 'الذَّالُ  ثُمَّ الذُّبَابُ  قَرَّبَ حَشَرَةً لِلصَّنَمِ',
  },
];

const SEEDS = [
  { src: 'extracted/listen_v307_live/mp3/dhubab.mp3', bare: 'ذباب' },
  { src: 'extracted/listen_v307_live/mp3/dhubab_r2.mp3', bare: 'ذباب' },
  { src: 'extracted/listen_v307_live/mp3/qarraba_r3.mp3', bare: 'قرب ذبابا' },
  { src: 'extracted/listen_v307_live/mp3/qarraba_r2.mp3', bare: 'قرب ذبابا' },
];

const SPEEDS = [0.95, 1.0, 1.08];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function scoreFly(t) {
  const s = String(t || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  const hasDhubab = /ذ\s*ب\s*ا\s*ب/.test(s);
  const hasDabbab = /د\s*ب\s*ا\s*ب/.test(s);
  if (hasDhubab && !hasDabbab) return 'PASS_ذ';
  if (hasDabbab) return 'FAIL_د';
  return 'no_stem';
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
  return { status: res.status, buf, size: buf.length };
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
  return { status: 200, buf, size: buf.length };
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

async function main() {
  const winners = {};
  const log = [];
  const fetchTts = USE_LOCAL ? fetchTtsLocal : fetchTtsCranl;

  // 1) Score known PASS seeds
  const seedDir = join(outDir, 'seed');
  mkdirSync(seedDir, { recursive: true });
  clearDirMp3(seedDir);
  for (const s of SEEDS) {
    const abs = join(root, s.src);
    if (!existsSync(abs)) continue;
    const id = `${bareArabicKey(s.bare).replace(/\s+/g, '_')}_${s.src.split('/').pop().replace('.mp3', '')}`;
    copyFileSync(abs, join(seedDir, `${id}.mp3`));
  }
  const seedStt = await runWhisper(seedDir, join(outDir, 'seed_stt.json'));
  for (const r of seedStt.results || []) {
    const v = scoreFly(r.transcript);
    console.log(`seed ${v} ${r.id}: ${r.transcript}`);
    log.push({ kind: 'seed', id: r.id, verdict: v, transcript: r.transcript });
    if (v !== 'PASS_ذ') continue;
    const bare = r.id.startsWith('قرب') ? 'قرب ذبابا' : 'ذباب';
    const t = TARGETS.find((x) => x.bare === bare);
    if (!t || winners[bare]) continue;
    copyFileSync(join(seedDir, r.file), join(clipDir, t.file));
    winners[bare] = { file: t.file, transcript: r.transcript, spoken: t.spoken, source: r.id };
  }

  // 2) Harvest missing targets
  clearDirMp3(attemptDir);
  for (const t of TARGETS) {
    if (winners[t.bare]) {
      console.log(`have winner for «${t.bare}» — skip harvest`);
      continue;
    }
    for (let i = 0; i < RETRIES; i++) {
      const speed = SPEEDS[i % SPEEDS.length];
      const spoken = prepareFishTtsText(t.spoken);
      const id = `${bareArabicKey(t.bare).replace(/\s+/g, '_')}_r${i + 1}`;
      const mp3 = join(attemptDir, `${id}.mp3`);
      writeFileSync(join(attemptDir, `${id}.txt`), spoken, 'utf8');
      const r = await fetchTts(spoken, speed);
      if (!(r.status >= 200 && r.status < 300 && r.size > 800)) {
        console.log(`tts fail ${id} ${r.status}`);
        await sleep(400);
        continue;
      }
      writeFileSync(mp3, r.buf);
      console.log(`tts ok ${id} ${r.size}b speed=${speed}`);
      await sleep(350);
    }
  }

  if (readdirSync(attemptDir).some((f) => f.endsWith('.mp3'))) {
    const stt = await runWhisper(attemptDir, join(outDir, 'attempts_stt.json'));
    for (const r of stt.results || []) {
      const v = scoreFly(r.transcript);
      console.log(`${v.padEnd(10)} ${r.id}: ${r.transcript}`);
      log.push({ kind: 'attempt', id: r.id, verdict: v, transcript: r.transcript });
      if (v !== 'PASS_ذ') continue;
      const bare = r.id.startsWith('قرب_ذبابا_لصنم')
        ? 'قرب ذبابا لصنم'
        : r.id.startsWith('قرب_ذبابا')
          ? 'قرب ذبابا'
          : r.id.startsWith('ذبابا')
            ? 'ذبابا'
            : r.id.startsWith('ذباب')
              ? 'ذباب'
              : null;
      if (!bare || winners[bare]) continue;
      const t = TARGETS.find((x) => x.bare === bare);
      if (!t) continue;
      copyFileSync(join(attemptDir, r.file), join(clipDir, t.file));
      winners[bare] = { file: t.file, transcript: r.transcript, spoken: t.spoken, source: r.id };
    }
  }

  // Aliases for shared audio
  if (winners['قرب ذبابا'] && !winners['قرب ذبابا لصنم']) {
    const t = TARGETS.find((x) => x.bare === 'قرب ذبابا لصنم');
    copyFileSync(join(clipDir, winners['قرب ذبابا'].file), join(clipDir, t.file));
    winners['قرب ذبابا لصنم'] = {
      ...winners['قرب ذبابا'],
      file: t.file,
      note: 'same_audio_as_qarraba_dhubaban',
    };
  }
  if (winners['ذباب'] && !winners['ذبابا']) {
    const t = TARGETS.find((x) => x.bare === 'ذبابا');
    copyFileSync(join(clipDir, winners['ذباب'].file), join(clipDir, t.file));
    winners['ذبابا'] = {
      ...winners['ذباب'],
      file: t.file,
      note: 'aliased_from_dhubab_audio_until_dedicated_PASS',
    };
  }

  const manifest = {
    at: new Date().toISOString(),
    voice: 'راوٍ عربي حكيم',
    note:
      'Pre-recorded Fish clips for ذباب lemmas. Live Fish Hakim often → دباب/دبابة; these clips were Whisper-verified PASS_ذ. UI display stays bare ذباب/قرب ذبابا.',
    clips: Object.fromEntries(
      Object.entries(winners).map(([bare, w]) => [
        bareArabicKey(bare),
        {
          bare,
          file: w.file,
          transcript: w.transcript,
          spoken: w.spoken,
          source: w.source || null,
          note: w.note || null,
        },
      ])
    ),
  };
  writeFileSync(join(clipDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  writeFileSync(join(outDir, 'harvest_log.json'), JSON.stringify({ log, winners: manifest.clips }, null, 2), 'utf8');

  console.log('\n=== WINNERS ===');
  console.log(JSON.stringify(manifest.clips, null, 2));
  const need = ['ذباب', 'ذبابا', 'قرب ذبابا', 'قرب ذبابا لصنم'];
  const missing = need.filter((b) => !manifest.clips[bareArabicKey(b)]);
  if (missing.length) {
    console.error('Missing winners:', missing.join(', '));
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
