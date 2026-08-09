#!/usr/bin/env node
/**
 * Live CranL recheck after v309: لا ضرر lemma-clip 5/5 + ذباب still 5/5.
 *
 *   node scripts/listen_v309_fragile.mjs
 *   node scripts/listen_v309_fragile.mjs --retries=5
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { prepareFishTtsText } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda-zi6bbd.cranl.net';
const RETRIES = Number(process.argv.find((a) => a.startsWith('--retries='))?.slice(10) || 5);
const WHISPER = process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'small';

const outDir = join(root, 'extracted/listen_v309_fragile');
const mp3Dir = join(outDir, 'mp3');
mkdirSync(mp3Dir, { recursive: true });

const ITEMS = [
  { id: 'darar', bare: 'لا ضرر ولا ضرار', kind: 'darar' },
  { id: 'dhubab', bare: 'ذباب', kind: 'fly' },
  { id: 'dhubaban', bare: 'ذبابا', kind: 'fly' },
  { id: 'qarraba', bare: 'قرب ذبابا', kind: 'fly' },
  { id: 'qarraba_sanam', bare: 'قرب ذبابا لصنم', kind: 'fly' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function score(kind, t) {
  const s = String(t || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  const bare = s.replace(/[أإآٱ]/g, 'ا');
  if (kind === 'fly') {
    const hasDhubab = /ذ\s*ب\s*ا\s*ب/.test(s);
    const hasDabbab = /د\s*ب\s*ا\s*ب/.test(s);
    if (hasDhubab && !hasDabbab) return 'PASS_ذ';
    if (hasDabbab) return 'FAIL_د';
    return 'no_stem';
  }
  if (kind === 'darar') {
    if (/اللاضر|لاضر\b|لا\s*اضر/.test(bare)) return 'FAIL_اللاضر';
    if (/ضرري\s+ولا\s+ضرري/.test(bare)) return 'FAIL_ضرري';
    if (/ضرر/.test(bare) && /ضرار/.test(bare)) return 'PASS_ضرر';
    return 'no_darar';
  }
  return 'n/a';
}

async function fetchTts(text) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    buf,
    size: buf.length,
    provider: res.headers.get('x-tts-provider'),
    lemma: res.headers.get('x-tts-lemma'),
    lemmaFile: res.headers.get('x-tts-lemma-file'),
  };
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

async function waitForLemmaClip(maxMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const r = await fetchTts('لا ضرر ولا ضرار');
      if (r.provider === 'fish-lemma-clip' && r.size > 800) {
        console.log(`live lemma-clip ready (${r.lemmaFile})`);
        return true;
      }
      console.log(`waiting deploy… provider=${r.provider} size=${r.size}`);
    } catch (e) {
      console.log(`waiting deploy… err=${e.message}`);
    }
    await sleep(8000);
  }
  return false;
}

async function main() {
  const skipWait = process.argv.includes('--no-wait');
  if (!skipWait) {
    const ready = await waitForLemmaClip();
    if (!ready) {
      console.error('Timed out waiting for fish-lemma-clip on لا ضرر');
      process.exit(2);
    }
  }

  const manifest = [];
  console.log(`base=${base} retries=${RETRIES}`);

  for (const item of ITEMS) {
    for (let r = 1; r <= RETRIES; r++) {
      const id = `${item.id}_r${r}`;
      const prep = prepareFishTtsText(item.bare);
      writeFileSync(join(mp3Dir, `${id}.txt`), prep, 'utf8');
      const meta = await fetchTts(item.bare);
      const ok = meta.status >= 200 && meta.status < 300 && meta.size > 800;
      if (ok) writeFileSync(join(mp3Dir, `${id}.mp3`), meta.buf);
      console.log(
        `${ok ? 'ok' : 'FAIL'} ${id} ${meta.size}b provider=${meta.provider} lemma=${meta.lemma || '-'}`
      );
      manifest.push({ id, bare: item.bare, kind: item.kind, prep, ...meta, ok });
      await sleep(200);
    }
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  const stt = await runWhisper(mp3Dir, join(outDir, 'stt.json'));
  const byId = Object.fromEntries((stt.results || []).map((x) => [x.id, x]));

  const scored = manifest.map((m) => {
    const tr = byId[m.id]?.transcript || '';
    return {
      id: m.id,
      bare: m.bare,
      kind: m.kind,
      provider: m.provider,
      lemma: m.lemma,
      transcript: tr,
      verdict: score(m.kind, tr),
    };
  });

  const byBare = {};
  for (const s of scored) {
    byBare[s.bare] ||= [];
    byBare[s.bare].push(s.verdict);
  }

  const summary = { at: new Date().toISOString(), base, retries: RETRIES, byBare, scored };
  writeFileSync(join(outDir, 'score.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n=== BY BARE ===');
  let allOk = true;
  for (const [bare, vs] of Object.entries(byBare)) {
    const pass = vs.filter((v) => String(v).startsWith('PASS')).length;
    console.log(`${pass}/${vs.length} ${bare}: ${vs.join(', ')}`);
    if (pass < vs.length) allOk = false;
  }
  if (!allOk) process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
