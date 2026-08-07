-- De-dupe remaining near-exact question clones (2026-08-07 pass 2)
-- Removed 25 redundant questions from local bank (620 → 595)
-- Safe to re-run. Keeps distinct vocab/ayah-dalil and clear pedagogical TF/MC variants.

BEGIN;

DELETE FROM user_wrong_questions WHERE question_id IN (
  '4e540c82-3a77-a75b-137a-87a1b044e11e'::uuid,
  'fe16701e-bf4a-02c3-57d8-098881c6ce96'::uuid,
  '34fd6a3d-8941-bdc7-183d-befa51c7383e'::uuid,
  '231ef2e8-a6b0-46f3-a316-6a096ce1f9e5'::uuid,
  '5f621958-f445-7f88-ad0c-5c03df015174'::uuid,
  'f79655d5-82c0-2a1b-da81-fdf05ddb1bc4'::uuid,
  '016efb22-7cd1-5fac-7ee9-81dc44fb4b86'::uuid,
  'eaf771c4-2e3a-189e-914d-467ac2152606'::uuid,
  '78b94458-c41e-fef3-c753-bc07461e70ca'::uuid,
  '3e47a9fe-c7e6-dcf2-f438-0c1e1f34d5e7'::uuid,
  'bbea7d4e-9ef5-8a47-0a3d-959c130cff26'::uuid,
  '6b55c505-0bec-7eb2-b6be-2d357037a18d'::uuid,
  'c7a41f7c-b2c7-7aab-52f2-309427d54eca'::uuid,
  '273325cc-3317-b858-7edb-2092623c7d6c'::uuid,
  'c3e372a6-b6e9-ef74-e1e6-05ec4e5b612d'::uuid,
  'cbb38f30-a90a-4715-93ff-e7e09968daaf'::uuid,
  'df956b78-9b23-75ff-c8ef-ea93078d672e'::uuid,
  '64ea9fa9-b63d-2267-8cff-3b7cd76a4dfe'::uuid,
  '76375071-036f-a33d-73b7-08f5793cf4a3'::uuid,
  '5bbedb2b-27b7-6623-c968-117bf9800743'::uuid,
  'c084f548-0f46-76c0-78de-42b03b18c9c7'::uuid,
  '87016097-93d0-89be-2b9a-bce36b2a820b'::uuid,
  '95aa3249-3986-447e-9686-cead1d5540a6'::uuid,
  'cb21e26c-43d2-403f-b059-750a049578b0'::uuid,
  '9cbdcac3-b1f3-6ae9-02d7-f577eae4f53f'::uuid
);

DELETE FROM question_stats WHERE question_id IN (
  '4e540c82-3a77-a75b-137a-87a1b044e11e'::uuid,
  'fe16701e-bf4a-02c3-57d8-098881c6ce96'::uuid,
  '34fd6a3d-8941-bdc7-183d-befa51c7383e'::uuid,
  '231ef2e8-a6b0-46f3-a316-6a096ce1f9e5'::uuid,
  '5f621958-f445-7f88-ad0c-5c03df015174'::uuid,
  'f79655d5-82c0-2a1b-da81-fdf05ddb1bc4'::uuid,
  '016efb22-7cd1-5fac-7ee9-81dc44fb4b86'::uuid,
  'eaf771c4-2e3a-189e-914d-467ac2152606'::uuid,
  '78b94458-c41e-fef3-c753-bc07461e70ca'::uuid,
  '3e47a9fe-c7e6-dcf2-f438-0c1e1f34d5e7'::uuid,
  'bbea7d4e-9ef5-8a47-0a3d-959c130cff26'::uuid,
  '6b55c505-0bec-7eb2-b6be-2d357037a18d'::uuid,
  'c7a41f7c-b2c7-7aab-52f2-309427d54eca'::uuid,
  '273325cc-3317-b858-7edb-2092623c7d6c'::uuid,
  'c3e372a6-b6e9-ef74-e1e6-05ec4e5b612d'::uuid,
  'cbb38f30-a90a-4715-93ff-e7e09968daaf'::uuid,
  'df956b78-9b23-75ff-c8ef-ea93078d672e'::uuid,
  '64ea9fa9-b63d-2267-8cff-3b7cd76a4dfe'::uuid,
  '76375071-036f-a33d-73b7-08f5793cf4a3'::uuid,
  '5bbedb2b-27b7-6623-c968-117bf9800743'::uuid,
  'c084f548-0f46-76c0-78de-42b03b18c9c7'::uuid,
  '87016097-93d0-89be-2b9a-bce36b2a820b'::uuid,
  '95aa3249-3986-447e-9686-cead1d5540a6'::uuid,
  'cb21e26c-43d2-403f-b059-750a049578b0'::uuid,
  '9cbdcac3-b1f3-6ae9-02d7-f577eae4f53f'::uuid
);

DELETE FROM questions WHERE id IN (
  '4e540c82-3a77-a75b-137a-87a1b044e11e'::uuid,
  'fe16701e-bf4a-02c3-57d8-098881c6ce96'::uuid,
  '34fd6a3d-8941-bdc7-183d-befa51c7383e'::uuid,
  '231ef2e8-a6b0-46f3-a316-6a096ce1f9e5'::uuid,
  '5f621958-f445-7f88-ad0c-5c03df015174'::uuid,
  'f79655d5-82c0-2a1b-da81-fdf05ddb1bc4'::uuid,
  '016efb22-7cd1-5fac-7ee9-81dc44fb4b86'::uuid,
  'eaf771c4-2e3a-189e-914d-467ac2152606'::uuid,
  '78b94458-c41e-fef3-c753-bc07461e70ca'::uuid,
  '3e47a9fe-c7e6-dcf2-f438-0c1e1f34d5e7'::uuid,
  'bbea7d4e-9ef5-8a47-0a3d-959c130cff26'::uuid,
  '6b55c505-0bec-7eb2-b6be-2d357037a18d'::uuid,
  'c7a41f7c-b2c7-7aab-52f2-309427d54eca'::uuid,
  '273325cc-3317-b858-7edb-2092623c7d6c'::uuid,
  'c3e372a6-b6e9-ef74-e1e6-05ec4e5b612d'::uuid,
  'cbb38f30-a90a-4715-93ff-e7e09968daaf'::uuid,
  'df956b78-9b23-75ff-c8ef-ea93078d672e'::uuid,
  '64ea9fa9-b63d-2267-8cff-3b7cd76a4dfe'::uuid,
  '76375071-036f-a33d-73b7-08f5793cf4a3'::uuid,
  '5bbedb2b-27b7-6623-c968-117bf9800743'::uuid,
  'c084f548-0f46-76c0-78de-42b03b18c9c7'::uuid,
  '87016097-93d0-89be-2b9a-bce36b2a820b'::uuid,
  '95aa3249-3986-447e-9686-cead1d5540a6'::uuid,
  'cb21e26c-43d2-403f-b059-750a049578b0'::uuid,
  '9cbdcac3-b1f3-6ae9-02d7-f577eae4f53f'::uuid
);

COMMIT;
