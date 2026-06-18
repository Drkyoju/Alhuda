-- تحسينات أمان وصيانة — شغّل مرة واحدة في SQL Editor

-- ═══ تقييد قراءة الصفوف (الانضمام عبر RPC أو البحث بالرمز) ═══
drop policy if exists "Anyone read classes by code" on classes;
create policy "Authenticated read classes" on classes for select
  using (auth.uid() is not null);

-- ═══ تنظيف اختياري: أسئلة غير عربية ═══
-- احذف التعليق التالي إذا أردت التنفيذ:
-- DELETE FROM questions WHERE language IS DISTINCT FROM 'ar';

-- ═══ فهرس نتائج التحديات ═══
create index if not exists idx_challenge_results_code on challenge_results(code);
create index if not exists idx_challenge_results_score on challenge_results(code, score desc);
