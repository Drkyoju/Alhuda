#!/usr/bin/env node
/** Fix الله i'rab in speech map files and remove blind اللّٰه word-map entry. */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fixStringValue(s) {
  if (!s || typeof s !== 'string') return s;
  if (!/ل/.test(s)) return s;
  return fixAllahIrabInText(s);
}

function fixObjectDeep(obj) {
  if (typeof obj === 'string') return fixStringValue(obj);
  if (Array.isArray(obj)) return obj.map(fixObjectDeep);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'الله') continue;
      out[k] = fixObjectDeep(v);
    }
    return out;
  }
  return obj;
}

function loadJsMaps(rel) {
  const src = readFileSync(join(root, rel), 'utf8');
  const window = {};
  const fn = new Function('window', `${src}; return { SPEECH_PHRASE_MAP: window.SPEECH_PHRASE_MAP, SPEECH_WORD_MAP: window.SPEECH_WORD_MAP, SPEECH_BY_QUESTION_ID: window.SPEECH_BY_QUESTION_ID };`);
  return fn(window);
}

function patchMaps(rel, isCore) {
  const data = loadJsMaps(rel);
  const phraseMap = fixObjectDeep(data.SPEECH_PHRASE_MAP);
  const wordMap = fixObjectDeep(data.SPEECH_WORD_MAP);
  const byQ = fixObjectDeep(data.SPEECH_BY_QUESTION_ID);
  delete wordMap.الله;
  let out =
    `/** ${isCore ? 'Core speech maps' : 'Auto-generated'} — node scripts/fix_allah_irab_in_maps.mjs */\n` +
    `window.SPEECH_PHRASE_MAP = ${JSON.stringify(phraseMap, null, 2)};\n` +
    `window.SPEECH_WORD_MAP = ${JSON.stringify(wordMap, null, 2)};\n` +
    `window.SPEECH_BY_QUESTION_ID = ${JSON.stringify(byQ, null, 2)};\n`;
  if (isCore) out += 'window.SPEECH_MAPS_CORE = true;\n';
  writeFileSync(join(root, rel), out);
  return { phraseMap, byQ };
}

const full = patchMaps('speech-diacritics-map.js', false);
console.log('speech-diacritics-map.js:', Object.keys(full.phraseMap).length, 'phrases,', Object.keys(full.byQ).length, 'questions');
patchMaps('speech-diacritics-core.js', true);
console.log('speech-diacritics-core.js: fixed');

const vqPath = join(root, 'scripts/verified-questions-speech.json');
if (existsSync(vqPath)) {
  const raw = JSON.parse(readFileSync(vqPath, 'utf8'));
  writeFileSync(vqPath, JSON.stringify(fixObjectDeep(raw), null, 2) + '\n');
  console.log('verified-questions-speech.json: fixed');
}

console.log('Done — fixAllahIrabInText applied; wordMap["الله"] removed.');
