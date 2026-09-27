CREATE TABLE "inventory_custody_request" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"requester_staff_id" text NOT NULL,
	"custodian_staff_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"decided_by_staff_id" text,
	"decided_at" timestamp,
	"decision_note" text,
	CONSTRAINT "inventory_custody_request_status_check" CHECK ("inventory_custody_request"."status" in ('pending', 'approved', 'denied', 'cancelled')),
	CONSTRAINT "inventory_custody_request_requester_not_custodian" CHECK ("inventory_custody_request"."requester_staff_id" <> "inventory_custody_request"."custodian_staff_id"),
	CONSTRAINT "inventory_custody_request_decision_state" CHECK (("inventory_custody_request"."decided_by_staff_id" is null) = ("inventory_custody_request"."decided_at" is null)),
	CONSTRAINT "inventory_custody_request_status_state" CHECK ((
        "inventory_custody_request"."status" = 'pending'
        and "inventory_custody_request"."decided_by_staff_id" is null
        and "inventory_custody_request"."decided_at" is null
      ) or (
        "inventory_custody_request"."status" in ('approved', 'denied', 'cancelled')
        and "inventory_custody_request"."decided_by_staff_id" is not null
        and "inventory_custody_request"."decided_at" is not null
      ))
);
--> statement-breakpoint
ALTER TABLE "inventory_custody_request" ADD CONSTRAINT "inventory_custody_request_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_request" ADD CONSTRAINT "inventory_custody_request_requester_staff_id_staff_id_fk" FOREIGN KEY ("requester_staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_request" ADD CONSTRAINT "inventory_custody_request_custodian_staff_id_staff_id_fk" FOREIGN KEY ("custodian_staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_request" ADD CONSTRAINT "inventory_custody_request_decided_by_staff_id_staff_id_fk" FOREIGN KEY ("decided_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_custody_request_item_idx" ON "inventory_custody_request" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_custody_request_requester_idx" ON "inventory_custody_request" USING btree ("requester_staff_id");--> statement-breakpoint
CREATE INDEX "inventory_custody_request_custodian_pending_idx" ON "inventory_custody_request" USING btree ("custodian_staff_id","requested_at") WHERE "inventory_custody_request"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_custody_request_open_unique" ON "inventory_custody_request" USING btree ("item_id","requester_staff_id") WHERE "inventory_custody_request"."status" = 'pending';