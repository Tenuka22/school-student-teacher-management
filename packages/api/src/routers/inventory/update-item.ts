/**
 * Editing an item's descriptive fields.
 *
 * The smallest of the five procedures, and the one most likely to be "extended"
 * by someone who assumes the missing fields were an oversight. They are not. Read
 * the two comments in the handler before adding a column to the input.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryItem,
  inventoryItemIdSchema,
  inventoryItemUpdateSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireInventoryPermission } from "../../index";
import { normalizeLabel } from "./inventory-calculations";
import type { InventoryItemRow } from "./inventory-database";
import {
  assertCategoryExists,
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
  isoOrNull,
  itemViewJoins,
  toItemView,
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
 * Correct an item's details.
 *
 * ### `qty` and `borrowedQty` are deliberately absent
 *
 * This is the single most tempting field to add to this input, so: **do not.**
 * `qty` is not a quantity you set, it is the number of unit rows an item has —
 * a *consequence* of the movements, never an editable fact. Stock moves only
 * through `stockIn` / `stockOut` / `issueItem` / `borrowItem` / `disposeItem`,
 * and each of those moves the counter and the unit rows together in one
 * transaction. An editable counter is not a shorter version of that: it is a
 * number that can disagree with every unit row beneath it, and the disagreement
 * is invisible until someone tries to issue a projector and is told it does not
 * exist, or a physical count finds four chairs that no procedure ever recorded.
 * The source app had this field and this is the bug it shipped with.
 *
 * ### `managerStaffId` and `custodianStaffId` are deliberately absent too
 *
 * The second most tempting, and the more dangerous of the two. Those two columns
 * are not plain fields with a history attached — the **history is the record**.
 * `transferCustody`, `assignManager`, `takeItem` and `releaseCustody` each write
 * the `inventoryCustodyHistory` row and the matching ledger action, and that
 * pairing is what makes the trail trustworthy. If this procedure could set the
 * pointer, the trail would fork: the row would say one holder and the ledger
 * would say another, with nothing recording which is right, and the audit
 * question the trail exists to answer would become unanswerable. It would also
 * silently skip the `reason` requirement, because `inventory_custody_history`
 * demands a cause for every change that replaces or clears a holder.
 *
 * ### What the ledger row is for
 *
 * The `edited` ledger action carries the two counter snapshots, and on this
 * procedure they are almost always identical — the counters barely move here,
 * which is the whole argument for keeping them out of the input. So the ledger
 * row mostly records *that* the row was edited; the field-level before/after
 * pair in `inventoryAuditLog` is where the change is legible. That is the
 * division of labour between the two tables, and it is why this procedure
 * writes to both.
 */
export const updateItem = requireInventoryPermission("update")
  .input(
    v.object({
      itemId: inventoryItemIdSchema,
      ...v.pick(inventoryItemUpdateSchema, [
        "categoryId",
        "name",
        "description",
        "unit",
        "minQty",
        "condition",
        "location",
        "purchaseValue",
        "currentValue",
        "borrowable",
      ]).entries,
    })
  )
  .handler(({ input, context }) =>
    context.db.transaction(async (tx) => {
      // Two independent reads — who is acting, and the item under a row lock —
      // issued together. The lock is what makes `qty` below the count the ledger
      // and the unit rows agree on, so it is taken before anything is computed,
      // never from a value the client sent.
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedItem(tx, input.itemId),
      ]);

      if (input.categoryId) {
        await assertCategoryExists(tx, input.categoryId);
      }

      // Same trim problem as creation: the generated schema tests
      // `minLength(1)` and `inventory_item_name_not_blank` tests the trimmed
      // string, so a name of spaces has to be caught here or the update is
      // refused by the database.
      const name =
        input.name === undefined ? existing.name : normalizeLabel(input.name);
      if (!name) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Give the item a name",
        });
      }

      const minQty = input.minQty ?? existing.minQty;
      // A reorder threshold above what is actually on the shelf is refused here
      // even though the database permits it (`min_qty >= 0` is its only CHECK,
      // deliberately — a hard floor would break every write-off at the moment
      // stock drops to it). The difference between the two cases is the
      // direction: an item may legitimately *be* below its threshold, which is
      // what the low-stock filter reports, but a person typing a new threshold
      // above the count is configuring a warning line they will be shown forever
      // without ever acting on. The count is not editable here, so `qty` is the
      // count the ledger and the unit rows agree on.
      if (minQty > existing.qty) {
        throw new ORPCError("BAD_REQUEST", {
          message: `The reorder threshold cannot be above the ${existing.qty} unit(s) currently on hand`,
        });
      }

      const [updated] = await tx
        .update(inventoryItem)
        .set({
          categoryId: input.categoryId ?? existing.categoryId,
          name,
          description: input.description ?? existing.description,
          unit: input.unit ?? existing.unit,
          minQty,
          borrowable: input.borrowable ?? existing.borrowable,
          condition: input.condition ?? existing.condition,
          location: input.location ?? existing.location,
          // `??` and not a presence test, so omitting a money field means "leave
          // this valuation alone" — which is what a form that only shows a
          // money field when it is being changed should send. A client that
          // wanted to clear a valuation to "not recorded" is asking a different
          // question, and it is not answered here.
          purchaseValue: input.purchaseValue ?? existing.purchaseValue,
          currentValue: input.currentValue ?? existing.currentValue,
        })
        .where(eq(inventoryItem.id, existing.id))
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      await insertInventoryTransaction(tx, {
        actor,
        action: "edited",
        item: { id: updated.id, name: updated.name, sku: updated.sku },
        before: countersOf(existing),
        after: countersOf(updated),
        note: "Item details updated",
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "item.update",
        entityType: "inventory_item",
        entityId: updated.id,
        before: toAuditSnapshot(existing),
        after: toAuditSnapshot(updated),
      });

      // Re-read through the view for the same reason `createItem` does: the
      // category name, both staff names and the two unit counts exist only on a
      // joined row, and `toItemView` is typed to require one.
      const [viewRow] = await itemViewJoins(tx)
        .where(eq(inventoryItem.id, updated.id))
        .limit(1);

      if (!viewRow) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      return toItemView(viewRow);
    })
  );
