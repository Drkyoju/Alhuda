#!/usr/bin/env node
/**
 * Relisten fragile speech items via CranL /api/tts + Whisper (≥5 retries each).
 * Expects lemma clips for ذباب keys (X-TTS-Provider: fish-lemma-clip).
 *
 *   node scripts/listen_v308_fragile.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { prepareFishTtsText, bareArabicKey } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda-zi6bbd.cranl.net';
const RETRIES = Number(process.argv.find((a) => a.startsWith('--retries='))?.slice(10) || 5);
const WHISPER = process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'small';

const outDir = join(root, 'extracted/listen_v308_fragile');
const mp3Dir = join(outDir, 'mp3');
mkdirSync(mp3Dir, { recursive: true });

const ITEMS = [
  { id: 'dhubab', bare: 'ذباب', kind: 'fly' },
  { id: 'dhubaban', bare: 'ذبابا', kind: 'fly' },
  { id: 'qarraba', bare: 'قرب ذبابا', kind: 'fly' },
  { id: 'qarraba_sanam', bare: 'قرب ذبابا لصنم', kind: 'fly' },
  { id: 'qarraba_lil', bare: 'قرب ذبابا للصنم', kind: 'fly' },
  { id: 'masud', bare: 'ابن مسعود', kind: 'masud' },
  { id: 'darar', bare: 'لا ضرر ولا ضرار', kind: 'darar' },
  { id: 'yaman_short', bare: 'أهل اليمن', kind: 'yaman' },
  {
    id: 'yaman_long',
    bare: 'بعد التوحيد، أمر النبي ﷺ معاذاً أن يعلم أهل اليمن أن الله افترض عليهم',
    kind: 'yaman',
  },
  {
    id: 'fi_dhubab',
    bare: 'دخل النار رجل في ذباب',
    kind: 'fly_inline',
  },
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
  if (kind === 'fly_inline') {
    const hasDabbab = /د\s*ب\s*ا\s*ب/.test(s);
    const hasManzil = /منزل|طائر/.test(bare);
    if (hasDabbab) return 'FAIL_د';
    if (hasManzil) return 'PASS_منزل';
    return 'other';
  }
  if (kind === 'yaman') {
    if (/اليمان|اليمين|يماني/.test(bare)) return 'FAIL_يمان';
    if (/اليمن|\sيمن/.test(bare)) return 'PASS_يمن';
    return 'no_yaman';
  }
  if (kind === 'masud') {
    if (/ابني|مشعود/.test(bare)) return 'FAIL_ابني';
    if (/مسعود/.test(bare) && /عبد\s*الله|عبدالله/.test(bare.replace(/\s+/g, ''))) return 'PASS_مسعود';
    if (/مسعود/.test(bare)) return 'PASS_مسعود_weak';
    return 'no_masud';
  }
  if (kind === 'darar') {
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
    chars: res.headers.get('x-tts-chars'),
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

async function main() {
  const manifest = [];
  console.log(`base=${base} retries=${RETRIES}`);

  for (const item of ITEMS) {
    for (let r = 1; r <= RETRIES; r++) {
      const id = `${item.id}_r${r}`;
      const prep = prepareFishTtsText(item.bare);
      const file = join(mp3Dir, `${id}.mp3`);
      writeFileSync(join(mp3Dir, `${id}.txt`), prep, 'utf8');
      const meta = await fetchTts(item.bare);
      const ok = meta.status >= 200 && meta.status < 300 && meta.size > 800;
      if (ok) writeFileSync(file, meta.buf);
      console.log(
        `${ok ? 'ok' : 'FAIL'} ${id} ${meta.size}b provider=${meta.provider} lemma=${meta.lemma || '-'}`
      );
      manifest.push({
        id,
        bare: item.bare,
        kind: item.kind,
        prep,
        ...meta,
        ok,
      });
      await sleep(250);
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

  const summary = {
    at: new Date().toISOString(),
    base,
    retries: RETRIES,
    byBare,
    scored,
  };
  writeFileSync(join(outDir, 'score.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n=== BY BARE ===');
  for (const [bare, vs] of Object.entries(byBare)) {
    const pass = vs.filter((v) => String(v).startsWith('PASS')).length;
    console.log(`${pass}/${vs.length} ${bare}: ${vs.join(', ')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
