/** ElevenLabs Text-to-Speech (primary Arabic provider candidate). */

export const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';
/** Yousef — Modern Standard Arabic (not the English premade Sarah voice). */
export const DEFAULT_ELEVENLABS_VOICE_ID = 'ZCXYdzd5Evtsll2EdoCi';

const ELEVENLABS_TTS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';
const ELEVENLABS_HARAKAT_RE = /[\u064B-\u065F\u0670]/g;

/**
 * Case forms — MUST use NFC mark order: shadda (U+0651) THEN vowel.
 * Fatha-before-shadda (common in editors) makes Fish clone read «اللاه».
 */
const _SH = '\u0651';
const _F = '\u064E';
const _D = '\u064F';
const _K = '\u0650';
const EL_ALLAH_NOM = `الل${_SH}${_F}ه${_D}`; // مرفوع اللَّهُ
const EL_ALLAH_ACC = `الل${_SH}${_F}ه${_F}`; // منصوب اللَّهَ
const EL_ALLAH_GEN = `الل${_SH}${_F}ه${_K}`; // مجرور اللَّهِ
const EL_ALLAH = EL_ALLAH_NOM;
const EL_ALLAHUMMA = `الل${_SH}${_F}ه${_D}م${_SH}${_F}`;
const EL_LILLAH = `لِل${_SH}${_F}ه${_K}`;
const EL_BILLAH = `بِالل${_SH}${_F}ه${_K}`;
const EL_WALLAH = `وَالل${_SH}${_F}ه${_K}`;
const EL_FALLAH = `فَالل${_SH}${_F}ه${_K}`;
const EL_TALLAH = `تَالل${_SH}${_F}ه${_K}`;
const EL_KALLAH = `كَالل${_SH}${_F}ه${_K}`;
const EL_WALILLAH = `وَلِل${_SH}${_F}ه${_K}`;
const EL_FALILLAH = `فَلِل${_SH}${_F}ه${_K}`;
const EL_ILLA_ALLAH = `إِل${_SH}${_F}ا ${EL_ALLAH_ACC}`;
const EL_LA_ILAHA_ILLA_ALLAH = `لَا إِلَٰهَ إِل${_SH}${_F}ا ${EL_ALLAH_NOM}`;
const EL_LA_MABUDA_BIHAQQ_ILLA_ALLAH = `لَا مَعْبُودَ بِحَق${_SH}${_K} إِل${_SH}${_F}ا ${EL_ALLAH_ACC}`;

/** Prepositions / إضافة heads that put الله in the genitive.
 *  Match the LAST WORD only — never suffixes (لعن must not match عن).
 *  Expanded from full-bank scan of prev-token before الله. */
const ALLAH_GEN_LAST_RE =
  /^(?:ع(?:ِ)?ن(?:ْ)?د(?:َ)?|م(?:ِ)?ن(?:ْ|َ)?|إِ?ل(?:َ)?ى|الى|ع(?:َ)?ن(?:ْ)?|ع(?:َ)?ل(?:َ)?ى|ف(?:ِ)?ي|م(?:َ)?ع(?:َ)?|ل(?:َ)?د(?:َ)?ى|غ(?:َ)?ي(?:ْ)?ر(?:َ|ِ)?|س(?:ِ)?و(?:َ)?ى|د(?:ُ)?و(?:ْ)?ن(?:َ)?|ح(?:َ)?ق(?:ُّ|ُ|ِ)?|ح(?:ُ)?ق(?:ُ)?وق(?:ُ|ِ)?|إِ?ف(?:ْ)?ر(?:َ)?اد(?:ُ|ِ)?|افراد|ع(?:ِ)?ب(?:َ)?اد(?:َ)?ة(?:ِ)?|اس(?:ْ)?م(?:ُ|ِ)?|أَ?س(?:ْ)?م(?:َ)?اء(?:ُ|ِ)?|اسماء|ر(?:َ)?س(?:ُ)?ول(?:ُ|ِ)?|ع(?:َ)?ب(?:ْ)?د(?:ُ|ِ)?|ب(?:ِ)?غ(?:َ)?ي(?:ْ)?ر(?:ِ)?|د(?:ِ)?ين(?:َ|ُ|ِ)?|ش(?:َ)?ر(?:ْ)?ع(?:َ|ُ|ِ)?|ح(?:ُ)?د(?:ُ)?ود(?:َ|ُ|ِ)?|ط(?:َ)?اع(?:َ)?ة(?:ِ)?|م(?:َ)?ع(?:ْ)?ص(?:ِ)?ي(?:َ)?ة(?:ِ)?|لِ?غ(?:َ)?ي(?:ْ)?ر(?:ِ)?|ت(?:َ)?ق(?:ْ)?و(?:َ)?ى|تقوى|م(?:َ)?ر(?:ْ)?ض(?:َ)?ات(?:ِ)?|مرضات|م(?:َ)?ع(?:ْ)?ر(?:ِ)?ف(?:َ)?ة(?:ِ)?|معرفة|م(?:َ)?ح(?:َ)?ب(?:ّ)?ة(?:ِ)?|محبة|لِ?م(?:َ)?ح(?:َ)?ب(?:ّ)?ة(?:ِ)?|أَ?و(?:ْ)?ل(?:ِ)?ي(?:َ)?اء(?:ُ|ِ)?|اولياء|أَ?و(?:َ)?ام(?:ِ)?ر(?:ُ|ِ)?|اوامر|أَ?ق(?:ْ)?د(?:َ)?ار(?:ِ)?|اقدار|ك(?:َ)?ح(?:ُ)?ب(?:ّ)?|كحب|م(?:َ)?ك(?:ْ)?ر(?:ُ|ِ)?|مكر|ك(?:ِ)?ت(?:َ)?اب(?:ُ|ِ)?|كتاب|ع(?:َ)?ظ(?:َ)?م(?:َ)?ة(?:ِ)?|عظمة|بِ?ع(?:َ)?ظ(?:َ)?م(?:َ)?ة(?:ِ)?|ر(?:َ)?ح(?:ْ)?م(?:َ)?ة(?:ِ)?|رحمة|و(?:َ)?ص(?:ْ)?ف(?:ُ|ِ)?|وصف|ك(?:َ)?ل(?:َ)?ام(?:ُ|ِ)?|كلام|ب(?:َ)?ي(?:ْ)?ت(?:ُ|ِ)?|بيت|غ(?:َ)?ض(?:َ)?ب(?:ُ|ِ)?|غضب|أَ?ح(?:ْ)?ك(?:َ)?ام(?:ِ)?|احكام|و(?:ُ)?ج(?:ُ)?ود(?:ُ|ِ)?|وجود|ف(?:َ)?ض(?:ْ)?ل(?:ُ|ِ)?|فضل|بِ?ف(?:َ)?ض(?:ْ)?ل(?:ِ)?|م(?:ُ)?ش(?:َ)?ار(?:َ)?ك(?:َ)?ة(?:ِ)?|مشاركة|بِ?ت(?:َ)?ق(?:ْ)?و(?:َ)?ى|ك(?:َ)?م(?:َ)?ش(?:ِ)?ي(?:ْ)?ئ(?:َ)?ة(?:ِ)?|كمشيئة|بِ?أَ?س(?:ْ)?م(?:َ)?اء(?:ِ)?|بِ?إِ?ذ(?:ْ)?ن(?:ِ)?|باذن|بإذن|ذ(?:ِ)?ك(?:ْ)?ر(?:ُ|ِ)?|ذكر|ل(?:َ)?ع(?:ْ)?ن(?:َ)?ة(?:ِ)?|لعنة|م(?:َ)?ح(?:َ)?ار(?:ِ)?م(?:ِ)?|محارم|ك(?:َ)?ل(?:ِ)?م(?:َ)?ات(?:ِ)?|كلمات|ت(?:َ)?و(?:ْ)?ح(?:ِ)?يد(?:ُ|ِ)?|توحيد|أُ?م(?:ُ)?ور(?:ِ)?|امور|ن(?:ُ)?ص(?:ْ)?ر(?:َ|ُ|ِ)?ة(?:ِ)?|نصره|و(?:ِ)?ل(?:َ)?اي(?:َ)?ة(?:ِ)?|ولايه|ولاية|خ(?:َ)?ش(?:ْ)?ي(?:َ)?ة(?:ِ)?|خشية|خ(?:َ)?و(?:ْ)?ف(?:ِ)?|خوف|ح(?:ُ)?ب(?:ّ)?(?:ِ)?|حب|س(?:َ)?ب(?:ِ)?يل(?:ِ)?|سبيل|وَ?ج(?:ْ)?ه(?:ِ)?|وجه|ر(?:ِ)?ض(?:َ)?ا|رضا|أَ?م(?:ْ)?ر(?:ِ)?|امر)$/u;

/** Particles / verbs that put الله in the accusative — last word only. */
const ALLAH_ACC_LAST_RE =
  /^(?:إِ?ن(?:َّ)?|ان|أَ?ن(?:َّ)?|ل(?:ِ)?أ?ن(?:َّ)?|لان|لأن|إِ?ل(?:َّ)?ا|اح(?:ْ)?ف(?:َ)?ظ(?:ِ)?|ل(?:َ)?ق(?:ِ)?ي(?:َ)?|يَ?ع(?:ْ)?ب(?:ُ)?د(?:ُ|َ)?|تَ?ع(?:ْ)?ب(?:ُ)?د(?:ُ|َ)?|نَ?ع(?:ْ)?ب(?:ُ)?د(?:ُ|َ)?|اع(?:ْ)?ب(?:ُ)?د(?:ُ)?وا?|يُ?ر(?:َ)?اق(?:ِ)?ب(?:ُ|َ)?|يراقب|يَ?ذ(?:ْ)?ك(?:ُ)?ر(?:ُ)?ون(?:َ)?|يذكرون|يَ?خ(?:َ)?اف(?:ُ)?ون(?:َ)?|يخافون|ات(?:ّ)?ق(?:ُ)?وا?|اتق|واتقوا|أَ?ط(?:ِ)?ي(?:ْ)?ع(?:ُ)?وا?|اطيعوا|س(?:َ)?ب(?:ّ)?|سب|يَ?ص(?:ِ)?ف(?:ُ|َ)?|يصف|آذ(?:َ)?ى|اذى)$/u;

const ELEVENLABS_PHRASE_RULES = [
  [/ما أعظم الذنوب عند الله/g, `مَا أَعْظَمُ الذُّنُوبِ عِنْدَ ${EL_ALLAH_GEN}`],
  [/ما اعظم الذنوب عند الله/g, `مَا أَعْظَمُ الذُّنُوبِ عِنْدَ ${EL_ALLAH_GEN}`],
  [/أعظم الذنوب عند الله/g, `أَعْظَمُ الذُّنُوبِ عِنْدَ ${EL_ALLAH_GEN}`],
  [/اعظم الذنوب عند الله/g, `أَعْظَمُ الذُّنُوبِ عِنْدَ ${EL_ALLAH_GEN}`],
  [/عند الله/g, `عِنْدَ ${EL_ALLAH_GEN}`],
  [/عِنْدَ\s+الل[^\s]*/g, `عِنْدَ ${EL_ALLAH_GEN}`],
  [/شهادة أن لا إله إلا الله/g, 'شَهَادَةُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ'],
  [/شهادة ان لا اله الا الله/g, 'شَهَادَةُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ'],
  [/لا إله إلا الله/g, EL_LA_ILAHA_ILLA_ALLAH],
  [/لا اله الا الله/g, EL_LA_ILAHA_ILLA_ALLAH],
  [/لا معبود بحق إلا الله/g, EL_LA_MABUDA_BIHAQQ_ILLA_ALLAH],
  [/لا معبود بحق الا الله/g, EL_LA_MABUDA_BIHAQQ_ILLA_ALLAH],
  [/إلا الله/g, EL_ILLA_ALLAH],
  [/الا الله/g, EL_ILLA_ALLAH],
  [/بالله عليك/g, `${EL_BILLAH} عَلَيْكَ`],
  [/والله أعلم/g, `${EL_WALLAH} أَعْلَمُ`],
  [/والله اعلم/g, `${EL_WALLAH} أَعْلَمُ`],
  [/إن شاء الله/g, `إِنْ شَاءَ ${EL_ALLAH_NOM}`],
  [/ان شاء الله/g, `إِنْ شَاءَ ${EL_ALLAH_NOM}`],
  [/ما شاء الله/g, `مَا شَاءَ ${EL_ALLAH_NOM}`],
  [/إفراد الله/g, `إِفْرَادُ ${EL_ALLAH_GEN}`],
  [/افراد الله/g, `إِفْرَادُ ${EL_ALLAH_GEN}`],
  [/حق الله على العباد/g, `حَقُّ ${EL_ALLAH_GEN} عَلَى الْعِبَادِ`],
  [/حق الله/g, `حَقُّ ${EL_ALLAH_GEN}`],
  [/دين الله/g, `دِينُ ${EL_ALLAH_GEN}`],
  [/شرع الله/g, `شَرْعُ ${EL_ALLAH_GEN}`],
  [/حدود الله/g, `حُدُودُ ${EL_ALLAH_GEN}`],
  [/(^|[^\u0621-\u064A])عبد الله/g, (_, p) => `${p}عَبْدِ ${EL_ALLAH_GEN}`],
  [/دِينَ\s+اللَّهُ/g, `دِينَ ${EL_ALLAH_GEN}`],
  [/شَرْعَ\s+اللَّهُ/g, `شَرْعَ ${EL_ALLAH_GEN}`],
  [/حُدُودَ\s+اللَّهُ/g, `حُدُودَ ${EL_ALLAH_GEN}`],
  [/من دون الله/g, `مِنْ دُونِ ${EL_ALLAH_GEN}`],
  [/لغير الله/g, `لِغَيْرِ ${EL_ALLAH_GEN}`],
  [/بغير الله/g, `بِغَيْرِ ${EL_ALLAH_GEN}`],
  [/قال الله/g, `قَالَ ${EL_ALLAH_NOM}`],
  [/أمر الله/g, `أَمَرَ ${EL_ALLAH_NOM}`],
  [/امر الله/g, `أَمَرَ ${EL_ALLAH_NOM}`],
  [/لعن الله/g, `لَعَنَ ${EL_ALLAH_NOM}`],
  [/لَعَنَ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `لَعَنَ ${EL_ALLAH_NOM}`],
  [/يعبد الله/g, `يَعْبُدُ ${EL_ALLAH_ACC}`],
  [/يَعْبُدُ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `يَعْبُدُ ${EL_ALLAH_ACC}`],
  [/تعبد الله/g, `تَعْبُدُ ${EL_ALLAH_ACC}`],
  [/تَعْبُدُ\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `تَعْبُدُ ${EL_ALLAH_ACC}`],
  [/نعبد الله/g, `نَعْبُدُ ${EL_ALLAH_ACC}`],
  [/أن تعبد الله/g, `أَنْ تَعْبُدَ ${EL_ALLAH_ACC}`],
  [/أَنْ\s+تَعْبُد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `أَنْ تَعْبُدَ ${EL_ALLAH_ACC}`],
  [/أَنَّ\s+لَا/g, 'أَنْ لَا'],
  [/أَنّ\s+لَا/g, 'أَنْ لَا'],
  [/أَنْ\s+لَا\s+يُعْبَد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `أَنْ لَا يُعْبَدَ ${EL_ALLAH_NOM}`],
  [/أَنْ\s+لَا\s+يَعْبُد[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `أَنْ لَا يَعْبُدَ ${EL_ALLAH_ACC}`],
  [/ان لا يعبد الله/g, `أَنْ لَا يَعْبُدَ ${EL_ALLAH_ACC}`],
  [/أن لا يعبد الله/g, `أَنْ لَا يَعْبُدَ ${EL_ALLAH_ACC}`],
  [/لعبادة الله/g, `لِعِبَادَةِ ${EL_ALLAH_GEN}`],
  [/بعبادة الله/g, `بِعِبَادَةِ ${EL_ALLAH_GEN}`],
  [/ولعبادة الله/g, `وَلِعِبَادَةِ ${EL_ALLAH_GEN}`],
  [/لِعِبَادَة[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `لِعِبَادَةِ ${EL_ALLAH_GEN}`],
  [/بِعِبَادَة[ُِ]?\s+الل[\u064B-\u065F\u0670]*ه[\u064B-\u065F\u0670]*/g, `بِعِبَادَةِ ${EL_ALLAH_GEN}`],
  [/فقد كفر/g, 'فَقَدْ كَفَرَ'],
  [/فَقَدْ\s+كُفْر[\u064B-\u065F\u0670]*/g, 'فَقَدْ كَفَرَ'],
  [/لا معبود بحق/g, 'لَا مَعْبُودَ بِحَقٍّ'],
];

function stripHarakat(text) {
  return String(text || '').replace(ELEVENLABS_HARAKAT_RE, '');
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
  for (const [pattern, replacement] of ELEVENLABS_PHRASE_RULES) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

function allahFormForContext(before) {
  const raw = String(before || '');
  const bare = stripHarakat(raw).replace(/\s+/g, ' ').trim();
  // شهادة: لا إله إلا الله — الله مرفوع (لا تُعامل كـ «إلا الله» المنصوب)
  if (/(?:إله|اله)\s+(?:إلا|الا)\s*$/u.test(bare)) return EL_ALLAH_NOM;
  // Passive يُعْبَد → الله نائب فاعل مرفوع (bare «يعبد» must NOT trigger accusative)
  if (/ي[\u064F]ع[\u064B-\u065F\u0670]*ب[\u064B-\u065F\u0670]*د[\u064B-\u065F\u0670]*\s*$/u.test(raw.trimEnd())) {
    return EL_ALLAH_NOM;
  }
  const lastRaw = bare.split(/\s+/).filter(Boolean).pop() || '';
  let last = lastRaw;
  if (last.length > 2 && /^[وف]/.test(last)) last = last.slice(1);
  // length > 3 before ب/ك/ل — «لعن» must not become «عن»
  if (last.length > 3 && /^[بكل]/.test(last)) last = last.slice(1);
  if (/^(?:في|من|الي|إلى|على|عن|مع|لدى)$/u.test(lastRaw)) {
    return EL_ALLAH_GEN;
  }
  if (ALLAH_GEN_LAST_RE.test(lastRaw)) return EL_ALLAH_GEN;
  if (ALLAH_ACC_LAST_RE.test(lastRaw)) return EL_ALLAH_ACC;
  if (last !== lastRaw) {
    if (ALLAH_GEN_LAST_RE.test(last)) return EL_ALLAH_GEN;
    if (ALLAH_ACC_LAST_RE.test(last)) return EL_ALLAH_ACC;
  }
  return EL_ALLAH_NOM;
}

function normalizeAllahForElevenLabs(text) {
  const H = '[\\u064B-\\u065F\\u0670]*';
  let s = String(text || '');
  s = s.replace(/\uFDF2/g, EL_ALLAH_NOM);
  // OCR / map typos that make TTS say «اللاه» or skip «إلا»
  s = s.replace(/إالله/g, 'إلا الله');
  s = s.replace(/االله/g, 'إلا الله');
  s = s.replace(/إِلَّا\s*اله(?=$|[^\u0621-\u064A])/g, 'إلا الله');
  s = s.replace(/إلا\s*اله(?=$|[^\u0621-\u064A])/g, 'إلا الله');
  s = s.replace(/إِلَّا\s*اللَّ?ه(?=$|[^\u0621-\u064A\u064B-\u065F\u0670])/g, (m) =>
    /اللَّه[َُِ]/.test(m) ? m : 'إلا الله'
  );
  s = s.replace(new RegExp(`ل${H}ا${H}\\s+إ${H}ل${H}ه${H}\\s+إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), EL_LA_ILAHA_ILLA_ALLAH);
  // لا تُفسِد «لا إله إلا اللَّهُ» بتحويلها إلى «إلا اللَّهَ»
  s = s.replace(new RegExp(`إ${H}ل${H}[اأإآٱ]?${H}\\s+[اأإآٱ]${H}ل${H}ل${H}ه`, 'g'), (match, offset, full) => {
    const before = stripHarakat(full.slice(Math.max(0, offset - 16), offset)).trimEnd();
    if (/(?:إله|اله)$/u.test(before)) return match;
    return EL_ILLA_ALLAH;
  });
  s = s.replace(new RegExp(`[اأإآٱ]${H}ل${H}ل${H}ه${H}م${H}`, 'g'), EL_ALLAHUMMA);

  s = s.replace(new RegExp(`([بوفكت])${H}[اأإآٱ]${H}ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'), (_, p) => {
    if (p === 'ب') return EL_BILLAH;
    if (p === 'و') return EL_WALLAH;
    if (p === 'ف') return EL_FALLAH;
    if (p === 'ت') return EL_TALLAH;
    return EL_KALLAH;
  });
  s = s.replace(new RegExp(`(^|[^\\u0621-\\u064A\\u0671])([وف])${H}ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'), (_, pre, p) => `${pre}${p === 'و' ? EL_WALILLAH : EL_FALILLAH}`);
  s = s.replace(new RegExp(`(^|[^\\u0621-\\u064A\\u0671])ل${H}ل${H}ه(${H})(?![\\u0621-\\u064A])`, 'g'), (_, pre) => `${pre}${EL_LILLAH}`);

  // Standalone الله — pick إعراب from the preceding word (عند→مجرور, قال→مرفوع…).
  s = s.replace(
    new RegExp(
      `(^|[^\\u0621-\\u064A\\u0671\\u064B-\\u065F\\u0670])[اأإآٱ]${H}ل${H}ل${H}ه(${H})(?!(?:[\\u064B-\\u065F\\u0670]*[\\u0621-\\u064A]))`,
      'g'
    ),
    (match, pre, _marks, offset, full) => {
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
  scrubHack('اللاه', EL_ALLAH_NOM);
  scrubHack('للاه', EL_LILLAH);
  scrubHack('باللاه', EL_BILLAH);
  scrubHack('واللاه', EL_WALLAH);
  scrubHack('فاللاه', EL_FALLAH);
  scrubHack('تاللاه', EL_TALLAH);
  scrubHack('كاللاه', EL_KALLAH);

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
    if (bare === 'اللهم') return EL_ALLAHUMMA;
    if (bare === 'لله') return EL_LILLAH;
    if (bare === 'ولله') return EL_WALILLAH;
    if (bare === 'فلله') return EL_FALILLAH;
    if (bare === 'بالله') return EL_BILLAH;
    if (bare === 'والله') return EL_WALLAH;
    if (bare === 'فالله') return EL_FALLAH;
    if (bare === 'تالله') return EL_TALLAH;
    if (bare === 'كالله') return EL_KALLAH;
    if (bare === 'إلاالله' || bare === 'الاالله') return EL_ILLA_ALLAH;
    if (bare === 'عبدالله') return `عَبْدِ ${EL_ALLAH_GEN}`;
    if (bare === 'لاإلهإلاالله' || bare === 'لاالهالاالله' || bare === 'لاالهإلاالله') return EL_LA_ILAHA_ILLA_ALLAH;
    if (bare === 'تعالى') return 'تَعَالَى';
    return token;
  });
}

function normalizeForElevenLabs(text) {
  return applyWordLexicon(normalizeAllahForElevenLabs(applyPhraseRules(stripTtsPunctuation(text))));
}

export { normalizeForElevenLabs };

export function elevenLabsConfigured(env) {
  return !!String(env?.ELEVENLABS_API_KEY || '').trim();
}

export async function synthesizeElevenLabsArabicSpeech(text, voiceId, env) {
  const apiKey = String(env?.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) throw new Error('ElevenLabs not configured (missing ELEVENLABS_API_KEY)');

  const selectedVoice = String(voiceId || env?.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID).trim() || DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId = String(env?.ELEVENLABS_MODEL_ID || DEFAULT_ELEVENLABS_MODEL_ID).trim() || DEFAULT_ELEVENLABS_MODEL_ID;
  // optimize_streaming_latency=3 → faster first audio byte; 64kbps → smaller/faster download.
  const endpoint = `${ELEVENLABS_TTS_ENDPOINT}/${encodeURIComponent(selectedVoice)}/stream?output_format=mp3_44100_64&optimize_streaming_latency=3`;
  const payload = {
    text: normalizeForElevenLabs(text),
    model_id: modelId,
    language_code: 'ar',
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS ${res.status}: ${detail.slice(0, 220)}`);
  }
  return res.body;
}
