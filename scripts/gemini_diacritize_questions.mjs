#!/usr/bin/env node
/**
 * Full Arabic diacritization (tashkeel) for every question field, via Gemini.
 *
 * Reads the demo bundle (q / options / explanation / quote) and the live DB
 * (q / options), asks Gemini to add complete harakat WITHOUT changing any
 * letters, validates that the bare letters are identical, and writes
 * scripts/verified-questions-speech.json keyed by question id.
 *
 * That file is then merged into speech-diacritics-map.js by
 * scripts/build_speech_diacritics_map.mjs so the TTS pronounces every word
 * correctly.
 *
 * Usage:
 *   GEMINI_API_KEY=xxxx node scripts/gemini_diacritize_questions.mjs
 *   GEMINI_API_KEY=xxxx node scripts/gemini_diacritize_questions.mjs --demo-only
 *
 * Env:
 *   GEMINI_API_KEY   required
 *   GEMINI_MODEL     optional, default "gemini-2.5-flash"
 *   BATCH_SIZE       optional, default 12
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '12', 10);
const DEMO_ONLY = process.argv.includes('--demo-only');
const OUT_PATH = join(root, 'scripts/verified-questions-speech.json');

if (!API_KEY) {
  console.error('Missing GEMINI_API_KEY. Run: GEMINI_API_KEY=xxxx node scripts/gemini_diacritize_questions.mjs');
  process.exit(1);
}

/** Arabic letters only — used to prove the model changed nothing but harakat. */
const lettersOnly = (s) => String(s || '').replace(/[^\u0621-\u064A\u0671]/g, '');
/** Remove markdown/formatting noise the model sometimes adds. */
const cleanDiac = (s) => String(s || '').replace(/[*`_#]+/g, '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Load every question field we want spoken, keyed by id. */
function loadQuestions() {
  const byId = new Map();
  const put = (id, field, val) => {
    const v = String(val || '').trim();
    if (!id || !field || !v) return;
    if (!byId.has(id)) byId.set(id, { id, fields: {} });
    // Prefer the demo bundle's richer text; don't overwrite an existing value.
    if (!byId.get(id).fields[field]) byId.get(id).fields[field] = v;
  };

  // Demo bundle first (has q / options / exp / quote).
  const bundleSrc = readFileSync(join(root, 'demo-questions-bundle.js'), 'utf8');
  const bundleJson = JSON.parse(bundleSrc.slice(bundleSrc.indexOf('{'), bundleSrc.lastIndexOf('}') + 1));
  for (const book of Object.values(bundleJson)) {
    for (const q of book) {
      put(q.id, 'q', q.q);
      put(q.id, 'exp', q.exp);
      put(q.id, 'quote', q.quote);
      (q.a || []).forEach((opt, i) => put(q.id, `a${i}`, opt));
    }
  }

  if (!DEMO_ONLY && existsSync(join(root, 'extracted/db_questions_live.json'))) {
    const db = JSON.parse(readFileSync(join(root, 'extracted/db_questions_live.json'), 'utf8'));
    for (const row of db) {
      put(row.id, 'q', row.question_text);
      (row.options || []).forEach((opt, i) => put(row.id, `a${i}`, opt));
    }
    const snapPath = join(root, 'extracted/questions_live_snapshot.json');
    if (existsSync(snapPath)) {
      for (const row of JSON.parse(readFileSync(snapPath, 'utf8'))) {
        put(row.id, 'exp', row.explanation);
        put(row.id, 'quote', row.source_quote);
      }
    }
  }

  return [...byId.values()].filter((q) => Object.keys(q.fields).length);
}

const PROMPT = [
  'أنت مُشكِّل نصوص عربية خبير (تشكيل كامل بالحركات: الفتحة والضمة والكسرة والشدة والسكون والتنوين).',
  'سأعطيك مصفوفة JSON من عناصر، كل عنصر فيه "id" و"fields" (كائن مفاتيحه أسماء الحقول وقيمه نصوص عربية).',
  'أعِد نفس البنية تمامًا (JSON فقط) بعد إضافة التشكيل الكامل لكل كلمة في كل نص.',
  'قواعد صارمة:',
  '- لا تغيّر الحروف ولا الكلمات ولا ترتيبها ولا علامات الترقيم؛ أضف الحركات فقط.',
  '- شكِّل الآيات والأحاديث تشكيلًا صحيحًا فصيحًا.',
  '- لا تحذف ولا تضف أي كلمة. أعِد نفس المفاتيح ("id" و"fields" بنفس المفاتيح الداخلية).',
  '- لا تستخدم أي رموز تنسيق (نجوم * أو علامات ماركداون).',
  '- أخرِج JSON صالحًا فقط بدون أي شرح.',
].join('\n');

async function callGemini(batch, attempt = 1) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\nالمدخل:\n${JSON.stringify(batch)}` }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
      const wait = 2000 * attempt;
      console.warn(`  gemini ${res.status}; retry ${attempt} after ${wait}ms`);
      await sleep(wait);
      return callGemini(batch, attempt + 1);
    }
    throw new Error(`gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('gemini returned non-JSON');
  }
}

/** Keep only fields whose bare letters exactly match the input (safety). */
function acceptDiacritized(inputFields, outputFields) {
  const out = {};
  for (const [key, original] of Object.entries(inputFields)) {
    const cand = cleanDiac(outputFields?.[key]);
    if (!cand) continue;
    if (lettersOnly(cand) !== lettersOnly(original)) continue; // letters must be identical
    if (!/[\u064B-\u065F\u0670]/.test(cand)) continue; // must actually add marks
    out[key] = cand;
  }
  return out;
}

async function main() {
  const questions = loadQuestions();
  console.log(`Diacritizing ${questions.length} questions with ${MODEL} (batch ${BATCH_SIZE})...`);

  const result = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : {};
  let done = 0;
  let accepted = 0;

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    let parsed;
    try {
      parsed = await callGemini(batch);
    } catch (e) {
      console.warn(`  batch ${i}-${i + batch.length} failed: ${e.message}`);
      continue;
    }
    const outById = new Map((Array.isArray(parsed) ? parsed : []).map((r) => [r.id, r.fields || {}]));
    for (const q of batch) {
      const kept = acceptDiacritized(q.fields, outById.get(q.id) || {});
      if (Object.keys(kept).length) {
        result[q.id] = { ...(result[q.id] || {}), ...kept };
        accepted += Object.keys(kept).length;
      }
    }
    done += batch.length;
    writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
    console.log(`  ${done}/${questions.length} processed, ${accepted} fields accepted`);
    await sleep(400);
  }

  console.log(`Done. Wrote ${Object.keys(result).length} questions to ${OUT_PATH}`);
  console.log('Next: node scripts/build_speech_diacritics_map.mjs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
