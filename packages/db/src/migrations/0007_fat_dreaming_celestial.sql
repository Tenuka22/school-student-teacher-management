CREATE TABLE "teacher_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"marked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_attendance_staff_date_unique" UNIQUE("staff_id","date")
);
--> statement-breakpoint
CREATE TABLE "teacher_period_absence" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_attendance_id" text NOT NULL,
	"period_number" integer NOT NULL,
	"reason" text NOT NULL,
	"substitute_staff_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_period_absence_unique" UNIQUE("teacher_attendance_id","period_number")
);
--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_period_absence" ADD CONSTRAINT "teacher_period_absence_teacher_attendance_id_teacher_attendance_id_fk" FOREIGN KEY ("teacher_attendance_id") REFERENCES "public"."teacher_attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_period_absence" ADD CONSTRAINT "teacher_period_absence_substitute_staff_id_staff_id_fk" FOREIGN KEY ("substitute_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teacher_attendance_staff_idx" ON "teacher_attendance" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "teacher_attendance_date_idx" ON "teacher_attendance" USING btree ("date");--> statement-breakpoint
CREATE INDEX "teacher_attendance_year_idx" ON "teacher_attendance" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "teacher_period_absence_attendance_idx" ON "teacher_period_absence" USING btree ("teacher_attendance_id");--> statement-breakpoint
CREATE INDEX "teacher_period_absence_substitute_idx" ON "teacher_period_absence" USING btree ("substitute_staff_id");