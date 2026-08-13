#!/usr/bin/env node
/**
 * v337 strict residual restore: curated book quotes only.
 * Each quote must soft-match (OCR-collapsed) the book corpus AND match Q+A.
 * Never invents aqidah.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ex = path.join(root, 'extracted');

function soft(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/اهلل|هللا|للا/g, 'الله')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function col(s) {
  let t = soft(s);
  for (let i = 0; i < 40; i++) {
    const n = t.replace(/(^|\s)([\u0621-\u064A])\s+(?=[\u0621-\u064A])/g, '$1$2');
    if (n === t) break;
    t = n;
  }
  return t.replace(/\s+/g, ' ').trim();
}
function cover(quote, corpusCol) {
  const toks = soft(quote)
    .split(' ')
    .filter((t) => t.length >= 3);
  if (!toks.length) return 0;
  const hit = toks.filter((t) => corpusCol.includes(t)).length;
  return hit / toks.length;
}

const booksCol = {};
for (const n of ['tawheed', 'usool', 'nawawi']) {
  const parts = [
    fs.readFileSync(path.join(ex, `${n}.txt`), 'utf8'),
    JSON.parse(fs.readFileSync(path.join(ex, `${n}_pages.json`), 'utf8')).join('\n'),
  ];
  for (const f of fs.readdirSync(path.join(ex, 'v337_pdf_editions')).filter((x) => x.startsWith(n) && x.endsWith('.txt'))) {
    parts.push(fs.readFileSync(path.join(ex, 'v337_pdf_editions', f), 'utf8'));
  }
  booksCol[n] = col(parts.join('\n'));
}

/**
 * Curated restores: only phrases evidenced in book corpora above.
 * text = clean display Arabic (normalized orthography of book wording).
 */
const CURATED = {
  // حلف / صدق / رضا
  '53c4fad7-c99a-31c3-8200-b25822879097':
    'من حلف بالله فليصدق، ومن حلف له بالله فليرض، ومن لم يرض فليس من الله',
  'b201f59b-1cba-a14f-0994-98c5076d18c4':
    'لا تحلفوا بآبائكم؛ من حلف بالله فليصدق، ومن حلف له بالله فليرض',
  'b5c332c6-99b0-c89f-97ed-837e4c1db634':
    'من حلف بالله فليصدق، ومن حلف له بالله فليرض',
  'da9c7827-2b87-6681-f91b-52c8291fd87a':
    'من حلف بالله فليصدق، ومن حلف له بالله فليرض، ومن لم يرض فليس من الله',
  '0f917e45-196c-b2fc-5e68-3f1dd7a1ae81':
    'ومن لم يرض بالحلف بالله فليس من الله',
  'b7cda93f-15bf-ec30-ad1e-f1b720ecd6c7':
    'من حلف بالله وهو كاذب فقد استهان بعظمة الله سبحانه وتعالى',

  // عطف ثم / واو
  '684a6d62-7429-426d-cf3e-3c721a563763':
    'العطف بثم يقتضي الترتيب والتراخي؛ والعطف بالواو يقتضي الجمع والمساواة',
  'ee56ccfe-1762-ae91-5d17-e81a14ee5932':
    'العطف بالواو يقتضي الجمع والمساواة؛ والعطف بثم يقتضي الترتيب والتراخي',
  'c32dc2b5-d696-c8f8-188a-2c42359e1682':
    'العطف بالواو يقتضي الجمع والمساواة',

  // العلي / تكنية / أبي الحكم
  '76230816-1cbf-f6ad-a143-4893c85c06d2':
    'وهو العلي الذي له علو القدر وعلو القهر وعلو الذات',
  '64a9e304-8824-26b7-87f4-0446e6d27f2e':
    'تكنية الرجل بأكبر بنيه',
  'b08eb9e5-c85b-bee6-49f1-3884c5fdee40':
    'عن أبي شريح أنه كان يكنى أبا الحكم فقال له النبي: إن الله هو الحكم وإليه الحكم',

  // قبور / بيوت / صلاة تبلغ
  '52d01861-7b83-8cf4-fed3-1a5baf8c65df':
    'لا تجعلوا بيوتكم قبورا ولا تجعلوا قبري عيدا وصلوا علي فإن صلاتكم تبلغني حيث كنتم',
  '4c9d0bbc-6735-0502-10c1-ad128e83259d':
    'صلوا علي فإن صلاتكم تبلغني حيث كنتم',
  'bbf392cb-a947-1661-ccbd-d9890511efa0':
    'نهي النبي عن اتخاذ القبور مساجد؛ واتخاذ المساجد على القبور من الغلو ووسائل الشرك',
  '0c67dd3b-35b7-fb8e-9893-cf70b19549f6':
    'الغلو في القبور وسيلة إلى الشرك المضاد للتوحيد وذلك بعبادة الأموات',

  // كهانة / تنجيم / فأل / عدوى
  '135c6d8a-b625-60b3-c79a-e0ded8387af8':
    'كلما انتشر الجهل في الأمة ظهر الكهان، وكلما كثر العلم والتمسك بالدين والعقيدة قل الكهان',
  'f8a4dbbb-ecdd-4e02-41b9-9632a2f38460':
    'من أتى كاهنا فصدقه بما يقول فقد كفر بما أنزل على محمد؛ ومن ذهب إلى الكهان ولم يصدقهم لم تقبل له صلاة أربعين يوما',
  '3460b2d5-3198-5ec6-517b-ec6fd26de2bc':
    'التنجيم نوع من أنواع السحر؛ والاستدلال بالنجوم على الحوادث المستقبلة من ادعاء علم الغيب',
  '005a6ec5-283a-aa14-df0e-ebe166acb033':
    'الاستدلال بالنجوم على الحوادث المستقبلة هذا من ادعاء علم الغيب وهو كفر بإجماع المسلمين',
  '1660db39-87f6-00de-4f68-e08a728e4878':
    'من اقتبس شعبة من النجوم فقد اقتبس شعبة من السحر',
  '5d1927d1-33b4-d95e-e56d-c07431f3142e':
    'لا عدوى ولا طيرة ولا هامة ولا صفر',
  'a5af1bac-9a02-7cc5-95b5-ab4197068011':
    'قال رسول الله: لا عدوى ولا طيرة ويعجبني الفأل قالوا وما الفأل قال الكلمة الطيبة',
  '365a234b-354a-d307-145c-8a75e7115ebe':
    'ويعجبني الفأل قالوا وما الفأل قال الكلمة الطيبة',

  // اللات / عكاشة / صبر / أرباب / بضاعة الحلف
  '40379489-f48b-7857-597c-405eca3332e8':
    'اللات اسم لرجل كان يلت السويق للحاج فمات فعكفوا على قبره',
  '478be838-386d-07f2-f07c-1767b52f48d2':
    'كان يلت السويق للحاج فمات فعكفوا على قبره',
  'b5fecca4-b8fe-63ec-28fd-4087d1f6a403':
    'ثم قام رجل آخر فقال ادع الله أن يجعلني منهم فقال: سبقك بها عكاشة',
  '03806160-f513-42c2-26e6-ba9fa2647058':
    'باب من الإيمان بالله الصبر على أقدار الله',
  '48a0bd50-0820-0bc8-2ff9-300c458fce13':
    'من أطاع العلماء والأمراء في تحريم ما أحل الله أو تحليل ما حرمه فقد اتخذهم أربابا',
  '33e8a4aa-dc40-eabd-510d-25d03fe5c083':
    'رجل جعل الحلف بالله بضاعة له لكثرة استعماله في البيع والشراء',
  '832b2f83-6d67-f7b2-0149-d7d865a8172b':
    'التحذير من كثرة استعمال الحلف في البيع والشراء والحث على توقير اليمين واحترام أسماء الله',

  // ذبح
  '3b72e0c1-01bc-e81d-73ed-a739183539cc':
    'الذبح عبادة يجب صرفها لله وحده؛ فمن ذبح لغير الله فقد أشرك',

  // usool
  '39a78741-7390-e1e9-ce72-d9999e7c58fb':
    'الإحسان: أن تعبد الله كأنك تراه فإن لم تكن تراه فإنه يراك',
  'a4593996-fcf0-4afe-eaaa-257c6d18a74a':
    'ادعُ إلى الله على بصيرة',
  '4835ca34-6f9f-e25f-0315-e88ca181188e':
    'والهجرة فريضة على هذه الأمة من بلد الشرك إلى بلد الإسلام وهي باقية',
  'e51e1871-5d53-4f6d-81b1-4a34343497af':
    'إذا قيل لك: من ربك؟ فقل: ربي الله الذي رباني وربى جميع العالمين بنعمه',

  // nawawi
  '41b189f4-a2e6-43a3-ba4f-e27fb4f6627b':
    'احفظ الله يحفظك؛ احفظ الله تجده تجاهك',
  '61f1587c-b9b3-4a1b-8afa-7dab10118420':
    'كن في الدنيا كأنك غريب أو عابر سبيل',
  '64108c2e-be22-4a6e-832c-73a5ccb6527d':
    'لا ضرر ولا ضرار',
  '631bd955-d052-4292-8366-5a3aac08e7a6':
    'من رأى منكم منكرا فليغيره بيده؛ فإن لم يستطع فبلسانه؛ فإن لم يستطع فبقلبه وذلك أضعف الإيمان',
  '6a0f4a4c-721e-4c78-af74-1161be8a77a4':
    'ثم يبعث الله إليه الملك فيؤمر بأربع كلمات فيكتب عمله وأجله ورزقه وشقي أو سعيد',
  'ba58c1dc-be65-ec48-4fc5-103b1397ffff':
    'من حسن إسلام المرء تركه ما لا يعنيه',
  'e3396519-1790-df74-a90c-fdf7a609a1cb':
    'إن الله طيب لا يقبل إلا طيبا',
  '727c0b70-4282-4e8e-9d5a-184312a33c5a':
    'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى',
};

const residualIds = JSON.parse(fs.readFileSync(path.join(ex, 'v335_residual_impossible.json'), 'utf8')).ids;
const win = {};
new Function('window', fs.readFileSync(path.join(root, 'citation-canonical.js'), 'utf8'))(win);
new Function('window', fs.readFileSync(path.join(root, 'questions-bank.js'), 'utf8'))(win);
const bank = win.QUESTIONS_BANK;
const byId = Object.fromEntries(Object.values(bank).flat().map((q) => [q.id, q]));
const canon = { ...win.CANONICAL_QUOTES };

const restored = [];
const rejected = [];
const still = [];

for (const id of residualIds) {
  const q = byId[id];
  if (!q) {
    still.push(id);
    continue;
  }
  const text = CURATED[id];
  if (!text) {
    still.push(id);
    continue;
  }
  const cov = cover(text, booksCol[q.book] || '');
  // require strong book coverage of content words
  if (cov < 0.55) {
    rejected.push({ id, reason: 'low_book_cover', cov, text: text.slice(0, 80) });
    still.push(id);
    continue;
  }
  // relevance: answer tokens should appear in cite
  const ans = String(q.explanation || '')
    .replace(/^(?:ال)?إج[اآ]بة\s*الصحيحة\s*:?\s*/i, '')
    .replace(/\.$/, '')
    .trim();
  const opt =
    q.type === 'mc' && Array.isArray(q.options) && Number.isInteger(q.correct_index)
      ? String(q.options[q.correct_index] || '')
      : '';
  const aBlob = soft(ans + ' ' + opt);
  const aToks = aBlob.split(' ').filter((t) => t.length >= 3);
  const cSoft = soft(text);
  const aHit = aToks.length ? aToks.filter((t) => cSoft.includes(t)).length / aToks.length : 0;
  const qToks = soft(q.question_text)
    .split(' ')
    .filter((t) => t.length >= 4);
  const qHit = qToks.length ? qToks.filter((t) => cSoft.includes(t)).length / Math.min(6, qToks.length) : 0;

  // allow if answer strongly present OR (q strong + answer partial for short answers)
  const ok =
    (aToks.length >= 2 && aHit >= 0.4 && qHit >= 0.15) ||
    (aToks.length <= 2 && aHit >= 0.5 && qHit >= 0.25) ||
    (aHit >= 0.35 && qHit >= 0.35) ||
    (aToks.some((t) => t.length >= 5 && cSoft.includes(t)) && qHit >= 0.3);

  if (!ok) {
    rejected.push({ id, reason: 'relevance', aHit, qHit, ans: ans.slice(0, 40), text: text.slice(0, 80) });
    still.push(id);
    continue;
  }

  canon[id] = text;
  q.source_quote = text;
  restored.push({ id, book: q.book, cov: +cov.toFixed(2), aHit: +aHit.toFixed(2), qHit: +qHit.toFixed(2), text, q: q.question_text });
}

function dumpCanon(c) {
  const keys = Object.keys(c).sort();
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(c[k])},`);
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
  return (
    '/** Auto-expanded from book sources + prior canonical (v337 residual restore) */\n' +
    'window.CANONICAL_QUOTES = {\n' +
    lines.join('\n') +
    '\n};\n'
  );
}

fs.writeFileSync(path.join(root, 'citation-canonical.js'), dumpCanon(canon));
fs.writeFileSync(path.join(root, 'citation-canonical-v337.js'), dumpCanon(canon));
const bankJs = 'window.QUESTIONS_BANK = ' + JSON.stringify(bank, null, 2) + ';\n';
fs.writeFileSync(path.join(root, 'questions-bank.js'), bankJs);
fs.writeFileSync(path.join(root, 'questions-bank-v311.js'), bankJs);
fs.writeFileSync(path.join(root, 'questions-bank.json'), JSON.stringify(bank, null, 2) + '\n');

const updates = restored.map((r) => ({ id: r.id, source_quote: r.text, book: r.book, note: 'v337_curated_book_verified' }));
fs.writeFileSync(path.join(ex, 'v337_citation_updates.json'), JSON.stringify({ updates, restored: restored.length, residual: still.length }, null, 2) + '\n');

const residualOut = {
  count: still.length,
  note_ar: 'تعذر الاستعادة من مصادر الكتاب بعد بحث مستفيض v337 — بلا اختراع نص عقيدة',
  ids: still,
  rejected_samples: rejected.slice(0, 30),
};
fs.writeFileSync(path.join(ex, 'v337_residual_impossible.json'), JSON.stringify(residualOut, null, 2) + '\n');
fs.writeFileSync(path.join(ex, 'v335_residual_impossible.json'), JSON.stringify({ count: still.length, note_ar: residualOut.note_ar, ids: still }, null, 2) + '\n');

fs.writeFileSync(
  path.join(ex, 'v337_restore_report.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      input: residualIds.length,
      restored: restored.length,
      still_impossible: still.length,
      rejected: rejected.length,
      examples: restored.slice(0, 20),
      rejected_samples: rejected.slice(0, 20),
    },
    null,
    2
  ) + '\n'
);

console.log(JSON.stringify({ restored: restored.length, still: still.length, rejected: rejected.length, samples: restored.slice(0, 15).map((r) => ({ id: r.id.slice(0, 8), cov: r.cov, a: r.aHit, q: r.qHit, text: r.text.slice(0, 70) })), rejected_samples: rejected.slice(0, 10) }, null, 2));
