-- ═══════════════════════════════════════════════════════════════
-- إصلاح دخول الطلاب — شغّل في Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════
--
-- في Dashboard أيضاً:
-- Authentication → Providers → Email
--   ✅ Email مفعّل
--   ❌ Confirm email = OFF (معطّل)
--
-- ═══════════════════════════════════════════════════════════════

-- تأكيد حسابات الطلاب المعلّقة (بسبب Confirm email)
update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  confirmed_at = coalesce(confirmed_at, now())
where email like 'alhuda.student.%@mailinator.com'
   or email like 'alhuda.student.%@example.com'
   or email like 'alhuda.student.%@test.com';

-- معاينة الحسابات المتبقية غير المؤكدة
select id, email, email_confirmed_at, created_at
from auth.users
where email_confirmed_at is null
order by created_at desc;
