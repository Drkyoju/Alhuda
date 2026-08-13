/**
 * Pre-recorded Fish Hakim clips for lemmas Fish cannot pronounce reliably live.
 * Matched on bare Arabic of the client request (UI bare, map iʿrāb, or carrier).
 * UI display is unchanged — only /api/tts audio is overridden.
 * v320: only serve clips whose spoken/transcript bare words match the written key
 * (no أعني… / الذال ثم… paraphrases).
 * v338: softBare lookup (ى≡ي) so prepared الْعُزَّيْ still hits العزى clip.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareArabicKey } from './short-speech-carriers.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLIP_DIR = path.join(ROOT, 'tts-lemma-clips');
const MANIFEST_PATH = path.join(CLIP_DIR, 'manifest.json');

let cached = null;

function softBare(s) {
  return bareArabicKey(s)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

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

function clipIsFidelity(bareKey, hit) {
  const target = softBare(bareKey);
  if (!target) return false;
  const spoken = hit.spoken || hit.transcript || '';
  if (spoken && softBare(spoken) === target) return true;
  // Allow clip keyed exactly to bare with no spoken metadata
  if (!spoken && softBare(hit.bare || bareKey) === target) return true;
  return false;
}

function findClipHit(man, key) {
  if (!key) return null;
  const direct = man.clips[key];
  if (direct?.file) return { key, hit: direct };
  // softBare alias (ى≡ي) so prepared الْعُزَّيْ still hits العزى clip
  const soft = softBare(key);
  if (!soft) return null;
  for (const [k, v] of Object.entries(man.clips || {})) {
    if (v?.file && softBare(k) === soft) return { key: k, hit: v };
  }
  return null;
}

/** @returns {{ bare: string, file: string, absPath: string, spoken?: string } | null} */
export function resolveLemmaTtsClip(textRaw) {
  const key = bareArabicKey(textRaw);
  if (!key) return null;
  const man = loadManifest();
  const found = findClipHit(man, key);
  if (!found) return null;
  const { hit } = found;
  if (!clipIsFidelity(key, hit) && !clipIsFidelity(found.key, hit)) return null;
  const absPath = path.join(CLIP_DIR, hit.file);
  if (!fs.existsSync(absPath)) return null;
  const st = fs.statSync(absPath);
  if (!st.isFile() || st.size < 800) return null;
  return {
    bare: hit.bare || found.key || key,
    file: hit.file,
    absPath,
    spoken: hit.spoken || null,
  };
}

export function lemmaTtsClipsConfigured() {
  const man = loadManifest();
  return Object.keys(man.clips || {}).length > 0;
}
