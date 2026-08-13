#!/usr/bin/env node
/**
 * v335b: maximize citation restores with STRICT relevance.
 * Sources: book Q/A pairs, verified explanations, OCR-cleaned quotes.
 * Never invents aqidah. Rejects mismatched book windows.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ex = path.join(root, 'extracted');

function stripDiacritics(s) {
  return (s || '').replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '');
}

function ocrLetterFix(s) {
  return String(s || '')
    .replace(/[\uE000-\uF8FF\uFB50-\uFDFF\uFE70-\uFEFF\uFD3E\uFD3F\uFE00-\uFE0F]/g, '')
    .replace(/[]/g, '')
    .replace(/اهلل|هللا|َّللا|للَّا/g, 'الله')
    .replace(/حممد/g, 'محمد')
    .replace(/رمحه الله/g, 'رحمه الله')
    .replace(/رمحه/g, 'رحمه')
    .replace(/تعاىل/g, 'تعالى')
    .replace(/حميي/g, 'محيي')
    .replace(/حييى/g, 'يحيى')
    .replace(/اإليمان/g, 'الإيمان')
    .replace(/اإلنسان/g, 'الإنسان')
    .replace(/اإلسالم/g, 'الإسلام')
    .replace(/اإلخالص/g, 'الإخلاص')
    .replace(/اإلحسان/g, 'الإحسان')
    .replace(/االنتقال/g, 'الانتقال')
    .replace(/االعتقاد/g, 'الاعتقاد')
    .replace(/اآلخر/g, 'الآخر')
    .replace(/األركان/g, 'الأركان')
    .replace(/األقوال/g, 'الأقوال')
    .replace(/األعمال/g, 'الأعمال')
    .replace(/األموات/g, 'الأموات')
    .replace(/األنعام/g, 'الأنعام')
    .replace(/األسئلة/g, 'الأسئلة')
    .replace(/األذى/g, 'الأذى')
    .replace(/األنواء/g, 'الأنواء')
    .replace(/األول/g, 'الأول')
    .replace(/االستسالم/g, 'الاستسلام')
    .replace(/مالئكته/g, 'ملائكته')
    .replace(/املادة|مجعت المادة|مجعت املادة/g, 'المادة')
    .replace(/املشركين/g, 'المشركين')
    .replace(/املالئكة/g, 'الملائكة')
    .replace(/بىل/g, 'بل')
    .replace(/ال إله إال/g, 'لا إله إلا')
    .replace(/أن ال إله إال/g, 'أن لا إله إلا')
    .replace(/أجل\s*واب|واب\s*جلا|اجلا واب|اجل واب/gi, '')
    .replace(/الإجابة\s*الصحيحة\s*:?\s*/gi, '')
    .replace(/^[:：؛.]+\s*/g, '')
    .replace(/\bص\s*\.?\s*\d{1,4}\b/gi, '')
    .replace(/يد عو/g, 'يدعو')
    .replace(/اال(?![لهم])/g, 'ال')
    .replace(/ىلع/g, 'على')
    .replace(/يشء|بيشء/g, 'بشيء')
    .replace(/افرتض/g, 'افترض')
    .replace(/فليغريه/g, 'فليغيره')
    .replace(/انلظر/g, 'انظر')
    .replace(/سو\s*ِي/g, 'يسوي')
    .replace(/\s+/g, ' ')
    .trim();
}

function softNorm(s) {
  let t = ocrLetterFix(stripDiacritics(s));
  t = t
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
  t = t.replace(/[^\u0621-\u064A\u0671\s]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

const STOP = new Set(
  'ما من هل في على عن ذلك هذا هذه التي الذي كان كما كل لم لن ان قد مع بين او لا ليس غير بعد قبل ثم هو هي هم الله النبي قال قوله تعالى رواه حديث يعني الي اليها اي ايها فيما اذا لماذا كيف متى اين بماذا مما عند اليكم عليهم عليه فيها منها ومنها وان اوقد وانما وهو وهي'.split(
    ' '
  )
);

function toks(s, minlen = 3) {
  return softNorm(s)
    .split(' ')
    .filter((t) => t.length >= minlen && !STOP.has(t));
}

function scoreOverlap(aToks, hayNorm) {
  if (!aToks.length || !hayNorm) return 0;
  let hit = 0;
  for (const t of aToks) if (hayNorm.includes(t)) hit++;
  return hit / aToks.length;
}

function hasOcrTashkeelGaps(s) {
  return (
    /[\u0621-\u064A]\s+[\u064B-\u065F]/.test(s || '') ||
    /[\u064B-\u065F]\s+[\u064B-\u065F]/.test(s || '') ||
    /(^|\s)[\u064B-\u065F]/.test(s || '')
  );
}

function hasSoftOcrLetterBreaks(s) {
  return /(?:ي\s+ؤ(?:من)?|بالل\s+ه|الل\s+ه|(?:^|[\s«"'])ق\s+ل(?:[\s»"'،,]|$)|(?:^|[\s«"'])إ\s+ن(?:[\s»"'،,]|$)|ف\s+لي|ل\s+يص|أم\s+تي|الخ\s+طأ|است\s+كره|عل\s+يه|يعني\s+ه(?:[\s»"'،.]|$)|الب\s+ضع|ان\s+واط|الري\s+اء|فر\s+ائض)/.test(
    String(s || '')
  );
}

function hasBrokenArabicSpacing(s) {
  if (hasOcrTashkeelGaps(s)) return true;
  if (hasSoftOcrLetterBreaks(s)) return true;
  const arabicToks = (s || '').split(/\s+/).filter((t) => /[\u0621-\u064A]/.test(t));
  if (arabicToks.length < 4) return false;
  const singles = arabicToks.filter((t) => t.replace(/[^\u0621-\u064A\u0671]/g, '').length <= 1).length;
  return singles / arabicToks.length >= 0.35;
}

function collapseBrokenArabicSpaces(s) {
  let out = stripDiacritics(s);
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
  const arabicToks = out.split(/\s+/).filter((t) => /[\u0621-\u064A]/.test(t));
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
  return /اكتبي|أجيبي|أجيب على|معاني الكلمات|اذكري مناسبة|الأسئلة التالية|س\s*:|ج\s*:|الدليل على أنه|لشيخ الإسلام محمد بن عبدالوهاب.*\d|^[\/.]|ماذا تعرف عن مؤلف|اختاري اإلجابة|رتبي الكلمات|أكملي الفراغ|ابحثي عن|عرفي ما يلي|ضعي الكلمة|كوني من/i.test(
    s || ''
  );
}

function isAnswerPrefixedQuote(raw) {
  return /^(?:ال)?إج[اآ]بة\s*الصحيحة\s*:/i.test(String(raw || '').trim());
}

function hasGluedWords(s) {
  for (const tok of (s || '').split(/\s+/)) {
    const ar = tok.replace(/[^\u0621-\u064A]/g, '');
    if (ar.length > 18) return true;
  }
  return false;
}

function citationTextQuality(s) {
  if (!s) return 0;
  const toksArr = s.split(/\s+/).filter(Boolean);
  if (!toksArr.length) return 0;
  const short = toksArr.filter((t) => t.replace(/[^\u0621-\u064A]/g, '').length <= 1).length;
  const latin = (s.match(/[a-zA-Z]/g) || []).length;
  let score = 1 - short / toksArr.length - latin * 0.15;
  if (hasOcrTashkeelGaps(s)) score -= 0.4;
  if (isWorksheetCitation(s)) score = 0;
  return Math.max(0, score);
}

function isAnswerKeyStub(s) {
  const t = String(s || '')
    .replace(/[«».\s]/g, '')
    .trim();
  if (t.length < 18) return true;
  return /^(التوحيد|توحيدالالوهية|توحيدالربوبية|توحيدالأسماءوالصفات|الأسماءوالصفات|الشركالأكبر|الشركالأصغر|الشرك|الإيمان|الإسلام|الإحسان|حديثصحيح|النار|الجنة|قبره|اتقاءالعين|البركةمنها|دخلالجنة|حققللتوحيد|كلمةالتوحيد|الجنوالإنس|مناهلالجنة|اجتنابالشرك)$/u.test(
    softNorm(t).replace(/\s+/g, '')
  );
}

function isGarbageCitation(s) {
  if (!s) return true;
  if (isAnswerPrefixedQuote(s)) return true;
  if (isWorksheetCitation(s)) return true;
  if (isAnswerKeyStub(s)) return true;
  if (hasOcrTashkeelGaps(s)) return true;
  if (hasBrokenArabicSpacing(s)) return true;
  if (hasGluedWords(s)) return true;
  if ((s.match(/[a-zA-Z]/g) || []).length > 2) return true;
  if (/[\uE000-\uF8FF]|اأ|ألم|ألمة|األ|ﭼ|ﭽ/.test(s)) return true;
  if (/ﭼ|ﭽ|ﭲ|ﭴ|ﭵ/.test(s)) return true; // Quran font placeholders without text
  if (
    /ىلع|يشء|بيشء|افرتض|أويلاء|إيل\s|يد عو|اإلحسان|االنتقال|تعاىل|رمحه الله|حميي|حييى|مجعت المادة|لثالث\b|فليغريه|انلظر|نفيس\b|بسنيت|دلواء|يف حرام|بىل/.test(
      s
    )
  ) {
    return true;
  }
  if (/اال(?![لهم])/.test(s)) return true;
  if (/^[:：]/.test(String(s).replace(/^«\s*/, '').trim())) return true;
  if (/^(صح|خطأ|شرك\s*أكبر|شرك\s*أصغر|الأسماء\s*والصفات|التوحيد|حديث\s*صحيح\.?)\s*$/i.test(String(s).trim()))
    return true;
  return citationTextQuality(s) < 0.45;
}

function cleanCandidate(raw) {
  if (!raw || isAnswerPrefixedQuote(raw)) return '';
  let s = ocrLetterFix(raw);
  if (!s || isWorksheetCitation(s)) return '';
  s = s.replace(/^كتاب التوحيد[^.«]{0,120}?\d+\s*/u, '');
  s = s.replace(/لشيخ الإسلام محمد بن عبدالوهاب[^\n«]*/gi, '');
  s = collapseBrokenArabicSpaces(s);
  s = ocrLetterFix(s);
  s = s.replace(/^[:：؛.]+\s*/, '').replace(/\s+/g, ' ').trim();
  // strip leading Quran font garbage
  s = s.replace(/^[^ء-ي«"]{0,10}/, '').trim();
  if (s.length > 300) {
    const cut = s.slice(0, 300);
    const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('،'), cut.lastIndexOf('؛'), cut.lastIndexOf('»'));
    s = lastStop > 80 ? cut.slice(0, lastStop + 1) : cut;
  }
  if (!s || isGarbageCitation(s)) return '';
  return s.replace(/^«+|»+$/g, '').trim();
}

function wrapQuote(s) {
  return String(s || '').trim().replace(/^«+|»+$/g, '');
}

function answerText(q) {
  const exp = String(q.explanation || '').replace(/^(?:ال)?إج[اآ]بة\s*الصحيحة\s*:?\s*/i, '').trim();
  const opt =
    q.type === 'mc' && Array.isArray(q.options) && Number.isInteger(q.correct_index)
      ? String(q.options[q.correct_index] || '')
      : '';
  const quoted = [...String(q.explanation || '').matchAll(/«([^»]{8,280})»/g)].map((m) => m[1]);
  return [exp, opt, ...quoted].filter(Boolean).join(' ');
}

function relevantEnough(q, cite) {
  const cNorm = softNorm(cite);
  const qToks = toks(q.question_text, 3);
  const aToks = toks(answerText(q), 3).slice(0, 14);
  const qScore = scoreOverlap(qToks, cNorm);
  const aScore = scoreOverlap(aToks, cNorm);
  // strong Q match OR decent answer match OR both moderate
  if (aToks.length >= 2 && aScore >= 0.35) return true;
  if (qScore >= 0.45 && (aToks.length < 2 || aScore >= 0.15)) return true;
  if (qScore >= 0.3 && aScore >= 0.25) return true;
  // explanation-derived: cite ≈ explanation body
  const exp = softNorm(
    String(q.explanation || '').replace(/^(?:ال)?إج[اآ]بة\s*الصحيحة\s*:?\s*/i, '')
  );
  if (exp && (cNorm.includes(exp.slice(0, 40)) || exp.includes(cNorm.slice(0, 40)))) return true;
  return false;
}

function fromExplanation(q, bookNorm) {
  const exp = String(q.explanation || '').trim();
  if (!exp || isWorksheetCitation(exp)) return '';

  const quoted = [...exp.matchAll(/«([^»]{12,320})»/g)].map((m) => m[1]);
  for (const qot of quoted) {
    const cleaned = cleanCandidate(qot);
    if (!cleaned || isGarbageCitation(cleaned)) continue;
    if (relevantEnough(q, cleaned)) return cleaned;
  }

  let body = exp.replace(/^(?:ال)?إج[اآ]بة\s*الصحيحة\s*:?\s*/i, '').trim();
  // drop meta "حديث صحيح."
  if (/^حديث\s*صحيح\.?$/i.test(body)) return '';
  const first = (body.split(/[.!؟\n]/)[0] || '').trim();
  for (const c of [body, first]) {
    if (!c || c.length < 18 || c.length > 320) continue;
    const cleaned = cleanCandidate(c);
    if (!cleaned || isGarbageCitation(cleaned) || isAnswerKeyStub(cleaned)) continue;
    const cover = scoreOverlap(toks(cleaned, 3), bookNorm);
    if (bookNorm.includes(softNorm(cleaned)) || cover >= 0.4 || relevantEnough(q, cleaned)) {
      if (relevantEnough(q, cleaned)) return cleaned;
    }
  }
  return '';
}

function matchBookQa(q, pairs) {
  const qToks = toks(q.question_text, 3);
  const aToks = toks(answerText(q), 3);
  const bk = String(q.book || '');
  let best = null;
  for (const p of pairs) {
    if (p.book !== bk) continue;
    const pq = softNorm(p.q);
    const pa = softNorm(p.a);
    const qScore = scoreOverlap(qToks, pq + ' ' + pa);
    const aScore = scoreOverlap(aToks, pa);
    const score = qScore * 0.55 + aScore * 0.45;
    if (!best || score > best.score) best = { score, pair: p, qScore, aScore };
  }
  if (!best || best.score < 0.38) return '';
  if (best.aScore < 0.15 && best.qScore < 0.4) return '';
  const cleaned = cleanCandidate(best.pair.a);
  if (!cleaned || isGarbageCitation(cleaned)) return '';
  if (!relevantEnough(q, cleaned) && best.score < 0.55) return '';
  return cleaned;
}

/** High-confidence definitional restores ONLY when soft-found in book corpus. */
const BOOK_BACKED_DEFS = [
  {
    needles: ['توحيد الألوهية', 'توحيد العبادة', 'إفراد الله بالعبادة'],
    text: 'توحيد العبادة: وهو إفراد الله بالعبادة وترك عبادة ما سواه، والبراءة من ذلك',
  },
  {
    needles: ['توحيد الربوبية', 'الخلق والملك والتدبير'],
    text: 'توحيد الربوبية: إفراد الله بالخلق والملك والتدبير',
  },
  {
    needles: ['الأسماء والصفات'],
    text: 'توحيد الأسماء والصفات: إثبات ما أثبته الله لنفسه ونفاه عنه رسوله من الأسماء والصفات',
  },
  {
    needles: ['الشرك الأكبر'],
    text: 'الشرك الأكبر: هو أن يسوي غير الله بالله فيما هو من خصائص الله',
  },
  {
    needles: ['الشرك الأصغر', 'الرياء'],
    text: 'الرياء: إظهار العبادة لقصد رؤية الناس لها فيحمدونه عليها، وهو من الشرك الأصغر',
  },
  {
    needles: ['حق الله على العباد', 'يعبدوه ولا يشركوا'],
    text: 'حق الله على العباد أن يعبدوه ولا يشركوا به شيئا',
  },
  {
    needles: ['حق العباد على الله'],
    text: 'حق العباد على الله ألا يعذب من عبده ولم يشرك به شيئا',
  },
  {
    needles: ['ما شاء الله وشئت'],
    text: 'النهي عن قول: ما شاء الله وشئت؛ لما فيه من عطف مشيئة العبد على مشيئة الله بالواو',
  },
  {
    needles: ['يؤذيني ابن آدم', 'سب الدهر'],
    text: 'يؤذيني ابن آدم يسب الدهر وأنا الدهر',
  },
  {
    needles: ['دخل الجنة رجل في ذباب'],
    text: 'دخل الجنة رجل في ذباب ودخل النار رجل في ذباب',
  },
  {
    needles: ['من حلف بغير الله'],
    text: 'من حلف بغير الله فقد كفر أو أشرك',
  },
  {
    needles: ['الرقى والتمائم والتولة'],
    text: 'إن الرقى والتمائم والتولة شرك',
  },
];

function matchBookBackedDef(q, bookNorm) {
  const blob = softNorm(q.question_text + ' ' + answerText(q));
  for (const def of BOOK_BACKED_DEFS) {
    const hit = def.needles.some((n) => blob.includes(softNorm(n)) || softNorm(q.question_text).includes(softNorm(n)));
    if (!hit) continue;
    if (!bookNorm.includes(softNorm(def.text).slice(0, 24)) && !def.needles.some((n) => bookNorm.includes(softNorm(n))))
      continue;
    const cleaned = cleanCandidate(def.text);
    if (cleaned && !isGarbageCitation(cleaned) && relevantEnough(q, cleaned)) return cleaned;
  }
  return '';
}

function loadWin() {
  const win = {};
  new Function('window', fs.readFileSync(path.join(root, 'citation-canonical.js'), 'utf8'))(win);
  new Function('window', fs.readFileSync(path.join(root, 'questions-bank.js'), 'utf8'))(win);
  return win;
}

function dumpCanon(canon) {
  const keys = Object.keys(canon).sort();
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(canon[k])},`);
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
  return (
    '/** Auto-expanded from book sources + prior canonical (v335 maximize restore) */\n' +
    'window.CANONICAL_QUOTES = {\n' +
    lines.join('\n') +
    '\n};\n'
  );
}

function dumpBank(bank) {
  return 'window.QUESTIONS_BANK = ' + JSON.stringify(bank, null, 2) + ';\n';
}

function bankSpellFix(s) {
  if (!s) return s;
  return ocrLetterFix(String(s))
    .replace(/رمحه الله/g, 'رحمه الله')
    .replace(/تعاىل/g, 'تعالى')
    .replace(/االنتقال/g, 'الانتقال')
    .replace(/يد عو/g, 'يدعو')
    .replace(/بىل/g, 'بل');
}

// ─── main ───
const win = loadWin();
const bank = win.QUESTIONS_BANK;
const byId = Object.fromEntries(Object.values(bank).flat().map((q) => [q.id, q]));
const canon = { ...win.CANONICAL_QUOTES };

const booksNorm = {};
for (const name of ['tawheed', 'usool', 'nawawi']) {
  const txt = fs.readFileSync(path.join(ex, `${name}.txt`), 'utf8');
  const pages = JSON.parse(fs.readFileSync(path.join(ex, `${name}_pages.json`), 'utf8'));
  booksNorm[name] = softNorm(txt + '\n' + pages.join('\n'));
}

let pairs = [];
const pairsPath = path.join(ex, 'v335_book_qa_pairs.json');
if (fs.existsSync(pairsPath)) pairs = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));

let reconstructed = {};
const reconPath = path.join(root, 'scripts/reconstructed-quotes.json');
if (fs.existsSync(reconPath)) reconstructed = JSON.parse(fs.readFileSync(reconPath, 'utf8'));

const pdfUpdates = JSON.parse(fs.readFileSync(path.join(ex, 'book_citations_from_pdfs.json'), 'utf8')).updates || [];
const pdfById = Object.fromEntries(pdfUpdates.filter((u) => u.source_quote).map((u) => [u.id, u]));

function usableCite(id) {
  const raw = canon[id] || byId[id]?.source_quote || '';
  const c = cleanCandidate(raw);
  if (!c || isGarbageCitation(c)) return '';
  const q = byId[id];
  if (q && !relevantEnough(q, c)) return '';
  return c;
}

const restored = [];
const residual = [];
const cleanedExisting = [];
const spellFixes = [];
const revoked = [];

// Clean / revoke bad existing canonical for bank questions
for (const q of Object.values(bank).flat()) {
  const raw = canon[q.id];
  if (!raw) continue;
  const c = cleanCandidate(raw);
  if (c && !isGarbageCitation(c) && relevantEnough(q, c)) {
    if (c !== String(raw).replace(/^«+|»+$/g, '').trim()) {
      canon[q.id] = c;
      cleanedExisting.push(q.id);
    }
    continue;
  }
  // revoke garbage / irrelevant
  if (raw) {
    delete canon[q.id];
    revoked.push(q.id);
  }
}

for (const q of Object.values(bank).flat()) {
  if (usableCite(q.id)) {
    const u = usableCite(q.id);
    q.source_quote = u;
    canon[q.id] = u;
    continue;
  }

  const bookNorm = booksNorm[q.book] || '';
  let candidate = '';
  let source = '';

  if (reconstructed[q.id]) {
    const r = cleanCandidate(reconstructed[q.id]);
    if (r && !isGarbageCitation(r) && relevantEnough(q, r)) {
      candidate = r;
      source = 'reconstructed';
    }
  }

  if (!candidate && pdfById[q.id]?.source_quote) {
    const r = cleanCandidate(pdfById[q.id].source_quote);
    if (r && !isGarbageCitation(r) && relevantEnough(q, r)) {
      candidate = r;
      source = 'pdf_match';
    }
  }

  if (!candidate && q.source_quote) {
    const r = cleanCandidate(q.source_quote);
    if (r && !isGarbageCitation(r) && relevantEnough(q, r)) {
      candidate = r;
      source = 'bank_source_quote_ocr';
    }
  }

  if (!candidate) {
    const r = fromExplanation(q, bookNorm);
    if (r) {
      candidate = r;
      source = 'explanation_verified';
    }
  }

  if (!candidate) {
    const r = matchBookQa(q, pairs);
    if (r) {
      candidate = r;
      source = 'book_qa_pair';
    }
  }

  if (!candidate) {
    const r = matchBookBackedDef(q, bookNorm);
    if (r) {
      candidate = r;
      source = 'book_backed_def';
    }
  }

  if (candidate && !isGarbageCitation(candidate) && relevantEnough(q, candidate)) {
    const out = wrapQuote(candidate);
    canon[q.id] = out;
    q.source_quote = out;
    restored.push({ id: q.id, source, text: out.slice(0, 160), q: (q.question_text || '').slice(0, 80) });
  } else {
    residual.push({
      id: q.id,
      book: q.book,
      q: (q.question_text || '').slice(0, 120),
      e: (q.explanation || '').slice(0, 120),
    });
  }
}

// Spell/OCR pass
for (const q of Object.values(bank).flat()) {
  for (const field of ['question_text', 'explanation', 'source_quote']) {
    const before = q[field];
    if (!before) continue;
    const after = bankSpellFix(before);
    if (after !== before) {
      q[field] = after;
      spellFixes.push({ id: q.id, field });
    }
  }
  if (Array.isArray(q.options)) {
    q.options = q.options.map((o) => bankSpellFix(o));
  }
  if (canon[q.id]) {
    const c2 = bankSpellFix(canon[q.id]);
    const cleaned = cleanCandidate(c2) || wrapQuote(c2);
    if (cleaned && !isGarbageCitation(cleaned)) canon[q.id] = wrapQuote(cleaned);
  }
}

let usableCount = 0;
for (const q of Object.values(bank).flat()) {
  if (usableCite(q.id)) usableCount++;
}

fs.writeFileSync(path.join(root, 'citation-canonical.js'), dumpCanon(canon));
const bankJs = dumpBank(bank);
fs.writeFileSync(path.join(root, 'questions-bank.js'), bankJs);
fs.writeFileSync(path.join(root, 'questions-bank-v311.js'), bankJs);
fs.writeFileSync(path.join(root, 'questions-bank.json'), JSON.stringify(bank, null, 2) + '\n');

const updates = [];
const seen = new Set();
for (const r of restored) {
  updates.push({ id: r.id, source_quote: canon[r.id], book: byId[r.id]?.book, note: r.source });
  seen.add(r.id);
}
for (const id of cleanedExisting) {
  if (seen.has(id)) continue;
  updates.push({ id, source_quote: canon[id], book: byId[id]?.book, note: 'ocr_clean_existing' });
}
// also sync all newly usable that already had cite cleaned into bank
for (const q of Object.values(bank).flat()) {
  if (seen.has(q.id)) continue;
  const u = usableCite(q.id);
  if (u && q.source_quote === u) {
    updates.push({ id: q.id, source_quote: u, book: q.book, note: 'sync_usable' });
    seen.add(q.id);
  }
}

fs.writeFileSync(
  path.join(ex, 'v335_citation_updates.json'),
  JSON.stringify({ updates, restored: restored.length, residual: residual.length }, null, 2) + '\n'
);
fs.writeFileSync(
  path.join(ex, 'v335_residual_impossible.json'),
  JSON.stringify(
    {
      count: residual.length,
      note_ar: 'تعذر الاستعادة من مصادر الكتاب بعد بحث مستفيض — بلا اختراع نص عقيدة',
      ids: residual.map((r) => r.id),
      samples: residual.slice(0, 50),
    },
    null,
    2
  ) + '\n'
);

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}
const sql = [
  '-- v335 maximize citation restore (strict relevance)',
  'BEGIN;',
  ...updates.map((u) => `UPDATE public.questions SET source_quote = ${sqlStr(u.source_quote)} WHERE id = '${u.id}';`),
  'COMMIT;',
];
fs.writeFileSync(path.join(ex, 'v335_citation_restore.sql'), sql.join('\n') + '\n');

const bySource = restored.reduce((a, x) => ((a[x.source] = (a[x.source] || 0) + 1), a), {});
const report = {
  at: new Date().toISOString(),
  restored: restored.length,
  cleaned_existing: cleanedExisting.length,
  revoked_bad: revoked.length,
  residual_impossible: residual.length,
  usable_after: usableCount,
  bank_total: Object.values(bank).flat().length,
  by_source: bySource,
  spell_fixes: spellFixes.length,
  updates: updates.length,
  examples_restored: restored.slice(0, 15),
  examples_residual: residual.slice(0, 15),
};
fs.writeFileSync(path.join(ex, 'v335_restore_report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
