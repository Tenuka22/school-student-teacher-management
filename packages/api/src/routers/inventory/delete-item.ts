/**
 * Retiring an item from the working register.
 *
 * A soft delete, and the reason it must be one is not a preference: every table
 * that points at an item — units, issues, borrows, disposals, the custody trail
 * and the counter ledger — carries `onDelete: "restrict"`. A hard `delete` here
 * would be refused by the database for every item that has ever moved, and it
 * would be *right* to refuse it: a school's asset register is not a cache, and a
 * row that vanishes takes the answer to "how many projectors did we have, and
 * where did the last one go" with it. So the row is stamped `deletedAt`, drops
 * out of `listItems` and `getItem`, and stays in the database underneath the
 * ledger that describes it.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryItem,
  inventoryItemIdSchema,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { requireInventoryPermission } from "../../index";
import type { InventoryItemRow } from "./inventory-database";
import {
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
  isoOrNull,
} from "./inventory-database";

/**
 * The audit snapshot of a row — see the identical helper in `create-item.ts`.
 * `jsonb` cannot be trusted with a `Date`, and these three columns are the only
 * ones on the row that carry one.
 */
const toAuditSnapshot = (row: InventoryItemRow): Record<string, unknown> => ({
  ...row,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  deletedAt: isoOrNull(row.deletedAt),
});

/**
 * The unit statuses that mean "this item is still out there".
 *
 * `removed` is deliberately absent — a unit whose stock was written off has
 * stopped existing as a physical thing, so it blocks nothing. The source repo
 * also listed `reserved`, which this port has no counter and no unit status for.
 */
const IN_FLIGHT_UNIT_STATUSES = ["borrowed", "issued", "disposed"] as const;

/**
 * Retire an item, provided nothing about it is still in flight.
 *
 * The guard is the source repo's, unchanged: no unit may be `borrowed`,
 * `issued` or `disposed`, checked with a single query. A storekeeper holding six
 * devices is not helped by "this item is still in use" — they are helped by the
 * tag, because that is what they can go and look for — so the offending
 * `uniqueNo` comes back in the message and the way out is named too: bring the
 * loan back, record the disposal, or issue it out properly first.
 *
 * Retiring an item whose units are away would leave the ledger describing
 * movements of a row nothing can display, which is precisely the hole a soft
 * delete is supposed to prevent.
 *
 * The counters are snapshotted rather than cleared: the row keeps its `qty` and
 * `borrowedQty` exactly as they were, because that is the figure the ledger rows
 * either side of this one refer to, and rewriting it would make the ledger's own
 * history stop reconciling.
 */
export const deleteItem = requireInventoryPermission("delete")
  .input(v.object({ itemId: inventoryItemIdSchema }))
  .handler(({ input, context }) =>
    context.db.transaction(async (tx) => {
      // Two independent reads — who is acting, and the item under a row lock.
      // The lock is taken before the in-flight probe below so the guard and the
      // retirement it refuses are decided against the same committed state.
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedItem(tx, input.itemId),
      ]);

      const [inFlight] = await tx
        .select({ uniqueNo: inventoryUnit.uniqueNo })
        .from(inventoryUnit)
        .where(
          and(
            eq(inventoryUnit.itemId, existing.id),
            inArray(inventoryUnit.status, [...IN_FLIGHT_UNIT_STATUSES])
          )
        )
        .limit(1);

      if (inFlight) {
        throw new ORPCError("CONFLICT", {
          message: `Asset ${inFlight.uniqueNo} is still out on this item — return the loan, record the disposal or issue it out before retiring the item`,
        });
      }

      const deletedAt = new Date();

      const [retired] = await tx
        .update(inventoryItem)
        .set({ deletedAt })
        .where(eq(inventoryItem.id, existing.id))
        .returning();

      if (!retired) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      await insertInventoryTransaction(tx, {
        actor,
        action: "deleted",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(retired),
        note: "Item soft deleted",
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "item.delete",
        entityType: "inventory_item",
        entityId: existing.id,
        before: toAuditSnapshot(existing),
        after: toAuditSnapshot(retired),
      });

      return { id: retired.id, deletedAt: iso(deletedAt) };
    })
  );
