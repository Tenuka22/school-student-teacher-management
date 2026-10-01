/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * §11 regression: stored inventory counters agree with the ledger, including
 * under concurrent stock movements, and a counter that drifts is detected.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { findLedgerMismatches } from "../src/lib/inventory-reconciliation";
import {
  HARNESS_TIMEOUT_MS,
  clientFor,
  createHarness,
  outcome,
  signInSeat,
} from "./support/harness";
import type { Harness } from "./support/harness";

let harness: Harness;
let store: Awaited<ReturnType<typeof clientFor>>;
let categoryId: string;
let tagSequence = 0;

const tags = (count: number) =>
  Array.from({ length: count }, () => {
    tagSequence += 1;
    return `RECON-${String(tagSequence).padStart(5, "0")}`;
  });

const qtyOf = async (itemId: string) => {
  const { rows } = await harness.sql.query<{ qty: number }>(
    `select qty from inventory_item where id = $1`,
    [itemId]
  );
  return rows[0]?.qty;
};

beforeAll(async () => {
  harness = await createHarness();
  store = await clientFor(
    harness,
    await signInSeat(harness, "inventory-admin")
  );
  const { rows } = await harness.sql.query<{ id: string }>(
    `select id from inventory_category order by name limit 1`
  );
  categoryId = rows[0]?.id ?? "";
}, HARNESS_TIMEOUT_MS);

afterAll(async () => {
  await harness?.close();
}, HARNESS_TIMEOUT_MS);

describe("inventory counters match the ledger", () => {
  test("create, five concurrent stock-ins and a stock-out reconcile exactly", async () => {
    const created = (await store.inventory.items.create({
      categoryId,
      name: "Projector",
      unit: "unit",
      qty: 3,
      condition: "Good",
      managerStaffId: "seed-staff-inventory-admin",
      custodianStaffId: "seed-staff-inventory-admin",
      uniqueIds: tags(3),
    } as never)) as { id: string };

    // Five deliveries landing at once: the row lock must serialize them, so
    // none is lost and every ledger row chains from the one before.
    const deliveries = await Promise.all(
      Array.from({ length: 5 }, () =>
        outcome(
          store.inventory.items.stockIn({
            itemId: created.id,
            qty: 2,
            uniqueIds: tags(2),
          } as never)
        )
      )
    );
    expect(deliveries).toEqual(["OK", "OK", "OK", "OK", "OK"]);

    expect(
      await outcome(
        store.inventory.items.stockOut({
          itemId: created.id,
          qty: 4,
          reason: "Damaged in transit",
        } as never)
      )
    ).toBe("OK");

    // 3 + 5 x 2 - 4
    expect(await qtyOf(created.id)).toBe(9);
    expect(await findLedgerMismatches(harness.db)).toEqual([]);
  });

  test("a counter changed outside the ledger is detected", async () => {
    const { rows } = await harness.sql.query<{ id: string; sku: string }>(
      `select id, sku from inventory_item limit 1`
    );
    const [item] = rows;
    await harness.sql.query(
      `update inventory_item set qty = qty + 1 where id = $1`,
      [item?.id]
    );
    const mismatches = await findLedgerMismatches(harness.db);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      sku: item?.sku,
      storedQty: 10,
      ledgerQty: 9,
    });
  });
});
