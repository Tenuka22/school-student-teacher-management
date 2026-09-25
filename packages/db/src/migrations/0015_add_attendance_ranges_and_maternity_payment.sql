ALTER TABLE "attendance_policy" ADD COLUMN "primary_start_period_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policy" ADD COLUMN "primary_end_period_number" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policy" ADD COLUMN "secondary_start_period_number" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policy" ADD COLUMN "secondary_end_period_number" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_entitlement" ADD COLUMN "payment_status" text DEFAULT 'notApplicable' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "payment_status" text DEFAULT 'notApplicable' NOT NULL;