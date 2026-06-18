-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_cleanup_users.sql
-- ONE-SHOT MAINTENANCE SCRIPT — review carefully before running.
--
-- ⚠️  DESTRUCTIVE: deletes auth.users rows. Cannot be undone.
-- ⚠️  Wrap in an explicit transaction (BEGIN/COMMIT below).
-- ⚠️  The previous version had a CRITICAL bug: `UPDATE feedback SET user_id=null
--     WHERE user_id is not null` (no scoping) nullified EVERY row in the table,
--     not just the rows about to be deleted. This version scopes every UPDATE
--     to the users actually being deleted.
--
-- Run in Supabase → SQL Editor. Adjust the WHERE clauses to target the users
-- you actually want to remove. To preview without deleting, comment out the
-- DELETE statements and run only the SELECT/UPDATE blocks.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 1) Preview the users that WILL be deleted (no action).
--    Adjust the WHERE clauses below to match your intent.
select
  u.id,
  u.email,
  u.is_anonymous,
  u.created_at,
  p.name,
  p.role
from auth.users u
left join public.profiles p on p.id = u.id
where u.email like 'alhuda.student.%@mailinator.com'
   or u.email like 'alhuda.student.%@example.com'
   or u.email like 'alhuda.student.%@test.com'
   or coalesce(u.is_anonymous, false) = true
   or coalesce(u.raw_app_meta_data->>'provider', '') = 'anonymous'
order by u.created_at;

-- 2) Build the set of user IDs we are about to delete. Stored in a temp
--    table so every subsequent UPDATE/DELETE references exactly the same set.
create temp table _users_to_delete(id uuid primary key) on commit drop;

insert into _users_to_delete(id)
select u.id
from auth.users u
where u.email like 'alhuda.student.%@mailinator.com'
   or u.email like 'alhuda.student.%@example.com'
   or u.email like 'alhuda.student.%@test.com'
   or coalesce(u.is_anonymous, false) = true
   or coalesce(u.raw_app_meta_data->>'provider', '') = 'anonymous';

-- 3) Detach references that would block user deletion.
--    FIXED: every UPDATE is now scoped to ONLY the rows whose user_id is in
--    the deletion set. Previously this nullified every row in the table.
update public.feedback
   set user_id = null
 where user_id in (select id from _users_to_delete);

update public.challenges
   set created_by = null
 where created_by in (select id from _users_to_delete);

-- 4) Delete the targeted auth.users rows. (Foreign keys with ON DELETE SET
--    NULL/CASCADE on public.* tables handle the rest.)
delete from auth.users
 where id in (select id from _users_to_delete);

-- 5) Remove orphaned profiles (defensive; the cascade should already cover this).
delete from public.profiles p
 where not exists (select 1 from auth.users u where u.id = p.id);

-- 6) Confirm the result.
select
  (select count(*) from auth.users)       as users_left,
  (select count(*) from public.profiles)  as profiles_left,
  (select count(*) from public.scores)    as scores_left,
  (select count(*) from public.feedback where user_id is not null)   as feedback_attributed,
  (select count(*) from public.challenges where created_by is not null) as challenges_attributed;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- OPTIONAL — wipe ALL students (keep teachers only). OFF by default.
-- Uncomment and re-run if you need a clean-slate reset of student accounts.
-- This block is NOT inside the transaction above so it cannot run by accident.
-- ═══════════════════════════════════════════════════════════════════════════
-- begin;
-- create temp table _all_students(id uuid primary key) on commit drop;
-- insert into _all_students(id)
-- select id from public.profiles where role = 'student';
--
-- update public.feedback   set user_id    = null where user_id    in (select id from _all_students);
-- update public.challenges set created_by = null where created_by in (select id from _all_students);
-- delete from auth.users where id in (select id from _all_students);
-- delete from public.profiles where id in (select id from _all_students);
-- commit;
