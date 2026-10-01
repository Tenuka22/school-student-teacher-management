/**
 * Read-only check that every inventory counter agrees with its ledger.
 * See `packages/api/src/lib/inventory-reconciliation.ts` for the invariant.
 *
 *   bun --env-file=apps/web/.env scripts/reconcile-inventory.ts
 *
 * Exits 1 and lists each item that disagrees; changes nothing.
 */
import { findLedgerMismatches } from "@school-student-teacher-management/api/lib/inventory-reconciliation";
import { createDb } from "@school-student-teacher-management/db";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const db = createDb({ DATABASE_URL: databaseUrl });
const mismatches = await findLedgerMismatches(db);

if (mismatches.length === 0) {
  console.log("Every inventory counter agrees with its ledger.");
} else {
  console.error(
    `${mismatches.length} item(s) disagree with their ledger (stored qty vs. sum of ledger changes):`
  );
  for (const row of mismatches) {
    console.error(
      `  ${row.sku}: stored ${row.storedQty}, ledger ${row.ledgerQty} over ${row.ledgerEntries} entr${row.ledgerEntries === 1 ? "y" : "ies"}`
    );
  }
  process.exitCode = 1;
}
await (
  db as unknown as { $client: { end: () => Promise<void> } }
).$client.end();
