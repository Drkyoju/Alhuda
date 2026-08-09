# AGENTS.md — context for AI coding agents

## Project type
Vanilla JS Arabic RTL quiz PWA + CranL (Node/`server.mjs`) + Supabase.
**Primary (cutover target):** https://alhuda-zi6bbd.cranl.net/  
**Cloudflare (keep until checklist green):** https://alhuda.ryodan71.workers.dev  
**Cutover docs:** `README_CRANL.md` — do **not** delete CF until user confirms and checklist is 100% green.

**Deploy:** push `main` → CranL (GitHub integration and/or `deploy-cranl.yml`) + still Cloudflare Wrangler via `deploy-cloudflare.yml`.

## Tech stack
- Frontend: plain HTML/CSS/JS (no framework, no bundler). ES2020+.
- Data: Supabase (`@supabase/supabase-js@2` from CDN). Anon key in `app.js`; RLS. No Supabase proxy on the server.
- Runtime: `server.mjs` (CranL/Docker) mirrors `worker.js` APIs.
- PWA: `manifest.json` + `service-worker.js` — keep `version.js` `cache`/`sw`/`app` in sync with SW `CACHE` and `index.html` `?v=` (use `npm run bump:version`).
- TTS: **live Fish Audio only** («راوٍ عربي حكيم» / `FISH_VOICE_ID`). Quran ayahs = Hudhaify. Azure/ElevenLabs/Google lesson paths disabled.

## Layout
- `index.html`, `styles.css`, `kids-ui.css`, `app.js`, `auth.js`, `platform.js`, `enhancements.js`
- `fish-audio-tts.js`, `allah-irab.js`, `speech-diacritics-*.js`
- `server.mjs` + `Dockerfile` — CranL production path
- `worker.js` + `wrangler.toml` — Cloudflare parallel until cutover
- `tts-baked/` — empty on purpose (old narrator clips removed; gitignored `*.mp3`)
- `tests/` — Playwright smoke / a11y / e2e / api-live / tts-order
- `scripts/` — optional bake TTS, bump version, citation/diacritics pipelines
- `supabase_*.sql` — see `supabase_README.md`

## Critical conventions

### LOGIN_LOCKED
`app.js` → `LOGIN_LOCKED`. `false` = full bank + login enabled. Demo (8 Q/book) always available.

### TTS
Lesson speech goes through `/api/tts` → Fish (`FISH_API_KEY` + Hakim voice). Quran = Hudhaify only via `/api/quran-audio`.

### Auth
- Prefer anonymous Supabase.
- Legacy name-hash via `/api/student-creds` + secret `AUTH_NAME_PEPPER` (same pepper on CF and CranL).
- Never put service_role keys in the repo. Anon key in client is OK (RLS).

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
