#!/usr/bin/env node
/** Generate speech-diacritics-map.js — manual tashkil + well-formed DB quotes for TTS. */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(join(root, 'extracted/db_questions_live.json'), 'utf8'));
const snap = Object.fromEntries(
  JSON.parse(readFileSync(join(root, 'extracted/questions_live_snapshot.json'), 'utf8')).map((r) => [r.id, r])
);

const MANUAL_PHRASES = [
  ['الإجابة الصحيحة', 'الْإِجَابَةُ الصَّحِيحَةُ'],
  ['قال الله تعالى', 'قَالَ اللهُ تَعَالَى'],
  ['قوله تعالى', 'قَوْلُهُ تَعَالَى'],
  ['التوحيد هو إفراد الله تعالى بالعبادة', 'التَّوْحِيدُ هُوَ إِفْرَادُ اللهِ تَعَالَى بِالْعِبَادَةِ'],
  ['التوحيد هو إفراد الله بالعبادة', 'التَّوْحِيدُ هُوَ إِفْرَادُ اللهِ بِالْعِبَادَةِ'],
  ['العبادة هي التوحيد', 'الْعِبَادَةُ هِيَ التَّوْحِيدُ'],
  ['ما هي الأصول الثلاثة', 'مَا هِيَ الْأُصُولُ الثَّلَاثَةُ'],
  ['معرفة الرب ومعرفة الدين ومعرفة نبيك', 'مَعْرِفَةُ الرَّبِّ وَمَعْرِفَةُ الدِّينِ وَمَعْرِفَةُ نَبِيِّكَ'],
  ['إنما الأعمال بالنيات', 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ'],
  ['إنما الأعمال بالنيات وإنما لكل امرئ ما نوى', 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى'],
  ['إنك تأتي قوما من أهل الكتاب فليكن أول ما تدعوهم إليه شهادة أن لا إله إلا الله', 'إِنَّكَ تَأْتِي قَوْمًا مِنْ أَهْلِ الْكِتَابِ، فَلْيَكُنْ أَوَّلَ مَا تَدْعُوهُمْ إِلَيْهِ شَهَادَةُ أَنْ لَا إِلَهَ إِلَّا اللهُ'],
  ['إن الحلال بين وإن الحرام بين وبينهما أمور مشتبهات', 'إِنَّ الْحَلَالَ بَيِّنٌ، وَإِنَّ الْحَرَامَ بَيِّنٌ، وَبَيْنَهُمَا أُمُورٌ مُشْتَبِهَاتٌ'],
  ['لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه', 'لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ'],
  ['البر حسن الخلق والإثم ما حاك في صدرك وكرهت أن يطلع عليه الناس', 'الْبِرُّ حُسْنُ الْخُلُقِ، وَالْإِثْمُ مَا حَاكَ فِي صَدْرِكَ، وَكَرِهْتَ أَنْ يَطَّلِعَ عَلَيْهِ النَّاسُ'],
  ['إن الله فرض فرائض فلا تضيعوها وحد حدودا فلا تعتدوها وحرم أشياء فلا تنتهكوها', 'إِنَّ اللهَ فَرَضَ فَرَائِضَ فَلَا تُضَيِّعُوهَا، وَحَدَّ حُدُودًا فَلَا تَعْتَدُوهَا، وَحَرَّمَ أَشْيَاءَ فَلَا تَنْتَهِكُوهَا'],
  ['إن الله تجاوز عن أمتي الخطأ والنسيان وما استكرهوا عليه', 'إِنَّ اللهَ تَجَاوَزَ عَنْ أُمَّتِي الْخَطَأَ وَالنِّسْيَانَ وَمَا اسْتُكْرِهُوا عَلَيْهِ'],
  ['كل بدعة ضلالة', 'كُلُّ بِدْعَةٍ ضَلَالَةٌ'],
  ['لعن الله من ذبح لغير الله', 'لَعَنَ اللهُ مَنْ ذَبَحَ لِغَيْرِ اللهِ'],
  ['إن الرقى والتمائم والتولة شرك', 'إِنَّ الرُّقَى وَالتَّمَائِمَ وَالتِّوَلَةَ شِرْكٌ'],
  ['دعاء الأموات شرك أكبر', 'دُعَاءُ الْأَمْوَاتِ شِرْكٌ أَكْبَرُ'],
  ['النذر عبادة لا تصرف إلا لله', 'النَّذْرُ عِبَادَةٌ لَا تُصْرَفُ إِلَّا لِلَّهِ'],
  ['من حلف بغير الله فقد كفر أو أشرك', 'مَنْ حَلَفَ بِغَيْرِ اللهِ فَقَدْ كَفَرَ أَوْ أَشْرَكَ'],
  ['دخل الجنة رجل في ذباب ودخل النار رجل في ذباب', 'دَخَلَ الْجَنَّةَ رَجُلٌ فِي ذُبَابٍ، وَدَخَلَ النَّارَ رَجُلٌ فِي ذُبَابٍ'],
  ['من تعلق تميمة فقد أشرك', 'مَنْ تَعَلَّقَ تَمِيمَةً فَقَدْ أَشْرَكَ'],
  ['اللهم لا تجعل قبري وثنا يعبد', 'اللَّهُمَّ لَا تَجْعَلْ قَبْرِي وَثَنًا يُعْبَدُ'],
  ['الطيرة شرك', 'الطِّيَرَةُ شِرْكٌ'],
  ['الشرك الأكبر يخرج من الملة', 'الشِّرْكُ الْأَكْبَرُ يُخْرِجُ مِنَ الْمِلَّةِ'],
  ['العبادة اسم جامع لكل ما يحبه الله ويرضاه من الأقوال والأعمال', 'الْعِبَادَةُ اسْمٌ جَامِعٌ لِكُلِّ مَا يُحِبُّهُ اللهُ وَيَرْضَاهُ مِنَ الْأَقْوَالِ وَالْأَعْمَالِ'],
  ['الشرك الأكبر يُخرج من الملة', 'الشِّرْكُ الْأَكْبَرُ يُخْرِجُ مِنَ الْمِلَّةِ'],
  ['أول حديث في الأربعون النووية: «إنما الأعمال بالنيات»', 'أَوَّلُ حَدِيثٍ فِي الْأَرْبَعِينَ النَّوَوِيَّةِ: إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ'],
  ['العبادة هي الطاعة والخضوع لله', 'الْعِبَادَةُ هِيَ الطَّاعَةُ وَالْخُضُوعُ لِلَّهِ'],
  ['تَعَلَّمْ أَنَّهُ لَا يَجِبُ عَلَى أَحَدٍ مِنَ الْخَلْقِ أَنْ يُعَبَّدَ إِلَّا اللَّهُ', 'تَعَلَّمْ أَنَّهُ لَا يَجِبُ عَلَى أَحَدٍ مِنَ الْخَلْقِ أَنْ يُعَبَّدَ إِلَّا اللَّهُ'],
  ['إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ', 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ'],
];

const DEMO_SPEECH = {
  demo1: {
    q: 'التَّوْحِيدُ هُوَ إِفْرَادُ اللهِ تَعَالَى بِالْعِبَادَةِ',
    exp: 'نَعَمْ! التَّوْحِيدُ هُوَ إِفْرَادُ اللهِ فِي الرُّبُوبِيَّةِ وَالْأُلُوهِيَّةِ وَالْأَسْمَاءِ وَالصِّفَاتِ',
    quote: 'الْعِبَادَةُ هِيَ التَّوْحِيدُ',
  },
  demo2: {
    q: 'مَا هِيَ الْأُصُولُ الثَّلَاثَةُ؟',
    exp: 'الْأُصُولُ الثَّلَاثَةُ: مَعْرِفَةُ الرَّبِّ، وَمَعْرِفَةُ الدِّينِ بِمَعْرِفَةِ دِينِكَ، وَمَعْرِفَةُ نَبِيِّكَ مُحَمَّدٍ صَلَّى اللهُ عَلَيْهِ وَسَلَّمَ',
    quote: 'تَعَلَّمْ أَنَّهُ لَا يَجِبُ عَلَى أَحَدٍ مِنَ الْخَلْقِ أَنْ يُعَبَّدَ إِلَّا اللَّهُ',
    a0: 'مَعْرِفَةُ الرَّبِّ وَمَعْرِفَةُ الدِّينِ وَمَعْرِفَةُ نَبِيِّكَ',
    a1: 'الصَّلَاةُ وَالزَّكَاةُ وَالصَّوْمُ',
    a2: 'الْإِيمَانُ وَالْإِحْسَانُ وَالْإِخْلَاصُ',
    a3: 'الْقُرْآنُ وَالسُّنَّةُ وَالْإِجْمَاعُ',
  },
  demo3: {
    q: 'أَوَّلُ حَدِيثٍ فِي الْأَرْبَعِينَ النَّوَوِيَّةِ: إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ',
    exp: 'صَحِيحٌ! وَهُوَ أَوَّلُ حَدِيثٍ فِي الْأَرْبَعِينَ النَّوَوِيَّةِ لِلْإِمَامِ النَّوَوِيِّ رَحِمَهُ اللهُ',
    quote: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ',
  },
  demo4: {
    q: 'الشِّرْكُ الْأَكْبَرُ يُخْرِجُ مِنَ الْمِلَّةِ',
    exp: 'الشِّرْكُ الْأَكْبَرُ مِنْ أَعْظَمِ الْكَبَائِرِ وَيُبْقِي صَاحِبَهُ فِي النَّارِ إِنْ مَاتَ عَلَيْهِ',
  },
  demo5: {
    q: 'الْعِبَادَةُ هِيَ الطَّاعَةُ وَالْخُضُوعُ لِلَّهِ',
    exp: 'الْعِبَادَةُ اسْمٌ جَامِعٌ لِكُلِّ مَا يُحِبُّهُ اللهُ وَيَرْضَاهُ مِنَ الْأَقْوَالِ وَالْأَعْمَالِ',
  },
};

const norm = (s) =>
  (s || '')
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A]/g, '')
    .replace(/[«»"،.؛:!؟\-()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function hasWellFormedTashkeel(s) {
  const letters = (String(s).match(/[\u0621-\u064A\u0671]/g) || []).length;
  const marks = (String(s).match(/[\u064B-\u065F\u0670]/g) || []).length;
  return letters >= 4 && marks / letters >= 0.12;
}

function applyPhrases(text, phrases) {
  let out = String(text || '').trim();
  if (!out) return '';
  const exact = norm(out);
  for (const [plain, diac] of phrases) {
    if (norm(plain) === exact) return diac;
  }
  const sorted = [...phrases].sort((a, b) => b[0].length - a[0].length);
  for (const [plain, diac] of sorted) {
    if (plain.length >= 5) out = out.split(plain).join(diac);
  }
  return out;
}

function pickSpeechForm(plain, candidates = []) {
  const p = String(plain || '').replace(/^«|»$/g, '').trim();
  if (!p) return '';
  for (const c of candidates) {
    const t = String(c || '').replace(/^«|»$/g, '').trim();
    if (t && hasWellFormedTashkeel(t) && norm(t) === norm(p)) return t;
  }
  return applyPhrases(p, MANUAL_PHRASES);
}

const phraseMap = {};
const phraseList = [...MANUAL_PHRASES];
const phraseSeen = new Set(MANUAL_PHRASES.map(([p]) => norm(p)));
const byQuestion = { ...DEMO_SPEECH };

for (const [plain, diac] of MANUAL_PHRASES) {
  const key = norm(plain);
  if (key && diac) phraseMap[key] = diac;
}

function registerPhrase(plain, speech) {
  const p = String(plain || '').replace(/^«|»$/g, '').trim();
  const s = String(speech || '').trim();
  if (!p || !s || p === s || p.length < 6) return;
  const key = norm(p);
  if (!phraseMap[key] || s.length > phraseMap[key].length) phraseMap[key] = s;
  if (!phraseSeen.has(key)) {
    phraseSeen.add(key);
    phraseList.push([p, s]);
  }
}

for (const row of db) {
  const s = snap[row.id] || {};
  const candidates = [
    row.source_quote,
    s.source_quote,
    row.explanation,
    s.explanation,
    row.question_text,
    s.question_text,
  ].filter(Boolean);

  const entry = {};
  const qSpeech = pickSpeechForm(row.question_text, candidates);
  if (qSpeech) entry.q = qSpeech;
  const expSpeech = pickSpeechForm(row.explanation, candidates);
  if (expSpeech) entry.exp = expSpeech;
  const quoteSpeech = pickSpeechForm(row.source_quote || s.source_quote, candidates);
  if (quoteSpeech) entry.quote = quoteSpeech.replace(/^«|»$/g, '').trim();

  (row.options || []).forEach((opt, i) => {
    const t = pickSpeechForm(opt, candidates);
    if (t) entry[`a${i}`] = t;
  });

  if (Object.keys(entry).length) byQuestion[row.id] = entry;

  for (const field of [row.question_text, row.explanation, row.source_quote, ...(row.options || [])]) {
    const plain = String(field || '').replace(/^«|»$/g, '').trim();
    if (!plain || plain.length < 6) continue;
    const speech = pickSpeechForm(plain, candidates);
    registerPhrase(plain, speech);
  }
}

phraseList.sort((a, b) => b[0].length - a[0].length);

writeFileSync(
  join(root, 'speech-diacritics-map.js'),
  '/** Auto-generated — node scripts/build_speech_diacritics_map.mjs */\n' +
    'window.SPEECH_PHRASE_MAP = ' +
    JSON.stringify(phraseMap, null, 2) +
    ';\n' +
    'window.SPEECH_PHRASE_LIST = ' +
    JSON.stringify(phraseList, null, 2) +
    ';\n' +
    'window.SPEECH_BY_QUESTION_ID = ' +
    JSON.stringify(byQuestion, null, 2) +
    ';\n'
);

console.log(`speech-diacritics-map.js: ${Object.keys(phraseMap).length} phrases, ${Object.keys(byQuestion).length} questions`);
