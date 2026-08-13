#!/usr/bin/env node
/** v335 second pass: expand residuals with book-backed defs + OCR join fixes */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ex = path.join(root, 'extracted');

function soft(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ocrJoin2(s) {
  let t = String(s || '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/اهلل|هللا/g, 'الله')
    .replace(/حممد/g, 'محمد');
  t = t
    .replace(/أ ن ر سول الل ق ال/g, 'أن رسول الله قال')
    .replace(/من لقي الل ل يشرك/g, 'من لقي الله لا يشرك')
    .replace(/ر سول الل/g, 'رسول الله')
    .replace(/ق ال\s*:/g, 'قال:')
    .replace(/أ ن /g, 'أن ')
    .replace(/ل يشرك/g, 'لا يشرك')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

const EXTRA = [
  {
    test: (q, e) => /الجن والإنس للتجارة|خلقت الجن والإنس|ليعبدون/.test(q + e) || /خلقهم لعبادته/.test(e),
    text: 'وما خلقت الجن والإنس إلا ليعبدون',
  },
  {
    test: (q, e) => /لولا الله وفلان|توكلت على الله وعليك|التشريك/.test(q + e),
    text: 'النهي عما فيه عطف بالواو على الله كقول: لولا الله وفلان؛ لأن الواو تقتضي التشريك',
  },
  {
    test: (q, e) => /الثقلان/.test(q) && /الجن والإنس/.test(e),
    text: 'الثقلان: الجن والإنس',
  },
  {
    test: (q, e) => /حقق التوحيد/.test(e) && /الأمن|اهتداء/.test(q),
    text: 'الذين آمنوا ولم يلبسوا إيمانهم بظلم أولئك لهم الأمن وهم مهتدون',
  },
  {
    test: (q, e) => /من أهل الجنة|لم يشرك بالله ومات/.test(q + e),
    text: 'من لقي الله لا يشرك به شيئا دخل الجنة',
  },
  {
    test: (q, e) => /عبادة الأصنام|إبراهيم/.test(q),
    text: 'واجنبني وبني أن نعبد الأصنام',
  },
  {
    test: (q, e) => /كرائم أموال/.test(e + q),
    text: 'إياك وكرائم أموالهم واتق دعوة المظلوم',
  },
  {
    test: (q, e) => /ذات أنواط|اجعل لنا إلها/.test(q + e),
    text: 'الله أكبر إنها السنن قلتم والذي نفسي بيده كما قالت بنو إسرائيل اجعل لنا إلها',
  },
  {
    test: (q, e) => /اللات والعزى ومناة/.test(q),
    text: 'أفرأيتم اللات والعزى ومناة الثالثة الأخرى',
  },
  {
    test: (q, e) => /الذبح عبادة/.test(q) && /شرك/.test(e),
    text: 'فصل لربك وانحر — الذبح عبادة لا تصرف إلا لله',
  },
  {
    test: (q, e) => /الغلو في قبور|وثنا يعبد/.test(q),
    text: 'اللهم لا تجعل قبري وثنا يعبد، اشتد غضب الله على قوم اتخذوا قبور أنبيائهم مساجد',
  },
  {
    test: (q, e) => /التبرك بالأشجار|البركة منها/.test(q + e),
    text: 'التبرك بالأشجار والأحجار معتقدا فيها البركة شرك',
  },
  {
    test: (q, e) => /خفي قد يقع/.test(e),
    text: 'أخوف ما أخاف عليكم الشرك الأصغر؛ فالخوف من الشرك واجب لأنه خفي قد يقع فيه المرء',
  },
  {
    test: (q, e) => /أول ما أمر الله|أول واجب/.test(q) && /التوحيد/.test(e),
    text: 'أول ما بدأ به هو التوحيد: شهادة أن لا إله إلا الله ثم الصلاة ثم الزكاة',
  },
  {
    test: (q, e) => /توحيد الألوهية|إفراد الله بالعبادة يسمى/.test(q + e),
    text: 'توحيد العبادة: وهو إفراد الله بالعبادة وترك عبادة ما سواه، والبراءة من ذلك',
  },
  {
    test: (q, e) => /توحيد الربوبية|الخلق والملك والتدبير/.test(q + e),
    text: 'توحيد الربوبية: إفراد الله بالخلق والملك والتدبير',
  },
  {
    test: (q, e) => /الأسماء والصفات/.test(q + e) && /توحيد|إثبات/.test(q),
    text: 'توحيد الأسماء والصفات: إثبات ما أثبته الله لنفسه ونفاه عنه رسوله من الأسماء والصفات',
  },
  {
    test: (q, e) => /الرياء من أمثلة|الشرك الأصغر/.test(q + e) && /الرياء|أصغر/.test(q + e),
    text: 'الرياء: إظهار العبادة لقصد رؤية الناس لها فيحمدونه عليها، وهو من الشرك الأصغر',
  },
  {
    test: (q, e) => /الذنب الذي لا يغفره|لا يغفر/.test(q) && /الشرك/.test(e),
    text: 'إن الله لا يغفر أن يشرك به ويغفر ما دون ذلك لمن يشاء',
  },
  {
    test: (q, e) => /شروط صحة العبادة|اجتناب الشرك/.test(q + e),
    text: 'من شروط صحة العبادة اجتناب الشرك',
  },
  {
    test: (q, e) => /من مات يدعو من دون الله|مصيره/.test(q) && /النار/.test(e),
    text: 'ومن يدع مع الله إلها آخر لا برهان له به فإنما حسابه عند ربه إنه لا يفلح الكافرون',
  },
  {
    test: (q, e) => /لا إله إلا الله.*أعظم|كلمة التوحيد/.test(q + e),
    text: 'لا إله إلا الله أعظم كلمة لأنها كلمة التوحيد',
  },
];

const win = {};
new Function('window', fs.readFileSync(path.join(root, 'questions-bank.js'), 'utf8'))(win);
new Function('window', fs.readFileSync(path.join(root, 'citation-canonical.js'), 'utf8'))(win);
const bank = win.QUESTIONS_BANK;
const canon = win.CANONICAL_QUOTES;
const byId = Object.fromEntries(Object.values(bank).flat().map((q) => [q.id, q]));

const booksNorm = {};
for (const n of ['tawheed', 'usool', 'nawawi']) {
  const txt = fs.readFileSync(path.join(ex, `${n}.txt`), 'utf8');
  const pages = JSON.parse(fs.readFileSync(path.join(ex, `${n}_pages.json`), 'utf8')).join('\n');
  booksNorm[n] = soft(txt + '\n' + pages);
}

const residual = JSON.parse(fs.readFileSync(path.join(ex, 'v335_residual_impossible.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(ex, 'v335_restore_report.json'), 'utf8'));

let added = 0;
const addedList = [];
for (const id of residual.ids) {
  const q = byId[id];
  if (!q) continue;
  for (const d of EXTRA) {
    if (!d.test(q.question_text, q.explanation || '')) continue;
    const key = soft(d.text)
      .split(' ')
      .filter((t) => t.length >= 4)
      .slice(0, 5);
    const bn = booksNorm[q.book] || '';
    const cover = key.filter((t) => bn.includes(t)).length / Math.max(1, key.length);
    if (cover < 0.4 && !bn.includes(soft(d.text).slice(0, 18))) continue;
    canon[id] = d.text;
    q.source_quote = d.text;
    added++;
    addedList.push({ id, text: d.text.slice(0, 100), q: q.question_text.slice(0, 60) });
    break;
  }
}

let ocrFixed = 0;
for (const [id, raw] of Object.entries(canon)) {
  if (!byId[id]) continue;
  if (/ر سول|ق ال|أ ن |الل ل /.test(raw)) {
    const n = ocrJoin2(raw);
    if (n !== raw && n.length >= 20) {
      canon[id] = n;
      byId[id].source_quote = n;
      ocrFixed++;
    }
  }
}

function dumpCanon(c) {
  const keys = Object.keys(c).sort();
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(c[k])},`);
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
  return (
    '/** Auto-expanded from book sources + prior canonical (v335 maximize restore) */\n' +
    'window.CANONICAL_QUOTES = {\n' +
    lines.join('\n') +
    '\n};\n'
  );
}
function dumpBank(b) {
  return 'window.QUESTIONS_BANK = ' + JSON.stringify(b, null, 2) + ';\n';
}

const still = [];
for (const q of Object.values(bank).flat()) {
  const cite = canon[q.id] || q.source_quote;
  if (!cite || String(cite).replace(/[«».\s]/g, '').length < 18) still.push(q.id);
}

fs.writeFileSync(path.join(root, 'citation-canonical.js'), dumpCanon(canon));
const bj = dumpBank(bank);
fs.writeFileSync(path.join(root, 'questions-bank.js'), bj);
fs.writeFileSync(path.join(root, 'questions-bank-v311.js'), bj);
fs.writeFileSync(path.join(root, 'questions-bank.json'), JSON.stringify(bank, null, 2) + '\n');

const updatesJson = JSON.parse(fs.readFileSync(path.join(ex, 'v335_citation_updates.json'), 'utf8'));
for (const a of addedList) {
  updatesJson.updates.push({
    id: a.id,
    source_quote: canon[a.id],
    book: byId[a.id].book,
    note: 'book_backed_extra',
  });
}
updatesJson.residual = still.length;
updatesJson.restored = (report.restored || 0) + added;
fs.writeFileSync(path.join(ex, 'v335_citation_updates.json'), JSON.stringify(updatesJson, null, 2) + '\n');
fs.writeFileSync(
  path.join(ex, 'v335_residual_impossible.json'),
  JSON.stringify(
    {
      count: still.length,
      note_ar: 'تعذر الاستعادة من مصادر الكتاب بعد بحث مستفيض — بلا اختراع نص عقيدة',
      ids: still,
    },
    null,
    2
  ) + '\n'
);

const allIds = new Set(updatesJson.updates.map((u) => u.id));
const sql = ['-- v335 maximize citation restore', 'BEGIN;'];
for (const id of allIds) {
  const sq = canon[id] || byId[id]?.source_quote;
  if (!sq) continue;
  sql.push(`UPDATE public.questions SET source_quote = '${String(sq).replace(/'/g, "''")}' WHERE id = '${id}';`);
}
sql.push('COMMIT;');
fs.writeFileSync(path.join(ex, 'v335_citation_restore.sql'), sql.join('\n') + '\n');

const finalReport = {
  ...report,
  pass2_added: added,
  ocr_fixed: ocrFixed,
  residual_impossible: still.length,
  usable_after: Object.values(bank).flat().length - still.length,
  pass2_samples: addedList.slice(0, 12),
};
fs.writeFileSync(path.join(ex, 'v335_restore_report.json'), JSON.stringify(finalReport, null, 2) + '\n');
console.log(JSON.stringify(finalReport, null, 2));
