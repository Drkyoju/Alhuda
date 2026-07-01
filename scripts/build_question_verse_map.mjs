#!/usr/bin/env node
/** Regenerate question-verse-map.js + ayah-snippet-map.js from DB snapshots. */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(join(root, 'extracted/db_questions_live.json'), 'utf8'));
const snap = Object.fromEntries(
  JSON.parse(readFileSync(join(root, 'extracted/questions_live_snapshot.json'), 'utf8')).map((r) => [r.id, r])
);

const KNOWN = {
  'إن الله لا يغفر أن يشرك به': '4:48',
  'الذين آمنوا ولم يلبسوا إيمانهم بظلم': '6:82',
  'ولم يلبسوا إيمانهم بظلم': '6:82',
  'فمن يكفر بالطاغوت ويؤمن بالله': '2:256',
  'فلا تخافوهم وخافوني': '3:175',
  'وما خلقت الجن والإنس إلا ليعبدون': '51:56',
  'فلا تجعلوا لله أندادا': '39:66',
  'فلا تجعلوا لله أنداداً': '39:66',
  'ومن الناس من يتخذ من دون الله أنداداً': '2:165',
  'إن الله طيب لا يقبل إلا': '2:267',
  'إن الله هو الحكم': '6:57',
};

const MANUAL = {
  '06457497-1ae6-4bec-8658-6013bb90d3d9': '4:48',
  '9980f48a-b3d0-4514-981c-6f7247604a7d': '6:82',
  '9c91ebc5-17d3-4598-90dd-2edfe8b65bcc': '6:82',
  'dd12fb28-2682-48bd-bb75-f0e837d7224b': '6:82',
  '39a35c94-3034-43c9-bcc0-3032b1b01381': '2:256',
  '44c0fa04-4e25-40dc-8b0e-9a4ea3ff9291': '3:175',
  '6dea92e9-ae29-4fda-bbf1-55f3b0f2ac90': '51:56',
  'cabe3338-0c2a-4919-8fda-3ff1f5683271': '51:56',
  '6236cc16-0c57-47a5-8555-94c1103562e7': '51:56',
  'b5ff7eaf-2065-47f3-8037-b81eadc02288': '2:267',
  '62d5943d-857a-43a9-ba34-ec83ef01e96b': '2:267',
  '1acbe9c3-b9cb-4bbf-8ff1-dc8006de7f8b': '6:57',
  '27a75181-bb54-44ef-b6dc-b3a84b8cc079': '39:66',
  '0f1efff9-1444-4eb2-a109-250d262cb098': '2:165',
};

const norm = (s) =>
  (s || '')
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A]/g, '')
    .replace(/[«»"،.؛:!؟ـ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const lookupSnippet = (snippet) => {
  const n = norm(snippet);
  for (const [k, v] of Object.entries(KNOWN)) {
    const nk = norm(k);
    if (nk.includes(n) || n.includes(nk)) return v;
  }
  return null;
};

const isHadith = (s) => /يؤذيني\s+ابن\s+آدم|رواه|حديث|قال\s*النبي|رسول\s*الله|ﷺ/i.test(s || '');

const mapping = { ...MANUAL };
const snippetMap = { ...KNOWN };

for (const row of db) {
  const qid = row.id;
  if (mapping[qid]) continue;
  const parts = [row.question_text || '', row.explanation || '', ...(row.options || [])];
  const s = snap[qid] || {};
  parts.push(s.source_quote || '');
  const blob = parts.join(' ');
  if (!/تعالى|سورة|﴿/.test(blob) || isHadith(blob)) continue;
  for (const m of blob.matchAll(/\(([^)]{10,})\)|"([^"]{10,})"/g)) {
    const sn = (m[1] || m[2] || '').trim();
    if (isHadith(sn)) continue;
    const key = lookupSnippet(sn);
    if (key) {
      mapping[qid] = key;
      snippetMap[sn.slice(0, 100)] = key;
      break;
    }
  }
}

writeFileSync(
  join(root, 'question-verse-map.js'),
  '/** Auto-generated — node scripts/build_question_verse_map.mjs */\n' +
    `window.QUESTION_VERSE_MAP = ${JSON.stringify(mapping, null, 2)};\n`
);
writeFileSync(
  join(root, 'ayah-snippet-map.js'),
  '/** Auto-generated — node scripts/build_question_verse_map.mjs */\n' +
    `window.AYAH_SNIPPET_MAP = ${JSON.stringify(snippetMap, null, 2)};\n`
);
console.log(`question-verse-map.js: ${Object.keys(mapping).length} entries`);
