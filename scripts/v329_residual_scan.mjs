#!/usr/bin/env node
/** Residual display OCR/spelling scan after v329 fixes. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function hasOcrTashkeelGaps(s) {
  return (
    /[\u0621-\u064A]\s+[\u064B-\u065F]/.test(s || '') ||
    /[\u064B-\u065F]\s+[\u064B-\u065F]/.test(s || '') ||
    /(^|\s)[\u064B-\u065F]/.test(s || '')
  );
}
function hasSoftOcrLetterBreaks(s) {
  const t = String(s || '');
  if (!t) return false;
  if (
    /(?:ي\s+ؤ(?:من)?|بالل\s+ه|الل\s+ه|(?:^|[\s«"'])ق\s+ل(?:[\s»"'،,]|$)|(?:^|[\s«"'])إ\s+ن(?:[\s»"'،,]|$)|ف\s+لي|ل\s+يص|أم\s+تي|الخ\s+طأ|است\s+كره|عل\s+يه|يعني\s+ه(?:[\s»"'،.]|$)|ف\s+لي\s*قل|ل\s+يص\s*مت|الب\s+ضع|ان\s+واط|الري\s+اء|فر\s+ائض)/.test(
      t
    )
  )
    return true;
  const toks = t.split(/\s+/).filter(Boolean);
  let torn = 0;
  for (let i = 0; i < toks.length - 1; i++) {
    const a = toks[i].replace(/[^\u0621-\u064A\u0671]/g, '');
    const b = toks[i + 1].replace(/[^\u0621-\u064A\u0671]/g, '');
    if (!a || !b) continue;
    if ((a.length <= 2 && b.length >= 2) || (a.length >= 2 && b.length === 1)) torn++;
  }
  return torn >= 3;
}
function hasBrokenArabicSpacing(s) {
  if (hasOcrTashkeelGaps(s)) return true;
  if (hasSoftOcrLetterBreaks(s)) return true;
  const toks = (s || '').split(/\s+/).filter(Boolean);
  const arabicToks = toks.filter((t) => t.replace(/[^\u0621-\u064A\u0671]/g, '').length > 0);
  if (arabicToks.length < 4) return false;
  const singles = arabicToks.filter((t) => t.replace(/[^\u0621-\u064A\u0671]/g, '').length <= 1).length;
  return singles / arabicToks.length >= 0.35;
}
function isWorksheetCitation(s) {
  return /اكتبي|أجيبي|أجيب على|معاني الكلمات|اذكري مناسبة|الأسئلة التالية|س\s*:|ج\s*:|الدليل على أنه|لشيخ الإسلام محمد بن عبدالوهاب.*\d|^[\/.]|ماذا تعرف عن مؤلف/i.test(
    s || ''
  );
}
function hasGluedWords(s) {
  for (const tok of (s || '').split(/\s+/)) {
    const ar = tok.replace(/[^\u0621-\u064A]/g, '');
    if (ar.length > 15) return true;
  }
  return false;
}
function citationTextQuality(s) {
  if (!s) return 0;
  const toks = s.split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  const short = toks.filter((t) => t.replace(/[^\u0621-\u064A]/g, '').length <= 1).length;
  const latin = (s.match(/[a-zA-Z]/g) || []).length;
  let score = 1 - short / toks.length - latin * 0.15;
  if (hasOcrTashkeelGaps(s)) score -= 0.4;
  if (isWorksheetCitation(s)) score = 0;
  return Math.max(0, score);
}
function isGarbageCitation(s) {
  if (!s) return true;
  if (isWorksheetCitation(s)) return true;
  if (hasOcrTashkeelGaps(s)) return true;
  if (hasBrokenArabicSpacing(s)) return true;
  if (hasGluedWords(s)) return true;
  if ((s.match(/[a-zA-Z]/g) || []).length > 2) return true;
  if (/[\uE000-\uF8FF]|اأ|ألم|ألمة|األ/.test(s)) return true;
  if (
    /ىلع|يشء|بيشء|افرتض|أويلاء|إيل\s|يد عو|اإلحسان|االنتقال|تعاىل|رمحه الله|حميي|حييى|مجعت المادة|لثالث\b|فليغريه|انلظر|نفيس\b/.test(
      s
    )
  )
    return true;
  if (/اال(?![لهم])/.test(s)) return true;
  return citationTextQuality(s) < 0.45;
}
function stripArabicDiacritics(s) {
  return (s || '').replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '');
}
function collapseBrokenArabicSpaces(s) {
  if (!hasBrokenArabicSpacing(s)) return stripArabicDiacritics(s).replace(/\s+/g, ' ').trim();
  let out = stripArabicDiacritics(s);
  for (let i = 0; i < 50; i++) {
    const n = out.replace(/([\u0621-\u064A\u0671])\s+(?=[\u0621-\u064A\u0671])/g, '$1');
    if (n === out) return out;
    out = n;
  }
  return out;
}
function postFixCitationPhrases(s) {
  return (s || '')
    .replace(/االنتقال/g, 'الانتقال')
    .replace(/اإلحسان/g, 'الإحسان')
    .replace(/يد عو/g, 'يدعو')
    .replace(/رمحه الله/g, 'رحمه الله')
    .replace(/تعاىل/g, 'تعالى')
    .replace(/النجوم لثالث\b/g, 'النجوم لثلاث')
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanArabicCitation(raw) {
  if (!raw || isWorksheetCitation(raw)) return '';
  let s = raw.trim();
  s = s.replace(/[\uE000-\uF8FF]/g, '');
  s = s.replace(/[\uFD3E\uFD3F]/g, '');
  s = s.replace(/[\uFE00-\uFE0F]/g, '');
  s = s.replace(/^كتاب التوحيد[^.«]{0,120}?\d+\s*/u, '');
  s = s.replace(/لشيخ الإسلام محمد بن عبدالوهاب[^\n«]*/gi, '');
  s = s.replace(/[]/g, '');
  s = s.replace(/أجل\s*واب|واب\s*جلا|اجلا واب|اجل واب/gi, '');
  s = s.replace(/الإجابة\s*الصحيحة\s*:?\s*/gi, '');
  s = s.replace(/\bص\s*\.?\s*\d{1,4}\b/gi, '');
  s = s.replace(/[|]{2,}|_{3,}|\.{4,}/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || isWorksheetCitation(s)) return '';
  if (hasBrokenArabicSpacing(s) && hasBrokenArabicSpacing(collapseBrokenArabicSpaces(s))) return '';
  s = postFixCitationPhrases(collapseBrokenArabicSpaces(s));
  if (isGarbageCitation(s)) return '';
  return s;
}

const win = {};
new Function('window', fs.readFileSync(path.join(root, 'citation-canonical.js'), 'utf8'))(win);
new Function('window', fs.readFileSync(path.join(root, 'questions-bank.js'), 'utf8'))(win);
const byId = Object.fromEntries(Object.values(win.QUESTIONS_BANK).flat().map((q) => [q.id, q]));
const canon = win.CANONICAL_QUOTES;

const residual = [];
for (const [id, raw] of Object.entries(canon)) {
  if (!byId[id]) continue;
  const cleaned = cleanArabicCitation(raw);
  if (!cleaned || isGarbageCitation(cleaned)) continue;
  const flags = [];
  if (/تعاىل|رمحه|يد عو|االنتقال|اإلحسان|ىلع|يشء|لثالث\b|افرتض|أويلاء/.test(cleaned))
    flags.push('spell');
  if (/اال(?![لهم])/.test(cleaned)) flags.push('اال');
  if (/^[:：]/.test(cleaned.replace(/^«/, ''))) flags.push('lead_colon');
  if (flags.length) residual.push({ id, flags, text: cleaned.slice(0, 200), q: byId[id].question_text });
}

// Bank orthography residual (word-boundary)
const bankHits = [];
const BAD = [
  'تعاىل',
  'باياتع',
  'رمحه الله',
  'يد عو',
  'االنتقال',
  'اإلحسان',
  'حميي',
  'حييى',
  'المبتدئني',
  'مجعت المادة',
];
for (const q of Object.values(win.QUESTIONS_BANK).flat()) {
  const parts = [q.question_text, q.explanation, q.source_quote, ...(q.options || [])];
  for (const p of parts) {
    if (!p) continue;
    for (const b of BAD) {
      if (String(p).includes(b)) bankHits.push({ id: q.id, b, ctx: String(p).slice(0, 100) });
    }
  }
}

const report = {
  live_questions: Object.values(win.QUESTIONS_BANK).flat().length,
  residual_displayed_spell: residual.length,
  residual,
  bank_dumb_typos: bankHits.length,
  bankHits,
};
fs.writeFileSync(path.join(root, 'extracted/v329_residual_after_fix.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
