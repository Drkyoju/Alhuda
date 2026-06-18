-- Run this in Supabase SQL Editor so challenge codes work across devices
-- questions jsonb stores { v:2, ids:[...], book, level } — not full answers

create table if not exists challenges (
  code text primary key,
  questions jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table challenges enable row level security;

drop policy if exists "Anyone can create challenges" on challenges;
create policy "Anyone can create challenges"
  on challenges for insert
  with check (true);

drop policy if exists "Anyone can read challenges" on challenges;
drop policy if exists "Authenticated read challenges" on challenges;
create policy "Authenticated read challenges"
  on challenges for select
  using (auth.uid() is not null);

-- نتائج التحديات
create table if not exists challenge_results (
  id uuid default gen_random_uuid() primary key,
  code text not null references challenges(code) on delete cascade,
  user_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  score int not null default 0,
  correct int not null default 0,
  total int not null default 0,
  created_at timestamptz default now()
);

alter table challenge_results enable row level security;

drop policy if exists "Anyone can insert challenge results" on challenge_results;
drop policy if exists "Users insert own challenge results" on challenge_results;
create policy "Users insert own challenge results"
  on challenge_results for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Anyone can read challenge results" on challenge_results;
create policy "Anyone can read challenge results"
  on challenge_results for select
  using (true);

create index if not exists idx_challenge_results_code on challenge_results(code);
create index if not exists idx_challenge_results_score on challenge_results(code, score desc);
