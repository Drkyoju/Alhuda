#!/usr/bin/env node
/**
 * Harvest Fish Hakim lemma clips under v320 fidelity:
 * spoken bare words === written bare (tashkeel / spacing / NFC only).
 * No أعني… / الذال ثم… / حشرة… pads.
 *
 *   node scripts/harvest_fidelity_lemma_clips.mjs --local-fish --retries=24
 *   node scripts/harvest_fidelity_lemma_clips.mjs --local-fish --only=ذباب
 */
import {
  writeFileSync,
  mkdirSync,
  readFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from 'fs';
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
const RETRIES = Number(process.argv.find((a) => a.startsWith('--retries='))?.slice(10) || 20);
const WHISPER = process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'small';
const USE_LOCAL = process.argv.includes('--local-fish');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7) || '';
const STABILITY_N = Number(process.argv.find((a) => a.startsWith('--stability='))?.slice(12) || 3);
const NEW_ONLY = process.argv.includes('--new-only');

const outDir = join(root, 'extracted/listen_v321_fidelity_harvest');
const attemptDir = join(outDir, 'attempts');
const clipDir = join(root, 'tts-lemma-clips');
const MANIFEST_PATH = join(clipDir, 'manifest.json');
mkdirSync(attemptDir, { recursive: true });
mkdirSync(clipDir, { recursive: true });

function softBare(s) {
  return bareArabicKey(s)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

/** Same lemmas only — spacing / case / sukun variants of prepareFishTtsText. */
function spokenVariants(bare) {
  const prep = prepareFishTtsText(bare);
  const uniq = new Set([prep]);
  // Micro-gaps between words (same tokens)
  uniq.add(prep.replace(/(\S)\s+(\S)/g, '$1  $2'));
  uniq.add(prep.replace(/(\S)\s+(\S)/g, '$1   $2'));
  // Prefer sukun on final short stubs (no new letters)
  if (/^ذباب$/u.test(bare)) {
    uniq.add('ذُبَابْ');
    uniq.add('ذُبَابٌ');
    uniq.add('ذُبَابُ');
    uniq.add('ذُبَابٍ');
  }
  if (/^ذباباً?$/u.test(bare)) {
    uniq.add('ذُبَابًا');
    uniq.add('ذُبَابَا');
  }
  if (/^قرب\s+ذباباً?$/u.test(bare)) {
    uniq.add('قَرَّبَ  ذُبَابًا');
    uniq.add('قَرَّبَ   ذُبَابًا');
  }
  if (/قرب\s+ذباباً?\s+لل?صنم/.test(bare)) {
    uniq.add(prep.replace(/\s+/g, '  '));
    uniq.add('قَرَّبَ  ذُبَابًا  لِصَنَمٍ');
  }
  if (/لا\s+ضرر\s+ولا\s+ضرار/.test(bare)) {
    uniq.add('لَا  ضَرَرَ  وَلَا  ضِرَارَ');
    uniq.add('لَا،  ضَرَرَ،  وَلَا  ضِرَارَ');
  }
  if (/أهل\s+اليمن/.test(bare)) {
    uniq.add('أَهْلَ  الْيَمَنِ');
    uniq.add('أَهْلُ  الْيَمَنِ');
    uniq.add('أَهْلَ الْيَمَنْ');
  }
  if (/^الرياء$/u.test(bare) || /الر[ِّ]يَاء/.test(prep)) {
    uniq.add("الرِّيَاءُ");
    uniq.add("الرِّيَاءْ");
    uniq.add('الرِّيَاءُ');
  }
  if (/الشرك\s+الأكبر/.test(bare)) {
    uniq.add("الشِّرْكُ  الْأَكْبَرْ");
    uniq.add("الشِّرْكِ  الْأَكْبَرْ");
    uniq.add("الشِّرْكُ الْأَكْبَرُ");
  }
  if (/^صح$/u.test(bare)) {
    uniq.add('صَحْ');
    uniq.add('صَحّ');
    uniq.add('صَحِيحٌ');
  }
  if (/^خطأ$/u.test(bare) || /^خطا$/u.test(bare)) {
    uniq.add('خَطَأٌ');
    uniq.add('خَطَأْ');
  }
  if (/أنواط|انواط/.test(bare)) {
    uniq.add('أَنْوَاطْ');
    uniq.add('ذَاتِ  أَنْوَاطْ');
  }
  if (/اللّات|اللات/.test(bare)) {
    uniq.add('الْلَاتُ');
    uniq.add('اللَاتْ');
  }
  if (/العزى/.test(bare)) {
    uniq.add('الْعُزَّى');
    uniq.add('وَالْعُزَّى');
  }
  if (/^مناة$/u.test(bare)) {
    uniq.add('مَنَاةُ');
    uniq.add('مَنَاةْ');
  }
  if (/^بضع$/u.test(bare)) {
    uniq.add('بُضْعْ');
    uniq.add('الْبُضْعُ');
  }
  if (/صابئة/.test(bare)) {
    uniq.add('الصَّابِئَةُ');
    uniq.add('صَابِئَةٌ');
  }
  if (/ما\s+عبد/.test(bare)) {
    uniq.add('مَا عُبِدَ');
    uniq.add('مَا  عُبِدَ');
  }
  if (/^رقى$/u.test(bare)) {
    uniq.add('رُقَى');
    uniq.add('الرُّقَى');
  }
  if (/^شرك$/u.test(bare)) {
    uniq.add('شِرْكْ');
    uniq.add('شِرْكٌ');
  }
  if (/أبو\s+هريرة|ابو\s+هريرة/.test(bare)) {
    uniq.add('أَبُو  هُرَيْرَةَ');
    uniq.add('أَبُو هُرَيْرَةَ');
  }
  // Strict: soft bare of spoken must equal soft bare of written key
  return [...uniq].filter((v) => softBare(v) === softBare(bare));
}

const TARGETS = [
  {
    bare: 'ذباب',
    file: 'dhubab.mp3',
    kind: 'fly',
    aliases: [],
  },
  {
    bare: 'ذبابا',
    file: 'dhubaban.mp3',
    kind: 'fly',
    aliases: [],
  },
  {
    bare: 'قرب ذبابا',
    file: 'qarraba_dhubaban.mp3',
    kind: 'fly',
    aliases: [],
  },
  {
    bare: 'قرب ذبابا لصنم',
    file: 'qarraba_dhubaban_sanam.mp3',
    kind: 'fly',
    aliases: ['قرب ذبابا للصنم'],
  },
  {
    bare: 'لا ضرر ولا ضرار',
    file: 'la_darara.mp3',
    kind: 'darar',
    aliases: [],
  },
  {
    bare: 'أهل اليمن',
    file: 'ahl_yaman.mp3',
    kind: 'yaman',
    aliases: [],
  },
  {
    bare: 'الرياء',
    file: 'riya.mp3',
    kind: 'riya',
    aliases: [],
  },
  {
    bare: 'الشرك الأكبر',
    file: 'shirk_akbar.mp3',
    kind: 'shirk',
    aliases: [],
  },
  { bare: 'صح', file: 'sah.mp3', kind: 'sah', aliases: [] },
  { bare: 'خطأ', file: 'khata.mp3', kind: 'khata', aliases: [] },
  { bare: 'أنواط', file: 'anwat.mp3', kind: 'anwat', aliases: [] },
  { bare: 'ذات أنواط', file: 'dhat_anwat.mp3', kind: 'anwat', aliases: [] },
  { bare: 'اللّات', file: 'allat.mp3', kind: 'allat', aliases: ['اللات'] },
  { bare: 'العزى', file: 'uzza.mp3', kind: 'uzza', aliases: [] },
  { bare: 'مناة', file: 'manat.mp3', kind: 'manat', aliases: [] },
  { bare: 'بضع', file: 'bud_a.mp3', kind: 'buda', aliases: [] },
  { bare: 'صابئة', file: 'sabia.mp3', kind: 'sabia', aliases: [] },
  { bare: 'ما عبد', file: 'ma_ubida.mp3', kind: 'ubida', aliases: [] },
  { bare: 'رقى', file: 'ruqa.mp3', kind: 'ruqa', aliases: [] },
  { bare: 'شرك', file: 'shirk.mp3', kind: 'shirk_short', aliases: [] },
  { bare: 'أبو هريرة', file: 'abu_hurayra.mp3', kind: 'hurayra', aliases: ['ابو هريرة'] },
].filter((t) => !ONLY || t.bare.includes(ONLY) || softBare(t.bare).includes(softBare(ONLY)));

const SPEEDS = [0.9, 0.95, 1.0, 1.05, 1.08, 1.12];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function score(kind, transcript, bare) {
  const s = String(transcript || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  const soft = softBare(s);
  const target = softBare(bare);
  // Reject inventing pads even if stem ok
  if (/اعني|حشره|الذال\s*ثم|قاعده|اقليم|بلاد|بلد/.test(soft)) return 'FAIL_invent';
  if (kind === 'fly') {
    const hasDhubab = /ذ\s*ب\s*ا\s*ب/.test(s);
    // Whisper small often splits ذُبَاب → «ذو بابن» / «ذوبابن» (still ذ, not د)
    const hasDhSplit = /ذ\s*و?\s*ب\s*ا\s*ب/.test(s) || /ذوباب/.test(s);
    const hasDabbab = /د\s*ب\s*ا\s*ب/.test(s);
    if ((hasDhubab || hasDhSplit) && !hasDabbab) return 'PASS_ذ';
    if (hasDabbab && !hasDhubab && !hasDhSplit) return 'FAIL_د';
    return 'no_stem';
  }
  if (kind === 'darar') {
    if (/اللاضر|لاضر\b|لا\s*اضر/.test(soft)) return 'FAIL_اللاضر';
    if (/ضرر/.test(soft) && /ضرار/.test(soft)) return 'PASS_ضرر';
    return 'no_darar';
  }
  if (kind === 'yaman') {
    if (/اليمان(?!ي)/.test(soft) && !/اليمن/.test(soft)) return 'FAIL_اليمان';
    if (/اليمن/.test(soft) && /اهل/.test(soft)) return 'PASS_يمن';
    return 'no_yaman';
  }
  if (kind === 'riya') {
    if (/اريا(?!ء)/.test(soft) && !/رياء/.test(soft)) return 'FAIL_اريا';
    if (/رياء/.test(soft)) return 'PASS_رياء';
    return 'no_riya';
  }
  if (kind === 'shirk') {
    if (/^اشرك/.test(soft) || /\sاشرك\s/.test(` ${soft} `)) return 'FAIL_اشرك';
    if (/الشرك/.test(soft) && /الاكبر/.test(soft)) return 'PASS_شرك';
    return 'no_shirk';
  }
  if (kind === 'sah') {
    if (/^صحب/.test(soft)) return 'FAIL_صحب';
    if (/^صح$/.test(soft) || /^صحيح/.test(soft)) return 'PASS_صح';
    return 'no_sah';
  }
  if (kind === 'khata') {
    if (/شطأ|شطا/.test(soft)) return 'FAIL_شطأ';
    if (/خطا/.test(soft)) return 'PASS_خطأ';
    return 'no_khata';
  }
  if (kind === 'anwat') {
    if (/انواع(?!ط)/.test(soft)) return 'FAIL_أنواع';
    if (/انواط/.test(soft)) return 'PASS_أنواط';
    return 'no_anwat';
  }
  if (kind === 'allat') {
    if (/اللات/.test(soft) || /اللات/.test(soft)) return 'PASS_اللات';
    return 'no_allat';
  }
  if (kind === 'uzza') {
    if (/العزه/.test(soft) && !/العزى|العزي/.test(soft)) return 'FAIL_العزة';
    if (/العزى|العزي|العزّى/.test(s) || /العزي/.test(soft)) return 'PASS_العزى';
    return 'no_uzza';
  }
  if (kind === 'manat') {
    if (/مناه|مونات/.test(soft) && !/مناة|منات/.test(soft)) return 'FAIL_مناة';
    if (/مناة|منات/.test(soft)) return 'PASS_مناة';
    return 'no_manat';
  }
  if (kind === 'buda') {
    if (/^بدا$/.test(soft) || /بضع/.test(soft) === false && /بدا/.test(soft)) return 'FAIL_بدا';
    if (/بضع/.test(soft)) return 'PASS_بضع';
    return 'no_buda';
  }
  if (kind === 'sabia') {
    if (/صابئ|سابئ|الصاب/.test(soft) || /سابيه|صابيه/.test(soft)) {
      if (/سابيه/.test(soft) && !/صاب/.test(soft)) return 'FAIL_سابية';
      if (/صاب/.test(soft)) return 'PASS_صابئة';
    }
    return 'no_sabia';
  }
  if (kind === 'ubida') {
    if (/معبد/.test(soft)) return 'FAIL_معبد';
    if (/ما\s*عبد/.test(soft) || /ماعبد/.test(soft)) return 'PASS_ماعبد';
    return 'no_ubida';
  }
  if (kind === 'ruqa') {
    if (/رقى|رقي|الرق/.test(soft)) return 'PASS_رقى';
    return 'no_ruqa';
  }
  if (kind === 'shirk_short') {
    if (/شريك/.test(soft) && !/^شرك$/.test(soft)) return 'FAIL_شريك';
    if (/^شرك$/.test(soft) || /شرك/.test(soft)) return 'PASS_شرك';
    return 'no_shirk_short';
  }
  if (kind === 'hurayra') {
    if (/حرير/.test(soft) && !/هرير/.test(soft)) return 'FAIL_حريرا';
    if (/هرير/.test(soft)) return 'PASS_هريرة';
    return 'no_hurayra';
  }
  // Generic: soft bare of transcript should contain target
  if (soft.includes(target) || softBare(s.replace(/\s+/g, '')) === target.replace(/\s+/g, '')) {
    return 'PASS_generic';
  }
  return 'fail_generic';
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
  return {
    status: res.status,
    buf,
    size: buf.length,
    provider: res.headers.get('x-tts-provider'),
  };
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

async function stabilityCheck(absMp3, kind, bare) {
  const stabDir = join(outDir, 'stability', bareArabicKey(bare).replace(/\s+/g, '_'));
  mkdirSync(stabDir, { recursive: true });
  clearDirMp3(stabDir);
  for (let i = 1; i <= STABILITY_N; i++) {
    copyFileSync(absMp3, join(stabDir, `stab_${i}.mp3`));
  }
  const stt = await runWhisper(stabDir, join(stabDir, 'stt.json'));
  const scored = (stt.results || []).map((r) => ({
    id: r.id,
    transcript: r.transcript,
    verdict: score(kind, r.transcript, bare),
  }));
  const pass = scored.filter((s) => String(s.verdict).startsWith('PASS')).length;
  console.log(`  stability ${pass}/${scored.length} for «${bare}»`);
  for (const s of scored) console.log(`    ${s.verdict} ${s.transcript}`);
  return { pass, total: scored.length, scored };
}

async function harvestOne(target, fetchTts) {
  const variants = spokenVariants(target.bare).filter((v) => {
    // Strict: soft bare of spoken must equal soft bare of written key
    // Allow multi-word where spoken soft equals bare soft
    return softBare(v) === softBare(target.bare);
  });
  console.log(`\n=== ${target.bare} (${variants.length} fidelity variants) ===`);
  if (!variants.length) {
    console.log('  no fidelity variants');
    return null;
  }

  const batchDir = join(attemptDir, bareArabicKey(target.bare).replace(/\s+/g, '_'));
  mkdirSync(batchDir, { recursive: true });
  clearDirMp3(batchDir);

  const meta = [];
  let n = 0;
  for (let i = 0; i < RETRIES; i++) {
    const spoken = variants[i % variants.length];
    const speed = SPEEDS[i % SPEEDS.length];
    const id = `r${i + 1}`;
    writeFileSync(join(batchDir, `${id}.txt`), spoken, 'utf8');
    const r = await fetchTts(spoken, speed);
    if (!(r.status >= 200 && r.status < 300 && r.size > 800)) {
      console.log(`  skip ${id}: status=${r.status} size=${r.size}`);
      continue;
    }
    if (r.provider === 'fish-lemma-clip') {
      console.log(`  skip ${id}: server returned lemma-clip — use --local-fish`);
      continue;
    }
    writeFileSync(join(batchDir, `${id}.mp3`), r.buf);
    meta.push({ id, spoken, speed, size: r.size, provider: r.provider });
    n++;
    process.stdout.write(`  got ${id} ${r.size}b speed=${speed}\n`);
    await sleep(150);
  }

  if (!n) return null;

  const stt = await runWhisper(batchDir, join(batchDir, 'stt.json'));
  const byId = Object.fromEntries((stt.results || []).map((x) => [x.id, x]));
  let winner = null;
  for (const m of meta) {
    const tr = byId[m.id]?.transcript || '';
    const v = score(target.kind, tr, target.bare);
    console.log(`  ${v.padEnd(14)} ${m.id}: ${tr}  ← ${m.spoken}`);
    if (String(v).startsWith('PASS') && !winner) {
      winner = { ...m, transcript: tr, verdict: v, abs: join(batchDir, `${m.id}.mp3`) };
    }
  }
  if (!winner) return null;

  const stab = await stabilityCheck(winner.abs, target.kind, target.bare);
  if (stab.pass < Math.ceil(stab.total * 0.66)) {
    console.log(`  reject winner — weak stability`);
    return null;
  }
  return { ...winner, stability: stab };
}

async function main() {
  const fetchTts = USE_LOCAL ? fetchTtsLocal : fetchTtsCranl;
  console.log(`mode=${USE_LOCAL ? 'local-fish' : 'cranl'} retries=${RETRIES} targets=${TARGETS.length}`);

  const man = loadExistingManifest();
  man.at = new Date().toISOString();
  man.voice = 'راوٍ عربي حكيم';
  man.note =
    'v321 fidelity lemma clips: spoken/transcript bare === written bare (tashkeel/spacing only).';
  man.clips = man.clips && typeof man.clips === 'object' ? man.clips : {};

  const log = [];
  for (const t of TARGETS) {
    if (NEW_ONLY && man.clips[t.bare]?.file) {
      console.log(`\n=== skip existing «${t.bare}» → ${man.clips[t.bare].file} ===`);
      continue;
    }
    const w = await harvestOne(t, fetchTts);
    log.push({ bare: t.bare, ok: !!w, winner: w && { spoken: w.spoken, transcript: w.transcript, verdict: w.verdict, speed: w.speed } });
    if (!w) {
      console.log(`  NO WINNER for «${t.bare}»`);
      continue;
    }
    const dest = join(clipDir, t.file);
    copyFileSync(w.abs, dest);
    const entry = {
      bare: t.bare,
      file: t.file,
      spoken: w.spoken,
      transcript: w.transcript,
      source: w.id,
      speed: w.speed,
      note: `${w.verdict}; fidelity softBare match`,
    };
    man.clips[t.bare] = entry;
    for (const a of t.aliases || []) {
      man.clips[a] = { ...entry, bare: a, note: `${entry.note}; alias` };
    }
    console.log(`  SAVED ${t.file}`);
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(man, null, 2), 'utf8');
  writeFileSync(join(outDir, 'harvest_log.json'), JSON.stringify({ at: man.at, log, clips: man.clips }, null, 2), 'utf8');
  console.log(`\nManifest → ${MANIFEST_PATH}`);
  console.log(`Clips: ${Object.keys(man.clips).length}`);
  const missing = TARGETS.filter((t) => !man.clips[t.bare]);
  if (missing.length) {
    console.log('Still missing:', missing.map((m) => m.bare).join(' | '));
    process.exitCode = 3;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
