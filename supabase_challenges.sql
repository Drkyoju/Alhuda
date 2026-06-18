-- Run this in Supabase SQL Editor so challenge codes work across devices

create table if not exists challenges (
  code text primary key,
  questions jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table challenges enable row level security;

create policy "Anyone can create challenges"
  on challenges for insert
  with check (true);

create policy "Anyone can read challenges"
  on challenges for select
  using (true);

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

create policy "Anyone can insert challenge results"
  on challenge_results for insert
  with check (true);

create policy "Anyone can read challenge results"
  on challenge_results for select
  using (true);
