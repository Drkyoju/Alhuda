#!/usr/bin/env node
/**
 * Cleans OCR-broken source_quote text and emits SQL updates.
 * Run: node scripts/clean_arabic_quotes.mjs > supabase_book_citations_ocr_cleanup.sql
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const PHRASE_PRIORITY = [
  'إلا الله', 'لا إله', 'إله إلا', 'لا إله إلا الله',
  'إنما الأعمال بالنيات', 'بالنيات', 'الأعمال',
  'تدعوهم إليه', 'تدعوهم', 'إليه',
  'أهل الكتاب', 'الكتاب', 'شهادة أن',
  'فليكن أول', 'فليكن', 'أول ما',
  'حسن الخلق', 'لنفسه', 'لأخيه',
  'الخطأ والنسيان', 'استكرهوا عليه',
  'فرض فرائض', 'حد حدودا',
];

const CANONICAL_BY_ID = {
  '57e222ad-b48e-442c-8f88-6a512c0a54da': 'إنك تأتي قوماً من أهل الكتاب، فليكن أول ما تدعوهم إليه شهادة أن لا إله إلا الله',
  'c222d45d-12aa-489b-b6d5-8c71d179b249': 'إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى',
  '517ed86f-3bc1-49e1-b33e-28d5ca1f4d04': 'إن الحلال بيّن وإن الحرام بيّن وبينهما أمور مشتبهات',
  '371c3a70-cb31-4f62-a927-3576432f673e': 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  '5d714abc-747b-4e95-8ab4-e31e6f985a3d': 'البر حسن الخلق، والإثم ما حاك في صدرك وكرهت أن يطلع عليه الناس',
  '7bdfccd0-03b8-4002-a193-faea65aa043d': 'البر حسن الخلق، والإثم ما حاك في صدرك وكرهت أن يطلع عليه الناس',
  '26f3d3b0-1e3a-4f81-9cf4-aa945f8f0d04': 'إن الله فرض فرائض فلا تضيعوها، وحد حدوداً فلا تعتدوها، وحرم أشياء فلا تنتهكوها',
  '63c2cfd9-1172-45ec-b2af-f28925cc1053': 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  '63d10ede-72e5-4c47-9f9e-cdaeb91e8864': 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  'ef0c9b86-fc95-4c6c-b10d-ef93a2e46153': 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  '00fb1757-a23c-46e3-a4dc-825537d500c3': 'لعن الله من ذبح لغير الله، ولعن الله من لعن والديه، ولعن الله من آوى محدثاً',
  'fcbcf713-b692-4fbf-a3e4-097b3dcb5320': 'مر رجل على قوم لهُم صنم لا يجوز أحد حتى يُقرب له شيئاً',
};

function stripDiac(s) {
  return (s || '').replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '');
}

function collapseArabicSpaces(s) {
  let out = stripDiac(s);
  for (let i = 0; i < 50; i++) {
    const n = out.replace(/([\u0621-\u064A\u0671])\s+(?=[\u0621-\u064A\u0671])/g, '$1');
    if (n === out) return out;
    out = n;
  }
  return out;
}

function buildDictionary() {
  const words = new Set(PHRASE_PRIORITY);
  try {
    const db = JSON.parse(fs.readFileSync(path.join(root, 'extracted/db_questions_live.json'), 'utf8'));
    for (const q of db) {
      const t = stripDiac(`${q.explanation || ''} ${q.question_text || ''}`);
      for (const w of t.split(/\s+/)) {
        const c = w.replace(/[،.:؛!؟«»\-]/g, '');
        if (c.length >= 2) words.add(c);
      }
    }
  } catch { /* optional */ }
  return [...words].filter(Boolean).sort((a, b) => b.length - a.length);
}

const DICT = buildDictionary();

function isWorksheetGarbage(s) {
  return /اكتبي|أجيبي|أجيب على|معاني الكلمات|س\s*:|ج\s*:|الدليل على أنه|لشيخ الإسلام محمد بن عبدالوهاب.*\d/i.test(s);
}

function segmentCollapsed(text) {
  const plain = text.replace(/[«»،؛.!?\s]/g, '');
  const out = [];
  let pos = 0;
  while (pos < plain.length) {
    let matched = '';
    for (const w of DICT) {
      if (plain.startsWith(w, pos) && w.length > matched.length) matched = w;
    }
    if (matched.length >= 2) {
      out.push(matched);
      pos += matched.length;
    } else {
      out.push(plain[pos]);
      pos += 1;
    }
  }
  return out.join(' ');
}

function postFixPhrases(s) {
  return s
    .replace(/\bأن ل إله\b/g, 'أن لا إله')
    .replace(/\bإلل لا\b/g, 'إلا الله')
    .replace(/\bإله إلل لا\b/g, 'إله إلا الله')
    .replace(/\bإله إلا\b/g, 'إله إلا')
    .replace(/\bلا إله إلا الله\b/g, 'لا إله إلا الله')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanArabicCitation(raw, id = '') {
  if (!raw || isWorksheetGarbage(raw)) return '';
  if (id && CANONICAL_BY_ID[id]) return CANONICAL_BY_ID[id];
  let s = raw.trim();
  s = s.replace(/^كتاب التوحيد[^.«]{0,120}?\d+\s*/u, '');
  s = s.replace(/لشيخ الإسلام محمد بن عبدالوهاب[^\n«]*/gi, '');
  s = s.replace(/[]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || isWorksheetGarbage(s)) return '';
  const collapsed = collapseArabicSpaces(s);
  const segmented = postFixPhrases(segmentCollapsed(collapsed));
  return segmented;
}

function quoteQuality(s) {
  if (!s) return 0;
  const toks = s.split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  const short = toks.filter((t) => t.replace(/[^\u0621-\u064A]/g, '').length <= 1).length;
  const latin = (s.match(/[a-zA-Z]/g) || []).length;
  return Math.max(0, 1 - short / toks.length - latin * 0.15);
}

function isGarbageCitation(s) {
  if (!s) return true;
  if (/^\/|\s\/\s||اكتبي|أجيبي|معاني الكلمات/i.test(s)) return true;
  if ((s.match(/[a-zA-Z]/g) || []).length > 2) return true;
  return quoteQuality(s) < 0.5;
}

function sqlEscape(s) {
  return (s || '').replace(/'/g, "''");
}

function wrapQuote(s) {
  const t = (s || '').trim();
  if (!t) return null;
  if (t.startsWith('«')) return t;
  return `«${t}»`;
}

const json = JSON.parse(fs.readFileSync(path.join(root, 'extracted/book_citations_from_pdfs.json'), 'utf8'));
const updates = [];

for (const row of json.updates) {
  if (!row.source_quote && !CANONICAL_BY_ID[row.id]) continue;
  const cleaned = cleanArabicCitation(row.source_quote || '', row.id);
  if (isGarbageCitation(cleaned)) {
    if (row.source_quote) updates.push({ id: row.id, source_quote: null });
    continue;
  }
  const wrapped = wrapQuote(cleaned);
  const oldQ = quoteQuality(stripDiac(row.source_quote || ''));
  const newQ = quoteQuality(cleaned);
  if (CANONICAL_BY_ID[row.id] || newQ >= oldQ + 0.08 || (oldQ < 0.45 && newQ >= 0.55)) {
    updates.push({ id: row.id, source_quote: wrapped });
  }
}

process.stderr.write(`Generated ${updates.length} quote updates\n`);

console.log(`-- supabase_book_citations_ocr_cleanup.sql`);
console.log(`-- Auto-generated: fixes OCR-broken source_quote (${updates.length} rows)`);
console.log(`-- Run in Supabase SQL Editor — idempotent\n`);
console.log('begin;\n');

for (const u of updates) {
  if (u.source_quote) {
    console.log(`update public.questions set source_quote = '${sqlEscape(u.source_quote)}' where id = '${u.id}';`);
  } else {
    console.log(`update public.questions set source_quote = null where id = '${u.id}';`);
  }
}

console.log('\ncommit;');
