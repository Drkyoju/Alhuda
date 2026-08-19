#!/usr/bin/env node
/** v350: Kitab al-Tawhid screenshot fixes — book wording only, no invented ʿaqidah. */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bankPath = join(root, 'questions-bank.json');
const bank = JSON.parse(readFileSync(bankPath, 'utf8'));
const log = [];

function note(id, field, from, to) {
  log.push({ id, field, from: String(from ?? '').slice(0, 220), to: String(to ?? '').slice(0, 220) });
}
function set(q, field, next) {
  const prev = q[field];
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  note(q.id, field, prev, next);
  q[field] = next;
}

const byId = Object.fromEntries(Object.values(bank).flat().map((q) => [q.id, q]));

const PATCH = {
  // 1) Delete name عكاشة — use book incident wording (70,000 / اجعلني منهم).
  'eb80069a-736f-b2cd-a7db-4cfe0b3401ef': {
    question_text: 'الذي سبق إلى دعوة «اجعلني منهم» في حديث من يدخلون الجنة بغير حساب ولا عذاب، قال له النبي:',
    options: ['أنت منهم', 'لست منهم', 'ارجع', 'اصبر'],
    explanation: 'فقام فقال: ادع الله أن يجعلني منهم. فقال: «أنت منهم».',
    source_quote: 'فقام فقال: ادع الله أن يجعلني منهم. فقال: «أنت منهم». ثم قام رجل آخر فقال ادع الله أن يجعلني منهم فقال: سبقك بها',
  },
  'b5fecca4-b8fe-63ec-28fd-4087d1f6a403': {
    question_text: 'ثم قام رجل آخر فقال ادع الله أن يجعلني منهم فقال النبي:',
    options: ['سبقك بها', 'أنت منهم أيضا', 'كلاكما منهم', 'لم يجب'],
    explanation: 'ثم قام رجل آخر فقال ادع الله أن يجعلني منهم فقال: سبقك بها.',
    source_quote: 'ثم قام رجل آخر فقال ادع الله أن يجعلني منهم فقال: سبقك بها',
  },
  // 2) يتب → يتب منه (كتاب: لا يغفره لمن لم يتب منه)
  'e881d91f-2c37-b482-14be-391c934c16d5': {
    question_text: 'الذنب الذي لا يغفره الله لمن مات عليه ولم يتب منه هو:',
  },
  // 3) كاهن: complete hadith, no dangling «على :»
  '6d35ab9a-e6e0-b6c7-53ae-638469077f13': {
    question_text: 'من أتى كاهنا فصدقه بما يقول فقد:',
    options: ['كفر بما أنزل على محمد', 'كفر بما أنزل على موسى', 'أثم فقط', 'كفر بما أنزل على عيسى'],
    explanation: 'كفر بما أنزل على محمد.',
    source_quote: 'عن أبي هريرة: «من أتى عرافا، أو كاهنا فصدقه بما يقول، فقد كفر بما أنزل على محمد»',
  },
  // 5) الدهر fill-in kept; tashkeel/stem from book: أقلب الليل والنهار
  'e517de7c-d07a-33a1-43bc-5bc9ee685d4e': {
    question_text: 'أكمل الحديث القدسي: «أنا الدهر، أقلب الليل و___»؟',
    source_quote: 'قال الله تعالى: «يؤذيني ابن آدم يسب الدهر، وأنا الدهر أقلب الليل والنهار»',
  },
  // 7) استسقاء: book text (نجوم) — not أبي جاد / خالق
  '85561da3-6305-3089-80bf-d25205d587c5': {
    source_quote: 'تحريم الاستسقاء بالأنواء وأنه من أمور الجاهلية. وقوله: والاستسقاء بالنجوم',
  },
  // 8) رواية ثانية لا تسبوا الدهر
  '7c6aa456-10b7-13db-114f-b722476ae13a': {
    question_text: 'في رواية ثانية: «لا تسبوا الدهر فإن الله»:',
    source_quote: 'وفي رواية: «لا تسبوا الدهر؛ فإن الله هو الدهر» رواه مسلم',
  },
  // 9) الطيرة — book, not worksheet OCR
  '6e55abe0-45c5-4cb2-a74a-6f97e74dbd6f': {
    source_quote: 'أن الطيرة شرك. لما كانت الطيرة نوعا من الشرك الذي يتنافى مع التوحيد أو ينقص كماله',
  },
  'f508a223-2d15-9036-b3be-c8c4b67d067d': {
    source_quote: 'وعن ابن مسعود مرفوعا: «الطيرة شرك، الطيرة شرك» وما منا إلا ولكن الله يذهبه',
  },
};

for (const [id, fields] of Object.entries(PATCH)) {
  const q = byId[id];
  if (!q) {
    console.error('missing id', id);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(fields)) set(q, k, v);
}

// Scan tawheed: leftover عكاشة / خالق-in-خلاق-hadith / dangling kahin
for (const q of bank.tawheed || []) {
  const blob = [q.question_text, q.explanation, q.source_quote, ...(q.options || [])].join('\n');
  if (/عكاشة|عكّاشة|أوكاشة/.test(blob) && !PATCH[q.id]) {
    console.warn('remaining ukasha', q.id, q.question_text);
  }
  if (typeof q.source_quote === 'string' && /من خالق/.test(q.source_quote)) {
    set(q, 'source_quote', q.source_quote.replace(/من خالق/g, 'من خلاق'));
  }
  if (typeof q.question_text === 'string' && /ولم يتب(?!\s*منه)/.test(q.question_text) && q.book === 'tawheed') {
    set(q, 'question_text', q.question_text.replace(/ولم يتب(?!\s*منه)/g, 'ولم يتب منه'));
  }
}

function writeBankJs(path) {
  writeFileSync(path, 'window.QUESTIONS_BANK = ' + JSON.stringify(bank, null, 2) + ';\n');
}
writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n');
writeBankJs(join(root, 'questions-bank.js'));
writeBankJs(join(root, 'questions-bank-v311.js'));

function patchCanon(path) {
  let s = readFileSync(path, 'utf8');
  const canonPatch = {
    'eb80069a-736f-b2cd-a7db-4cfe0b3401ef': PATCH['eb80069a-736f-b2cd-a7db-4cfe0b3401ef'].source_quote,
    'b5fecca4-b8fe-63ec-28fd-4087d1f6a403': PATCH['b5fecca4-b8fe-63ec-28fd-4087d1f6a403'].source_quote,
    'e881d91f-2c37-b482-14be-391c934c16d5': byId['e881d91f-2c37-b482-14be-391c934c16d5'].source_quote,
    '6d35ab9a-e6e0-b6c7-53ae-638469077f13': PATCH['6d35ab9a-e6e0-b6c7-53ae-638469077f13'].source_quote,
    'e517de7c-d07a-33a1-43bc-5bc9ee685d4e': PATCH['e517de7c-d07a-33a1-43bc-5bc9ee685d4e'].source_quote,
    '85561da3-6305-3089-80bf-d25205d587c5': PATCH['85561da3-6305-3089-80bf-d25205d587c5'].source_quote,
    '7c6aa456-10b7-13db-114f-b722476ae13a': PATCH['7c6aa456-10b7-13db-114f-b722476ae13a'].source_quote,
    '6e55abe0-45c5-4cb2-a74a-6f97e74dbd6f': PATCH['6e55abe0-45c5-4cb2-a74a-6f97e74dbd6f'].source_quote,
    'f508a223-2d15-9036-b3be-c8c4b67d067d': PATCH['f508a223-2d15-9036-b3be-c8c4b67d067d'].source_quote,
    '397166c4-f1e3-44cf-b232-90e463b0966f': PATCH['6e55abe0-45c5-4cb2-a74a-6f97e74dbd6f'].source_quote,
    '8bbc9f98-83ba-45c9-bf48-000ae6bd9303': PATCH['f508a223-2d15-9036-b3be-c8c4b67d067d'].source_quote,
    'a0cd9a30-0663-ff17-2f92-32ba946394e7': 'إن الرقى والتمائم والتولة شرك',
    '1cb55316-5773-4fd4-9cbc-ed8a3ad77fcf': 'التبرك بالأشجار والأحجار معتقدا فيها البركة شرك',
  };
  for (const [id, text] of Object.entries(canonPatch)) {
    const re = new RegExp(`("${id}":\\s*")((?:\\\\.|[^"\\\\])*)(")`);
    const esc = JSON.stringify(text).slice(1, -1);
    if (re.test(s)) s = s.replace(re, `$1${esc}$3`);
    else s = s.replace(/\n\}\s*;\s*$/, `\n  "${id}": "${esc}",\n};\n`);
  }
  s = s.replace(
    /Auto-expanded from book sources \+ prior canonical \(v\d+[^\)]*\)/,
    'Auto-expanded from book sources + prior canonical (v350 tawheed screenshot fixes)'
  );
  writeFileSync(path, s);
}
patchCanon(join(root, 'citation-canonical.js'));
patchCanon(join(root, 'citation-canonical-v338.js'));

function sqlEsc(s) {
  return String(s).replace(/'/g, "''");
}
const sql = ['-- v350 tawheed screenshot fixes — apply with service_role / SQL editor.'];
const ids = new Set([...Object.keys(PATCH), ...log.map((r) => r.id)]);
for (const id of ids) {
  const q = byId[id];
  if (!q) continue;
  const opts =
    q.options == null ? 'NULL' : `'${sqlEsc(JSON.stringify(q.options))}'::jsonb`;
  sql.push(
    `UPDATE public.questions SET question_text = '${sqlEsc(q.question_text)}', explanation = '${sqlEsc(q.explanation || '')}', source_quote = '${sqlEsc(q.source_quote || '')}', options = ${opts} WHERE id = '${id}';`
  );
}
writeFileSync(join(root, 'extracted/v350_tawheed_screenshot.sql'), sql.join('\n') + '\n');
writeFileSync(join(root, 'extracted/v350_tawheed_screenshot.json'), JSON.stringify({ n: log.length, log }, null, 2));
console.log('events', log.length, 'sql', sql.length - 1);
