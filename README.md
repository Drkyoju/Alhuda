# مكتبة جمعية الهدى والحكمة التعليمية

### Alhuda Interactive Quiz App

[![Live app](https://img.shields.io/badge/Live-CranL-0f766e?style=for-the-badge)](https://alhuda-zi6bbd.cranl.net/)
[![Deploy](https://github.com/Drkyoju/Alhuda/actions/workflows/deploy-cranl.yml/badge.svg)](https://github.com/Drkyoju/Alhuda/actions/workflows/deploy-cranl.yml)
[![License: private](https://img.shields.io/badge/license-private-6b7280?style=flat-square)](https://github.com/Drkyoju/Alhuda)

Arabic RTL Islamic-education quiz PWA covering three classical texts
(كتاب التوحيد, الأصول الثلاثة, الأربعون النووية) for
[Alhuda wal Hikma](https://www.alhuda-alhikma.sa).

The app is designed for students to learn in short, repeatable rounds: choose
a book and difficulty, answer with immediate feedback, review repeated mistakes,
track progress, earn XP and badges, and listen to lesson text and Quran verses.

**Live (CranL — sole host):** https://alhuda-zi6bbd.cranl.net/

Ops / domain notes: [README_CRANL.md](./README_CRANL.md)

## What is included

- Arabic RTL interface with responsive mobile, tablet, and desktop layouts.
- Three learning tracks with easy, medium, and hard levels.
- Immediate answer explanations, citations, Quran verse audio, and lesson TTS.
- XP, streaks, badges, progress by book, daily missions, profiles, and leaderboards.
- Training mode, mistake review, resume support, offline question storage, and PWA installation.
- Supabase Auth, Postgres, and RLS-backed progress where configured.

## Production status

| Item | Status |
|---|---|
| Production URL | [alhuda-zi6bbd.cranl.net](https://alhuda-zi6bbd.cranl.net/) |
| Hosting | CranL (the sole production host) |
| Current asset version | `v352` |
| Deployment | GitHub Actions → Playwright checks → CranL |
| Build system | No frontend bundler; static HTML/CSS/JavaScript |

The live deployment and `main` are intentionally kept on the same asset
version. Run `npm run bump:version` whenever a change requires a new service-worker
cache or browser cache-busting version.

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

No frontend build step is required. The client uses only the Supabase **anon**
key; server-side secrets such as the auth pepper and TTS credentials must never
be placed in browser files.

### Run the full local verification suite

```bash
npm run test:smoke
npm run test:a11y
npm run test:e2e
npm run test:mobile
npm run test:ipad
npm run check:baked-tts
```

The API tests require a configured backend. Use `npm run test:api:cranl` only
when the live CranL environment is available.

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

Pull requests are expected to pass smoke, accessibility, and login E2E checks
before merge. Dependency-only updates should also be reviewed for the CranL
server and image-generation scripts because both use the Node dependency tree.

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

## Contributing safely

1. Create a branch from `main`.
2. Make the smallest change that solves the issue.
3. Run the relevant local checks, including mobile or iPad checks for layout changes.
4. Bump the asset version when changing cached frontend files.
5. Never commit `.env` files, service-role keys, API keys, student exports, or raw personal data.

For production issues, include the device, browser, screen, book/level, and the
exact steps that reproduce the problem. Do not include student names or private
Supabase data in an issue.
