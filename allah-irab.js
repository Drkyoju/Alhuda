/**
 * Case-aware الله-family i'rab for Arabic TTS.
 * Generated — node scripts/build_allah_irab.mjs
 */

const HARAKAT_RE = /[\u064B-\u065F\u0670]/g;

/** Case forms — wrong case after عند/من/إفراد makes Yousef stumble into «اللاه». */
export const ALLAH_NOM = 'اللَّهُ'; // مرفوع
export const ALLAH_ACC = 'اللَّهَ'; // منصوب
export const ALLAH_GEN = 'اللَّهِ'; // مجرور
export const ALLAHUMMA = 'اللَّهُمَّ';
export const LILLAH = 'لِلَّهِ';
export const BILLAH = 'بِاللَّهِ';
export const WALLAH = 'وَاللَّهِ';
export const FALLAH = 'فَاللَّهِ';
export const TALLAH = 'تَاللَّهِ';
export const KALLAH = 'كَاللَّهِ';
export const WALILLAH = 'وَلِلَّهِ';
export const FALILLAH = 'فَلِلَّهِ';
export const ILLA_ALLAH = 'إِلَّا اللَّهَ';
export const LA_ILAHA_ILLA_ALLAH = 'لَا إِلَٰهَ إِلَّا اللَّهُ';
export const LA_MABUDA_BIHAQQ_ILLA_ALLAH = 'لَا مَعْبُودَ بِحَقٍّ إِلَّا اللَّهَ';

/** Prepositions / إضافة heads that put الله in the genitive. */
const ALLAH_GEN_BEFORE_RE =
  /(?:ع(?:ِ)?ن(?:ْ)?د(?:َ)?|م(?:ِ)?ن(?:ْ|َ)?|إِ?ل(?:َ)?ى|الى|ع(?:َ)?ن(?:ْ)?|ع(?:َ)?ل(?:َ)?ى|ف(?:ِ)?ي|م(?:َ)?ع(?:َ)?|ل(?:َ)?د(?:َ)?ى|غ(?:َ)?ي(?:ْ)?ر(?:َ)?|س(?:ِ)?و(?:َ)?ى|د(?:ُ)?و(?:ْ)?ن(?:َ)?|ح(?:َ)?ق(?:ُّ|ُ)?|إِ?ف(?:ْ)?ر(?:َ)?اد(?:ُ)?|افراد|ع(?:ِ)?ب(?:َ)?اد(?:َ)?ة(?:ِ)?|اس(?:ْ)?م(?:ُ)?|ر(?:َ)?س(?:ُ)?ول(?:ُ)?|ع(?:َ)?ب(?:ْ)?د(?:ُ)?|ب(?:ِ)?غ(?:َ)?ي(?:ْ)?ر(?:ِ)?)\s*$/u;

/** Particles that put الله in the accusative. */
const ALLAH_ACC_BEFORE_RE = /(?:إِ?ن(?:َّ)?|ان|أَ?ن(?:َّ)?|إِ?ل(?:َّ)?ا)\s*$/u;

const ALLAH_PHRASE_RULES = [
  [/ما أعظم الذنوب عند الله/g, `مَا أَعْظَمُ الذُّنُوبِ عِنْدَ ${ALLAH_GEN}`],
  [/ما اعظم الذنوب عند الله/g, `مَا أَعْظَمُ الذُّنُوبِ عِنْدَ ${ALLAH_GEN}`],
  [/أعظم الذنوب عند الله/g, `أَعْظَمُ الذُّنُوبِ عِنْدَ ${ALLAH_GEN}`],
  [/اعظم الذنوب عند الله/g, `أَعْظَمُ الذُّنُوبِ عِنْدَ ${ALLAH_GEN}`],
  [/عند الله/g, `عِنْدَ ${ALLAH_GEN}`],
  [/عِنْدَ\s+الل[^\s]*/g, `عِنْدَ ${ALLAH_GEN}`],
  [/شهادة أن لا إله إلا الله/g, 'شَهَادَةُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ'],
  [/شهادة ان لا اله الا الله/g, 'شَهَادَةُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ'],
  [/لا إله إلا الله/g, LA_ILAHA_ILLA_ALLAH],
  [/لا اله الا الله/g, LA_ILAHA_ILLA_ALLAH],
  [/لا معبود بحق إلا الله/g, LA_MABUDA_BIHAQQ_ILLA_ALLAH],
  [/لا معبود بحق الا الله/g, LA_MABUDA_BIHAQQ_ILLA_ALLAH],
  [/إلا الله/g, ILLA_ALLAH],
  [/الا الله/g, ILLA_ALLAH],
  [/بالله عليك/g, `${BILLAH} عَلَيْكَ`],
  [/والله أعلم/g, `${WALLAH} أَعْلَمُ`],
  [/والله اعلم/g, `${WALLAH} أَعْلَمُ`],
  [/إن شاء الله/g, `إِنْ شَاءَ ${ALLAH_NOM}`],
  [/ان شاء الله/g, `إِنْ شَاءَ ${ALLAH_NOM}`],
  [/ما شاء الله/g, `مَا شَاءَ ${ALLAH_NOM}`],
  [/إفراد الله/g, `إِفْرَادُ ${ALLAH_GEN}`],
  [/افراد الله/g, `إِفْرَادُ ${ALLAH_GEN}`],
  [/حق الله/g, `حَقُّ ${ALLAH_GEN}`],
  [/من دون الله/g, `مِنْ دُونِ ${ALLAH_GEN}`],
  [/لغير الله/g, `لِغَيْرِ ${ALLAH_GEN}`],
  [/بغير الله/g, `بِغَيْرِ ${ALLAH_GEN}`],
  [/قال الله/g, `قَالَ ${ALLAH_NOM}`],
  [/أمر الله/g, `أَمَرَ ${ALLAH_NOM}`],
  [/امر الله/g, `أَمَرَ ${ALLAH_NOM}`],

  [/من لقي الله/g, `مِنْ لَقِيَ ${ALLAH_ACC}`],
  [/لقي الله/g, `لَقِيَ ${ALLAH_ACC}`],
  [/احفظ الله/g, `احْفَظِ ${ALLAH_ACC}`],
  [/يحفظك الله/g, `يَحْفَظْكَ ${ALLAH_NOM}`],
  [/رحمه الله/g, `رَحِمَهُ ${ALLAH_NOM}`],
  [/رحمها الله/g, `رَحِمَهَا ${ALLAH_NOM}`],
  [/رحمهما الله/g, `رَحِمَهُمَا ${ALLAH_NOM}`],
  [/خلق الله/g, `خَلَقَ ${ALLAH_NOM}`],
  [/من الخوف من الله/g, `مِنَ الْخَوْفِ مِنَ ${ALLAH_GEN}`],
  [/الخوف من الله/g, `الْخَوْفِ مِنَ ${ALLAH_GEN}`],
  [/رسول الله/g, `رَسُولُ ${ALLAH_GEN}`],
  [/عبد الله/g, `عَبْدِ ${ALLAH_GEN}`],
  [/ابن عبد الله/g, `ابْنُ عَبْدِ ${ALLAH_GEN}`],
  [/صلى الله/g, `صَلَّى ${ALLAH_NOM}`],
  [/رضي الله/g, `رَضِيَ ${ALLAH_NOM}`],
];

function stripHarakat(text) {
  return String(text || '').replace(HARAKAT_RE, '');
}

function stripTtsPunctuation(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[.؟!…,:：;؛،()\[\]{}«»"'“”‘’*_#<>=+~^`\/\\|–—•·-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyPhraseRules(text) {
  let s = String(text || '');
  for (const [pattern, replacement] of ALLAH_PHRASE_RULES) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

function allahFormForContext(before) {
  const bare = stripHarakat(before || '').replace(/\s+/g, ' ');
  if (ALLAH_GEN_BEFORE_RE.test(bare)) return ALLAH_GEN;
  if (ALLAH_ACC_BEFORE_RE.test(bare)) return ALLAH_ACC;
  return ALLAH_NOM;
}

function normalizeAllahTokens(text) {
  const H = '[\\u064B-\\u065F\\u0670]*';
  let s = String(text || '');
  s = s.replace(/\uFDF2/g, ALLAH_NOM);
  s = s.replace(new RegExp(`ل${H}ا${H}\\s+إ${H}ل${H}ه${H}\\s+إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), LA_ILAHA_ILLA_ALLAH);
  s = s.replace(new RegExp(`إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), ILLA_ALLAH);
  s = s.replace(new RegExp(`[اأإآٱ]${H}ل${H}ل${H}ه${H}م${H}`, 'g'), ALLAHUMMA);

  s = s.replace(new RegExp(`([بوفكت])${H}[اأإآٱ]${H}ل${H}ل${H}ه(${H})`, 'g'), (_, p) => {
    if (p === 'ب') return BILLAH;
    if (p === 'و') return WALLAH;
    if (p === 'ف') return FALLAH;
    if (p === 'ت') return TALLAH;
    return KALLAH;
  });
  s = s.replace(new RegExp(`(^|[^\\u0621-\\u064A\\u0671])([وف])${H}ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'), (_, pre, p) => `${pre}${p === 'و' ? WALILLAH : FALILLAH}`);
  s = s.replace(new RegExp(`(^|[^\\u0621-\\u064A\\u0671])ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'), (_, pre) => `${pre}${LILLAH}`);

  // Standalone الله — pick إعراب from the preceding word (عند→مجرور, قال→مرفوع…).
  s = s.replace(
    new RegExp(
      `(^|[^\\u0621-\\u064A\\u0671\\u064B-\\u065F\\u0670])[اأإآٱ]${H}ل${H}ل${H}ه(${H})(?!(?:[\\u064B-\\u065F\\u0670]*[\\u0621-\\u064A]))`,
      'g'
    ),
    (match, pre, _marks, offset, full) => {
      const allahPart = match.slice(pre.length);
      if (allahPart === ALLAH_NOM || allahPart === ALLAH_ACC || allahPart === ALLAH_GEN) return match;
      const before = full.slice(Math.max(0, offset - 24), offset + pre.length);
      return `${pre}${allahFormForContext(before)}`;
    }
  );

  s = s.replace(/(^|[\s(«"'])تعالى(?=$|[\s).،؟!؛»"'])/g, '$1تَعَالَى');

  const scrubHack = (hack, repl) => {
    s = s.replace(
      new RegExp(`(^|[^\\u0621-\\u064A\\u0671])${hack}(?=[^\\u0621-\\u064A\\u0671]|$)`, 'g'),
      (_, pre) => `${pre}${repl}`
    );
  };
  scrubHack('اللاه', ALLAH_NOM);
  scrubHack('للاه', LILLAH);
  scrubHack('باللاه', BILLAH);
  scrubHack('واللاه', WALLAH);
  scrubHack('فاللاه', FALLAH);
  scrubHack('تاللاه', TALLAH);
  scrubHack('كاللاه', KALLAH);

  return s;
}

function applyWordLexicon(text) {
  return String(text || '').replace(/[\u0621-\u0671\u064B-\u065F\u0670\uFDF2]+/g, (token, offset, full) => {
    const bare = stripHarakat(token);
    if (bare === 'الله') {
      // Keep an already-correct case form from phrase rules / previous pass.
      if (token === ALLAH_NOM || token === ALLAH_ACC || token === ALLAH_GEN) return token;
      const before = full.slice(Math.max(0, offset - 24), offset);
      return allahFormForContext(before);
    }
    if (bare === 'اللهم') return ALLAHUMMA;
    if (bare === 'لله') return LILLAH;
    if (bare === 'ولله') return WALILLAH;
    if (bare === 'فلله') return FALILLAH;
    if (bare === 'بالله') return BILLAH;
    if (bare === 'والله') return WALLAH;
    if (bare === 'فالله') return FALLAH;
    if (bare === 'تالله') return TALLAH;
    if (bare === 'كالله') return KALLAH;
    if (bare === 'إلاالله' || bare === 'الاالله') return ILLA_ALLAH;
    if (bare === 'لاإلهإلاالله' || bare === 'لاالهالاالله' || bare === 'لاالهإلاالله') return LA_ILAHA_ILLA_ALLAH;
    if (bare === 'تعالى') return 'تَعَالَى';
    return token;
  });
}

function normalizeForElevenLabs(text) {
  return applyWordLexicon(normalizeAllahForElevenLabs(applyPhraseRules(stripTtsPunctuation(text))));
}
/** Fix الله-family i'rab in any Arabic TTS string. */
export function fixAllahIrabInText(text) {
  return applyWordLexicon(normalizeAllahTokens(applyPhraseRules(String(text || ''))));
}
