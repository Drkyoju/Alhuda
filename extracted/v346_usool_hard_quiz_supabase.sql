-- v346: usool hard-quiz screenshot fixes. Apply in Supabase SQL editor (service_role).

UPDATE public.questions SET
  question_text = 'دليل الذبح لله:',
  explanation = 'قوله تعالى: ﴿فَصَلِّ لِرَبِّكَ وَانْحَرْ﴾.',
  source_quote = 'قوله: (فصل لربك وانحر)'
WHERE id = '06ded618-669a-40ce-8574-4da46b041242';

UPDATE public.questions SET
  question_text = 'حكم الهجرة من بلد الشرك إلى بلد الإسلام:',
  options = '["فريضة","مستحبة","مباحة","مكروهة"]'::jsonb,
  correct_index = 0,
  explanation = 'الهجرة فريضة على هذه الأمة من بلد الشرك إلى بلد الإسلام.',
  source_quote = 'والهجرة فريضة على هذه الأمة من بلد الشرك إلى بلد الإسلام وهي باقية'
WHERE id = '4835ca34-6f9f-e25f-0315-e88ca181188e';

UPDATE public.questions SET
  question_text = 'رُكْنَا «لا إله إلا الله» هما:'
WHERE id = 'e5f2c8b4-c3cf-2650-9d86-e31f0ea3a0db';

UPDATE public.questions SET
  source_quote = 'مصارف الزكاة هي المذكورة في قوله تعالى في سورة التوبة: ﴿إِنَّمَا الصَّدَقَاتُ لِلْفُقَرَاءِ وَالْمَسَاكِينِ وَالْعَامِلِينَ عَلَيْهَا وَالْمُؤَلَّفَةِ قُلُوبُهُمْ وَفِي الرِّقَابِ وَالْغَارِمِينَ وَفِي سَبِيلِ اللَّهِ وَابْنِ السَّبِيلِ فَرِيضَةً مِنَ اللَّهِ وَاللَّهُ عَلِيمٌ حَكِيمٌ﴾',
  explanation = 'ثمانية أصناف، وهي المذكورة في آية التوبة.'
WHERE id IN (
  '78eb226a-d98c-ccfc-53bc-5d9fec362c70',
  'd4c2155a-db1c-4adc-aa8a-776f7991c93b'
);

UPDATE public.questions SET
  question_text = 'الدليل على رسالة محمد ﷺ نزل في سورة:',
  source_quote = 'ثم كان رسولا حين نزل عليه قوله تعالى: يا أيها المدثر قم فأنذر'
WHERE id = '57609348-66fa-19c8-6db5-4f13174e5c6e';

UPDATE public.questions SET
  question_text = '«اقرأ باسم ربك الذي خلق» نزلت فجعلته:',
  options = '["نبياً","رسولاً","خاتماً","إماماً"]'::jsonb,
  explanation = 'نزلت فجعلته نبياً.',
  source_quote = '«اقرأ باسم ربك الذي خلق» نزلت فجعلته نبياً'
WHERE id = '6c71a8c8-dc70-2a62-ef90-94e21c535a51';

UPDATE public.questions SET
  question_text = '«يا أيها المدثر قم فأنذر» نزلت فجعلته:',
  options = '["رسولاً","نبياً","خاتماً","إماماً"]'::jsonb,
  explanation = 'نزلت فجعلته رسولاً.',
  source_quote = 'ثم كان رسولا حين نزل عليه قوله تعالى: يا أيها المدثر قم فأنذر'
WHERE id = 'bb712df7-5aa7-7e07-7cd8-89a90d6efb19';

UPDATE public.questions SET
  explanation = 'النذر عبادة لا تصرف إلا لله، والنذر لغير الله شرك. قال تعالى: ﴿يُوفُونَ بِالنَّذْرِ﴾.',
  source_quote = 'النذر عبادة لا تصرف إلا لله'
WHERE id = '119d35bc-1357-43b6-a136-0700351ecf99';

UPDATE public.questions SET
  source_quote = 'يُوفُونَ بِالنَّذْرِ وَيَخَافُونَ يَوْمًا كَانَ شَرُّهُ مُسْتَطِيرًا',
  explanation = 'قوله تعالى: ﴿يُوفُونَ بِالنَّذْرِ وَيَخَافُونَ يَوْمًا كَانَ شَرُّهُ مُسْتَطِيرًا﴾.'
WHERE id = '5160169e-5368-44b1-81b7-cf4074a86523';
