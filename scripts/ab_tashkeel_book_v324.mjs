#!/usr/bin/env node
/**
 * Book A/B: Fish Hakim WITH current tashkeel vs WITHOUT (strip harakat).
 * Same method as scripts/ab_tashkeel_tawheed_v323.mjs — usool then nawawi for v324.
 *
 * Reuses WITH transcripts from v304 (q/options) + v305 (feedback).
 * Fetches BARE via CranL /api/tts, Whisper-scores, picks winner per unique segment.
 * Aggregates word-level KEEP (tashkeel helps) vs STRIP (bare equal/better).
 *
 *   node scripts/ab_tashkeel_book_v324.mjs --book=usool --phase=all
 *   node scripts/ab_tashkeel_book_v324.mjs --book=nawawi --phase=tts
 *   node scripts/ab_tashkeel_book_v324.mjs --book=usool --phase=judge
 *
 * Whisper cannot hear iʿrāb reliably — ties → strip; KEEP only when WITH clearly better
 * or word is in CRITICAL_KEEP seed (known Fish misreads without marks).
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync, linkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { prepareFishTtsText, DEFAULT_FISH_VOICE_ID, FISH_VOICE_NAME_AR } from '../fish-audio-tts.js';

const HAKIM_VOICE = DEFAULT_FISH_VOICE_ID;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda-zi6bbd.cranl.net';
const BOOK = (process.argv.find((a) => a.startsWith('--book='))?.slice(7) || '').toLowerCase();
const PHASE = (process.argv.find((a) => a.startsWith('--phase='))?.slice(8) || 'all').toLowerCase();
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0);
const CONCURRENCY = Math.max(
  1,
  Math.min(3, Number(process.argv.find((a) => a.startsWith('--concurrency='))?.slice(14) || 2))
);
const PAUSE_MS = Number(process.argv.find((a) => a.startsWith('--pause='))?.slice(8) || 200);
const WHISPER = process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'base';
const FORCE_TTS = process.argv.includes('--force-tts');
const MARGIN = Number(process.argv.find((a) => a.startsWith('--margin='))?.slice(9) || 0.03);

const BOOKS = {
  usool: {
    titleAr: 'أصول الثلاثة',
    sources: [
      { file: 'extracted/listen_stt_usool_ALL_hakim_cranl_v304.json', kind: 'q_options' },
      { file: 'extracted/listen_stt_usool_FEEDBACK_hakim_cranl_v305.json', kind: 'feedback' },
    ],
  },
  nawawi: {
    titleAr: 'الأربعين النووية',
    sources: [
      { file: 'extracted/listen_stt_nawawi_ALL_hakim_cranl_v304.json', kind: 'q_options' },
      { file: 'extracted/listen_stt_nawawi_FEEDBACK_hakim_cranl_v305.json', kind: 'feedback' },
    ],
  },
};

if (!BOOKS[BOOK]) {
  console.error('Usage: --book=usool|nawawi [--phase=tts|stt|judge|all]');
  process.exit(2);
}

const bookMeta = BOOKS[BOOK];
const outDir = join(root, `extracted/ab_tashkeel_${BOOK}_v324`);
const mp3Dir = join(outDir, 'mp3_bare');
const sttDir = join(outDir, 'stt_bare');
const whisperWork = join(outDir, 'whisper_work');
const segmentsPath = join(outDir, 'segments.json');
const bareSttPath = join(outDir, 'bare_stt.json');
const decisionsPath = join(outDir, 'decisions.json');
const policyPath = join(outDir, 'harakat_policy.json');
const summaryPath = join(root, `extracted/listen_stt_${BOOK}_v324_TASHKEEL_AB_SUMMARY.json`);
const arReportPath = join(root, `extracted/${BOOK}_tashkeel_ab_v324_AR.md`);

/** Known Fish misreads without marks — KEEP even on Whisper tie. */
const CRITICAL_KEEP_BARE = new Set([
  'عبد',
  'عبيد',
  'من',
  'ان',
  'انن',
  'بان',
  'لعن',
  'يعبد',
  'تعبد',
  'نعبد',
  'الله',
  'لله',
  'بالله',
  'والله',
  'تالله',
  'ذباب',
  'ذبابا',
  'انواط',
  'العزى',
  'العزي',
  'صفر',
  'ربا',
  'مكه',
  'صدق',
  // usool / nawawi seeds
  'اصل',
  'اصول',
  'الاصل',
  'الاصول',
  'ثلاثه',
  'النووي',
  'الاربعين',
  'ضرر',
  'ضرار',
]);

const HARAKAT_RE = /[\u064B-\u065F\u0670\u0610-\u061A\u0640]/g;
const BOOK_AR = { usool: 'أصول الثلاثة', nawawi: 'الأربعين النووية' };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripHarakat(s) {
  return String(s || '').replace(HARAKAT_RE, '');
}

function bareLetters(s) {
  return stripHarakat(s)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactLetters(s) {
  return bareLetters(s).replace(/\s+/g, '');
}

function letterCount(s) {
  return (bareLetters(s).match(/[\u0621-\u064A]/g) || []).length;
}

function compactOverlap(a, b) {
  const ca = compactLetters(a);
  const cb = compactLetters(b);
  if (!ca.length && !cb.length) return 1;
  if (!ca.length || !cb.length) return 0;
  const counts = new Map();
  for (const ch of ca) counts.set(ch, (counts.get(ch) || 0) + 1);
  let hit = 0;
  for (const ch of cb) {
    const n = counts.get(ch) || 0;
    if (n > 0) {
      hit += 1;
      counts.set(ch, n - 1);
    }
  }
  return hit / Math.max(ca.length, cb.length);
}

function textHash(prefix, text) {
  return createHash('sha256').update(prefix + String(text || ''), 'utf8').digest('hex').slice(0, 16);
}

function softBareKey(tok) {
  return bareLetters(tok).replace(/\s+/g, '');
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function buildSegments() {
  const byHash = new Map();
  for (const src of bookMeta.sources) {
    const report = loadJson(join(root, src.file));
    for (const clip of Object.values(report.clips || {})) {
      const withText = String(clip.ttsText || clip.fish || '').trim();
      if (!withText || letterCount(withText) < 2) continue;
      if (!HARAKAT_RE.test(withText)) continue;
      // withText is already prepared TTS from listen — strip marks only for the BARE arm.
      // (Do not re-run prepareFishTtsText here: live KEEP policy would re-mark winners.)
      const bareText = stripHarakat(withText).replace(/\s+/g, ' ').trim();
      const key = textHash('seg|', withText);
      if (byHash.has(key)) {
        const e = byHash.get(key);
        e.refs.push({ id: clip.id, kind: src.kind, qid: clip.qid });
        continue;
      }
      byHash.set(key, {
        key,
        kind: src.kind,
        withText,
        bareText,
        withHash: clip.hash || textHash(`hakim_cranl_v304_${BOOK}|`, withText),
        bareHash: textHash(`ab_bare_v324_${BOOK}|`, bareText),
        withTranscript: clip.transcript || '',
        withOverlap: Number(clip.compactOverlap ?? compactOverlap(withText, clip.transcript || '')),
        withRatio: Number(clip.letterRatio ?? 1),
        withPass: !!clip.pass,
        withHardFail: !!clip.hardFail,
        withMp3: clip.mp3 || null,
        refs: [{ id: clip.id, kind: src.kind, qid: clip.qid }],
      });
    }
  }
  let segs = [...byHash.values()].sort((a, b) => a.withText.length - b.withText.length);
  if (LIMIT > 0) segs = segs.slice(0, LIMIT);
  return segs;
}

async function fetchTts(text) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const provider = res.headers.get('x-tts-provider') || '';
  const voice = res.headers.get('x-tts-voice') || '';
  if (
    res.status === 200 &&
    (!provider.toLowerCase().includes('fish') || voice !== HAKIM_VOICE)
  ) {
    throw new Error(`voice mismatch provider=${provider} voice=${voice}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, size: buf.length, provider, voice };
}

async function ensureBareMp3(seg) {
  mkdirSync(mp3Dir, { recursive: true });
  const file = join(mp3Dir, `${seg.bareHash}.mp3`);
  if (!FORCE_TTS && existsSync(file) && statSync(file).size > 800) {
    return { file, cached: true, ttsOk: true, size: statSync(file).size };
  }
  let attempt = 0;
  while (attempt < 6) {
    attempt += 1;
    try {
      const { status, buf, size, provider, voice } = await fetchTts(seg.bareText);
      if (status === 429 || status === 503 || status === 502) {
        await sleep(Math.min(60000, 6000 * attempt));
        continue;
      }
      if (status >= 200 && status < 300 && size > 800) {
        writeFileSync(file, buf);
        return { file, cached: false, ttsOk: true, size, provider, voice };
      }
      return { file: null, ttsOk: false, status, size };
    } catch (e) {
      if (attempt >= 6) return { file: null, ttsOk: false, err: String(e.message || e) };
      await sleep(3000 * attempt);
    }
  }
  return { file: null, ttsOk: false };
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

async function phaseTts(segs) {
  console.log(`TTS bare [${BOOK}]: ${segs.length} unique segments → ${base}`);
  let ok = 0;
  let fail = 0;
  let cached = 0;
  await mapPool(segs, CONCURRENCY, async (seg, idx) => {
    const r = await ensureBareMp3(seg);
    seg.bareMp3 = r.file;
    seg.bareTtsOk = !!r.ttsOk;
    seg.bareCached = !!r.cached;
    if (r.ttsOk) ok += 1;
    else fail += 1;
    if (r.cached) cached += 1;
    if ((idx + 1) % 25 === 0 || idx === 0) {
      console.log(`[${idx + 1}/${segs.length}] ok=${ok} fail=${fail} cached=${cached} last=${seg.bareHash}`);
    }
    if (!r.cached) await sleep(PAUSE_MS);
    return r;
  });
  writeFileSync(segmentsPath, JSON.stringify(segs, null, 2));
  console.log(`TTS done ok=${ok} fail=${fail} cached=${cached} → ${segmentsPath}`);
  return segs;
}

function runWhisper(dir, model, outJson) {
  return new Promise((resolve, reject) => {
    const py = join(root, '.venv/bin/python');
    const script = join(root, 'scripts/whisper_transcribe.py');
    const child = spawn(py, [script, '--dir', dir, '--model', model, '--out', outJson, '--lang', 'ar'], {
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

async function phaseStt(segs) {
  mkdirSync(whisperWork, { recursive: true });
  mkdirSync(sttDir, { recursive: true });
  let n = 0;
  for (const seg of segs) {
    if (!seg.bareTtsOk || !seg.bareMp3 || !existsSync(seg.bareMp3)) continue;
    const dest = join(whisperWork, `${seg.bareHash}.mp3`);
    if (!existsSync(dest)) {
      try {
        linkSync(seg.bareMp3, dest);
      } catch {
        copyFileSync(seg.bareMp3, dest);
      }
    }
    n += 1;
  }
  console.log(`Whisper ${WHISPER} on ${n} bare clips [${BOOK}]…`);
  const raw = await runWhisper(whisperWork, WHISPER, bareSttPath);
  const byId = new Map((raw.results || raw).map((r) => [r.id || r.file?.replace(/\.mp3$/, ''), r]));
  for (const seg of segs) {
    const hit = byId.get(seg.bareHash);
    seg.bareTranscript = hit?.transcript || '';
    seg.bareSttOk = !!hit?.ok;
    seg.bareOverlap = Number(compactOverlap(seg.withText, seg.bareTranscript).toFixed(4));
    seg.bareRatio = letterCount(seg.withText)
      ? Number((letterCount(seg.bareTranscript) / letterCount(seg.withText)).toFixed(4))
      : 1;
  }
  writeFileSync(segmentsPath, JSON.stringify(segs, null, 2));
  writeFileSync(join(sttDir, 'index.json'), JSON.stringify({ model: WHISPER, n }, null, 2));
  console.log(`STT done → ${bareSttPath}`);
  return segs;
}

function transcriptTrust(transcript) {
  const t = String(transcript || '');
  if (/[A-Za-z]{3,}/.test(t)) return 0.15;
  const ar = (t.match(/[\u0621-\u064A]/g) || []).length;
  if (ar < 2 && t.trim().length > 0) return 0.2;
  return 1;
}

function scoreOf(overlap, ratio, hardFail, transcript) {
  let s = overlap * transcriptTrust(transcript);
  if (hardFail) s -= 0.15;
  if (ratio < 0.55 || ratio > 1.45) s -= 0.08;
  return s;
}

function decideSegment(seg) {
  const il = letterCount(seg.withText);
  const withScore = scoreOf(
    seg.withOverlap || 0,
    seg.withRatio || 1,
    seg.withHardFail,
    seg.withTranscript
  );
  const bareScore = scoreOf(seg.bareOverlap || 0, seg.bareRatio || 1, false, seg.bareTranscript);
  const delta = withScore - bareScore;
  let winner;
  let reason;
  if (!seg.bareTtsOk || !seg.bareTranscript) {
    winner = 'with';
    reason = 'bare_missing_fallback_with';
  } else if (il <= 6 && withScore >= 0.55 && delta >= -0.02) {
    winner = 'with';
    reason = `short_prefer_with_delta=${delta.toFixed(3)}`;
  } else if (delta > MARGIN) {
    winner = 'with';
    reason = `with_better_delta=${delta.toFixed(3)}`;
  } else {
    winner = 'bare';
    reason =
      delta >= -MARGIN
        ? `bare_equal_or_better_delta=${delta.toFixed(3)}`
        : `bare_better_delta=${delta.toFixed(3)}`;
  }
  return {
    winner,
    reason,
    withScore: Number(withScore.toFixed(4)),
    bareScore: Number(bareScore.toFixed(4)),
    delta: Number(delta.toFixed(4)),
  };
}

function tokenizeArabic(text) {
  const out = [];
  const re = /[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    out.push(m[0]);
  }
  return out;
}

function enrichKeepFromShortWith(segs, decisions, keepBareSet, keepWords) {
  const byKey = new Map(decisions.map((d) => [d.key, d]));
  let added = 0;
  for (const seg of segs) {
    const d = byKey.get(seg.key) || seg.decision;
    if (!d || d.winner !== 'with') continue;
    const il = letterCount(seg.withText);
    if (!(il <= 14 || d.delta > 0.05)) continue;
    for (const tok of tokenizeArabic(seg.withText)) {
      const b = softBareKey(tok);
      if (!b || b.length < 2) continue;
      if (!keepBareSet.has(b)) {
        keepBareSet.add(b);
        added += 1;
      }
      if (HARAKAT_RE.test(tok)) keepWords[b] = keepWords[b] || tok;
    }
  }
  for (const b of CRITICAL_KEEP_BARE) keepBareSet.add(b);
  return added;
}

function phaseJudge(segs) {
  const decisions = [];
  const wordVotes = new Map();

  function vote(bare, form, side, seg) {
    if (!bare || bare.length < 2) return;
    if (!wordVotes.has(bare)) {
      wordVotes.set(bare, { keep: 0, strip: 0, forms: new Map(), examples: [] });
    }
    const e = wordVotes.get(bare);
    e[side] += 1;
    if (form) e.forms.set(form, (e.forms.get(form) || 0) + 1);
    if (e.examples.length < 3) {
      e.examples.push({
        side,
        with: seg.withText.slice(0, 60),
        bareForm: form,
        winner: seg.decision?.winner,
      });
    }
  }

  let keepSeg = 0;
  let stripSeg = 0;
  for (const seg of segs) {
    const d = decideSegment(seg);
    seg.decision = d;
    decisions.push({
      key: seg.key,
      winner: d.winner,
      reason: d.reason,
      withScore: d.withScore,
      bareScore: d.bareScore,
      delta: d.delta,
      withText: seg.withText,
      bareText: seg.bareText,
      withTranscript: seg.withTranscript,
      bareTranscript: seg.bareTranscript,
      refs: seg.refs?.length || 0,
    });
    if (d.winner === 'with') keepSeg += 1;
    else stripSeg += 1;

    for (const tok of tokenizeArabic(seg.withText)) {
      const bare = softBareKey(tok);
      if (!bare) continue;
      if (d.winner === 'with') vote(bare, tok, 'keep', seg);
      else vote(bare, tok, 'strip', seg);
    }
  }

  const keepWords = {};
  const keepBareSet = new Set();
  const stripWords = [];
  const hardWords = [];

  for (const [bare, v] of [...wordVotes.entries()].sort(
    (a, b) => b[1].keep + b[1].strip - (a[1].keep + a[1].strip)
  )) {
    const total = v.keep + v.strip;
    const bestForm = [...v.forms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || bare;
    const critical = CRITICAL_KEEP_BARE.has(bare);
    let action;
    if (critical) action = 'keep';
    else if (v.keep > v.strip && v.keep / total >= 0.55) action = 'keep';
    else action = 'strip';

    if (action === 'keep') {
      keepBareSet.add(bare);
      keepWords[bare] = bestForm;
    } else {
      stripWords.push(bare);
    }
    if (Math.min(v.keep, v.strip) / total >= 0.35 && total >= 4) {
      hardWords.push({
        bare,
        keep: v.keep,
        strip: v.strip,
        bestForm,
        action,
        critical,
        examples: v.examples,
      });
    }
  }

  for (const b of CRITICAL_KEEP_BARE) {
    keepBareSet.add(b);
    if (!keepWords[b]) keepWords[b] = b;
  }

  const added = enrichKeepFromShortWith(segs, decisions, keepBareSet, keepWords);
  const keepBare = [...keepBareSet].sort(
    (a, b) => b.length - a.length || a.localeCompare(b, 'ar')
  );

  const policy = {
    at: new Date().toISOString(),
    book: BOOK,
    voice: HAKIM_VOICE,
    voiceName: FISH_VOICE_NAME_AR,
    margin: MARGIN,
    whisper: WHISPER,
    whisperLimitNote:
      'Whisper لا يسمع الإعراب بدقة؛ التعادل → تجريد. KEEP يحافظ على التشكيل الحالي للكلمة (لا يفرض شكلاً واحداً لله). مقاطع قصيرة ≤6 أحرف تفضّل WITH إذا كان STT سليماً.',
    segments: { total: segs.length, keepTashkeel: keepSeg, stripHarakat: stripSeg },
    words: {
      keepCount: keepBare.length,
      stripCount: stripWords.length,
      keepBare,
      keepWords,
      stripWordsSample: stripWords.slice(0, 80),
    },
    enrichment: { addedFromWithShortSegs: added, keepAfterEnrich: keepBare.length },
    hardWords: hardWords.slice(0, 60),
    examplesKeep: decisions.filter((d) => d.winner === 'with').slice(0, 12),
    examplesStrip: decisions.filter((d) => d.winner === 'bare').slice(0, 12),
  };

  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));
  writeFileSync(policyPath, JSON.stringify(policy, null, 2));
  writeFileSync(segmentsPath, JSON.stringify(segs, null, 2));

  const ar = [
    `# تقرير A/B التشكيل — ${BOOK_AR[BOOK]} (v324)`,
    '',
    `الصوت: Fish **راوٍ عربي حكيم** (\`${HAKIM_VOICE}\`) — بلا تبديل.`,
    `المضيف: ${base}/`,
    '',
    '## النتيجة',
    '| | العدد |',
    '|--|--:|',
    `| مقاطع فريدة (سؤال/خيار/تغذية راجعة) | **${segs.length}** |`,
    `| أُبقي التشكيل (مقطع) | **${keepSeg}** |`,
    `| جُرّد التشكيل (مقطع) | **${stripSeg}** |`,
    `| كلمات KEEP (بعد إثراء المقاطع القصيرة الرابحة) | **${keepBare.length}** |`,
    `| كلمات STRIP (تقريباً) | **${stripWords.length}** |`,
    '',
    '## أمثلة KEEP (التشكيل يحسّن أو يثبّت)',
    ...policy.examplesKeep.slice(0, 8).map(
      (e, i) => `${i + 1}. \`${e.withText.slice(0, 70)}\` — Δ=${e.delta}`
    ),
    '',
    '## أمثلة STRIP (بلا تشكيل أفضل أو متعادل)',
    ...policy.examplesStrip.slice(0, 8).map(
      (e, i) => `${i + 1}. \`${e.bareText.slice(0, 70)}\` — Δ=${e.delta}`
    ),
    '',
    '## كلمات صعبة متبقية',
    ...hardWords
      .slice(0, 12)
      .map((h) => `- ${h.bare} → ${h.action} (keep ${h.keep}/strip ${h.strip})`),
    '',
    '## حدود Whisper',
    policy.whisperLimitNote,
    '',
    '## حُرّاس v319',
    'expectQuestionId / speakToken / HEARTS_ENABLED=false — لم تُمس.',
    '',
  ].join('\n');
  writeFileSync(arReportPath, ar);

  const summary = {
    at: policy.at,
    base,
    versionTarget: 'v324',
    book: BOOK,
    voice: HAKIM_VOICE,
    voiceName: FISH_VOICE_NAME_AR,
    method:
      'A/B WITH current tashkeel vs BARE strip via CranL TTS + Whisper; KEEP preserves contextual iʿrāb',
    segments: policy.segments,
    words: {
      keepCount: policy.words.keepCount,
      stripCount: policy.words.stripCount,
    },
    enrichment: policy.enrichment,
    hardWordsCount: hardWords.length,
    artifacts: {
      segments: `extracted/ab_tashkeel_${BOOK}_v324/segments.json`,
      decisions: `extracted/ab_tashkeel_${BOOK}_v324/decisions.json`,
      policy: `extracted/ab_tashkeel_${BOOK}_v324/harakat_policy.json`,
      arReport: `extracted/${BOOK}_tashkeel_ab_v324_AR.md`,
    },
    v319RaceGuards: { expectQuestionId: 'kept', speakToken: 'kept', HEARTS_ENABLED: false },
    whisperLimitNote: policy.whisperLimitNote,
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(
    `Judge [${BOOK}]: keepSeg=${keepSeg} stripSeg=${stripSeg} keepWords=${keepBare.length} stripWords=${stripWords.length} enrich+${added}`
  );
  console.log(`AR report → ${arReportPath}`);
  return policy;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  let segs;
  if (PHASE === 'judge' || PHASE === 'stt') {
    if (!existsSync(segmentsPath)) throw new Error('missing segments.json — run --phase=tts first');
    segs = loadJson(segmentsPath);
  } else {
    segs = buildSegments();
    writeFileSync(segmentsPath, JSON.stringify(segs, null, 2));
    console.log(`Built ${segs.length} unique ${BOOK} segments with harakat`);
  }

  if (PHASE === 'tts' || PHASE === 'all') {
    segs = await phaseTts(segs);
  }
  if (PHASE === 'stt' || PHASE === 'all') {
    if (!segs) segs = loadJson(segmentsPath);
    segs = await phaseStt(segs);
  }
  if (PHASE === 'judge' || PHASE === 'all') {
    if (!segs) segs = loadJson(segmentsPath);
    if (existsSync(bareSttPath) && segs.some((s) => !s.bareTranscript)) {
      const raw = loadJson(bareSttPath);
      const byId = new Map((raw.results || raw).map((r) => [r.id || r.file?.replace(/\.mp3$/, ''), r]));
      for (const seg of segs) {
        const hit = byId.get(seg.bareHash);
        if (hit?.transcript) {
          seg.bareTranscript = hit.transcript;
          seg.bareSttOk = !!hit.ok;
          seg.bareOverlap = Number(compactOverlap(seg.withText, seg.bareTranscript).toFixed(4));
          seg.bareRatio = letterCount(seg.withText)
            ? Number((letterCount(seg.bareTranscript) / letterCount(seg.withText)).toFixed(4))
            : 1;
        }
      }
    }
    phaseJudge(segs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
