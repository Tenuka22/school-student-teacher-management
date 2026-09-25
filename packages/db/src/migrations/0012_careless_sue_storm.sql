DELETE FROM "teacher_attendance" WHERE "status" IN ('present', 'lateShortLeave');--> statement-breakpoint
ALTER TABLE "teacher_attendance" DROP CONSTRAINT "teacher_attendance_staff_date_unique";--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD COLUMN "leave_request_id" text;--> statement-breakpoint
ALTER TABLE "leave_request" ADD COLUMN "day_part" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_leave_request_id_leave_request_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_staff_year_date_unique" UNIQUE("staff_id","academic_year_id","date");