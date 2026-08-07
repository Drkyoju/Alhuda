#!/usr/bin/env node
/**
 * Spot-check prepareTtsPayload-equivalent pipeline for ≥20 random bank questions
 * (always includes «حق الله على العباد…»).
 *
 * Simulates: speechTextFor (map if wording matches) → honorific expand →
 * remove ﴿﴾ → allah iʿrāb → strip punct for Fish-like sanitize.
 * Asserts spoken≡displayed for card fields; reports ayah strip + TF plan.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const COUNT = Math.max(20, Number(process.argv.find((a) => /^\d+$/.test(a)) || 24));

function loadWindow(file) {
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(join(root, file), 'utf8'))(win);
  return win;
}

const win = {
  ...loadWindow('speech-pronunciation-lexicon.js'),
  ...loadWindow('speech-diacritics-map.js'),
};
try {
  Object.assign(win, loadWindow('question-verse-map.js'));
} catch {
  /* optional */
}

const byId = win.SPEECH_BY_QUESTION_ID || {};
const verseMap = win.QUESTION_VERSE_MAP || {};
const bank = JSON.parse(
  readFileSync(join(root, 'questions-bank.js'), 'utf8').match(
    /window\.QUESTIONS_BANK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/
  )[1]
);
const all = Object.values(bank).flat();

function expandHonorifics(s) {
  return String(s || '')
    .replace(/\uFDFA/g, ' صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ ')
    .replace(/\uFDFB/g, ' جَلَّ جَلَالُهُ ');
}

function norm(s) {
  return String(s || '')
    .replace(/\uFDFA/g, ' صلى الله عليه وسلم ')
    .replace(/\uFDFB/g, ' جل جلاله ')
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

function speechMatchesDisplay(spoken, displayed) {
  return norm(spoken) === norm(displayed);
}

function speechTextFor(q, field, raw) {
  const hit = byId[q.id]?.[field];
  const original = String(raw || '').trim();
  let base = String(hit || '').trim();
  if (base && original && !speechMatchesDisplay(base, original)) base = original;
  else if (!base) base = original;
  return base;
}

/** Lightweight prepareTtsPayload stand-in (no full app.js DOM). */
function prepareTtsPayloadLite(text) {
  let s = String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  s = s.replace(/﴿[^﴾]*﴾/g, ' ').replace(/「[^」]*」/g, ' ');
  s = expandHonorifics(s);
  s = s.replace(/مَا\s+عَبْد(?![َُِّْ])/g, 'مَا عُبِدَ');
  s = s.replace(/مَا\s+عَبَد(?![َُِّْ])/g, 'مَا عُبِدَ');
  s = fixAllahIrabInText(s);
  // Fish-like: drop most punctuation
  s = s
    .replace(/[؟?!.،,;؛:«»"'“”‘’()[\]{}✓✗—–…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MUST = '07483021-8f6a-44c8-9f32-1040d095f0c5'; // حق الله على العباد
const rng = mulberry32(20260807);
const picked = new Map();
const mustQ = all.find((q) => q.id === MUST);
if (mustQ) picked.set(MUST, mustQ);
while (picked.size < Math.min(COUNT, all.length)) {
  const q = all[Math.floor(rng() * all.length)];
  if (q?.id) picked.set(q.id, q);
}

const results = [];
let wordingFails = 0;
let ayahStillInFish = 0;

for (const q of picked.values()) {
  const questionText = speechTextFor(q, 'q', q.question_text);
  const optionList =
    q.type === 'tf'
      ? ['صَحّ', 'خَطَأٌ']
      : (q.options || []).map((opt, i) => speechTextFor(q, `a${i}`, opt));

  let qProse = prepareTtsPayloadLite(
    String(questionText || '').replace(/﴿[^﴾]*﴾/g, ' ').replace(/「[^」]*」/g, ' ')
  );
  const verseKey = verseMap[q.id];
  if (verseKey && /﴿|﴾/.test(qProse)) ayahStillInFish += 1;

  const fields = [{ field: 'q', bank: q.question_text, spoken: questionText, prepared: qProse }];
  if (q.type === 'mc') {
    (q.options || []).forEach((opt, i) => {
      const spoken = optionList[i];
      fields.push({
        field: `a${i}`,
        bank: opt,
        spoken,
        prepared: prepareTtsPayloadLite(spoken),
      });
    });
  } else {
    fields.push({ field: 'tf0', bank: 'صح', spoken: 'صَحّ', prepared: prepareTtsPayloadLite('صَحّ') });
    fields.push({ field: 'tf1', bank: 'خطأ', spoken: 'خَطَأٌ', prepared: prepareTtsPayloadLite('خَطَأٌ') });
  }

  const mismatches = fields.filter((f) => f.bank != null && !speechMatchesDisplay(f.spoken, f.bank));
  // prepared may expand ﷺ — compare to spoken (not bank) for honorific expansion OK
  const prepDrift = fields.filter(
    (f) => f.prepared && !speechMatchesDisplay(f.prepared, f.spoken) && !speechMatchesDisplay(f.prepared, f.bank)
  );
  if (mismatches.length) wordingFails += mismatches.length;

  results.push({
    id: q.id,
    type: q.type,
    bankQ: q.question_text,
    preparedQ: qProse,
    verseKey: verseKey || null,
    optionCount: optionList.length,
    mismatches: mismatches.map((m) => m.field),
    prepDrift: prepDrift.map((m) => m.field),
    harakatRatioQ: (() => {
      const letters = (qProse.match(/[\u0621-\u064A\u0671]/g) || []).length;
      const marks = (qProse.match(/[\u064B-\u065F\u0670]/g) || []).length;
      return letters ? +(marks / letters).toFixed(3) : 1;
    })(),
  });
}

const report = {
  sampled: results.length,
  includesHaqqAllah: results.some((r) => r.id === MUST),
  wordingFails,
  ayahStillInFish,
  haqqAllah: results.find((r) => r.id === MUST) || null,
  sample: results.slice(0, 8).map((r) => ({
    id: r.id,
    type: r.type,
    bankQ: (r.bankQ || '').slice(0, 80),
    preparedQ: (r.preparedQ || '').slice(0, 100),
    harakatRatioQ: r.harakatRatioQ,
    verseKey: r.verseKey,
  })),
};

mkdirSync(join(root, 'extracted'), { recursive: true });
writeFileSync(join(root, 'extracted/spot_prepare_tts.json'), JSON.stringify({ ...report, results }, null, 2));
console.log(JSON.stringify(report, null, 2));
if (wordingFails || ayahStillInFish || !report.includesHaqqAllah) process.exitCode = 1;
