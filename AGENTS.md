# AGENTS.md — context for AI coding agents working on this repo

## Project type
Static client-side PWA (Arabic RTL Islamic-education quiz). Backend is
Supabase (Postgres + Auth). Deployed via GitHub Pages.

## Tech stack
- **Frontend:** plain HTML / CSS / vanilla JavaScript. No framework, no
  bundler, no transpiler. ES2020 is the supported baseline (uses optional
  chaining, nullish coalescing, async/await).
- **Backend:** Supabase (`@supabase/supabase-js@2` loaded from jsDelivr CDN).
- **PWA:** manifest.json + service-worker.js (cache v9, network-first JS,
  cache-first static assets, navigation fallback).
- **Python:** 3.14 in `.venv/`, stdlib-only for the data pipeline scripts.

## Repository layout
- `index.html` — main markup (was 180KB inline, now ~36KB after extraction).
- `styles.css` — extracted CSS (~80KB).
- `app.js` — main app code (state, game logic, Supabase calls).
- `auth.js` — student (name+PIN) auth: SHA-256 + pepper + client lockout
  + legacy djb2 fallback for existing accounts.
- `platform.js` — teacher dashboard, classes, homework, progress, question
  editor. All DB calls go through `safeQuery()` (no unhandled rejections).
- `enhancements.js` — toasts, analytics, bottom nav, service-worker
  registration. Owns `show()` rebind via `wrapShow()`.
- `service-worker.js` — PWA offline. Bump `CACHE` constant when changing
  any asset; also bump `?v=N` in `enhancements.js`.
- `manifest.json` — PWA manifest (PNG icons at 192/512/maskable).
- `icons/` — SVG + generated PNG icons.
- `supabase_*.sql` — see `supabase_README.md` for canonical apply order.
- `scripts/` — Python data pipeline. Stdlib-only.
- `extracted/` — gitignored intermediate JSON dumps.

## Critical conventions

### Don't break existing student accounts
Auth has a backward-compat fallback chain. **Never** remove the legacy
`djb2 + mailinator/example/test` credential derivation — existing students
have accounts under that scheme. New accounts use SHA-256 +
`alhuda.students.internal`. See `auth.js` for the full chain.

### All DB calls must be wrapped
Use the `safeQuery(fn, errMsg)` helper in `platform.js` for any `await db.*`
call. It returns `{data, error}` and never throws unhandled promise
rejections. Never call `db.*` directly without it.

### Escape DB-sourced strings
- For HTML text content: use `esc(value)`.
- For inline JS string literals (e.g. `onclick="fn('${id}')"`): use
  `escJsString(value)` (= `esc(JSON.stringify(value))`). Safe in both
  HTML-attribute and JS-string layers.
- Both helpers are in `platform.js`.

### Conservative schema changes
This is a deployed app with real student data. Schema changes must be:
- **Additive only** — never drop columns or change types destructively.
- **Idempotent** — every new SQL file uses `IF NOT EXISTS` / `CREATE OR
  REPLACE` / `DROP POLICY IF EXISTS`.
- **Documented** — add a banner explaining impact and a row in
  `supabase_README.md`.

### Secrets
- The Supabase **publishable** anon key in `index.html` is safe to expose
  (protected by RLS). Don't move it to an env var — the client needs it.
- The **service_role** key must NEVER appear in the repo. Python scripts
  read it from `os.environ['SUPABASE_KEY']`.
- `.env` is gitignored. `.env.example` is the template.

## Verification commands

There is NO automated test suite, linter, or type checker. Verify manually:

```bash
# JS syntax check
node --check app.js auth.js platform.js enhancements.js service-worker.js

# Python syntax check
python3 -m py_compile scripts/*.py

# HTML structure sanity check (balanced tags, duplicate IDs)
python3 -c "import re; h=open('index.html').read(); \
  print('main balanced:', h.count('<main')==h.count('</main>')); \
  ids=re.findall(r'id=\"([^\"]+)\"',h); \
  dupes=[i for i in set(ids) if ids.count(i)>1]; \
  print('dup IDs:', dupes or 'none')"
```

Then open the app in a browser and exercise: login → demo → play → results
→ review mistakes → leaderboard → profile → challenge → admin tabs.

## Service-worker versioning

When you change ANY tracked asset (CSS, JS):
1. Bump `CACHE` in `service-worker.js` (e.g. `'alhuda-v9'` → `'alhuda-v10'`).
2. Bump the `?v=N` query in `enhancements.js:registerServiceWorker()`.
3. Bump the matching `?v=N` query strings in `index.html`.

The SW uses a `SKIP_WAITING` handshake (not unconditional `skipWaiting()`)
so the next page load picks up the new version safely.

## SQL apply order

Always check `supabase_README.md` for the canonical order. The current
fresh-project sequence is:

1. `supabase_scores.sql`
2. `supabase_challenges.sql`
3. `supabase_feedback.sql`
4. `supabase_platform.sql`
5. `supabase_security_fixes.sql`
6. `supabase_security_fixes_v2.sql` ← auth-gates previously-public policies
7. `supabase_constraints_v1.sql`   ← FK ON DELETE + CHECK + indexes

## Common pitfalls

- **`enhancements.js:wrapShow()`** depends on the global `show` function
  defined in `app.js`. If you change load order, the retry-on-setTimeout
  fallback handles it, but verify bottom-nav active state still toggles.
- **Dark mode** uses `:root:not([data-theme="light"])` for system preference
  and `[data-theme="dark"]` for manual override. Both must stay in sync.
- **`alert()`** is banned — use `showToast(msg, type)` (type: 'ok'|'err'|'info').
- **`images.jpeg`** is a placeholder photo, NOT a real logo. Use the PNGs
  in `icons/` for any icon role.
