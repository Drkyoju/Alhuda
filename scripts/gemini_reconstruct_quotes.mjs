#!/usr/bin/env node
/**
 * Reconstruct clean, fully-diacritized citation text for questions whose source
 * `quote` is OCR-corrupted (jumbled letters / detached harakat) AND that do not
 * already have a clean entry in citation-canonical.js.
 *
 * Output: scripts/reconstructed-quotes.json  { id: "clean text" }
 * These are reviewed, then the pure-hadith ones are merged into CANONICAL_QUOTES.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
if (!API_KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s || '').replace(/[*`_#]+/g, '').replace(/^«|»$/g, '').replace(/\s+/g, ' ').trim();

// Detached/isolated harakat = OCR corruption signal.
const isCorrupt = (s) => /(^|\s)[\u064B-\u0652\u0670]/.test(s) || /[\u064B-\u0652]{3,}/.test(s) || /ل لا|َّللا|إ ا ل|ف ا ل/.test(s);

function loadQuoteSources() {
  const byId = new Map();
  const bs = readFileSync(join(root, 'demo-questions-bundle.js'), 'utf8');
  const bj = JSON.parse(bs.slice(bs.indexOf('{'), bs.lastIndexOf('}') + 1));
  for (const book of Object.values(bj)) for (const q of book) if (q.quote && !byId.has(q.id)) byId.set(q.id, q.quote);
  const snapP = join(root, 'extracted/questions_live_snapshot.json');
  if (existsSync(snapP)) for (const r of JSON.parse(readFileSync(snapP, 'utf8'))) {
    if (r.source_quote && !byId.has(r.id)) byId.set(r.id, r.source_quote);
  }
  return byId;
}

const PROMPT = 'النص التالي حديث أو أثر أُتلِف بالمسح الضوئي (حروف متبعثرة وحركات منفصلة). أعد كتابته صحيحًا مُشكَّلًا تشكيلًا كاملًا فصيحًا كما ورد أصلًا، بدون أقواس أو رموز، ونصًّا واحدًا فقط بدون شرح. إن كان فيه سؤال ملحق (مثل: ما الدليل...) فاحذفه واكتب متن الحديث/الأثر فقط.';

async function reconstruct(text, attempt = 1) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const payload = { contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\nالنص:\n${text}` }] }], generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } } };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) { if ((res.status === 429 || res.status >= 500) && attempt <= 5) { await sleep(1500 * attempt); return reconstruct(text, attempt + 1); } throw new Error(`gemini ${res.status}`); }
  const data = await res.json();
  return clean(data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '');
}

async function main() {
  const canonical = existsSync(join(root, 'citation-canonical.js'))
    ? (() => { const src = readFileSync(join(root, 'citation-canonical.js'), 'utf8'); return JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1)); })()
    : {};
  const sources = loadQuoteSources();
  const out = existsSync(join(root, 'scripts/reconstructed-quotes.json')) ? JSON.parse(readFileSync(join(root, 'scripts/reconstructed-quotes.json'), 'utf8')) : {};
  const targets = [...sources].filter(([id, q]) => isCorrupt(q) && !canonical[id]);
  console.log(`Corrupt quotes without canonical entry: ${targets.length}`);
  for (const [id, q] of targets) {
    try {
      const rec = await reconstruct(q);
      if (rec && rec.length >= 8) { out[id] = rec; console.log(`  ${id}: ${rec}`); }
    } catch (e) { console.warn(`  ${id}: ${e.message}`); }
    writeFileSync(join(root, 'scripts/reconstructed-quotes.json'), JSON.stringify(out, null, 2));
    await sleep(250);
  }
  console.log(`Done. ${Object.keys(out).length} reconstructed quotes.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
