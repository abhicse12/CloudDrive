-- Hand-written database rules that Prisma's schema language cannot express.
-- They are the LAST line of defence: even if application code has a bug, PostgreSQL
-- refuses to store data that breaks these rules.

-- ─── users ──────────────────────────────────────────────────────────────────

-- Quota can never go negative or above the limit. The upload service reserves quota
-- with a conditional UPDATE; this CHECK guarantees correctness even under a bug/race.
ALTER TABLE "users"
  ADD CONSTRAINT "users_storage_used_check"
  CHECK ("storage_used" >= 0 AND "storage_used" <= "storage_limit");

ALTER TABLE "users"
  ADD CONSTRAINT "users_storage_limit_check"
  CHECK ("storage_limit" >= 0);

-- Emails are normalised to lower case before saving, so "A@x.com" and "a@x.com"
-- can never become two different accounts.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_check"
  CHECK ("email" = lower("email"));

ALTER TABLE "users"
  ADD CONSTRAINT "users_name_not_blank_check"
  CHECK (length(btrim("name")) > 0);

-- ─── folders ────────────────────────────────────────────────────────────────

ALTER TABLE "folders"
  ADD CONSTRAINT "folders_name_not_blank_check"
  CHECK (length(btrim("name")) > 0);

-- A folder cannot be its own parent. (Deeper cycles, A → B → A, are prevented by the
-- folder service using a recursive query, which a CHECK cannot do.)
ALTER TABLE "folders"
  ADD CONSTRAINT "folders_not_own_parent_check"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- Folder names are unique within the same parent folder:
--   * lower("name")   → case-insensitive ("Photos" and "photos" clash)
--   * COALESCE(...)   → PostgreSQL treats NULLs as all different, so without this,
--                       duplicate names would be allowed at the root (parent_id IS NULL)
--   * WHERE deleted_at IS NULL → a trashed "Photos" doesn't block creating a new one
CREATE UNIQUE INDEX "folders_user_parent_name_unique"
  ON "folders" (
    "user_id",
    COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),
    lower("name")
  )
  WHERE "deleted_at" IS NULL;

-- ─── files ──────────────────────────────────────────────────────────────────

ALTER TABLE "files"
  ADD CONSTRAINT "files_size_bytes_check"
  CHECK ("size_bytes" >= 0);

ALTER TABLE "files"
  ADD CONSTRAINT "files_original_name_not_blank_check"
  CHECK (length(btrim("original_name")) > 0);

-- ─── shares ─────────────────────────────────────────────────────────────────

ALTER TABLE "shares"
  ADD CONSTRAINT "shares_access_count_check"
  CHECK ("access_count" >= 0);
