ALTER TABLE "inventory_audit_log" DROP CONSTRAINT "inventory_audit_log_actor_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_borrow" DROP CONSTRAINT "inventory_borrow_borrower_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_borrow" DROP CONSTRAINT "inventory_borrow_borrowed_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_borrow" DROP CONSTRAINT "inventory_borrow_returned_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP CONSTRAINT "inventory_custody_history_previous_custodian_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP CONSTRAINT "inventory_custody_history_new_custodian_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP CONSTRAINT "inventory_custody_history_previous_manager_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP CONSTRAINT "inventory_custody_history_new_manager_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_custody_history" DROP CONSTRAINT "inventory_custody_history_changed_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_custody_notice_recipient" DROP CONSTRAINT "inventory_custody_notice_recipient_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_custody_request" DROP CONSTRAINT "inventory_custody_request_requester_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_custody_request" DROP CONSTRAINT "inventory_custody_request_custodian_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_custody_request" DROP CONSTRAINT "inventory_custody_request_decided_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_disposal" DROP CONSTRAINT "inventory_disposal_requested_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_disposal" DROP CONSTRAINT "inventory_disposal_approved_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_disposal" DROP CONSTRAINT "inventory_disposal_finalized_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_disposal" DROP CONSTRAINT "inventory_disposal_cancelled_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_disposal_status_history" DROP CONSTRAINT "inventory_disposal_status_history_changed_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_issue" DROP CONSTRAINT "inventory_issue_issued_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT "inventory_item_created_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT "inventory_item_manager_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT "inventory_item_custodian_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT "inventory_item_voided_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_item_replacement" DROP CONSTRAINT "inventory_item_replacement_created_by_staff_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transaction" DROP CONSTRAINT "inventory_transaction_actor_staff_id_user_id_fk";
--> statement-breakpoint
-- ─────────────────────────────────────────────────────────────────────────────
-- The data remap, and why this file is not only constraint surgery.
--
-- Every one of the twenty-five foreign keys dropped above pointed at
-- `user(id)`, and the code has written `staff.id` into those columns since the
-- 6f6e38b change was reverted. The rows in the database therefore hold user ids
-- where the schema now says staff ids, and the constraints re-added at the bottom
-- of this file would be violated by existing data the moment they were created.
--
-- The mapping is mechanical rather than clever: `staff.user_id` is the column that
-- joins a staff record to its login, every account in this school has a staff row
-- (`ensureBootstrapAccount` in `packages/auth/src/admin.ts`), and every stored
-- value resolves through it. `WHERE s.user_id = t.<column>` is also idempotent —
-- a value that is *already* a staff id matches no `user_id`, so re-running the
-- migration is a no-op on rows it has already fixed.
--
-- The assertion below is the part that matters: if a value resolves to neither
-- key space, this raises and the transaction rolls back with the constraints still
-- dropped, rather than a half-applied migration leaving a table whose foreign keys
-- quietly do not describe its data.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "inventory_audit_log" t SET "actor_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.actor_staff_id;--> statement-breakpoint
UPDATE "inventory_borrow" t SET "borrower_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.borrower_staff_id;--> statement-breakpoint
UPDATE "inventory_borrow" t SET "borrowed_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.borrowed_by_staff_id;--> statement-breakpoint
UPDATE "inventory_borrow" t SET "returned_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.returned_by_staff_id;--> statement-breakpoint
UPDATE "inventory_custody_history" t SET "previous_custodian_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.previous_custodian_staff_id;--> statement-breakpoint
UPDATE "inventory_custody_history" t SET "new_custodian_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.new_custodian_staff_id;--> statement-breakpoint
UPDATE "inventory_custody_history" t SET "previous_manager_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.previous_manager_staff_id;--> statement-breakpoint
UPDATE "inventory_custody_history" t SET "new_manager_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.new_manager_staff_id;--> statement-breakpoint
UPDATE "inventory_custody_history" t SET "changed_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.changed_by_staff_id;--> statement-breakpoint
UPDATE "inventory_custody_notice_recipient" t SET "staff_id" = s.id FROM "staff" s WHERE s.user_id = t.staff_id;--> statement-breakpoint
UPDATE "inventory_custody_request" t SET "requester_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.requester_staff_id;--> statement-breakpoint
UPDATE "inventory_custody_request" t SET "custodian_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.custodian_staff_id;--> statement-breakpoint
UPDATE "inventory_custody_request" t SET "decided_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.decided_by_staff_id;--> statement-breakpoint
UPDATE "inventory_disposal" t SET "requested_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.requested_by_staff_id;--> statement-breakpoint
UPDATE "inventory_disposal" t SET "approved_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.approved_by_staff_id;--> statement-breakpoint
UPDATE "inventory_disposal" t SET "finalized_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.finalized_by_staff_id;--> statement-breakpoint
UPDATE "inventory_disposal" t SET "cancelled_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.cancelled_by_staff_id;--> statement-breakpoint
UPDATE "inventory_disposal_status_history" t SET "changed_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.changed_by_staff_id;--> statement-breakpoint
UPDATE "inventory_issue" t SET "issued_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.issued_by_staff_id;--> statement-breakpoint
UPDATE "inventory_item" t SET "created_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.created_by_staff_id;--> statement-breakpoint
UPDATE "inventory_item" t SET "manager_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.manager_staff_id;--> statement-breakpoint
UPDATE "inventory_item" t SET "custodian_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.custodian_staff_id;--> statement-breakpoint
UPDATE "inventory_item" t SET "voided_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.voided_by_staff_id;--> statement-breakpoint
UPDATE "inventory_item_replacement" t SET "created_by_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.created_by_staff_id;--> statement-breakpoint
UPDATE "inventory_transaction" t SET "actor_staff_id" = s.id FROM "staff" s WHERE s.user_id = t.actor_staff_id;--> statement-breakpoint
DO $remap$
DECLARE
  orphan text;
BEGIN
  SELECT format(
           '%s.%s holds %s value(s) that are neither a staff id nor remappable',
           c.table_name, c.column_name, c.orphans
         )
    INTO orphan
    FROM (
      SELECT 'inventory_audit_log' AS table_name, 'actor_staff_id' AS column_name, count(*) AS orphans FROM "inventory_audit_log" t WHERE t.actor_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.actor_staff_id)
      UNION ALL SELECT 'inventory_borrow', 'borrower_staff_id', count(*) FROM "inventory_borrow" t WHERE t.borrower_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.borrower_staff_id)
      UNION ALL SELECT 'inventory_borrow', 'borrowed_by_staff_id', count(*) FROM "inventory_borrow" t WHERE t.borrowed_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.borrowed_by_staff_id)
      UNION ALL SELECT 'inventory_borrow', 'returned_by_staff_id', count(*) FROM "inventory_borrow" t WHERE t.returned_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.returned_by_staff_id)
      UNION ALL SELECT 'inventory_custody_history', 'previous_custodian_staff_id', count(*) FROM "inventory_custody_history" t WHERE t.previous_custodian_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.previous_custodian_staff_id)
      UNION ALL SELECT 'inventory_custody_history', 'new_custodian_staff_id', count(*) FROM "inventory_custody_history" t WHERE t.new_custodian_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.new_custodian_staff_id)
      UNION ALL SELECT 'inventory_custody_history', 'previous_manager_staff_id', count(*) FROM "inventory_custody_history" t WHERE t.previous_manager_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.previous_manager_staff_id)
      UNION ALL SELECT 'inventory_custody_history', 'new_manager_staff_id', count(*) FROM "inventory_custody_history" t WHERE t.new_manager_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.new_manager_staff_id)
      UNION ALL SELECT 'inventory_custody_history', 'changed_by_staff_id', count(*) FROM "inventory_custody_history" t WHERE t.changed_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.changed_by_staff_id)
      UNION ALL SELECT 'inventory_custody_notice_recipient', 'staff_id', count(*) FROM "inventory_custody_notice_recipient" t WHERE t.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.staff_id)
      UNION ALL SELECT 'inventory_custody_request', 'requester_staff_id', count(*) FROM "inventory_custody_request" t WHERE t.requester_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.requester_staff_id)
      UNION ALL SELECT 'inventory_custody_request', 'custodian_staff_id', count(*) FROM "inventory_custody_request" t WHERE t.custodian_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.custodian_staff_id)
      UNION ALL SELECT 'inventory_custody_request', 'decided_by_staff_id', count(*) FROM "inventory_custody_request" t WHERE t.decided_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.decided_by_staff_id)
      UNION ALL SELECT 'inventory_disposal', 'requested_by_staff_id', count(*) FROM "inventory_disposal" t WHERE t.requested_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.requested_by_staff_id)
      UNION ALL SELECT 'inventory_disposal', 'approved_by_staff_id', count(*) FROM "inventory_disposal" t WHERE t.approved_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.approved_by_staff_id)
      UNION ALL SELECT 'inventory_disposal', 'finalized_by_staff_id', count(*) FROM "inventory_disposal" t WHERE t.finalized_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.finalized_by_staff_id)
      UNION ALL SELECT 'inventory_disposal', 'cancelled_by_staff_id', count(*) FROM "inventory_disposal" t WHERE t.cancelled_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.cancelled_by_staff_id)
      UNION ALL SELECT 'inventory_disposal_status_history', 'changed_by_staff_id', count(*) FROM "inventory_disposal_status_history" t WHERE t.changed_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.changed_by_staff_id)
      UNION ALL SELECT 'inventory_issue', 'issued_by_staff_id', count(*) FROM "inventory_issue" t WHERE t.issued_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.issued_by_staff_id)
      UNION ALL SELECT 'inventory_item', 'created_by_staff_id', count(*) FROM "inventory_item" t WHERE t.created_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.created_by_staff_id)
      UNION ALL SELECT 'inventory_item', 'manager_staff_id', count(*) FROM "inventory_item" t WHERE t.manager_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.manager_staff_id)
      UNION ALL SELECT 'inventory_item', 'custodian_staff_id', count(*) FROM "inventory_item" t WHERE t.custodian_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.custodian_staff_id)
      UNION ALL SELECT 'inventory_item', 'voided_by_staff_id', count(*) FROM "inventory_item" t WHERE t.voided_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.voided_by_staff_id)
      UNION ALL SELECT 'inventory_item_replacement', 'created_by_staff_id', count(*) FROM "inventory_item_replacement" t WHERE t.created_by_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.created_by_staff_id)
      UNION ALL SELECT 'inventory_transaction', 'actor_staff_id', count(*) FROM "inventory_transaction" t WHERE t.actor_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.actor_staff_id)
    ) AS c
   WHERE c.orphans > 0
   LIMIT 1;

  IF orphan IS NOT NULL THEN
    RAISE EXCEPTION 'inventory staff pointers do not resolve: %', orphan;
  END IF;
END
$remap$;
--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "nic" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "manager_staff_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "custodian_staff_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_audit_log" ADD CONSTRAINT "inventory_audit_log_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow" ADD CONSTRAINT "inventory_borrow_borrower_staff_id_staff_id_fk" FOREIGN KEY ("borrower_staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow" ADD CONSTRAINT "inventory_borrow_borrowed_by_staff_id_staff_id_fk" FOREIGN KEY ("borrowed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow" ADD CONSTRAINT "inventory_borrow_returned_by_staff_id_staff_id_fk" FOREIGN KEY ("returned_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_previous_custodian_staff_id_staff_id_fk" FOREIGN KEY ("previous_custodian_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_new_custodian_staff_id_staff_id_fk" FOREIGN KEY ("new_custodian_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_previous_manager_staff_id_staff_id_fk" FOREIGN KEY ("previous_manager_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_new_manager_staff_id_staff_id_fk" FOREIGN KEY ("new_manager_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_changed_by_staff_id_staff_id_fk" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_notice_recipient" ADD CONSTRAINT "inventory_custody_notice_recipient_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_request" ADD CONSTRAINT "inventory_custody_request_requester_staff_id_staff_id_fk" FOREIGN KEY ("requester_staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_request" ADD CONSTRAINT "inventory_custody_request_custodian_staff_id_staff_id_fk" FOREIGN KEY ("custodian_staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_request" ADD CONSTRAINT "inventory_custody_request_decided_by_staff_id_staff_id_fk" FOREIGN KEY ("decided_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal" ADD CONSTRAINT "inventory_disposal_requested_by_staff_id_staff_id_fk" FOREIGN KEY ("requested_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal" ADD CONSTRAINT "inventory_disposal_approved_by_staff_id_staff_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal" ADD CONSTRAINT "inventory_disposal_finalized_by_staff_id_staff_id_fk" FOREIGN KEY ("finalized_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal" ADD CONSTRAINT "inventory_disposal_cancelled_by_staff_id_staff_id_fk" FOREIGN KEY ("cancelled_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal_status_history" ADD CONSTRAINT "inventory_disposal_status_history_changed_by_staff_id_staff_id_fk" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue" ADD CONSTRAINT "inventory_issue_issued_by_staff_id_staff_id_fk" FOREIGN KEY ("issued_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_manager_staff_id_staff_id_fk" FOREIGN KEY ("manager_staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_custodian_staff_id_staff_id_fk" FOREIGN KEY ("custodian_staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_voided_by_staff_id_staff_id_fk" FOREIGN KEY ("voided_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_replacement" ADD CONSTRAINT "inventory_item_replacement_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The `IF EXISTS` here is not defensive habit, it is a real state this migration
-- has to survive: the NIC work was applied to the development database by hand
-- first, because `drizzle-kit push` cannot run without a TTY in this environment
-- (it stops on the `gsc_unique` truncate prompt) and this file was generated
-- afterwards from a schema that already carried the constraint. A fresh
-- deployment from 0000 needs the statement; the development database needs it to
-- be a no-op rather than an error. The two `SET NOT NULL` statements above it are
-- already idempotent for the same reason.
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_nic_format";--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_nic_format" CHECK ("staff"."nic" ~ '^[0-9]{9}[vVxX]$' OR "staff"."nic" ~ '^[0-9]{12}$');