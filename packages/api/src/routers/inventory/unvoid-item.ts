/**
 * Put a voided item back on the working register — the exact inverse of
 * `voidItem`, mirroring `restoreItem`'s relationship to `deleteItem`.
 *
 * No reason is required to unvoid, the same way none is required to restore a
 * retired item: undoing a soft delete is reversible by construction, and a
 * change of hands is the only kind of write in this feature that must justify
 * itself.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryItem,
  inventoryItemIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure } from "../../index";
import type { InventoryItemRow } from "./inventory-database";
import {
  countersOf,
  getInventoryActor,
  getLockedVoidedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  itemViewJoins,
  iso,
  isoOrNull,
  toItemView,
} from "./inventory-database";

const toAuditSnapshot = (row: InventoryItemRow): Record<string, unknown> => ({
  ...row,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  deletedAt: isoOrNull(row.deletedAt),
  voidedAt: isoOrNull(row.voidedAt),
});

export const unvoidItem = adminOnlyProcedure
  .input(v.object({ itemId: inventoryItemIdSchema }))
  .handler(({ input, context }) =>
    context.db.transaction(async (tx) => {
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedVoidedItem(tx, input.itemId),
      ]);

      const [restored] = await tx
        .update(inventoryItem)
        .set({ voidedAt: null, voidReason: null, voidedByStaffId: null })
        .where(eq(inventoryItem.id, existing.id))
        .returning();

      if (!restored) {
        throw new ORPCError("NOT_FOUND", {
          message: "No voided item with this id — it may already be unvoided",
        });
      }

      await insertInventoryTransaction(tx, {
        actor,
        action: "edited",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(restored),
        note: `Unvoided (was voided: ${existing.voidReason ?? "no reason recorded"})`,
        meta: { unvoided: true, previousVoidReason: existing.voidReason },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "item.unvoid",
        entityType: "inventory_item",
        entityId: existing.id,
        before: toAuditSnapshot(existing),
        after: toAuditSnapshot(restored),
      });

      const [viewRow] = await itemViewJoins(tx)
        .where(eq(inventoryItem.id, existing.id))
        .limit(1);

      if (!viewRow) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The unvoided item could not be read back",
        });
      }

      return {
        ...toItemView(viewRow),
        wasVoidedAt: isoOrNull(existing.voidedAt),
      };
    })
  );
