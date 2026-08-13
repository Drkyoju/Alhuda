#!/usr/bin/env node
/**
 * Reviewer A (v342): Fish Hakim STT for Q+options only (not book citations).
 * Critical KEEP/lemma + stratified short options per book + systematic questions.
 *
 *   node scripts/listen_stt_reviewer_a_v342.mjs
 *   node scripts/listen_stt_reviewer_a_v342.mjs --skip-bank
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

const outDir = join(root, 'extracted/listen_v342_reviewer_a');
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

function judgeStrict(written, transcript) {
  const w = softBare(written);
  const h = softBare(transcript);
  const flags = [];
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
  // swapped اللهو/لعب order is OK if both words present; flag allah-misread of لهو
  if (/\bالله\b/.test(h) && /\bاللهو\b/.test(w) && !/\bاللهو\b/.test(h) && !/\bلهو\b/.test(h))
    flags.push('اللهو→الله');

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
  return { pass, writtenSoft: w, heardSoft: h, exact, setOverlap: Number(setOverlap.toFixed(3)), flags };
}

const CRITICAL = [
  { id: 'tf_sah', text: 'صح', expectLemma: 'sah.mp3' },
  { id: 'tf_khata', text: 'خطأ', expectLemma: 'khata.mp3' },
  { id: 'mc_sahih', text: 'صحيح', expectLemma: null },
  { id: 'arsal', text: 'أرسل', expectLemma: null },
  { id: 'arsal_q', text: 'بماذا أرسل النبي أولا؟', expectLemma: null },
  { id: 'sinin', text: 'سنين', expectLemma: null },
  { id: 'ashr_sinin', text: 'عشر سنين', expectLemma: null },
  { id: 'thalath_sinin', text: 'ثلاث سنين', expectLemma: null },
  { id: 'khams_sinin', text: 'خمس سنين', expectLemma: null },
  { id: 'hadith_sahih', text: 'حديث صحيح', expectLemma: null },
  { id: 'hadith_hasan', text: 'حديث حسن', expectLemma: null },
  { id: 'uzza', text: 'العزى', expectLemma: 'uzza.mp3' },
  { id: 'uzza_prep', text: 'الْعُزَّيْ', expectLemma: 'uzza.mp3' },
  { id: 'lat_uzza_q', text: 'اللات والعزى ومناة أصنام كانت تعبدها:', expectLemma: null },
  { id: 'dhubab', text: 'ذباب', expectLemma: 'dhubab.mp3' },
  { id: 'qarraba', text: 'قرب ذبابا', expectLemma: 'qarraba_dhubaban.mp3' },
  { id: 'la_darar', text: 'لا ضرر ولا ضرار', expectLemma: 'la_darara.mp3' },
  { id: 'ahl_yaman', text: 'أهل اليمن', expectLemma: 'ahl_yaman.mp3' },
  { id: 'anwat', text: 'أنواط', expectLemma: 'anwat.mp3' },
  { id: 'dhat_anwat', text: 'ذات أنواط', expectLemma: 'dhat_anwat.mp3' },
  { id: 'riya', text: 'الرياء', expectLemma: 'riya.mp3' },
  { id: 'shirk_akbar', text: 'الشرك الأكبر', expectLemma: 'shirk_akbar.mp3' },
  { id: 'lahw_play', text: 'اللهو واللعب', expectLemma: null },
  { id: 'lahw_play_voc', text: 'اللَّهْوُ وَاللَّعِبُ', expectLemma: null },
  { id: 'shahada_q', text: 'شهادة أن محمدًا رسول الله تقتضي:', expectLemma: null },
  { id: 'shahada_q_voc', text: 'شَهَادَةُ أَنَّ مُحَمَّدًا رَسُولُ اللَّهِ تَقْتَضِي:', expectLemma: null },
];

function loadBank() {
  return JSON.parse(
    readFileSync(join(root, 'questions-bank.js'), 'utf8').match(
      /window\.QUESTIONS_BANK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/
    )[1]
  );
}

function collectStratified(perBookOpts = 35, qEvery = 18) {
  const bank = loadBank();
  const out = [];
  const seen = new Set();
  function add(id, text, from) {
    const bare = softBare(text);
    if (!bare || seen.has(bare)) return;
    seen.add(bare);
    out.push({ id, text, from });
  }
  for (const book of ['tawheed', 'usool', 'nawawi']) {
    const qs = bank[book] || [];
    let optN = 0;
    let qi = 0;
    for (const q of qs) {
      if (qEvery > 0 && qi % qEvery === 0 && q.question_text) {
        add(`q_${book}_${q.id.slice(0, 8)}`, String(q.question_text).trim(), `sys_q_${book}`);
      }
      qi++;
      const opts = q.options || [];
      for (let i = 0; i < opts.length; i++) {
        if (optN >= perBookOpts) break;
        const raw = String(opts[i] ?? '').trim();
        const letters = softBare(raw).replace(/\s/g, '');
        if (letters.length < 2 || letters.length > 28) continue;
        add(`opt_${book}_${q.id.slice(0, 8)}_${i}`, raw, `opt_${book}`);
        optN++;
      }
    }
  }
  return out;
}

async function main() {
  const items = [...CRITICAL.map((c) => ({ ...c, from: 'critical' }))];
  if (!SKIP_BANK) items.push(...collectStratified(35, 18));

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
    const hash = createHash('sha1').update(`v342ra|${it.prep}`).digest('hex').slice(0, 16);
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
    if (i % 15 === 0) console.log(`  TTS ${i + 1}/${unique.length} ${it.id}`);
    await sleep(180);
  }

  const sttOut = join(outDir, `stt_${WHISPER_MODEL}.json`);
  await runWhisper(whisperDir, WHISPER_MODEL, sttOut);
  const stt = JSON.parse(readFileSync(sttOut, 'utf8'));
  const byStem = new Map((stt.results || []).map((r) => [r.id, r]));

  const results = meta.map((m) => {
    const tr = byStem.get(m.stem)?.transcript || '';
    const j = judgeStrict(m.text, tr);
    const lemmaMiss =
      m.expectLemma && m.lemmaFile !== m.expectLemma
        ? { expected: m.expectLemma, got: m.lemmaFile }
        : null;
    return { ...m, transcript: tr, judgment: j, lemmaMiss };
  });

  const hardFails = results.filter((r) => !r.judgment.pass);
  const lemmaMisses = results.filter((r) => r.lemmaMiss);
  const report = {
    at: new Date().toISOString(),
    base,
    liveNote: 'v341 at start; fixes ship as v342',
    voice: 'راوٍ عربي حكيم',
    whisper: WHISPER_MODEL,
    n: results.length,
    pass: results.filter((r) => r.judgment.pass).length,
    fail: hardFails.length,
    lemmaMisses: lemmaMisses.length,
    byBookSample: results.reduce((a, r) => {
      const k = String(r.from || '').replace(/^opt_|^sys_q_/, '') || r.from;
      a[k] = (a[k] || 0) + 1;
      return a;
    }, {}),
    critical: results
      .filter((r) => r.from === 'critical')
      .map((r) => ({
        id: r.id,
        text: r.text,
        transcript: r.transcript,
        pass: r.judgment.pass,
        flags: r.judgment.flags,
        provider: r.provider,
        lemma: r.lemmaFile,
        lemmaMiss: r.lemmaMiss,
      })),
    fails: hardFails.map((r) => ({
      id: r.id,
      text: r.text,
      prep: r.prep,
      transcript: r.transcript,
      flags: r.judgment.flags,
      setOverlap: r.judgment.setOverlap,
      provider: r.provider,
    })),
    lemmaMissList: lemmaMisses.map((r) => ({
      id: r.id,
      text: r.text,
      miss: r.lemmaMiss,
      provider: r.provider,
      transcript: r.transcript,
      pass: r.judgment.pass,
    })),
  };

  writeFileSync(join(root, 'extracted/listen_stt_v342_reviewer_a.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nWrote extracted/listen_stt_v342_reviewer_a.json`);
  console.log(`pass=${report.pass} fail=${report.fail} lemmaMisses=${report.lemmaMisses} n=${report.n}`);
  for (const f of hardFails.slice(0, 40)) {
    console.log(
      `FAIL ${f.id}: written=${f.text} | heard=${f.transcript} | flags=${f.judgment.flags.join(',') || '-'}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
