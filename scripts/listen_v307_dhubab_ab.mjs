#!/usr/bin/env node
/**
 * A/B Fish Hakim carriers for ذباب / أهل اليمن via CranL /api/tts + Whisper.
 * Sends full spoken phrases (not bare keys) so live prepareFishTtsText won't
 * collapse them into the v306 تُسَمَّى carrier.
 *
 *   node scripts/listen_v307_dhubab_ab.mjs
 *   node scripts/listen_v307_dhubab_ab.mjs --speed=0.9
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { prepareFishTtsText } from '../fish-audio-tts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ||
  'https://alhuda-zi6bbd.cranl.net';
const SPEED = process.argv.find((a) => a.startsWith('--speed='))?.slice(8);
const FORCE = process.argv.includes('--force-tts');
const WHISPER = process.argv.find((a) => a.startsWith('--whisper='))?.slice(10) || 'small';

const outDir = join(root, 'extracted/listen_v307_dhubab_ab');
const mp3Dir = join(outDir, 'mp3');
mkdirSync(mp3Dir, { recursive: true });

/** Candidates: id, label, raw spoken (will pass through prepareFishTtsText locally for preview). */
const CANDIDATES = [
  // ── ذباب / قرب ذبابا ──
  {
    id: 'fly_baseline_v306',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ حَشَرَةً تُسَمَّى الذُّبَابَةَ لِلصَّنَمِ',
  },
  {
    id: 'fly_bidhaal',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ حَشَرَةً تُسَمَّى الذُّبَابَ بِالذَّالِ لِلصَّنَمِ',
  },
  {
    id: 'fly_bidhaal_pause',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ  حَشَرَةً  تُسَمَّى  الذُّبَابَ  بِالذَّالِ  لِلصَّنَمِ',
  },
  {
    id: 'fly_ismuha_bidhaal',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ لِلصَّنَمِ حَشَرَةً اسْمُهَا الذُّبَابَةُ بِالذَّالِ',
  },
  {
    id: 'fly_spell_dhaal',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ حَشَرَةً تُكْتَبُ بِالذَّالِ الذُّبَابَةَ لِلصَّنَمِ',
  },
  {
    id: 'fly_min_dhubab',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ مِنْ حَشَرَاتِ الذُّبَابِ وَاحِدَةً لِلصَّنَمِ',
  },
  {
    id: 'fly_hashara_dhubab_gap',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ حَشَرَةَ  الذُّبَابِ  لِلصَّنَمِ',
  },
  {
    id: 'fly_tuntaqu_bidhaal',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ حَشَرَةً تُنْطَقُ الذُّبَابَةَ بِالذَّالِ لِلصَّنَمِ',
  },
  {
    id: 'fly_la_dabbaba',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ الذُّبَابَةَ الْحَشَرَةَ لَا الدَّبَّابَةَ لِلصَّنَمِ',
  },
  {
    id: 'fly_letters',
    bare: 'قرب ذبابا',
    spoken: 'قَرَّبَ حَشَرَةً حُرُوفُهَا ذَالٌ ثُمَّ بَاءٌ الذُّبَابَةَ لِلصَّنَمِ',
  },
  {
    id: 'fly_dhubab_only_bidhaal',
    bare: 'ذباب',
    spoken: 'أَعْنِي الذُّبَابَ بِالذَّالِ حَشَرَةً',
  },
  {
    id: 'fly_dhubab_spell',
    bare: 'ذباب',
    spoken: 'أَعْنِي حَشَرَةَ الذُّبَابِ تُكْتَبُ بِالذَّالِ',
  },
  {
    id: 'fly_dhubaba_bidhaal',
    bare: 'ذبابا',
    spoken: 'أَعْنِي الذُّبَابَةَ بِالذَّالِ حَشَرَةً',
  },
  // ── أهل اليمن (long) ──
  {
    id: 'yaman_long_v306',
    bare: 'بعد التوحيد، أمر النبي ﷺ معاذاً أن يعلم أهل اليمن أن الله افترض عليهم',
    spoken:
      'بَعْدَ التَّوْحِيدِ أَمَرَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ مُعَاذًا أَنْ يُعَلِّمَ أَهْلَ  بِلَادِ  الْيَمَنِ أَنَّ اللَّهَ افْتَرَضَ عَلَيْهِمْ',
  },
  {
    id: 'yaman_long_balad',
    bare: 'بعد التوحيد، أمر النبي ﷺ معاذاً أن يعلم أهل اليمن أن الله افترض عليهم',
    spoken:
      'بَعْدَ التَّوْحِيدِ أَمَرَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ مُعَاذًا أَنْ يُعَلِّمَ أَهْلَ  بَلَدِ  الْيَمَنِ أَنَّ اللَّهَ افْتَرَضَ عَلَيْهِمْ',
  },
  {
    id: 'yaman_long_iqlim',
    bare: 'بعد التوحيد، أمر النبي ﷺ معاذاً أن يعلم أهل اليمن أن الله افترض عليهم',
    spoken:
      'بَعْدَ التَّوْحِيدِ أَمَرَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ مُعَاذًا أَنْ يُعَلِّمَ أَهْلَ  إِقْلِيمِ  الْيَمَنِ أَنَّ اللَّهَ افْتَرَضَ عَلَيْهِمْ',
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasDhal(t) {
  const s = String(t || '');
  // ذباب / ذبابة / الذباب without دباب
  const ok = /ذ\s*ب\s*ا\s*ب/.test(s.replace(/[\u064B-\u065F\u0670\u0640]/g, ''));
  const bad = /د\s*ب\s*ا\s*ب/.test(s.replace(/[\u064B-\u065F\u0670\u0640]/g, ''));
  return { hasDhubab: ok, hasDabbab: bad };
}

function hasYaman(t) {
  const bare = String(t || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا');
  return {
    hasYaman: /اليمن/.test(bare) || /\sيمن/.test(bare),
    hasYiman: /اليمان|اليمين|يماني/.test(bare),
  };
}

async function fetchTts(text) {
  const body = { text };
  if (SPEED) body.speed = Number(SPEED);
  const res = await fetch(`${base.replace(/\/$/, '')}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    buf,
    size: buf.length,
    chars: res.headers.get('x-tts-chars'),
    provider: res.headers.get('x-tts-provider'),
    voiceName: res.headers.get('x-tts-voice-name'),
    speed: res.headers.get('x-tts-speed'),
  };
}

function runWhisper(dir, model, outJson) {
  return new Promise((resolve, reject) => {
    const py = join(root, '.venv/bin/python');
    const script = join(root, 'scripts/whisper_transcribe.py');
    const child = spawn(py, [script, '--dir', dir, '--model', model, '--out', outJson, '--lang', 'ar'], {
      cwd: root,
    });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`whisper exit ${code}: ${stderr.slice(-500)}`));
      else resolve(JSON.parse(readFileSync(outJson, 'utf8')));
    });
  });
}

async function main() {
  const manifest = [];
  console.log(`base=${base} speed=${SPEED || 'default'} n=${CANDIDATES.length}`);

  for (let i = 0; i < CANDIDATES.length; i++) {
    const c = CANDIDATES[i];
    const afterPrep = prepareFishTtsText(c.spoken);
    const file = join(mp3Dir, `${c.id}.mp3`);
    const txt = join(mp3Dir, `${c.id}.txt`);
    writeFileSync(txt, afterPrep, 'utf8');

    let meta;
    if (!FORCE && existsSync(file) && statSync(file).size > 800) {
      console.log(`[${i + 1}/${CANDIDATES.length}] ${c.id} cached`);
      meta = { cached: true, size: statSync(file).size };
    } else {
      // Send afterPrep so live prepare is mostly idempotent for our crafted forms
      const r = await fetchTts(afterPrep);
      const ok = r.status >= 200 && r.status < 300 && r.size > 800;
      if (ok) writeFileSync(file, r.buf);
      console.log(
        `[${i + 1}/${CANDIDATES.length}] ${c.id} ${ok ? r.size : 'FAIL ' + r.status} chars=${r.chars} ${r.voiceName || ''} speed=${r.speed || ''}`
      );
      meta = { ...r, cached: false, ok };
      await sleep(350);
    }

    manifest.push({
      id: c.id,
      bare: c.bare,
      spoken: c.spoken,
      afterPrep,
      prepChanged: afterPrep !== c.spoken,
      mp3: `extracted/listen_v307_dhubab_ab/mp3/${c.id}.mp3`,
      ...meta,
    });
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const sttPath = join(outDir, 'stt.json');
  const stt = await runWhisper(mp3Dir, WHISPER, sttPath);
  const byId = Object.fromEntries((stt.results || []).map((r) => [r.id, r]));

  const scored = manifest.map((m) => {
    const tr = byId[m.id]?.transcript || '';
    const fly = hasDhal(tr);
    const yam = hasYaman(tr);
    const isFly = m.bare.includes('ذباب') || m.id.startsWith('fly_');
    const isYam = m.id.startsWith('yaman_');
    let verdict = 'n/a';
    if (isFly) {
      if (fly.hasDhubab && !fly.hasDabbab) verdict = 'PASS_ذ';
      else if (fly.hasDhubab && fly.hasDabbab) verdict = 'mixed';
      else if (fly.hasDabbab) verdict = 'FAIL_د';
      else verdict = 'no_fly_stem';
    }
    if (isYam) {
      if (yam.hasYaman && !yam.hasYiman) verdict = 'PASS_يمن';
      else if (yam.hasYiman) verdict = 'FAIL_يمان';
      else verdict = 'no_yaman';
    }
    return {
      id: m.id,
      bare: m.bare,
      afterPrep: m.afterPrep,
      transcript: tr,
      verdict,
      ...fly,
      ...yam,
    };
  });

  writeFileSync(join(outDir, 'score.json'), JSON.stringify({ at: new Date().toISOString(), base, speed: SPEED || null, scored }, null, 2), 'utf8');

  console.log('\n=== SCORE ===');
  for (const s of scored) {
    console.log(`${s.verdict.padEnd(12)} ${s.id}: ${s.transcript}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
