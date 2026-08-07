# AGENTS.md — context for AI coding agents

## Project type
Vanilla JS Arabic RTL quiz PWA + Cloudflare Worker + Supabase.
**Live:** https://alhuda.ryodan71.workers.dev  
**Deploy:** GitHub Actions → Wrangler on push to `main`.

## Tech stack
- Frontend: plain HTML/CSS/JS (no framework, no bundler). ES2020+.
- Data: Supabase (`@supabase/supabase-js@2` from CDN).
- Edge: `worker.js` (live Fish TTS, Quran Hudhaify proxy, feedback, student-creds).
- PWA: `manifest.json` + `service-worker.js` — keep `version.js` `cache`/`sw`/`app` in sync with SW `CACHE` and `index.html` `?v=` (use `npm run bump:version`).
- TTS: **live Fish only** (`FISH_VOICE_ID` + `FISH_TTS_MODEL=s2-pro`). Quran ayahs = Hudhaify. No baked MP3s in repo.

## Layout
- `index.html`, `styles.css`, `kids-ui.css`, `app.js`, `auth.js`, `platform.js`, `enhancements.js`
- `fish-audio-tts.js`, `allah-irab.js`, `speech-diacritics-*.js`
- `tts-baked/` — empty on purpose (old narrator clips removed; gitignored `*.mp3`)
- `tests/` — Playwright smoke / a11y / e2e / api-live / tts-order
- `scripts/` — optional bake TTS, bump version, citation/diacritics pipelines
- `supabase_*.sql` — see `supabase_README.md`

## Critical conventions

### LOGIN_LOCKED
`app.js` → `LOGIN_LOCKED`. `false` = full bank + login enabled. Demo (8 Q/book) always available.

### TTS
Lesson speech goes through `/api/tts` → Fish (`reference_id` = `FISH_VOICE_ID`). Punctuation stripped. Do not reintroduce Azure/Edge/ElevenLabs/baked fallbacks unless explicitly requested.
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
