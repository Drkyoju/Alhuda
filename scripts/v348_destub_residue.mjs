#!/usr/bin/env node
/** v348: strip ONLY destub leftover «…» هو + stacked shadda. Do not unwrap real quotes. */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bankPath = join(root, 'questions-bank.json');
const bank = JSON.parse(readFileSync(bankPath, 'utf8'));

function reorderShadda(s) {
  if (!s) return s;
  return s.replace(
    /([\u0621-\u064A\u0671])([\u064B-\u0652])(\u0651)/g,
    '$1$3$2'
  );
}

function stripHoResidue(s) {
  if (s == null) return s;
  return String(s).replace(/»\s*هو\s*$/g, '').trim();
}

function clean(s) {
  if (s == null) return s;
  return reorderShadda(stripHoResidue(s));
}

const log = [];
function note(id, field, from, to) {
  log.push({ id, field, from: String(from ?? '').slice(0, 180), to: String(to ?? '').slice(0, 180) });
}

for (const arr of Object.values(bank)) {
  for (const q of arr) {
    for (const f of ['question_text', 'explanation', 'source_quote', 'chapter']) {
      const before = q[f];
      if (typeof before !== 'string') continue;
      const after = clean(before);
      if (after !== before) {
        note(q.id, f, before, after);
        q[f] = after;
      }
    }
    if (Array.isArray(q.options)) {
      const nb = q.options.map((o) => (typeof o === 'string' ? clean(o) : o));
      if (JSON.stringify(nb) !== JSON.stringify(q.options)) {
        note(q.id, 'options', q.options, nb);
        q.options = nb;
      }
    }
  }
}

const byId = Object.fromEntries(Object.values(bank).flat().map((q) => [q.id, q]));

function loadCanon(path) {
  const src = readFileSync(path, 'utf8');
  const win = {};
  new Function('window', src)(win);
  return win;
}

const AGE_IDS = new Set(['d510b762-1fe3-2f22-dd1e-88163a00e52b']);

function fixCanon(obj) {
  let n = 0;
  for (const [id, v] of Object.entries(obj)) {
    if (typeof v !== 'string') continue;
    let nv = clean(v);
    const q = byId[id];
    if (AGE_IDS.has(id) && q?.source_quote) nv = q.source_quote;
    if (nv !== v) {
      obj[id] = nv;
      n++;
      note(id, 'canonical', v, nv);
    }
  }
  return n;
}

const json = JSON.stringify(bank, null, 2) + '\n';
const bankJs = `window.QUESTIONS_BANK = ${JSON.stringify(bank, null, 2)};\n`;
writeFileSync(bankPath, json);
writeFileSync(join(root, 'questions-bank.js'), bankJs);
writeFileSync(join(root, 'questions-bank-v311.js'), bankJs);

for (const name of ['citation-canonical.js', 'citation-canonical-v338.js']) {
  const p = join(root, name);
  const win = loadCanon(p);
  const n = fixCanon(win.CANONICAL_QUOTES);
  writeFileSync(
    p,
    '/** Auto-expanded from book sources + prior canonical (v348 destub residue) */\n' +
      'window.CANONICAL_QUOTES = ' +
      JSON.stringify(win.CANONICAL_QUOTES, null, 2) +
      ';\n'
  );
  console.log('canonical', name, n);
}

function sqlEsc(s) {
  return String(s).replace(/'/g, "''");
}
const sql = ['-- v348 destub residue — apply in Supabase SQL editor.'];
const grouped = new Map();
for (const row of log) {
  if (row.field === 'canonical') continue;
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
  if (fields.has('chapter')) sets.push(`chapter = '${sqlEsc(q.chapter || '')}'`);
  if (sets.length) sql.push(`UPDATE public.questions SET ${sets.join(', ')} WHERE id = '${id}';`);
}
writeFileSync(join(root, 'extracted/v348_destub_residue.sql'), sql.join('\n') + '\n');
writeFileSync(join(root, 'extracted/v348_destub_residue.json'), JSON.stringify({ n: log.length, log }, null, 2));
console.log('log events', log.length, 'sql', sql.length - 1);
