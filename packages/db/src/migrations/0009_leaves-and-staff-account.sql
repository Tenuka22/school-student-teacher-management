CREATE TABLE "leave_request" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"type" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_staff_id" text,
	"reviewed_at" timestamp,
	"review_comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_reviewed_by_staff_id_staff_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_request_staff_idx" ON "leave_request" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "leave_request_status_idx" ON "leave_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leave_request_start_date_idx" ON "leave_request" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "leave_request_year_idx" ON "leave_request" USING btree ("academic_year_id");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_teacher_service_no_idx" ON "staff" USING btree ("teacher_service_no");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_teacher_service_no_unique" UNIQUE("teacher_service_no");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_unique" UNIQUE("user_id");