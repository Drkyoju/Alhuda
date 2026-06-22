-- استشهاد من الكتاب: نصّ مرجعي + رقم الصفحة
-- شغّل/ي في Supabase SQL Editor

alter table questions add column if not exists book_page int;
alter table questions add column if not exists source_quote text;

comment on column questions.book_page is 'رقم الصفحة في كتاب المعلم للرجوع السريع';
comment on column questions.source_quote is 'نصّ الاستشهاد من الكتاب';

-- أمثلة (عدّل/ي حسب نصّ كتاب المعلم):
-- update questions set book_page = 12, source_quote = '«العبادة هي التوحيد»'
-- where book = 'tawheed' and question_text ilike '%التوحيد هو إفراد%';

-- update questions set book_page = 8, source_quote = '«تَعَلَّمْ أَنَّهُ لَا يَجِبُ عَلَى أَحَدٍ مِنَ الْخَلْقِ أَنْ يُعَبَّدَ إِلَّا اللَّهُ»'
-- where book = 'usool' and question_text ilike '%الأصول الثلاثة%';

create index if not exists idx_questions_book_page on questions (book, book_page) where book_page is not null;
