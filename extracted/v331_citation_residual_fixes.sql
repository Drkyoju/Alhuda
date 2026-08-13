-- v331 Checker B: restore 14 residual garbage citations from clean bank explanation/source (no invented text)
BEGIN;
UPDATE public.questions SET source_quote = 'كتاب التوحيد الذي هو حق الله على العبيد لشيخ الإسلام محمد بن عبد الوهاب التميمي رحمه الله تعالى' WHERE id = '701bdc34-a025-4d74-ae73-ddc5044695b7';
UPDATE public.questions SET source_quote = 'من صدق كاهنا أو منجما بما يخبر به من الغيب فقد كفر' WHERE id = 'a8f23c47-fc66-475b-932a-466229070465';
UPDATE public.questions SET source_quote = 'قال ﷺ: فوالله لأن يهدي الله بك رجلا واحدا خير لك من حمر النعم' WHERE id = 'de6475f4-5d82-4bb1-a4c6-2708898479dd';
UPDATE public.questions SET source_quote = 'من أتى عرافا فسأله عن شيء لم تقبل له صلاة أربعين ليلة' WHERE id = 'f48ef856-cf46-4a40-8e36-5f7104f14a90';
UPDATE public.questions SET source_quote = 'قوله: (فصل لربك وانحر)' WHERE id = '06ded618-669a-40ce-8574-4da46b041242';
UPDATE public.questions SET source_quote = 'بعثه الله بالنذارة عن الشرك ويدعو إلى التوحيد' WHERE id = '0291b09c-537f-45e0-b8b0-bfaf14d919bc';
UPDATE public.questions SET source_quote = 'الإسلام: الشهادة، إقام الصلاة، إيتاء الزكاة، صوم رمضان، حج البيت' WHERE id = '7adf11c1-2f42-412c-87e8-7adbe489d73b';
UPDATE public.questions SET source_quote = 'أن تلد الأمة ربتها، وأن ترى الحفاة العراة يتطاولون في البنيان' WHERE id = 'bca53c44-9668-4fdd-a671-cbe8dbe507bf';
UPDATE public.questions SET source_quote = 'قلنا: لمن؟ قال: لله ولكتابه ولرسوله ولأئمة المسلمين وعامتهم' WHERE id = '6d80017a-77d3-4857-99b8-3a193479a911';
UPDATE public.questions SET source_quote = 'النصيحة لله هي التعظيم لأمره والشفقة على خلقه' WHERE id = '40459252-7195-453e-8b26-71fd6756bda5';
UPDATE public.questions SET source_quote = 'وأتبع السيئة الحسنة تمحها' WHERE id = '7ca5574a-1866-4575-91d2-abec2ef3166e';
UPDATE public.questions SET source_quote = 'البينة على المدعي، واليمين على من أنكر' WHERE id = 'e40007c9-1ee6-4bd0-a75c-344b8259d2c9';
UPDATE public.questions SET source_quote = 'كل المسلم على المسلم حرام' WHERE id = '1db7086a-ddff-4b54-a188-3ab280f420cb';
UPDATE public.questions SET source_quote = 'كل المسلم على المسلم حرام' WHERE id = 'f469d4e4-8926-4773-b925-6a920c4f84b1';
COMMIT;
