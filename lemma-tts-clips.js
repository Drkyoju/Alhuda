/**
 * Pre-recorded Fish Hakim clips for lemmas Fish cannot pronounce reliably live.
 * Matched on bare Arabic of the client request (UI bare, map iʿrāb, or carrier).
 * UI display is unchanged — only /api/tts audio is overridden.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareArabicKey } from './short-speech-carriers.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLIP_DIR = path.join(ROOT, 'tts-lemma-clips');
const MANIFEST_PATH = path.join(CLIP_DIR, 'manifest.json');

let cached = null;
/** @type {Map<string, string> | null} bareKey → clip bare key in manifest */
let aliasIndex = null;

function loadManifest() {
  if (cached) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    cached = raw?.clips && typeof raw.clips === 'object' ? raw : { clips: {} };
  } catch {
    cached = { clips: {} };
  }
  return cached;
}

function buildAliasIndex() {
  if (aliasIndex) return aliasIndex;
  const man = loadManifest();
  const idx = new Map();
  const add = (from, toBare) => {
    const k = bareArabicKey(from);
    if (k) idx.set(k, toBare);
  };
  for (const [bare, hit] of Object.entries(man.clips || {})) {
    add(bare, bare);
    if (hit.bare) add(hit.bare, bare);
    if (hit.spoken) add(hit.spoken, bare);
    if (hit.file) {
      /* file not used as key */
    }
  }
  // Common UI / map forms that prepareFishTtsText or speech-diacritics-map emit
  add('ذباب', 'ذباب');
  add('ذُبَابٍ', 'ذباب');
  add('ذُبَابٌ', 'ذباب');
  add('الذباب', 'ذباب');
  add('أعني حشرة تسمى الذباب', 'ذباب');
  add('أعني حشرة تسمى الذبابة', 'ذباب');
  add('الذال ثم الذباب حشرة تطير', 'ذباب');
  add('الذَّالُ ثُمَّ الذُّبَابُ حَشَرَةٌ تَطِيرُ', 'ذباب');

  add('ذبابا', 'ذبابا');
  add('ذُبَابًا', 'ذبابا');
  add('ذباباً', 'ذبابا');
  add('الذال ثم الذباب حشرة', 'ذبابا');
  add('الذَّالُ ثُمَّ الذُّبَابَ حَشَرَةً', 'ذبابا');
  add('الذَّالُ ثُمَّ الذُّبَابَ حَشَرَةً تَطِيرُ', 'ذبابا');

  add('قرب ذبابا', 'قرب ذبابا');
  add('قرب ذباباً', 'قرب ذبابا');
  add('قَرَّبَ ذُبَابًا', 'قرب ذبابا');
  add('قَرَّبَ حَشَرَةً تُسَمَّى الذُّبَابَةَ لِلصَّنَمِ', 'قرب ذبابا');
  add('الذال ثم الذباب قرب حشرة للصنم', 'قرب ذبابا');
  add('الذَّالُ ثُمَّ الذُّبَابُ قَرَّبَ حَشَرَةً لِلصَّنَمِ', 'قرب ذبابا');

  add('قرب ذبابا لصنم', 'قرب ذبابا لصنم');
  add('قرب ذبابا للصنم', 'قرب ذبابا لصنم');
  add('قرب ذباباً للصنم', 'قرب ذبابا لصنم');
  add('قرب ذباباً لصنم', 'قرب ذبابا لصنم');
  add('قَرَّبَ ذُبَابًا لِلصَّنَمِ', 'قرب ذبابا لصنم');
  add('قَرَّبَ ذُبَابًا لِصَنَمٍ', 'قرب ذبابا لصنم');

  // لا ضرر: live Fish sometimes merges لا+ضرر → Whisper «اللاضر»
  add('لا ضرر ولا ضرار', 'لا ضرر ولا ضرار');
  add('لَا ضَرَرَ وَلَا ضِرَارَ', 'لا ضرر ولا ضرار');
  add('أعني قاعدة لا ضرر على أحد ولا ضرار', 'لا ضرر ولا ضرار');
  add('أَعْنِي قَاعِدَةَ لَا ضَرَرَ عَلَى أَحَدٍ وَلَا ضِرَارَ', 'لا ضرر ولا ضرار');
  add('أَعْنِي قَاعِدَةَ: لَا، ضَرَرَ عَلَى أَحَدٍ، وَلَا، ضِرَارَ', 'لا ضرر ولا ضرار');

  aliasIndex = idx;
  return idx;
}

/** @returns {{ bare: string, file: string, absPath: string, spoken?: string } | null} */
export function resolveLemmaTtsClip(textRaw) {
  const key = bareArabicKey(textRaw);
  if (!key) return null;
  const man = loadManifest();
  const idx = buildAliasIndex();
  const targetBare = idx.get(key) || (man.clips[key] ? key : null);
  if (!targetBare) return null;
  const hit = man.clips[targetBare];
  if (!hit?.file) return null;
  const absPath = path.join(CLIP_DIR, hit.file);
  if (!fs.existsSync(absPath)) return null;
  const st = fs.statSync(absPath);
  if (!st.isFile() || st.size < 800) return null;
  return {
    bare: hit.bare || targetBare,
    file: hit.file,
    absPath,
    spoken: hit.spoken || null,
  };
}

export function lemmaTtsClipsConfigured() {
  const man = loadManifest();
  return Object.keys(man.clips || {}).length > 0;
}
