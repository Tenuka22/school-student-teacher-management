ALTER TABLE "files" ADD COLUMN "data" "bytea" NOT NULL;--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "key";