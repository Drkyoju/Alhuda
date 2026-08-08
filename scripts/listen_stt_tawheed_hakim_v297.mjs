#!/usr/bin/env node
/**
 * Tawheed full listen/STT via Fish «راوٍ عربي حكيم» (v297) — NOT Azure/Hamed.
 *
 * Every question `q` + all MC/TF options through CURRENT prepareTtsPayload → /api/tts
 * (X-TTS-Provider=fish, X-TTS-Voice must be aa9c8260269c411d9863ab1b1bfa3158). Whisper STT each clip.
 *
 *   node scripts/listen_stt_tawheed_hakim_v297.mjs --phase=both
 *
 * MP3 cache: extracted/listen_all/mp3_hakim_v297/<hash>.mp3
 * Report:    extracted/listen_stt_tawheed_ALL_hakim_v297.json
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { fixAllahIrabInText } from '../allah-irab.js';
import { prepareFishTtsText, DEFAULT_FISH_VOICE_ID, FISH_VOICE_NAME_AR } from '../fish-audio-tts.js';

const HAKIM_VOICE = DEFAULT_FISH_VOICE_ID; // aa9c8260269c411d9863ab1b1bfa3158
const HASH_PREFIX = 'hakim_v297|';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda.ryodan71.workers.dev';
const phaseArg = (process.argv.find((a) => a.startsWith('--phase='))?.slice(8) || 'both').toLowerCase();
const BOOK_FILTER = (process.argv.find((a) => a.startsWith('--book='))?.slice(7) || 'tawheed')
  .toLowerCase()
  .trim();
const COMPARE_ONLY = process.argv.includes('--compare-only');
const REJUDGE_ONLY = process.argv.includes('--rejudge-only');
const TTS_ONLY = process.argv.includes('--tts-only');
const STT_ONLY = process.argv.includes('--stt-only');
const CONCURRENCY = Math.max(
  1,
  Math.min(3, Number(process.argv.find((a) => a.startsWith('--concurrency='))?.slice(14) || 2))
);
const PAUSE_MS = Number(process.argv.find((a) => a.startsWith('--pause='))?.slice(8) || 250);
const WHISPER_MODEL =
  process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'base';
const WHISPER_FAIL_MODEL =
  process.argv.find((a) => a.startsWith('--whisper-fail='))?.slice(15) || 'small';
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0);
const IDS_RAW = process.argv.find((a) => a.startsWith('--ids='))?.slice(6) || '';
const ID_FILTER = new Set(
  IDS_RAW
    ? IDS_RAW.split(',').map((s) => s.trim()).filter(Boolean)
    : []
);
const RETRY_FAILS = process.argv.includes('--retry-fails');
const FORCE_TTS = process.argv.includes('--force-tts');

const audioRoot = join(root, 'extracted/listen_all');
const mp3Dir = join(audioRoot, 'mp3_hakim_v297');
const bookTag = `${BOOK_FILTER || 'all'}_hakim_v297`;
const sttCacheDir = join(audioRoot, `stt_${bookTag}`);
const whisperWorkDir = join(audioRoot, `whisper_work_${bookTag}`);
const reportArg = process.argv.find((a) => a.startsWith('--report='))?.slice(9);
const reportPath = reportArg
  ? join(root, reportArg.replace(/^\.\//, ''))
  : join(root, 'extracted/listen_stt_tawheed_ALL_hakim_v297.json');
const clipsIndexPath = join(audioRoot, `clips_index_${bookTag}.json`);

function loadWindow(file) {
  const win = {};
  new Function('window', readFileSync(join(root, file), 'utf8'))(win);
  return win;
}

function extractFn(src, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) throw new Error(`function ${name} not found`);
  let i = m.index;
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error(`unbalanced ${name}`);
}

function extractConstBlock(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=`);
  const m = re.exec(src);
  if (!m) throw new Error(`const ${name} not found`);
  let i = m.index + m[0].length;
  while (i < src.length && /\s/.test(src[i])) i++;
  const start = m.index;
  if (src[i] === '[') {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '[') depth++;
      else if (src[j] === ']') {
        depth--;
        if (depth === 0) {
          let end = j + 1;
          if (src[end] === ';') end++;
          return src.slice(start, end);
        }
      }
    }
  }
  let end = i;
  let depth = 0;
  for (; end < src.length; end++) {
    const c = src[end];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) return src.slice(start, end + 1);
  }
  throw new Error(`const ${name} extract fail`);
}

const appSrc = readFileSync(join(root, 'app.js'), 'utf8');
const win = {
  ...loadWindow('speech-pronunciation-lexicon.js'),
  ...loadWindow('speech-diacritics-map.js'),
};
try {
  Object.assign(win, loadWindow('question-verse-map.js'));
} catch {
  /* optional */
}
try {
  Object.assign(win, loadWindow('ayah-snippet-map.js'));
} catch {
  /* optional */
}

const verseMap = win.QUESTION_VERSE_MAP || {};
const ayahSnippets = win.AYAH_SNIPPET_MAP || {};
const bank = JSON.parse(
  readFileSync(join(root, 'questions-bank.js'), 'utf8').match(
    /window\.QUESTIONS_BANK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/
  )[1]
);
const all = Object.values(bank)
  .flat()
  .filter((q) => !BOOK_FILTER || String(q.book || '').toLowerCase() === BOOK_FILTER);

function normalizeArabicForMatchLocal(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sandbox = {
  window: win,
  fixAllahIrabInText,
  state: { displayAnswerOrder: null },
  lookupKnownVerseKey(snippet) {
    const n = normalizeArabicForMatchLocal(snippet);
    if (!n || n.length < 8) return null;
    if (ayahSnippets[n]) return ayahSnippets[n];
    for (const [key, verseKey] of Object.entries(ayahSnippets)) {
      const nk = normalizeArabicForMatchLocal(key);
      if (!nk || nk.length < 10) continue;
      if (n === nk || (nk.length >= 12 && n.includes(nk)) || (n.length >= 18 && nk.includes(n))) {
        return verseKey;
      }
    }
    return null;
  },
  ALLAH: "اللَّه",
};

const fnNames = [
  'stripArabicDiacritics',
  'normalizeArabicForMatch',
  'scrubFakeAllahSpellings',
  'scrubSpeechDiacriticsNoise',
  'sanitizeTtsText',
  'hasWellFormedTashkeel',
  'hasBareArabicWords',
  'fixDetachedHarakat',
  'hasOcrTashkeelGaps',
  'hasSoftOcrLetterBreaks',
  'hasBrokenArabicSpacing',
  'collapseBrokenArabicSpaces',
  'prepareArabicForSpeech',
  'getSortedManualSpeech',
  'stripHarakat',
  'applyPronunciationLexicon',
  'applyWordDiacritics',
  'speechMatchesDisplay',
  'applyManualSpeechDiacritics',
  'isHadithQudsiText',
  'isHadithPassage',
  'isQuranicAyahText',
  'harakatTolerantArabicRe',
  'stripKnownAyahSnippetsForSpeech',
  'removeQuranicVersesForSpeech',
  'normalizeQuotedLessonStemForSpeech',
  'fixLessonHadithPronunciation',
  'speechTextFor',
  'speechPart',
  'buildQuestionOptionSpeechList',
  'buildQuestionSpeechParts',
  'prepareTtsPayload',
];

const constParts = [
  extractConstBlock(appSrc, 'ARABIC_HARAKAT_RE'),
  extractConstBlock(appSrc, 'MANUAL_SPEECH_DIACRITICS'),
  extractConstBlock(appSrc, 'SPEECH_WORD_RE'),
  'let _sortedManualSpeech = null;',
];
const allahMatch = appSrc.match(/const\s+ALLAH\s*=\s*[^;]+;/);
if (allahMatch) constParts.unshift(allahMatch[0]);

const boot = `
${constParts.join('\n')}
const window = __sandbox.window;
const state = __sandbox.state;
const fixAllahIrabInText = __sandbox.fixAllahIrabInText;
const lookupKnownVerseKey = __sandbox.lookupKnownVerseKey;
${allahMatch ? '' : 'const ALLAH = __sandbox.ALLAH;'}
${fnNames.map((n) => extractFn(appSrc, n)).join('\n\n')}
return {
  prepareTtsPayload,
  speechPart,
  buildQuestionSpeechParts,
  stripKnownAyahSnippetsForSpeech,
  sanitizeTtsText,
  removeQuranicVersesForSpeech,
};
`;

const api = new Function('__sandbox', boot)(sandbox);

function toAppQ(q) {
  return {
    id: q.id,
    type: q.type,
    q: q.question_text,
    a: q.options || null,
    c: q.correct_index,
    exp: q.explanation,
    quote: q.source_quote,
    book: q.book,
    tf: q.tf,
  };
}

function bareLetters(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whisper often digitizes أربعين→40 etc. Map digits back before judging. */
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
    .replace(/\b3\b/g, 'ثلاث')
    .replace(/\b٤٠\b/g, 'أربعين');
}

function words(s) {
  return bareLetters(normalizeSttNumbers(s)).split(/\s+/).filter(Boolean);
}

function letterCount(s) {
  return (bareLetters(s).match(/[\u0621-\u064A]/g) || []).length;
}

function editDistanceLimited(a, b, max = 2) {
  a = String(a);
  b = String(b);
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[a.length];
}

function textHash(text) {
  return createHash('sha256').update(HASH_PREFIX + String(text || ''), 'utf8').digest('hex').slice(0, 16);
}

function prepareField(q, field, spoken, { stripAyah = false } = {}) {
  let prepared = api.prepareTtsPayload(spoken);
  if (stripAyah || (field === 'q' && verseMap[q.id])) {
    const stripped = String(spoken || '')
      .replace(/﴿[^﴾]*﴾/g, ' ')
      .replace(/「[^」]*」/g, ' ');
    prepared = api.prepareTtsPayload(stripped) || prepared;
    const without = api.stripKnownAyahSnippetsForSpeech(prepared);
    const bareOrig = String(prepared || '').replace(/[\u064B-\u065F\u0670\s]/g, '');
    const bareWithout = String(without || '').replace(/[\u064B-\u065F\u0670\s]/g, '');
    const stripOk = bareWithout.length >= 8
      && bareWithout.length >= Math.min(14, Math.floor(bareOrig.length * 0.4));
    prepared = without && stripOk
      ? api.prepareTtsPayload(without) || api.sanitizeTtsText(without) || without
      : prepared;
  }
  // Fish Hakim: prepareTtsPayload then prepareFishTtsText (worker re-applies same prep).
  const fish = prepared ? prepareFishTtsText(prepared) : '';
  const ttsText = fish || prepared || '';
  return { spoken: String(spoken || ''), prepared: prepared || '', ttsText, fish };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadReport() {
  if (!existsSync(reportPath)) {
    return {
      timestamp: null,
      mode: 'listen_stt_tawheed_ALL_hakim_v297',
      provider: 'fish',
      voice: HAKIM_VOICE,
      voiceName: FISH_VOICE_NAME_AR,
      note: 'Full tawheed listen: prepareTtsPayload → Fish راوٍ عربي حكيم via /api/tts + Whisper (NOT Azure/Hamed)',
      base,
      bankSize: all.length,
      phase: { q: { done: 0, total: 0 }, options: { done: 0, total: 0 } },
      clips: {},
      summary: {},
      providerConfirmed: { fish: 0, voice: HAKIM_VOICE, mismatches: 0 },
    };
  }
  return JSON.parse(readFileSync(reportPath, 'utf8'));
}

function saveReport(report) {
  report.timestamp = new Date().toISOString();
  report.base = base;
  report.bankSize = all.length;
  report.mode = 'listen_stt_tawheed_ALL_hakim_v297';
  report.provider = 'fish';
  report.voice = HAKIM_VOICE;
  report.voiceName = FISH_VOICE_NAME_AR;
  mkdirSync(join(root, 'extracted'), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

function versionInfo() {
  try {
    const v = readFileSync(join(root, 'version.js'), 'utf8');
    return {
      cache: (v.match(/cache:\s*"([^"]+)"/) || [])[1],
      sw: Number((v.match(/\bsw:\s*(\d+)/) || [])[1]),
      app: Number((v.match(/\bapp:\s*(\d+)/) || [])[1]),
    };
  } catch {
    return {};
  }
}

/** Build clip descriptors for a phase. */
function buildClips(phase) {
  const clips = [];
  for (const q of all) {
    const aq = toAppQ(q);
    if (phase === 'q' || phase === 'both') {
      const spoken = api.speechPart(aq, 'q', aq.q);
      const prep = prepareField(q, 'q', spoken, { stripAyah: !!verseMap[q.id] });
      clips.push({
        id: `q_${q.id}`,
        phase: 'q',
        qid: q.id,
        field: 'q',
        type: q.type,
        book: q.book,
        ...prep,
        hash: textHash(prep.ttsText || prep.spoken || q.id),
      });
    }
    if (phase === 'options' || phase === 'both') {
      if (q.type === 'mc' && Array.isArray(aq.a)) {
        // Natural option order (display shuffle varies per round — verify all orig indices)
        aq.a.forEach((opt, i) => {
          if (opt == null || opt === '') return;
          const spoken = api.speechPart(aq, `a${i}`, opt);
          const prep = prepareField(q, `a${i}`, spoken);
          clips.push({
            id: `a${i}_${q.id}`,
            phase: 'options',
            qid: q.id,
            field: `a${i}`,
            type: 'mc',
            book: q.book,
            ...prep,
            hash: textHash(prep.ttsText || prep.spoken || `${q.id}:a${i}`),
          });
        });
      } else if (q.type === 'tf') {
        for (const [field, text] of [
          ['tf0', 'صَحّ'],
          ['tf1', 'خَطَأٌ'],
        ]) {
          const prep = prepareField(q, field, text);
          clips.push({
            id: `${field}_${q.id}`,
            phase: 'options',
            qid: q.id,
            field,
            type: 'tf',
            book: q.book,
            ...prep,
            hash: textHash(prep.ttsText || text),
          });
        }
      }
    }
  }
  return LIMIT > 0 ? clips.slice(0, LIMIT) : clips;
}

function filterClips(clips, report) {
  let out = clips;
  if (RETRY_FAILS) {
    out = out.filter((c) => report.clips[c.id]?.pass === false);
  }
  if (ID_FILTER.size) {
    out = out.filter((c) => ID_FILTER.has(c.id) || ID_FILTER.has(c.qid));
  }
  return out;
}

function compactLetters(s) {
  return bareLetters(s).replace(/\s+/g, '');
}

/** Rough letter-bag overlap ignoring order (Whisper often merges/splits words). */
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

function wordPresentFuzzy(w, heardCompact, hw) {
  if (hw.includes(w) || heardCompact.includes(w)) return true;
  // allow 1-edit for longer stems (ذ/ظ, ت/ط STT noise)
  if (w.length >= 4) {
    for (const h of hw) {
      if (Math.abs(h.length - w.length) > 1) continue;
      let diff = 0;
      const n = Math.max(h.length, w.length);
      for (let i = 0; i < n; i++) {
        if (h[i] !== w[i]) diff += 1;
        if (diff > 1) break;
      }
      if (diff <= 1) return true;
    }
  }
  return false;
}

function judgeClip(clip, transcript) {
  const heardNorm = normalizeSttNumbers(transcript);
  const intended = bareLetters(clip.fish);
  const heard = bareLetters(heardNorm);
  const heardCompact = compactLetters(heardNorm);
  const intendedCompact = compactLetters(clip.fish);
  const iw = words(clip.fish);
  const hw = words(heardNorm);
  const flags = [];

  if (!clip.fish || letterCount(clip.fish) < 2) {
    return {
      pass: true,
      skipped: true,
      reason: 'empty_fish_after_prep',
      intendedBare: intended,
      transcriptBare: heard,
      letterRatio: 1,
      compactOverlap: 1,
      missing: [],
      extra: [],
      flags: [{ kind: 'skipped_empty_fish' }],
      hardFail: false,
    };
  }

  if (/اللاه/.test(transcript) || /اللاه/.test(heardCompact)) {
    flags.push({ kind: 'allah_misread', detail: 'اللاه' });
  }

  const missing = [];
  const extra = [];
  for (const w of iw) {
    if (w.length < 3) continue;
    if (!wordPresentFuzzy(w, heardCompact, hw)) missing.push(w);
  }
  for (const w of hw) {
    if (w.length < 3) continue;
    if (!iw.includes(w) && !intended.includes(w) && !intendedCompact.includes(w)) extra.push(w);
  }

  const il = letterCount(clip.fish);
  const hl = letterCount(heardNorm);
  const ratio = il ? hl / il : 1;
  const overlap = compactOverlap(clip.fish, heardNorm);
  const dist = editDistanceLimited(intendedCompact, heardCompact, 2);

  // Near-identical short forms (صحيح↔سحيح) = STT letter noise, not voice fail
  if (il <= 16 && dist <= 1 && overlap >= 0.7) {
    return {
      pass: true,
      intendedBare: intended.slice(0, 200),
      transcriptBare: heard.slice(0, 200),
      letterRatio: Number(ratio.toFixed(3)),
      compactOverlap: Number(overlap.toFixed(3)),
      missing: [],
      extra: [],
      flags: [{ kind: 'stt_letter_noise', detail: `editDist=${dist}` }],
      hardFail: false,
    };
  }

  // Hard content loss only when compact letters diverge strongly
  if (il >= 12 && (ratio < 0.55 || overlap < 0.72)) {
    flags.push({
      kind: 'missing_words',
      detail: `letterRatio=${ratio.toFixed(2)} overlap=${overlap.toFixed(2)}`,
      missing: missing.slice(0, 8),
    });
  } else if (missing.length >= 4 && il >= 24 && overlap < 0.88) {
    flags.push({ kind: 'missing_words', missing: missing.slice(0, 8), detail: `overlap=${overlap.toFixed(2)}` });
  } else if (il >= 4 && il < 12 && overlap < 0.55) {
    flags.push({
      kind: 'missing_words',
      detail: `short_overlap=${overlap.toFixed(2)}`,
      missing: missing.slice(0, 8),
    });
  } else if (il >= 4 && il < 12 && missing.length >= 1 && overlap < 0.62) {
    flags.push({
      kind: 'missing_words',
      detail: `short_missing overlap=${overlap.toFixed(2)}`,
      missing: missing.slice(0, 8),
    });
  }

  const mangled = [];
  for (const w of hw) {
    if (w.length < 4) continue;
    let best = 0;
    for (const t of iw) {
      const shared = [...w].filter((c) => t.includes(c)).length;
      best = Math.max(best, shared / Math.max(w.length, t.length));
    }
    if (best < 0.35 && !intended.includes(w) && !intendedCompact.includes(w)) mangled.push(w);
  }
  if (mangled.length >= 3 && overlap < 0.85) {
    flags.push({ kind: 'mangled', words: mangled.slice(0, 6) });
  }
  if (il >= 4 && il < 18 && mangled.length >= 1 && overlap < 0.55) {
    flags.push({ kind: 'mangled', words: mangled.slice(0, 6) });
  }

  // High compact overlap → STT word-boundary noise, not prep/voice failure
  const sttNoiseOnly = overlap >= 0.85 && ratio >= 0.75 && !flags.some((f) => f.kind === 'allah_misread');

  const hardKinds = new Set(['missing_words', 'mangled', 'allah_misread']);
  const hard = flags.filter((f) => hardKinds.has(f.kind));
  const pass = sttNoiseOnly || (hard.length === 0 && (il < 4 || ratio >= 0.45));

  if (!pass && clip.prepared && bareLetters(clip.prepared) === intended) {
    flags.push({
      kind: overlap < 0.8 ? 'fish_stt_mismatch' : 'fish_stt_mismatch_candidate',
      detail: 'prepared letters correct; Whisper STT diverges from Fish Hakim audio',
    });
  }

  return {
    pass,
    intendedBare: intended.slice(0, 200),
    transcriptBare: heard.slice(0, 200),
    letterRatio: Number(ratio.toFixed(3)),
    compactOverlap: Number(overlap.toFixed(3)),
    missing: missing.slice(0, 10),
    extra: extra.slice(0, 10),
    flags,
    hardFail: !pass && hard.length > 0,
  };
}

async function fetchTts(text) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const provider = res.headers.get('x-tts-provider') || '';
  const voiceHdr = res.headers.get('x-tts-voice') || '';
  const voiceName = res.headers.get('x-tts-voice-name') || '';
  if (res.status === 200) {
    if (provider.toLowerCase() !== 'fish' || voiceHdr !== HAKIM_VOICE) {
      throw new Error(
        `TTS provider/voice mismatch: X-TTS-Provider=${provider} X-TTS-Voice=${voiceHdr} (expected fish / ${HAKIM_VOICE}, NOT Azure/Hamed)`
      );
    }
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, size: buf.length, provider, voice: voiceHdr, voiceName };
}

async function ensureMp3(clip) {
  mkdirSync(mp3Dir, { recursive: true });
  const file = join(mp3Dir, `${clip.hash}.mp3`);
  if (existsSync(file) && statSync(file).size > 800) {
    return {
      file,
      ttsOk: true,
      ttsStatus: 200,
      size: statSync(file).size,
      cached: true,
      provider: 'fish',
      voice: HAKIM_VOICE,
    };
  }
  if (!clip.ttsText || letterCount(clip.ttsText) < 2) {
    return { file: null, ttsOk: false, ttsStatus: 0, size: 0, cached: false, skip: true, reason: 'empty_tts' };
  }

  let attempt = 0;
  while (attempt < 6) {
    attempt += 1;
    try {
      const { status, buf, size, provider, voice } = await fetchTts(clip.ttsText);
      if (status === 429 || status === 503 || status === 502) {
        const wait = Math.min(90000, 8000 * attempt);
        console.warn(`  429/5xx on ${clip.id} — sleep ${wait}ms (try ${attempt})`);
        await sleep(wait);
        continue;
      }
      if (status === 200 && size > 800) {
        writeFileSync(file, buf);
        return { file, ttsOk: true, ttsStatus: status, size, cached: false, provider, voice };
      }
      return { file: null, ttsOk: false, ttsStatus: status, size, cached: false, provider, voice };
    } catch (e) {
      if (attempt < 6 && !String(e?.message || e).includes('mismatch')) {
        await sleep(5000 * attempt);
        continue;
      }
      return { file: null, ttsOk: false, ttsStatus: 0, size: 0, cached: false, err: String(e?.message || e) };
    }
  }
  return { file: null, ttsOk: false, ttsStatus: 429, size: 0, cached: false };
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  const results = new Array(items.length);
  async function runner() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return results;
}

function runWhisper(dir, model, outPath, { onlyMissing = false, existing = null } = {}) {
  return new Promise((resolve, reject) => {
    const py = join(root, '.venv/bin/python');
    const args = [
      join(root, 'scripts/whisper_transcribe.py'),
      '--dir',
      dir,
      '--model',
      model,
      '--out',
      outPath,
    ];
    if (onlyMissing) args.push('--resume');
    const child = spawn(py, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
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

function loadSttByHash(model) {
  const path = join(sttCacheDir, `raw_${model}.json`);
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const map = {};
  for (const r of raw.results || []) {
    map[r.id] = r;
  }
  return map;
}

function summarize(report) {
  const entries = Object.values(report.clips || {});
  const q = entries.filter((c) => c.phase === 'q');
  const opt = entries.filter((c) => c.phase === 'options');
  const judgedQ = q.filter((c) => c.transcript != null || c.skipped);
  const judgedOpt = opt.filter((c) => c.transcript != null || c.skipped);
  const failQ = judgedQ.filter((c) => c.pass === false);
  const failOpt = judgedOpt.filter((c) => c.pass === false);
  const broken = [...failQ, ...failOpt]
    .slice()
    .sort((a, b) => (a.letterRatio || 0) - (b.letterRatio || 0))
    .slice(0, 15)
    .map((c) => ({
      id: c.id,
      qid: c.qid,
      field: c.field,
      fish: String(c.fish || '').slice(0, 100),
      transcript: String(c.transcript || '').slice(0, 100),
      letterRatio: c.letterRatio,
      flags: c.flags,
    }));

  report.summary = {
    questionsTotal: all.length,
    qCompleted: judgedQ.length,
    qPass: judgedQ.filter((c) => c.pass).length,
    qFail: failQ.length,
    qTtsFail: q.filter((c) => c.ttsOk === false && !c.skip).length,
    optionsCompleted: judgedOpt.length,
    optionsPass: judgedOpt.filter((c) => c.pass).length,
    optionsFail: failOpt.length,
    optionsTtsFail: opt.filter((c) => c.ttsOk === false && !c.skip).length,
    brokenExamples: broken,
    version: versionInfo(),
    whisperModel: report.whisperModel || WHISPER_MODEL,
    provider: 'fish',
    voice: HAKIM_VOICE,
    voiceName: FISH_VOICE_NAME_AR,
    providerOk: entries.every(
      (c) => !c.ttsOk || c.skip || ((c.provider || 'fish') === 'fish' && (c.voice || HAKIM_VOICE) === HAKIM_VOICE)
    ),
  };
  report.phase = {
    q: { done: judgedQ.length, total: all.length, fail: failQ.length },
    options: {
      done: judgedOpt.length,
      total: entries.filter((c) => c.phase === 'options').length || null,
      fail: failOpt.length,
    },
  };
  return report.summary;
}

async function ttsPhase(clips, report) {
  console.log(`TTS ${clips.length} clips concurrency=${CONCURRENCY} pause=${PAUSE_MS}ms`);
  let done = 0;
  let cached = 0;
  let fetched = 0;
  let failed = 0;

  await runPool(clips, CONCURRENCY, async (clip, i) => {
    const prev = report.clips[clip.id];
    if (FORCE_TTS && prev?.mp3 && existsSync(prev.mp3)) {
      try {
        const { unlinkSync } = await import('fs');
        unlinkSync(prev.mp3);
      } catch {
        /* ignore */
      }
    }
    const hashFile = join(mp3Dir, `${clip.hash}.mp3`);
    if (FORCE_TTS && existsSync(hashFile)) {
      try {
        const { unlinkSync } = await import('fs');
        unlinkSync(hashFile);
      } catch {
        /* ignore */
      }
    }
    if (!FORCE_TTS && prev?.ttsOk && prev.hash === clip.hash && prev.mp3 && existsSync(prev.mp3)) {
      done += 1;
      cached += 1;
      // Refresh spoken/prepared if prepare changed but keep audio when hash matches
      report.clips[clip.id] = {
        ...prev,
        spoken: clip.spoken,
        prepared: clip.prepared,
        ttsText: clip.ttsText,
        fish: clip.fish,
        provider: prev.provider || 'fish',
        voice: prev.voice || HAKIM_VOICE,
      };
      return;
    }
    // Hash changed → need new TTS; drop stale transcript
    if (prev && prev.hash !== clip.hash) {
      delete prev.transcript;
      delete prev.mediumTranscript;
      delete prev.pass;
      delete prev.flags;
    }
    const res = await ensureMp3(clip);
    const entry = {
      ...(report.clips[clip.id] || {}),
      id: clip.id,
      phase: clip.phase,
      qid: clip.qid,
      field: clip.field,
      type: clip.type,
      book: clip.book,
      spoken: clip.spoken,
      prepared: clip.prepared,
      ttsText: clip.ttsText,
      fish: clip.fish,
      hash: clip.hash,
      mp3: res.file,
      ttsOk: res.ttsOk || !!res.skip,
      ttsStatus: res.ttsStatus,
      size: res.size,
      cached: res.cached,
      skip: !!res.skip,
      skipReason: res.reason || null,
      err: res.err || null,
      provider: res.provider || 'fish',
      voice: res.voice || HAKIM_VOICE,
    };
    if (res.skip) {
      entry.pass = true;
      entry.skipped = true;
      entry.transcript = '';
    }
    report.clips[clip.id] = entry;
    done += 1;
    if (res.cached) cached += 1;
    else if (res.ttsOk) fetched += 1;
    else if (!res.skip) failed += 1;

    if (done % 10 === 0 || done === clips.length) {
      summarize(report);
      saveReport(report);
      console.log(
        `  TTS progress ${done}/${clips.length} cached=${cached} fetched=${fetched} fail=${failed}`
      );
    }
    if (!res.cached && !res.skip) await sleep(PAUSE_MS);
  });

  // Persist clip index for whisper dir symlink-style listing
  mkdirSync(audioRoot, { recursive: true });
  const index = clips.map((c) => ({
    id: c.id,
    hash: c.hash,
    mp3: join(mp3Dir, `${c.hash}.mp3`),
    fish: c.fish,
  }));
  writeFileSync(clipsIndexPath, JSON.stringify({ n: index.length, clips: index }, null, 2));
  return { done, cached, fetched, failed };
}

/**
 * Materialize a flat dir of mp3s named by clip id (hardlink/copy from hash cache)
 * so whisper_transcribe can process them, then map transcripts back.
 */
async function materializeClipMp3s(clips, report) {
  const workDir = whisperWorkDir;
  mkdirSync(workDir, { recursive: true });
  // Clean old work links carefully — only our wav/mp3 stems
  const { readdirSync, unlinkSync, linkSync, copyFileSync } = await import('fs');
  for (const name of readdirSync(workDir)) {
    if (name.endsWith('.mp3')) {
      try {
        unlinkSync(join(workDir, name));
      } catch {
        /* ignore */
      }
    }
  }
  let n = 0;
  for (const clip of clips) {
    const entry = report.clips[clip.id];
    const src = entry?.mp3 || join(mp3Dir, `${clip.hash}.mp3`);
    if (!existsSync(src) || statSync(src).size < 800) continue;
    const dest = join(workDir, `${clip.id}.mp3`);
    try {
      linkSync(src, dest);
    } catch {
      copyFileSync(src, dest);
    }
    n += 1;
  }
  return { workDir, n };
}

async function sttPhase(clips, report) {
  mkdirSync(sttCacheDir, { recursive: true });
  const need = clips.filter((c) => {
    const e = report.clips[c.id];
    return e && e.ttsOk && !e.skip && e.mp3 && (!e.transcript || e.whisperModel !== WHISPER_MODEL);
  });

  // Already have transcripts for this model — rejudge only (same audio hash ⇒ same STT)
  if (need.length === 0) {
    console.log(`STT: all ${clips.length} clips already transcribed (${WHISPER_MODEL}) — rejudge only`);
    for (const clip of clips) {
      const entry = report.clips[clip.id];
      if (!entry) continue;
      if (entry.skip) {
        entry.pass = true;
        entry.skipped = true;
        continue;
      }
      const transcript = entry.mediumTranscript || entry.transcript || '';
      if (!transcript && entry.ttsOk) continue;
      const judgment = judgeClip(clip, transcript);
      Object.assign(entry, judgment);
      if (entry.mediumTranscript && judgment.pass) {
        entry.transcript = entry.mediumTranscript;
      }
    }
    summarize(report);
    saveReport(report);
    return;
  }

  // Also re-judge ones that already have transcript
  const { workDir, n } = await materializeClipMp3s(need, report);
  console.log(`Whisper model=${WHISPER_MODEL} on ${n} clips in ${workDir}`);
  if (n === 0) {
    console.log('No mp3s to transcribe');
    return;
  }

  const rawOut = join(sttCacheDir, `raw_${WHISPER_MODEL}.json`);
  await runWhisper(workDir, WHISPER_MODEL, rawOut);
  const byId = {};
  const raw = JSON.parse(readFileSync(rawOut, 'utf8'));
  for (const r of raw.results || []) byId[r.id] = r;

  // Merge into report
  for (const clip of clips) {
    const stt = byId[clip.id];
    const entry = report.clips[clip.id];
    if (!entry) continue;
    if (entry.skip) {
      entry.pass = true;
      entry.skipped = true;
      continue;
    }
    if (!stt) {
      // Keep prior transcript if present; rejudge
      if (entry.transcript) {
        Object.assign(entry, judgeClip(clip, entry.transcript));
      }
      continue;
    }
    const judgment = judgeClip(clip, stt.transcript || '');
    Object.assign(entry, {
      transcript: stt.transcript || '',
      whisperModel: WHISPER_MODEL,
      sttOk: !!stt.ok,
      ...judgment,
    });
  }
  summarize(report);
  saveReport(report);

  // Re-run stronger model on fails
  const fails = clips.filter((c) => report.clips[c.id]?.pass === false && report.clips[c.id]?.ttsOk);
  if (fails.length && WHISPER_FAIL_MODEL && WHISPER_FAIL_MODEL !== WHISPER_MODEL) {
    console.log(`Re-whisper fails (${fails.length}) with ${WHISPER_FAIL_MODEL}`);
    const { workDir: failDir, n: fn } = await materializeClipMp3s(fails, report);
    if (fn > 0) {
      const failOut = join(sttCacheDir, `raw_${WHISPER_FAIL_MODEL}_fails.json`);
      await runWhisper(failDir, WHISPER_FAIL_MODEL, failOut);
      const failRaw = JSON.parse(readFileSync(failOut, 'utf8'));
      for (const r of failRaw.results || []) {
        const entry = report.clips[r.id];
        const clip = fails.find((c) => c.id === r.id);
        if (!entry || !clip) continue;
        const judgment = judgeClip(clip, r.transcript || '');
        entry.mediumTranscript = r.transcript;
        entry.failWhisperModel = WHISPER_FAIL_MODEL;
        // Upgrade pass if stronger model recovers
        if (judgment.pass) {
          Object.assign(entry, judgment, { transcript: r.transcript, whisperModel: WHISPER_FAIL_MODEL });
        } else {
          Object.assign(entry, {
            ...judgment,
            transcript: entry.transcript,
            mediumTranscript: r.transcript,
            // keep fail but note both
            pass: false,
            hardFail: true,
          });
          // If both models mangle but prepared bare == tts bare → STT limitation
          if (
            bareLetters(clip.prepared) === bareLetters(clip.ttsText || clip.fish) &&
            judgment.letterRatio < 0.75
          ) {
            entry.flags = [
              ...(entry.flags || []),
              {
                kind: 'fish_stt_mismatch',
                detail: `prep letters correct; ${WHISPER_MODEL}+${WHISPER_FAIL_MODEL} mangle — Whisper vs Fish Hakim`,
              },
            ];
          }
        }
      }
      summarize(report);
      saveReport(report);
    }
  }
}

// ——— main ———
mkdirSync(mp3Dir, { recursive: true });
mkdirSync(sttCacheDir, { recursive: true });

const report = loadReport();
report.clips = report.clips || {};

const phases =
  phaseArg === 'both' ? ['q', 'options'] : phaseArg === 'options' ? ['options'] : ['q'];

if (COMPARE_ONLY || REJUDGE_ONLY) {
  if (REJUDGE_ONLY) {
    for (const entry of Object.values(report.clips || {})) {
      if (entry.skip) {
        entry.pass = true;
        continue;
      }
      const transcript = entry.mediumTranscript || entry.transcript || '';
      if (!transcript && !entry.ttsOk) continue;
      const judgment = judgeClip(
        {
          fish: entry.fish,
          prepared: entry.prepared,
          spoken: entry.spoken,
          id: entry.id,
          field: entry.field,
        },
        transcript
      );
      Object.assign(entry, judgment);
      if (entry.mediumTranscript && judgment.pass) {
        entry.transcript = entry.mediumTranscript;
      }
    }
  }
  const summary = summarize(report);
  saveReport(report);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.qFail > 0 || summary.optionsFail > 0 ? 1 : 0);
}

console.log(
  JSON.stringify(
    {
      mode: 'listen_stt_tawheed_ALL_hakim_v297',
      provider: 'fish',
      voice: HAKIM_VOICE,
      voiceName: FISH_VOICE_NAME_AR,
      book: BOOK_FILTER || 'all',
      bank: all.length,
      phases,
      concurrency: CONCURRENCY,
      pauseMs: PAUSE_MS,
      whisper: WHISPER_MODEL,
      whisperFail: WHISPER_FAIL_MODEL,
      base,
      report: reportPath,
      version: versionInfo(),
    },
    null,
    2
  )
);

for (const ph of phases) {
  let clips = buildClips(ph);
  clips = filterClips(clips, report);
  console.log(`\n=== PHASE ${ph}: ${clips.length} clips ===`);
  if (!RETRY_FAILS && !ID_FILTER.size) report[`planned_${ph}`] = clips.length;

  if (!STT_ONLY) {
    const ttsStats = await ttsPhase(clips, report);
    console.log('TTS done', ttsStats);
    summarize(report);
    saveReport(report);
  }

  if (!TTS_ONLY) {
    // Force re-whisper when retrying: clear transcripts for selected clips
    if (FORCE_TTS || RETRY_FAILS || ID_FILTER.size) {
      for (const c of clips) {
        const e = report.clips[c.id];
        if (!e) continue;
        delete e.transcript;
        delete e.mediumTranscript;
        delete e.whisperModel;
      }
    }
    await sttPhase(clips, report);
  }
}

const summary = summarize(report);
saveReport(report);
console.log('\n=== FINAL SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
console.log(`Report: ${reportPath}`);
process.exitCode = summary.qCompleted < all.length && phases.includes('q') ? 1 : 0;
