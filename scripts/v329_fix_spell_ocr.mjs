#!/usr/bin/env node
/**
 * v329: fix high-confidence OCR/spelling in citation-canonical + bank source_quote,
 * harden isGarbageCitation patterns via report, keep أرسل soft-bare already covered.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** id → clean canonical quote (no wrapping «» required) */
const CANON_FIXES = {
  // الهجرة
  '004bafb8-c799-4a85-a78a-46282c27ca1a':
    'الهجرة: الانتقال من بلد الشرك إلى بلد الإسلام.',
  '996dc082-6aba-408e-9709-9e2336e6e0c6':
    'الهجرة: الانتقال من بلد الشرك إلى بلد الإسلام.',
  'f9f15cec-cedd-45bc-a105-e7ce7f6ca806':
    'الهجرة: الانتقال من بلد الشرك إلى بلد الإسلام.',

  // الإحسان — was «اإلحسان ىلع لك يشء»
  '14691ce7-a4a6-4aae-b4c1-084fe8dd206c':
    'إن الله كتب الإحسان على كل شيء',

  // حديث الولاية — OCR reversed
  '74076c42-5f23-4e68-8de6-2864ca262829':
    'وما تقرب إلي عبدي بشيء أحب إلي مما افترضته عليه',
  '4c184ccc-c242-4821-a7e8-f97681fdb7e5':
    'وما تقرب إلي عبدي بشيء أحب إلي مما افترضته عليه',

  // يدعو — was «يد عو»
  'a004480b-4a29-4568-9962-95152cd0dade':
    'أخذ على هذا عشر سنين يدعو إلى التوحيد',

  // النجوم لثلاث — was «لثالث»
  '12da482a-40d3-42ed-88e9-bba88f44f521':
    'خلق الله هذه النجوم لثلاث: زينة للسماء، ورجوماً للشياطين، وعلامات يهتدى بها',
  '83f5092b-7e8e-43b8-a99e-ee497a4cc30a':
    'خلق الله هذه النجوم لثلاث: زينة للسماء، ورجوماً للشياطين، وعلامات يهتدى بها',
  '9c641ce1-8cb7-44c9-a944-d99e884599ac':
    'خلق الله هذه النجوم لثلاث: زينة للسماء، ورجوماً للشياطين، وعلامات يهتدى بها',

  // حرمت الظلم — OCR garbage
  'cb18a215-07dd-4621-ab08-773096785520':
    'يا عبادي إني حرمت الظلم على نفسي وجعلته بينكم محرما',

  // تغيير المنكر
  'e5367815-958c-4ec4-9138-ed6455725381':
    'من رأى منكم منكراً فليغيره بيده، فإن لم يستطع فبلسانه، فإن لم يستطع فبقلبه',

  // مصارف الزكاة — drop presentation-form garbage; keep readable prose
  'd4c2155a-db1c-4adc-aa8a-776f7991c93b':
    'مصارف الزكاة هي المذكورة في قوله تعالى في سورة التوبة.',

  // بسنيت → بسنتي
  '521e7ce5-fff3-455b-ad0d-92d7cd87b029':
    'فعليكم بسنتي وسنة الخلفاء الراشدين المهديين',

  // وفاة المؤلف
  '5963941f-e801-4c27-8a42-2e1bc89e00f6':
    'توفي عام 1206 هجرية فرحمه الله رحمة واسعة وجزاه عن الإسلام والمسلمين خير الجزاء',

  // دلواء → الدواء
  '7bf71509-12cb-415e-9974-2ea1b237c14a':
    'الدواء اللفظي أن يقول: أعوذ بالله من الشيطان الرجيم',
  'c657e959-434b-4c9c-b1c7-60206d85138d':
    'الدواء اللفظي أن يقول: أعوذ بالله من الشيطان الرجيم',

  // يف → في (صدقة / السلامى)
  '9a483832-b4ef-4e89-a30b-b93486aa91b0':
    'كل سلامى من الناس عليه صدقة، كل يوم تطلع فيه الشمس: تعدل بين اثنين صدقة، وتعين الرجل في دابته فتحمله عليها أو ترفع له عليها متاعه صدقة، والكلمة الطيبة صدقة',
};

/** Bank questions that need source_quote synced to matching clean text */
const BANK_SOURCE_QUOTE = {
  '004bafb8-c799-4a85-a78a-46282c27ca1a':
    '«الهجرة: الانتقال من بلد الشرك إلى بلد الإسلام.»',
  '996dc082-6aba-408e-9709-9e2336e6e0c6':
    '«الهجرة: الانتقال من بلد الشرك إلى بلد الإسلام.»',
  '14691ce7-a4a6-4aae-b4c1-084fe8dd206c':
    '«إن الله كتب الإحسان على كل شيء»',
  '74076c42-5f23-4e68-8de6-2864ca262829':
    '«وما تقرب إلي عبدي بشيء أحب إلي مما افترضته عليه»',
  'a004480b-4a29-4568-9962-95152cd0dade':
    '«أخذ على هذا عشر سنين يدعو إلى التوحيد»',
  'cb18a215-07dd-4621-ab08-773096785520':
    '«يا عبادي إني حرمت الظلم على نفسي وجعلته بينكم محرما»',
  'e5367815-958c-4ec4-9138-ed6455725381':
    '«من رأى منكم منكراً فليغيره بيده، فإن لم يستطع فبلسانه، فإن لم يستطع فبقلبه»',
  '521e7ce5-fff3-455b-ad0d-92d7cd87b029':
    '«فعليكم بسنتي وسنة الخلفاء الراشدين المهديين»',
  '5963941f-e801-4c27-8a42-2e1bc89e00f6':
    '«توفي عام 1206 هجرية فرحمه الله رحمة واسعة وجزاه عن الإسلام والمسلمين خير الجزاء»',
  '7bf71509-12cb-415e-9974-2ea1b237c14a':
    '«الدواء اللفظي أن يقول: أعوذ بالله من الشيطان الرجيم»',
  'c657e959-434b-4c9c-b1c7-60206d85138d':
    '«الدواء اللفظي أن يقول: أعوذ بالله من الشيطان الرجيم»',
  '9a483832-b4ef-4e89-a30b-b93486aa91b0':
    '«كل سلامى من الناس عليه صدقة… والكلمة الطيبة صدقة»',
};

function loadCanon() {
  const src = fs.readFileSync(path.join(root, 'citation-canonical.js'), 'utf8');
  const obj = Function(`return (${src.replace(/^[\s\S]*?=\s*/, '').replace(/;?\s*$/, '')})`)();
  return { src, obj };
}

function dumpCanon(obj) {
  const keys = Object.keys(obj).sort();
  const lines = keys.map((k) => {
    const v = JSON.stringify(obj[k]);
    return `  ${JSON.stringify(k)}: ${v},`;
  });
  return (
    '/** Auto-expanded from book_citations_from_pdfs + prior canonical */\n' +
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
  fs.writeFileSync(
    path.join(root, 'questions-bank.js'),
    `window.QUESTIONS_BANK = ${json};\n`
  );
  fs.writeFileSync(
    path.join(root, 'questions-bank-v311.js'),
    `window.QUESTIONS_BANK = ${json};\n`
  );
}

const { obj } = loadCanon();
const applied = [];
for (const [id, text] of Object.entries(CANON_FIXES)) {
  const prev = obj[id];
  if (prev === text || prev === `«${text}»`) continue;
  obj[id] = text.startsWith('«') ? text : text;
  applied.push({ id, from: String(prev || '').slice(0, 80), to: text.slice(0, 80) });
}
fs.writeFileSync(path.join(root, 'citation-canonical.js'), dumpCanon(obj));

const bank = loadBank();
let bankHits = 0;
for (const book of Object.keys(bank)) {
  for (const q of bank[book]) {
    if (BANK_SOURCE_QUOTE[q.id]) {
      q.source_quote = BANK_SOURCE_QUOTE[q.id];
      bankHits++;
    }
  }
}
writeBank(bank);

const sql = [
  '-- v329 OCR/spelling citation fixes',
  ...Object.entries(BANK_SOURCE_QUOTE).map(
    ([id, sq]) =>
      `update public.questions set source_quote = ${JSON.stringify(sq)} where id = '${id}';`
  ),
  // orphans / canon-only still in DB if present
  ...Object.entries(CANON_FIXES)
    .filter(([id]) => !BANK_SOURCE_QUOTE[id])
    .map(
      ([id, text]) =>
        `update public.questions set source_quote = ${JSON.stringify(
          text.startsWith('«') ? text : `«${text}»`
        )} where id = '${id}';`
    ),
].join('\n');
fs.writeFileSync(path.join(root, 'extracted/v329_spell_ocr_fixes.sql'), sql + '\n');

const report = {
  note_ar:
    'تصحيح أخطاء إملائية/OCR ظاهرة على الاستشهاد المعروض: االنتقال، يد عو، ىلع/يشء، لثالث، نصوص معكوسة',
  canon_fixed: applied.length,
  bank_source_quote_set: bankHits,
  examples: applied.slice(0, 20),
  ids: Object.keys(CANON_FIXES),
};
fs.writeFileSync(
  path.join(root, 'extracted/v329_spell_ocr_report.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report, null, 2));
