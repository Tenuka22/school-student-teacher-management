import { ORPCError } from "@orpc/server";
import {
  inventoryCategory,
  inventoryCategoryIdSchema,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, eq, isNull } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure } from "../../index";
import {
  assertCategoryExists,
  getInventoryActor,
  insertInventoryAuditLog,
} from "./inventory-database";

/**
 * Delete a category, but only while nothing points at it.
 *
 * **Why the existence probe exists at all**, since the database would refuse
 * the delete anyway: `inventoryItem.categoryId` is `onDelete: "restrict"`, so a
 * category still in use produces a raw `23503` from the driver — a message
 * naming a foreign key and a constraint rather than a category. The probe turns
 * that into a sentence a storekeeper can act on, in the same way
 * `delete-staff.ts` probes fourteen tables before it will remove a person. It is
 * a courtesy with a good message, not the enforcement: the FK is the
 * enforcement, and this is the readable error in front of it. Removing the
 * probe would not make the delete succeed, only make it fail obscurely.
 *
 * The message names the category because the caller is looking at a row of
 * buttons and not at a category list — a bare "cannot delete" tells them
 * nothing they did not already know — and it names the two ways out, because
 * "an item still uses it" without them leaves the user to guess whether to move
 * the items, retire them, or delete them.
 *
 * **Soft-deleted items do not block removal.** A soft-deleted item
 * (`inventoryItem.deletedAt` set) is invisible to every other query in the
 * module — `itemViewJoins` is always filtered by callers that care, the
 * dashboards exclude them — so letting a row nobody can see keep a category
 * nobody can use alive would make retirement impossible: deleting the last
 * item of a kind would permanently freeze its category. The `restrict` FK
 * would still refuse a *hard* delete of such a row, so this is not a claim that
 * the database permits the removal; it is a claim that an invisible row is not
 * a reason to show the storekeeper an error.
 *
 * The whole read-probe-delete-audit sequence runs in one transaction so the
 * item count cannot change between the probe and the delete: a concurrent
 * `create-item` that landed after the probe would hit the `restrict` FK and
 * fail with the obscure error this procedure exists to avoid.
 */

export const removeCategory = adminOnlyProcedure
  .input(v.object({ categoryId: inventoryCategoryIdSchema }))
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);

    return context.db.transaction(async (tx) => {
      await assertCategoryExists(tx, input.categoryId);

      /**
       * Two independent reads of the same row set, batched: the category itself
       * (for the refusal message and the audit `before` snapshot — neither of
       * which `assertCategoryExists` returns, and re-reading it is one cheap
       * indexed lookup inside a transaction that has already opened) and the
       * single existence probe that decides whether the delete is allowed.
       */
      const [[category], [blockingItem]] = await Promise.all([
        tx
          .select({
            id: inventoryCategory.id,
            name: inventoryCategory.name,
            normalizedName: inventoryCategory.normalizedName,
            color: inventoryCategory.color,
          })
          .from(inventoryCategory)
          .where(eq(inventoryCategory.id, input.categoryId))
          .limit(1),
        tx
          .select({ id: inventoryItem.id })
          .from(inventoryItem)
          .where(
            and(
              eq(inventoryItem.categoryId, input.categoryId),
              isNull(inventoryItem.deletedAt)
            )
          )
          .limit(1),
      ]);

      // Unreachable given the `assertCategoryExists` above; kept because
      // `noUncheckedIndexedAccess` makes the index read `| undefined` and a
      // guard that is missing here would put a raw `undefined.name` in the
      // audit row if the two queries ever disagreed.
      if (!category) {
        throw new ORPCError("NOT_FOUND", { message: "Category not found" });
      }

      if (blockingItem) {
        throw new ORPCError("CONFLICT", {
          message: `${category.name} is still used by items in the store. Move those items to another category, or retire them, before removing ${category.name}.`,
        });
      }

      await tx
        .delete(inventoryCategory)
        .where(eq(inventoryCategory.id, input.categoryId));

      await insertInventoryAuditLog(tx, {
        actor,
        action: "category.delete",
        entityType: "inventory_category",
        entityId: category.id,
        before: {
          name: category.name,
          normalizedName: category.normalizedName,
          color: category.color,
        },
        after: null,
      });

      return { id: category.id, removed: true as const };
    });
  });
