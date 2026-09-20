CREATE TABLE "class_teacher_assignment_history" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"previous_teacher_id" text,
	"new_teacher_id" text,
	"change_type" text NOT NULL,
	"reason" text,
	"note" text,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_teacher_assignment_history" ADD CONSTRAINT "class_teacher_assignment_history_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignment_history" ADD CONSTRAINT "class_teacher_assignment_history_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignment_history" ADD CONSTRAINT "class_teacher_assignment_history_previous_teacher_id_staff_id_fk" FOREIGN KEY ("previous_teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignment_history" ADD CONSTRAINT "class_teacher_assignment_history_new_teacher_id_staff_id_fk" FOREIGN KEY ("new_teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_teacher_history_class_idx" ON "class_teacher_assignment_history" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_teacher_history_year_idx" ON "class_teacher_assignment_history" USING btree ("academic_year_id");