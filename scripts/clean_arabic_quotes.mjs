#!/usr/bin/env node
/**
 * Cleans ALL source_quote rows from live Supabase snapshot.
 * Run: node scripts/clean_arabic_quotes.mjs > supabase_book_citations_ocr_cleanup.sql
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const CANONICAL_BY_ID = {
  '57e222ad-b48e-442c-8f88-6a512c0a54da': 'إنك تأتي قوماً من أهل الكتاب، فليكن أول ما تدعوهم إليه شهادة أن لا إله إلا الله',
  'c222d45d-12aa-489b-b6d5-8c71d179b249': 'إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى',
  '517ed86f-3bc1-49e1-b33e-28d5ca1f4d04': 'إن الحلال بيّن وإن الحرام بيّن وبينهما أمور مشتبهات',
  '371c3a70-cb31-4f62-a927-3576432f673e': 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  '5d714abc-747b-4e95-8ab4-e31e6f985a3d': 'البر حسن الخلق، والإثم ما حاك في صدرك وكرهت أن يطلع عليه الناس',
  '7bdfccd0-03b8-4002-a193-faea65aa043d': 'البر حسن الخلق، والإثم ما حاك في صدرك وكرهت أن يطلع عليه الناس',
  '26f3d3b0-1e3a-4f81-9cf4-aa945f8f0d04': 'إن الله فرض فرائض فلا تضيعوها، وحد حدوداً فلا تعتدوها، وحرم أشياء فلا تنتهكوها',
  '4505d711-ae74-4891-99f9-4bfb3f1a4eec': 'إن الله تجاوز عن أمتي الخطأ والنسيان وما استكرهوا عليه',
  '2dde27a6-9bcf-4813-bdcd-7f7ab454c272': 'الطيرة من الشرك — والتشاؤم بالأيام والأرقام من الطيرة المنهي عنها',
  '66db9e22-c10c-44ad-875c-e8081d21d442': 'عاش ثلاثاً وستين سنة — من سيرة النبي ﷺ في مختصر الأصول الثلاثة',
  '6a0f4a4c-721e-4c78-af74-1161be8a77a4': 'يُكتب أجله ورزقه وعمله وشقي أو سعيد — في حديث ابن مسعود رضي الله عنه',
  '6b5e357b-2337-4685-ae2c-804d957878ea': 'كل بدعة ضلالة — رواه أبو داود والترمذي',
  '63c2cfd9-1172-45ec-b2af-f28925cc1053': 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  '63d10ede-72e5-4c47-9f9e-cdaeb91e8864': 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  'ef0c9b86-fc95-4c6c-b10d-ef93a2e46153': 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  '00fb1757-a23c-46e3-a4dc-825537d500c3': 'لعن الله من ذبح لغير الله، ولعن الله من لعن والديه، ولعن الله من آوى محدثاً',
  'fcbcf713-b692-4fbf-a3e4-097b3dcb5320': 'مر رجل على قوم لهم صنم لا يجوز أحد حتى يُقرب له شيئاً',
  '01a9767c-2ef1-42ab-a79e-355014cf20af': 'إن الرقى والتمائم والتولة شرك',
  '0e1997b6-0e1b-464a-8141-775d3bcad456': 'إن الرقى والتمائم والتولة شرك',
  '3c319970-f000-4353-b0de-d0e25c6c77ee': 'دعاء الأموات شرك أكبر',
  '6a3a6490-ff2a-4ad8-b7e1-51caca18e6ca': 'دعاء الأموات شرك أكبر',
  '9f8799c0-1350-4ea9-ab20-8e85fc579416': 'لا يرضى الله أن يشرك معه أحد',
  'c68cab87-c801-4d1f-bd2f-869373b36903': 'الرقية الشرعية جائزة، وقد كان النبي ﷺ يرقي ويُرقى',
  '8b90c623-9d83-4b86-ae85-46e901a301ec': 'النذر عبادة لا تصرف إلا لله، والنذر لغير الله كالأضرحة شرك',
  'fa7be18f-983b-4d45-bdcb-3f5a953e66e2': 'اعتقاد أن التميمة تنفع أو تضر بذاتها شرك أكبر',
  '40fd1b0a-b12e-4b92-9958-5241f6df5912': 'الطاغوت: مشتق من الطغيان، فكل ما عُبد من دون الله وهو راضٍ بالعبادة فهو طاغوت',
  '98e27a6b-d241-4d3c-a1a6-bab114689db0': 'إبليس هو رأس الطواغيت، لأنه أول من دعا إلى عبادة غير الله',
  '7622c398-510e-464f-86ee-0c79abdb4c64': 'التوحيد يكفر الذنوب، فمن مات على التوحيد غير مشرك بالله شيئاً دخل الجنة',
  '8230d37a-f5c5-4dea-b8d2-ee499eec99e6': 'توحيد الله بإخلاص العبادة له والبراءة من عبادة كل ما سواه',
  'cfe3b156-db45-49b2-8f99-009186fbdb2b': 'التوحيد هو إفراد الله بالعبادة وترك عبادة ما سواه، والبراءة من ذلك',
};

const PHRASE_PRIORITY = [
  'إلا الله', 'لا إله إلا الله', 'لا إله', 'إله إلا',
  'إنما الأعمال بالنيات', 'إن الله تجاوز', 'الخطأ والنسيان',
  'تدعوهم إليه', 'أهل الكتاب', 'حسن الخلق', 'لنفسه', 'لأخيه',
  'فرض فرائض', 'حد حدوداً', 'الرقى والتمائم',
];

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

function buildDictionary(rows) {
  const words = new Set(PHRASE_PRIORITY);
  for (const q of rows) {
    const t = stripDiac(`${q.explanation || ''} ${q.source_quote || ''}`);
    for (const w of t.split(/\s+/)) {
      const c = w.replace(/[،.:؛!؟«»\-]/g, '');
      if (c.length >= 2) words.add(c);
    }
  }
  return [...words].filter(Boolean).sort((a, b) => b.length - a.length);
}

function isWorksheetGarbage(s) {
  return /اكتبي|أجيبي|أجيب على|معاني الكلمات|اذكري مناسبة|الأسئلة التالية|س\s*:|ج\s*:|الدليل على أنه|لشيخ الإسلام محمد بن عبدالوهاب.*\d|^\s*[\/.]/i.test(s || '');
}

function hasOcrTashkeelGaps(s) {
  return /[\u064B-\u065F]\s+[\u0621-\u064A]/.test(s || '') || /\s[\u064B-\u065F]/.test(s || '');
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
  return (s || '')
    .replace(/\bأن ل إله\b/g, 'أن لا إله')
    .replace(/\bإلل لا\b/g, 'إلا الله')
    .replace(/\bإله إلل لا\b/g, 'إله إلا الله')
    .replace(/\bلا إله إلا الله\b/g, 'لا إله إلا الله')
    .replace(/\s+/g, ' ')
    .trim();
}

function preprocessRaw(raw) {
  let s = (raw || '').trim();
  s = s.replace(/^كتاب التوحيد[^.«]{0,120}?\d+\s*/u, '');
  s = s.replace(/لشيخ الإسلام محمد بن عبدالوهاب[^\n«]*/gi, '');
  s = s.replace(/[]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function cleanArabicCitation(raw, id = '') {
  if (id && CANONICAL_BY_ID[id]) return CANONICAL_BY_ID[id];
  if (!raw || isWorksheetGarbage(raw)) return '';
  let s = preprocessRaw(raw);
  if (!s || isWorksheetGarbage(s)) return '';
  if (hasOcrTashkeelGaps(s)) {
    s = postFixPhrases(segmentCollapsed(collapseArabicSpaces(s)));
  } else {
    s = postFixPhrases(collapseArabicSpaces(s));
  }
  return s;
}

function quoteQuality(s) {
  if (!s) return 0;
  const toks = s.split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  const short = toks.filter((t) => t.replace(/[^\u0621-\u064A]/g, '').length <= 1).length;
  const latin = (s.match(/[a-zA-Z]/g) || []).length;
  let score = 1 - short / toks.length - latin * 0.15;
  if (hasOcrTashkeelGaps(s)) score -= 0.4;
  if (isWorksheetGarbage(s)) score = 0;
  return Math.max(0, score);
}

function isGarbageCitation(s) {
  if (!s) return true;
  if (isWorksheetGarbage(s)) return true;
  if (hasOcrTashkeelGaps(s)) return true;
  if ((s.match(/[a-zA-Z]/g) || []).length > 2) return true;
  return quoteQuality(s) < 0.45;
}

function extractExplanationSnippet(exp) {
  const text = (exp || '').trim();
  if (!text || isWorksheetGarbage(text)) return '';
  const quoted = text.match(/«([^»]+)»/);
  if (quoted?.[1]) {
    const c = cleanArabicCitation(quoted[1]);
    if (!isGarbageCitation(c)) return c;
  }
  const sentences = text.split(/[.!؟\n]/).map((x) => x.trim()).filter((x) => x.length >= 12);
  let best = '';
  let bestQ = 0;
  for (const sent of sentences) {
    if (isWorksheetGarbage(sent)) continue;
    const c = cleanArabicCitation(sent);
    const q = quoteQuality(c);
    if (q > bestQ && !isGarbageCitation(c)) {
      best = c;
      bestQ = q;
    }
  }
  return best;
}

function wrapQuote(s) {
  const t = (s || '').trim();
  if (!t) return null;
  if (t.startsWith('«')) return t;
  return `«${t}»`;
}

function pickBestCitation(row) {
  const candidates = [];
  if (CANONICAL_BY_ID[row.id]) {
    candidates.push({ t: CANONICAL_BY_ID[row.id], q: 1 });
  }
  if (row.source_quote) {
    const c = cleanArabicCitation(row.source_quote, row.id);
    if (c) candidates.push({ t: c, q: quoteQuality(c) });
  }
  const fromExp = extractExplanationSnippet(row.explanation);
  if (fromExp) candidates.push({ t: fromExp, q: quoteQuality(fromExp) });

  candidates.sort((a, b) => b.q - a.q);
  const best = candidates.find((c) => !isGarbageCitation(c.t));
  return best ? wrapQuote(best.t) : null;
}

function sqlEscape(s) {
  return (s || '').replace(/'/g, "''");
}

function normVal(v) {
  if (v == null || v === '') return null;
  return v.trim();
}

const snapshotPath = path.join(root, 'extracted/questions_live_snapshot.json');
const rows = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const DICT = buildDictionary(rows);
const updates = [];

for (const row of rows) {
  const current = normVal(row.source_quote);
  const next = pickBestCitation(row);
  const curNorm = current || null;
  const nextNorm = next || null;
  if (curNorm === nextNorm) continue;
  updates.push({ id: row.id, source_quote: nextNorm });
}

const stats = {
  total: rows.length,
  changed: updates.length,
  setQuote: updates.filter((u) => u.source_quote).length,
  cleared: updates.filter((u) => !u.source_quote).length,
};
process.stderr.write(`Generated ${JSON.stringify(stats)}\n`);

// Export canonical map for citation-canonical.js
fs.writeFileSync(
  path.join(root, 'citation-canonical.js'),
  `/** Auto-generated by scripts/clean_arabic_quotes.mjs — do not edit by hand */\nwindow.CANONICAL_QUOTES = ${JSON.stringify(CANONICAL_BY_ID, null, 2)};\n`,
  'utf8'
);

console.log(`-- supabase_book_citations_ocr_cleanup.sql`);
console.log(`-- Full citation repair: ${stats.changed} changes (${stats.setQuote} set, ${stats.cleared} cleared)`);
console.log(`-- Run in Supabase SQL Editor — idempotent\n`);
console.log('begin;\n');

for (const u of updates) {
  if (u.source_quote) {
    console.log(`update public.questions set source_quote = '${sqlEscape(u.source_quote)}' where id = '${u.id}';`);
  } else {
    console.log(`update public.questions set source_quote = null where id = '${u.id}';`);
  }
}

console.log(`
-- Verification
select
  count(*) filter (where source_quote is not null and source_quote <> '') as with_quote,
  count(*) filter (where source_quote is null or trim(source_quote) = '') as without_quote,
  count(*) filter (where source_quote ~ '[ًٌٍَُِْ]\\s+[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهوي]') as ocr_gaps_remaining
from public.questions
where language = 'ar';
`);

console.log('commit;');
