#!/usr/bin/env node
/**
 * Rewrite SPEECH_BY_QUESTION_ID fields whose WORDS ≠ bank display text.
 * Re-diacritizes from bank using phrase/word/lexicon + allah iʿrāb.
 * Also lifts weak-tashkeel entries that already match wording.
 *
 * Usage: node scripts/fix_speech_match_display.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mapPath = join(root, 'speech-diacritics-map.js');
const verifiedPath = join(root, 'scripts/verified-questions-speech.json');

const win = {};
new Function('window', readFileSync(mapPath, 'utf8'))(win);
try {
  new Function('window', readFileSync(join(root, 'speech-pronunciation-lexicon.js'), 'utf8'))(win);
} catch { /* optional */ }

const phraseMap = win.SPEECH_PHRASE_MAP || {};
const wordMap = win.SPEECH_WORD_MAP || {};
const lex = win.SPEECH_PRON_LEXICON || {};
const byId = { ...(win.SPEECH_BY_QUESTION_ID || {}) };

const bank = JSON.parse(
  readFileSync(join(root, 'questions-bank.js'), 'utf8').match(
    /window\.QUESTIONS_BANK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/
  )[1]
);
const all = Object.values(bank).flat();

const WORD_RE = /[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g;
const HARAKAT_RE = /[\u064B-\u065F\u0670]/;

function expandHonorifics(s) {
  return String(s || '')
    .replace(/\uFDFA/g, ' صلى الله عليه وسلم ')
    .replace(/\uFDFB/g, ' جل جلاله ')
    .replace(/صلعم/g, ' صلى الله عليه وسلم ')
    .replace(/\(ص\)/g, ' صلى الله عليه وسلم ');
}

function stripHarakat(s) {
  return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
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
    .replace(/[؟?!.،,;؛:«»"'“”‘’()[\]{}✓✗—–\-…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normKey(s) {
  return stripHarakat(s)
    .replace(/[^\u0621-\u064A\u0671\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function harakatRatio(s) {
  const letters = (String(s || '').match(/[\u0621-\u064A\u0671]/g) || []).length;
  const marks = (String(s || '').match(/[\u064B-\u065F\u0670]/g) || []).length;
  return letters ? marks / letters : 1;
}

function lettersOnly(s) {
  return norm(s).replace(/\s+/g, '');
}

/** Overlay harakat only — never change the bank's consonants/words. */
function markToken(tok) {
  if (!/[\u0621-\u064A\u0671]/.test(tok)) return tok;
  if (HARAKAT_RE.test(tok)) return tok;
  if (tok === 'ﷺ' || tok === '\uFDFA') return tok;
  const bare = stripHarakat(tok);
  for (const cand of [lex[bare], wordMap[bare]]) {
    if (!cand) continue;
    if (lettersOnly(cand) === lettersOnly(bare) || norm(cand) === norm(bare)) return cand;
  }
  return tok;
}

/** Preserve ﷺ in source; expand only for Fish later in sanitize. Keep bank words. */
function diacritizeFromBank(text) {
  let raw = String(text || '').trim();
  if (!raw) return '';
  const key = normKey(raw);
  let out = '';
  // Phrase map only if wording matches display exactly (norm).
  if (phraseMap[key] && norm(phraseMap[key]) === norm(raw)) {
    out = String(phraseMap[key]).trim();
  } else {
    for (const [, pv] of Object.entries(phraseMap)) {
      if (norm(pv) === norm(raw)) {
        out = String(pv).trim();
        break;
      }
    }
  }
  if (!out || norm(out) !== norm(raw)) {
    out = raw.replace(WORD_RE, markToken);
  }
  // Prefer compound لَوْلَا when bank writes «لولا».
  if (/\bلولا\b/.test(stripHarakat(raw))) {
    out = out
      .replace(/لَوْ\s+لَا/g, 'لَوْلَا')
      .replace(/لو\s+لا/g, 'لَوْلَا')
      .replace(/\bلولا\b/g, (m) => (HARAKAT_RE.test(m) ? m : 'لَوْلَا'));
  }
  out = out.replace(/مَا\s+عَبْد(?![َُِّْ])/g, 'مَا عُبِدَ');
  out = out.replace(/مَا\s+عَبَد(?![َُِّْ])/g, 'مَا عُبِدَ');
  const fixed = fixAllahIrabInText(out);
  // allah-irab must not invent words — fall back if wording drifts.
  return norm(fixed) === norm(raw) ? fixed : out;
}

/** Known high-quality overrides (display words + correct iʿrāb). */
const MANUAL_Q = {
  '07483021-8f6a-44c8-9f32-1040d095f0c5': {
    q: "حَقُّ اللَّهِ عَلَى الْعِبَادِ هُوَ عِبَادَتُهُ وَعَدَمُ الشِّرْكِ بِهِ.",
  },
};

let wordingFixed = 0;
let weakFixed = 0;
let manualFixed = 0;

for (const q of all) {
  if (!q?.id) continue;
  const entry = { ...(byId[q.id] || {}) };
  const manual = MANUAL_Q[q.id] || {};

  const fixField = (field, bankText) => {
    const raw = String(bankText || '').trim();
    if (!raw) return;
    if (manual[field]) {
      entry[field] = manual[field];
      manualFixed += 1;
      return;
    }
    const cur = entry[field];
    const needsWording = !cur || norm(cur) !== norm(raw);
    const needsWeak =
      cur &&
      norm(cur) === norm(raw) &&
      raw.replace(/[^\u0621-\u064A]/g, '').length >= 8 &&
      harakatRatio(cur) < 0.22;
    // Bank «لولا» must stay one token in speech (not «لو لا»).
    const needsLola =
      cur &&
      /\bلولا\b/.test(stripHarakat(raw)) &&
      /لو\s+لا|لَوْ\s+لَا/.test(cur);
    if (!needsWording && !needsWeak && !needsLola) return;
    const next = diacritizeFromBank(raw);
    if (!next) return;
    if (norm(next) !== norm(raw)) {
      entry[field] = raw.replace(WORD_RE, markToken);
      if (/\bلولا\b/.test(stripHarakat(raw))) {
        entry[field] = entry[field]
          .replace(/لَوْ\s+لَا/g, 'لَوْلَا')
          .replace(/لو\s+لا/g, 'لَوْلَا')
          .replace(/\bلولا\b/g, 'لَوْلَا');
      }
    } else {
      entry[field] = next;
    }
    if (needsLola && !/لَوْلَا/.test(entry[field])) {
      entry[field] = String(entry[field])
        .replace(/لَوْ\s+لَا/g, 'لَوْلَا')
        .replace(/لو\s+لا/g, 'لَوْلَا');
    }
    if (needsWording) wordingFixed += 1;
    else if (needsLola) wordingFixed += 1;
    else weakFixed += 1;
  };

  fixField('q', q.question_text);
  if (q.type === 'mc' && Array.isArray(q.options)) {
    q.options.forEach((opt, i) => fixField(`a${i}`, opt));
  }
  // Do not force quote/exp into spoken question path; still keep map aligned if present.
  if (q.explanation) fixField('exp', q.explanation);
  if (q.source_quote) fixField('quote', q.source_quote);

  byId[q.id] = entry;
}

// Patch SPEECH_BY_QUESTION_ID in speech-diacritics-map.js
const mapSrc = readFileSync(mapPath, 'utf8');
const marker = 'window.SPEECH_BY_QUESTION_ID = ';
const idx = mapSrc.indexOf(marker);
if (idx < 0) throw new Error('SPEECH_BY_QUESTION_ID not found');
const start = mapSrc.indexOf('{', idx);
let depth = 0;
let end = -1;
let inStr = false;
let quote = '';
let esc = false;
for (let i = start; i < mapSrc.length; i++) {
  const c = mapSrc[i];
  if (inStr) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === quote) inStr = false;
    continue;
  }
  if (c === '"' || c === "'") {
    inStr = true;
    quote = c;
    continue;
  }
  if (c === '{') depth += 1;
  else if (c === '}') {
    depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
if (end < 0) throw new Error('failed to find end of SPEECH_BY_QUESTION_ID');

const newBlock = `${marker}${JSON.stringify(byId, null, 2)}`;
const out = mapSrc.slice(0, idx) + newBlock + mapSrc.slice(end);
writeFileSync(mapPath, out);

if (existsSync(verifiedPath)) {
  const verified = JSON.parse(readFileSync(verifiedPath, 'utf8'));
  for (const id of Object.keys(byId)) {
    verified[id] = { ...(verified[id] || {}), ...byId[id] };
  }
  writeFileSync(verifiedPath, JSON.stringify(verified, null, 2) + '\n');
}

console.log(
  JSON.stringify(
    {
      wordingFixed,
      weakFixed,
      manualFixed,
      totalIds: Object.keys(byId).length,
    },
    null,
    2
  )
);
