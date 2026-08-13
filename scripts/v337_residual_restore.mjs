#!/usr/bin/env node
/**
 * v337: exhaustive pass on v335 residual IDs only.
 * Sources: OCR txt/pages + teacher/student PDF editions + prior pdf/proposed quotes.
 * Never invents aqidah. High-confidence book windows only.
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
    .replace(/املساواه/g, 'المساواة')
    .replace(/يقتض\s*ي/g, 'يقتضي')
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
    .replace(/هللا/g, 'الله')
    .replace(/بالل(?![ه])/g, 'بالله')
    .replace(/للا/g, 'الله')
    .replace(/فالن/g, 'فلان')
    .replace(/العباره/g, 'العبارة')
    .replace(/االولي/g, 'الأولى')
    .replace(/تشريك/g, 'تشريك')
    .replace(/مساوه/g, 'مساواة')
    .replace(/باهلل/g, 'بالله')
    .replace(/النه/g, 'لأنه')
    .replace(/هلل/g, 'لله')
    .replace(/االنداد/g, 'الأنداد')
    .replace(/االيه/g, 'الآية')
    .replace(/تكنيه/g, 'تكنية')
    .replace(/باكبر/g, 'بأكبر')
    .replace(/بنيه/g, 'بنيه')
    .replace(/عظمه/g, 'عظمة')
    .replace(/استهان بعظمه/g, 'استهان بعظمة')
    .replace(/استهان بعظمة هللا/g, 'استهان بعظمة الله')
    .replace(/االمه/g, 'الأمة')
    .replace(/العقيده/g, 'العقيدة')
    .replace(/الكه ان/g, 'الكهان')
    .replace(/كاه نا/g, 'كاهنا')
    .replace(/فصد قه/g, 'فصدقه')
    .replace(/يق ول/g, 'يقول')
    .replace(/فق د/g, 'فقد')
    .replace(/ك ف ر/g, 'كفر')
    .replace(/عل ي/g, 'على')
    .replace(/مح مد/g, 'محمد')
    .replace(/تحلفوا بابايكم/g, 'لا تحلفوا بآبائكم')
    .replace(/لتحلفوا/g, 'لا تحلفوا')
    .replace(/لجعلوا/g, 'لا تجعلوا')
    .replace(/ول تجعلوا/g, 'ولا تجعلوا')
    .replace(/ول عدوي|لعدوي/g, 'لا عدوى')
    .replace(/ول طيره/g, 'ولا طيرة')
    .replace(/ول هامه/g, 'ولا هامة')
    .replace(/ول صفر/g, 'ولا صفر')
    .replace(/ويع جبن يالف ال|ويعجبني الفال|ويع جبني الفال/g, 'ويعجبني الفأل')
    .replace(/الكلمه الطي به|الكلمه الطيبه/g, 'الكلمة الطيبة')
    .replace(/من اتي/g, 'من أتى')
    .replace(/شعبه من النجوم/g, 'شعبة من النجوم')
    .replace(/اقتبس لم اكان/g, 'اقتبس شعبة من السحر')
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

function collapseOcr(s) {
  let t = softNorm(s);
  for (let i = 0; i < 40; i++) {
    const n = t.replace(/(^|\s)([\u0621-\u064A])\s+(?=[\u0621-\u064A])/g, '$1$2');
    if (n === t) break;
    t = n;
  }
  return t.replace(/\s+/g, ' ').trim();
}

const STOP = new Set(
  'ما من هل في على عن ذلك هذا هذه التي الذي كان كما كل لم لن ان قد مع بين او لا ليس غير بعد قبل ثم هو هي هم الله النبي قال قوله تعالى رواه حديث يعني الي اليها اي ايها فيما اذا لماذا كيف متى اين بماذا مما عند اليكم عليهم عليه فيها منها ومنها وان اوقد وانما وهو وهي اكمل الايه الايه الباب ماجاء جاء قول'.split(
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

function isWorksheetCitation(s) {
  return /اكتبي|أجيبي|أجيب على|اجيبي|معاني الكلمات|اذكري مناسبة|الأسئلة التالية|االسئله|س\s*:|ج\s*:|الدليل على أنه|لشيخ الإسلام محمد بن عبدالوهاب.*\d|^[\/.]|ماذا تعرف عن مؤلف|اختاري|رتبي الكلمات|أكملي الفراغ|ابحثي عن|عرفي ما يلي|ضعي الكلمة|كوني من|رقم\s*مناسب/i.test(
    s || ''
  );
}

function isAnswerKeyStub(s) {
  const t = String(s || '')
    .replace(/[«».\s]/g, '')
    .trim();
  if (t.length < 18) return true;
  return /^(التوحيد|توحيدالالوهية|توحيدالربوبية|توحيدالاسماءوالصفات|الاسماءوالصفات|الشركالاكبر|الشركالاصغر|الشرك|الايمان|الاسلام|الاحسان|حديثصحيح|النار|الجنة|قبره|اتقاءالعين|البركةمنها|دخلالجنة|حققللتوحيد|كلمةالتوحيد|الجنوالانس|مناهلالجنة|اجتنابالشرك)$/u.test(
    softNorm(t).replace(/\s+/g, '')
  );
}

function hasBrokenArabicSpacing(s) {
  const arabicToks = (s || '').split(/\s+/).filter((t) => /[\u0621-\u064A]/.test(t));
  if (arabicToks.length < 4) return false;
  const singles = arabicToks.filter((t) => t.replace(/[^\u0621-\u064A\u0671]/g, '').length <= 1).length;
  return singles / arabicToks.length >= 0.28;
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
  if (hasBrokenArabicSpacing(out)) {
    for (let i = 0; i < 50; i++) {
      const n = out.replace(/([\u0621-\u064A\u0671])\s+(?=[\u0621-\u064A\u0671])/g, '$1');
      if (n === out) break;
      out = n;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function isGarbageCitation(s) {
  if (!s) return true;
  if (isWorksheetCitation(s)) return true;
  if (isAnswerKeyStub(s)) return true;
  if (hasBrokenArabicSpacing(s)) return true;
  if ((s.match(/[a-zA-Z]/g) || []).length > 2) return true;
  if (/[\uE000-\uF8FF]|اأ|ألم|ألمة|األ|ﭼ|ﭽ/.test(s)) return true;
  if (/^(صح|خطأ)\s*$/i.test(String(s).trim())) return true;
  const toksArr = s.split(/\s+/).filter(Boolean);
  if (toksArr.length < 4) return true;
  return false;
}

function cleanCandidate(raw) {
  if (!raw) return '';
  let s = ocrLetterFix(raw);
  if (!s || isWorksheetCitation(s)) return '';
  s = s.replace(/^كتاب التوحيد[^.«]{0,120}?\d+\s*/u, '');
  s = s.replace(/لشيخ الإسلام محمد بن عبدالوهاب[^\n«]*/gi, '');
  s = collapseBrokenArabicSpaces(s);
  s = ocrLetterFix(s);
  // cut worksheet tails
  s = s.split(/اجيبي|أجيبي|اكتبي|الأسئلة التالية|االسئله التالية|س\s*ما |س\s*:|اختاري الرقم/i)[0];
  s = s.replace(/^[:：؛.]+\s*/, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[^ء-ي«"]{0,10}/, '').trim();
  if (s.length > 280) {
    const cut = s.slice(0, 280);
    const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('،'), cut.lastIndexOf('؛'), cut.lastIndexOf('»'));
    s = lastStop > 60 ? cut.slice(0, lastStop + 1) : cut;
  }
  if (!s || isGarbageCitation(s) || isAnswerKeyStub(s)) return '';
  return s.replace(/^«+|»+$/g, '').trim();
}

function answerText(q) {
  const exp = String(q.explanation || '').replace(/^(?:ال)?إج[اآ]بة\s*الصحيحة\s*:?\s*/i, '').trim();
  const opt =
    q.type === 'mc' && Array.isArray(q.options) && Number.isInteger(q.correct_index)
      ? String(q.options[q.correct_index] || '')
      : '';
  return [exp, opt].filter(Boolean).join(' ');
}

function relevantEnough(q, cite) {
  const cNorm = softNorm(cite);
  const qToks = toks(q.question_text, 3);
  const aToks = toks(answerText(q), 3).slice(0, 14);
  const qScore = scoreOverlap(qToks, cNorm);
  const aScore = scoreOverlap(aToks, cNorm);
  if (aToks.length >= 2 && aScore >= 0.4 && qScore >= 0.15) return true;
  if (aToks.length >= 1 && aScore >= 0.55 && qScore >= 0.2) return true;
  if (qScore >= 0.45 && aScore >= 0.25) return true;
  if (qScore >= 0.3 && aScore >= 0.35) return true;
  const exp = softNorm(answerText(q));
  if (exp.length >= 12 && (cNorm.includes(exp.slice(0, 18)) || exp.includes(cNorm.slice(0, 18)))) return true;
  return false;
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
    '/** Auto-expanded from book sources + prior canonical (v337 residual restore) */\n' +
    'window.CANONICAL_QUOTES = {\n' +
    lines.join('\n') +
    '\n};\n'
  );
}

function dumpBank(bank) {
  return 'window.QUESTIONS_BANK = ' + JSON.stringify(bank, null, 2) + ';\n';
}

// ── corpora ──
const corpora = [];
function addCorpus(book, name, raw) {
  corpora.push({ book, name, raw, soft: softNorm(raw), col: collapseOcr(raw) });
}
for (const name of ['tawheed', 'usool', 'nawawi']) {
  const txt = fs.readFileSync(path.join(ex, `${name}.txt`), 'utf8');
  const pages = JSON.parse(fs.readFileSync(path.join(ex, `${name}_pages.json`), 'utf8')).join('\n');
  addCorpus(name, `${name}_ocr`, txt + '\n' + pages);
}
const edDir = path.join(ex, 'v337_pdf_editions');
for (const f of fs.readdirSync(edDir).filter((x) => x.endsWith('.txt'))) {
  const book = f.startsWith('tawheed') ? 'tawheed' : f.startsWith('usool') ? 'usool' : f.startsWith('nawawi') ? 'nawawi' : '';
  if (!book) continue;
  addCorpus(book, f.replace('.txt', ''), fs.readFileSync(path.join(edDir, f), 'utf8'));
}

const win = loadWin();
const bank = win.QUESTIONS_BANK;
const byId = Object.fromEntries(Object.values(bank).flat().map((q) => [q.id, q]));
const canon = { ...win.CANONICAL_QUOTES };

const residualIds = JSON.parse(fs.readFileSync(path.join(ex, 'v335_residual_impossible.json'), 'utf8')).ids;

const pdfUpdates = JSON.parse(fs.readFileSync(path.join(ex, 'book_citations_from_pdfs.json'), 'utf8')).updates || [];
const pdfById = Object.fromEntries(pdfUpdates.filter((u) => u.source_quote).map((u) => [u.id, u]));

let proposed = {};
try {
  proposed = JSON.parse(fs.readFileSync(path.join(ex, 'v330_canonical_proposed.json'), 'utf8'));
} catch {}

const pairs = JSON.parse(fs.readFileSync(path.join(ex, 'v335_book_qa_pairs.json'), 'utf8'));

function pickNeedles(q) {
  const qToks = toks(q.question_text, 3).filter((t) => t.length >= 4);
  const aToks = toks(answerText(q), 3);
  // prefer distinctive multi-token phrases from question
  const softQ = softNorm(q.question_text);
  const phrases = [];
  const m = softQ.match(/[^\s]{4,}(?:\s+[^\s]{3,}){1,4}/g) || [];
  for (const p of m.slice(0, 8)) if (p.length >= 10 && p.length <= 60) phrases.push(p);
  return [...new Set([...phrases.slice(0, 5), ...qToks.slice(0, 8), ...aToks.slice(0, 6)])];
}

function findBestWindow(q) {
  const book = q.book;
  const qToks = toks(q.question_text, 3);
  const aToks = toks(answerText(q), 3);
  const needles = pickNeedles(q);
  let best = null;
  for (const corp of corpora.filter((c) => c.book === book)) {
    for (const needle of needles) {
      const n = softNorm(needle).replace(/\s+/g, '');
      // search collapsed with spaces and without for short needles
      const searchNeedle = softNorm(needle);
      if (searchNeedle.length < 4) continue;
      let from = 0;
      let hits = 0;
      while (hits < 10) {
        let idx = corp.col.indexOf(searchNeedle, from);
        if (idx < 0 && searchNeedle.length >= 8) {
          // try without internal spaces on both sides for OCR
          const colTight = corp.col.replace(/\s+/g, '');
          const nt = searchNeedle.replace(/\s+/g, '');
          const ti = colTight.indexOf(nt);
          if (ti < 0) break;
          // approximate back to spaced index
          idx = Math.max(0, Math.floor((ti / Math.max(1, colTight.length)) * corp.col.length) - 20);
        }
        if (idx < 0) break;
        hits++;
        from = idx + Math.max(2, searchNeedle.length);
        const winStart = Math.max(0, idx - 50);
        const winEnd = Math.min(corp.col.length, idx + searchNeedle.length + 140);
        let win = corp.col.slice(winStart, winEnd);
        // trim to sentence-ish
        const qScore = scoreOverlap(qToks, win);
        const aScore = scoreOverlap(aToks, win);
        const score = qScore * 0.45 + aScore * 0.55;
        if (!best || score > best.score) {
          best = { score, qScore, aScore, win, src: corp.name, needle: searchNeedle };
        }
      }
    }
  }
  return best;
}

function matchBookQa(q) {
  const qToks = toks(q.question_text, 3);
  const aToks = toks(answerText(q), 3);
  let best = null;
  for (const p of pairs) {
    if (p.book !== q.book) continue;
    const pq = softNorm(p.q);
    const pa = softNorm(p.a);
    const qScore = scoreOverlap(qToks, pq + ' ' + pa);
    const aScore = scoreOverlap(aToks, pa);
    const score = qScore * 0.55 + aScore * 0.45;
    if (!best || score > best.score) best = { score, pair: p, qScore, aScore };
  }
  if (!best || best.score < 0.42) return '';
  if (best.aScore < 0.2 && best.qScore < 0.45) return '';
  const cleaned = cleanCandidate(best.pair.a);
  if (!cleaned || !relevantEnough(q, cleaned)) return '';
  return cleaned;
}

const restored = [];
const still = [];
const attempts = [];

for (const id of residualIds) {
  const q = byId[id];
  if (!q) {
    still.push({ id, reason: 'missing_in_bank' });
    continue;
  }

  let candidate = '';
  let source = '';

  // 1) prior proposed (only if in book + relevant)
  if (proposed[id]) {
    const r = cleanCandidate(proposed[id]);
    if (r && !isGarbageCitation(r) && relevantEnough(q, r)) {
      const bookHit = corpora.some((c) => c.book === q.book && c.col.includes(softNorm(r).slice(0, 24)));
      if (bookHit || softNorm(r).length >= 20) {
        candidate = r;
        source = 'v330_proposed_verified';
      }
    }
  }

  // 2) pdf match file
  if (!candidate && pdfById[id]?.source_quote) {
    const r = cleanCandidate(pdfById[id].source_quote);
    if (r && !isGarbageCitation(r) && relevantEnough(q, r)) {
      candidate = r;
      source = 'pdf_match_cleaned';
    }
  }

  // 3) book QA pairs
  if (!candidate) {
    const r = matchBookQa(q);
    if (r) {
      candidate = r;
      source = 'book_qa_pair';
    }
  }

  // 4) exhaustive window search
  if (!candidate) {
    const best = findBestWindow(q);
    attempts.push({
      id,
      q: (q.question_text || '').slice(0, 70),
      best: best
        ? { score: +best.score.toFixed(3), q: +best.qScore.toFixed(3), a: +best.aScore.toFixed(3), src: best.src, win: best.win.slice(0, 160) }
        : null,
    });
    if (best && best.score >= 0.38 && best.aScore >= 0.25 && best.qScore >= 0.15) {
      const cleaned = cleanCandidate(best.win);
      if (cleaned && !isGarbageCitation(cleaned) && relevantEnough(q, cleaned)) {
        candidate = cleaned;
        source = `window:${best.src}`;
      }
    }
  }

  // 5) explanation only if soft-found in book corpus (collapsed)
  if (!candidate) {
    const exp = String(q.explanation || '')
      .replace(/^(?:ال)?إج[اآ]بة\s*الصحيحة\s*:?\s*/i, '')
      .trim();
    if (exp && exp.length >= 20 && !isAnswerKeyStub(exp) && !isWorksheetCitation(exp)) {
      const cleaned = cleanCandidate(exp);
      const bookCorp = corpora.filter((c) => c.book === q.book);
      const cover = cleaned
        ? Math.max(...bookCorp.map((c) => scoreOverlap(toks(cleaned, 3), c.col)), 0)
        : 0;
      if (cleaned && cover >= 0.45 && relevantEnough(q, cleaned)) {
        candidate = cleaned;
        source = 'explanation_in_book';
      }
    }
  }

  if (candidate && !isGarbageCitation(candidate) && relevantEnough(q, candidate)) {
    const out = candidate.replace(/^«+|»+$/g, '').trim();
    canon[id] = out;
    q.source_quote = out;
    restored.push({ id, source, text: out, q: (q.question_text || '').slice(0, 90) });
  } else {
    still.push({
      id,
      book: q.book,
      q: (q.question_text || '').slice(0, 120),
      e: (q.explanation || '').slice(0, 100),
    });
  }
}

// write outputs
fs.writeFileSync(path.join(root, 'citation-canonical.js'), dumpCanon(canon));
const bankJs = dumpBank(bank);
fs.writeFileSync(path.join(root, 'questions-bank.js'), bankJs);
fs.writeFileSync(path.join(root, 'questions-bank-v311.js'), bankJs);
fs.writeFileSync(path.join(root, 'questions-bank.json'), JSON.stringify(bank, null, 2) + '\n');

const updates = restored.map((r) => ({
  id: r.id,
  source_quote: r.text,
  book: byId[r.id]?.book,
  note: r.source,
}));

fs.writeFileSync(
  path.join(ex, 'v337_citation_updates.json'),
  JSON.stringify({ updates, restored: restored.length, residual: still.length }, null, 2) + '\n'
);
fs.writeFileSync(
  path.join(ex, 'v337_residual_impossible.json'),
  JSON.stringify(
    {
      count: still.length,
      note_ar: 'تعذر الاستعادة من مصادر الكتاب بعد بحث مستفيض v337 — بلا اختراع نص عقيدة',
      ids: still.map((s) => s.id),
      samples: still.slice(0, 40),
    },
    null,
    2
  ) + '\n'
);
// keep v335 residual file pointing at latest impossible set for continuity
fs.writeFileSync(
  path.join(ex, 'v335_residual_impossible.json'),
  JSON.stringify(
    {
      count: still.length,
      note_ar: 'تعذر الاستعادة من مصادر الكتاب بعد بحث مستفيض v337 — بلا اختراع نص عقيدة',
      ids: still.map((s) => s.id),
    },
    null,
    2
  ) + '\n'
);

fs.writeFileSync(
  path.join(ex, 'v337_restore_report.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      input_residual: residualIds.length,
      restored: restored.length,
      still_impossible: still.length,
      by_source: restored.reduce((a, x) => ((a[x.source] = (a[x.source] || 0) + 1), a), {}),
      examples_restored: restored.slice(0, 25),
      examples_still: still.slice(0, 15),
      attempts_top: attempts
        .filter((a) => a.best)
        .sort((a, b) => (b.best?.score || 0) - (a.best?.score || 0))
        .slice(0, 20),
    },
    null,
    2
  ) + '\n'
);

console.log(
  JSON.stringify(
    {
      restored: restored.length,
      still: still.length,
      by_source: restored.reduce((a, x) => ((a[x.source] = (a[x.source] || 0) + 1), a), {}),
      samples: restored.slice(0, 12).map((r) => ({ id: r.id.slice(0, 8), source: r.source, text: r.text.slice(0, 90), q: r.q })),
    },
    null,
    2
  )
);
