# AGENTS.md — context for AI coding agents

## Project type
Vanilla JS Arabic RTL quiz PWA + Cloudflare Worker + Supabase.
**Live:** https://alhuda.ryodan71.workers.dev  
**Deploy:** GitHub Actions → Wrangler on push to `main`.

## Tech stack
- Frontend: plain HTML/CSS/JS (no framework, no bundler). ES2020+.
- Data: Supabase (`@supabase/supabase-js@2` from CDN).
- Edge: `worker.js` (TTS baked lookup, Quran proxy, feedback, student-creds).
- PWA: `manifest.json` + `service-worker.js` — keep `version.js` `cache`/`sw`/`app` in sync with SW `CACHE` and `index.html` `?v=` (use `npm run bump:version`).
- TTS: baked Yousef under `tts-baked/` (`BAKED_TTS_ONLY=1` in `wrangler.toml`). Quran = Hudhaify.

## Layout
- `index.html`, `styles.css`, `kids-ui.css`, `app.js`, `auth.js`, `platform.js`, `enhancements.js`
- `baked-tts.js` / `baked-tts.browser.js`, `allah-irab.js`, `speech-diacritics-*.js`
- `tts-baked/` — ~2864 MP3s (do not delete; rebake with `npm run bake:tts`)
- `tests/` — Playwright smoke / a11y / e2e / api-live / tts-order
- `scripts/` — bake TTS, bump version, citation/diacritics pipelines
- `supabase_*.sql` — see `supabase_README.md`

## Critical conventions

### LOGIN_LOCKED
`app.js` → `LOGIN_LOCKED`. `false` = full bank + login enabled. Demo (8 Q/book) always available.

### TTS keys must match bake
Client `prepareTtsPayload` must keep الله iʿrāb (`اللَّهُ/ِ/َ`) — do **not** collapse to bare `الله` (breaks bake hashes → silence). Cache ver `v29` must match `baked-tts.js` + `collect_tts_strings.mjs`.

### Auth
- Prefer anonymous Supabase.
- Legacy name-hash via Worker `/api/student-creds` + secret `AUTH_NAME_PEPPER`.
- Never put service_role keys in the repo. Anon key in HTML is OK (RLS).

### DB calls
Use `safeQuery()` in `platform.js`. Escape with `esc` / `escJsString`.

### Schema
Additive + idempotent SQL only. Document in `supabase_README.md`.

## Verify before push

```bash
node --check app.js auth.js platform.js enhancements.js service-worker.js worker.js
npm run check:baked-tts
npm run test:smoke && npm run test:a11y && npm run test:e2e
```

After UI/asset changes: `npm run bump:version` then commit.
