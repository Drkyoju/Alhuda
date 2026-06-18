-- ═══════════════════════════════════════════════════════════════
-- إصلاحات أمان — شغّل مرة واحدة في Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ═══ 1) تقييد دوال RPC ═══
create or replace function increment_question_stat(qid uuid, was_correct boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into question_stats (question_id, correct_count, wrong_count)
  values (qid, case when was_correct then 1 else 0 end, case when was_correct then 0 else 1 end)
  on conflict (question_id) do update set
    correct_count = question_stats.correct_count + case when was_correct then 1 else 0 end,
    wrong_count = question_stats.wrong_count + case when was_correct then 0 else 1 end,
    updated_at = now();
end;
$$;

create or replace function record_user_wrong(uid uuid, qid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or uid is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;
  insert into user_wrong_questions (user_id, question_id, wrong_count, last_wrong_at)
  values (uid, qid, 1, now())
  on conflict (user_id, question_id) do update set
    wrong_count = user_wrong_questions.wrong_count + 1,
    last_wrong_at = now();
end;
$$;

revoke execute on function increment_question_stat(uuid, boolean) from anon;
revoke execute on function record_user_wrong(uuid, uuid) from anon;
grant execute on function increment_question_stat(uuid, boolean) to authenticated;
grant execute on function record_user_wrong(uuid, uuid) to authenticated;

-- ═══ 2) حماية profiles — منع ترقية الدور ═══
alter table public.profiles enable row level security;

drop policy if exists "Public read profiles" on public.profiles;
create policy "Public read profiles" on public.profiles for select using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users update own profile without role change" on public.profiles;
create policy "Users update own profile without role change" on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- ═══ 3) تقييد الصفوف ═══
drop policy if exists "Anyone read classes by code" on classes;
drop policy if exists "Authenticated read classes" on classes;
create policy "Authenticated read classes" on classes for select
  using (auth.uid() is not null);

-- ═══ 4) تقييد التحديات ونتائجها ═══
drop policy if exists "Anyone can read challenges" on challenges;
create policy "Authenticated read challenges" on challenges for select
  using (auth.uid() is not null);

drop policy if exists "Anyone can insert challenge results" on challenge_results;
create policy "Users insert own challenge results" on challenge_results for insert
  with check (auth.uid() is not null and user_id = auth.uid());

-- ═══ 5) تقييد الآراء ═══
drop policy if exists "Anyone can insert feedback" on feedback;
create policy "Authenticated insert feedback" on feedback for insert
  with check (auth.uid() is not null);

-- ═══ 6) فهارس ═══
create index if not exists idx_challenge_results_code on challenge_results(code);
create index if not exists idx_challenge_results_score on challenge_results(code, score desc);
