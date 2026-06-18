-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_security_fixes_v2.sql
-- RLS HARDENING — replaces public `using (true)` policies with auth-gated ones.
--
-- ⚠️  MANUAL STEP: run this in Supabase → SQL Editor after committing.
-- ⚠️  IMPACT: anonymous (unauthenticated) reads of profiles / scores /
--     challenge_results / challenges will stop working. Verify no public
--     leaderboard or share view depends on anon access before running.
--
-- This file is IDEMPOTENT — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) profiles — was "Public read profiles" using (true)
--    Now: authenticated users only (any logged-in user can read names; that
--    matches the existing teacher/student UX where class rosters are needed).
--    Stricter scoping (e.g. only same-class) should live in a dedicated view.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Public read profiles" on public.profiles;
drop policy if exists "Authenticated read profiles" on public.profiles;
create policy "Authenticated read profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) scores — was "Anyone read scores" using (true)
--    Leaks every student's per-book/level quiz score to the public internet.
--    Now: authenticated only. (Leaderboards use the dedicated
--    challenge_results view below; the welcome leaderboard already requires
--    login via state.user.)
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Anyone read scores" on public.scores;
drop policy if exists "Authenticated read scores" on public.scores;
create policy "Authenticated read scores"
  on public.scores
  for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) challenge_results — was "Anyone can read challenge results" using (true)
--    Leaked user_name + score for every challenge to anon users.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Anyone can read challenge results" on public.challenge_results;
drop policy if exists "Authenticated read challenge results" on public.challenge_results;
create policy "Authenticated read challenge results"
  on public.challenge_results
  for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) challenges — was "Anyone can create challenges" with check (true)
--    Allowed anon users to insert arbitrary challenges with arbitrary JSON.
--    Now: must be authenticated AND the row's created_by must match the
--    caller's uid (prevents spoofed attribution).
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Anyone can create challenges" on public.challenges;
drop policy if exists "Authenticated create challenges" on public.challenges;
create policy "Authenticated create challenges"
  on public.challenges
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Challenge reads also need to be auth-gated. Challenges are shared via a
-- code, but reading the row should still require login so anon crawlers
-- cannot enumerate them.
drop policy if exists "Anyone can read challenges" on public.challenges;
drop policy if exists "Authenticated read challenges" on public.challenges;
create policy "Authenticated read challenges"
  on public.challenges
  for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 5) feedback — was insert with `auth.uid() is not null` only (no ownership
--    check). Allowed a user to file feedback attributed to a different uid
--    and to populate user_name/user_email with arbitrary values. Tighten to
--    require user_id = auth.uid().
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Users insert feedback" on public.feedback;
drop policy if exists "Authenticated insert own feedback" on public.feedback;
create policy "Authenticated insert own feedback"
  on public.feedback
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 6) Defense in depth: ensure RPC functions cannot be invoked by anon.
--    (These should already be granted only to authenticated in
--    supabase_platform.sql, but REVOKE FROM anon makes it bulletproof even
--    if a future migration re-grants.)
-- ─────────────────────────────────────────────────────────────────────────
revoke execute on function public.increment_question_stat(uuid, boolean) from anon;
revoke execute on function public.record_user_wrong(uuid, uuid) from anon;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) Verification (read-only): list the active policies after running.
-- ─────────────────────────────────────────────────────────────────────────
select
  schemaname || '.' || tablename as tbl,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'scores', 'challenge_results', 'challenges', 'feedback')
order by tablename, policyname;
