#!/usr/bin/env node
/**
 * Exhaustive haraka/word audit + high-confidence fixes.
 *
 * 1) Bank display OCR/glue fixes (questions-bank.json + .js)
 * 2) Resync SPEECH_BY_QUESTION_ID wording from bank (via fix_speech_match_display)
 * 3) High-confidence iʿrāb replacements in speech maps + phrase map
 * 4) Full coverage report (display + speech path)
 *
 *   node scripts/exhaustive_haraka_audit_fix.mjs
 *   node scripts/exhaustive_haraka_audit_fix.mjs --audit-only
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { fixAllahIrabInText } from '../allah-irab.js';
import { prepareFishTtsText } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const auditOnly = process.argv.includes('--audit-only');

const HARAKAT_RE = /[\u064B-\u065F\u0670]/;
const WORD_RE = /[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g;

function loadWindow(file) {
  const win = {};
  new Function('window', readFileSync(join(root, file), 'utf8'))(win);
  return win;
}

function stripHarakat(s) {
  return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
}

function expandHonorifics(s) {
  return String(s || '')
    .replace(/\uFDFA/g, ' صلى الله عليه وسلم ')
    .replace(/\uFDFB/g, ' جل جلاله ')
    .replace(/صلعم/g, ' صلى الله عليه وسلم ')
    .replace(/\(ص\)/g, ' صلى الله عليه وسلم ');
}

function norm(s) {
  return expandHonorifics(s)
    .replace(/[\u064B-\u065F\u0670\u0610-\u061A\u0640\u200c\u200f]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\bلو\s+لا\b/g, 'لولا')
    .replace(/[؟?!.،,;؛:«»"'“”‘’()[\]{}✓✗—–\-…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bankFields(q) {
  const out = [];
  if (q.question_text) out.push(['q', 'question_text', q.question_text]);
  (q.options || []).forEach((o, i) => out.push([`a${i}`, `options[${i}]`, o]));
  if (q.explanation) out.push(['exp', 'explanation', q.explanation]);
  if (q.source_quote) out.push(['quote', 'source_quote', q.source_quote]);
  return out;
}

/** High-confidence bank display fixes only. */
const BANK_FIXES = [
  {
    id: '9b8bd8b1-9714-4bb7-a052-ed729cf18151',
    field: 'question_text',
    from: 'الشرك الأصغر يحبط جميعاًلأعمال.',
    to: 'الشرك الأصغر يحبط جميع الأعمال.',
  },
  {
    id: '1846362e-ef04-4578-890d-f9cc27113266',
    field: 'options',
    index: 0,
    from: 'الأكبر يحبط جميعاًلعمل وصاحبه مخلد في النار ويخرج من الملة، والأصغر بخلافه',
    to: 'الأكبر يحبط جميع العمل وصاحبه مخلد في النار ويخرج من الملة، والأصغر بخلافه',
  },
  {
    id: 'c24fc4ba-bfe7-2b9e-7afb-bcb17b18d1a9',
    field: 'question_text',
    from: 'الشرك الذي يحبط جميعاًلأعمال ويخلد صاحبه في النار هو:',
    to: 'الشرك الذي يحبط جميع الأعمال ويخلد صاحبه في النار هو:',
  },
  {
    id: '8285fb94-48e6-ff29-55f5-c45f1c8269e2',
    field: 'options',
    index: 0,
    from: 'يحبط جميعاًلأعمال ويخلد في النار وينقل عن الملة',
    to: 'يحبط جميع الأعمال ويخلد في النار وينقل عن الملة',
  },
  {
    id: '8285fb94-48e6-ff29-55f5-c45f1c8269e2',
    field: 'explanation',
    from: 'الإجابة الصحيحة: يحبط جميعاًلأعمال ويخلد في النار وينقل عن الملة.',
    to: 'الإجابة الصحيحة: يحبط جميع الأعمال ويخلد في النار وينقل عن الملة.',
  },
  {
    id: 'ffe0b7b1-6ed0-c04f-9b6c-b180446b518f',
    field: 'options',
    index: 1,
    from: 'يحبط جميعاًلأعمال',
    to: 'يحبط جميع الأعمال',
  },
  {
    id: '8230d37a-f5c5-4dea-b8d2-ee499eec99e6',
    field: 'source_quote',
    from: '.توحيد الله بإخالص العبادة له والبراءة من عبادة كل ما سواه',
    to: 'توحيد الله بإخلاص العبادة له والبراءة من عبادة كل ما سواه',
  },
];

/** High-confidence speech iʿrāb (whole-phrase / governed by على/إلى/في). */
const SPEECH_IRAB_FIXES = [
  [/عَلَى الْمُسْلِمُ أَنَّ/g, 'عَلَى الْمُسْلِمِ أَنْ'],
  [/عَلَى الْمُسْلِمُ أَنْ/g, 'عَلَى الْمُسْلِمِ أَنْ'],
  [/عَلَى الْمُسْلِمُ/g, 'عَلَى الْمُسْلِمِ'],
  [/يَنْبَغِي عَلَى الْمُسْلِمُ/g, 'يَنْبَغِي عَلَى الْمُسْلِمِ'],
  [/عَلَى الْإِخْلَاصُ/g, 'عَلَى الْإِخْلَاصِ'],
  [/الْحَثُّ عَلَى الْإِخْلَاصُ/g, 'الْحَثُّ عَلَى الْإِخْلَاصِ'],
  [/إِلَى التَّوْحِيدُ/g, "إِلَى التَّوْحِيدِ"],
  [/إِلَى التَّوْحِيدُ/g, 'إِلَى التَّوْحِيدِ'],
  [/بَعْدَ التَّوْحِيدُ/g, "بَعْدَ التَّوْحِيدِ"],
  [/بَعْدَ التَّوْحِيدُ/g, 'بَعْدَ التَّوْحِيدِ'],
  [/فِي الْأُصُولُ/g, 'فِي الْأُصُولِ'],
  [/نَعَمْ، الْإِيمَانِ ب/g, 'نَعَمْ، الْإِيمَانُ ب'],
  [/:\s*الْإِيمَانِ ب/g, ': الْإِيمَانُ ب'],
  [/وأ\s+مور/g, 'وَأُمُورَ'],
  [/او\s+قات/g, 'أَوْقَات'],
  [/وأو قات/g, 'وَأَوْقَات'],
  [/يبأحكامه/g, 'يَبْنِيَ أَحْكَامَهُ'],
  [/ا منزه/g, "اللَّهُ مُنَزَّهٌ"],
];

function applyBankFixes(bank) {
  const applied = [];
  const byId = new Map();
  for (const arr of Object.values(bank)) for (const q of arr) byId.set(q.id, q);

  for (const fix of BANK_FIXES) {
    const q = byId.get(fix.id);
    if (!q) continue;
    if (fix.field === 'options') {
      const cur = q.options?.[fix.index];
      if (cur === fix.from) {
        q.options[fix.index] = fix.to;
        applied.push({ ...fix, status: 'applied' });
      } else if (cur === fix.to) {
        applied.push({ ...fix, status: 'already' });
      } else {
        applied.push({ ...fix, status: 'skip_mismatch', current: cur });
      }
      continue;
    }
    const cur = q[fix.field];
    if (cur === fix.from) {
      q[fix.field] = fix.to;
      applied.push({ ...fix, status: 'applied' });
    } else if (cur === fix.to) {
      applied.push({ ...fix, status: 'already' });
    } else {
      applied.push({ ...fix, status: 'skip_mismatch', current: cur });
    }
  }
  return applied;
}

function writeBank(bank) {
  const json = JSON.stringify(bank, null, 2) + '\n';
  writeFileSync(join(root, 'questions-bank.json'), json);
  writeFileSync(join(root, 'questions-bank.js'), `window.QUESTIONS_BANK = ${JSON.stringify(bank, null, 2)};\n`);
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function writeSupabaseSql(applied) {
  const lines = [
    '-- Exhaustive haraka/OCR bank field fixes — apply with service_role / SQL editor',
    '-- NEVER commit SUPABASE_KEY / service_role.',
    `-- generated: ${new Date().toISOString()}`,
    '',
  ];
  for (const f of applied.filter((a) => a.status === 'applied')) {
    if (f.field === 'options') {
      lines.push(
        `-- ${f.id} options[${f.index}]`,
        `-- Manual: replace option text in JSON options array (or patch via app sync).`,
        `-- from: ${f.from}`,
        `-- to:   ${f.to}`,
        ''
      );
      continue;
    }
    lines.push(
      `UPDATE questions SET ${f.field} = '${sqlEscape(f.to)}' WHERE id = '${f.id}';`,
      `-- was: ${f.from}`,
      ''
    );
  }
  const path = join(root, 'extracted/exhaustive_haraka_supabase.sql');
  writeFileSync(path, lines.join('\n'));
  return path;
}

function replaceSpeechBlock(mapSrc, marker, obj) {
  const idx = mapSrc.indexOf(marker);
  if (idx < 0) throw new Error(`${marker} not found`);
  const start = mapSrc.indexOf('{', idx);
  let depth = 0;
  let end = -1;
  let inStr = false;
  let quote = '';
  let esc = false;
  for (let i = start; i < mapSrc.length; i++) {
    const c = mapSrc[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`failed to find end of ${marker}`);
  return mapSrc.slice(0, idx) + `${marker}${JSON.stringify(obj, null, 2)}` + mapSrc.slice(end);
}

function applySpeechIrabFixes(text) {
  let s = String(text || '');
  let n = 0;
  for (const [re, to] of SPEECH_IRAB_FIXES) {
    const next = s.replace(re, to);
    if (next !== s) n += 1;
    s = next;
  }
  return { text: s, hits: n };
}

function auditCorpus(bank, byId, phraseMap) {
  const all = Object.values(bank).flat();
  let displayFields = 0;
  let displayWords = 0;
  let displayBare = 0;
  let displayMarked = 0;
  let speechFields = 0;
  let speechWords = 0;
  let speechMarked = 0;
  let speechBare = 0;
  let wordingMismatch = 0;
  let weakSpeech = 0;
  const ocrHits = [];
  const irabHits = [];
  const allahForms = { nominative: 0, genitive: 0, accusative: 0, bare: 0, other: 0 };
  const uniqueBare = new Set();

  const ocrPatterns = [
    [/جميعاً?ل/, 'glued_جميعاًل'],
    [/إخالص/, 'typo_إخالص'],
    [/^\./, 'leading_dot'],
    [/الن ي/, 'ocr_الن ي'],
    [/تغي ي/, 'ocr_تغي ي'],
    [/اللاه/, 'اللاه'],
  ];

  for (const q of all) {
    for (const [role, , text] of bankFields(q)) {
      displayFields += 1;
      const toks = String(text).match(WORD_RE) || [];
      displayWords += toks.length;
      for (const tok of toks) {
        const bare = stripHarakat(tok);
        uniqueBare.add(bare);
        if (HARAKAT_RE.test(tok)) displayMarked += 1;
        else displayBare += 1;
      }
      for (const [re, name] of ocrPatterns) {
        if (re.test(text)) ocrHits.push({ id: q.id, role, name, text: text.slice(0, 120) });
      }
      const entry = byId[q.id] || {};
      const speech =
        role === 'q'
          ? entry.q
          : role.startsWith('a')
            ? entry[role]
            : role === 'exp'
              ? entry.exp
              : entry.quote;
      if (speech) {
        speechFields += 1;
        const st = String(speech).match(WORD_RE) || [];
        speechWords += st.length;
        for (const tok of st) {
          if (HARAKAT_RE.test(tok)) speechMarked += 1;
          else speechBare += 1;
        }
        if (norm(speech) !== norm(text)) wordingMismatch += 1;
        const letters = (speech.match(/[\u0621-\u064A\u0671]/g) || []).length;
        const marks = (speech.match(/[\u064B-\u065F\u0670]/g) || []).length;
        if (letters >= 8 && marks / letters < 0.18) weakSpeech += 1;
        for (const [re] of SPEECH_IRAB_FIXES) {
          if (re.test(speech)) {
            irabHits.push({ id: q.id, role, text: speech.slice(0, 120) });
            break;
          }
        }
        const allahToks = speech.match(/الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g) || [];
        for (const a of allahToks) {
          if (/هُ$|هُ\u0652?$|اللَّهُ|اللَّهُ/.test(a) || /اللَّهُ/.test(a)) allahForms.nominative += 1;
          else if (/هِ$|اللَّهِ|اللَّهِ/.test(a)) allahForms.genitive += 1;
          else if (/هَ$|اللَّهَ|اللَّهَ/.test(a)) allahForms.accusative += 1;
          else if (stripHarakat(a) === 'الله') allahForms.bare += 1;
          else allahForms.other += 1;
        }
      }
    }
  }

  // Spot-check prepareFishTtsText on a sample of speech strings
  let fishChecked = 0;
  let fishBareDrift = 0;
  for (const q of all.slice(0, 80)) {
    const e = byId[q.id];
    if (!e?.q) continue;
    const prepared = prepareFishTtsText(fixAllahIrabInText(e.q));
    fishChecked += 1;
    // carriers may expand — only flag if consonants of original vanish entirely
    const bareQ = stripHarakat(norm(e.q)).replace(/\s+/g, '');
    const bareP = stripHarakat(norm(prepared)).replace(/\s+/g, '');
    if (bareQ.length >= 12 && bareP.length < Math.floor(bareQ.length * 0.35)) fishBareDrift += 1;
  }

  return {
    questions: all.length,
    uniqueBareWords: uniqueBare.size,
    display: { fields: displayFields, words: displayWords, bare: displayBare, marked: displayMarked },
    speech: {
      fields: speechFields,
      words: speechWords,
      bare: speechBare,
      marked: speechMarked,
      wordingMismatch,
      weakSpeech,
      phraseMapSize: Object.keys(phraseMap || {}).length,
    },
    ocrResidual: ocrHits,
    irabPatternHits: irabHits.length,
    irabSamples: irabHits.slice(0, 20),
    allahForms,
    fishSpot: { checked: fishChecked, severeDrift: fishBareDrift },
  };
}

// ---------- main ----------
const bank = JSON.parse(readFileSync(join(root, 'questions-bank.json'), 'utf8'));
const report = {
  at: new Date().toISOString(),
  versionTarget: 'v310+',
  auditOnly,
};

if (!auditOnly) {
  const bankApplied = applyBankFixes(bank);
  writeBank(bank);
  const sqlPath = writeSupabaseSql(bankApplied);
  report.bankFixes = {
    applied: bankApplied.filter((a) => a.status === 'applied').length,
    already: bankApplied.filter((a) => a.status === 'already').length,
    skipped: bankApplied.filter((a) => a.status === 'skip_mismatch').length,
    details: bankApplied,
    sqlPath: sqlPath.replace(root + '/', ''),
  };

  // Resync speech maps from bank wording
  const sync = spawnSync(process.execPath, [join(root, 'scripts/fix_speech_match_display.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  report.speechResync = {
    status: sync.status,
    stdout: (sync.stdout || '').trim(),
    stderr: (sync.stderr || '').slice(0, 500),
  };

  // Apply iʿrāb fixes across BY_ID + PHRASE_MAP
  let mapSrc = readFileSync(join(root, 'speech-diacritics-map.js'), 'utf8');
  const win = {};
  new Function('window', mapSrc)(win);
  let irabFieldHits = 0;
  let irabPhraseHits = 0;
  const byId = win.SPEECH_BY_QUESTION_ID || {};
  for (const id of Object.keys(byId)) {
    for (const f of Object.keys(byId[id])) {
      const { text, hits } = applySpeechIrabFixes(byId[id][f]);
      if (hits) {
        byId[id][f] = text;
        irabFieldHits += hits;
      }
    }
  }
  const phraseMap = win.SPEECH_PHRASE_MAP || {};
  for (const k of Object.keys(phraseMap)) {
    const { text, hits } = applySpeechIrabFixes(phraseMap[k]);
    if (hits) {
      phraseMap[k] = text;
      irabPhraseHits += hits;
    }
  }
  mapSrc = replaceSpeechBlock(mapSrc, 'window.SPEECH_PHRASE_MAP = ', phraseMap);
  mapSrc = replaceSpeechBlock(mapSrc, 'window.SPEECH_BY_QUESTION_ID = ', byId);
  writeFileSync(join(root, 'speech-diacritics-map.js'), mapSrc);

  const verifiedPath = join(root, 'scripts/verified-questions-speech.json');
  if (existsSync(verifiedPath)) {
    const verified = JSON.parse(readFileSync(verifiedPath, 'utf8'));
    for (const id of Object.keys(byId)) {
      verified[id] = { ...(verified[id] || {}), ...byId[id] };
    }
    writeFileSync(verifiedPath, JSON.stringify(verified, null, 2) + '\n');
  }

  report.speechIrabFixes = { fieldRuleHits: irabFieldHits, phraseRuleHits: irabPhraseHits };
}

// Fresh load for audit
const win2 = loadWindow('speech-diacritics-map.js');
const bank2 = JSON.parse(readFileSync(join(root, 'questions-bank.json'), 'utf8'));
report.coverage = auditCorpus(bank2, win2.SPEECH_BY_QUESTION_ID || {}, win2.SPEECH_PHRASE_MAP || {});

// Re-run wording verify
const verify = spawnSync(process.execPath, [join(root, 'scripts/verify_all_questions_speech.mjs'), '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
try {
  const start = verify.stdout.indexOf('{');
  const j = JSON.parse(verify.stdout.slice(start));
  report.verify = {
    checked: j.checked,
    wordingMismatches: j.wordingMismatches,
    weakTashkeel: j.weakTashkeel,
    missingIds: j.missingIds,
    abadBad: j.abadBad,
    allahBad: j.allahBad,
  };
} catch {
  report.verify = { error: (verify.stderr || verify.stdout || '').slice(0, 400) };
}

report.scholarResidual = [
  {
    ids: ['30e67e81-85f8-44e0-abee-f4c482fa9a03'],
    item: 'تصوير ذوات الأرواح',
    note: 'حكم «حرام» وفق منهج الكتاب؛ خلاف الصور غير المجسّمة معاصر — لم يُختَرع حكم.',
  },
  {
    ids: ['34f0da6e-4ab8-4721-b1eb-1105c59d76f2'],
    item: 'التوسل بجاه النبي',
    note: '«بدعة لا تجوز» وفق المقرر النجدي؛ خلاف مذهبي معروف.',
  },
  {
    ids: ['6b5e357b-2337-4685-ae2c-804d957878ea'],
    item: 'تقسيم البدعة حسنة/سيئة',
    note: 'نفيه متسق مع «كل بدعة ضلالة» في المقرر؛ تُرك.',
  },
  {
    ids: ['213fc1f9-d919-4153-b28a-6e53cb13acce'],
    item: 'تعلّم السحر كفر',
    note: 'موافق لباب الكتاب؛ تفصيل أنواع السحر للمراجع.',
  },
  {
    ids: ['4bf4fd9c-e6d5-4550-b476-2f86353dd123'],
    item: 'الحكم بغير ما أنزل الله',
    note: 'يحتاج ضبط أكبر/أصغر عند الاشتباه مع مراجع.',
  },
  {
    ids: [],
    item: 'حالات إضافة ملتبسة (ركن/مرتبة/وجوب + اسم)',
    note: 'عند تعارض قراءات المصحف/الكتب اترك للعالم — لا اختراع حركة.',
  },
  {
    ids: [],
    item: 'ذباب / قرب ذبابا (Fish)',
    note: 'مغطى بـ lemma clips (v308–v309)؛ STT كان يسمع دباب — العرض بلا تغيير.',
  },
  {
    ids: [],
    item: 'لا ضرر ولا ضرار (Fish دمج لا+ضرر)',
    note: 'مقطع lemma مثبت؛ الإعراب المنطوق نصب؛ العرض بلا تشكيل إضافي.',
  },
];

report.honestScope = {
  ar: '«كل حركة وكل كلمة» في هذا المرور = تغطية آلية كاملة لـ595 سؤالاً (عرض+خريطة نطق+قواعد إعراب عالية الثقة+استماع للعبارات الهشة الموثّقة). ليست مراجعة عالم بشري حرفاً حرفاً لكل تشكيل في الخريطة.',
  displayPolicy: 'شاشة الدرس بلا تشكيل؛ التشكيل في مسار النطق (SPEECH_BY_QUESTION_ID / خرائط / scrub / allah-irab / حاملات / lemma clips).',
  methods: ['programmatic OCR/glue', 'rule-based iʿrāb', 'speech↔bank wording sync', 'prior listen STT residuals v305–v309', 'allah-irab consistency'],
};

const outPath = join(root, 'extracted/exhaustive_haraka_audit_v310.json');
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
console.log('\nWrote', outPath);
