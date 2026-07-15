#!/usr/bin/env node
/** Regenerate question-verse-map.js + ayah-snippet-map.js from DB + SQL citations. */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(join(root, 'extracted/db_questions_live.json'), 'utf8'));
const snap = Object.fromEntries(
  JSON.parse(readFileSync(join(root, 'extracted/questions_live_snapshot.json'), 'utf8')).map((r) => [r.id, r])
);
const sqlFiles = ['supabase_book_citations_from_pdfs.sql', 'supabase_book_citations_ocr_cleanup.sql'];
const sqlBlob = sqlFiles.map((f) => readFileSync(join(root, f), 'utf8')).join('\n');

const SURAH_BY_ARABIC_NAME = {
  الفاتحة: 1, البقرة: 2, 'آل عمران': 3, النساء: 4, المائدة: 5, الأنعام: 6, الأعراف: 7, الأنفال: 8, التوبة: 9,
  يونس: 10, هود: 11, يوسف: 12, الرعد: 13, إبراهيم: 14, الحجر: 15, النحل: 16, الإسراء: 17, الكهف: 18, مريم: 19, طه: 20,
  الأنبياء: 21, الحج: 22, المؤمنون: 23, النور: 24, الفرقان: 25, الشعراء: 26, النمل: 27, القصص: 28, العنكبوت: 29, الروم: 30,
  لقمان: 31, السجدة: 32, الأحزاب: 33, سبأ: 34, فاطر: 35, يس: 36, الصافات: 37, ص: 38, الزمر: 39, غافر: 40, فصلت: 41,
  الشورى: 42, الزخرف: 43, الدخان: 44, الجاثية: 45, الأحقاف: 46, محمد: 47, الفتح: 48, الحجرات: 49, ق: 50, الذاريات: 51,
  الطور: 52, النجم: 53, القمر: 54, الرحمن: 55, الواقعة: 56, الحديد: 57, المجادلة: 58, الحشر: 59, الممتحنة: 60, الصف: 61,
  الجمعة: 62, المنافقون: 63, التغابن: 64, الطلاق: 65, التحريم: 66, الملك: 67, القلم: 68, الحاقة: 69, المعارج: 70,
  نوح: 71, الجن: 72, المزمل: 73, المدثر: 74, 'المدّثر': 74, القيامة: 75, الإنسان: 76, المرسلات: 77, النبأ: 78, النازعات: 79,
  عبس: 80, التكوير: 81, الانفطار: 82, المطففين: 83, الانشقاق: 84, البروج: 85, الطارق: 86, الأعلى: 87, الغاشية: 88,
  الفجر: 89, البلد: 90, الشمس: 91, الليل: 92, الضحى: 93, الشرح: 94, التين: 95, العلق: 96, القدر: 97, البينة: 98,
  الزلزلة: 99, العاديات: 100, القارعة: 101, التكاثر: 102, العصر: 103, الهمزة: 104, الفيل: 105, قريش: 106, الماعون: 107,
  الكوثر: 108, الكافرون: 109, النصر: 110, المسد: 111, الإخلاص: 112, الفلق: 113, الناس: 114,
};

const KNOWN_SNIPPETS = {
  'إن الله لا يغفر أن يشرك به': '4:48',
  'إن الله لا يغفر أن يشرك به ويغفر ما دون ذلك لمن يشاء': '4:48',
  'الذين آمنوا ولم يلبسوا إيمانهم بظلم': '6:82',
  'الذين آمنوا ولم يلبسوا إيمانهم بظلم أولئك لهم الأمن وهم مهتدون': '6:82',
  'ولم يلبسوا إيمانهم بظلم': '6:82',
  'فمن يكفر بالطاغوت ويؤمن بالله': '2:256',
  'فمن يكفر بالطاغوت ويؤمن بالله فقد استمسك بالعروة الوثقى': '2:256',
  'فلا تخافوهم وخافوني': '3:175',
  'فلا تخافوهم وخافوني إن كنتم مؤمنين': '3:175',
  'وما خلقت الجن والإنس إلا ليعبدون': '51:56',
  'فلا تجعلوا لله أندادا': '2:22',
  'فلا تجعلوا لله أنداداً': '2:22',
  'ومن الناس من يتخذ من دون الله أنداداً': '2:165',
  'ومن الناس من يتخذ من دون الله أنداداً يحبونهم كحب الله': '2:165',
  'إن الله طيب لا يقبل إلا': '23:51',
  'إن الله طيّب لا يقبل إلا': '23:51',
  'إن الله هو الحكم': '6:57',
  'إن الله هو الحَكَم': '6:57',
  'إن الله هو الحَكَم وإليه': '6:57',
  'فاعلم أنه لا إله إلا الله': '47:19',
  'فصل لربك وانحر': '108:2',
  'وعلى الله فتوكلوا': '5:23',
  'وعلى الله فتوكلوا إن كنتم مؤمنين': '5:23',
  'ومن يؤمن بالله يهد': '64:11',
  'ومن يؤمن بالله يهد قلبه': '64:11',
  'وما يؤمن أكثرهم بالله إلا وهم': '12:106',
  'وما يؤمن أكثرهم بالله إلا وهم مشركون': '12:106',
  'يا أيها المدّثر قم فأنذر': '74:1',
  'يا أيها المدثر قم فأنذر': '74:1',
  'يا أيها المدثر': '74:1',
  'إنما هلك من كان قبلكم': '5:41',
  'اتخذوا أحبارهم ورهبانهم أربابا من دون الله': '9:31',
  'اتخذوا أحبارهم ورهبانهم أرباباً من دون الله': '9:31',
  'أفرأيتم اللات والعزى': '53:19',
  'اللات والعزى ومناة': '53:19',
  'أمن يجيب المضطر إذا دعاه': '27:62',
  'أمن يجيب المضطر إذا دعاه ويكشف السوء': '27:62',
  'يوفون بالنذر': '76:7',
  'قل إن صلاتي ونسكي ومحياي ومماتي لله': '6:162',
  'قل إن صلاتي ونسكي': '6:162',
  'ليس البر أن تولوا وجوهكم': '2:177',
  'ليس البر أن تولوا': '2:177',
  'الحمد لله رب العالمين': '1:2',
  'ادع إلى سبيل ربك بالحكمة': '16:125',
  'ادع إلى سبيل ربك': '16:125',
  'إن الشرك لظلم عظيم': '31:13',
  'وإذا سألك عبادي عني فإني قريب': '2:186',
  'ادعوني أستجب لكم': '40:60',
  'حسبنا الله ونعم الوكيل': '3:173',
  'قل هو الله أحد': '112:1',
  'إياك نعبد وإياك نستعين': '1:5',
  'وما أمروا إلا ليعبدوا الله': '98:5',
  'اليوم أكملت لكم دينكم': '5:3',
  'من يطع الرسول فقد أطاع الله': '4:80',
  'إن ينصركم الله فلا غالب لكم': '3:160',
  'وتوكل على الحي الذي لا يموت': '25:58',
  'قل لن يصيبنا إلا ما كتب الله': '9:51',
  'فلا تدع مع الله أحدا': '72:18',
  'وأن المساجد لله فلا تدعوا مع الله أحدا': '72:18',
  'فاعبد الله مخلصا له الدين': '39:2',
  'ألا لله الدين الخالص': '39:3',
  'ومن يدع مع الله إلها آخر': '23:117',
  'إن الذين تدعون من دون الله عباد أمثالكم': '7:194',
  'قل ادعوا الذين زعمتم من دونه': '17:56',
  'أم لهم شركاء شرعوا لهم من الدين': '42:21',
  'رب السموات والأرض وما بينهما فاعبده': '19:65',
  'وما أرسلنا من قبلك من رسول إلا نوحي إليه': '21:25',
  'وما خلقت الجن والإنس': '51:56',
  'اقرأ باسم ربك الذي خلق': '96:1',
  'اقرأ باسم ربك': '96:1',
  'فصل لربك وانحر': '108:2',
  'فصل لربك': '108:2',
  'سنريهم آياتنا في الآفاق': '41:53',
  'إن الحكم إلا لله': '12:40',
  'واتخذ قوم موسى من بعده من حليهم عجلا': '7:148',
  'اجعل لنا إلها كما لهم آلهة': '7:138',
  'إن المنافقين يخادعون الله': '4:142',
  'واتبعوا ما تتلو الشياطين على ملك سليمان': '2:102',
};

/** Manual overrides — verified Quran ayat per question. */
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
  'c8762ee3-e24d-4cf7-a3de-49d30a412e53': '47:19',
  '89fcf4ea-44b1-4d00-ba3f-0bf15a37c855': '47:19',
  'fd3b3748-4d5e-45a8-98fa-874252ec0136': '47:19',
  'bfa74b2a-a0ca-41c0-90ff-eeccd0872cd9': '47:19',
  '16ecb0b3-3e5e-4823-ac0f-7440174c37e1': '47:19',
  '06ded618-669a-40ce-8574-4da46b041242': '108:2',
  '736116de-b4ed-4a86-88b9-864dc9d070d2': '3:159',
  '01b52421-bfcb-42b0-9034-591c60e3d641': '2:177',
  'be04d3f7-8a37-4530-8555-2c66c59d9970': '2:177',
  '79265c77-c40b-45ad-a367-5a5b6b88e4ef': '1:2',
  'e51e1871-5d53-4f6d-81b1-4a34343497af': '1:2',
  '489d8450-b71e-4eab-8653-8af373f67d0d': '74:1',
  '445f59e9-9003-48d1-88b1-df671eddbbfd': '74:1',
  '1a068bcd-7d1d-47ab-9b13-5d6477da8892': '64:11',
  'bc3195b9-eb79-48dd-b8d5-7f09bf65bc3c': '12:106',
  'f6687348-8da8-4773-bc22-ca1b1bfecd9d': '9:31',
  'cf9d9880-aa01-496c-9b11-28ea8dccbb08': '53:19',
  'd4c2155a-db1c-4adc-aa8a-776f7991c93b': '9:60',
  '119d35bc-1357-43b6-a136-0700351ecf99': '6:162',
  '5160169e-5368-44b1-81b7-cf4074a86523': '76:7',
  '1b9766d1-9a5b-4a94-b14e-3d25da5ed64d': '6:82',
  '1c540d83-e6cf-4e0a-ac72-1b7c13394296': '27:62',
  '654e7e3e-b5a0-4be7-9adc-8568f5b456a8': '9:31',
  '63c2cfd9-1172-45ec-b2af-f28925cc1053': '16:125',
  // Thematic expansions — question topic clearly tied to a verse (recite button).
  '5aeee9f3-c1a0-44e9-a85e-f26691ac1502': '51:56',
  '7b78ac3b-81f5-4337-b0b1-465be18514d2': '51:56',
  '50489d5e-7dd0-43f7-ac31-75209ca0be70': '108:2',
  'fec0ad31-5e95-48e9-adc8-bab72b79906f': '96:1',
  '40fd1b0a-b12e-4b92-9958-5241f6df5912': '2:256',
  '9550463c-0568-4a02-aff3-fb26608c812e': '2:256',
  '51689934-7271-4dfa-9233-d03b5157f605': '6:57',
  '862a0cbc-eeff-47fd-aaff-d32a7aeccd59': '6:57',
  'd059e34a-7c7e-4a2c-8519-1761c2526453': '53:19',
  'f12d9517-49b3-43e9-a327-e3f536fce0cb': '53:19',
  'cd227066-93f7-42f7-aead-2ac78970fef6': '47:19',
  '57e222ad-b48e-442c-8f88-6a512c0a54da': '47:19',
  '085b6169-6a01-4998-b190-d30a3296ae00': '96:1',
  'cae566ed-4e67-442d-a8bd-df8c76928ebd': '41:53',
  '2edfe686-6613-43a0-8168-279537f178a0': '7:138',
  '470ab1f1-7138-41d9-9bea-539f78397d5c': '7:138',
  '1d4f7bba-2704-4790-9c3e-9bb9080d6705': '7:138',
  '596c922b-de21-40ea-80fa-f55a8e85f28b': '4:142',
  '213fc1f9-d919-4153-b28a-6e53cb13acce': '2:102',
};

const HADITH_MARKERS =
  /يؤذيني\s+ابن\s+آدم|إنما\s+الأعمال\s+بالنيات|إنك\s+تأتي\s+قوم|رواه|حديث|قال\s*النبي|رسول\s*الله|ﷺ|البر\s+حسن\s+الخلق|لا\s+يؤمن\s+أحدكم\s+حتى\s+يحب|إن\s+الله\s+تجاوز|الحلال\s+بيّن|الحلال\s+بين|لا\s+ضرر\s+ولا\s+ضرار|كل\s+بدعة\s+ضلالة|لا\s+تجعلوا\s+بيوتكم\s+قبور|لا\s+تتخذوا\s+قبري|لا\s+تسبّ|الرقى\s+والتمائم|الرُّقى\s+والتمائم|لا\s+عدوى\s+ولا\s+طيرة|إن\s+أحدكم\s+يُجمع|إن\s+الله\s+فرض\s+فرائض|معاذ|أهل\s+اليمن/i;

const norm = (s) =>
  (s || '')
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A]/g, '')
    .replace(/[«»"،.؛:!؟ـ\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normSurah = (s) => norm(s).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

function findSurah(name) {
  const cleaned = String(name || '')
    .replace(/^ورة\s*/, '')
    .replace(/^س\s*/, '')
    .replace(/اأ/g, 'الأ')
    .replace(/اإ/g, 'الإ')
    .replace(/اآ/g, 'الآ');
  const n = normSurah(cleaned);
  for (const [k, v] of Object.entries(SURAH_BY_ARABIC_NAME)) {
    const nk = normSurah(k);
    if (nk === n || nk.includes(n) || n.includes(nk)) return v;
  }
  return null;
}

function lookupSnippet(snippet) {
  const n = norm(snippet);
  let best = null;
  let bestLen = 0;
  for (const [k, v] of Object.entries(KNOWN_SNIPPETS)) {
    const nk = norm(k);
    if (n.includes(nk) || nk.includes(n)) {
      if (nk.length > bestLen) {
        best = v;
        bestLen = nk.length;
      }
    }
  }
  return best;
}

/** Match known ayah phrases anywhere in question text (not only quoted). */
function matchKnownInBlob(blob) {
  const n = norm(blob);
  let best = null;
  let bestLen = 0;
  for (const [k, v] of Object.entries(KNOWN_SNIPPETS)) {
    const nk = norm(k);
    // Require longer phrases to avoid over-matching short tokens.
    if (nk.length < 12) continue;
    if (n.includes(nk) && nk.length > bestLen) {
      best = v;
      bestLen = nk.length;
    }
  }
  return best;
}

function isHadithText(s) {
  return HADITH_MARKERS.test(s || '');
}

function parseSurahAyahRefs(text) {
  const refs = [];
  const re = /س\s*ورة\s*([^:\]\[]+?)\s*[:：]\s*(\d+)(?:\s*[-–.]\s*(\d+))?/gi;
  let m;
  while ((m = re.exec(text))) {
    const surah = findSurah(m[1]);
    if (surah) refs.push(`${surah}:${parseInt(m[2], 10)}`);
  }
  const re2 = /([^\s\d]{3,18})\s*[:：]\s*(\d{1,3})\s*»/g;
  while ((m = re2.exec(text))) {
    const surah = findSurah(m[1]);
    if (surah) refs.push(`${surah}:${parseInt(m[2], 10)}`);
  }
  return refs;
}

function extractSnippets(blob) {
  const out = [];
  for (const m of blob.matchAll(/\(([^)]{8,})\)/g)) out.push(m[1].trim());
  for (const m of blob.matchAll(/"([^"]{8,})"/g)) out.push(m[1].trim());
  for (const m of blob.matchAll(/«([^»]{8,})»/g)) out.push(m[1].trim());
  for (const m of blob.matchAll(/(?:قال|قوله|قالت|قول)\s+(?:الله\s+)?تعالى\s*[:،]?\s*(?:\(([^)]*)\)|"([^"]*)"|«([^»]*)»)?/gi)) {
    const t = (m[1] || m[2] || m[3] || '').trim();
    if (t) out.push(t);
  }
  return out;
}

function sqlQuotesById() {
  const out = {};
  for (const m of sqlBlob.matchAll(/source_quote\s*=\s*'((?:''|[^'])*)'[^;]*where\s+id\s*=\s*'([0-9a-f-]{36})'/gi)) {
    out[m[2]] = m[1].replace(/''/g, "'");
  }
  for (const m of sqlBlob.matchAll(/where\s+id\s*=\s*'([0-9a-f-]{36})'[^;]*source_quote\s*=\s*'((?:''|[^'])*)'/gi)) {
    if (!out[m[1]]) out[m[1]] = m[2].replace(/''/g, "'");
  }
  return out;
}

function surahFromCorrectOption(row) {
  const qt = row.question_text || '';
  if (!/سورة\s*:?\s*$|من سورة|ذُكرت في سورة|نبوة.*سورة/i.test(qt)) return null;
  const opts = row.options || [];
  const idx = row.correct_index ?? row.correct ?? 0;
  const ans = opts[idx];
  if (!ans) return null;
  const surah = findSurah(ans.trim());
  if (!surah) return null;
  if (/اللات|العزى|مناة/i.test(qt)) return `${surah}:19`;
  return `${surah}:1`;
}

const sqlQuotes = sqlQuotesById();
const mapping = { ...MANUAL };
const snippetMap = { ...KNOWN_SNIPPETS };

for (const row of db) {
  const qid = row.id;
  if (mapping[qid]) continue;
  const s = snap[qid] || {};
  const primary = [row.question_text || '', row.explanation || '', s.source_quote || '', sqlQuotes[qid] || ''].join(' ');
  const full = `${primary} ${(row.options || []).join(' ')}`;
  if (isHadithText(primary) && !/تعالى|قوله\s+تعالى|سورة|﴿/i.test(primary)) continue;
  if (isHadithText(row.question_text || '') && !/تعالى|قوله\s+تعالى|سورة|﴿/i.test(row.question_text || '')) continue;

  const surahPick = surahFromCorrectOption(row);
  if (surahPick) {
    mapping[qid] = surahPick;
    continue;
  }

  const refs = parseSurahAyahRefs(primary) || [];
  if (!refs.length) parseSurahAyahRefs(full).forEach((r) => refs.push(r));
  if (refs.length) {
    mapping[qid] = refs[0];
    continue;
  }

  const snippetSources = /تعالى|قوله\s+تعالى|سورة|﴿|\([^)]{10,}\)/.test(primary) ? [primary, full] : [primary];
  let matched = false;
  for (const blob of snippetSources) {
    for (const sn of extractSnippets(blob)) {
      if (isHadithText(sn)) continue;
      const key = lookupSnippet(sn);
      if (key) {
        mapping[qid] = key;
        snippetMap[sn.slice(0, 120)] = key;
        matched = true;
        break;
      }
    }
    if (matched) break;
  }
  if (!matched) {
    const fromBlob = matchKnownInBlob(primary) || matchKnownInBlob(full);
    if (fromBlob) mapping[qid] = fromBlob;
  }
}

writeFileSync(
  join(root, 'question-verse-map.js'),
  '/** Auto-generated — node scripts/build_question_verse_map.mjs */\n' +
    'window.QUESTION_VERSE_MAP = ' +
    JSON.stringify(mapping, null, 2) +
    ';\n'
);
writeFileSync(
  join(root, 'ayah-snippet-map.js'),
  '/** Auto-generated — node scripts/build_question_verse_map.mjs */\n' +
    'window.AYAH_SNIPPET_MAP = ' +
    JSON.stringify(snippetMap, null, 2) +
    ';\n'
);
console.log(`question-verse-map.js: ${Object.keys(mapping).length} entries`);
console.log(`ayah-snippet-map.js: ${Object.keys(snippetMap).length} entries`);
