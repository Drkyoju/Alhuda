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
