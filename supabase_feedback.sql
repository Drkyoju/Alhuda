-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_feedback.sql — آراء المتعلمين (بما فيها التجربة قبل تسجيل الدخول)
-- شغّله في Supabase → SQL Editor → Run (مرة واحدة، أو عند تحديث السياسات)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  user_name text not null,
  user_email text,
  user_id uuid references auth.users(id) on delete set null,
  rating int check (rating between 1 and 5),
  message text,
  source text default 'demo',
  created_at timestamptz default now()
);

-- إصلاح FK إن كان الجدول موجوداً مسبقاً
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'feedback'
      and constraint_name = 'feedback_user_id_fkey'
  ) then
    alter table public.feedback drop constraint if exists feedback_user_id_fkey;
    alter table public.feedback
      add constraint feedback_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

alter table public.feedback enable row level security;

-- صلاحيات الوصول للجدول
grant usage on schema public to anon, authenticated;
grant select, insert on public.feedback to anon, authenticated;

-- إزالة كل السياسات القديمة (من ملفات سابقة)
drop policy if exists "Anyone can insert feedback" on public.feedback;
drop policy if exists "Anyone can insert demo feedback" on public.feedback;
drop policy if exists "Authenticated insert feedback" on public.feedback;
drop policy if exists "Authenticated insert own feedback" on public.feedback;
drop policy if exists "Users insert feedback" on public.feedback;
drop policy if exists "Teachers can read feedback" on public.feedback;

-- ضيف / تجربة قبل الدخول: إرسال بدون user_id
create policy "Anyone can insert demo feedback"
  on public.feedback for insert
  to anon, authenticated
  with check (user_id is null);

-- مستخدم مسجّل: يربط رأيه بحسابه أو يرسل بدون user_id
create policy "Authenticated insert own feedback"
  on public.feedback for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

-- المعلم/ة يقرأ كل الآراء في لوحة الإدارة
create policy "Teachers can read feedback"
  on public.feedback for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  );

create index if not exists idx_feedback_created_at on public.feedback(created_at desc);
create index if not exists idx_feedback_user_id on public.feedback(user_id);

-- تحقق (اختياري): يجب أن ترى 3 سياسات على جدول feedback
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'feedback'
order by policyname;
