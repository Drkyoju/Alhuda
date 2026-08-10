#!/usr/bin/env node
/**
 * Bump deploy cache-bust versions in version.js, service-worker.js, and index.html.
 *
 * Usage:
 *   node scripts/bump_version.mjs --sw       # bump sw + cache (+ speech-diacritics-core in index.html)
 *   node scripts/bump_version.mjs --app      # bump app (+ app.js?v in index.html)
 *   node scripts/bump_version.mjs --sw --app # both
 *   node scripts/bump_version.mjs --all      # bump sw/cache and app together
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const versionPath = join(root, 'version.js');
const assetsPath = join(root, 'alhuda-assets.js');
const swPath = join(root, 'service-worker.js');
const indexPath = join(root, 'index.html');

const args = process.argv.slice(2);
const bumpAll = args.includes('--all');
const bumpSw = bumpAll || args.includes('--sw');
const bumpApp = bumpAll || args.includes('--app');

if (!bumpSw && !bumpApp) {
  console.error('Usage: node scripts/bump_version.mjs [--sw] [--app] [--all]');
  console.error('  --sw   bump sw + cache (service-worker.js, speech-diacritics-core.js?v=)');
  console.error('  --app  bump app (app.js?v= in index.html)');
  console.error('  --all  bump sw/cache and app together');
  process.exit(1);
}

function readAssets() {
  const src = readFileSync(versionPath, 'utf8');
  const cacheMatch = src.match(/cache:\s*"alhuda-v(\d+)"/);
  const swMatch = src.match(/\bsw:\s*(\d+)/);
  const appMatch = src.match(/\bapp:\s*(\d+)/);
  if (!cacheMatch || !swMatch || !appMatch) {
    throw new Error('Could not parse version.js — expected cache, sw, and app fields');
  }
  return {
    src,
    cache: cacheMatch[1],
    sw: Number(swMatch[1]),
    app: Number(appMatch[1]),
  };
}

function updateVersionJs(src, { sw, app, cache }) {
  let out = src;
  if (sw != null) {
    out = out.replace(/(\bsw:\s*)\d+/, `$1${sw}`);
    out = out.replace(/cache:\s*"alhuda-v\d+"/, `cache: "alhuda-v${cache ?? sw}"`);
  }
  if (app != null) {
    out = out.replace(/(\bapp:\s*)\d+/, `$1${app}`);
  }
  return out;
}

function updateServiceWorker(src, cacheName, swNum) {
  let out = src.replace(/const CACHE = 'alhuda-v\d+';/, `const CACHE = '${cacheName}';`);
  // Path-bust version.js — BunnyCDN ignores ?v= and can sticky-HIT bare paths.
  if (/'\.\/version(?:-v\d+)?\.js'/.test(out)) {
    out = out.replace(/'\.\/version(?:-v\d+)?\.js'/, `'./version-v${swNum}.js'`);
  }
  return out;
}

function updateIndexHtml(src, { sw, app }) {
  let out = src;
  if (sw != null && /speech-diacritics-core\.js\?v=\d+/.test(out)) {
    out = out.replace(/(speech-diacritics-core\.js\?v=)\d+/, `$1${sw}`);
  }
  if (sw != null && /alhuda-assets\.js\?v=\d+/.test(out)) {
    out = out.replace(/(alhuda-assets\.js\?v=)\d+/, `$1${sw}`);
  }
  if (app != null) {
    out = out.replace(/(app\.js\?v=)\d+/, `$1${app}`);
  }
  return out;
}

function syncVersionCopies(swNum, versionSrc) {
  writeFileSync(assetsPath, versionSrc);
  const bustName = `version-v${swNum}.js`;
  writeFileSync(join(root, bustName), versionSrc);
  // Drop older path-bust copies to keep the tree lean (keep current only).
  for (const name of readdirSync(root)) {
    const m = name.match(/^version-v(\d+)\.js$/);
    if (m && Number(m[1]) !== swNum) {
      try { unlinkSync(join(root, name)); } catch (_) {}
    }
  }
  return bustName;
}

const before = readAssets();
const changes = [];

const next = {
  sw: bumpSw ? before.sw + 1 : before.sw,
  app: bumpApp ? before.app + 1 : before.app,
  cache: bumpSw ? before.sw + 1 : Number(before.cache),
};

if (bumpSw) {
  const cacheName = `alhuda-v${next.sw}`;
  const versionJs = updateVersionJs(before.src, { sw: next.sw, cache: next.sw });
  writeFileSync(versionPath, versionJs);
  changes.push(`version.js: cache "alhuda-v${before.cache}" → "alhuda-v${next.sw}", sw ${before.sw} → ${next.sw}`);

  const swSrc = readFileSync(swPath, 'utf8');
  const swOut = updateServiceWorker(swSrc, cacheName, next.sw);
  writeFileSync(swPath, swOut);
  changes.push(`service-worker.js: CACHE 'alhuda-v${before.cache}' → '${cacheName}'`);
}

if (bumpApp) {
  if (!bumpSw) {
    const versionJs = updateVersionJs(before.src, { app: next.app });
    writeFileSync(versionPath, versionJs);
  } else {
    const versionJs = readFileSync(versionPath, 'utf8');
    const versionOut = updateVersionJs(versionJs, { app: next.app });
    writeFileSync(versionPath, versionOut);
  }
  changes.push(`version.js: app ${before.app} → ${next.app}`);
}

// Always keep alhuda-assets.js + path-busted version-vN.js in sync with version.js
{
  const finalVersion = readFileSync(versionPath, 'utf8');
  const bustName = syncVersionCopies(next.sw, finalVersion);
  changes.push(`synced ${bustName} + alhuda-assets.js`);
}

if (existsSync(indexPath) && (bumpSw || bumpApp)) {
  const indexSrc = readFileSync(indexPath, 'utf8');
  const indexOut = updateIndexHtml(indexSrc, {
    sw: bumpSw ? next.sw : null,
    app: bumpApp ? next.app : null,
  });
  if (indexOut !== indexSrc) {
    writeFileSync(indexPath, indexOut);
    if (bumpSw && /speech-diacritics-core\.js\?v=/.test(indexSrc)) {
      const oldCore = indexSrc.match(/speech-diacritics-core\.js\?v=(\d+)/)?.[1];
      changes.push(`index.html: speech-diacritics-core.js?v=${oldCore} → v=${next.sw}`);
    }
    if (bumpSw && /alhuda-assets\.js\?v=/.test(indexSrc)) {
      const oldAssets = indexSrc.match(/alhuda-assets\.js\?v=(\d+)/)?.[1];
      changes.push(`index.html: alhuda-assets.js?v=${oldAssets} → v=${next.sw}`);
    }
    if (bumpApp) {
      changes.push(`index.html: app.js?v=${before.app} → v=${next.app}`);
    }
  }
}

console.log('Bumped:');
for (const line of changes) console.log(`  • ${line}`);
