ALTER TABLE "academic_year" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "image_file_id" text;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;