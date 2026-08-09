-- Exhaustive haraka/OCR bank field fixes — apply with service_role / SQL editor
-- NEVER commit SUPABASE_KEY / service_role.
-- generated: 2026-08-09T20:43:38.545Z

UPDATE questions SET question_text = 'الشرك الأصغر يحبط جميع الأعمال.' WHERE id = '9b8bd8b1-9714-4bb7-a052-ed729cf18151';
-- was: الشرك الأصغر يحبط جميعاًلأعمال.

-- 1846362e-ef04-4578-890d-f9cc27113266 options[0]
-- Manual: replace option text in JSON options array (or patch via app sync).
-- from: الأكبر يحبط جميعاًلعمل وصاحبه مخلد في النار ويخرج من الملة، والأصغر بخلافه
-- to:   الأكبر يحبط جميع العمل وصاحبه مخلد في النار ويخرج من الملة، والأصغر بخلافه

UPDATE questions SET question_text = 'الشرك الذي يحبط جميع الأعمال ويخلد صاحبه في النار هو:' WHERE id = 'c24fc4ba-bfe7-2b9e-7afb-bcb17b18d1a9';
-- was: الشرك الذي يحبط جميعاًلأعمال ويخلد صاحبه في النار هو:

-- 8285fb94-48e6-ff29-55f5-c45f1c8269e2 options[0]
-- Manual: replace option text in JSON options array (or patch via app sync).
-- from: يحبط جميعاًلأعمال ويخلد في النار وينقل عن الملة
-- to:   يحبط جميع الأعمال ويخلد في النار وينقل عن الملة

UPDATE questions SET explanation = 'الإجابة الصحيحة: يحبط جميع الأعمال ويخلد في النار وينقل عن الملة.' WHERE id = '8285fb94-48e6-ff29-55f5-c45f1c8269e2';
-- was: الإجابة الصحيحة: يحبط جميعاًلأعمال ويخلد في النار وينقل عن الملة.

-- ffe0b7b1-6ed0-c04f-9b6c-b180446b518f options[1]
-- Manual: replace option text in JSON options array (or patch via app sync).
-- from: يحبط جميعاًلأعمال
-- to:   يحبط جميع الأعمال

UPDATE questions SET source_quote = 'توحيد الله بإخلاص العبادة له والبراءة من عبادة كل ما سواه' WHERE id = '8230d37a-f5c5-4dea-b8d2-ee499eec99e6';
-- was: .توحيد الله بإخالص العبادة له والبراءة من عبادة كل ما سواه

UPDATE questions SET source_quote = 'كتاب التوحيد الذي هو حق الله على العبيد لشيخ الإسلام محمد بن عبد الوهاب التميمي رحمه الله تعالى' WHERE id = '701bdc34-a025-4d74-ae73-ddc5044695b7';
