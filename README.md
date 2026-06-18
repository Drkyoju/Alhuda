# المكتبة الثلاثية — Alhuda Interactive Quiz App

An interactive Islamic-education quiz PWA covering three classical texts
(كتاب التوحيد, الأصول الثلاثة, الأربعون النووية) for the
[Alhuda wal Hikma](https://www.alhuda-alhikma.sa) association.

Arabic, right-to-left, mobile-first. Frontend is a vanilla JS PWA; backend
is [Supabase](https://supabase.com) (Postgres + Auth + REST).

---

## Quick start

```bash
# 1. Serve locally. Any static server works.
python3 -m http.server 8000
# → open http://localhost:8000

# 2. (Optional) Python scripts: create a venv and source it.
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Configure secrets for the Python data-pipeline scripts.
cp .env.example .env
# Edit .env and set SUPABASE_KEY to your service_role key.
```

The web app itself needs no build step and no env vars — it reads the
Supabase **publishable** anon key (safe to expose; protected by RLS).

---

## Architecture

| Layer | Tech |
|---|---|
| Frontend | Plain HTML / CSS / vanilla JS — no framework, no bundler |
| Backend | Supabase (Postgres + Auth + Edge) |
| Deploy | GitHub Pages (push to `main`) |
| PWA | `manifest.json` + `service-worker.js` (cache v9) |

### File map

```
index.html              — main markup (~36KB, was 180KB before refactor)
styles.css              — extracted CSS (~80KB, was inline)
app.js                  — main app logic (~67KB, was inline)
auth.js                 — student (name+PIN) auth, SHA-256 + lockout
platform.js             — classes, teacher dashboard, homework, progress
enhancements.js         — toasts, analytics, bottom nav, SW registration
service-worker.js       — offline caching (network-first JS, cache-first static)
manifest.json           — PWA manifest with PNG icons + shortcuts
icons/                  — SVG + generated PNG icons (192/512/maskable/apple)
supabase_*.sql          — schema, RLS, hardening (see supabase_README.md)
scripts/                — Python data-pipeline tools (question extraction/sync)
extracted/              — gitignored intermediate data dumps
```

---

## Supabase setup

See **[`supabase_README.md`](supabase_README.md)** for the canonical apply
order and per-file reference. Summary:

1. `supabase_scores.sql`
2. `supabase_challenges.sql`
3. `supabase_feedback.sql`
4. `supabase_platform.sql` (the main schema)
5. `supabase_security_fixes.sql`
6. **`supabase_security_fixes_v2.sql`** — auth-gates previously public policies
7. **`supabase_constraints_v1.sql`** — adds FK ON DELETE + CHECK + indexes

⚠️ **Required Supabase dashboard settings:**
- Authentication → Email → "Confirm email" = **OFF** (the deterministic
  name+PIN flow creates accounts with fake domains and cannot receive
  confirmation emails).
- Run `supabase_fix_student_auth.sql` once to back-fill `email_confirmed_at`
  on existing legacy accounts.

---

## Authentication model

Students log in with **name + 4–6 digit PIN**. Credentials are derived
deterministically:

- **New accounts** (post-hardening): `SHA-256(name|pin|pepper)` → email on
  internal pseudo-domain `alhuda.students.internal`.
- **Legacy accounts** (pre-hardening): djb2 hash on `mailinator.com` /
  `example.com` / `test.com` — still accepted via fallback chain so no
  existing student is locked out.

A client-side lockout (5 attempts / 5 min) supplements Supabase's per-IP
rate limiting. For full hardening, move the pepper+hash into a Supabase
Edge Function (see the MIGRATION note at the bottom of `auth.js`).

---

## Python data pipeline (`scripts/`)

These offline tools maintain the question bank. They are NOT part of the
running app.

| Script | Purpose |
|---|---|
| `extract_questions_from_pdfs.py` | Parse teacher PDFs into MC/TF questions |
| `audit_questions.py` | Detect duplicates, Arabic quality issues |
| `apply_question_cleanup.py` | Run cleanup against live Supabase |
| `apply_sync_to_supabase.py` | Apply sync results |
| `sync_quiz_app_to_supabase.py` | Compare local quiz_app.html with DB |
| `build_full_cleanup_sql.py` | Generate bulk cleanup SQL |

All scripts read `SUPABASE_URL` and `SUPABASE_KEY` from the environment
(or a local `.env` file). Never commit secrets — see `.env.example`.

---

## Development

### Lint / typecheck / test

This project has **no automated test suite, linter, or type checker** yet.
Verification is manual:

- `node --check <file>.js` — JS syntax check
- `python3 -m py_compile scripts/*.py` — Python syntax check
- Open the app in a browser, exercise login → play → homework → admin flows.

Contributions to add Vitest/Playwright/Jest are very welcome.

### Service worker versioning

When you change any of `app.js`, `auth.js`, `platform.js`, `enhancements.js`,
or `service-worker.js`:

1. Bump `CACHE` in `service-worker.js` (e.g., `'alhuda-v9'` → `'alhuda-v10'`).
2. Bump the matching `?v=N` query in `enhancements.js:registerServiceWorker()`.
3. Bump the `?v=N` query strings in `index.html` for any asset you changed
   (CSS/JS).

Users will pick up the new version on the NEXT page load via the
`SKIP_WAITING` handshake.

---

## Deployment

```bash
git add -A
git commit -m "release: ..."
git push origin main
# GitHub Pages will rebuild and serve within ~1 min.
```

The `.nojekyll` file at the repo root disables Jekyll so the `icons/` and
other asset directories ship untouched.

---

## Known limitations & roadmap

- **No tests.** Add Playwright E2E + Vitest unit tests.
- **No CI/CD.** Add a GitHub Actions workflow that lints, builds, and deploys.
- **Auth pepper ships to client.** Migrate to Supabase Edge Function.
- **Monolithic app.js (67KB).** Consider ES modules + a tiny bundler.
- **No proper logging.** Add Sentry or similar for production errors.

---

## License

Proprietary — © جمعية الهدى والحكمة. All rights reserved.
