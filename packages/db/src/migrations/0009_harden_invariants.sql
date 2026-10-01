-- ─────────────────────────────────────────────────────────────────────────────
-- Forensic-audit repair (F-01 audit trail, F-09 single current year, F-31
-- leave/timetable CHECKs). New invariants only; no data is changed.
--
-- Pre-flight: a database already holding a row the new constraints forbid
-- stops here with the counts and nothing applied, rather than failing on an
-- anonymous constraint error halfway through. Correct the rows, then re-run.
-- On a fresh database every count is zero.
-- ─────────────────────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  current_years bigint;
  retired_current bigint;
  bad_leave bigint;
  bad_slots bigint;
BEGIN
  SELECT count(*) INTO current_years FROM "academic_year" WHERE "is_current";
  SELECT count(*) INTO retired_current FROM "academic_year" WHERE "is_current" AND "deleted_at" IS NOT NULL;
  SELECT count(*) INTO bad_leave FROM "leave_request" WHERE NOT (
       "status" IN ('pending', 'recommended', 'approved', 'rejected', 'cancelled')
   AND "deputy_status" IN ('pending', 'recommended', 'rejected')
   AND "final_status" IN ('pending', 'approved', 'rejected')
   AND "day_part" IN ('full', 'morning', 'afternoon')
   AND "payment_status" IN ('notApplicable', 'paid', 'halfPay', 'unpaid')
   AND "type" IN ('annual', 'casual', 'medical', 'maternity', 'duty', 'other')
   AND "start_date" <= "end_date");
  SELECT count(*) INTO bad_slots FROM "class_period_subject"
    WHERE "day_of_week" NOT BETWEEN 1 AND 5 OR "period_number" NOT BETWEEN 1 AND 8;
  IF current_years > 1 OR retired_current > 0 OR bad_leave > 0 OR bad_slots > 0 THEN
    RAISE EXCEPTION 'migration 0009 refused: % current academic year(s) (at most 1 allowed), % retired year(s) marked current, % leave request(s) with an unknown status/type/day part/payment status or end before start, % timetable slot(s) outside Mon-Fri / periods 1-8. Correct them by hand; nothing has been changed.',
      current_years, retired_current, bad_leave, bad_slots;
  END IF;
END
$preflight$;
--> statement-breakpoint
CREATE TABLE "account_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_role" text,
	"action" text NOT NULL,
	"target_user_id" text,
	"outcome" text NOT NULL,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_audit_log_created_at_idx" ON "account_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_audit_log_target_idx" ON "account_audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "leave_request_staff_year_idx" ON "leave_request" USING btree ("staff_id","academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_year_single_current" ON "academic_year" USING btree ("is_current") WHERE "academic_year"."is_current";--> statement-breakpoint
ALTER TABLE "class_period_subject" ADD CONSTRAINT "class_period_subject_day_range" CHECK ("class_period_subject"."day_of_week" between 1 and 5);--> statement-breakpoint
ALTER TABLE "class_period_subject" ADD CONSTRAINT "class_period_subject_period_range" CHECK ("class_period_subject"."period_number" between 1 and 8);--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_status_check" CHECK ("leave_request"."status" in ('pending', 'recommended', 'approved', 'rejected', 'cancelled'));--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_deputy_status_check" CHECK ("leave_request"."deputy_status" in ('pending', 'recommended', 'rejected'));--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_final_status_check" CHECK ("leave_request"."final_status" in ('pending', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_day_part_check" CHECK ("leave_request"."day_part" in ('full', 'morning', 'afternoon'));--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_payment_status_check" CHECK ("leave_request"."payment_status" in ('notApplicable', 'paid', 'halfPay', 'unpaid'));--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_type_check" CHECK ("leave_request"."type" in ('annual', 'casual', 'medical', 'maternity', 'duty', 'other'));--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_date_order" CHECK ("leave_request"."start_date" <= "leave_request"."end_date");--> statement-breakpoint
ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_current_not_deleted" CHECK (not ("academic_year"."is_current" and "academic_year"."deleted_at" is not null));