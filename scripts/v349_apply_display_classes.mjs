#!/usr/bin/env node
/** v349: NEW on-screen classes (quotes/OCR/TF leftovers/hanging colons). No invented book prose. */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bankPath = join(root, 'questions-bank.json');
const bank = JSON.parse(readFileSync(bankPath, 'utf8'));
const byId = Object.fromEntries(Object.values(bank).flat().map((q) => [q.id, q]));
const log = [];
function note(id, field, reason, from, to) {
  log.push({
    id,
    field,
    reason,
    from: String(from ?? '').slice(0, 200),
    to: String(to ?? '').slice(0, 200),
  });
}

function polishPunct(s) {
  if (s == null) return s;
  return String(s)
    .replace(/ل إله إل الله/g, 'لا إله إلا الله')
    .replace(/ل إله إلا الله/g, 'لا إله إلا الله')
    .replace(/النبي ؛/g, 'النبي')
    .replace(/قال :/g, 'قال:')
    .replace(/النبي :/g, 'النبي:')
    .replace(/سحر ،/g, 'سحر،')
    .replace(/شيئا ،/g, 'شيئا،')
    .replace(/شيئا؛ دخل/g, 'شيئا؛ دخل')
    .replace(/به شيئا ؛/g, 'به شيئا؛');
}

function closeQuotes(s) {
  if (s == null) return s;
  let t = String(s);
  const open = (t.match(/«/g) || []).length;
  const close = (t.match(/»/g) || []).length;
  if (open === close + 1 && !t.includes('»')) {
    t = t.replace(/[،,]\s*$/, '').trimEnd() + '»';
  } else if (open === close + 1) {
    t = t.replace(/[،,]\s*$/, '').trimEnd() + '»';
  }
  return t;
}

const QUOTE_FIX = {
  '4d44fecd-56a7-0a37-f7ef-8592d55ffa1b':
    'وعن طارق بن شهاب: أن رسول الله قال: «دخل الجنة رجل في ذباب ودخل النار رجل في ذباب»',
  'ad766d97-4821-ee7e-1a31-d35abbabb781':
    'وعن طارق بن شهاب: أن رسول الله قال: «دخل الجنة رجل في ذباب ودخل النار رجل في ذباب»',
  '81b93c71-d614-4610-8da3-86aa7e75fa90':
    'وعن جابر: أن رسول الله قال: «من لقي الله لا يشرك به شيئا؛ دخل الجنة»',
  'f9b205c9-d036-dcce-37a6-92d32684064b':
    'وعن جابر: أن رسول الله قال: «من لقي الله لا يشرك به شيئا؛ دخل الجنة»',
  '87c0642e-bfe5-4aa1-8843-14455b9f2230':
    'وقوله: «ومن سحر، فقد أشرك، ومن تعلق شيئا وكل إليه»',
  'a65b90a9-be7c-b2b5-de1f-1ed22818eedf':
    'وقوله: «ومن سحر، فقد أشرك، ومن تعلق شيئا وكل إليه»',
  '6d35ab9a-e6e0-b6c7-53ae-638469077f13':
    'عن أبي هريرة: «من أتى عرافا، أو كاهنا فصدقه بما يقول، فقد كفر بما أنزل على محمد»',
  '1e0f8eb8-fb5d-489e-9d37-f0572539b34e':
    'وفي الصحيح عن النبي أنه قال: «من قال: لا إله إلا الله، وكفر بما يعبد من دون الله»',
};

const STEM_FIX = {
  'c5249eee-758d-4e2e-8f28-b0f9306100cc':
    'قال النبي: الدعاء هو العبادة. ماذا يعني ذلك؟',
  'cf8afd35-WAIT': null,
};

function applyStr(q, field, next, reason) {
  const prev = q[field];
  if (next === prev) return;
  note(q.id, field, reason, prev, next);
  q[field] = next;
}

for (const arr of Object.values(bank)) {
  for (const q of arr) {
    if (QUOTE_FIX[q.id] && typeof q.source_quote === 'string') {
      applyStr(q, 'source_quote', QUOTE_FIX[q.id], 'close/complete truncated citation from sibling bank wording');
    }
    if (q.type === 'tf' && Array.isArray(q.options) && q.options.length > 2) {
      note(q.id, 'options', 'tf_leftover_mc_options', JSON.stringify(q.options), 'null');
      q.options = null;
    }
    for (const f of ['question_text', 'explanation', 'source_quote']) {
      if (typeof q[f] !== 'string') continue;
      let t = polishPunct(q[f]);
      if (f === 'source_quote' && !QUOTE_FIX[q.id]) t = closeQuotes(t);
      if (t !== q[f]) applyStr(q, f, t, 'punct/ocr/unmatched-quote');
    }
  }
}

function loadCanon(path) {
  const src = readFileSync(path, 'utf8');
  const win = {};
  new Function('window', src)(win);
  return win;
}

function isOcrCanon(s) {
  return /األ|اإل|رمحه|والصالة|اإلسال||||عل ين|األمة|لش يخ/.test(String(s || ''));
}

for (const name of ['citation-canonical.js', 'citation-canonical-v338.js']) {
  const p = join(root, name);
  const win = loadCanon(p);
  let n = 0;
  for (const [id, v] of Object.entries(win.CANONICAL_QUOTES)) {
    const q = byId[id];
    let nv = v;
    if (QUOTE_FIX[id]) nv = QUOTE_FIX[id];
    else if (typeof nv === 'string') {
      nv = polishPunct(nv);
      nv = closeQuotes(nv);
    }
    if (isOcrCanon(String(v || ''))) {
      if (q?.source_quote && !isOcrCanon(q.source_quote)) nv = q.source_quote;
      else nv = ''; // do not invent book text; garbage must not paint on screen
    }
    if (nv !== v) {
      win.CANONICAL_QUOTES[id] = nv;
      n++;
      note(id, 'canonical:' + name, 'align citation display', v, nv);
    }
  }
  writeFileSync(
    p,
    '/** Auto-expanded from book sources + prior canonical (v349 display classes) */\n' +
      'window.CANONICAL_QUOTES = ' +
      JSON.stringify(win.CANONICAL_QUOTES, null, 2) +
      ';\n'
  );
  console.log('canonical', name, n);
}

const json = JSON.stringify(bank, null, 2) + '\n';
const bankJs = `window.QUESTIONS_BANK = ${JSON.stringify(bank, null, 2)};\n`;
writeFileSync(bankPath, json);
writeFileSync(join(root, 'questions-bank.js'), bankJs);
writeFileSync(join(root, 'questions-bank-v311.js'), bankJs);

function sqlEsc(s) {
  return String(s).replace(/'/g, "''");
}
const sql = ['-- v349 display classes — apply in Supabase SQL editor (service_role).'];
const grouped = new Map();
for (const row of log) {
  if (String(row.field).startsWith('canonical')) continue;
  if (!grouped.has(row.id)) grouped.set(row.id, new Set());
  grouped.get(row.id).add(row.field);
}
for (const [id, fields] of grouped) {
  const q = byId[id];
  if (!q) continue;
  const sets = [];
  if (fields.has('question_text')) sets.push(`question_text = '${sqlEsc(q.question_text)}'`);
  if (fields.has('explanation')) sets.push(`explanation = '${sqlEsc(q.explanation || '')}'`);
  if (fields.has('source_quote')) sets.push(`source_quote = '${sqlEsc(q.source_quote || '')}'`);
  if (fields.has('options'))
    sets.push(
      q.options == null
        ? 'options = NULL'
        : `options = '${sqlEsc(JSON.stringify(q.options))}'::jsonb`
    );
  if (sets.length) sql.push(`UPDATE public.questions SET ${sets.join(', ')} WHERE id = '${id}';`);
}
writeFileSync(join(root, 'extracted/v349_display_classes.sql'), sql.join('\n') + '\n');
writeFileSync(join(root, 'extracted/v349_display_classes.json'), JSON.stringify({ n: log.length, log }, null, 2));
console.log('events', log.length, 'sql', sql.length - 1);
