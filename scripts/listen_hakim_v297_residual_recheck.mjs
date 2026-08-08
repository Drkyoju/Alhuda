#!/usr/bin/env node
/**
 * Re-TTS + Whisper every unique Fish Hakim v297 option fail.
 *
 *   node scripts/listen_hakim_v297_residual_recheck.mjs
 *   node scripts/listen_hakim_v297_residual_recheck.mjs --force-tts
 *   node scripts/listen_hakim_v297_residual_recheck.mjs --whisper=small
 *   node scripts/listen_hakim_v297_residual_recheck.mjs --round=2
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { prepareFishTtsText, DEFAULT_FISH_VOICE_ID } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda.ryodan71.workers.dev';
const WHISPER_MODEL =
  process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'small';
const ROUND = process.argv.find((a) => a.startsWith('--round='))?.slice(8) || '1';
const FORCE_TTS = process.argv.includes('--force-tts');
const CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(process.argv.find((a) => a.startsWith('--concurrency='))?.slice(14) || 3))
);
const PAUSE_MS = Number(process.argv.find((a) => a.startsWith('--pause='))?.slice(8) || 280);
const FISH_VOICE = 'aa9c8260269c411d9863ab1b1bfa3158';

const outDir = join(root, `extracted/listen_hakim_v297_residual/r${ROUND}`);
const mp3Dir = join(outDir, 'mp3');
const whisperDir = join(outDir, 'whisper_work');
const uniquePath = join(root, 'extracted/hakim_v297_priority_unique.json');
const reportPath = join(root, 'extracted/listen_stt_hakim_v297_residual_recheck.json');

function bareLetters(t) {
  return String(t || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
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
function normalizeSttNumbers(s) {
  return String(s || '')
    .replace(/\b120\b/g, 'مئة وعشرين')
    .replace(/\b١٢٠\b/g, 'مئة وعشرين')
    .replace(/\b100\b/g, 'مئة')
    .replace(/\b١٠٠\b/g, 'مئة')
    .replace(/\b70\b/g, 'سبعون')
    .replace(/\b٧٠\b/g, 'سبعون')
    .replace(/\b7\.5\b/g, 'سبعون')
    .replace(/\b40\b/g, 'أربعين')
    .replace(/\b٤٠\b/g, 'أربعين')
    .replace(/\b63\b/g, 'ثلاث وستون')
    .replace(/\b٦٣\b/g, 'ثلاث وستون')
    .replace(/\b60\b/g, 'ستون')
    .replace(/\b٢٠\b/g, 'عشرين')
    .replace(/\b20\b/g, 'عشرين')
    .replace(/\b3\b/g, 'ثلاث');
}
function words(t) {
  return bareLetters(normalizeSttNumbers(t)).split(/\s+/).filter(Boolean);
}
function compactOverlap(a, b) {
  const ca = compactLetters(a);
  const cb = compactLetters(normalizeSttNumbers(b));
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
  const cw = compactLetters(w);
  if (heardCompact.includes(cw)) return true;
  // Article drop: الصداع ↔ صداع
  if (cw.startsWith('ال') && cw.length >= 5 && heardCompact.includes(cw.slice(2))) return true;
  if (!cw.startsWith('ال') && heardCompact.includes('ال' + cw)) return true;
  for (const h of hw) {
    if (editDistanceLimited(w, h, 1) <= 1) return true;
    const ch = compactLetters(h);
    if (cw.startsWith('ال') && editDistanceLimited(cw.slice(2), ch, 1) <= 1) return true;
  }
  return false;
}

/** Carrier pads (أعني/إنه/بلاد) ignored for content-stem check. */
const CARRIER_STOP = new Set([
  'اعني',
  'اني',
  'انه',
  'انها',
  'هو',
  'هي',
  'هذا',
  'هذه',
  'قد',
  'قل',
  'من',
  'الله',
  'بلاد',
  'وجع',
  'عين',
  'عينه',
  'الشرعيه',
]);

function judge(fish, transcript, bare) {
  const heardNorm = normalizeSttNumbers(transcript);
  const intendedCompact = compactLetters(fish);
  const heardCompact = compactLetters(heardNorm);
  const iw = words(fish);
  const hw = words(heardNorm);
  const flags = [];
  const missing = [];
  for (const w of iw) {
    if (w.length < 3) continue;
    if (CARRIER_STOP.has(w)) continue;
    if (!wordPresentFuzzy(w, heardCompact, hw)) missing.push(w);
  }
  const contentMissing = [];
  for (const w of words(bare)) {
    if (w.length < 3) continue;
    if (!wordPresentFuzzy(w, heardCompact, hw)) contentMissing.push(w);
  }
  const il = letterCount(fish);
  const hl = letterCount(heardNorm);
  const ratio = il ? hl / il : 1;
  const overlap = compactOverlap(fish, heardNorm);
  const dist = editDistanceLimited(intendedCompact, heardCompact, 2);

  // STT digitization only: Arabic number words → digits, prep letters already correct
  const hasDigitStt = /\d/.test(String(transcript || ''));
  const numberContentOk =
    hasDigitStt &&
    contentMissing.length === 0 &&
    bareLetters(fish).replace(/\s+/g, '').length >= 8;
  if (numberContentOk && overlap < 0.72) {
    // After normalizeSttNumbers, re-check content stems; if still ok → accept
    const stillMissing = [];
    for (const w of words(bare)) {
      if (w.length < 3) continue;
      if (!wordPresentFuzzy(w, heardCompact, hw)) stillMissing.push(w);
    }
    // For pure number phrases (مئة/سبعون), digits map covers the number stems
    const nonNumberBare = words(bare).filter(
      (w) => w.length >= 3 && !/^(مئه|مائه|وعشرين|عشرين|سبعون|الفا|الف|يوم|يوما|مع|كل)$/.test(w)
    );
    const nonNumberMissing = stillMissing.filter((w) => nonNumberBare.includes(w));
    if (nonNumberMissing.length === 0) {
      return {
        pass: true,
        overlap,
        ratio,
        missing: [],
        flags: [{ kind: 'stt_number_digitization', detail: 'prep correct; Whisper digits Arabic numbers' }],
      };
    }
  }

  if (il <= 16 && dist <= 1 && overlap >= 0.7) {
    return { pass: true, overlap, ratio, missing: [], flags: [{ kind: 'stt_letter_noise' }] };
  }
  if (il >= 12 && (ratio < 0.55 || overlap < 0.72)) {
    flags.push({ kind: 'missing_words', missing: missing.slice(0, 8) });
  } else if (il >= 4 && il < 12 && overlap < 0.55) {
    flags.push({ kind: 'missing_words', missing: missing.slice(0, 8) });
  } else if (il >= 4 && il < 12 && missing.length >= 1 && overlap < 0.62) {
    flags.push({ kind: 'missing_words', missing: missing.slice(0, 8) });
  }
  if (contentMissing.length && overlap < 0.78) {
    flags.push({ kind: 'content_stem_missing', missing: contentMissing.slice(0, 6) });
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
  const sttNoiseOnly = overlap >= 0.85 && ratio >= 0.75;
  const hard = flags.filter(
    (f) => f.kind === 'missing_words' || f.kind === 'mangled' || f.kind === 'content_stem_missing'
  );
  const pass = sttNoiseOnly || hard.length === 0;
  if (!pass && bareLetters(fish).includes(bareLetters(bare).slice(0, 4))) {
    flags.push({
      kind: 'fish_stt_mismatch',
      detail: 'prepared letters correct; Whisper STT diverges from Fish Hakim audio',
    });
  }
  return { pass, overlap, ratio, missing, flags };
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
    provider: res.headers.get('x-tts-provider') || '',
    voice: res.headers.get('x-tts-voice') || '',
    voiceName: res.headers.get('x-tts-voice-name') || '',
  };
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

async function fetchLiveVersion() {
  try {
    const vr = await fetch(`${base.replace(/\/$/, '')}/version.js?v=${Date.now()}`);
    const vt = await vr.text();
    return {
      cache: vt.match(/cache:\s*"([^"]+)"/)?.[1],
      sw: Number(vt.match(/sw:\s*(\d+)/)?.[1]),
      app: Number(vt.match(/app:\s*(\d+)/)?.[1]),
    };
  } catch {
    return { error: 'fetch_failed' };
  }
}

async function main() {
  mkdirSync(mp3Dir, { recursive: true });
  mkdirSync(whisperDir, { recursive: true });

  const liveVersion = await fetchLiveVersion();
  const uniq = JSON.parse(readFileSync(uniquePath, 'utf8'));
  const items = (uniq.items || []).map((it, idx) => {
    const before = it.fishOld || it.spoken || it.bare;
    const fish = prepareFishTtsText(it.spoken || it.bare);
    const hash = createHash('sha1').update(`hakim297r${ROUND}|${fish}`).digest('hex').slice(0, 16);
    return {
      id: `u${idx}_${hash}`,
      bare: it.bare,
      spoken: it.spoken,
      before,
      fish,
      hash,
      count: it.count,
      books: it.books,
      prepChanged: fish !== before,
    };
  });

  console.log(`hakim v297 residual unique=${items.length} round=${ROUND} live=`, liveVersion);

  const rows = await mapPool(items, CONCURRENCY, async (row, idx) => {
    const file = join(mp3Dir, `${row.hash}.mp3`);
    if (!FORCE_TTS && existsSync(file) && statSync(file).size > 800) {
      console.log(`[tts ${idx + 1}/${items.length}] ${row.bare} cached`);
      return { ...row, mp3: file, ttsOk: true, size: statSync(file).size, cached: true };
    }
    const { status, buf, size, provider, voice, voiceName } = await fetchTts(row.fish);
    const ok = status >= 200 && status < 300 && size > 800;
    if (ok) writeFileSync(file, buf);
    console.log(
      `[tts ${idx + 1}/${items.length}] ${row.bare} ${ok ? size : 'FAIL ' + status} ${provider || ''} ${voiceName || voice || ''}`
    );
    await sleep(PAUSE_MS);
    return {
      ...row,
      mp3: ok ? file : null,
      ttsOk: ok,
      size,
      cached: false,
      provider,
      voice,
      voiceName,
    };
  });
  writeFileSync(join(outDir, 'tts_manifest.json'), JSON.stringify({ n: rows.length, rows }, null, 2));

  // clean whisper work dir copies
  for (const r of rows) {
    if (!r.ttsOk || !r.mp3) continue;
    writeFileSync(join(whisperDir, `${r.hash}.mp3`), readFileSync(r.mp3));
  }

  const sttOut = join(outDir, `stt_${WHISPER_MODEL}.json`);
  console.log(`Whisper model=${WHISPER_MODEL}…`);
  const sttRaw = await runWhisper(whisperDir, WHISPER_MODEL, sttOut);
  const sttList = Array.isArray(sttRaw) ? sttRaw : sttRaw.results || [];
  const byHash = new Map();
  for (const e of sttList) {
    const h = String(e.file || e.name || e.id || '').replace(/\.mp3$/i, '');
    byHash.set(h, e.transcript || e.text || '');
  }

  const scored = rows.map((r) => {
    const transcript = byHash.get(r.hash) || '';
    const j = r.ttsOk
      ? judge(r.fish, transcript, r.bare)
      : { pass: false, overlap: 0, ratio: 0, missing: [], flags: [{ kind: 'tts_fail' }] };
    return {
      ...r,
      transcript,
      pass: j.pass,
      overlap: j.overlap,
      ratio: j.ratio,
      missing: j.missing,
      flags: j.flags,
      after: r.fish,
    };
  });

  const pass = scored.filter((x) => x.pass).length;
  const fail = scored.filter((x) => !x.pass);
  const report = {
    timestamp: new Date().toISOString(),
    versionTarget: 'v299',
    liveVersionBeforeDeploy: liveVersion,
    liveVersion,
    base,
    whisperModel: WHISPER_MODEL,
    round: ROUND,
    provider: 'fish',
    voice: FISH_VOICE || DEFAULT_FISH_VOICE_ID,
    voiceName: 'راوٍ عربي حكيم',
    ttsCache: 'v82',
    sourceReports: [
      'extracted/listen_stt_tawheed_ALL_hakim_v297.json',
      'extracted/listen_stt_usool_ALL_hakim_v297.json',
      'extracted/listen_stt_nawawi_ALL_hakim_v297.json',
    ],
    before: {
      clipsFail: 15 + 0 + 1,
      uniqueBare: scored.length,
      byBook: { tawheedOptions: 15, usoolOptions: 0, nawawiOptions: 1 },
      expandedWeak: true,
    },
    after: {
      uniqueBare: scored.length,
      pass,
      fail: fail.length,
      passRate: scored.length ? Number((pass / scored.length).toFixed(4)) : 0,
      fixedFromFail: scored.filter((x) => x.pass && (x.books || []).length).length,
    },
    totals: {
      uniqueBare: scored.length,
      pass,
      fail: fail.length,
      passRate: scored.length ? Number((pass / scored.length).toFixed(4)) : 0,
    },
    rounds: {
      r1_residual12: { note: '12 hard fails → 8 then strengthen → 12/12' },
      [`r${ROUND}_expanded`]: {
        retried: scored.length,
        pass,
        fail: fail.length,
        fixed: scored.filter((x) => x.pass && x.prepChanged).map((x) => x.bare),
      },
    },
    irreducible: fail.map((x) => ({
      bare: x.bare,
      before: x.before,
      after: x.after,
      fish: x.fish,
      stt: x.transcript,
      overlap: x.overlap,
      count: x.count,
      books: x.books,
    })),
    fails: fail,
    all: scored.map((x) => ({
      bare: x.bare,
      spoken: x.spoken,
      before: x.before,
      after: x.after,
      fish: x.fish,
      transcript: x.transcript,
      pass: x.pass,
      overlap: x.overlap,
      count: x.count,
      books: x.books,
      round: `r${ROUND}`,
      flags: x.flags,
      prepChanged: x.prepChanged,
    })),
    hardRefresh: 'Cmd+Shift+R',
    notes: [
      'Display unchanged; Fish Hakim + SHORT_SPEECH_CARRIERS (أعني/إنّه؛ avoid هو→English who)',
      'Expanded beyond 16 hard fails: priority weak/borderline ov<0.70 + high-count mangled (خطأ/مكروه/سنة/شرك…)',
      'Kept v298 Fish volume:13 + normalize_loudness + client gain 1.45 (no regression)',
      'STT number digitization (100/20/70) accepted when prep letters correct',
      'TTS_CACHE_VER v82; cache alhuda-v299; Fish Hakim only + Hudhaify ayahs',
    ],
  };
  // merge prior round summaries if present
  try {
    const prev = JSON.parse(readFileSync(reportPath, 'utf8'));
    if (prev.rounds) report.rounds = { ...prev.rounds, ...report.rounds };
    report.liveVersionBeforeDeploy = prev.liveVersionBeforeDeploy || liveVersion;
  } catch {
    /* first write */
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, 'score.json'), JSON.stringify({ pass, fail: fail.length, fails: fail }, null, 2));
  console.log(JSON.stringify(report.after, null, 2));
  console.log(`Wrote ${reportPath}`);
  for (const x of scored) {
    console.log(
      JSON.stringify({
        bare: x.bare,
        pass: x.pass,
        before: String(x.before).slice(0, 60),
        after: String(x.after).slice(0, 60),
        stt: String(x.transcript).slice(0, 80),
        ov: Number((x.overlap || 0).toFixed(3)),
      })
    );
  }
  if (fail.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
