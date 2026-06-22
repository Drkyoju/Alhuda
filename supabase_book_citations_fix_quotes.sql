-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_book_citations_fix_quotes.sql
-- يُصلح ١٠ أسئلة بلا source_quote (الشرح قصير جداً فلم تنجح التعبئة التلقائية)
-- شغّل/ي في Supabase SQL Editor — آمن للتكرار
-- ═══════════════════════════════════════════════════════════════════════════

update public.questions set
  source_quote = '«الطِّيَرَةُ مِنَ الشِّرْكِ» — والتشاؤم بالأيام والأرقام من الطيرة المنهي عنها.'
where id = '2dde27a6-9bcf-4813-bdcd-7f7ab454c272';

update public.questions set
  source_quote = '«عَاشَ ثَلَاثًا وَسِتِّينَ سَنَةً» — من سيرة النبي ﷺ في مختصر الأصول الثلاثة.'
where id = '66db9e22-c10c-44ad-875c-e8081d21d442';

update public.questions set
  source_quote = '«يُكْتَبُ أَجَلُهُ وَرِزْقُهُ وَعَمَلُهُ وَشَقِيٌّ أَوْ سَعِيدٌ» — في حديث ابن مسعود رضي الله عنه.'
where id = '6a0f4a4c-721e-4c78-af74-1161be8a77a4';

update public.questions set
  source_quote = '«كُلُّ بِدْعَةٍ ضَلَالَةٌ» — رواه أبو داود والترمذي، وليس للبدعة قسمة إلى حسنة وسيئة.'
where id = '6b5e357b-2337-4685-ae2c-804d957878ea';

update public.questions set
  source_quote = '«إِنَّ الْحَلَالَ بَيِّنٌ وَإِنَّ الْحَرَامَ بَيِّنٌ وَبَيْنَهُمَا أُمُورٌ مُشْتَبِهَاتٌ» — ومن وقع في الشبهات وقع في الحرام.'
where id = '517ed86f-3bc1-49e1-b33e-28d5ca1f4d04';

update public.questions set
  source_quote = '«لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ» — من علامات الإيمان.'
where id = '371c3a70-cb31-4f62-a927-3576432f673e';

update public.questions set
  source_quote = '«الْبِرُّ حُسْنُ الْخُلُقِ» — تعريف البر في الحديث.'
where id = '5d714abc-747b-4e95-8ab4-e31e6f985a3d';

update public.questions set
  source_quote = '«الْبِرُّ حُسْنُ الْخُلُقِ، وَالْإِثْمُ مَا حَاكَ فِي صَدْرِكَ وَكَرِهْتَ أَنْ يَطَّلِعَ عَلَيْهِ النَّاسُ»'
where id = '7bdfccd0-03b8-4002-a193-faea65aa043d';

update public.questions set
  source_quote = '«إِنَّ اللَّهَ فَرَضَ فَرَائِضَ فَلَا تُضَيِّعُوهَا، وَحَدَّ حُدُودًا فَلَا تَعْتَدُوهَا» — حديث نواس بن سمعان.'
where id = '26f3d3b0-1e3a-4f81-9cf4-aa945f8f0d04';

update public.questions set
  source_quote = '«إِنَّ اللَّهَ تَجَاوَزَ عَنْ أُمَّتِي الْخَطَأَ وَالنِّسْيَانَ وَمَا اسْتُكْرِهُوا عَلَيْهِ» — رواه ابن ماجه وابن حبان.'
where id = '4505d711-ae74-4891-99f9-4bfb3f1a4eec';

-- تحقق:
select book,
  count(*) filter (where source_quote is null or trim(source_quote) = '') as missing_quote,
  count(*) filter (where book_page is not null) as with_page
from public.questions
where language = 'ar'
group by book
order by book;
