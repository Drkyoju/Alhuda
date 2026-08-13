#!/usr/bin/env node
/**
 * v330: audit citation garbage false-positives + restore usable quotes from book sources.
 * Does not invent aqidah text — only OCR fix / known clean sources.
 */
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

/** Known mid-word OCR tears only — NOT normal short Arabic particles (من/لا/أن…). */
function hasSoftOcrLetterBreaks(s) {
  const t = String(s || '');
  if (!t) return false;
  return /(?:ي\s+ؤ(?:من)?|بالل\s+ه|الل\s+ه|(?:^|[\s«"'])ق\s+ل(?:[\s»"'،,]|$)|(?:^|[\s«"'])إ\s+ن(?:[\s»"'،,]|$)|ف\s+لي|ل\s+يص|أم\s+تي|الخ\s+طأ|است\s+كره|عل\s+يه|يعني\s+ه(?:[\s»"'،.]|$)|ف\s+لي\s*قل|ل\s+يص\s*مت|الب\s+ضع|ان\s+واط|الري\s+اء|فر\s+ائض)/.test(
    t
  );
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

function stripArabicDiacritics(s) {
  return (s || '').replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '');
}

function collapseBrokenArabicSpaces(s) {
  if (!hasBrokenArabicSpacing(s)) {
    return stripArabicDiacritics(s).replace(/\s+/g, ' ').trim();
  }
  let out = stripArabicDiacritics(s);
  // Targeted soft-break joins (never glue all Arabic spaces).
  out = out
    .replace(/ي\s+ؤ/g, 'يؤ')
    .replace(/بالل\s+ه/g, 'بالله')
    .replace(/الل\s+ه/g, 'الله')
    .replace(/(^|[\s«"'])ق\s+ل(?=[\s»"'،,]|$)/g, '$1قل')
    .replace(/(^|[\s«"'])إ\s+ن(?=[\s»"'،,]|$)/g, '$1إن')
    .replace(/ف\s+لي/g, 'فلي')
    .replace(/ل\s+يص/g, 'ليص')
    .replace(/أم\s+تي/g, 'أمتي')
    .replace(/الخ\s+طأ/g, 'الخطأ')
    .replace(/است\s+كره/g, 'استكره')
    .replace(/عل\s+يه/g, 'عليه')
    .replace(/يعني\s+ه/g, 'يعنيه')
    .replace(/الب\s+ضع/g, 'البضع')
    .replace(/ان\s+واط/g, 'انواط')
    .replace(/الري\s+اء/g, 'الرياء')
    .replace(/فر\s+ائض/g, 'فرائض');
  // Only full-collapse when single-letter ratio is truly broken OCR.
  const toks = out.split(/\s+/).filter(Boolean);
  const arabicToks = toks.filter((t) => t.replace(/[^\u0621-\u064A\u0671]/g, '').length > 0);
  const singles = arabicToks.filter((t) => t.replace(/[^\u0621-\u064A\u0671]/g, '').length <= 1).length;
  if (arabicToks.length >= 4 && singles / arabicToks.length >= 0.35) {
    for (let i = 0; i < 50; i++) {
      const n = out.replace(/([\u0621-\u064A\u0671])\s+(?=[\u0621-\u064A\u0671])/g, '$1');
      if (n === out) break;
      out = n;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
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

function isAnswerPrefixedQuote(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  return /^(?:ال)?إج[اآ]بة\s*الصحيحة\s*:/i.test(s) || /^الإجابة\s*الصحيحة\s*:/i.test(s);
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
  if (isAnswerPrefixedQuote(s)) return true;
  if (isWorksheetCitation(s)) return true;
  if (hasOcrTashkeelGaps(s)) return true;
  if (hasBrokenArabicSpacing(s)) return true;
  if (hasGluedWords(s)) return true;
  if ((s.match(/[a-zA-Z]/g) || []).length > 2) return true;
  if (/[\uE000-\uF8FF]|اأ|ألم|ألمة|األ/.test(s)) return true;
  if (
    /ىلع|يشء|بيشء|افرتض|أويلاء|إيل\s|يد عو|اإلحسان|االنتقال|تعاىل|رمحه الله|حميي|حييى|مجعت المادة|لثالث\b|فليغريه|انلظر|نفيس\b|بسنيت|دلواء|يف حرام/.test(
      s
    )
  ) {
    return true;
  }
  if (/اال(?![لهم])/.test(s)) return true;
  if (/^[:：]/.test(String(s).replace(/^«\s*/, '').trim())) return true;
  if (/^(صح|خطأ|شرك\s*أكبر|شرك\s*أصغر|الأسماء\s*والصفات)\s*$/i.test(String(s).trim())) return true;
  return citationTextQuality(s) < 0.45;
}

function postFixCitationPhrases(s) {
  return (s || '')
    .replace(/\bأن ل إله\b/g, 'أن لا إله')
    .replace(/\bإلل لا\b/g, 'إلا الله')
    .replace(/\bإله إلل لا\b/g, 'إله إلا الله')
    .replace(/منحلفبغيرلله/g, 'من حلف بغير الله')
    .replace(/فقدكفرأوأشرك/g, 'فقد كفر أو أشرك')
    .replace(/دخلالجنةرجل/g, 'دخل الجنة رجل')
    .replace(/ودخلالناررجل/g, 'و دخل النار رجل')
    .replace(/فيذباب/g, 'في ذباب')
    .replace(/منتعلقتميمة/g, 'من تعلق تميمة')
    .replace(/فقدأشرك/g, 'فقد أشرك')
    .replace(/منعلّقتميمة/g, 'من علّق تميمة')
    .replace(/فلاأتمالله/g, 'فلا أتم الله')
    .replace(/الشركالأكبر/g, 'الشرك الأكبر')
    .replace(/والشركالأصغر/g, 'والشرك الأصغر')
    .replace(/الطيرةشرك/g, 'الطيرة شرك')
    .replace(/االنتقال/g, 'الانتقال')
    .replace(/اإلحسان/g, 'الإحسان')
    .replace(/اإليمان/g, 'الإيمان')
    .replace(/اآلخر/g, 'الآخر')
    .replace(/األركان/g, 'الأركان')
    .replace(/األنعام/g, 'الأنعام')
    .replace(/مالئكته/g, 'ملائكته')
    .replace(/يد عو/g, 'يدعو')
    .replace(/رمحه الله/g, 'رحمه الله')
    .replace(/تعاىل/g, 'تعالى')
    .replace(/النجوم لثالث\b/g, 'النجوم لثلاث')
    .replace(/اهلل/g, 'الله')
    .replace(/حممد/g, 'محمد')
    .replace(/املادة/g, 'المادة')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanArabicCitation(raw) {
  if (!raw || isWorksheetCitation(raw)) return '';
  if (isAnswerPrefixedQuote(raw)) return '';
  let s = raw.trim();
  s = s.replace(/[\uE000-\uF8FF]/g, '');
  s = s.replace(/[\uFD3E\uFD3F]/g, '');
  s = s.replace(/[\uFE00-\uFE0F]/g, '');
  // Arabic presentation forms / Quran font PUA leftovers as empty glyphs
  s = s.replace(/[\uFB50-\uFDFF\uFE70-\uFEFF]/g, '');
  s = s.replace(/^كتاب التوحيد[^.«]{0,120}?\d+\s*/u, '');
  s = s.replace(/لشيخ الإسلام محمد بن عبدالوهاب[^\n«]*/gi, '');
  s = s.replace(/[]/g, '');
  s = s.replace(/أجل\s*واب|واب\s*جلا|اجلا واب|اجل واب/gi, '');
  s = s.replace(/الإجابة\s*الصحيحة\s*:?\s*/gi, '');
  s = s.replace(/\bص\s*\.?\s*\d{1,4}\b/gi, '');
  s = s.replace(/[|]{2,}|_{3,}|\.{4,}/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || isWorksheetCitation(s)) return '';
  const collapsed = collapseBrokenArabicSpaces(s);
  if (hasBrokenArabicSpacing(s) && hasBrokenArabicSpacing(collapsed)) return '';
  s = postFixCitationPhrases(collapsed);
  if (isGarbageCitation(s)) return '';
  return s;
}

function reasonOf(raw) {
  const reasons = [];
  if (!raw) return ['empty'];
  if (isAnswerPrefixedQuote(raw)) reasons.push('answer_prefix');
  if (isWorksheetCitation(raw)) reasons.push('worksheet');
  let s = String(raw).trim();
  s = s.replace(/[\uE000-\uF8FF]/g, '');
  s = s.replace(/[\uFB50-\uFDFF\uFE70-\uFEFF]/g, '');
  s = s.replace(/أجل\s*واب|واب\s*جلا|اجلا واب|اجل واب/gi, '');
  s = s.replace(/الإجابة\s*الصحيحة\s*:?\s*/gi, '');
  s = s.replace(/\s+/g, ' ').trim();
  const c = postFixCitationPhrases(collapseBrokenArabicSpaces(s));
  if (!c) reasons.push('empty_after_clean');
  if (isWorksheetCitation(c)) reasons.push('worksheet');
  if (hasOcrTashkeelGaps(c)) reasons.push('tashkeel');
  if (hasBrokenArabicSpacing(c)) reasons.push('broken_spacing');
  if (hasGluedWords(c)) reasons.push('glued');
  if (/[\uE000-\uF8FF]|اأ|ألم|ألمة|األ/.test(c)) reasons.push('pua');
  if (/اال(?![لهم])/.test(c)) reasons.push('double_alef');
  if (
    /ىلع|يشء|بيشء|افرتض|أويلاء|إيل\s|يد عو|اإلحسان|االنتقال|تعاىل|رمحه الله|حميي|حييى|مجعت المادة|لثالث\b|فليغريه|انلظر|نفيس\b|بسنيت|دلواء|يف حرام/.test(
      c
    )
  )
    reasons.push('ocr_typo');
  if (/^[:：]/.test(c.replace(/^«\s*/, '').trim())) reasons.push('lead_colon');
  if (citationTextQuality(c) < 0.45) reasons.push('low_quality');
  return [...new Set(reasons)];
}

function normAr(s) {
  return stripArabicDiacritics(String(s || ''))
    .replace(/[^\u0621-\u064A\u0671\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadBooks() {
  const books = {};
  for (const name of ['tawheed', 'usool', 'nawawi']) {
    const p = path.join(root, 'extracted', `${name}.txt`);
    if (fs.existsSync(p)) books[name] = fs.readFileSync(p, 'utf8');
  }
  return books;
}

function scoreMatch(qNorm, snippetNorm) {
  if (!qNorm || !snippetNorm) return 0;
  const qToks = qNorm.split(' ').filter((t) => t.length >= 3);
  if (!qToks.length) return 0;
  let hit = 0;
  for (const t of qToks) if (snippetNorm.includes(t)) hit++;
  return hit / qToks.length;
}

function findBookSnippet(books, bookKey, questionText, hintQuote) {
  const text = books[bookKey];
  if (!text) return '';
  const hint = normAr(hintQuote).split(' ').filter((t) => t.length >= 4).slice(0, 6);
  const qn = normAr(questionText);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length >= 20);
  let best = '';
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const window = [lines[i], lines[i + 1] || '', lines[i + 2] || ''].join(' ').slice(0, 320);
    const wn = normAr(window);
    let sc = scoreMatch(qn, wn);
    if (hint.length) {
      let h = 0;
      for (const t of hint) if (wn.includes(t)) h++;
      sc = Math.max(sc, h / hint.length);
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = window;
    }
  }
  if (bestScore < 0.45) return '';
  return postFixCitationPhrases(collapseBrokenArabicSpaces(best)).slice(0, 280);
}

function fromExplanation(exp) {
  const text = String(exp || '').trim();
  if (!text || isWorksheetCitation(text)) return '';
  const quoted = text.match(/«([^»]+)»/);
  if (quoted?.[1]) {
    const c = cleanArabicCitation(quoted[1]);
    if (c) return c;
  }
  // Short definitional explanations that are book-like
  const c = cleanArabicCitation(text.split(/[.!؟\n]/)[0] || '');
  if (c && c.length >= 12 && c.length <= 220 && !isGarbageCitation(c)) return c;
  return '';
}

const win = {};
new Function('window', fs.readFileSync(path.join(root, 'citation-canonical.js'), 'utf8'))(win);
new Function('window', fs.readFileSync(path.join(root, 'questions-bank.js'), 'utf8'))(win);
const byId = Object.fromEntries(Object.values(win.QUESTIONS_BANK).flat().map((q) => [q.id, q]));
const canon = { ...win.CANONICAL_QUOTES };

const pdfUpdates = JSON.parse(fs.readFileSync(path.join(root, 'extracted/book_citations_from_pdfs.json'), 'utf8')).updates || [];
const pdfById = Object.fromEntries(pdfUpdates.filter((u) => u.source_quote).map((u) => [u.id, u]));

let reconstructed = {};
const reconPath = path.join(root, 'scripts/reconstructed-quotes.json');
if (fs.existsSync(reconPath)) reconstructed = JSON.parse(fs.readFileSync(reconPath, 'utf8'));

const books = loadBooks();

const bookKeyOf = (q) => {
  const b = String(q.book_id || q.book || '').toLowerCase();
  if (b.includes('tawheed') || b.includes('توحيد')) return 'tawheed';
  if (b.includes('usool') || b.includes('أصول') || b.includes('اصول')) return 'usool';
  if (b.includes('nawawi') || b.includes('نووي')) return 'nawawi';
  return '';
};

const rejectedBefore = [];
const restored = [];
const residual = [];

for (const [id, raw] of Object.entries(canon)) {
  const q = byId[id];
  if (!q) continue;
  const cleaned = cleanArabicCitation(raw);
  if (cleaned && !isGarbageCitation(cleaned)) continue;
  rejectedBefore.push({ id, raw: String(raw).slice(0, 200), reasons: reasonOf(raw), q: (q.question_text || '').slice(0, 100) });

  // Restore pipeline (priority): cleaned OCR fix of raw → reconstructed → pdf quote → bank source_quote → explanation → book search
  let candidate = '';
  let source = '';

  // 1) Soft-clean of existing raw (with stronger OCR letter fixes) without inventing
  const soft = postFixCitationPhrases(
    collapseBrokenArabicSpaces(
      String(raw)
        .replace(/[\uE000-\uF8FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
        .replace(/أجل\s*واب|واب\s*جلا|اجلا واب|اجل واب/gi, '')
        .replace(/الإجابة\s*الصحيحة\s*:?\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
  );
  if (soft && !isGarbageCitation(soft) && !isWorksheetCitation(soft) && soft.length >= 12) {
    candidate = soft;
    source = 'ocr_fix_raw';
  }

  if (!candidate && reconstructed[id]) {
    const r = cleanArabicCitation(reconstructed[id]) || postFixCitationPhrases(reconstructed[id]);
    if (r && !isGarbageCitation(r)) {
      candidate = r;
      source = 'reconstructed';
    }
  }

  if (!candidate && pdfById[id]?.source_quote) {
    const r = cleanArabicCitation(pdfById[id].source_quote) || postFixCitationPhrases(pdfById[id].source_quote);
    if (r && !isGarbageCitation(r)) {
      candidate = r;
      source = 'pdf_match';
    }
  }

  if (!candidate && q.source_quote) {
    const r = cleanArabicCitation(q.source_quote);
    if (r && !isGarbageCitation(r)) {
      candidate = r;
      source = 'bank_source_quote';
    }
  }

  if (!candidate && q.explanation) {
    const r = fromExplanation(q.explanation);
    if (r) {
      candidate = r;
      source = 'explanation';
    }
  }

  if (!candidate) {
    const bk = bookKeyOf(q);
    const snip = findBookSnippet(books, bk, q.question_text, soft || q.source_quote || '');
    if (snip && !isGarbageCitation(snip)) {
      candidate = snip;
      source = 'book_txt';
    }
  }

  if (candidate && !isGarbageCitation(candidate)) {
    // wrap with guillemets if not present
    let out = candidate.trim();
    if (!out.startsWith('«')) out = `«${out.replace(/^«|»$/g, '')}»`;
    if (!out.endsWith('»')) out = `${out.replace(/»$/g, '')}»`;
    canon[id] = out;
    restored.push({ id, source, text: out.slice(0, 180), q: (q.question_text || '').slice(0, 80) });
  } else {
    residual.push({
      id,
      reasons: reasonOf(raw),
      raw: String(raw).slice(0, 180),
      q: (q.question_text || '').slice(0, 100),
      sq: (q.source_quote || '').slice(0, 120),
    });
  }
}

// Also: bank questions currently missing usable citation — try restore into canonical
const bankFilled = [];
for (const q of Object.values(win.QUESTIONS_BANK).flat()) {
  if (canon[q.id] && cleanArabicCitation(canon[q.id])) continue;
  const sqClean = q.source_quote ? cleanArabicCitation(q.source_quote) : '';
  if (sqClean) {
    let out = sqClean;
    if (!out.startsWith('«')) out = `«${out}»`;
    canon[q.id] = out;
    bankFilled.push({ id: q.id, source: 'bank_source_quote', text: out.slice(0, 160) });
    continue;
  }
  const fromExp = fromExplanation(q.explanation);
  if (fromExp) {
    let out = fromExp;
    if (!out.startsWith('«')) out = `«${out}»`;
    canon[q.id] = out;
    bankFilled.push({ id: q.id, source: 'explanation', text: out.slice(0, 160) });
  }
}

// Count final displayable for bank-linked canonical
let displayable = 0;
let stillHidden = 0;
const stillHiddenList = [];
for (const [id, raw] of Object.entries(canon)) {
  if (!byId[id]) continue;
  const c = cleanArabicCitation(raw);
  if (c && !isGarbageCitation(c)) displayable++;
  else {
    stillHidden++;
    stillHiddenList.push({ id, reasons: reasonOf(raw), raw: String(raw).slice(0, 140) });
  }
}

const report = {
  rejected_before: rejectedBefore.length,
  rejected_ids: rejectedBefore.map((x) => x.id),
  restored: restored.length,
  restored_by_source: restored.reduce((a, x) => ((a[x.source] = (a[x.source] || 0) + 1), a), {}),
  bank_filled_extra: bankFilled.length,
  residual: residual.length,
  residual_ids: residual.map((x) => x.id),
  final_displayable_bank_canon: displayable,
  final_still_hidden_bank_canon: stillHidden,
  examples_restored: restored.slice(0, 8),
  examples_residual: residual.slice(0, 8),
};

fs.writeFileSync(path.join(root, 'extracted/v330_rejected_ids.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'extracted/v330_restored_quotes.json'), JSON.stringify({ restored, bankFilled, residual }, null, 2));
fs.writeFileSync(path.join(root, 'extracted/v330_canonical_proposed.json'), JSON.stringify(canon, null, 2));

console.log(JSON.stringify(report, null, 2));
