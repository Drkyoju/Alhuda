#!/usr/bin/env node
/**
 * Verifier 2 (v338): Fish Hakim pronunciation STT for Q+options (not book citations).
 * Critical KEEP lemmas + unique short options + known fragile clips → CranL /api/tts → Whisper.
 *
 *   node scripts/listen_stt_verifier2_v338.mjs
 *   node scripts/listen_stt_verifier2_v338.mjs --skip-bank
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { prepareFishTtsText, DEFAULT_FISH_VOICE_ID } from '../fish-audio-tts.js';
import { bareArabicKey } from '../short-speech-carriers.js';
import { resolveLemmaTtsClip } from '../lemma-tts-clips.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda-zi6bbd.cranl.net';
const SKIP_BANK = process.argv.includes('--skip-bank');
const WHISPER_MODEL =
  process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'small';
const HAKIM = DEFAULT_FISH_VOICE_ID;

const outDir = join(root, 'extracted/listen_v338_verifier2');
const mp3Dir = join(outDir, 'mp3');
const whisperDir = join(outDir, 'whisper_work');
mkdirSync(mp3Dir, { recursive: true });
mkdirSync(whisperDir, { recursive: true });

function softBare(s) {
  return bareArabicKey(s)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchTts(text) {
  const res = await fetch(`${base}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: HAKIM }),
  });
  const headers = {};
  for (const k of [
    'x-tts-provider',
    'x-tts-lemma',
    'x-tts-lemma-file',
    'x-tts-chars',
    'x-tts-model',
  ]) {
    headers[k] = res.headers.get(k);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, headers };
}

function runWhisper(dir, model, outPath) {
  return new Promise((resolve, reject) => {
    const py = join(root, '.venv/bin/python');
    const child = spawn(
      py,
      [join(root, 'scripts/whisper_transcribe.py'), '--dir', dir, '--model', model, '--out', outPath],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stderr = '';
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.stderr.on('data', (d) => {
      stderr += d;
      process.stderr.write(d);
    });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`whisper exit ${code}: ${stderr.slice(-400)}`));
      else resolve(outPath);
    });
  });
}

function judgeStrict(written, transcript, meta = {}) {
  const w = softBare(written);
  const h = softBare(transcript);
  const flags = [];
  // Classic misreads we care about
  if (/\bارسال\b/.test(h) && /\bارسل\b/.test(w)) flags.push('أرسل→إرسال');
  if (/\bسنن\b/.test(h) && /\bسنين\b/.test(w)) flags.push('سنين→سنن');
  if (/\bصحيحن\b/.test(h) || (/\bصحيح\b/.test(h) && w === 'صح')) flags.push('صح→صحيح(ن)');
  if (/\bخطان\b/.test(h) || (/\bهذا خطأ\b/.test(softBare(transcript)) && w === 'خطأ'))
    flags.push('خطأ invent/تنوين');
  if (/\bدباب/.test(h) && /\bذباب/.test(w)) flags.push('ذ→د');
  if (/\bالعزه\b/.test(h) && /\bالعزي\b/.test(w)) flags.push('العزى→العزة');
  if (/\bانواع\b/.test(h) && /\bانواط\b/.test(w)) flags.push('أنواط→أنواع');
  if (/\bاليمان\b/.test(h) && /\bاليمن\b/.test(w)) flags.push('اليمن→اليمان');
  if (/\bاللاه\b/.test(h)) flags.push('الله→اللاه');

  const overlap =
    w && h
      ? [...w.replace(/\s/g, '')].filter((c, i, a) => h.replace(/\s/g, '').includes(c)).length /
        Math.max(1, w.replace(/\s/g, '').length)
      : 0;
  // crude letter-set overlap
  const wLetters = new Set(w.replace(/\s/g, ''));
  const hLetters = new Set(h.replace(/\s/g, ''));
  let hit = 0;
  for (const c of wLetters) if (hLetters.has(c)) hit++;
  const setOverlap = wLetters.size ? hit / wLetters.size : 1;

  const exact = w === h || w.replace(/\s/g, '') === h.replace(/\s/g, '');
  const shortOk =
    w.replace(/\s/g, '').length <= 12 &&
    (exact ||
      (setOverlap >= 0.85 &&
        !flags.length &&
        Math.abs(w.replace(/\s/g, '').length - h.replace(/\s/g, '').length) <= 2));

  const pass = flags.length === 0 && (exact || shortOk || setOverlap >= 0.78);
  return {
    pass,
    writtenSoft: w,
    heardSoft: h,
    exact,
    setOverlap: Number(setOverlap.toFixed(3)),
    flags,
    lemma: meta.lemma || null,
    provider: meta.provider || null,
  };
}

const CRITICAL = [
  { id: 'tf_sah', text: 'صح', expectLemma: 'sah.mp3' },
  { id: 'tf_khata', text: 'خطأ', expectLemma: 'khata.mp3' },
  { id: 'tf_sah_vocal', text: 'صَحْ', expectLemma: 'sah.mp3' },
  { id: 'tf_khata_vocal', text: 'خَطَأْ', expectLemma: 'khata.mp3' },
  { id: 'mc_sahih', text: 'صحيح', expectLemma: null },
  { id: 'arsal', text: 'أرسل', expectLemma: null },
  { id: 'arsal_q', text: 'بماذا أرسل النبي أولا؟', expectLemma: null },
  { id: 'arsal_q2', text: 'أرسل النبي رسولا في بعض أسفاره ألا يبقى في رقبة بعير قلادة من وتر إلا:', expectLemma: null },
  { id: 'sinin', text: 'سنين', expectLemma: null },
  { id: 'ashr_sinin', text: 'عشر سنين', expectLemma: null },
  { id: 'thalath_sinin', text: 'ثلاث سنين', expectLemma: null },
  { id: 'khams_sinin', text: 'خمس سنين', expectLemma: null },
  { id: 'min_sinin', text: 'من السنين', expectLemma: null },
  { id: 'dhubab', text: 'ذباب', expectLemma: 'dhubab.mp3' },
  { id: 'dhubaban', text: 'ذبابا', expectLemma: 'dhubaban.mp3' },
  { id: 'qarraba', text: 'قرب ذبابا', expectLemma: 'qarraba_dhubaban.mp3' },
  { id: 'qarraba_sanam', text: 'قرب ذبابا لصنم', expectLemma: 'qarraba_dhubaban_sanam.mp3' },
  { id: 'la_darar', text: 'لا ضرر ولا ضرار', expectLemma: 'la_darara.mp3' },
  { id: 'ahl_yaman', text: 'أهل اليمن', expectLemma: 'ahl_yaman.mp3' },
  { id: 'uzza', text: 'العزى', expectLemma: 'uzza.mp3' },
  { id: 'uzza_prepared', text: 'الْعُزَّيْ', expectLemma: 'uzza.mp3' }, // should hit after softBare fix
  { id: 'anwat', text: 'أنواط', expectLemma: 'anwat.mp3' },
  { id: 'dhat_anwat', text: 'ذات أنواط', expectLemma: 'dhat_anwat.mp3' },
  { id: 'riya', text: 'الرياء', expectLemma: 'riya.mp3' },
  { id: 'shirk_akbar', text: 'الشرك الأكبر', expectLemma: 'shirk_akbar.mp3' },
  { id: 'abu_hurayra', text: 'أبو هريرة', expectLemma: 'abu_hurayra.mp3' },
  { id: 'allat', text: 'اللات', expectLemma: 'allat.mp3' },
  { id: 'manat', text: 'مناة', expectLemma: 'manat.mp3' },
  { id: 'ruqa', text: 'رقى', expectLemma: 'ruqa.mp3' },
  { id: 'shirk', text: 'شرك', expectLemma: 'shirk.mp3' },
  { id: 'buda', text: 'بضع', expectLemma: 'bud_a.mp3' },
  { id: 'sabia', text: 'صابئة', expectLemma: 'sabia.mp3' },
  { id: 'ma_ubida', text: 'ما عبد', expectLemma: 'ma_ubida.mp3' },
  { id: 'lat_uzza_q', text: 'اللات والعزى ومناة أصنام كانت تعبدها:', expectLemma: null },
];

function collectBankShortOptions(limitUnique = 120) {
  const bank = JSON.parse(readFileSync(join(root, 'questions-bank.json'), 'utf8'));
  const qs = Array.isArray(bank) ? bank : bank.questions || [];
  const seen = new Set();
  const out = [];
  for (const q of qs) {
    const opts = q.options || q.a || [];
    for (let i = 0; i < opts.length; i++) {
      const raw = String(opts[i] ?? '').trim();
      if (!raw) continue;
      const bare = bareArabicKey(raw);
      const letters = bare.replace(/\s/g, '');
      if (letters.length < 2 || letters.length > 28) continue;
      if (seen.has(bare)) continue;
      seen.add(bare);
      out.push({ id: `opt_${q.id || 'x'}_${i}`, text: raw, from: 'bank_option' });
      if (out.length >= limitUnique) return out;
    }
  }
  return out;
}

async function main() {
  const items = [...CRITICAL.map((c) => ({ ...c, from: 'critical' }))];
  if (!SKIP_BANK) {
    items.push(...collectBankShortOptions(100));
  }

  // Dedupe by prepared text
  const byPrep = new Map();
  for (const it of items) {
    const prep = prepareFishTtsText(it.text);
    const key = softBare(prep) || softBare(it.text);
    if (!byPrep.has(key)) byPrep.set(key, { ...it, prep });
  }
  const unique = [...byPrep.values()];
  console.log(`Clips to fetch: ${unique.length} (base=${base})`);

  const meta = [];
  for (let i = 0; i < unique.length; i++) {
    const it = unique[i];
    const hash = createHash('sha1').update(`v338|${it.prep}`).digest('hex').slice(0, 16);
    const file = join(mp3Dir, `${hash}.mp3`);
    const localLemma = resolveLemmaTtsClip(it.text) || resolveLemmaTtsClip(it.prep);
    let headers = {};
    let status = 0;
    if (!existsSync(file) || readFileSync(file).length < 800) {
      let attempt = 0;
      while (attempt < 5) {
        attempt++;
        try {
          const r = await fetchTts(it.text);
          status = r.status;
          headers = r.headers;
          if (status === 429 || status === 503) {
            await sleep(4000 * attempt);
            continue;
          }
          if (status === 200 && r.buf.length > 800) {
            writeFileSync(file, r.buf);
            break;
          }
        } catch (e) {
          if (attempt >= 5) throw e;
          await sleep(3000 * attempt);
        }
      }
    } else {
      status = 200;
      headers = { cached: '1' };
    }
    const stem = `${String(i).padStart(3, '0')}_${it.id}`;
    const workFile = join(whisperDir, `${stem}.mp3`);
    if (existsSync(file)) copyFileSync(file, workFile);
    const lemmaFile = headers['x-tts-lemma-file'] || localLemma?.file || null;
    const provider = headers['x-tts-provider'] || (localLemma ? 'local-lemma' : null);
    meta.push({
      i,
      stem,
      id: it.id,
      from: it.from,
      text: it.text,
      prep: it.prep,
      expectLemma: it.expectLemma ?? null,
      lemmaFile,
      provider,
      status,
      hash,
      mp3: file,
      workFile,
    });
    if (i % 10 === 0) console.log(`  TTS ${i + 1}/${unique.length} ${it.id}`);
    await sleep(200);
  }

  const sttOut = join(outDir, `stt_${WHISPER_MODEL}.json`);
  await runWhisper(whisperDir, WHISPER_MODEL, sttOut);
  const stt = JSON.parse(readFileSync(sttOut, 'utf8'));
  const byStem = new Map((stt.results || []).map((r) => [r.id, r]));

  const results = meta.map((m) => {
    const tr = byStem.get(m.stem)?.transcript || '';
    const j = judgeStrict(m.text, tr, { lemma: m.lemmaFile, provider: m.provider });
    const lemmaMiss =
      m.expectLemma && m.lemmaFile !== m.expectLemma
        ? { expected: m.expectLemma, got: m.lemmaFile }
        : null;
    return { ...m, transcript: tr, judgment: j, lemmaMiss };
  });

  const fails = results.filter((r) => !r.judgment.pass || r.lemmaMiss);
  const lemmaMisses = results.filter((r) => r.lemmaMiss);
  const report = {
    at: new Date().toISOString(),
    base,
    voice: 'راوٍ عربي حكيم',
    whisper: WHISPER_MODEL,
    n: results.length,
    pass: results.filter((r) => r.judgment.pass && !r.lemmaMiss).length,
    fail: fails.length,
    lemmaMisses: lemmaMisses.map((r) => ({
      id: r.id,
      text: r.text,
      prep: r.prep,
      miss: r.lemmaMiss,
      provider: r.provider,
      transcript: r.transcript,
    })),
    fails: fails.map((r) => ({
      id: r.id,
      text: r.text,
      prep: r.prep,
      transcript: r.transcript,
      soft: r.judgment,
      lemmaMiss: r.lemmaMiss,
      provider: r.provider,
      lemmaFile: r.lemmaFile,
    })),
    criticalSample: results
      .filter((r) => r.from === 'critical')
      .map((r) => ({
        id: r.id,
        text: r.text,
        transcript: r.transcript,
        pass: r.judgment.pass && !r.lemmaMiss,
        flags: r.judgment.flags,
        provider: r.provider,
        lemmaFile: r.lemmaFile,
      })),
  };

  const reportPath = join(root, 'extracted/listen_stt_v338_verifier2.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nWrote ${reportPath}`);
  console.log(`pass=${report.pass} fail=${report.fail} lemmaMisses=${lemmaMisses.length}`);
  for (const f of fails.slice(0, 40)) {
    console.log(
      `FAIL ${f.id}: written=${f.text} | heard=${f.transcript} | flags=${f.judgment.flags.join(',') || '-'} lemmaMiss=${JSON.stringify(f.lemmaMiss)}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
