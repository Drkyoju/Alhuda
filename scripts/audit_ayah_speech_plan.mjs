#!/usr/bin/env node
/**
 * Adversarial audit: ayah-linked questions (verse map + bank markers).
 * Checks Fish Q (no ayah) → Hudhaify → Fish answers; MC speech ≡ bank.
 *
 *   node scripts/audit_ayah_speech_plan.mjs
 *   node scripts/audit_ayah_speech_plan.mjs --json
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');

function loadWindowJs(name) {
  const win = {};
  new Function('window', readFileSync(join(root, name), 'utf8'))(win);
  return win;
}

const verseWin = loadWindowJs('question-verse-map.js');
const ayahWin = loadWindowJs('ayah-snippet-map.js');
const speechWin = loadWindowJs('speech-diacritics-map.js');

const QUESTION_VERSE_MAP = verseWin.QUESTION_VERSE_MAP || {};
const AYAH_SNIPPET_MAP = ayahWin.AYAH_SNIPPET_MAP || {};
const SPEECH_BY_QUESTION_ID = speechWin.SPEECH_BY_QUESTION_ID || {};

const bankRaw = readFileSync(join(root, 'questions-bank.js'), 'utf8');
const bank = JSON.parse(bankRaw.match(/window\.QUESTIONS_BANK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)[1]);
const allQs = Object.values(bank).flat();
const byId = Object.fromEntries(allQs.map((q) => [q.id, q]));

const appJs = readFileSync(join(root, 'app.js'), 'utf8');

function expandHonorifics(s) {
  return String(s || '')
    .replace(/\uFDFA/g, ' صلى الله عليه وسلم ')
    .replace(/\uFDFB/g, ' جل جلاله ')
    .replace(/صلعم/g, ' صلى الله عليه وسلم ')
    .replace(/\(ص\)/g, ' صلى الله عليه وسلم ');
}

function norm(s) {
  return expandHonorifics(s)
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\bلو\s+لا\b/g, 'لولا')
    .replace(/[؟?!.،,;؛:«»"'“”‘’()[\]{}﴿﴾✓✗—–\-…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArabicForMatch(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupKnownVerseKey(snippet) {
  const n = normalizeArabicForMatch(snippet);
  if (!n || n.length < 8) return null;
  if (AYAH_SNIPPET_MAP[n]) return AYAH_SNIPPET_MAP[n];
  for (const [key, verseKey] of Object.entries(AYAH_SNIPPET_MAP)) {
    const nk = normalizeArabicForMatch(key);
    if (!nk || nk.length < 10) continue;
    if (n === nk) return verseKey;
    if (nk.length >= 12 && n.includes(nk)) return verseKey;
    if (n.length >= 18 && nk.includes(n)) return verseKey;
  }
  return null;
}

function extractAyahSnippets(text) {
  const snippets = [];
  const src = text || '';
  for (const m of src.matchAll(/\(([^)]{8,})\)/g)) snippets.push(m[1].trim());
  for (const m of src.matchAll(/"([^"]{8,})"/g)) snippets.push(m[1].trim());
  for (const m of src.matchAll(/«([^»]{8,})»/g)) snippets.push(m[1].trim());
  return snippets;
}

function findVerseKeysSync(text) {
  const keys = new Set();
  for (const snippet of extractAyahSnippets(text)) {
    const key = lookupKnownVerseKey(snippet);
    if (key) keys.add(key);
  }
  const bare = normalizeArabicForMatch(text);
  if (bare.length >= 16) {
    const sorted = Object.keys(AYAH_SNIPPET_MAP).sort((a, b) => b.length - a.length);
    for (const snip of sorted) {
      const nk = normalizeArabicForMatch(snip);
      if (nk.length < 16) continue;
      if (bare.includes(nk)) {
        keys.add(AYAH_SNIPPET_MAP[snip]);
        break;
      }
    }
  }
  return [...keys];
}

function harakatTolerantArabicRe(bareNormalized) {
  const n = String(bareNormalized || '').trim();
  if (n.length < 10) return null;
  const parts = [];
  for (const ch of n) {
    if (/\s/.test(ch)) {
      parts.push('[\\s\\u064B-\\u065F\\u0670]*');
      continue;
    }
    if (!/[\u0621-\u064A\u0671]/.test(ch)) continue;
    let alts = ch;
    if (ch === 'ا') alts = '[اأإآٱ]';
    else if (ch === 'ه') alts = '[هة]';
    else if (ch === 'ي') alts = '[يى]';
    parts.push(`${alts}[\\u064B-\\u065F\\u0670\\u0640]*`);
  }
  if (parts.length < 6) return null;
  return new RegExp(parts.join(''), 'g');
}

function stripKnownAyahSnippetsForSpeech(text) {
  let s = String(text || '');
  if (!s.trim()) return '';
  const snippets = Object.keys(AYAH_SNIPPET_MAP).sort((a, b) => b.length - a.length);
  for (const snippet of snippets) {
    const bare = normalizeArabicForMatch(snippet);
    if (bare.length < 10) continue;
    const re = harakatTolerantArabicRe(bare);
    if (!re) continue;
    s = s.replace(re, ' ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

function removeQuranicVersesForSpeech(text) {
  let s = (text || '').trim();
  if (!s) return '';
  s = s.replace(/﴿[\s\S]*?﴾/g, ' ');
  s = s.replace(/\[[^\]]*سورة[^\]]*\]/gi, ' ');
  const dropIfKnown = (inner) => Boolean(lookupKnownVerseKey(inner));
  s = s.replace(/\(\s*([^)]{10,})\s*\)/g, (m, inner) => (dropIfKnown(inner) ? ' ' : m));
  s = s.replace(/"([^"]{10,})"/g, (m, inner) => (dropIfKnown(inner) ? ' ' : m));
  s = s.replace(/«([^»]{10,})»/g, (m, inner) => (dropIfKnown(inner) ? ' ' : m));
  return s.replace(/\s+/g, ' ').trim();
}

function speechTextFor(q, field, raw) {
  const hit = SPEECH_BY_QUESTION_ID[q?.id]?.[field];
  const original = String(raw || '').trim();
  let base = String(hit || '').trim();
  if (base && original && norm(base) !== norm(original)) base = original;
  else if (!base) base = original;
  return base;
}

function contentBlob(q) {
  return [q.question_text, q.explanation, q.source_quote, ...(Array.isArray(q.options) ? q.options : [])]
    .filter(Boolean)
    .join(' ');
}

function ayahMarkerInBank(q) {
  const blob = contentBlob(q);
  return /﴿|قال\s+(الله\s+)?تعالى|قوله\s+تعالى/.test(blob) || findVerseKeysSync(blob).length > 0;
}

function primaryVerseKey(q) {
  return QUESTION_VERSE_MAP[q.id] || findVerseKeysSync(contentBlob(q))[0] || null;
}

const mapIds = new Set(Object.keys(QUESTION_VERSE_MAP));
const bankMarkerIds = new Set();
for (const q of allQs) {
  if (ayahMarkerInBank(q) || mapIds.has(q.id)) bankMarkerIds.add(q.id);
}

const allAyahIds = new Set([...mapIds, ...bankMarkerIds]);
const failures = [];
const warnings = [];
const checked = [];

function fail(id, kind, detail) {
  failures.push({ id, kind, detail });
}
function warn(id, kind, detail) {
  warnings.push({ id, kind, detail });
}

for (const id of [...allAyahIds].sort()) {
  const q = byId[id];
  const inMap = mapIds.has(id);
  if (!q) {
    fail(id, 'orphan-verse-map', { verseKey: QUESTION_VERSE_MAP[id] });
    continue;
  }

  const verseKey = primaryVerseKey(q);
  const speech = SPEECH_BY_QUESTION_ID[id] || {};
  const qSpeech = speechTextFor(q, 'q', q.question_text);
  const qProseRaw = String(qSpeech || q.question_text || '')
    .replace(/﴿[^﴾]*﴾/g, ' ')
    .replace(/「[^」]*」/g, ' ');
  let afterRemove = removeQuranicVersesForSpeech(qProseRaw);
  let afterStrip = verseKey ? stripKnownAyahSnippetsForSpeech(afterRemove) : afterRemove;

  const expectHudhaify = Boolean(verseKey);

  const leftoverSnippets = [];
  const afterNorm = normalizeArabicForMatch(afterStrip);
  if (expectHudhaify) {
    for (const snip of Object.keys(AYAH_SNIPPET_MAP)) {
      const sn = normalizeArabicForMatch(snip);
      if (sn.length < 16) continue;
      if (afterNorm.includes(sn)) leftoverSnippets.push(snip.slice(0, 60));
    }
    if (/﴿/.test(afterStrip)) leftoverSnippets.push('ornate-brackets');
  }

  if (leftoverSnippets.length) {
    fail(id, 'ayah-leaked-into-fish-q', {
      verseKey,
      leftovers: leftoverSnippets,
      fishQ: afterStrip.slice(0, 160),
    });
  }

  const fishQEmpty = !afterStrip || afterStrip.replace(/[^\u0621-\u064A]/g, '').length < 3;
  if (fishQEmpty && !expectHudhaify) {
    fail(id, 'empty-fish-q-no-hudhaify', { verseKey, q: q.question_text?.slice(0, 80) });
  }
  if (fishQEmpty && expectHudhaify) {
    warn(id, 'fish-q-empty-hudhaify-only', { verseKey });
  }

  if (q.type === 'mc' && Array.isArray(q.options)) {
    q.options.forEach((opt, i) => {
      const sp = speech[`a${i}`];
      const bankOpt = String(opt || '').trim();
      if (!bankOpt) return;
      if (!sp) {
        fail(id, 'mc-speech-missing', { field: `a${i}`, bank: bankOpt });
        return;
      }
      if (norm(sp) !== norm(bankOpt)) {
        fail(id, 'mc-speech-mismatch', { field: `a${i}`, bank: bankOpt, speech: sp });
      }
    });
  }

  if (speech.q && norm(speech.q) !== norm(q.question_text)) {
    fail(id, 'q-speech-mismatch', { bank: q.question_text, speech: speech.q });
  }

  checked.push({
    id,
    type: q.type,
    verseKey,
    inMap,
    expectHudhaify,
    fishQEmpty,
    plan: expectHudhaify
      ? ['fish-q', 'hudhaify', q.type === 'mc' || q.type === 'tf' ? 'fish-answers' : 'none']
      : ['fish-q', 'fish-answers'],
  });
}

const silentRisks = [];
function noteRisk(id, severity, detail) {
  silentRisks.push({ id, severity, detail });
}

if (/__alhudaBakedTtsOnly\s*===\s*true/.test(appJs) && /tts baked miss/.test(appJs)) {
  noteRisk('baked-tts-only-miss', 'medium', 'Baked-only mode throws baked miss; soft-fail may skip toast → silent clip.');
}
if (/res\.status\s*===\s*429/.test(appJs)) {
  noteRisk('tts-429-retry', 'medium', '429/502/503 retries 3x then fail — option can stay silent after Hudhaify.');
}
if (/Last resort: still never Fish-speak ayah/.test(appJs)) {
  noteRisk('last-resort-ayah-stripped', 'info', 'Last-resort Q fallback strips known ayah snippets when Hudhaify will recite.');
} else if (/Last resort: raw bank/.test(appJs)) {
  noteRisk('last-resort-raw-q-may-speak-ayah', 'high', 'speakQuestion catch may reintroduce ayah wording.');
}
if (/const oClean = prepareTtsPayload\(opt\)[\s\S]*?if\s*\(!oClean\)\s*continue/m.test(appJs)) {
  noteRisk('empty-option-skipped', 'medium', 'Empty prepareTtsPayload for option → continue (silent answer slot).');
}
if (/Soft-warm at most 2 answers/.test(appJs)) {
  noteRisk('warm-only-2-answers', 'low', 'Only first 2 MC options prefetched; 3–4 more exposed to live TTS 429.');
}

const speakFn = appJs.slice(appJs.indexOf('function speakQuestion('), appJs.indexOf('function applyOfflineVoicePolicy'));
const iQ = speakFn.indexOf('// 1) Question prose');
const iH = speakFn.indexOf('awaitHudhaifyThenContinue');
const iA = speakFn.indexOf('// Answers — every visible option');
const speakOrderOk = iQ >= 0 && iH > iQ && iA > iH;
if (!speakOrderOk) {
  fail('_runtime_', 'speakQuestion-order-wrong', { iQ, iH, iA });
}

const orphans = [...mapIds].filter((id) => !byId[id]);
for (const id of orphans) fail(id, 'orphan-verse-map', { verseKey: QUESTION_VERSE_MAP[id] });

const report = {
  ayahLinkedCount: checked.length,
  fromVerseMap: mapIds.size,
  orphans: orphans.length,
  checked: checked.length,
  failures: failures.length,
  warnings: warnings.length,
  silentRisks,
  failureDetails: failures,
  warningDetails: warnings.slice(0, 30),
  speakOrderOk,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `ayahLinked=${report.ayahLinkedCount} map=${report.fromVerseMap} orphans=${report.orphans} failures=${report.failures} warnings=${report.warnings} speakOrderOk=${speakOrderOk}`
  );
  console.log('\n--- failures ---');
  for (const f of failures) {
    console.log(`[${f.kind}] ${f.id}`);
    console.log(' ', JSON.stringify(f.detail).slice(0, 240));
  }
  console.log('\n--- warnings ---');
  for (const w of warnings.slice(0, 20)) {
    console.log(`[${w.kind}] ${w.id}`, JSON.stringify(w.detail).slice(0, 120));
  }
  console.log('\n--- silent risks ---');
  for (const r of silentRisks) console.log(`[${r.severity}] ${r.id}: ${r.detail}`);
}

if (failures.length) process.exitCode = 1;
