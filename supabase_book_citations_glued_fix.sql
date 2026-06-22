-- supabase_book_citations_glued_fix.sql
-- Fix 15 citations with glued Arabic words (OCR segmentation)
-- Run in Supabase SQL Editor after supabase_book_citations_ocr_cleanup.sql

begin;

update public.questions set source_quote = '«من حلف بغير الله فقد كفر أو أشرك»' where id = 'd3ef73b7-d767-4445-a6d7-c1f92032be45';
update public.questions set source_quote = '«من حلف بغير الله فقد كفر أو أشرك»' where id = '4140eba5-8540-463b-b584-4e5747ce9e4c';
update public.questions set source_quote = '«من حلف بغير الله فقد كفر أو أشرك»' where id = '8a3feed1-0e87-415f-aa2d-fa03bdcd6d64';
update public.questions set source_quote = '«دخل الجنة رجل في ذباب ودخل النار رجل في ذباب»' where id = 'ee68f5c9-03bb-4caf-9383-d47e0637a1db';
update public.questions set source_quote = '«دخل الجنة رجل في ذباب ودخل النار رجل في ذباب»' where id = 'fa79f07c-f0d9-4a92-a28b-ee47d2104c53';
update public.questions set source_quote = '«دخل الجنة رجل في ذباب ودخل النار رجل في ذباب»' where id = '2e2b218a-f71d-4895-b2b9-395db4e4b483';
update public.questions set source_quote = '«دخل الجنة رجل في ذباب ودخل النار رجل في ذباب»' where id = '7bbf72dc-8805-4aa3-bfdd-2eb08cf26244';
update public.questions set source_quote = '«دخل الجنة رجل في ذباب ودخل النار رجل في ذباب»' where id = '683878a9-ad19-4e8f-bbc3-09fa94dc1906';
update public.questions set source_quote = '«دخل الجنة رجل في ذباب ودخل النار رجل في ذباب»' where id = '8d25d864-1e34-416c-8d28-78df561a8036';
update public.questions set source_quote = '«دخل الجنة رجل في ذباب ودخل النار رجل في ذباب»' where id = 'd94cc110-7562-4abd-a741-7fbe304f9d20';
update public.questions set source_quote = '«من تعلق تميمة فقد أشرك»' where id = '9d0fc66c-0113-4603-9da1-241e64b9ca61';
update public.questions set source_quote = '«من علّق تميمة فلا أتم الله له»' where id = 'b8d049a1-9269-448f-b283-a29386643a8e';
update public.questions set source_quote = '«الشرك الأكبر والشرك الأصغر»' where id = 'c549c1de-82ac-4d19-9a1c-f02cc6b3da5a';
update public.questions set source_quote = '«اللهم لا تجعل قبري وثناً يعبد، اشتد غضب الله على قوم اتخذوا قبور أنبيائهم مساجد»' where id = 'fbfb9bfc-051e-4609-aabc-42d625497283';
update public.questions set source_quote = '«الطيرة شرك، الطيرة شرك، وما منا إلا»' where id = 'c326df42-7dd5-45e1-b22e-a9d620f4f136';

commit;
