-- ═══════════════════════════════════════════════════════════════
-- تنظيف المستخدمين — شغّل في Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1) معاينة قبل الحذف
select
  u.id,
  u.email,
  u.is_anonymous,
  u.created_at,
  p.name,
  p.role
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;

-- 2) فك الارتباطات التي تمنع الحذف (feedback لا يحذف تلقائياً)
update public.feedback set user_id = null where user_id is not null;
update public.challenges set created_by = null where created_by is not null;

-- 3) حذف حسابات PIN التجريبية
delete from auth.users
where email like 'alhuda.student.%@mailinator.com'
   or email like 'alhuda.student.%@example.com'
   or email like 'alhuda.student.%@test.com';

-- 4) حذف الحسابات المجهولة (النظام القديم)
delete from auth.users
where coalesce(is_anonymous, false) = true
   or coalesce(raw_app_meta_data->>'provider', '') = 'anonymous';

-- 5) حذف كل الطلاب — يبقي المعلمين فقط (احذف التعليق إن أردت)
-- update public.feedback set user_id = null
-- where user_id in (select id from public.profiles where role = 'student');
-- delete from auth.users u
-- using public.profiles p
-- where p.id = u.id and p.role = 'student';

-- 6) حذف الجميع — بداية نظيفة كاملة (احذف التعليق إن أردت)
-- update public.feedback set user_id = null;
-- update public.challenges set created_by = null;
-- delete from auth.users;

-- 7) ملفات شخصية يتيمة
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

-- 8) تأكيد بعد الحذف
select
  (select count(*) from auth.users) as users_left,
  (select count(*) from public.profiles) as profiles_left,
  (select count(*) from public.scores) as scores_left;
