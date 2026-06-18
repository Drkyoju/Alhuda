-- منصة المعلم/ة والطالب/ة — شغّل في Supabase SQL Editor
-- يشمل: صفوف، واجبات، تقدّم، أخطاء، إحصائيات أسئلة، صلاحيات تعديل للمعلم/ة

-- ═══ الصفوف ═══
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  teacher_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique (class_id, user_id)
);

-- ═══ تقدّم الكتب ═══
create table if not exists book_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  book text not null check (book in ('tawheed', 'usool', 'nawawi')),
  answered int not null default 0,
  correct int not null default 0,
  updated_at timestamptz default now(),
  primary key (user_id, book)
);

-- ═══ أسئلة أخطأ فيها الطالب/ة ═══
create table if not exists user_wrong_questions (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  wrong_count int not null default 1,
  last_wrong_at timestamptz default now(),
  primary key (user_id, question_id)
);

-- ═══ إحصائيات صعوبة الأسئلة ═══
create table if not exists question_stats (
  question_id uuid primary key references questions(id) on delete cascade,
  correct_count bigint not null default 0,
  wrong_count bigint not null default 0,
  updated_at timestamptz default now()
);

-- ═══ الواجبات ═══
create table if not exists homework (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  teacher_id uuid references auth.users(id) on delete set null,
  title text not null,
  book text not null,
  level text not null default 'easy',
  q_from int not null default 1,
  q_to int not null default 20,
  due_date date,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists homework_completions (
  homework_id uuid not null references homework(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score int not null default 0,
  correct int not null default 0,
  total int not null default 0,
  completed_at timestamptz default now(),
  primary key (homework_id, user_id)
);

-- ═══ دالة زيادة إحصائية السؤال ═══
create or replace function increment_question_stat(qid uuid, was_correct boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into question_stats (question_id, correct_count, wrong_count)
  values (qid, case when was_correct then 1 else 0 end, case when was_correct then 0 else 1 end)
  on conflict (question_id) do update set
    correct_count = question_stats.correct_count + case when was_correct then 1 else 0 end,
    wrong_count = question_stats.wrong_count + case when was_correct then 0 else 1 end,
    updated_at = now();
end;
$$;

grant execute on function increment_question_stat(uuid, boolean) to anon, authenticated;

-- ═══ دالة تسجيل خطأ الطالب/ة (زيادة العداد) ═══
create or replace function record_user_wrong(uid uuid, qid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_wrong_questions (user_id, question_id, wrong_count, last_wrong_at)
  values (uid, qid, 1, now())
  on conflict (user_id, question_id) do update set
    wrong_count = user_wrong_questions.wrong_count + 1,
    last_wrong_at = now();
end;
$$;

grant execute on function record_user_wrong(uuid, uuid) to anon, authenticated;

-- ═══ RLS ═══
alter table classes enable row level security;
alter table class_members enable row level security;
alter table book_progress enable row level security;
alter table user_wrong_questions enable row level security;
alter table question_stats enable row level security;
alter table homework enable row level security;
alter table homework_completions enable row level security;

-- classes
drop policy if exists "Anyone read classes by code" on classes;
create policy "Anyone read classes by code" on classes for select using (true);
drop policy if exists "Teachers manage own classes" on classes;
create policy "Teachers manage own classes" on classes for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- class_members
drop policy if exists "Users read class members" on class_members;
create policy "Users read class members" on class_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from classes c
      where c.id = class_members.class_id and c.teacher_id = auth.uid()
    )
  );
drop policy if exists "Students join class" on class_members;
create policy "Students join class" on class_members for insert
  with check (user_id = auth.uid());
drop policy if exists "Teachers delete members" on class_members;
create policy "Teachers delete members" on class_members for delete
  using (exists (
    select 1 from classes c where c.id = class_members.class_id and c.teacher_id = auth.uid()
  ));

-- book_progress
drop policy if exists "Users manage own book progress" on book_progress;
create policy "Users manage own book progress" on book_progress for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "Teachers read class book progress" on book_progress;
create policy "Teachers read class book progress" on book_progress for select
  using (exists (
    select 1 from class_members cm
    join classes c on c.id = cm.class_id
    where cm.user_id = book_progress.user_id and c.teacher_id = auth.uid()
  ));

-- user_wrong_questions
drop policy if exists "Users manage own wrongs" on user_wrong_questions;
create policy "Users manage own wrongs" on user_wrong_questions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- question_stats
drop policy if exists "Anyone read question stats" on question_stats;
create policy "Anyone read question stats" on question_stats for select using (true);

-- homework
drop policy if exists "Anyone read active homework" on homework;
create policy "Anyone read active homework" on homework for select using (active = true or teacher_id = auth.uid());
drop policy if exists "Teachers manage homework" on homework;
create policy "Teachers manage homework" on homework for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- homework_completions
drop policy if exists "Users manage own homework completions" on homework_completions;
create policy "Users manage own homework completions" on homework_completions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "Teachers read homework completions" on homework_completions;
create policy "Teachers read homework completions" on homework_completions for select
  using (exists (
    select 1 from homework h where h.id = homework_completions.homework_id and h.teacher_id = auth.uid()
  ));

-- المعلم/ة يعدّل الأسئلة
drop policy if exists "Teachers update questions" on questions;
create policy "Teachers update questions" on questions for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher'));

-- فهارس
create index if not exists idx_class_members_user on class_members(user_id);
create index if not exists idx_class_members_class on class_members(class_id);
create index if not exists idx_scores_user on scores(user_id);
create index if not exists idx_homework_class on homework(class_id);
