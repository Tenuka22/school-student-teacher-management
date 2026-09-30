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
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_action_check" CHECK ("inventory_transaction"."action" in ('created', 'edited', 'deleted', 'stock_in', 'stock_out', 'issued', 'custody_taken', 'custody_transferred', 'custody_released', 'manager_assigned', 'manager_changed', 'manager_cleared', 'disposal_requested', 'disposal_approved', 'disposal_finalized'));--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_counters_nonneg" CHECK ("inventory_transaction"."qty_before" >= 0
        and "inventory_transaction"."qty_after" >= 0);--> statement-breakpoint
ALTER TABLE "inventory_unit" ADD CONSTRAINT "inventory_unit_status_check" CHECK ("inventory_unit"."status" in ('available', 'issued', 'disposed', 'removed'));