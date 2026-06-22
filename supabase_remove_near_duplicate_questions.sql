-- حذف الأسئلة المتشابهة جداً (نفس المعنى / نص فرعي من سؤال آخر)
-- شغّل/ي في Supabase SQL Editor بعد supabase_remove_duplicate_questions.sql
-- آمن لإعادة التشغيل: يحذف فقط الـ IDs المحددة إن وُجدت

-- ١) تطابق نصّي تام (إن وُجد)
DELETE FROM questions
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY book, question_text
             ORDER BY created_at ASC NULLS LAST, id ASC
           ) AS rn
    FROM questions
    WHERE language = 'ar'
  ) ranked
  WHERE rn > 1
);

-- ٢) متشابهة جداً (مُحددة بمراجعة ٢٠٢٦-٠٦)
WITH near_dup_ids AS (
  SELECT unnest(ARRAY[
    '28c25817-27e3-428f-a6ff-c2042cacc42e'::uuid,
    '2a48cb12-1b65-447d-93ec-ca2001b23579'::uuid,
    '2a7cf393-de79-4b77-8e40-a2ecab752d54'::uuid,
    '3ba3317a-9fef-4994-9535-07520ea0fdc2'::uuid,
    '50489d5e-7dd0-43f7-ac31-75209ca0be70'::uuid,
    '81b93c71-d614-4610-8da3-86aa7e75fa90'::uuid,
    '8258a7b0-d54b-4a68-8b4d-0c3a05ef2fb7'::uuid,
    '8913f815-94e4-4e3c-b899-d09e92d717f8'::uuid,
    '9212ae2d-68c9-4c12-96f5-1c3ee47427dc'::uuid,
    '97e17c50-57ec-4e24-ab9d-218957796694'::uuid,
    '9ea36e1d-7095-4011-9f26-f5c953038d7c'::uuid,
    'a80ea897-f801-407c-b89e-ad8938c03228'::uuid,
    'ea646f95-5316-477a-8114-56e315cf5a9f'::uuid,
    'fcf45ce9-6e06-4615-a4df-873f2142f7f8'::uuid
  ]) AS id
)
DELETE FROM user_wrong_questions WHERE question_id IN (SELECT id FROM near_dup_ids);

DELETE FROM question_stats WHERE question_id IN (
  SELECT unnest(ARRAY[
    '28c25817-27e3-428f-a6ff-c2042cacc42e'::uuid,
    '2a48cb12-1b65-447d-93ec-ca2001b23579'::uuid,
    '2a7cf393-de79-4b77-8e40-a2ecab752d54'::uuid,
    '3ba3317a-9fef-4994-9535-07520ea0fdc2'::uuid,
    '50489d5e-7dd0-43f7-ac31-75209ca0be70'::uuid,
    '81b93c71-d614-4610-8da3-86aa7e75fa90'::uuid,
    '8258a7b0-d54b-4a68-8b4d-0c3a05ef2fb7'::uuid,
    '8913f815-94e4-4e3c-b899-d09e92d717f8'::uuid,
    '9212ae2d-68c9-4c12-96f5-1c3ee47427dc'::uuid,
    '97e17c50-57ec-4e24-ab9d-218957796694'::uuid,
    '9ea36e1d-7095-4011-9f26-f5c953038d7c'::uuid,
    'a80ea897-f801-407c-b89e-ad8938c03228'::uuid,
    'ea646f95-5316-477a-8114-56e315cf5a9f'::uuid,
    'fcf45ce9-6e06-4615-a4df-873f2142f7f8'::uuid
  ])::uuid
);

DELETE FROM questions WHERE id IN (
  SELECT unnest(ARRAY[
    '28c25817-27e3-428f-a6ff-c2042cacc42e'::uuid,
    '2a48cb12-1b65-447d-93ec-ca2001b23579'::uuid,
    '2a7cf393-de79-4b77-8e40-a2ecab752d54'::uuid,
    '3ba3317a-9fef-4994-9535-07520ea0fdc2'::uuid,
    '50489d5e-7dd0-43f7-ac31-75209ca0be70'::uuid,
    '81b93c71-d614-4610-8da3-86aa7e75fa90'::uuid,
    '8258a7b0-d54b-4a68-8b4d-0c3a05ef2fb7'::uuid,
    '8913f815-94e4-4e3c-b899-d09e92d717f8'::uuid,
    '9212ae2d-68c9-4c12-96f5-1c3ee47427dc'::uuid,
    '97e17c50-57ec-4e24-ab9d-218957796694'::uuid,
    '9ea36e1d-7095-4011-9f26-f5c953038d7c'::uuid,
    'a80ea897-f801-407c-b89e-ad8938c03228'::uuid,
    'ea646f95-5316-477a-8114-56e315cf5a9f'::uuid,
    'fcf45ce9-6e06-4615-a4df-873f2142f7f8'::uuid
  ])::uuid
);

-- تحقق: SELECT COUNT(*) FROM questions WHERE language = 'ar';
-- المتوقع بعد التنظيف: ~573 سؤالاً
