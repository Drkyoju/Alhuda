# إعداد Supabase — Alhuda

## المشروع الحالي (حي ✅)

| | |
|--|--|
| **URL** | `https://smcyaqwxbmhshhhhdece.supabase.co` |
| **anon / publishable** | في `app.js` (`SUPABASE_ANON_KEY`) |
| **Project ref** | `smcyaqwxbmhshhhhdece` |

تم التحقق: Auth يعمل، وجداول `profiles` و `scores` موجودة.

## ربط CLI محلياً

```bash
cd "Alhuda"
supabase login
supabase init          # إن لم يكن مجلد supabase موجوداً
supabase link --project-ref smcyaqwxbmhshhhhdece
```

عند `link` سيطلب **Database password** من:
Dashboard → Project Settings → Database → Database password  
(أو Reset database password إن نسيته)

Connection string (ضع كلمة المرور مكان `[YOUR-PASSWORD]`):

```
postgresql://postgres:[YOUR-PASSWORD]@db.smcyaqwxbmhshhhhdece.supabase.co:5432/postgres
```

## SQL (إن احتجت إعادة بناء)

بالترتيب في SQL Editor — **بدون** `supabase_feedback.sql`:

1. `supabase_scores.sql`
2. `supabase_challenges.sql`
3. `supabase_platform.sql`
4. `supabase_security_fixes.sql`
5. `supabase_security_fixes_v2.sql`
6. `supabase_constraints_v1.sql`

## ملاحظة أمان

لا تضع كلمة مرور قاعدة البيانات أو `service_role` في الشات أو في git.
