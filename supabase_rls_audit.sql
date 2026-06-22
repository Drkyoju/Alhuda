-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_rls_audit.sql — تحقق من سياسات RLS الأساسية
-- شغّل/ي في Supabase SQL Editor (قراءة فقط — لا يغيّر البيانات)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) feedback: إدراج عام + قراءة للمعلم/ة
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'feedback'
order by policyname;

-- 2) scores: إدراج للمستخدم + قراءة للمسجّلين
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'scores'
order by policyname;

-- 3) profiles: قراءة/تحديث
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;

-- 4) questions: قراءة عامة للأسئلة العربية
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'questions'
order by policyname;

-- 5) عدد الأسئلة مع الاستشهاد (بعد supabase_questions_citation.sql)
select book,
  count(*) as total,
  count(*) filter (where source_quote is not null and trim(source_quote) <> '') as with_quote,
  count(*) filter (where book_page is not null) as with_page
from public.questions
where language = 'ar'
group by book
order by book;
