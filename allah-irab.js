/**
 * Case-aware الله-family i'rab for Arabic TTS.
 * Generated — node scripts/build_allah_irab.mjs
 */

const HARAKAT_RE = /[\u064B-\u065F\u0670]/g;

/**
 * Case forms — MUST use NFC mark order: shadda (U+0651) THEN vowel.
 * Fatha-before-shadda (common in editors) makes Fish clone read «اللاه».
 */
const _SH = '\u0651';
const _F = '\u064E';
const _D = '\u064F';
const _K = '\u0650';
export const ALLAH_NOM = `الل${_SH}${_F}ه${_D}`; // مرفوع اللَّهُ
export const ALLAH_ACC = `الل${_SH}${_F}ه${_F}`; // منصوب اللَّهَ
export const ALLAH_GEN = `الل${_SH}${_F}ه${_K}`; // مجرور اللَّهِ
export const ALLAHUMMA = `الل${_SH}${_F}ه${_D}م${_SH}${_F}`;
export const LILLAH = `لِل${_SH}${_F}ه${_K}`;
export const BILLAH = `بِالل${_SH}${_F}ه${_K}`;
export const WALLAH = `وَالل${_SH}${_F}ه${_K}`;
export const FALLAH = `فَالل${_SH}${_F}ه${_K}`;
export const TALLAH = `تَالل${_SH}${_F}ه${_K}`;
export const KALLAH = `كَالل${_SH}${_F}ه${_K}`;
export const WALILLAH = `وَلِل${_SH}${_F}ه${_K}`;
export const FALILLAH = `فَلِل${_SH}${_F}ه${_K}`;
export const ILLA_ALLAH = `إِل${_SH}${_F}ا ${ALLAH_ACC}`;
export const LA_ILAHA_ILLA_ALLAH = `لَا إِلَٰهَ إِل${_SH}${_F}ا ${ALLAH_NOM}`;
export const LA_MABUDA_BIHAQQ_ILLA_ALLAH = `لَا مَعْبُودَ بِحَق${_SH}${_K} إِل${_SH}${_F}ا ${ALLAH_ACC}`;

/** Prepositions / إضافة heads that put الله in the genitive.
 *  Match the LAST WORD only — never suffixes (لعن must not match عن).
 *  Expanded from full-bank scan of prev-token before الله. */
const ALLAH_GEN_LAST_RE =
  /^(?:ع(?:ِ)?ن(?:ْ)?د(?:َ)?|م(?:ِ)?ن(?:ْ|َ)?|إِ?ل(?:َ)?ى|الى|ع(?:َ)?ن(?:ْ)?|ع(?:َ)?ل(?:َ)?ى|ف(?:ِ)?ي|م(?:َ)?ع(?:َ)?|ل(?:َ)?د(?:َ)?ى|غ(?:َ)?ي(?:ْ)?ر(?:َ|ِ)?|س(?:ِ)?و(?:َ)?ى|د(?:ُ)?و(?:ْ)?ن(?:َ)?|ح(?:َ)?ق(?:ُّ|ُ|ِ)?|ح(?:ُ)?ق(?:ُ)?وق(?:ُ|ِ)?|إِ?ف(?:ْ)?ر(?:َ)?اد(?:ُ|ِ)?|افراد|ع(?:ِ)?ب(?:َ)?اد(?:َ)?ة(?:ِ)?|اس(?:ْ)?م(?:ُ|ِ)?|أَ?س(?:ْ)?م(?:َ)?اء(?:ُ|ِ)?|اسماء|ر(?:َ)?س(?:ُ)?ول(?:ُ|ِ)?|ع(?:َ)?ب(?:ْ)?د(?:ُ|ِ)?|ب(?:ِ)?غ(?:َ)?ي(?:ْ)?ر(?:ِ)?|د(?:ِ)?ين(?:َ|ُ|ِ)?|ش(?:َ)?ر(?:ْ)?ع(?:َ|ُ|ِ)?|ح(?:ُ)?د(?:ُ)?ود(?:َ|ُ|ِ)?|ط(?:َ)?اع(?:َ)?ة(?:ِ)?|م(?:َ)?ع(?:ْ)?ص(?:ِ)?ي(?:َ)?ة(?:ِ)?|لِ?غ(?:َ)?ي(?:ْ)?ر(?:ِ)?|ت(?:َ)?ق(?:ْ)?و(?:َ)?ى|تقوى|م(?:َ)?ر(?:ْ)?ض(?:َ)?ات(?:ِ)?|مرضات|م(?:َ)?ع(?:ْ)?ر(?:ِ)?ف(?:َ)?ة(?:ِ)?|معرفة|م(?:َ)?ح(?:َ)?ب(?:ّ)?ة(?:ِ)?|محبة|لِ?م(?:َ)?ح(?:َ)?ب(?:ّ)?ة(?:ِ)?|أَ?و(?:ْ)?ل(?:ِ)?ي(?:َ)?اء(?:ُ|ِ)?|اولياء|أَ?و(?:َ)?ام(?:ِ)?ر(?:ُ|ِ)?|اوامر|أَ?ق(?:ْ)?د(?:َ)?ار(?:ِ)?|اقدار|ك(?:َ)?ح(?:ُ)?ب(?:ّ)?|كحب|م(?:َ)?ك(?:ْ)?ر(?:ُ|ِ)?|مكر|ك(?:ِ)?ت(?:َ)?اب(?:ُ|ِ)?|كتاب|ع(?:َ)?ظ(?:َ)?م(?:َ)?ة(?:ِ)?|عظمة|بِ?ع(?:َ)?ظ(?:َ)?م(?:َ)?ة(?:ِ)?|ر(?:َ)?ح(?:ْ)?م(?:َ)?ة(?:ِ)?|رحمة|و(?:َ)?ص(?:ْ)?ف(?:ُ|ِ)?|وصف|ك(?:َ)?ل(?:َ)?ام(?:ُ|ِ)?|كلام|ب(?:َ)?ي(?:ْ)?ت(?:ُ|ِ)?|بيت|غ(?:َ)?ض(?:َ)?ب(?:ُ|ِ)?|غضب|أَ?ح(?:ْ)?ك(?:َ)?ام(?:ِ)?|احكام|و(?:ُ)?ج(?:ُ)?ود(?:ُ|ِ)?|وجود|ف(?:َ)?ض(?:ْ)?ل(?:ُ|ِ)?|فضل|بِ?ف(?:َ)?ض(?:ْ)?ل(?:ِ)?|م(?:ُ)?ش(?:َ)?ار(?:َ)?ك(?:َ)?ة(?:ِ)?|مشاركة|بِ?ت(?:َ)?ق(?:ْ)?و(?:َ)?ى|ك(?:َ)?م(?:َ)?ش(?:ِ)?ي(?:ْ)?ئ(?:َ)?ة(?:ِ)?|كمشيئة|بِ?أَ?س(?:ْ)?م(?:َ)?اء(?:ِ)?|بِ?إِ?ذ(?:ْ)?ن(?:ِ)?|باذن|بإذن|ذ(?:ِ)?ك(?:ْ)?ر(?:ُ|ِ)?|ذكر|ل(?:َ)?ع(?:ْ)?ن(?:َ)?ة(?:ِ)?|لعنة|م(?:َ)?ح(?:َ)?ار(?:ِ)?م(?:ِ)?|محارم|ك(?:َ)?ل(?:ِ)?م(?:َ)?ات(?:ِ)?|كلمات|ت(?:َ)?و(?:ْ)?ح(?:ِ)?يد(?:ُ|ِ)?|توحيد|أُ?م(?:ُ)?ور(?:ِ)?|امور|ن(?:ُ)?ص(?:ْ)?ر(?:َ|ُ|ِ)?ة(?:ِ)?|نصره|و(?:ِ)?ل(?:َ)?اي(?:َ)?ة(?:ِ)?|ولايه|ولاية|خ(?:َ)?ش(?:ْ)?ي(?:َ)?ة(?:ِ)?|خشية|خ(?:َ)?و(?:ْ)?ف(?:ِ)?|خوف|ح(?:ُ)?ب(?:ّ)?(?:ِ)?|حب|س(?:َ)?ب(?:ِ)?يل(?:ِ)?|سبيل|وَ?ج(?:ْ)?ه(?:ِ)?|وجه|ر(?:ِ)?ض(?:َ)?ا|رضا|أَ?م(?:ْ)?ر(?:ِ)?|امر)$/u;

/** Particles / verbs that put الله in the accusative — last word only. */
const ALLAH_ACC_LAST_RE =
  /^(?:إِ?ن(?:َّ)?|ان|أَ?ن(?:َّ)?|ل(?:ِ)?أ?ن(?:َّ)?|لان|لأن|إِ?ل(?:َّ)?ا|اح(?:ْ)?ف(?:َ)?ظ(?:ِ)?|ل(?:َ)?ق(?:ِ)?ي(?:َ)?|يَ?ع(?:ْ)?ب(?:ُ)?د(?:ُ|َ)?|تَ?ع(?:ْ)?ب(?:ُ)?د(?:ُ|َ)?|نَ?ع(?:ْ)?ب(?:ُ)?د(?:ُ|َ)?|اع(?:ْ)?ب(?:ُ)?د(?:ُ)?وا?|يُ?ر(?:َ)?اق(?:ِ)?ب(?:ُ|َ)?|يراقب|يَ?ذ(?:ْ)?ك(?:ُ)?ر(?:ُ)?ون(?:َ)?|يذكرون|يَ?خ(?:َ)?اف(?:ُ)?ون(?:َ)?|يخافون|ات(?:ّ)?ق(?:ُ)?وا?|اتق|واتقوا|أَ?ط(?:ِ)?ي(?:ْ)?ع(?:ُ)?وا?|اطيعوا|س(?:َ)?ب(?:ّ)?|سب|يَ?ص(?:ِ)?ف(?:ُ|َ)?|يصف|آذ(?:َ)?ى|اذى|أَ?ع(?:ْ)?ن(?:ِ)?ي|اعني)$/u;

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
  [/حق الله على العباد/g, `حَقُّ ${ALLAH_GEN} عَلَى الْعِبَادِ`],
  [/حق الله/g, `حَقُّ ${ALLAH_GEN}`],
  [/دين الله/g, `دِينُ ${ALLAH_GEN}`],
  [/شرع الله/g, `شَرْعُ ${ALLAH_GEN}`],
  [/حدود الله/g, `حُدُودُ ${ALLAH_GEN}`],
  [/(^|[^\u0621-\u064A])عبد الله/g, (_, p) => `${p}عَبْدِ ${ALLAH_GEN}`],
  [/دِينَ\s+اللَّهُ/g, `دِينَ ${ALLAH_GEN}`],
  [/شَرْعَ\s+اللَّهُ/g, `شَرْعَ ${ALLAH_GEN}`],
  [/حُدُودَ\s+اللَّهُ/g, `حُدُودَ ${ALLAH_GEN}`],
  [/من دون الله/g, `مِنْ دُونِ ${ALLAH_GEN}`],
  [/لغير الله/g, `لِغَيْرِ ${ALLAH_GEN}`],
  [/بغير الله/g, `بِغَيْرِ ${ALLAH_GEN}`],
  [/قال الله/g, `قَالَ ${ALLAH_NOM}`],
  [/أمر الله/g, `أَمَرَ ${ALLAH_NOM}`],
  [/امر الله/g, `أَمَرَ ${ALLAH_NOM}`],
  [/لعن الله/g, `لَعَنَ ${ALLAH_NOM}`],
  [/لَعَنَ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `لَعَنَ ${ALLAH_NOM}`],
  [/يعبد الله/g, `يَعْبُدُ ${ALLAH_ACC}`],
  [/يَعْبُدُ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `يَعْبُدُ ${ALLAH_ACC}`],
  [/تعبد الله/g, `تَعْبُدُ ${ALLAH_ACC}`],
  [/تَعْبُدُ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `تَعْبُدُ ${ALLAH_ACC}`],
  [/نعبد الله/g, `نَعْبُدُ ${ALLAH_ACC}`],
  [/أن تعبد الله/g, `أَنْ تَعْبُدَ ${ALLAH_ACC}`],
  [/أَنْ\s+تَعْبُد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `أَنْ تَعْبُدَ ${ALLAH_ACC}`],
  [/أَنَّ\s+لَا/g, 'أَنْ لَا'],
  [/أَنّ\s+لَا/g, 'أَنْ لَا'],
  [/أَنْ\s+لَا\s+يُعْبَد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `أَنْ لَا يُعْبَدَ ${ALLAH_NOM}`],
  [/أَنْ\s+لَا\s+يَعْبُد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `أَنْ لَا يَعْبُدَ ${ALLAH_ACC}`],
  [/ان لا يعبد الله/g, `أَنْ لَا يَعْبُدَ ${ALLAH_ACC}`],
  [/أن لا يعبد الله/g, `أَنْ لَا يَعْبُدَ ${ALLAH_ACC}`],
  [/لعبادة الله/g, `لِعِبَادَةِ ${ALLAH_GEN}`],
  [/بعبادة الله/g, `بِعِبَادَةِ ${ALLAH_GEN}`],
  [/ولعبادة الله/g, `وَلِعِبَادَةِ ${ALLAH_GEN}`],
  [/لِعِبَادَة[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `لِعِبَادَةِ ${ALLAH_GEN}`],
  [/بِعِبَادَة[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `بِعِبَادَةِ ${ALLAH_GEN}`],
  [/فقد كفر/g, 'فَقَدْ كَفَرَ'],
  [/فَقَدْ\s+كُفْر[\u064B-\u065F\u0670]*/g, 'فَقَدْ كَفَرَ'],
  [/لا معبود بحق/g, 'لَا مَعْبُودَ بِحَقٍّ'],

  [/لغير الله/g, `لِغَيْرِ ${ALLAH_GEN}`],
  [/بغير الله/g, `بِغَيْرِ ${ALLAH_GEN}`],
  [/تقوى الله/g, `تَقْوَى ${ALLAH_GEN}`],
  [/تَقْوَى\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `تَقْوَى ${ALLAH_GEN}`],
  [/طاعة الله/g, `طَاعَةِ ${ALLAH_GEN}`],
  [/طَاعَة[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `طَاعَةِ ${ALLAH_GEN}`],
  [/معصية الله/g, `مَعْصِيَةِ ${ALLAH_GEN}`],
  [/مَعْصِيَة[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `مَعْصِيَةِ ${ALLAH_GEN}`],
  [/يراقب الله/g, `يُرَاقِبَ ${ALLAH_ACC}`],
  [/يُرَاقِب[َُ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `يُرَاقِبَ ${ALLAH_ACC}`],
  [/افتقارهم إلى الله/g, `افْتِقَارُهُمْ إِلَى ${ALLAH_GEN}`],
  [/إلى الله/g, `إِلَى ${ALLAH_GEN}`],
  [/إِلَى\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `إِلَى ${ALLAH_GEN}`],
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
  [/(^|[^\u0621-\u064A])عبد الله/g, (_, p) => `${p}عَبْدِ ${ALLAH_GEN}`],
  [/ابن عبد الله/g, `ابْنُ عَبْدِ ${ALLAH_GEN}`],
  [/صلى الله/g, `صَلَّى ${ALLAH_NOM}`],
  [/رضي الله/g, `رَضِيَ ${ALLAH_NOM}`],
  [/لعن الله/g, `لَعَنَ ${ALLAH_NOM}`],
  [/لَعَنَ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `لَعَنَ ${ALLAH_NOM}`],
  [/يعبد الله/g, `يَعْبُدُ ${ALLAH_ACC}`],
  [/يَعْبُدُ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `يَعْبُدُ ${ALLAH_ACC}`],
  [/أن تعبد الله/g, `أَنْ تَعْبُدَ ${ALLAH_ACC}`],
  [/أَنْ\s+تَعْبُد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `أَنْ تَعْبُدَ ${ALLAH_ACC}`],
  // v342: لأنّ + الله منصوب (لا تُرجَع إلى اللَّهُ بعد applySystematicCaseEndings)
  [/لأن الله/g, `لِأَنَّ ${ALLAH_ACC}`],
  [/لِأَنَّ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `لِأَنَّ ${ALLAH_ACC}`],
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

/**
 * Strip و/ف then ب/ك/ل so «لعبادة/بعبادة/ولغير» match genitive heads «عبادة/غير».
 * Require length > 3 before ب/ك/ل strip so «لعن» never becomes «عن».
 */
function stripArabicProclitics(word) {
  let w = String(word || '');
  if (w.length <= 2) return w;
  if (/^[وف]/.test(w)) w = w.slice(1);
  if (w.length > 3 && /^[بكل]/.test(w)) w = w.slice(1);
  return w || word;
}

function allahFormForContext(before) {
  const raw = String(before || '');
  const bare = stripHarakat(raw).replace(/\s+/g, ' ').trim();
  // شهادة: لا إله إلا الله — الله مرفوع (لا تُعامل كـ «إلا الله» المنصوب)
  if (/(?:إله|اله)\s+(?:إلا|الا)\s*$/u.test(bare)) return ALLAH_NOM;
  // Passive يُعْبَد → الله نائب فاعل مرفوع (bare «يعبد» must NOT trigger accusative)
  if (/ي[\u064F]ع[\u064B-\u065F\u0670]*ب[\u064B-\u065F\u0670]*د[\u064B-\u065F\u0670]*\s*$/u.test(raw.trimEnd())) {
    return ALLAH_NOM;
  }
  const lastRaw = bare.split(/\s+/).filter(Boolean).pop() || '';
  const last = stripArabicProclitics(lastRaw);
  // Prefixed preposition+الله already handled elsewhere; bare «في/من/إلى…» → مجرور
  if (/^(?:في|من|الي|إلى|على|عن|مع|لدى)$/u.test(lastRaw)) {
    return ALLAH_GEN;
  }
  // Prefer unstripped match first (لعن must not become عن)
  if (ALLAH_GEN_LAST_RE.test(lastRaw)) return ALLAH_GEN;
  if (ALLAH_ACC_LAST_RE.test(lastRaw)) return ALLAH_ACC;
  if (last !== lastRaw) {
    if (ALLAH_GEN_LAST_RE.test(last)) return ALLAH_GEN;
    if (ALLAH_ACC_LAST_RE.test(last)) return ALLAH_ACC;
  }
  return ALLAH_NOM;
}

function normalizeAllahTokens(text) {
  const H = '[\\u064B-\\u065F\\u0670]*';
  let s = String(text || '');
  s = s.replace(/\uFDF2/g, ALLAH_NOM);
  // OCR / map typos that make TTS say «اللاه» or skip «إلا»
  s = s.replace(/إالله/g, 'إلا الله');
  s = s.replace(/االله/g, 'إلا الله');
  s = s.replace(/إِلَّا\s*اله(?=$|[^\u0621-\u064A])/g, 'إلا الله');
  s = s.replace(/إلا\s*اله(?=$|[^\u0621-\u064A])/g, 'إلا الله');
  s = s.replace(/إِلَّا\s*اللَّ?ه(?=$|[^\u0621-\u064A\u064B-\u065F\u0670])/g, (m) =>
    /اللَّه[َُِ]/.test(m) ? m : 'إلا الله'
  );
  s = s.replace(new RegExp(`ل${H}ا${H}\\s+إ${H}ل${H}ه${H}\\s+إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), LA_ILAHA_ILLA_ALLAH);
  // لا تُفسِد «لا إله إلا اللَّهُ» بتحويلها إلى «إلا اللَّهَ»
  s = s.replace(new RegExp(`إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), (match, offset, full) => {
    const before = stripHarakat(full.slice(Math.max(0, offset - 16), offset)).trimEnd();
    if (/(?:إله|اله)$/u.test(before)) return match;
    return ILLA_ALLAH;
  });
  s = s.replace(new RegExp(`[اأإآٱ]${H}ل${H}ل${H}ه${H}م${H}`, 'g'), ALLAHUMMA);

  s = s.replace(new RegExp(`([بوفكت])${H}[اأإآٱ]${H}ل${H}ل${H}ه(${H})(?!(?:[\\u064B-\\u065F\\u0670]*[\\u0621-\\u064A]))`, 'g'), (_, p) => {
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
      // Always re-pick case from context — stale اللَّهُ after إضافة/جر mangled Fish («اللاه»).
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
      // Always pick case from preceding word — wrong اللَّهُ after دين/شرع caused «اللاه».
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
    if (bare === 'عبدالله') return `عَبْدِ ${ALLAH_GEN}`;
    if (bare === 'لاإلهإلاالله' || bare === 'لاالهالاالله' || bare === 'لاالهإلاالله') return LA_ILAHA_ILLA_ALLAH;
    if (bare === 'تعالى') return 'تَعَالَى';
    return token;
  });
}

/** Fish / clone voices need shadda THEN vowel — never vowel-before-shadda («اللاه»). */
function normalizeShaddaVowelOrder(text) {
  return String(text || '').replace(/([\u064B-\u0650\u0652-\u065F])(\u0651)/g, '$2$1');
}

/** Fix الله-family i'rab in any Arabic TTS string. */
export function fixAllahIrabInText(text) {
  return normalizeShaddaVowelOrder(
    applyWordLexicon(normalizeAllahTokens(applyPhraseRules(String(text || ''))))
  );
}
