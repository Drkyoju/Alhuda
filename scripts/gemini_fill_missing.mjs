#!/usr/bin/env node
/**
 * Targeted re-run: diacritize ONLY the fields still missing from
 * scripts/verified-questions-speech.json. Sends one field per request so a
 * single bad field never poisons a batch, retries a few times, and merges
 * accepted results back in. Safe: keeps a field only if the bare letters match.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const OUT_PATH = join(root, 'scripts/verified-questions-speech.json');
if (!API_KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1); }

const lettersOnly = (s) => String(s || '').replace(/[^\u0621-\u064A\u0671]/g, '');
const cleanDiac = (s) => String(s || '').replace(/[*`_#]+/g, '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadQuestions() {
  const byId = new Map();
  const put = (id, field, val) => {
    const v = String(val || '').trim();
    if (!id || !field || !v) return;
    if (!byId.has(id)) byId.set(id, { id, fields: {} });
    if (!byId.get(id).fields[field]) byId.get(id).fields[field] = v;
  };
  const bs = readFileSync(join(root, 'demo-questions-bundle.js'), 'utf8');
  const bj = JSON.parse(bs.slice(bs.indexOf('{'), bs.lastIndexOf('}') + 1));
  for (const book of Object.values(bj)) for (const q of book) {
    put(q.id, 'q', q.q); put(q.id, 'exp', q.exp); put(q.id, 'quote', q.quote);
    (q.a || []).forEach((o, i) => put(q.id, `a${i}`, o));
  }
  const db = JSON.parse(readFileSync(join(root, 'extracted/db_questions_live.json'), 'utf8'));
  for (const r of db) { put(r.id, 'q', r.question_text); (r.options || []).forEach((o, i) => put(r.id, `a${i}`, o)); }
  const snapP = join(root, 'extracted/questions_live_snapshot.json');
  if (existsSync(snapP)) for (const r of JSON.parse(readFileSync(snapP, 'utf8'))) { put(r.id, 'exp', r.explanation); put(r.id, 'quote', r.source_quote); }
  return byId;
}

const PROMPT = 'شكِّل النص العربي التالي تشكيلًا كاملًا صحيحًا فصيحًا (فتحة/ضمة/كسرة/شدة/سكون/تنوين). لا تغيّر الحروف ولا الكلمات ولا ترتيبها ولا علامات الترقيم، أضف الحركات فقط. لا تستخدم أي رموز تنسيق. أعِد النص المشكَّل فقط بدون أي شرح.';

async function diacritizeOne(text, attempt = 1) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\nالنص:\n${text}` }] }],
    generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt <= 5) { await sleep(1500 * attempt); return diacritizeOne(text, attempt + 1); }
    throw new Error(`gemini ${res.status}`);
  }
  const data = await res.json();
  return cleanDiac(data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '');
}

async function main() {
  const byId = loadQuestions();
  const result = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : {};
  const missing = [];
  for (const [id, { fields }] of byId) {
    const have = result[id] || {};
    for (const [f, val] of Object.entries(fields)) if (!have[f]) missing.push({ id, f, val });
  }
  console.log(`Missing fields: ${missing.length}`);
  let fixed = 0, stillBad = 0;
  for (const { id, f, val } of missing) {
    let cand = '';
    try { cand = await diacritizeOne(val); } catch (e) { console.warn(`  ${id}/${f}: ${e.message}`); }
    if (cand && lettersOnly(cand) === lettersOnly(val) && /[\u064B-\u065F\u0670]/.test(cand)) {
      result[id] = { ...(result[id] || {}), [f]: cand };
      fixed++;
    } else {
      stillBad++;
      console.log(`  UNFIXED ${id}/${f} :: "${val}" -> "${cand}"`);
    }
    writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
    await sleep(250);
  }
  console.log(`Done. fixed=${fixed}, still unfixed=${stillBad}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
