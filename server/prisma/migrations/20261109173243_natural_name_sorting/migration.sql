-- Hand-written: sort file and folder names the way people expect.
--
-- The default "C" byte order puts every UPPERCASE letter before every lowercase one
-- ("Banana, Cherry, apple"). The ICU root collation sorts alphabetically regardless of
-- case and handles accents ("apple, Banana, Cherry, éclair"). Prisma's schema language
-- can't express column collations, so this lives only in SQL. AWS RDS PostgreSQL ships
-- with ICU too, so this works unchanged in production.
--
-- Indexes on these columns (the case-insensitive unique folder name index and the
-- trigram search index) are rebuilt automatically by ALTER COLUMN.

ALTER TABLE "folders" ALTER COLUMN "name" TYPE VARCHAR(255) COLLATE "und-x-icu";

ALTER TABLE "files" ALTER COLUMN "original_name" TYPE VARCHAR(255) COLLATE "und-x-icu";
