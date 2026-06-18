-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_constraints_v1.sql
-- ADDITIVE schema hardening: missing foreign-key ON DELETE behavior, CHECK
-- constraints for enums and range sanity, and supporting indexes.
--
-- ⚠️  MANUAL STEP: run this in Supabase → SQL Editor after committing.
-- ⚠️  IDEMPOTENT: each statement uses IF NOT EXISTS / guards. Safe to re-run.
-- ⚠️  NON-BREAKING: no column drops, no type changes. Only adds constraints
--     and indexes. Existing data must already satisfy the constraints (verify
--     the SELECT probes at the bottom first if unsure).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Foreign keys: switch from default NO ACTION to ON DELETE SET NULL so
--    deleting a user (via supabase_cleanup_users.sql or otherwise) doesn't
--    fail. The previous default is what forced the destructive UPDATEs in
--    cleanup_users.sql in the first place.
-- ─────────────────────────────────────────────────────────────────────────

-- Drop the existing NO ACTION FK on feedback.user_id and replace with SET NULL.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'feedback' and constraint_type = 'FOREIGN KEY'
  ) then
    alter table public.feedback drop constraint if exists feedback_user_id_fkey;
    alter table public.feedback
      add constraint feedback_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- Same for challenges.created_by.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'challenges' and constraint_type = 'FOREIGN KEY'
  ) then
    alter table public.challenges drop constraint if exists challenges_created_by_fkey;
    alter table public.challenges
      add constraint challenges_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) CHECK constraints: keep invalid book/level/range values out of the DB.
--    These match the in-app allowed values; existing rows must already
--    satisfy them (verify with the probes at the bottom of this file).
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'homework_book_check'
  ) then
    alter table public.homework
      add constraint homework_book_check check (book in ('tawheed','usool','nawawi'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'homework_level_check'
  ) then
    alter table public.homework
      add constraint homework_level_check check (level in ('easy','medium','hard'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'homework_qrange_check'
  ) then
    alter table public.homework
      add constraint homework_qrange_check check (q_from >= 1 and q_to >= q_from);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'scores_book_check'
  ) then
    alter table public.scores
      add constraint scores_book_check check (book in ('tawheed','usool','nawawi','merge3'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'scores_level_check'
  ) then
    alter table public.scores
      add constraint scores_level_check check (level in ('easy','medium','hard','all'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'book_progress_book_check'
  ) then
    alter table public.book_progress
      add constraint book_progress_book_check check (book in ('tawheed','usool','nawawi'));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Indexes for the common query patterns that were doing seq scans.
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists idx_homework_completions_user on public.homework_completions(user_id);
create index if not exists idx_user_wrong_questions_qid  on public.user_wrong_questions(question_id);
create index if not exists idx_challenges_created_by     on public.challenges(created_by);
create index if not exists idx_feedback_user_id          on public.feedback(user_id);
create index if not exists idx_scores_book_level         on public.scores(book, level);

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) PRE-RUN PROBES (read-only). Run these BEFORE running the file to confirm
--    existing data satisfies the new CHECKs. They should all return 0 rows.
--    If any returns rows, fix that data first or this migration will fail.
-- ─────────────────────────────────────────────────────────────────────────
/*
select id, book, level, q_from, q_to from public.homework
 where book not in ('tawheed','usool','nawawi')
    or level not in ('easy','medium','hard')
    or q_from < 1 or q_to < q_from;

select id, book, level from public.scores
 where book not in ('tawheed','usool','nawawi','merge3')
    or level not in ('easy','medium','hard','all');

select user_id, book from public.book_progress
 where book not in ('tawheed','usool','nawawi');
*/
