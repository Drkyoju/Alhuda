#!/usr/bin/env node
/**
 * Fill missing SPEECH_BY_QUESTION_ID entries for questions-bank.json using
 * existing phrase/word/lexicon maps (no Gemini required).
 *
 * Merges into scripts/verified-questions-speech.json — never overwrites
 * an existing field that already has tashkeel.
 *
 * Usage:
 *   node scripts/fill_bank_speech_from_maps.mjs
 *   node scripts/build_speech_diacritics_map.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'scripts/verified-questions-speech.json');

const win = {};
new Function('window', readFileSync(join(root, 'speech-diacritics-map.js'), 'utf8'))(win);
const phraseMap = win.SPEECH_PHRASE_MAP || {};
const wordMap = win.SPEECH_WORD_MAP || {};

const lexWin = {};
try {
  new Function('window', readFileSync(join(root, 'speech-pronunciation-lexicon.js'), 'utf8'))(lexWin);
} catch {
  /* optional */
}
const lex = lexWin.SPEECH_PRON_LEXICON || {};

const bank = JSON.parse(readFileSync(join(root, 'questions-bank.json'), 'utf8'));
const all = Array.isArray(bank) ? bank : Object.values(bank).flat();

const WORD_RE = /[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g;
const HARAKAT_RE = /[\u064B-\u065F\u0670]/;
const stripHarakat = (s) => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');

function normKey(s) {
  return stripHarakat(s)
    .replace(/[^\u0621-\u064A\u0671\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function diacritize(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const key = normKey(raw);
  if (phraseMap[key]) return String(phraseMap[key]).trim();
  const out = raw.replace(WORD_RE, (tok) => {
    if (HARAKAT_RE.test(tok)) return tok;
    const bare = stripHarakat(tok);
    return lex[bare] || wordMap[bare] || tok;
  });
  return fixAllahIrabInText(out);
}

function hasTashkeel(s) {
  return HARAKAT_RE.test(String(s || ''));
}

const result = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
let addedQs = 0;
let addedFields = 0;
let skippedExisting = 0;

for (const q of all) {
  if (!q?.id) continue;
  const entry = { ...(result[q.id] || {}) };
  const before = Object.keys(entry).length;

  const put = (field, raw) => {
    const v = String(raw || '').trim();
    if (!v) return;
    if (entry[field] && hasTashkeel(entry[field])) {
      skippedExisting += 1;
      return;
    }
    const speech = diacritize(v);
    if (!speech) return;
    // Prefer forms that gained at least some marks; bare-only still helps bake keys match runtime.
    entry[field] = speech;
    addedFields += 1;
  };

  put('q', q.question_text);
  (q.options || []).forEach((opt, i) => put(`a${i}`, opt));
  put('exp', q.explanation);
  put('quote', q.source_quote);

  if (Object.keys(entry).length) {
    if (!before) addedQs += 1;
    result[q.id] = entry;
  }
}

writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(
  `Filled bank speech → ${OUT}\n` +
    `  questions touched (new ids): ${addedQs}\n` +
    `  fields written: ${addedFields}\n` +
    `  existing fields kept: ${skippedExisting}\n` +
    `  total verified ids: ${Object.keys(result).length}\n` +
    `Next: node scripts/build_speech_diacritics_map.mjs`
);
