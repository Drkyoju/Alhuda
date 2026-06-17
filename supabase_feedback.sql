-- Run this in Supabase SQL Editor to receive student feedback

create table if not exists feedback (
  id uuid default gen_random_uuid() primary key,
  user_name text not null,
  user_email text,
  user_id uuid references auth.users(id),
  rating int check (rating between 1 and 5),
  message text,
  source text default 'demo',
  created_at timestamptz default now()
);

alter table feedback enable row level security;

create policy "Anyone can insert feedback"
  on feedback for insert
  with check (true);

create policy "Teachers can read feedback"
  on feedback for select
  using (true);
