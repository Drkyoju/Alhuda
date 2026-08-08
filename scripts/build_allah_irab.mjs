#!/usr/bin/env node
/** Generate allah-irab.js + allah-irab.browser.js from elevenlabs-tts.js logic. */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const irabSource = join(root, 'elevenlabs-irab-source.js');
const sourceFile = existsSync(irabSource) ? irabSource : join(root, 'elevenlabs-tts.js');
const lines = readFileSync(sourceFile, 'utf8').split('\n');
// Through end of applyWordLexicon (before normalizeForElevenLabs / exports).
let end = lines.findIndex((l) => /^function normalizeForElevenLabs/.test(l));
if (end < 0) end = 174;
let chunk = lines.slice(7, end).join('\n');

chunk = chunk
  .replace(/const ELEVENLABS_HARAKAT_RE/g, 'const HARAKAT_RE')
  .replace(/ELEVENLABS_HARAKAT_RE/g, 'HARAKAT_RE')
  .replace(/const EL_ALLAH_NOM/g, 'export const ALLAH_NOM')
  .replace(/const EL_ALLAH_ACC/g, 'export const ALLAH_ACC')
  .replace(/const EL_ALLAH_GEN/g, 'export const ALLAH_GEN')
  .replace(/const EL_ALLAH = EL_ALLAH_NOM;\r?\n/, '')
  .replace(/const EL_ALLAHUMMA/g, 'export const ALLAHUMMA')
  .replace(/const EL_LILLAH/g, 'export const LILLAH')
  .replace(/const EL_BILLAH/g, 'export const BILLAH')
  .replace(/const EL_WALLAH/g, 'export const WALLAH')
  .replace(/const EL_FALLAH/g, 'export const FALLAH')
  .replace(/const EL_TALLAH/g, 'export const TALLAH')
  .replace(/const EL_KALLAH/g, 'export const KALLAH')
  .replace(/const EL_WALILLAH/g, 'export const WALILLAH')
  .replace(/const EL_FALILLAH/g, 'export const FALILLAH')
  .replace(/const EL_ILLA_ALLAH/g, 'export const ILLA_ALLAH')
  .replace(/const EL_LA_ILAHA_ILLA_ALLAH/g, 'export const LA_ILAHA_ILLA_ALLAH')
  .replace(/const EL_LA_MABUDA_BIHAQQ_ILLA_ALLAH/g, 'export const LA_MABUDA_BIHAQQ_ILLA_ALLAH')
  .replace(/const ELEVENLABS_PHRASE_RULES/g, 'const ALLAH_PHRASE_RULES')
  .replace(/ELEVENLABS_PHRASE_RULES/g, 'ALLAH_PHRASE_RULES')
  .replace(
    /\$\{EL_(ALLAH_NOM|ALLAH_ACC|ALLAH_GEN|ALLAHUMMA|LILLAH|BILLAH|WALLAH|FALLAH|TALLAH|KALLAH|WALILLAH|FALILLAH|ILLA_ALLAH|LA_ILAHA_ILLA_ALLAH|LA_MABUDA_BIHAQQ_ILLA_ALLAH)\}/g,
    '${$1}'
  )
  .replace(/\bEL_(ALLAH_NOM|ALLAH_ACC|ALLAH_GEN|ALLAHUMMA|LILLAH|BILLAH|WALLAH|FALLAH|TALLAH|KALLAH|WALILLAH|FALILLAH|ILLA_ALLAH|LA_ILAHA_ILLA_ALLAH|LA_MABUDA_BIHAQQ_ILLA_ALLAH)\b/g, '$1')
  .replace(/function normalizeAllahForElevenLabs/g, 'function normalizeAllahTokens')
  .replace(/function normalizeForElevenLabs[\s\S]*export \{ normalizeForElevenLabs \};[\s]*/, '');

const extraRules = `
  [/لغير الله/g, \`لِغَيْرِ \${ALLAH_GEN}\`],
  [/بغير الله/g, \`بِغَيْرِ \${ALLAH_GEN}\`],
  [/تقوى الله/g, \`تَقْوَى \${ALLAH_GEN}\`],
  [/تَقْوَى\\s+الل[\\u064B-\\u065F\\u0670]*ه[\\u064B-\\u065F\\u0670]*/g, \`تَقْوَى \${ALLAH_GEN}\`],
  [/طاعة الله/g, \`طَاعَةِ \${ALLAH_GEN}\`],
  [/طَاعَة[ُِ]?\\s+الل[\\u064B-\\u065F\\u0670]*ه[\\u064B-\\u065F\\u0670]*/g, \`طَاعَةِ \${ALLAH_GEN}\`],
  [/معصية الله/g, \`مَعْصِيَةِ \${ALLAH_GEN}\`],
  [/مَعْصِيَة[ُِ]?\\s+الل[\\u064B-\\u065F\\u0670]*ه[\\u064B-\\u065F\\u0670]*/g, \`مَعْصِيَةِ \${ALLAH_GEN}\`],
  [/يراقب الله/g, \`يُرَاقِبَ \${ALLAH_ACC}\`],
  [/يُرَاقِب[َُ]?\\s+الل[\\u064B-\\u065F\\u0670]*ه[\\u064B-\\u065F\\u0670]*/g, \`يُرَاقِبَ \${ALLAH_ACC}\`],
  [/افتقارهم إلى الله/g, \`افْتِقَارُهُمْ إِلَى \${ALLAH_GEN}\`],
  [/إلى الله/g, \`إِلَى \${ALLAH_GEN}\`],
  [/إِلَى\\s+الل[\\u064B-\\u065F\\u0670]*ه[\\u064B-\\u065F\\u0670]*/g, \`إِلَى \${ALLAH_GEN}\`],
  [/من لقي الله/g, \`مِنْ لَقِيَ \${ALLAH_ACC}\`],
  [/لقي الله/g, \`لَقِيَ \${ALLAH_ACC}\`],
  [/احفظ الله/g, \`احْفَظِ \${ALLAH_ACC}\`],
  [/يحفظك الله/g, \`يَحْفَظْكَ \${ALLAH_NOM}\`],
  [/رحمه الله/g, \`رَحِمَهُ \${ALLAH_NOM}\`],
  [/رحمها الله/g, \`رَحِمَهَا \${ALLAH_NOM}\`],
  [/رحمهما الله/g, \`رَحِمَهُمَا \${ALLAH_NOM}\`],
  [/خلق الله/g, \`خَلَقَ \${ALLAH_NOM}\`],
  [/من الخوف من الله/g, \`مِنَ الْخَوْفِ مِنَ \${ALLAH_GEN}\`],
  [/الخوف من الله/g, \`الْخَوْفِ مِنَ \${ALLAH_GEN}\`],
  [/رسول الله/g, \`رَسُولُ \${ALLAH_GEN}\`],
  [/(^|[^\\u0621-\\u064A])عبد الله/g, (_, p) => \`\${p}عَبْدِ \${ALLAH_GEN}\`],
  [/ابن عبد الله/g, \`ابْنُ عَبْدِ \${ALLAH_GEN}\`],
  [/صلى الله/g, \`صَلَّى \${ALLAH_NOM}\`],
  [/رضي الله/g, \`رَضِيَ \${ALLAH_NOM}\`],
  [/لعن الله/g, \`لَعَنَ \${ALLAH_NOM}\`],
  [/لَعَنَ\\s+الل[\\u064B-\\u065F\\u0670]*ه[\\u064B-\\u065F\\u0670]*/g, \`لَعَنَ \${ALLAH_NOM}\`],
  [/يعبد الله/g, \`يَعْبُدُ \${ALLAH_ACC}\`],
  [/يَعْبُدُ\\s+الل[\\u064B-\\u065F\\u0670]*ه[\\u064B-\\u065F\\u0670]*/g, \`يَعْبُدُ \${ALLAH_ACC}\`],
  [/أن تعبد الله/g, \`أَنْ تَعْبُدَ \${ALLAH_ACC}\`],
  [/أَنْ\\s+تَعْبُد[ُِ]?\\s+الل[\\u064B-\\u065F\\u0670]*ه[\\u064B-\\u065F\\u0670]*/g, \`أَنْ تَعْبُدَ \${ALLAH_ACC}\`],`;

chunk = chunk.replace(/\];\s*\n\nfunction stripHarakat/, `${extraRules}\n];\n\nfunction stripHarakat`);

chunk = chunk.replace(
  /s = s\.replace\(new RegExp\(`\[اأإآٱ\]\$\{H\}ل\$\{H\}ل\$\{H\}ه\$\{H\}m\$\{H\}`, 'g'\), ALLAHUMMA\);/,
  `$&\n  s = s.replace(/[اأإآٱ]ل(?:[\\u0670\\u0651]?)?(?:ل|[\\u0644])[\\u0670]?[هh]/g, 'الله');`
);

chunk = chunk.replace(
  `    (match, pre, _marks, offset, full) => {
      const before = full.slice(Math.max(0, offset - 24), offset + pre.length);
      return \`\${pre}\${allahFormForContext(before)}\`;
    }`,
  `    (match, pre, _marks, offset, full) => {
      // Always re-pick case from context — stale اللَّهُ after إضافة/جر mangled Fish.
      const before = full.slice(Math.max(0, offset - 24), offset + pre.length);
      return \`\${pre}\${allahFormForContext(before)}\`;
    }`
);

const header = `/**\n * Case-aware الله-family i'rab for Arabic TTS.\n * Generated — node scripts/build_allah_irab.mjs\n */\n\n`;
const footer = `
/** Fish / clone voices need shadda THEN vowel — never vowel-before-shadda («اللاه»). */
function normalizeShaddaVowelOrder(text) {
  return String(text || '').replace(/([\\u064B-\\u0650\\u0652-\\u065F])(\\u0651)/g, '$2$1');
}

/** Fix الله-family i'rab in any Arabic TTS string. */
export function fixAllahIrabInText(text) {
  return normalizeShaddaVowelOrder(
    applyWordLexicon(normalizeAllahTokens(applyPhraseRules(String(text || ''))))
  );
}
`;

const esm = header + chunk + footer;
writeFileSync(join(root, 'allah-irab.js'), esm);

const browser = `(function (g) {\n${esm.replace(/^export const /gm, 'const ').replace(/^export function /gm, 'function ')}\ng.fixAllahIrabInText = fixAllahIrabInText;\n})(typeof window !== 'undefined' ? window : globalThis);\n`;
writeFileSync(join(root, 'allah-irab.browser.js'), browser);

const { fixAllahIrabInText } = await import(`${join(root, 'allah-irab.js')}?v=${Date.now()}`);
const tests = [
  'ما أعظم الذنوب عند الله',
  'مَا أَعْظَمُ الذُّنُوبِ عِنْدَ اللّٰه',
  'الشرك بالله',
  'قال الله تعالى',
  'من لقي الله',
  'محمد رسول الله',
  'دليل الخوف من الله',
];
for (const t of tests) console.log(JSON.stringify(t), '=>', fixAllahIrabInText(t));
console.log('allah-irab.js OK');
