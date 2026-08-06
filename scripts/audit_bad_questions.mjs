#!/usr/bin/env node
/** Flag weird / truncated / OCR-broken / contextless questions for deletion. */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = {};
new Function('window', readFileSync(join(root, 'questions-bank.js'), 'utf8'))(win);
const qs = Object.values(win.QUESTIONS_BANK).flat();

const HARAKAT = /[\u064B-\u065F\u0670]/g;
const strip = (t) => String(t || '').replace(HARAKAT, '').replace(/\s+/g, ' ').trim();

const flags = [];
function flag(q, reason, detail = '') {
  flags.push({
    id: q.id,
    book: q.book,
    level: q.level,
    reason,
    detail: String(detail || '').slice(0, 80),
    q: strip(q.question_text).slice(0, 140),
    opts: (q.options || []).map((o) => strip(o).slice(0, 50)),
  });
}

const BAD_STEM = [
  [/لعن الله من غير\s*:?\s*$/i, 'مقصوص: لعن الله من غير'],
  [/^ومنها\s*:?\s*["«]?لعن/i, 'مقصوص: ومنها لعن'],
  [/^ثم\s+(الزكاة|الصلاة|الحج)/i, 'وسط حديث بلا سياق'],
  [/^أو\s+/i, 'يبدأ بـ أو'],
  [/رتب(ي|وا)? الكلمات|أكملي? الفراغ|ضعي? الكلمة/i, 'تمرين وليس سؤال'],
  [/[:：]\s*$/, 'ينتهي بنقطتين بلا تتمة'],
  [/\?\s*$/, 'علامة ? لاتينية'],
];

const BAD_BLOB = [
  [/[\uE000-\uF8FF]/, 'رموز خاصة PDF'],
  [/\uFDF[0-9A-F]/i, 'رموز قرآنية مشوهة'],
  [/ي ناله|تار كه|بش يء|م عصيته|موس ى|عدوفرعون|شها دة|ال ك تاب|ا لشرك|إالله|االله/, 'مسافات OCR مكسورة'],
  [/َّمَنْ|َّمن |م نْ |ف قُ لْ/, 'تشكيل/مسافات مشوهة'],
  [/«إ»|قول : «إ»|مثبتًا.*«إ»/, 'نص مقصوص عند إلا'],
  [/[{}<>]{2,}|null|undefined|NaN/, 'نص تقني'],
  [/[a-zA-Z]{5,}/, 'إنجليزي'],
  [/ satisfactorily|this |the |and /i, 'إنجليزي'],
];

const WRONG_OPTS_HINTS = [
  // Question about X but options are definitions of unrelated terms
  { q: /ما الدليل على شهادة أن لا إله/i, optBad: /الاستغاثة|الذبح|طمع الإنسان/, reason: 'خيارات لا تطابق السؤال' },
  { q: /ما حكم تعلم هذه المسائل/i, optBad: /الاستغاثة|المرتبة الثانية/, reason: 'خيارات لا تطابق السؤال' },
  { q: /ما معنى الاستغاثة/i, optBad: /الخشية|الصبر|الدليل قوله/, reason: 'خيارات لا تطابق السؤال' },
];

for (const q of qs) {
  const qt = strip(q.question_text);
  const exp = strip(q.explanation || '');
  const opts = (q.options || []).map(strip);
  const blob = [qt, ...opts, exp].join(' || ');

  if (!qt || qt.length < 10) flag(q, 'قصير جداً', qt);

  for (const [re, reason] of BAD_STEM) {
    if (re.test(qt)) flag(q, reason, qt);
  }
  for (const [re, reason] of BAD_BLOB) {
    if (re.test(blob)) flag(q, reason, blob.match(re)?.[0]);
  }

  // MC must have 4 options and a valid correct_index
  if (q.type === 'mc') {
    if (!Array.isArray(q.options) || q.options.length < 2) flag(q, 'خيارات ناقصة', String(q.options?.length));
    if (q.correct_index == null || q.correct_index < 0 || q.correct_index >= (q.options || []).length) {
      flag(q, 'correct_index باطل', String(q.correct_index));
    }
    // options that are clearly wrong field dumps (too long definitions for short stem)
    const longOpts = opts.filter((o) => o.length > 120).length;
    if (qt.length < 50 && longOpts >= 3) flag(q, 'خيارات طويلة جداً لسؤال قصير', `${longOpts}`);
    // duplicate options
    const set = new Set(opts.map((o) => o.replace(/[؟?!.،]/g, '').trim()));
    if (set.size < opts.length) flag(q, 'خيارات مكررة', '');
  }

  // Explanation is just generic filler + options look like encyclopedia dump
  if (/الإجابة المطابقة لما ورد|الموضع الصحيح|ما ثبت في لفظ الحديث/.test(exp) && opts.some((o) => o.length > 100)) {
    flag(q, 'شرح عام + خيارات مشبوهة', '');
  }

  for (const h of WRONG_OPTS_HINTS) {
    if (h.q.test(qt) && opts.some((o) => h.optBad.test(o))) flag(q, h.reason, qt.slice(0, 60));
  }

  // Stem looks like a heading / fragment
  if (/^(باب|فصل|المسألة|مسائل|تعريف|معاني)\s/i.test(qt) && qt.length < 40) {
    flag(q, 'عنوان وليس سؤال', qt);
  }

  // Quran presentation glyphs left in options (presentation forms clusters)
  if (/[\uFB50-\uFDFF]{8,}/.test(blob)) flag(q, 'رموز عرض قرآنية بدل نص', '');
}

// Deduplicate by id+reason
const seen = new Set();
const uniq = [];
for (const f of flags) {
  const k = `${f.id}::${f.reason}`;
  if (seen.has(k)) continue;
  seen.add(k);
  uniq.push(f);
}

const byId = new Map();
for (const f of uniq) {
  if (!byId.has(f.id)) byId.set(f.id, { ...f, reasons: [f.reason] });
  else byId.get(f.id).reasons.push(f.reason);
}
const deleteCandidates = [...byId.values()].sort((a, b) => b.reasons.length - a.reasons.length);

console.log(`Audited ${qs.length} questions`);
console.log(`Flagged unique IDs: ${deleteCandidates.length}`);
console.log('\nBy reason:');
const rc = {};
for (const f of uniq) rc[f.reason] = (rc[f.reason] || 0) + 1;
for (const [k, v] of Object.entries(rc).sort((a, b) => b[1] - a[1])) console.log(`  ${v}\t${k}`);

console.log('\nTop candidates:');
for (const f of deleteCandidates.slice(0, 60)) {
  console.log(`- ${f.id} [${f.book}/${f.level}] ${f.reasons.join(' | ')}`);
  console.log(`  Q: ${f.q}`);
  if (f.opts?.length) console.log(`  A: ${f.opts.join(' // ')}`);
}

writeFileSync(
  join(root, 'extracted', 'bad_questions_audit.json'),
  JSON.stringify({ total: qs.length, flagged: deleteCandidates.length, items: deleteCandidates }, null, 2),
  'utf8'
);
console.log('\nWrote extracted/bad_questions_audit.json');
