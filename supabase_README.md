# Supabase SQL — Apply Order & File Reference

This directory contains the Supabase schema, RLS policies, security hardening,
and one-shot maintenance scripts for the Alhuda project.

> **Project URL:** `https://smcyaqwxbmhshhhhdece.supabase.co`
> All scripts target the Supabase SQL Editor. They are Postgres-compatible.

## Canonical apply order

For a **fresh project** (or to bring an existing project up to date):

| # | File | Type | Purpose |
|---|------|------|---------|
| 1 | `supabase_scores.sql` | Schema (idempotent) | Creates the `scores` table + indexes + RLS. |
| 2 | `supabase_challenges.sql` | Schema (idempotent) | Creates `challenges`, `challenge_results` + RLS. |
| 3 | `supabase_feedback.sql` | Schema (idempotent) | Creates `feedback` + RLS. |
| 4 | `supabase_platform.sql` | Schema (idempotent) | Creates `classes`, `class_members`, `book_progress`, `user_wrong_questions`, `question_stats`, `homework`, `homework_completions`, two RPC functions + RLS + indexes. **The de-facto main schema.** |
| 5 | `supabase_security_fixes.sql` | Hardening (idempotent) | Tightens RPC grants, profile role-change protection, challenge_results INSERT policy. |
| 6 | **`supabase_security_fixes_v2.sql`** | Hardening (idempotent) | Replaces public `using (true)` policies on `profiles`, `scores`, `challenge_results`, `challenges`, `feedback` with auth-gated ones. **Run after a fresh deploy.** See banner inside the file for impact. |
| 7 | **`supabase_constraints_v1.sql`** | Hardening (idempotent, additive) | Adds `ON DELETE SET NULL` to FKs, CHECK constraints for book/level/range enums, supporting indexes. Run the pre-probes at the bottom first. |

## One-shot scripts (run once, then forget)

These are **NOT idempotent**. They modify production data by hardcoded UUIDs.
Do NOT re-run them blindly.

| File | Status | Purpose |
|------|--------|---------|
| `supabase_questions_full_cleanup.sql` | ✅ Run once | Cleans the question bank from 597 → 581 rows. Supersedes `supabase_questions_cleanup.sql` (deleted). |
| `supabase_questions_add_missing.sql` | ✅ Run once (after full_cleanup) | Adds 6 missing rows. |
| `supabase_remove_duplicate_questions.sql` | ✅ Run once | Dedupes by `(book, question_text)`. Idempotent (safe to re-run). |
| `supabase_questions_import.sql` | ✅ Run once | Bulk seed of 171 questions extracted from PDFs. |
| `supabase_fix_student_auth.sql` | ✅ Run once | Back-fills `email_confirmed_at` for legacy demo accounts. Effectively a no-op on a second run. |
| `supabase_cleanup_users.sql` | ⚠️ Destructive — review carefully | Wipes legacy demo/anon accounts. **Read the file header before running.** |
| `supabase_questions_sync.sql` | ❌ DEPRECATED | Has a known data-loss bug (multiple UPDATEs targeting the same UUID). Retained for audit only — DO NOT RUN. |

## Deleted files (cleanup in this commit)

| File | Reason |
|------|--------|
| `supabase_hardening.sql` | Empty stub (only comments). |
| `supabase_questions_rls_optional.sql` | All comments — no executable SQL. |
| `supabase_questions_cleanup.sql` | Superseded by `supabase_questions_full_cleanup.sql` (overlapping UUIDs with conflicting values — running both is undefined). |

## Tables NOT defined in this repo

The following tables are referenced as foreign keys / queried by app code
but their `CREATE TABLE` lives outside this repo (likely in the Supabase
Dashboard or an earlier manual migration):

- `public.profiles` — user display name, role (`student`/`teacher`), etc.
- `public.questions` — the question bank (`book`, `chapter`, `level`, `type`,
  `question_text`, `options jsonb`, `correct_index`, `is_true`, `explanation`,
  `language`).

To reconstruct them on a fresh project, see `supabase_platform.sql:198` for
the UPDATE policy that implies the `questions` schema, and
`supabase_security_fixes.sql:49` for the RLS policy on `profiles`.

## Verifying policies after a deploy

```sql
-- List all active policies on the sensitive tables.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','scores','challenge_results','challenges','feedback')
order by tablename, policyname;
```

## See also

- `../.env.example` — required environment variables for the Python scripts.
- `../scripts/` — offline data-pipeline tools (question extraction, audit, sync).
- `../README.md` — overall project setup.
