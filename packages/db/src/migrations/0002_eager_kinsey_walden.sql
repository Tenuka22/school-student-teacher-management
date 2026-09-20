CREATE TABLE "class_period_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"class_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"period_number" integer NOT NULL,
	"subject_key" text NOT NULL,
	"staff_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_period_assignment_class_slot_unique" UNIQUE("academic_year_id","class_id","day_of_week","period_number"),
	CONSTRAINT "class_period_assignment_teacher_slot_unique" UNIQUE("academic_year_id","staff_id","day_of_week","period_number")
);
--> statement-breakpoint
CREATE TABLE "period_config" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"period_number" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "period_config_unique" UNIQUE("academic_year_id","period_number")
);
--> statement-breakpoint
ALTER TABLE "class_period_assignment" ADD CONSTRAINT "class_period_assignment_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_period_assignment" ADD CONSTRAINT "class_period_assignment_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_period_assignment" ADD CONSTRAINT "class_period_assignment_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_config" ADD CONSTRAINT "period_config_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_period_assignment_year_idx" ON "class_period_assignment" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "class_period_assignment_class_idx" ON "class_period_assignment" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_period_assignment_staff_idx" ON "class_period_assignment" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "class_period_assignment_subject_idx" ON "class_period_assignment" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "period_config_year_idx" ON "period_config" USING btree ("academic_year_id");