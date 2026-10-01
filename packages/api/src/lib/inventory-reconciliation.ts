import type { Database } from "@school-student-teacher-management/db";
import { sql } from "drizzle-orm";

/**
 * Proof that every stored inventory counter agrees with its ledger.
 *
 * `inventory_item.qty` is a stored counter, kept honest by row locks and
 * CHECKs, and every change to it writes an `inventory_transaction` row with
 * the before and after values. The audit noted that nothing ever *checked*
 * the two agree — consistency was argued from the locking, not verified.
 *
 * Ledger rows have no strict order (`created_at` is the transaction's start
 * time, shared by every row it writes), so the check is order-independent:
 * an item's ledger opens with `created` at `qty_before = 0`, so the sum of
 * every row's `qty_after - qty_before` must equal the stored `qty`. Any row
 * written outside the ledger, a lost update, or a hand-run `UPDATE` breaks it.
 */
export interface LedgerMismatch {
  itemId: string;
  sku: string;
  storedQty: number;
  ledgerQty: number;
  ledgerEntries: number;
}

export const findLedgerMismatches = async (
  db: Pick<Database, "execute">
): Promise<LedgerMismatch[]> => {
  const result = await db.execute(sql`
    select i.id as "itemId",
           i.sku as sku,
           i.qty as "storedQty",
           coalesce(sum(t.qty_after - t.qty_before), 0)::int as "ledgerQty",
           count(t.id)::int as "ledgerEntries"
      from inventory_item i
      left join inventory_transaction t on t.item_id = i.id
     group by i.id, i.sku, i.qty
    having i.qty <> coalesce(sum(t.qty_after - t.qty_before), 0)
     order by i.sku`);
  return result.rows as unknown as LedgerMismatch[];
};
