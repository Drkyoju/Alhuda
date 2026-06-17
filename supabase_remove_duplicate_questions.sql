-- Run ONCE in Supabase SQL Editor to remove duplicate questions
-- (keeps the oldest row for each book + question_text pair)

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

-- Verify: should return 597
-- SELECT COUNT(*) FROM questions WHERE language = 'ar';
