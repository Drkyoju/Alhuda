#!/usr/bin/env node
/**
 * Fail if SPEECH_BY_QUESTION_ID wording ≠ bank display text (harakat-stripped).
 * Diacritics may differ; words must match. ﷺ may expand to صلى الله عليه وسلم.
 *
 * Usage:
 *   node scripts/check_speech_matches_display.mjs
 *   node scripts/check_speech_matches_display.mjs --json
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');

const win = {};
new Function('window', readFileSync(join(root, 'speech-diacritics-map.js'), 'utf8'))(win);
const byId = win.SPEECH_BY_QUESTION_ID || {};

const bankRaw = readFileSync(join(root, 'questions-bank.js'), 'utf8');
const bank = JSON.parse(bankRaw.match(/window\.QUESTIONS_BANK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)[1]);
const all = Object.values(bank).flat();

function expandHonorifics(s) {
  return String(s || '')
    .replace(/\uFDFA/g, ' صلى الله عليه وسلم ')
    .replace(/\uFDFB/g, ' جل جلاله ')
    .replace(/صلعم/g, ' صلى الله عليه وسلم ')
    .replace(/\(ص\)/g, ' صلى الله عليه وسلم ');
}

function norm(s) {
  return expandHonorifics(s)
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // Treat spaced «لو لا» as compound «لولا» for equality (speech may vocalize either).
    .replace(/\bلو\s+لا\b/g, 'لولا')
    .replace(/[؟?!.،,;؛:«»"'“”‘’()[\]{}✓✗—–\-…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function harakatRatio(s) {
  const letters = (String(s || '').match(/[\u0621-\u064A\u0671]/g) || []).length;
  const marks = (String(s || '').match(/[\u064B-\u065F\u0670]/g) || []).length;
  return letters ? marks / letters : 1;
}

const mismatches = [];
const weak = [];
const missing = [];

for (const q of all) {
  const e = byId[q.id];
  if (!e) {
    missing.push(q.id);
    continue;
  }
  const check = (field, bankText) => {
    const raw = String(bankText || '').trim();
    if (!raw) return;
    const sp = e[field];
    if (!sp) {
      mismatches.push({ id: q.id, field, kind: 'missing', bank: raw, speech: null });
      return;
    }
    if (norm(sp) !== norm(raw)) {
      mismatches.push({ id: q.id, field, kind: 'wording', bank: raw, speech: sp });
    } else if (
      /\bلولا\b/.test(raw.replace(/[\u064B-\u065F\u0670]/g, '')) &&
      /لو\s+لا|لَوْ\s+لَا/.test(sp)
    ) {
      mismatches.push({ id: q.id, field, kind: 'lola-split', bank: raw, speech: sp });
    } else if (raw.replace(/[^\u0621-\u064A]/g, '').length >= 8 && harakatRatio(sp) < 0.2) {
      weak.push({ id: q.id, field, ratio: +harakatRatio(sp).toFixed(3), speech: sp.slice(0, 120) });
    }
  };
  check('q', q.question_text);
  if (q.type === 'mc' && Array.isArray(q.options)) {
    q.options.forEach((opt, i) => check(`a${i}`, opt));
  }
}

const report = {
  bank: all.length,
  mismatches: mismatches.length,
  weak: weak.length,
  missingIds: missing.length,
  mismatchSample: mismatches.slice(0, 30),
  weakSample: weak.slice(0, 20),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`bank=${report.bank} mismatches=${report.mismatches} weak=${report.weak} missing=${report.missingIds}`);
  for (const m of report.mismatchSample) {
    console.log(`[${m.kind}] ${m.id} ${m.field}`);
    console.log(`  bank: ${(m.bank || '').slice(0, 100)}`);
    console.log(`  speech: ${(m.speech || '∅').slice(0, 100)}`);
  }
}

if (mismatches.length || missing.length) process.exitCode = 1;
