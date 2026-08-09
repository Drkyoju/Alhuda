# مكتبة جمعية الهدى والحكمة التعليمية — Alhuda Interactive Quiz App

Arabic RTL Islamic-education quiz PWA covering three classical texts
(كتاب التوحيد, الأصول الثلاثة, الأربعون النووية) for
[Alhuda wal Hikma](https://www.alhuda-alhikma.sa).

**Live (CranL):** https://alhuda-zi6bbd.cranl.net/  
**Cloudflare (until cutover):** https://alhuda.ryodan71.workers.dev  

Cutover checklist: [README_CRANL.md](./README_CRANL.md)

---

## Quick start

```bash
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
| Edge | Cloudflare Workers (`worker.js` + static assets) |
| TTS | **Baked Yousef** MP3s (`tts-baked/`, `BAKED_TTS_ONLY=1`) |
| Quran audio | Hudhaify via `/api/quran-audio` (edge-cached) |

### Deploy

Push to `main` → GitHub Actions → Playwright smoke/a11y/e2e + baked-TTS coverage → Wrangler deploy.

```bash
npx wrangler deploy   # local deploy (needs CF token)
npm run bump:version  # bump SW cache + app.js?v=
```

### Secrets (GitHub → Actions / Wrangler)

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Deploy |
| `AUTH_NAME_PEPPER` | Legacy name-hash student creds (Worker only) |
| `ELEVENLABS_API_KEY` etc. | Optional; unused while `BAKED_TTS_ONLY=1` |

Set the auth pepper (legacy accounts):

```bash
printf '%s' 'alhuda-integrity-v2-name' | gh secret set AUTH_NAME_PEPPER
```

---

## Voice (TTS)

- Lesson text: **Yousef** from `/tts-baked/{sha}.mp3` (cache key `v29::voiceId::text`).
- Quran ayat: **Hudhaify** only (hybrid speech plan).
- Rebake after speech-map changes:

```bash
npm run bake:tts                  # via live Worker (paid key on CF)
npm run check:baked-tts           # CI gate — exit 1 on missing MP3s
```

---

## Auth

1. Prefer **anonymous** Supabase sign-in (fast).
2. Legacy name accounts: Worker `POST /api/student-creds` derives email/password with `AUTH_NAME_PEPPER` (pepper is **not** in the browser bundle).

Student login is **name only** (no PIN). Unlock flag: `LOGIN_LOCKED` in `app.js` (currently `false` = full quiz open).

---

## Useful scripts

```bash
npm run test:smoke / test:a11y / test:e2e / test:api
npm run check:baked-tts
npm run bump:version
npm run bake:tts
npm run icons
```

See `supabase_README.md` for SQL apply order. See `AGENTS.md` for agent conventions.
