#!/usr/bin/env node
/**
 * Exhaustive per-id speech audit for the full questions bank.
 * Checks (every bank question id, one-by-one):
 *  1) speech-map wording ≡ bank display (harakat/punct stripped)
 *  2) no missing map rows for q / mc options
 *  3) TF: card speech is صح/خطأ only (runtime); map must still match q text
 *  4) MC: each aN ≡ bank option
 *  5) low-tashkeel warnings; bad عَبْد scrub; allah iʿrāb after fix
 *  6) speak-plan extras: quote/exp must not equal card q when bank differs
 *  7) ayah: when QUESTION_VERSE_MAP links a verse, Fish prose must not keep ﴿…﴾
 *
 * Usage:
 *   node scripts/verify_all_questions_speech.mjs
 *   node scripts/verify_all_questions_speech.mjs --json
 *   node scripts/verify_all_questions_speech.mjs --strict-weak   # exit 1 on weak too
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fixAllahIrabInText } from '../allah-irab.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');
const strictWeak = process.argv.includes('--strict-weak');

function loadWindow(file) {
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(join(root, file), 'utf8'))(win);
  return win;
}

const win = {};
Object.assign(win, loadWindow('speech-pronunciation-lexicon.js'));
Object.assign(win, loadWindow('speech-diacritics-map.js'));
try {
  Object.assign(win, loadWindow('question-verse-map.js'));
} catch {
  /* optional */
}
try {
  Object.assign(win, loadWindow('ayah-snippet-map.js'));
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

function stripHarakat(s) {
  return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
}

/** Card speech fields only (mirrors buildQuestionSpeechParts — never quote/exp). */
function cardSpeechPlan(q, entry) {
  const plan = [];
  const qText = entry?.q || q.question_text;
  if (qText) plan.push({ role: 'q', text: qText });
  if (q.type === 'tf') {
    plan.push({ role: 'tf', text: 'صَحّ' });
    plan.push({ role: 'tf', text: 'خَطَأٌ' });
  } else if (q.type === 'mc' && Array.isArray(q.options)) {
    q.options.forEach((opt, i) => {
      plan.push({ role: `a${i}`, text: entry?.[`a${i}`] || opt });
    });
  }
  return plan;
}

const wording = [];
const weak = [];
const missing = [];
const abadBad = [];
const allahBad = [];
const speakPlanExtras = [];
const ayahFishLeak = [];
const tfPlanBad = [];
const idsChecked = [];

for (const q of all) {
  if (!q?.id) continue;
  idsChecked.push(q.id);
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
      wording.push({ id: q.id, field, kind: 'missing', bank: raw, speech: null });
      return;
    }
    if (norm(sp) !== norm(raw)) {
      wording.push({
        id: q.id,
        field,
        kind: 'wording',
        bank: raw,
        speech: sp,
      });
    } else if (
      /\bلولا\b/.test(stripHarakat(raw)) &&
      /لو\s+لا|لَوْ\s+لَا/.test(sp)
    ) {
      wording.push({ id: q.id, field, kind: 'lola-split', bank: raw, speech: sp });
    } else if (raw.replace(/[^\u0621-\u064A]/g, '').length >= 8 && harakatRatio(sp) < 0.2) {
      weak.push({ id: q.id, field, ratio: +harakatRatio(sp).toFixed(3), speech: sp });
    }

    const bare = stripHarakat(sp);
    if (
      (/\bما\s+عبد\b/.test(bare) || /\bكل\s+ما\s+عبد\b/.test(bare)) &&
      !/عُبِدَ|عُبِد\b/.test(sp) &&
      /عَبْد(?![َُِّْ])|عَبَد/.test(sp)
    ) {
      abadBad.push({ id: q.id, field, speech: sp });
    }

    if (/الله|اللهم/.test(sp)) {
      const fixed = fixAllahIrabInText(sp);
      // After iʿrāb, bare unmarked الله (no haraka on ه or preceding) is a fail.
      if (/الله(?![ًٌٍَُِّْ])/.test(fixed.replace(/اللَّه/g, 'X').replace(/اللّٰه/g, 'X'))) {
        // still has bare الله
        if (/الله/.test(fixed) && !/اللَّه|اللّٰه|اللَّهُ|اللَّهِ|اللَّهَ/.test(fixed)) {
          allahBad.push({ id: q.id, field, speech: sp.slice(0, 140), fixed: fixed.slice(0, 140) });
        }
      }
    }
  };

  check('q', q.question_text);
  if (q.type === 'mc' && Array.isArray(q.options)) {
    q.options.forEach((opt, i) => check(`a${i}`, opt));
  }

  // speak-plan: card must not pull quote/exp
  const plan = cardSpeechPlan(q, e);
  if (q.type === 'tf') {
    const tfSegs = plan.filter((p) => p.role === 'tf').map((p) => norm(p.text));
    if (tfSegs.length !== 2 || tfSegs[0] !== norm('صح') || tfSegs[1] !== norm('خطأ')) {
      tfPlanBad.push({ id: q.id, tfSegs });
    }
    // leftover a0.. must not be in card plan
    if (plan.some((p) => /^a\d$/.test(p.role))) {
      tfPlanBad.push({ id: q.id, kind: 'tf-has-mc-opts-in-plan' });
    }
  }
  if (
    e.quote &&
    e.q &&
    q.source_quote &&
    norm(e.quote) === norm(e.q) &&
    norm(q.source_quote) !== norm(q.question_text)
  ) {
    speakPlanExtras.push({ id: q.id, kind: 'quote-equals-card-q' });
  }

  // Ayah leak: if verse-linked and question still contains ﴿…﴾ after strip markers
  const verseKey = verseMap[q.id];
  if (verseKey) {
    const prose = String(e.q || q.question_text || '')
      .replace(/﴿[^﴾]*﴾/g, ' ')
      .replace(/「[^」]*」/g, ' ')
      .trim();
    if (/﴿|﴾/.test(prose)) {
      ayahFishLeak.push({ id: q.id, verseKey, prose: prose.slice(0, 120) });
    }
  }
}

const report = {
  checked: idsChecked.length,
  uniqueIds: new Set(idsChecked).size,
  wordingMismatches: wording.length,
  weakTashkeel: weak.length,
  missingIds: missing.length,
  abadBad: abadBad.length,
  allahBad: allahBad.length,
  speakPlanExtras: speakPlanExtras.length,
  tfPlanBad: tfPlanBad.length,
  ayahFishLeak: ayahFishLeak.length,
  wordingSample: wording.slice(0, 25).map((m) => ({
    id: m.id,
    field: m.field,
    kind: m.kind,
    bank: (m.bank || '').slice(0, 100),
    speech: (m.speech || '∅').slice(0, 100),
  })),
  weakSample: weak.slice(0, 20).map((w) => ({
    id: w.id,
    field: w.field,
    ratio: w.ratio,
    speech: String(w.speech || '').slice(0, 100),
  })),
  abadSample: abadBad.slice(0, 15),
  allahSample: allahBad.slice(0, 10),
  extrasSample: speakPlanExtras.slice(0, 10),
  ayahSample: ayahFishLeak.slice(0, 10),
};

mkdirSync(join(root, 'extracted'), { recursive: true });
writeFileSync(
  join(root, 'extracted/verify_all_questions_speech.json'),
  JSON.stringify({ ...report, allWording: wording, allWeak: weak }, null, 2)
);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `checked=${report.checked} wording=${report.wordingMismatches} weak=${report.weakTashkeel} missing=${report.missingIds} abad=${report.abadBad} allah=${report.allahBad} extras=${report.speakPlanExtras} tfPlan=${report.tfPlanBad} ayahLeak=${report.ayahFishLeak}`
  );
  for (const m of report.wordingSample) {
    console.log(`[${m.kind}] ${m.id} ${m.field}`);
    console.log(`  bank: ${m.bank}`);
    console.log(`  speech: ${m.speech}`);
  }
  for (const w of report.weakSample.slice(0, 8)) {
    console.log(`[weak ${w.ratio}] ${w.id} ${w.field}: ${w.speech}`);
  }
}

const hardFail =
  wording.length ||
  missing.length ||
  abadBad.length ||
  speakPlanExtras.length ||
  tfPlanBad.length ||
  ayahFishLeak.length ||
  (strictWeak && weak.length);

if (hardFail) process.exitCode = 1;
