-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_submit_score.sql — validated score insert (run in SQL Editor)
-- Replaces trusting raw client inserts with server-side bounds checks.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.submit_score(
  p_book text,
  p_level text,
  p_sub_level int,
  p_score int,
  p_correct int,
  p_total int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_book is null or p_book not in ('tawheed', 'usool', 'nawawi', 'merge3') then
    raise exception 'invalid book';
  end if;
  if p_level is null or p_level not in ('easy', 'medium', 'hard', 'all') then
    raise exception 'invalid level';
  end if;
  if p_total is null or p_total < 1 or p_total > 500 then
    raise exception 'invalid total';
  end if;
  if p_correct is null or p_correct < 0 or p_correct > p_total then
    raise exception 'invalid correct';
  end if;
  if p_score is null or p_score < 0 or p_score > p_total * 80 then
    raise exception 'invalid score';
  end if;

  insert into public.scores (user_id, book, level, sub_level, score, correct, total, played_at)
  values (auth.uid(), p_book, p_level, coalesce(p_sub_level, 1), p_score, p_correct, p_total, now());
end;
$$;

revoke all on function public.submit_score(text, text, int, int, int, int) from public;
grant execute on function public.submit_score(text, text, int, int, int, int) to authenticated;
