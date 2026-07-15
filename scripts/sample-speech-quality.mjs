#!/usr/bin/env node
/**
 * Sample speech-quality check: compare diacritized vs plain phrases for TTS.
 * Usage:
 *   node scripts/sample-speech-quality.mjs
 *   TTS_URL=https://alhuda.ryodan71.workers.dev node scripts/sample-speech-quality.mjs --fetch
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function loadSpeechMaps() {
  const src = readFileSync(join(root, 'speech-diacritics-map.js'), 'utf8');
  const g = { window: {} };
  // eslint-disable-next-line no-new-func
  Function('window', src)(g.window);
  return g.window;
}

const SAMPLES = [
  'لماذا خلق الله الجن والإنس؟',
  'ما هو التوحيد؟',
  'الشرك الأكبر يخرج من الملة',
  'إنما الأعمال بالنيات',
  'ما هي الأصول الثلاثة؟',
  'التوحيد هو إفراد الله تعالى بالعبادة',
  'ما هو الطاغوت؟',
  'الصلاة نور.',
];

const maps = loadSpeechMaps();
const phraseMap = maps.SPEECH_PHRASE_MAP || {};

function diacritize(plain) {
  if (phraseMap[plain]) return phraseMap[plain];
  const norm = plain.replace(/[؟?.]/g, '').trim();
  for (const [k, v] of Object.entries(phraseMap)) {
    if (k.replace(/[؟?.]/g, '').trim() === norm) return v;
  }
  return plain;
}

const rows = SAMPLES.map((plain) => {
  const withMarks = diacritize(plain);
  const marks = (withMarks.match(/[\u064B-\u065F\u0670]/g) || []).length;
  return {
    plain,
    withMarks,
    hasDiacritics: withMarks !== plain && marks > 0,
    marks,
  };
});

console.log('Sample speech quality (diacritized vs plain)\n');
for (const r of rows) {
  console.log(`${r.hasDiacritics ? '✓' : '·'} marks=${r.marks}`);
  console.log(`  plain: ${r.plain}`);
  console.log(`  tts:   ${r.withMarks}\n`);
}

const covered = rows.filter((r) => r.hasDiacritics).length;
console.log(`Coverage: ${covered}/${rows.length} sample phrases have trusted diacritics`);

const wantFetch = process.argv.includes('--fetch');
const base = process.env.TTS_URL || '';
if (wantFetch && base) {
  const outDir = join(root, 'extracted/tts-samples');
  mkdirSync(outDir, { recursive: true });
  for (const r of rows.slice(0, 4)) {
    for (const [label, text] of [
      ['plain', r.plain],
      ['diac', r.withMarks],
    ]) {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'ar-SA-ZariyahNeural' }),
      });
      const provider = res.headers.get('X-TTS-Provider') || '?';
      if (!res.ok) {
        console.warn(`fetch fail ${label}:`, res.status);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const safe = r.plain.slice(0, 24).replace(/[^\u0621-\u064Aa-z0-9]+/gi, '_');
      const file = join(outDir, `${safe}_${label}.mp3`);
      writeFileSync(file, buf);
      console.log(`wrote ${file} (${buf.length}b, ${provider})`);
    }
  }
} else if (wantFetch) {
  console.log('Skip audio fetch: set TTS_URL and pass --fetch');
}

void require;
