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

function scrubSpeechDiacriticsNoise(text) {
  let s = String(text || '');
  if (!s) return '';
  // Match prepareArabicForSpeech — tatweel/ZWNJ must not diverge bake keys from runtime.
  s = s.replace(/[\u0640\u200c\u200f]/g, '');
  // Orphan marks AFTER spaces only — never strip mid-word harakat (shadda+fatha).
  s = s.replace(/ +[\u064B-\u065F\u0670]+/g, ' ');
  s = s.split('َّمَنْ').join('مَنْ');
  s = s.split('َّوَمَنْ').join('وَمَنْ');
  s = s.split('عُبِدَ').join('عَبْد');
  const prep = [
    ['مَنْ دُون', 'مِنْ دُون'],
    ['مَنْ غَيْر', 'مِنْ غَيْر'],
    ['مَنْ أَهْل', 'مِنْ أَهْل'],
    ['مَنْ بَعْد', 'مِنْ بَعْد'],
    ['مَنْ قَبْل', 'مِنْ قَبْل'],
    ['مَنْ بَيْن', 'مِنْ بَيْن'],
    ['مَنْ عِنْد', 'مِنْ عِنْد'],
    ['يُخْرِجُ مَنْ', 'يُخْرِجُ مِنْ'],
    ['يَخْرُجُ مَنْ', 'يَخْرُجُ مِنْ'],
    ['مَنْ الْمِلَّة', 'مِنْ الْمِلَّة'],
    ['مَنْ الْعِبَاد', 'مِنْ الْعِبَاد'],
    ['مَنْ الْخَلْق', 'مِنْ الْخَلْق'],
    ['مَنْ الذُّنُوب', 'مِنْ الذُّنُوب'],
    ['مَنْ الْكَبَائِر', 'مِنْ الْكَبَائِر'],
    ['مَنْ أَعْظَم', 'مِنْ أَعْظَم'],
    ['مَنْ أَمْثِلَة', 'مِنْ أَمْثِلَة'],
    ['مَنْ أَرْكَان', 'مِنْ أَرْكَان'],
    ['مَنْ تَمَام', 'مِنْ تَمَام'],
    ['مَنْ شُرُوط', 'مِنْ شُرُوط'],
    ['مَنْ أَنْوَاع', 'مِنْ أَنْوَاع'],
    ['مَنْ أَقْسَام', 'مِنْ أَقْسَام'],
    ['لَا يُقْبَلُ مَنْ', 'لَا يُقْبَلُ مِنْ'],
    ['يُقْبَلُ مَنْ', 'يُقْبَلُ مِنْ'],
    ['تَعْبُدُ اللَّهِ', 'تَعْبُدُ اللَّهَ'],
    ['يَعْبُدُ اللَّهِ', 'يَعْبُدُ اللَّهَ'],
    ['نَعْبُدُ اللَّهِ', 'نَعْبُدُ اللَّهَ'],
    ['يَعْبُدَ اللَّهِ', 'يَعْبُدَ اللَّهَ'],
    ['تَعْبُدَ اللَّهِ', 'تَعْبُدَ اللَّهَ'],
  ];
  for (const [a, b] of prep) s = s.split(a).join(b);
  return s.replace(/\s+/g, ' ').trim();
}

function stripForTts(text) {
  // Must stay in sync with app.js sanitizeTtsText — otherwise baked keys miss at runtime.
  return scrubSpeechDiacriticsNoise(
    String(text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, ' ')
      .replace(/\uFDFA/g, ' صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ ')
      .replace(/\uFDFB/g, ' جَلَّ جَلَالُهُ ')
      .replace(/[\u00AB\u00BB\u2018-\u201F\u2039\u203A\u300C-\u300F\u301D\u301E\uFF02\uFF07«»"'“”‘’‹›「」『』„‚]/g, ' ')
      .replace(/[﴿﴾]/g, ' ')
      .replace(/[.؟!…,:：;؛،()\[\]{}*_#<>=+~^`\/\\|–—•·\-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function normalizeForBake(text) {
  // Mirror app.js prepareTtsPayload for map strings (well-formed tashkeel path):
  // fixAllah → strip tatweel → sanitize (punct + scrub). Order matters for bake keys.
  let s = String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s.length < 2) return '';
  s = fixAllahIrabInText(s);
  s = s.replace(/[\u0640\u200c\u200f]/g, '').replace(/\s+/g, ' ').trim();
  s = stripForTts(s);
  if (!s || s.length < 2) return '';
  return s;
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
