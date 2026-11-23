-- Throwaway performance data for EXPLAIN ANALYZE (database clouddrive_perf only).
-- Heavy user H: 50,000 files, 500 folders, 5,000 share links, 50,000 activity rows.
-- Plus 1,999 other users with 100,000 files, so every query must filter by user.
\set ON_ERROR_STOP on
SELECT setseed(0.42);

INSERT INTO users (id, name, email, password_hash, role, status, storage_used, storage_limit, created_at, updated_at)
SELECT
  CASE WHEN i = 1 THEN '00000000-0000-4000-8000-000000000001'::uuid ELSE gen_random_uuid() END,
  'User ' || i,
  'user' || i || '@example.com',
  'x',
  (CASE WHEN i % 200 = 0 THEN 'ADMIN' ELSE 'USER' END)::"Role",
  (CASE WHEN i % 50 = 0 THEN 'SUSPENDED' ELSE 'ACTIVE' END)::"UserStatus",
  0,
  10995116277760, -- 10 TiB, so the CHECK never gets in the way
  now() - (random() * interval '400 days'),
  now()
FROM generate_series(1, 2000) AS i;

-- Folders: 500 for H, 5 for everyone else.
INSERT INTO folders (id, user_id, parent_id, name, created_at, updated_at)
SELECT gen_random_uuid(), '00000000-0000-4000-8000-000000000001', NULL, 'Folder ' || i, now(), now()
FROM generate_series(1, 500) AS i;
INSERT INTO folders (id, user_id, parent_id, name, created_at, updated_at)
SELECT gen_random_uuid(), u.id, NULL, 'Folder ' || i, now(), now()
FROM users u CROSS JOIN generate_series(1, 5) AS i
WHERE u.id <> '00000000-0000-4000-8000-000000000001';

CREATE TEMP TABLE words(w) AS
SELECT unnest(ARRAY['report','invoice','photo','holiday','budget','contract','notes','scan',
  'design','draft','final','meeting','summary','plan','receipt','backup','logo','video','song','archive']);

-- H's files: 20% in the root, the rest spread over the 500 folders; ~5% in trash.
WITH hf AS (SELECT array_agg(id) AS ids FROM folders WHERE user_id = '00000000-0000-4000-8000-000000000001')
INSERT INTO files (id, user_id, folder_id, original_name, storage_key, mime_type, category, size_bytes, status, deleted_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  CASE WHEN i % 5 = 0 THEN NULL ELSE hf.ids[1 + (i % 500)] END,
  (SELECT w FROM words OFFSET (i * 7) % 20 LIMIT 1) || '-' || i || (ARRAY['.pdf','.png','.mp4','.mp3','.zip','.txt'])[1 + i % 6],
  'perf/h/' || i,
  (ARRAY['application/pdf','image/png','video/mp4','audio/mpeg','application/zip','text/plain'])[1 + i % 6],
  (ARRAY['DOCUMENT','IMAGE','VIDEO','AUDIO','ARCHIVE','DOCUMENT'])[1 + i % 6]::"FileCategory",
  (1000 + random() * 5000000)::bigint,
  (CASE WHEN i % 997 = 0 THEN 'UPLOADING' ELSE 'ACTIVE' END)::"FileStatus",
  CASE WHEN i % 20 = 0 THEN now() - (random() * interval '25 days') ELSE NULL END,
  now() - (random() * interval '700 days'),
  now()
FROM generate_series(1, 50000) AS i, hf;

-- Everyone else: 100,000 files, ~50 each.
WITH others AS (
  SELECT id, row_number() OVER () AS n FROM users WHERE id <> '00000000-0000-4000-8000-000000000001'
)
INSERT INTO files (id, user_id, folder_id, original_name, storage_key, mime_type, category, size_bytes, status, deleted_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  o.id,
  NULL,
  (SELECT w FROM words OFFSET (i * 3) % 20 LIMIT 1) || '-' || i || '.pdf',
  'perf/o/' || i,
  'application/pdf',
  (ARRAY['DOCUMENT','IMAGE','VIDEO','AUDIO','ARCHIVE','OTHER'])[1 + i % 6]::"FileCategory",
  (1000 + random() * 2000000)::bigint,
  'ACTIVE',
  CASE WHEN i % 25 = 0 THEN now() - interval '3 days' ELSE NULL END,
  now() - (random() * interval '700 days'),
  now()
FROM generate_series(1, 100000) AS i
JOIN others o ON o.n = 1 + (i % 1999);

-- Share links: 5,000 for H (60% active, 20% expired, 20% revoked), 20,000 for others.
INSERT INTO shares (id, file_id, token_hash, expires_at, revoked_at, access_count, created_at)
SELECT gen_random_uuid(), f.id, md5(f.id::text) || md5(random()::text),
  CASE WHEN n % 5 = 1 THEN now() - interval '1 day' WHEN n % 3 = 0 THEN NULL ELSE now() + interval '7 days' END,
  CASE WHEN n % 5 = 2 THEN now() - interval '2 days' ELSE NULL END,
  (random() * 20)::int,
  now() - (random() * interval '300 days')
FROM (
  SELECT id, row_number() OVER () AS n FROM files
  WHERE user_id = '00000000-0000-4000-8000-000000000001' ORDER BY random() LIMIT 5000
) f;
INSERT INTO shares (id, file_id, token_hash, expires_at, revoked_at, access_count, created_at)
SELECT gen_random_uuid(), f.id, md5(f.id::text) || md5(random()::text), now() + interval '7 days', NULL, 0,
  now() - (random() * interval '300 days')
FROM (SELECT id FROM files WHERE user_id <> '00000000-0000-4000-8000-000000000001' ORDER BY random() LIMIT 20000) f;

-- Activity: 50,000 for H, 150,000 for others.
INSERT INTO activity_logs (id, user_id, action, target_type, target_id, metadata, created_at)
SELECT gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'FILE_UPLOADED', 'FILE', NULL,
  jsonb_build_object('name', 'file-' || i), now() - (random() * interval '700 days')
FROM generate_series(1, 50000) AS i;
INSERT INTO activity_logs (id, user_id, action, target_type, target_id, metadata, created_at)
SELECT gen_random_uuid(), (SELECT id FROM users OFFSET 1 + (i % 1999) LIMIT 1), 'FILE_UPLOADED', 'FILE', NULL,
  '{}'::jsonb, now() - (random() * interval '700 days')
FROM generate_series(1, 150000) AS i;

-- Quota numbers consistent with the files (as the app keeps them).
UPDATE users u SET storage_used = COALESCE(s.total, 0)
FROM (SELECT user_id, sum(size_bytes) AS total FROM files WHERE status IN ('ACTIVE','UPLOADING') GROUP BY user_id) s
WHERE s.user_id = u.id;

ANALYZE;

SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM folders) AS folders,
       (SELECT count(*) FROM files) AS files, (SELECT count(*) FROM shares) AS shares,
       (SELECT count(*) FROM activity_logs) AS activity;
