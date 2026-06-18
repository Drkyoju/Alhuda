-- إضافة أسئلة من quiz_app غير الموجودة في القاعدة (بعد التنظيف)
-- العدد: 6
-- شغّل بعد supabase_questions_full_cleanup.sql

BEGIN;

INSERT INTO questions (book, chapter, level, type, question_text, options, correct_index, explanation, language) VALUES ('tawheed', 'كتاب التوحيد — الذبح والنذر لغير الله', 'hard', 'mc', '"لعن الله من ذبح لغير الله" رواه:', '["مسلم", "البخاري", "أبو داود", "الترمذي"]'::jsonb, 0, '«مسلم» هو ما ثبت في لفظ الحديث/الأثر كما أورده الكتاب.', 'ar');
INSERT INTO questions (book, chapter, level, type, question_text, options, correct_index, explanation, language) VALUES ('tawheed', 'كتاب التوحيد — الذبح لغير الله واللعن', 'medium', 'mc', '"لعن الله من ذبح":', '["لغير الله", "لله", "عند القبر", "في المسجد"]'::jsonb, 0, '«لغير الله» هو ما ثبت في لفظ الحديث/الأثر كما أورده الكتاب.', 'ar');
INSERT INTO questions (book, chapter, level, type, question_text, options, correct_index, explanation, language) VALUES ('tawheed', 'كتاب التوحيد — الذبح لغير الله واللعن', 'hard', 'mc', 'من الأمور الأربعة التي وردت في حديث عليّ: لعن الله من ذبح لغير الله، ومن لعن:', '["والديه", "جاره", "نفسه", "إمامه"]'::jsonb, 0, '«والديه» هو ما ثبت في لفظ الحديث/الأثر كما أورده الكتاب.', 'ar');
INSERT INTO questions (book, chapter, level, type, question_text, options, correct_index, explanation, language) VALUES ('nawawi', 'الأربعون النووية', 'hard', 'mc', 'أركان الإسلام في حديث "بُني الإسلام على خمس" أولها:', '["شهادة أن لا إله إلا الله", "الصلاة", "الزكاة", "الصوم"]'::jsonb, 0, '«شهادة أن لا إله إلا الله» هو ما ثبت في لفظ الحديث/الأثر كما أورده الكتاب.', 'ar');
INSERT INTO questions (book, chapter, level, type, question_text, options, correct_index, explanation, language) VALUES ('nawawi', 'الأربعون النووية', 'hard', 'mc', '"دع ما يريبك إلى ما لا يريبك" يدعو إلى:', '["ترك المشتبه", "فعل المشتبه", "الجدال", "التكاثر"]'::jsonb, 0, '«ترك المشتبه» هي الإجابة المطابقة لِما ورد في النصّ والمعنى المراد.', 'ar');
INSERT INTO questions (book, chapter, level, type, question_text, options, correct_index, explanation, language) VALUES ('nawawi', 'الأربعون النووية', 'easy', 'mc', '"كن في الدنيا كأنك غريب" يحثّ على:', '["قصر الأمل والاستعداد للآخرة", "جمع المال", "طول الأمل", "الكسل"]'::jsonb, 0, '«قصر الأمل والاستعداد للآخرة» هي الإجابة المطابقة لِما ورد في النصّ والمعنى المراد.', 'ar');

COMMIT;

-- المتوقع بعد الإضافة: 581 + 6 = 587