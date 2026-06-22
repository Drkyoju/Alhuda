-- استشهاد من الكتاب: نصّ مرجعي + رقم الصفحة
-- شغّل/ي في Supabase SQL Editor ثم أضيف/ي البيانات لكل سؤال

alter table questions add column if not exists book_page int;
alter table questions add column if not exists source_quote text;

comment on column questions.book_page is 'رقم الصفحة في كتاب المعلم للرجوع السريع';
comment on column questions.source_quote is 'نصّ الاستشهاد من الكتاب';

-- مثال:
-- update questions set book_page = 12, source_quote = '«العبادة هي التوحيد»'
-- where id = '...';
