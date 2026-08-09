# مكتبة جمعية الهدى والحكمة التعليمية — Alhuda Interactive Quiz App

Arabic RTL Islamic-education quiz PWA covering three classical texts
(كتاب التوحيد, الأصول الثلاثة, الأربعون النووية) for
[Alhuda wal Hikma](https://www.alhuda-alhikma.sa).

**Live (CranL — sole host):** https://alhuda-zi6bbd.cranl.net/

Ops / domain notes: [README_CRANL.md](./README_CRANL.md)

---

## Quick start

```bash
npm start
# → http://localhost:3000

# or static-only:
python3 -m http.server 8765
# → http://localhost:8765

npm ci
npm run test:smoke
```

No build step. The client uses the Supabase **anon** key (RLS-protected).

---

## Architecture

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/CSS/JS PWA (no bundler) |
| Backend data | Supabase (Postgres + Auth + RLS) |
| Host | CranL (`server.mjs` + Dockerfile) |
| TTS | Live Fish «راوٍ عربي حكيم» (`FISH_API_KEY`) |
| Quran audio | Hudhaify via `/api/quran-audio` (in-memory cache) |

### Deploy

Push to `main` → GitHub Actions → Playwright smoke → CranL deploy (`deploy-cranl.yml`).

```bash
npm run bump:version  # bump SW cache + app.js?v=
```

Cloudflare Workers was removed (2026-08-09). Archived under `archive/cloudflare/`.

### Secrets (GitHub → Actions / CranL Environment)

| Secret | Purpose |
|---|---|
| `CRANL_API_KEY` / `CRANL_APP_ID` | Deploy to CranL |
| `AUTH_NAME_PEPPER` | Legacy name-hash student creds (CranL env) |
| `FISH_API_KEY` / `FISH_VOICE_ID` | Lesson TTS (CranL env) |

Set the auth pepper (legacy accounts):

```bash
printf '%s' 'alhuda-integrity-v2-name' | gh secret set AUTH_NAME_PEPPER
```

---

## Voice (TTS)

- Lesson text: **Fish حكيم** via `POST /api/tts`.
- Quran ayat: **Hudhaify** only (hybrid speech plan).
- Optional bake scripts remain for offline MP3 experiments (`npm run bake:tts`).

---

## Auth

1. Prefer **anonymous** Supabase sign-in (fast).
2. Legacy name accounts: `POST /api/student-creds` derives email/password with `AUTH_NAME_PEPPER` (pepper is **not** in the browser bundle).

Student login is **name only** (no PIN). Unlock flag: `LOGIN_LOCKED` in `app.js` (currently `false` = full quiz open).

---

## Useful scripts

```bash
npm run test:smoke / test:a11y / test:e2e / test:api
npm run test:api:cranl
npm run check:baked-tts
npm run bump:version
npm run bake:tts
npm run icons
```

See `supabase_README.md` for SQL apply order. See `AGENTS.md` for agent conventions.
