#!/usr/bin/env node
/**
 * Bake all TTS MP3s locally — default: ElevenLabs Yousef (MSA).
 * Pay once (~111k chars), deploy MP3s, then set BAKED_TTS_ONLY=1 → zero ongoing API cost.
 *
 * Usage:
 *   FISH_API_KEY=... node scripts/bake_tts_audio.mjs --provider fish
 *   ELEVENLABS_API_KEY=sk_... node scripts/bake_tts_audio.mjs --provider elevenlabs
 *   node scripts/bake_tts_audio.mjs --provider edge          # free fallback voice
 *   node scripts/bake_tts_audio.mjs --limit 10 --export ~/Desktop/alhuda-tts
 */
import { mkdirSync, writeFileSync, existsSync, copyFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  BAKE_TTS_CACHE_VER,
  BAKE_TTS_VOICE,
  BAKE_TTS_VOICE_LABEL,
  collectTtsStrings,
  bakedTtsFileNameSync,
} from './collect_tts_strings.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tts-baked');
const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const exportIdx = args.indexOf('--export');
const exportDir = exportIdx >= 0 ? args[exportIdx + 1] : null;
const providerArg = args.includes('--provider') ? args[args.indexOf('--provider') + 1] : 'worker';
const provider = ['edge', 'elevenlabs', 'worker', 'fish'].includes(providerArg) ? providerArg : 'worker';
const ttsUrl = (process.env.TTS_URL || 'https://alhuda.ryodan71.workers.dev').replace(/\/$/, '');
const delayArg = args.indexOf('--delay');
const delayMs =
  delayArg >= 0
    ? parseInt(args[delayArg + 1], 10) || 1600
    : provider === 'worker'
      ? args.includes('--fast')
        ? 1500
        : 1600 // worker TTS rate limit: 40/min
      : provider === 'fish'
        ? args.includes('--fast')
          ? 150
          : 250
      : provider === 'elevenlabs'
        ? args.includes('--fast')
          ? 120
          : 200
        : args.includes('--fast')
          ? 80
          : 150;

if (provider === 'elevenlabs' && !String(process.env.ELEVENLABS_API_KEY || '').trim()) {
  console.error('Set ELEVENLABS_API_KEY for local elevenlabs bake, or use --provider worker (default)');
  process.exit(1);
}
if (provider === 'fish' && !String(process.env.FISH_API_KEY || '').trim()) {
  console.error('Set FISH_API_KEY for Fish Audio bake (https://fish.audio/app/developers)');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const all = collectTtsStrings();
const todo = Number.isFinite(limit) ? all.slice(0, limit) : all;
let chars = 0;
for (const t of todo) chars += t.length;

console.log(`Baking ${todo.length}/${all.length} strings → ${outDir}`);
console.log(
  provider === 'worker'
    ? `Voice: via live site (${ttsUrl}/api/tts)`
    : provider === 'fish'
      ? `Voice: Fish Audio Arabic narrator — ~${chars} chars (files keyed as ${BAKE_TTS_VOICE_LABEL})`
    : provider === 'elevenlabs'
      ? `Voice: ${BAKE_TTS_VOICE_LABEL} (${BAKE_TTS_VOICE}) — ~${chars} chars one-time`
      : `Voice: ar-SA-HamedNeural (free Edge)`
);

async function synthesize(text, path) {
  if (provider === 'worker') {
    const res = await fetch(`${ttsUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: BAKE_TTS_VOICE }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`TTS ${res.status}: ${detail.slice(0, 120)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) throw new Error('empty audio');
    writeFileSync(path, buf);
  } else if (provider === 'fish') {
    const { fishAudioTtsSave } = await import('./fish_audio_tts_save.mjs');
    await fishAudioTtsSave(text, path);
  } else if (provider === 'elevenlabs') {
    const { elevenLabsTtsSave } = await import('./elevenlabs_tts_save.mjs');
    await elevenLabsTtsSave(text, path);
  } else {
    const { edgeTtsSave } = await import('./edge_tts_node.mjs');
    await edgeTtsSave(text, path, 'ar-SA-HamedNeural');
  }
}

let done = 0;
let skipped = 0;
let failed = 0;
const started = Date.now();

for (const text of todo) {
  const file = bakedTtsFileNameSync(text);
  const path = join(outDir, file);
  if (existsSync(path) && statSync(path).size > 500) {
    skipped += 1;
    continue;
  }
  let attempts = 0;
  while (attempts < 5) {
    attempts += 1;
    try {
      await synthesize(text, path);
      done += 1;
      if (exportDir) {
        mkdirSync(exportDir, { recursive: true });
        copyFileSync(path, join(exportDir, file));
      }
      if ((done + skipped) % 10 === 0) {
        const elapsed = ((Date.now() - started) / 1000).toFixed(0);
        console.log(`  … ${done + skipped}/${todo.length} (${elapsed}s)`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
      break;
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('429') && attempts < 5) {
        const wait = 65000;
        console.warn(`Rate limit — waiting ${wait / 1000}s then retry (${attempts}/5):`, text.slice(0, 40));
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      failed += 1;
      console.warn('FAIL:', text.slice(0, 60), msg);
      if (
        msg.includes('401') ||
        msg.includes('402') ||
        msg.includes('payment_required') ||
        msg.includes('paid_plan') ||
        msg.includes('Insufficient API credit')
      ) {
        console.error(
          provider === 'fish'
            ? 'Fish Audio rejected the request (credit/auth). For free tier use model s2.1-pro-free (default). See https://fish.audio/blog/s2-1-pro-free-api/'
            : 'ElevenLabs cannot bake Yousef (auth/plan). Upgrade to a paid plan that allows library voices, then re-run.'
        );
        attempts = 99;
        break;
      }
      break;
    }
  }
  if (attempts >= 99) break;
}

const yousefBake = provider === 'elevenlabs' || provider === 'worker' || provider === 'fish';
const manifest = {
  version: BAKE_TTS_CACHE_VER,
  voice: yousefBake ? BAKE_TTS_VOICE : 'ar-SA-HamedNeural',
  voiceLabel:
    provider === 'fish'
      ? 'Fish Audio Arabic narrator (راوي عربي)'
      : yousefBake
        ? BAKE_TTS_VOICE_LABEL
        : 'Hamed (Edge)',
  provider:
    provider === 'fish'
      ? 'fish-audio-baked'
      : yousefBake
        ? 'elevenlabs-baked'
        : 'edge-baked',
  totalStrings: all.length,
  bakedThisRun: done,
  skippedExisting: skipped,
  failed,
  approxChars: chars,
  generatedAt: new Date().toISOString(),
};
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const mb =
  [...todo]
    .map((t) => join(outDir, bakedTtsFileNameSync(t)))
    .filter((p) => existsSync(p))
    .reduce((n, p) => n + (existsSync(p) ? statSync(p).size : 0), 0) /
  (1024 * 1024);

console.log(`Done: ${done} new, ${skipped} skipped, ${failed} failed, ~${mb.toFixed(1)} MB`);
if (exportDir) console.log(`Copied to: ${exportDir}`);
if (provider === 'elevenlabs' || provider === 'worker') {
  console.log('Deploy tts-baked/ with the site + set BAKED_TTS_ONLY=1 → Yousef offline, no more API billing.');
}
if (done === 0 && failed > 0) {
  console.error('No new clips baked — aborting (check ElevenLabs plan/key for Yousef library voice).');
  process.exit(1);
}
