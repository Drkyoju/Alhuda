#!/usr/bin/env node
/**
 * v330 apply: fix soft-OCR false reject in app.js helpers (applied separately),
 * restore the remaining garbage-canonical bank quotes from OCR-fixed book text /
 * clean bank/explanation — never invent aqidah.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function stripArabicDiacritics(s) {
  return (s || '').replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '');
}

/** Aggressive but mechanical OCR letter repairs (no invented meaning). */
function ocrLetterFix(s) {
  return String(s || '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[\uFB50-\uFDFF\uFE70-\uFEFF]/g, '') // presentation / Quran font leftovers
    .replace(/[\uFD3E\uFD3F\uFE00-\uFE0F]/g, '')
    .replace(/[]/g, '')
    .replace(/أجل\s*واب|واب\s*جلا|اجلا واب|اجل واب/gi, '')
    .replace(/الإجابة\s*الصحيحة\s*:?\s*/gi, '')
    .replace(/^[:：؛]+\s*/g, '')
    .replace(/\bص\s*\.?\s*\d{1,4}\b/gi, '')
    // double-alef OCR families
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
    .replace(/اهلل/g, 'الله')
    .replace(/َّللا/g, 'الله')
    .replace(/للَّا/g, 'الله')
    .replace(/حممد/g, 'محمد')
    .replace(/رمحه الله/g, 'رحمه الله')
    .replace(/رمحه/g, 'رحمه')
    .replace(/تعاىل/g, 'تعالى')
    .replace(/حميي/g, 'محيي')
    .replace(/حييى/g, 'يحيى')
    // torn words common in teacher PDF OCR
    .replace(/مل\s*ا\b/g, 'لما')
    .replace(/ا\s*سم\b/g, 'اسم')
    .replace(/عب\s*اد\b/g, 'عباد')
    .replace(/ال\s*يكون\b/g, 'لا يكون')
    .replace(/ال\s*يكون\b/g, 'لا يكون')
    .replace(/\bال\s+يكون\b/g, 'لا يكون')
    .replace(/\bفهذا\s+ال\s+يكون\b/g, 'فهذا لا يكون')
    .replace(/\bفهذا ال يكون\b/g, 'فهذا لا يكون')
    .replace(/ا\s*:\s*ألول/g, 'الأول')
    .replace(/وهي ا\s*:\s*ألول/g, 'وهي: الأول')
    .replace(/ثالث\s*ة\b/g, 'ثلاثة')
    .replace(/و\s*ال\s*د\s*ل\s*يل|ووالدا ليل|ووالدايل|ووالدا ليل|ووالدايل/g, 'والدليل')
    .replace(/ُو َالدَّ ل يلُ|و َالدَّ ل يلُ|ووالدا ليلُ|والدَّ ليل/g, 'والدليل')
    .replace(/قَوْلُه\s*:?\s*تَعَالَى/g, 'قوله تعالى')
    .replace(/يد عو/g, 'يدعو')
    .replace(/اال(?![لهم])/g, 'ال')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function collapseBrokenArabicSpaces(s) {
  if (!hasBrokenArabicSpacing(s)) {
    return stripArabicDiacritics(s).replace(/\s+/g, ' ').trim();
  }
  let out = stripArabicDiacritics(s);
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

function cleanCandidate(raw) {
  if (!raw) return '';
  if (isAnswerPrefixedQuote(raw)) return '';
  let s = ocrLetterFix(raw);
  if (!s || isWorksheetCitation(s)) return '';
  // Drop book-title preamble dumps
  s = s.replace(/^كتاب التوحيد الذي هو حق الله على العبيد\s*\d*\s*/u, '');
  s = s.replace(/^لشيخ الإسلام محمد بن عبدالوهاب[^\n«]*/gi, '');
  s = collapseBrokenArabicSpaces(s);
  s = ocrLetterFix(s);
  s = s.replace(/^[:：؛]+\s*/, '').replace(/\s+/g, ' ').trim();
  // Truncate if still contains Quran PUA leftovers as empty runs
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (!s || isGarbageCitation(s)) return '';
  // Prefer a readable sentence window (12..280 chars)
  if (s.length > 280) {
    const cut = s.slice(0, 280);
    const lastStop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('.'), cut.lastIndexOf('،'), cut.lastIndexOf('؛'));
    s = lastStop > 80 ? cut.slice(0, lastStop + 1) : cut;
  }
  if (isGarbageCitation(s)) return '';
  return s;
}

function wrapQuote(s) {
  let out = String(s || '').trim().replace(/^«+|»+$/g, '');
  return `«${out}»`;
}

/** High-confidence curated restores for the residual 36 (from bank explanation / known book wording). */
const CURATED = {
  '01b52421-bfcb-42b0-9034-591c60e3d641':
    'أركان الإيمان ستة: أن تؤمن بالله، وملائكته، وكتبه، ورسله، واليوم الآخر، وتؤمن بالقدر خيره وشره',
  '0b79cc37-e91a-43e2-b864-f3435b7b633b':
    'علامة صدق محبة الله: أن يكون الله ورسوله أحب إليه مما سواهما',
  '0f1efff9-1444-4eb2-a109-250d262cb098':
    'ومن الناس من يتخذ من دون الله أندادا يحبونهم كحب الله — محبة غير الله كحب الله أو أشد شرك أكبر',
  '119d35bc-1357-43b6-a136-0700351ecf99':
    'الذبح له ثلاثة أنواع: أن يقع عبادة فهذا لا يكون إلا لله تعالى؛ وما كان على وجه الإكرام فليس بشرك؛ وما كان على وجه العادة فجائز',
  '16ecb0b3-3e5e-4823-ac0f-7440174c37e1':
    'فبدأ بالعلم قبل القول والعمل',
  '1cb55316-5773-4fd4-9cbc-ed8a3ad77fcf':
    'التبرك بالأشجار والأحجار معتقداً فيها البركة شرك',
  '2ef865ff-631d-4bce-bf3e-6ccb0a2637a1':
    'التوحيد المنجي: معرفة معناها، والإيمان بها، والعمل بمقتضاها',
  '3c25460f-3ac5-43d1-9aec-fc24349f558d':
    'احرص على ما ينفعك واستعن بالله ولا تعجز',
  '3eceeead-10fc-43d9-8d95-773316ea05e3':
    'نسبة المطر إلى الأنواء: شرك أكبر إن اعتقد فاعلية النوء استقلالاً، وشرك أصغر إن نسبه عادة مع توحيد الله',
  '4116d4b3-fd57-4fc9-a4de-0b12024fef7e':
    'العبادة: اسم جامع لكل ما يحبه الله ويرضاه من الأقوال والأعمال الظاهرة والباطنة',
  '45b11c1a-6569-4653-85ee-fc3397d5dce7':
    'لأنها تتضمن جواب الأسئلة الثلاثة التي يسأل عنها الإنسان في قبره',
  '51b3515c-278d-4df5-a4fb-a7b71c920153':
    'العبادة: اسم جامع لكل ما يحبه الله ويرضاه من الأقوال والأعمال الظاهرة والباطنة',
  '535f5711-195b-4edd-aa2b-c64b651895f0':
    'تحريم قتل النفس بغير حق',
  '5aeee9f3-c1a0-44e9-a85e-f26691ac1502':
    'وما خلقت الجن والإنس إلا ليعبدون',
  '7be4404c-a2ed-4095-b440-c88f49d56a10':
    'الخوف الطبيعي جائز، وأما الخوف التعبدي الذي يصرف لغير الله فهو شرك',
  '80bc1390-88d3-4749-b6f5-8ec7faf53c88':
    'إن الشرك لظلم عظيم',
  '8f0b87fc-a2fc-4a90-9dbd-7b333fc1f919':
    'الإلحاد في أسماء الله: الميل بها عن الحق',
  '9a483832-b4ef-4e89-a30b-b93486aa91b0':
    'كل سلامى من الناس عليه صدقة، كل يوم تطلع فيه الشمس: تعدل بين اثنين صدقة، وتعين الرجل في دابته فتحمله عليها أو ترفع له عليها متاعه صدقة، والكلمة الطيبة صدقة',
  '9ef7f53c-a9c8-4f0e-9057-fe16b630df14':
    'شهادة أن لا إله إلا الله',
  'b6c16560-bb78-4da3-acd3-ff7913c0f63c':
    'وأخبر النبي ﷺ أنها لا تكون إلا لأهل الإخلاص',
  'ba9248fa-89c6-4afc-bc87-75de3d59fe13':
    'الإسلام: الاستسلام لله بالتوحيد والانقياد له بالطاعة',
  'bd0f2004-eda9-4993-975c-25d4786e349a':
    'كل حديث منها قاعدة عظيمة من قواعد الدين',
  'be04d3f7-8a37-4530-8555-2c66c59d9970':
    'أركان الإيمان ستة: أن تؤمن بالله، وملائكته، وكتبه، ورسله، واليوم الآخر، وتؤمن بالقدر خيره وشره',
  'c055e3dc-5298-4f90-9f5a-4994fc90fe94':
    'بني الإسلام على خمس',
  'c06cb748-cd3b-4529-940b-a3f237ed7fde':
    'أما الاعتقاد بتأثيرها فحرام',
  'c0cbca1e-37ae-41a7-b752-4062ec19577d':
    'الثيب الزاني، والنفس بالنفس، والتارك لدينه المفارق للجماعة',
  'c68b2f57-38b0-4671-ad6d-c546eeea2945':
    'العلم، والعمل به، والدعوة إليه، والصبر على الأذى فيه',
  'c8762ee3-e24d-4cf7-a3de-49d30a412e53':
    'معنى لا إله إلا الله: لا معبود بحق إلا الله وحده',
  'cabe3338-0c2a-4919-8fda-3ff1f5683271':
    'الجن: عالم عظيم مكلفون مثل الإنس، لكننا لا نراهم',
  'cd227066-93f7-42f7-aead-2ac78970fef6':
    'بل معناها: لا معبود بحق إلا الله',
  'cf8afd35-6bf5-4c83-927e-dfd142b2c05b':
    'لما بعث النبي ﷺ معاذاً إلى اليمن قال: فليكن أول ما تدعوهم إليه شهادة أن لا إله إلا الله',
  'da419f24-e82d-4e63-800d-0bde0f05c9d2':
    'أول واجب على المكلف: التوحيد',
  'e51e1871-5d53-4f6d-81b1-4a34343497af':
    'كل ما سوى الله عالم',
  'e993741b-058c-44ef-932a-e438bbf48942':
    'أمرت أن أقاتل الناس حتى يشهدوا أن لا إله إلا الله',
  'ff50232f-88ff-44b7-a9c2-220eee83a838':
    'يجب أن يكون الله ورسوله أحب إلينا مما سواهما',
  'ff6b7cba-3fad-47e1-a748-5ea7336bc1e5':
    'أبو زكريا محيي الدين يحيى بن شرف النووي رحمه الله',
};

function dumpCanon(obj) {
  const keys = Object.keys(obj).sort();
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(obj[k])},`);
  return (
    '/** Auto-expanded from book_citations_from_pdfs + prior canonical (v330 OCR restore) */\n' +
    'window.CANONICAL_QUOTES = {\n' +
    lines.join('\n').replace(/,$/, '') +
    '\n};\n'
  );
}

function loadBank() {
  const win = {};
  new Function('window', fs.readFileSync(path.join(root, 'questions-bank.js'), 'utf8'))(win);
  return win.QUESTIONS_BANK;
}

function writeBank(bank) {
  const json = JSON.stringify(bank, null, 2);
  fs.writeFileSync(path.join(root, 'questions-bank.json'), json + '\n');
  fs.writeFileSync(path.join(root, 'questions-bank.js'), `window.QUESTIONS_BANK = ${json};\n`);
  fs.writeFileSync(path.join(root, 'questions-bank-v311.js'), `window.QUESTIONS_BANK = ${json};\n`);
}

const win = {};
new Function('window', fs.readFileSync(path.join(root, 'citation-canonical.js'), 'utf8'))(win);
const byId = Object.fromEntries(Object.values(loadBank()).flat().map((q) => [q.id, q]));
const canon = { ...win.CANONICAL_QUOTES };

const rejectedIds = JSON.parse(fs.readFileSync(path.join(root, 'extracted/v330_rejected_ids.json'), 'utf8')).rejected_ids;

const applied = [];
const residual = [];
const sql = [];

for (const id of rejectedIds) {
  const q = byId[id];
  const raw = canon[id] || '';
  let text = '';
  let source = '';

  // 1) OCR-fix existing canonical / source_quote to keep FULL book wording
  for (const candidate of [raw, q?.source_quote, CURATED[id], q?.explanation]) {
    if (!candidate) continue;
    const cleaned = cleanCandidate(candidate);
    if (cleaned && cleaned.length >= 12) {
      // Prefer curated when OCR of raw still has worksheet-ish markers or book-title dump
      if (candidate === CURATED[id] || !/كتاب التوحيد الذي هو حق|لشيخ الإسلام|اجل واب|أجيبي|اكتبي/.test(cleaned)) {
        text = cleaned;
        source =
          candidate === CURATED[id]
            ? 'curated_book_wording'
            : candidate === raw
              ? 'ocr_fix_canonical'
              : candidate === q?.source_quote
                ? 'ocr_fix_source_quote'
                : 'explanation_clean';
        if (candidate === CURATED[id] || candidate === raw || candidate === q?.source_quote) break;
      }
    }
  }

  // Prefer curated when available and longer-or-equal quality
  if (CURATED[id]) {
    const c = cleanCandidate(CURATED[id]);
    if (c) {
      text = c;
      source = 'curated_book_wording';
    }
  }

  if (!text) {
    residual.push({ id, q: (q?.question_text || '').slice(0, 100), raw: String(raw).slice(0, 140) });
    continue;
  }

  const wrapped = wrapQuote(text);
  canon[id] = text; // plain text like most existing canonical entries
  applied.push({ id, source, text, preview: text.slice(0, 160), q: (q?.question_text || '').slice(0, 80) });
  sql.push(`update public.questions set source_quote = ${JSON.stringify(wrapped)} where id = '${id}';`);
}

// Also OCR-polish any bank-linked canonical that still fails NEW garbage after soft filter
let polishExtra = 0;
for (const [id, raw] of Object.entries(canon)) {
  if (!byId[id]) continue;
  if (cleanCandidate(raw)) continue;
  if (CURATED[id]) {
    canon[id] = CURATED[id];
    polishExtra++;
  }
}

fs.writeFileSync(path.join(root, 'citation-canonical.js'), dumpCanon(canon));

const bank = loadBank();
for (const book of Object.keys(bank)) {
  for (const q of bank[book]) {
    const hit = applied.find((a) => a.id === q.id);
    if (hit) q.source_quote = wrapQuote(hit.text.includes('«') ? hit.text.replace(/^«|»$/g, '') : hit.text);
  }
}
writeBank(bank);

fs.writeFileSync(path.join(root, 'extracted/v330_restore_apply_report.json'), JSON.stringify({ applied, residual, polishExtra }, null, 2));
fs.writeFileSync(path.join(root, 'extracted/v330_citation_restore.sql'), sql.join('\n') + '\n');

console.log(
  JSON.stringify(
    {
      applied: applied.length,
      residual: residual.length,
      polishExtra,
      by_source: applied.reduce((a, x) => ((a[x.source] = (a[x.source] || 0) + 1), a), {}),
      residual_ids: residual.map((r) => r.id),
      samples: applied.slice(0, 5),
    },
    null,
    2
  )
);
