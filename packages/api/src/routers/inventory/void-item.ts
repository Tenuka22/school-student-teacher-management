/**
 * Voiding an item — the *other* soft delete.
 *
 * `deleteItem` retires an item that genuinely served the school and is now
 * out of service. This is for a row that should never have existed at all: a
 * duplicate creation, a data-entry slip, a line typed in twice by mistake.
 * The two are kept apart on purpose — see `inventoryItem`'s schema doc
 * comment — because a report asking "how much did we retire this year"
 * should not be answered by rows that were never real stock, and an
 * administrator scanning the register for genuine wear-and-tear replacement
 * should not have to mentally filter out typos.
 *
 * `reason` is required, for the same reason `stockOut.reason` is: it is the
 * first line an auditor reads, and "why was this voided" is exactly the
 * question a mistaken entry raises later.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryItem,
  inventoryItemIdSchema,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure } from "../../index";
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
 * The audit snapshot of a row — see the identical helper in `delete-item.ts`.
 */
const toAuditSnapshot = (row: InventoryItemRow): Record<string, unknown> => ({
  ...row,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  deletedAt: isoOrNull(row.deletedAt),
  voidedAt: isoOrNull(row.voidedAt),
});

/** Same guard as `deleteItem` — a mistaken entry cannot have any of its units
 *  genuinely out in the world, or "this was never real stock" would be a lie. */
const IN_FLIGHT_UNIT_STATUSES = ["borrowed", "issued", "disposed"] as const;

export const voidItem = adminOnlyProcedure
  .input(
    v.object({
      itemId: inventoryItemIdSchema,
      reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
    })
  )
  .handler(({ input, context }) =>
    context.db.transaction(async (tx) => {
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
          message: `Asset ${inFlight.uniqueNo} is still out on this item — return the loan, record the disposal or issue it out before voiding the item`,
        });
      }

      const reason = input.reason.trim();
      const voidedAt = new Date();

      const [voided] = await tx
        .update(inventoryItem)
        .set({ voidedAt, voidReason: reason, voidedByStaffId: actor.userId })
        .where(eq(inventoryItem.id, existing.id))
        .returning();

      if (!voided) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      await insertInventoryTransaction(tx, {
        actor,
        action: "deleted",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(voided),
        note: `Voided: ${reason}`,
        meta: { reason, voided: true },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "item.void",
        entityType: "inventory_item",
        entityId: existing.id,
        before: toAuditSnapshot(existing),
        after: toAuditSnapshot(voided),
      });

      return { id: voided.id, voidedAt: iso(voidedAt), reason };
    })
  );
