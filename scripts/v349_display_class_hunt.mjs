#!/usr/bin/env node
/** Adversarial hunt: NEW on-screen display classes (not v348 destub/shadda). */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bank = JSON.parse(readFileSync(join(root, 'questions-bank.json'), 'utf8'));

const books = Object.keys(bank);
const qs = [];
for (const book of books) {
  for (const q of bank[book] || []) qs.push({ ...q, _book: book });
}

function stripDiac(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[^\u0621-\u064A\u0671a-zA-Z0-9]/g, '')
    .toLowerCase();
}
function normSpace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}
function latinRatio(s) {
  const t = String(s || '');
  const lat = (t.match(/[A-Za-z]/g) || []).length;
  const ar = (t.match(/[\u0621-\u064A]/g) || []).length;
  if (lat + ar < 8) return 0;
  return lat / (lat + ar);
}

const findings = [];
function hit(cls, q, field, extra) {
  findings.push({
    class: cls,
    id: q.id,
    book: q._book || q.book,
    type: q.type,
    field,
    chapter: q.chapter,
    level: q.level,
    snippet: String(extra || '').slice(0, 220),
  });
}

const levels = new Set(['easy', 'medium', 'hard']);
const booksOk = new Set(['tawheed', 'usool', 'nawawi']);

for (const q of qs) {
  const qt = String(q.question_text || '');
  const exp = String(q.explanation || '');
  const sq = String(q.source_quote || '');
  const opts = Array.isArray(q.options) ? q.options.map((o) => (o == null ? '' : String(o))) : [];

  // Visible JSON / undefined / null
  for (const [field, val] of [
    ['question_text', qt],
    ['explanation', exp],
    ['source_quote', sq],
    ['chapter', String(q.chapter || '')],
    ...opts.map((o, i) => [`options[${i}]`, o]),
  ]) {
    if (/\b(undefined|null)\b/.test(val) || /\{["']/.test(val) || /"correct_index"/.test(val)) {
      hit('visible_json_undefined', q, field, val);
    }
    if (/&(?:amp|nbsp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);/i.test(val) || /&nbsp/i.test(val)) {
      hit('html_entity', q, field, val);
    }
    if (/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(val)) {
      hit('broken_special_chars', q, field, val);
    }
    if (/[A-Za-z]{4,}/.test(val) && latinRatio(val) > 0.15) {
      hit('latin_junk', q, field, val);
    }
    if (/\d{4,}/.test(val) && !/حديث|ص\s*\d|صفحة/.test(val)) {
      // many IDs aren't in text; skip verse numbers like 56
    }
    if (/ص\s*\d+|صفحة\s*\d+|ص\s*[٠-٩]+/.test(val) && field === 'question_text') {
      hit('page_num_on_stem', q, field, val);
    }
    if (/[﴾﴿]/.test(val)) {
      const open = (val.match(/﴿/g) || []).length;
      const close = (val.match(/﴾/g) || []).length;
      if (open !== close) hit('unmatched_ayah_marks', q, field, val);
    }
    const dq = (val.match(/«/g) || []).length;
    const dq2 = (val.match(/»/g) || []).length;
    if (dq !== dq2 && Math.abs(dq - dq2) >= 1 && (dq + dq2) > 0) {
      hit('unmatched_quotes', q, field, val);
    }
    // Isolated harakat (haraka with no letter nearby as sole content)
    if (/^[\u064B-\u065F\u0670\s]+$/.test(val) && val.trim()) {
      hit('isolated_harakat', q, field, val);
    }
    if (/\s[\u064B-\u065F]{2,}\s/.test(val) || /^[\u064B-\u065F]/.test(val.trim())) {
      hit('isolated_harakat', q, field, val);
    }
    // Reversed RTL markers / LTR override
    if (/[\u202A-\u202E\u2066-\u2069]/.test(val)) {
      hit('bidi_override', q, field, val);
    }
    // Unbreakable long strings
    if (val.length > 40 && !/\s/.test(val.replace(/[\u064B-\u065F]/g, ''))) {
      hit('unbreakable_string', q, field, val);
    }
    // Garbled ﷺ
    if (/صلى\s*الله\s*عليه/.test(val) && /ﷺ/.test(val)) {
      hit('salawat_mixed', q, field, val);
    }
    if (/ص\s*ل\s*ى\s*ا\s*ل\s*ل\s*ه/.test(val) || /ﷺ{2,}/.test(val)) {
      hit('salawat_garbled', q, field, val);
    }
  }

  // Truncated stems
  const stemBare = qt.replace(/[\u064B-\u065F\s«»:؟?]/g, '');
  if (qt.length > 0 && (qt.trim().length <= 8 || /^(هو|هي|ما|من):?\s*$/.test(qt.trim()) || stemBare.length <= 3)) {
    hit('truncated_stem', q, 'question_text', qt);
  }

  // Empty options
  if (q.type === 'mc') {
    if (!opts.length) hit('empty_options', q, 'options', 'no options');
    opts.forEach((o, i) => {
      if (!normSpace(o)) hit('blank_option', q, `options[${i}]`, JSON.stringify(o));
    });
    // duplicate identical
    const seen = new Map();
    opts.forEach((o, i) => {
      const k = normSpace(o);
      if (!k) return;
      if (seen.has(k)) hit('duplicate_identical_options', q, `options[${i}]`, k);
      else seen.set(k, i);
    });
    // same meaning (strip diacritics)
    const dseen = new Map();
    opts.forEach((o, i) => {
      const k = stripDiac(o);
      if (k.length < 4) return;
      if (dseen.has(k) && normSpace(o) !== normSpace(opts[dseen.get(k)])) {
        hit('near_duplicate_options', q, `options[${i}]`, o);
      } else if (!dseen.has(k)) dseen.set(k, i);
    });
    // question duplicated in option
    const qn = stripDiac(qt);
    if (qn.length >= 12) {
      opts.forEach((o, i) => {
        const on = stripDiac(o);
        if (on.length >= 12 && (on.includes(qn) || qn.includes(on) && on.length > qn.length * 0.8)) {
          hit('question_in_option', q, `options[${i}]`, o);
        }
      });
    }
    // numbered list leaking
    opts.forEach((o, i) => {
      if (/^\s*(?:\d+[\.\)]|[أابتث]-|\(\d+\))/.test(o) || /^\s*[1-4][\.\-)]/.test(o)) {
        hit('numbered_list_in_option', q, `options[${i}]`, o);
      }
    });
    if (opts.length !== 4 && opts.length !== 3 && opts.length !== 2) {
      hit('odd_option_count', q, 'options', String(opts.length));
    }
  }

  if (q.type === 'tf') {
    if (opts.length > 0 && opts.length !== 2) hit('tf_too_many_options', q, 'options', JSON.stringify(opts));
    if (opts.length === 2) {
      const joined = opts.join(' ');
      if (!/صح|خطأ|صحيح|خاطئ/.test(joined)) hit('tf_missing_sah_khata', q, 'options', joined);
    }
    if (q.is_true !== true && q.is_true !== false) hit('tf_missing_is_true', q, 'is_true', String(q.is_true));
  }

  // Citation vs explanation swapped-looking: explanation looks like a quote-only and quote looks like explanation
  if (exp && sq) {
    if (exp.includes('قال') && sq.length > 80 && !sq.includes('قال') && exp.length < 40) {
      // weak
    }
    if (/هو المعنى الصحيح|هو ما ثبت في لفظ|الموضع الصحيح/.test(exp + sq)) {
      hit('stub_residue', q, 'explanation', exp.slice(0, 120));
    }
    // identical explanation and quote is OK; swapped if explanation is short quote and quote is pedagogical
    if (exp.length > 60 && sq.length > 60 && stripDiac(exp) === stripDiac(qt)) {
      hit('explanation_is_question', q, 'explanation', exp.slice(0, 120));
    }
  }

  if (!booksOk.has(q.book) && q.book) hit('wrong_book_label', q, 'book', q.book);
  if (q.level && !levels.has(q.level)) hit('wrong_level_label', q, 'level', String(q.level));

  // Mixed hamza that looks broken: أا next to each other, إا, etc.
  if (/[أإؤئ]ا[أإ]/.test(qt) || /األ{2,}/.test(qt + opts.join(''))) {
    hit('broken_hamza', q, 'question_text', qt);
  }

  // Digit garbage mixed into Arabic words (OCR)
  if (/[\u0621-\u064A]\d{2,}[\u0621-\u064A]/.test(qt + opts.join('') + exp)) {
    hit('digit_garbage_in_word', q, 'mixed', qt);
  }
}

// Canonical
const canSrc = readFileSync(join(root, 'citation-canonical.js'), 'utf8');
const can = Function(`${canSrc.replace('window.CANONICAL_QUOTES', 'const CANONICAL_QUOTES')}; return CANONICAL_QUOTES;`)();
const canHits = [];
for (const [id, val] of Object.entries(can)) {
  const v = String(val || '');
  if (!v) continue;
  if (/األ|اإلسال|رمحه|األمة|األول|األدلة|اإلسلم|والسالم|والصالة/.test(v)) {
    canHits.push({ class: 'canonical_ocr_presentation', id, snippet: v.slice(0, 180) });
  }
  if (/|||/.test(v)) {
    canHits.push({ class: 'canonical_pua_symbol', id, snippet: v.slice(0, 120) });
  }
  if (/[A-Za-z]{5,}/.test(v) && latinRatio(v) > 0.12) {
    canHits.push({ class: 'canonical_latin', id, snippet: v.slice(0, 120) });
  }
  if (/&(?:amp|nbsp)/i.test(v)) canHits.push({ class: 'canonical_entity', id, snippet: v.slice(0, 80) });
}

const byClass = {};
for (const f of findings) {
  byClass[f.class] = (byClass[f.class] || 0) + 1;
}
const canBy = {};
for (const f of canHits) {
  canBy[f.class] = (canBy[f.class] || 0) + 1;
}

const out = {
  n_questions: qs.length,
  books: Object.fromEntries(books.map((b) => [b, (bank[b] || []).length])),
  byClass,
  canBy,
  findings: findings.slice(0, 800),
  canHits: canHits.slice(0, 200),
};
writeFileSync(join(root, 'extracted/v349_display_class_hunt.json'), JSON.stringify(out, null, 2));
console.log('Q', qs.length, 'findings', findings.length, JSON.stringify(byClass, null, 2));
console.log('canonical', canHits.length, JSON.stringify(canBy, null, 2));
