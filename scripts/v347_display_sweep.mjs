#!/usr/bin/env node
/** v347: display-text sweep — all books. Do not invent book prose. */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bankPath = join(root, 'questions-bank.json');
const bank = JSON.parse(readFileSync(bankPath, 'utf8'));

const STUB_TAIL =
  /(?:هو المعنى الصحيح المذكور في شرح الكتاب لهذه الكلمة\/المصطلح|هو ما ثبت في لفظ الحديث\/الأثر كما أورده الكتاب|الموضع الصحيح الذي استدل به المؤلف في هذا الموطن)\.?\s*$/;
const STUB_WHOLE =
  /^(?:هذه من فوائد حديث|الحكم الصحيح هو\s*«|هذا ما جاء في حديث معاذ)/;

const log = [];
function note(id, book, reason, field, from, to) {
  log.push({
    id,
    book,
    reason,
    field,
    from: String(from ?? '').slice(0, 160),
    to: String(to ?? '').slice(0, 160),
  });
}

function destub(s) {
  if (s == null) return s;
  let t = String(s).trim();
  if (!t) return t;
  if (STUB_WHOLE.test(t.replace(/^«/, ''))) return '';
  if (STUB_TAIL.test(t)) {
    t = t.replace(STUB_TAIL, '').trim();
    t = t.replace(/^«/, '').replace(/»$/, '').trim();
    // broken leading quote leftovers: التذلل والخضوع»
    t = t.replace(/»$/g, '').trim();
  }
  return t;
}

function reorderShadda(s) {
  if (!s) return s;
  // consonant + vowel + shadda → consonant + shadda + vowel
  return s.replace(
    /([\u0621-\u064A\u0671])([\u064B-\u0652])(\u0651)/g,
    '$1$3$2'
  );
}

function allahShaddaInAyah(s) {
  if (!s || !/[﴾﴿]/.test(s)) return s;
  return s.replace(/[﴾﴿][^﴾﴿]*[﴾﴿]/g, (chunk) =>
    chunk.replace(/الله/g, 'اللّه')
  );
}

function sqlEsc(s) {
  return String(s).replace(/'/g, "''");
}

const SPECIFIC = {
  'e51e1871-5d53-4f6d-81b1-4a34343497af': {
    question_text: 'ما معنى العالم؟',
    reason: 'حذف قوسين زائدين (العالم) — نمط النسك',
  },
  '42842c86-b2e8-6c93-7a98-68cc42b89f2d': {
    question_text: 'إثبات ما أثبته الله لنفسه هو توحيد:',
    reason: 'منع تسريب الجواب «الأسماء والصفات» في نص السؤال',
  },
  'ab907a81-fd29-4415-f55b-c9feb0449f8e': {
    options: [
      'العمل الكثير ولو خالف السنة',
      'أول مرتبة الإسلام',
      'العمل الموافق لسنة رسول الله',
      'الصلوات الخمس المفروضة',
    ],
    correct_index: 2,
    explanation: 'العمل الصالح هو العمل الموافق لسنة رسول الله.',
    source_quote: 'العمل الصالح هو العمل الموافق لسنة رسول الله.',
    reason: 'خيار مسروق من تعريف الإحسان',
  },
  'd510b762-1fe3-2f22-dd1e-88163a00e52b': {
    question_text: 'الدليل على وجوب الدعوة إلى الله نزل في سورة:',
    explanation:
      'سورة العصر. قال تعالى: ﴿وَالْعَصْرِ إِنَّ الْإِنسَانَ لَفِي خُسْرٍ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ﴾.',
    source_quote:
      'والعصر إن الإنسان لفي خسر إلا الذين آمنوا وعملوا الصالحات وتواصوا بالحق وتواصوا بالصبر',
    reason: 'استشهاد مقطوع بلا آية — إكمال آية العصر (قرآن) كما يستدل بها الكتاب',
  },
  '323ba563-ffd8-455e-8551-dfc13d4656c3': {
    source_quote: 'شيخ الإسلام محمد بن عبد الوهاب التميمي رحمه الله.',
    reason: 'تنظيف نسب OCR في الاستشهاد',
  },
  '971de374-b952-4843-bd00-fbbb9f29be49': {
    source_quote: 'مولده: ولد في بلدة العيينة سنة 1115 هجرية.',
    reason: 'حذف سؤال متسرب «كيف كانت نشأة المؤلف» من الاستشهاد',
  },
  '390a98fa-8d3c-4e1a-9f0a-placeholder': {},
  '3de5c20f-2c8a-4f0e-placeholder2': {},
  '4fb3f9eb-7397-0855-30d8-8a6bfd82d626': {
    question_text: 'من فوائد حديث الزهد:',
    reason: 'نص السؤال كان هو نفسه الخيار الصحيح',
  },
  'c24fc4ba-bfe7-2b9e-7afb-bcb17b18d1a9': {
    source_quote:
      'الشرك الأكبر: هو أن يسوّي غير الله بالله فيما هو من خصائص الله',
    reason: 'OCR ييسوي → يسوّي',
  },
};

// fill real ids from bank for OCR items we know
for (const arr of Object.values(bank)) {
  for (const q of arr) {
    if (q.id.startsWith('390a98fa')) {
      SPECIFIC[q.id] = {
        source_quote: 'مولده: ولد في بلدة العيينة سنة 1115 هجرية.',
        reason: 'حذف سؤال متسرب من الاستشهاد',
      };
    }
    if (q.id.startsWith('3de5c20f')) {
      SPECIFIC[q.id] = {
        question_text: 'كم عمر النبي؟',
        source_quote: 'وله من العمر ثلاث وستون سنة.',
        reason: 'OCR ثلث→ثلاث؛ مسافة زائدة في السؤال',
      };
    }
  }
}

const counts = { tawheed: 0, usool: 0, nawawi: 0 };

for (const [book, arr] of Object.entries(bank)) {
  for (const q of arr) {
    const spec = SPECIFIC[q.id];
    if (spec) {
      for (const f of [
        'question_text',
        'explanation',
        'source_quote',
        'options',
        'correct_index',
      ]) {
        if (spec[f] !== undefined && JSON.stringify(q[f]) !== JSON.stringify(spec[f])) {
          note(q.id, book, spec.reason, f, q[f], spec[f]);
          q[f] = spec[f];
          counts[book] = (counts[book] || 0) + 1;
        }
      }
    }
    for (const f of ['question_text', 'explanation', 'source_quote']) {
      const before = q[f];
      let after = destub(before);
      after = reorderShadda(after);
      after = allahShaddaInAyah(after);
      if (f === 'source_quote' && after && /ييسوي/.test(after)) {
        after = after.replace(/ييسوي/g, 'يسوّي');
      }
      if (String(before ?? '') !== String(after ?? '')) {
        note(q.id, book, 'destub/haraka/ayah-الله', f, before, after);
        q[f] = after;
        counts[book] = (counts[book] || 0) + 1;
      }
    }
    if (Array.isArray(q.options)) {
      const nb = q.options.map((o) => reorderShadda(destub(o)));
      if (JSON.stringify(nb) !== JSON.stringify(q.options)) {
        note(q.id, book, 'options destub/haraka', 'options', q.options, nb);
        q.options = nb;
        counts[book] = (counts[book] || 0) + 1;
      }
    }
  }
}

function destubCanonObj(obj) {
  let n = 0;
  for (const [id, v] of Object.entries(obj)) {
    if (typeof v !== 'string') continue;
    let nv = destub(v);
    nv = reorderShadda(nv);
    nv = allahShaddaInAyah(nv);
    nv = nv.replace(/ييسوي/g, 'يسوّي');
    if (nv !== v) {
      obj[id] = nv;
      n++;
    }
  }
  return n;
}

function loadCanon(path) {
  const src = readFileSync(path, 'utf8');
  const win = {};
  new Function('window', src)(win);
  return { win, src };
}

const json = JSON.stringify(bank, null, 2) + '\n';
const bankJs = `window.QUESTIONS_BANK = ${JSON.stringify(bank, null, 2)};\n`;
writeFileSync(bankPath, json);
writeFileSync(join(root, 'questions-bank.js'), bankJs);
writeFileSync(join(root, 'questions-bank-v311.js'), bankJs);

for (const name of ['citation-canonical.js', 'citation-canonical-v338.js']) {
  const p = join(root, name);
  const { win } = loadCanon(p);
  const n = destubCanonObj(win.CANONICAL_QUOTES);
  const out =
    '/** Auto-expanded from book sources + prior canonical (v347 display sweep) */\n' +
    'window.CANONICAL_QUOTES = ' +
    JSON.stringify(win.CANONICAL_QUOTES, null, 2) +
    ';\n';
  writeFileSync(p, out);
  console.log('canonical destub', name, n);
}

writeFileSync(
  join(root, 'extracted/v347_display_sweep.json'),
  JSON.stringify({ counts, n: log.length, log }, null, 2)
);

const byId = new Map();
for (const row of log) {
  if (!byId.has(row.id)) byId.set(row.id, []);
  byId.get(row.id).push(row);
}

const sql = [
  '-- v347 display sweep — apply in Supabase SQL editor (service_role).',
  '-- Bundle-first app also ships questions-bank-v311.js; keep IDs aligned.',
];
for (const [id, rows] of byId) {
  const q = Object.values(bank)
    .flat()
    .find((x) => x.id === id);
  if (!q) continue;
  const sets = [];
  const fields = new Set(rows.map((r) => r.field));
  if (fields.has('question_text'))
    sets.push(`question_text = '${sqlEsc(q.question_text)}'`);
  if (fields.has('explanation'))
    sets.push(`explanation = '${sqlEsc(q.explanation || '')}'`);
  if (fields.has('source_quote'))
    sets.push(`source_quote = '${sqlEsc(q.source_quote || '')}'`);
  if (fields.has('options'))
    sets.push(`options = '${sqlEsc(JSON.stringify(q.options))}'::jsonb`);
  if (fields.has('correct_index'))
    sets.push(`correct_index = ${q.correct_index}`);
  if (!sets.length) continue;
  sql.push(`UPDATE public.questions SET ${sets.join(', ')} WHERE id = '${id}';`);
}
writeFileSync(join(root, 'extracted/v347_display_sweep_supabase.sql'), sql.join('\n') + '\n');

console.log('field-change events', log.length);
console.log('counts', counts);
console.log('unique ids', byId.size);
console.log('sql updates', sql.length - 2);
