CREATE TABLE "class_period_subject" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"class_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"period_number" integer NOT NULL,
	"subject_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_period_subject_slot_subject_unique" UNIQUE("academic_year_id","class_id","day_of_week","period_number","subject_key")
);
--> statement-breakpoint
CREATE TABLE "class_period_teacher" (
	"id" text PRIMARY KEY NOT NULL,
	"class_period_subject_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"is_combined_session" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_period_teacher_subject_staff_unique" UNIQUE("class_period_subject_id","staff_id")
);
--> statement-breakpoint
ALTER TABLE "class_period_assignment" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "class_period_assignment" CASCADE;--> statement-breakpoint
ALTER TABLE "class_period_subject" ADD CONSTRAINT "class_period_subject_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_period_subject" ADD CONSTRAINT "class_period_subject_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_period_teacher" ADD CONSTRAINT "class_period_teacher_class_period_subject_id_class_period_subject_id_fk" FOREIGN KEY ("class_period_subject_id") REFERENCES "public"."class_period_subject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_period_teacher" ADD CONSTRAINT "class_period_teacher_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_period_subject_year_idx" ON "class_period_subject" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "class_period_subject_class_idx" ON "class_period_subject" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_period_subject_subject_idx" ON "class_period_subject" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "class_period_teacher_subject_idx" ON "class_period_teacher" USING btree ("class_period_subject_id");--> statement-breakpoint
CREATE INDEX "class_period_teacher_staff_idx" ON "class_period_teacher" USING btree ("staff_id");