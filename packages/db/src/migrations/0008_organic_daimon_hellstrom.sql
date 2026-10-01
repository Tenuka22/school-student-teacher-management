-- ─────────────────────────────────────────────────────────────────────────────
-- Dated loans and peer-to-peer custody requests are removed (25a2103).
--
-- As first generated, this file dropped the three tables with CASCADE and
-- tightened two CHECKs with no regard for existing rows. On a database holding
-- any loan history that either fails (the old ledger actions violate the new
-- CHECK) or, if forced, discards it. Three changes make it safe on both an
-- empty and a populated database; on an empty one all three are no-ops:
--
-- 1. Pre-flight: refuse while anything is still physically out on a loan or a
--    custody request is still pending. Dropping those rows would lose track of
--    property that is in somebody's hands right now. Close them on the previous
--    release, then migrate.
-- 2. Archive: closed loan and request history is copied into plain
--    `archived_0008_*` tables (no FKs, so they never block a staff delete)
--    before the originals are dropped. Only created when there is something to
--    keep.
-- 3. The ledger CHECK still admits 'borrowed' and 'returned' — see
--    `LEGACY_INVENTORY_TRANSACTION_ACTIONS` in `constants/inventory.ts`.
-- ─────────────────────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  open_loans bigint;
  borrowed_units bigint;
  lent_items bigint;
  pending_requests bigint;
BEGIN
  SELECT count(*) INTO open_loans FROM "inventory_borrow" WHERE "status" = 'borrowed';
  SELECT count(*) INTO borrowed_units FROM "inventory_unit" WHERE "status" = 'borrowed';
  SELECT count(*) INTO lent_items FROM "inventory_item" WHERE "borrowed_qty" > 0;
  SELECT count(*) INTO pending_requests FROM "inventory_custody_request" WHERE "status" = 'pending';
  IF open_loans + borrowed_units + lent_items + pending_requests > 0 THEN
    RAISE EXCEPTION 'migration 0008 refused: % open loan(s), % borrowed unit(s), % item(s) with borrowed_qty > 0, % pending custody request(s). Return the loans and decide the requests on the previous release first; nothing has been changed.',
      open_loans, borrowed_units, lent_items, pending_requests;
  END IF;
END
$preflight$;--> statement-breakpoint
DO $archive$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory_borrow") THEN
    CREATE TABLE "archived_0008_inventory_borrow" AS TABLE "inventory_borrow";
    CREATE TABLE "archived_0008_inventory_borrow_unit" AS TABLE "inventory_borrow_unit";
  END IF;
  IF EXISTS (SELECT 1 FROM "inventory_custody_request") THEN
    CREATE TABLE "archived_0008_inventory_custody_request" AS TABLE "inventory_custody_request";
  END IF;
END
$archive$;--> statement-breakpoint
ALTER TABLE "inventory_borrow" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_borrow_unit" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_custody_request" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "inventory_borrow" CASCADE;--> statement-breakpoint
DROP TABLE "inventory_borrow_unit" CASCADE;--> statement-breakpoint
DROP TABLE "inventory_custody_request" CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT "inventory_item_counters_within_qty";--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT "inventory_item_counters_nonneg";--> statement-breakpoint
ALTER TABLE "inventory_transaction" DROP CONSTRAINT "inventory_transaction_action_check";--> statement-breakpoint
ALTER TABLE "inventory_transaction" DROP CONSTRAINT "inventory_transaction_counters_nonneg";--> statement-breakpoint
ALTER TABLE "inventory_unit" DROP CONSTRAINT "inventory_unit_status_check";--> statement-breakpoint
ALTER TABLE "inventory_item" DROP COLUMN "borrowed_qty";--> statement-breakpoint
ALTER TABLE "inventory_transaction" DROP COLUMN "borrowed_qty_before";--> statement-breakpoint
ALTER TABLE "inventory_transaction" DROP COLUMN "borrowed_qty_after";--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_counters_nonneg" CHECK ("inventory_item"."qty" >= 0);--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_action_check" CHECK ("inventory_transaction"."action" in ('created', 'edited', 'deleted', 'stock_in', 'stock_out', 'issued', 'custody_taken', 'custody_transferred', 'custody_released', 'manager_assigned', 'manager_changed', 'manager_cleared', 'disposal_requested', 'disposal_approved', 'disposal_finalized', 'borrowed', 'returned'));--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_counters_nonneg" CHECK ("inventory_transaction"."qty_before" >= 0
        and "inventory_transaction"."qty_after" >= 0);--> statement-breakpoint
ALTER TABLE "inventory_unit" ADD CONSTRAINT "inventory_unit_status_check" CHECK ("inventory_unit"."status" in ('available', 'issued', 'disposed', 'removed'));
