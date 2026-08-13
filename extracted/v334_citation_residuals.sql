-- v334 Checker B residuals
BEGIN;
UPDATE public.questions SET source_quote = 'وهل يكب الناس على وجوههم في النار إلا حصائد ألسنتهم', explanation = 'وهل يكب الناس على وجوههم في النار إلا حصائد ألسنتهم' WHERE id = 'a45c0c04-0e89-42f3-a392-f2606b766bf4';
UPDATE public.questions SET source_quote = 'فإن هم أطاعوا لذلك فأخبرهم أن الله قد فرض عليهم صدقة تؤخذ من أغنيائهم فترد على فقرائهم', explanation = 'في وصية النبي ﷺ لمعاذ: «فإن هم أطاعوا لذلك فأخبرهم أن الله قد فرض عليهم صدقة تؤخذ من أغنيائهم فترد على فقرائهم».' WHERE id = 'ee419252-53dc-c1f9-383c-9a3023698050';
COMMIT;
