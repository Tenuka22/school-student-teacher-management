CREATE TABLE "attendance_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"arrival_cutoff_time" text DEFAULT '07:30' NOT NULL,
	"short_leaves_per_month" integer DEFAULT 2 NOT NULL,
	"half_days_per_month" integer DEFAULT 2 NOT NULL,
	"half_days_per_full_day" numeric DEFAULT '2' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_policy_year_unique" UNIQUE("academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "short_leave_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"year_month" text NOT NULL,
	"short_leaves_used" integer DEFAULT 0 NOT NULL,
	"half_days_used" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "short_leave_usage_staff_month_unique" UNIQUE("staff_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "leave_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"leave_type" text NOT NULL,
	"max_days" integer NOT NULL,
	"min_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leave_entitlement_year_type_unique" UNIQUE("academic_year_id","leave_type")
);
--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "deputy_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "deputy_staff_id" text;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "deputy_acted_at" timestamp;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "deputy_comment" text;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "final_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "principal_staff_id" text;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "principal_acted_at" timestamp;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "principal_comment" text;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "finalized_at" timestamp;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "staff_category" text DEFAULT 'teacher' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policy" ADD CONSTRAINT "attendance_policy_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_leave_usage" ADD CONSTRAINT "short_leave_usage_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_leave_usage" ADD CONSTRAINT "short_leave_usage_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_entitlement" ADD CONSTRAINT "leave_entitlement_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "short_leave_usage_year_idx" ON "short_leave_usage" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "leave_entitlement_year_idx" ON "leave_entitlement" USING btree ("academic_year_id");--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_deputy_staff_id_staff_id_fk" FOREIGN KEY ("deputy_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_principal_staff_id_staff_id_fk" FOREIGN KEY ("principal_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_request_deputy_status_idx" ON "leave_request" USING btree ("deputy_status");--> statement-breakpoint
CREATE INDEX "leave_request_final_status_idx" ON "leave_request" USING btree ("final_status");