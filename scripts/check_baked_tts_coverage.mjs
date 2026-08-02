#!/usr/bin/env node
/**
 * Verify every collected TTS string has a baked MP3 in tts-baked/.
 *
 * Usage:
 *   node scripts/check_baked_tts_coverage.mjs
 *
 * Exit 0 when fully covered; exit 1 if any MP3 is missing.
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  collectTtsStrings,
  bakedTtsFileNameSync,
} from './collect_tts_strings.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bakedDir = join(root, 'tts-baked');

const KEY_PHRASES = [
  'السلام عليكم',
  'اللَّهُ',
  'اللَّهَ',
  'اللَّهِ',
  'اللَّهُمَّ',
  'لِلَّهِ',
  'لَا إِلَٰهَ إِلَّا اللَّهُ',
];

function hasMp3(text) {
  const file = bakedTtsFileNameSync(text);
  return existsSync(join(bakedDir, file));
}

const all = collectTtsStrings();
const hits = [];
const misses = [];

for (const text of all) {
  if (hasMp3(text)) hits.push(text);
  else misses.push(text);
}

console.log('Baked TTS coverage');
console.log(`  total:  ${all.length}`);
console.log(`  hit:    ${hits.length}`);
console.log(`  miss:   ${misses.length}`);

if (misses.length) {
  console.log('\nMissing MP3s (up to 20):');
  for (const text of misses.slice(0, 20)) {
    const file = bakedTtsFileNameSync(text);
    console.log(`  • ${file}`);
    console.log(`    "${text.length > 80 ? text.slice(0, 77) + '…' : text}"`);
  }
  if (misses.length > 20) {
    console.log(`  … and ${misses.length - 20} more`);
  }
}

console.log('\nKey phrase checks (advisory — fail only if in collect list and missing):');
let keyMiss = false;
for (const phrase of KEY_PHRASES) {
  const inCollect = all.includes(phrase);
  const ok = hasMp3(phrase);
  if (inCollect && !ok) keyMiss = true;
  console.log(`  ${ok ? '✓' : (inCollect ? '✗' : '·')} ${phrase}${inCollect ? '' : ' (not in collect)'}`);
}

if (misses.length || keyMiss) {
  if (String(process.env.ALLOW_BAKED_TTS_MISS || '').trim() === '1') {
    console.log('\nALLOW_BAKED_TTS_MISS=1 — treating gaps as warning (live TTS fallback).');
    process.exit(0);
  }
  process.exit(1);
}

console.log('\nAll baked TTS strings covered.');
