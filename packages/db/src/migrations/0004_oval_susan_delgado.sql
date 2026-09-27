CREATE TABLE "inventory_custody_notice_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"custody_history_id" text NOT NULL,
	"staff_id" text,
	"role" text NOT NULL,
	"acknowledged_at" timestamp,
	"disputed_at" timestamp,
	"dispute_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_custody_notice_recipient_role_check" CHECK ("inventory_custody_notice_recipient"."role" in ('manager', 'previous_custodian', 'sub_manager')),
	CONSTRAINT "inventory_custody_notice_recipient_dispute_note_required" CHECK ("inventory_custody_notice_recipient"."disputed_at" is null or "inventory_custody_notice_recipient"."dispute_note" is not null),
	CONSTRAINT "inventory_custody_notice_recipient_dispute_implies_ack" CHECK ("inventory_custody_notice_recipient"."disputed_at" is null or "inventory_custody_notice_recipient"."acknowledged_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP CONSTRAINT "inventory_custody_history_dispute_note_required";--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP CONSTRAINT "inventory_custody_history_dispute_implies_ack";--> statement-breakpoint
DROP INDEX "inventory_custody_history_unacknowledged_idx";--> statement-breakpoint
ALTER TABLE "inventory_custody_notice_recipient" ADD CONSTRAINT "inventory_custody_notice_recipient_custody_history_id_inventory_custody_history_id_fk" FOREIGN KEY ("custody_history_id") REFERENCES "public"."inventory_custody_history"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_notice_recipient" ADD CONSTRAINT "inventory_custody_notice_recipient_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_custody_notice_recipient_history_idx" ON "inventory_custody_notice_recipient" USING btree ("custody_history_id");--> statement-breakpoint
CREATE INDEX "inventory_custody_notice_recipient_unacknowledged_idx" ON "inventory_custody_notice_recipient" USING btree ("staff_id","created_at") WHERE "inventory_custody_notice_recipient"."acknowledged_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_custody_notice_recipient_unique" ON "inventory_custody_notice_recipient" USING btree ("custody_history_id","staff_id");--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP COLUMN "acknowledged_at";--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP COLUMN "disputed_at";--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP COLUMN "dispute_note";