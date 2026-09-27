CREATE TABLE "inventory_item_replacement" (
	"id" text PRIMARY KEY NOT NULL,
	"new_item_id" text NOT NULL,
	"retired_item_id" text NOT NULL,
	"note" text,
	"created_by_staff_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_item_replacement_distinct" CHECK ("inventory_item_replacement"."new_item_id" <> "inventory_item_replacement"."retired_item_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_category" ADD COLUMN "icon" text DEFAULT 'category' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "purchase_date" timestamp;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "depreciation_rate_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "voided_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "inventory_item_replacement" ADD CONSTRAINT "inventory_item_replacement_new_item_id_inventory_item_id_fk" FOREIGN KEY ("new_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_replacement" ADD CONSTRAINT "inventory_item_replacement_retired_item_id_inventory_item_id_fk" FOREIGN KEY ("retired_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_replacement" ADD CONSTRAINT "inventory_item_replacement_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_item_replacement_new_item_idx" ON "inventory_item_replacement" USING btree ("new_item_id");--> statement-breakpoint
CREATE INDEX "inventory_item_replacement_retired_item_idx" ON "inventory_item_replacement" USING btree ("retired_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_replacement_unique" ON "inventory_item_replacement" USING btree ("new_item_id","retired_item_id");--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_voided_by_staff_id_staff_id_fk" FOREIGN KEY ("voided_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_item_voided_at_idx" ON "inventory_item" USING btree ("voided_at");--> statement-breakpoint
ALTER TABLE "inventory_category" ADD CONSTRAINT "inventory_category_icon_check" CHECK ("inventory_category"."icon" in ('device-desktop', 'flask', 'ball-basketball', 'video', 'armchair', 'spray', 'chef-hat', 'category'));--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_depreciation_rate_range" CHECK ("inventory_item"."depreciation_rate_percent" is null or ("inventory_item"."depreciation_rate_percent" >= 0 and "inventory_item"."depreciation_rate_percent" <= 100));--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_retirement_or_void" CHECK (not ("inventory_item"."deleted_at" is not null and "inventory_item"."voided_at" is not null));--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_void_reason_required" CHECK ("inventory_item"."voided_at" is null or "inventory_item"."void_reason" is not null);