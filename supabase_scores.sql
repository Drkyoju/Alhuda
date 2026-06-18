-- جدول النتائج — شغّل فقط إذا لم يكن موجوداً
-- مشروعك الحالي يستخدم played_at (لا تشغّل هذا إن كان scores موجوداً)

create table if not exists scores (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  book text not null,
  level text not null default 'easy',
  sub_level int default 1,
  score int not null default 0,
  correct int not null default 0,
  total int not null default 0,
  played_at timestamptz default now()
);

alter table scores enable row level security;

drop policy if exists "Users insert own scores" on scores;
create policy "Users insert own scores"
  on scores for insert
  with check (user_id = auth.uid());

drop policy if exists "Anyone read scores" on scores;
create policy "Anyone read scores"
  on scores for select
  using (true);

create index if not exists idx_scores_user on scores(user_id);
create index if not exists idx_scores_created on scores(played_at desc);
