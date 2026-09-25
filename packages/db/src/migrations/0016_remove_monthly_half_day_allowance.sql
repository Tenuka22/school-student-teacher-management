ALTER TABLE "leave_entitlement" DROP CONSTRAINT "leave_entitlement_year_type_unique";--> statement-breakpoint
ALTER TABLE "attendance_policy" DROP COLUMN "half_days_per_month";--> statement-breakpoint
ALTER TABLE "attendance_policy" DROP COLUMN "half_days_per_full_day";--> statement-breakpoint
ALTER TABLE "short_leave_usage" DROP COLUMN "half_days_used";--> statement-breakpoint
UPDATE "leave_request" SET "payment_status" = 'paid' WHERE "type" = 'maternity';--> statement-breakpoint
UPDATE "leave_entitlement" SET "payment_status" = 'paid' WHERE "leave_type" = 'maternity';--> statement-breakpoint
INSERT INTO "leave_entitlement" ("id", "academic_year_id", "leave_type", "payment_status", "max_days", "min_days", "created_at", "updated_at")
SELECT md5("academic_year_id" || ':leave-entitlement:maternity:unpaid'), "academic_year_id", 'maternity', 'unpaid', "max_days", "min_days", now(), now()
FROM "leave_entitlement"
WHERE "leave_type" = 'maternity' AND "payment_status" = 'paid';--> statement-breakpoint
ALTER TABLE "leave_entitlement" ADD CONSTRAINT "leave_entitlement_year_type_payment_unique" UNIQUE("academic_year_id","leave_type","payment_status");