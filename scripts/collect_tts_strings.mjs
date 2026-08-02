#!/usr/bin/env node
/** Collect every unique string the app may send to TTS (speech maps + common UI). */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';
import { normalizeForElevenLabs } from '../elevenlabs-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Must match app.js TTS_VOICE + TTS_CACHE_VER when baking. */
export const BAKE_TTS_CACHE_VER = 'v30';
/** Fish Audio Arabic narrator (راوي). */
export const BAKE_TTS_VOICE = 'c3e5d81d807f4cbc9a0c2872a4dea9ea';
export const BAKE_TTS_VOICE_LABEL = 'Fish Audio Arabic narrator (راوي)';

export function loadSpeechMaps() {
  const window = {};
  const fn = new Function('window', readFileSync(join(root, 'speech-diacritics-map.js'), 'utf8'));
  fn(window);
  return window;
}

function stripForTts(text) {
  return String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, ' ')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForBake(text) {
  const s = stripForTts(text);
  if (!s || s.length < 2) return '';
  return normalizeForElevenLabs(fixAllahIrabInText(s));
}

export function collectTtsStrings() {
  const maps = loadSpeechMaps();
  const out = new Set();

  const add = (raw) => {
    const s = normalizeForBake(raw);
    if (s && s.length >= 2) out.add(s);
  };

  for (const v of Object.values(maps.SPEECH_PHRASE_MAP || {})) add(v);
  for (const fields of Object.values(maps.SPEECH_BY_QUESTION_ID || {})) {
    for (const v of Object.values(fields || {})) add(v);
  }

  add('صَحّ');
  add('خَطَأٌ');
  add('الْإِجَابَةُ الصَّحِيحَةُ');
  // Live API smoke (tests/api-live.spec.js) — bake exact raw string too.
  out.add('السلام عليكم');
  // Standalone الله-family forms only when already baked (CI coverage stays green).
  // Full phrases containing these forms are already in speech maps above.

  return [...out].sort((a, b) => a.length - b.length);
}

export function bakedTtsKey(text, voice = BAKE_TTS_VOICE, cacheVer = BAKE_TTS_CACHE_VER) {
  return `${cacheVer}::${voice}::${String(text || '').slice(0, 600)}`;
}

export function bakedTtsFileNameSync(text, voice = BAKE_TTS_VOICE, cacheVer = BAKE_TTS_CACHE_VER) {
  return createHash('sha256').update(bakedTtsKey(text, voice, cacheVer)).digest('hex') + '.mp3';
}

export function bakedTtsHashFromKey(cacheKey) {
  return createHash('sha256').update(String(cacheKey || '')).digest('hex') + '.mp3';
}
