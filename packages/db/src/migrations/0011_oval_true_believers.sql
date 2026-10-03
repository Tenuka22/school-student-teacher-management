-- files.key (a MinIO object key) -> files.data (the bytes themselves).
--
-- This used to be `ADD COLUMN "data" bytea NOT NULL` then `DROP COLUMN "key"`,
-- which fails on any database with a row in "files" (a NOT NULL column with no
-- default cannot be added to a populated table) and, had it been forced
-- through, would have dropped every object key before the images were copied
-- out of MinIO (M11). Now nothing is dropped until every row carries its bytes:
--
--   1. add "data" as a NULLable column (a no-op if the backfill script already
--      added it);
--   2. refuse, with a count, while any row has no bytes or bytes whose length
--      differs from the recorded "size" (both were written by the same upload,
--      so a mismatch is a truncated or wrong object);
--   3. only then make "data" NOT NULL and drop "key".
--
-- drizzle applies a pending batch in one transaction, so a refusal at step 2
-- rolls back step 1 as well and leaves "key" exactly as it was. An empty
-- table passes straight through. On a database with uploaded photos, run
-- `bun scripts/backfill-file-bytes.ts --apply` against the old object store
-- first (docs/operations.md, "Migration 0011").
--
-- Editing an applied migration is safe here only because drizzle selects
-- pending migrations by their journal timestamp, not by this file's hash: a
-- database that already applied the original 0011 skips this one.
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "data" bytea;--> statement-breakpoint
DO $$
DECLARE
  missing bigint;
  mismatched bigint;
BEGIN
  SELECT count(*) INTO missing FROM "files" WHERE "data" IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'migration 0011: % row(s) in "files" have no image bytes yet; nothing was changed. Copy them from the old object store with scripts/backfill-file-bytes.ts first (docs/operations.md, "Migration 0011").', missing;
  END IF;
  SELECT count(*) INTO mismatched FROM "files" WHERE octet_length("data") <> "size";
  IF mismatched > 0 THEN
    RAISE EXCEPTION 'migration 0011: % row(s) in "files" hold bytes whose length differs from their recorded size; nothing was changed. Re-run scripts/backfill-file-bytes.ts and inspect the rows it reports.', mismatched;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "data" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN IF EXISTS "key";
