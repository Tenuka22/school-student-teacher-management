CREATE TABLE "teacher_subject_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"subject_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_subject_assignment_unique" UNIQUE("staff_id","academic_year_id","subject_key")
);
--> statement-breakpoint
ALTER TABLE "teacher_subject_assignment" ADD CONSTRAINT "teacher_subject_assignment_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subject_assignment" ADD CONSTRAINT "teacher_subject_assignment_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teacher_subject_assignment_staff_year_idx" ON "teacher_subject_assignment" USING btree ("staff_id","academic_year_id");