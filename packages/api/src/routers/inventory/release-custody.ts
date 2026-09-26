/**
 * A teacher hands an item back to the store.
 *
 * Without this procedure `takeItem` is a one-way door: a teacher who claims a
 * tripod in September has no route to give it back in July, the pointer never
 * returns to null, and every later claim on the item is refused as "already
 * yours". The release is half of the feature; the claim is the other half.
 *
 * The permission is `requireInventoryPermission("take")` — the narrow
 * self-service action, **not** `update`, and the same gate `takeItem` sits
 * behind. `update` is the write gate on `transferCustody`, `assignManager`,
 * `updateItem`, `updateUnit`, `stockOut`, `returnBorrow` and `cancelDisposal`,
 * and a teacher who could hand an item back would then hold all seven as well.
 * The procedure narrows it the same way, from the opposite direction: only the
 * teacher currently holding the item may release it, plus the three leadership
 * roles, so that an administrator can clear a pointer after a departure without
 * the departed teacher having to log in.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryCustodyHistory,
  inventoryItem,
  inventoryItemIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { minLength, object, optional, pipe, string } from "valibot";

import { requireInventoryPermission } from "../../index";
import type { Executor } from "./inventory-database";
import {
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
} from "./inventory-database";

/**
 * The three roles that may release an item on somebody else's behalf. The same
 * triple as `ADMIN_ROLES` in `packages/api/src/index.ts:77` — the
 * leadership seats hold the same management authority as `admin`, and that
 * list is not exported from there, so it is restated with a pointer rather than
 * imported from a module that already has a reason to own it.
 */
const ADMIN_ROLES = new Set(["admin", "principal", "vicePrincipal"]);

/** The name behind a `staff` pointer, or null once that staff row is gone. */
const resolveStaffName = async (
  db: Executor,
  staffId: string
): Promise<string | null> => {
  const [record] = await db
    .select({ name: staff.name })
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);

  return record?.name ?? null;
};

export const releaseCustody = requireInventoryPermission("take")
  .input(
    object({
      itemId: inventoryItemIdSchema,
      note: optional(pipe(string(), minLength(1))),
    })
  )
  .handler(async ({ input, context }) => {
    // The pointer, the history row, the ledger row and the audit row commit or
    // roll back together: a release without its history row would leave the item
    // in the store with no record of who had just handed it back.
    const result = await context.db.transaction(async (tx) => {
      // Independent reads: the actor lookup is on `context.db` against
      // `staff` and cannot race the `FOR UPDATE` on the item below. It cannot
      // reject either, because the permission gate has already established a
      // session.
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedItem(tx, input.itemId),
      ]);

      if (!existing.custodianStaffId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This item is not in anyone's custody",
        });
      }

      // Authorization before the borrow check below, so a teacher who is not
      // the holder learns nothing about the item's stock state.
      const role = context.session?.user.role ?? "";
      const isAdmin = ADMIN_ROLES.has(role);
      if (existing.custodianStaffId !== actor.staffId && !isAdmin) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "Only the teacher holding this item, or an administrator, can hand it back to the store",
        });
      }

      // An item with units out on loan is not physically in anybody's hand to
      // give back — it is out with a borrower, and the borrow has to be closed
      // through the borrow-return flow so the return date, the returned-by
      // signature and the counter movement are all recorded. Releasing custody
      // here would clear the pointer while the units were still away, which
      // leaves an item on loan with nobody recorded as looking after it.
      if (existing.borrowedQty > 0) {
        throw new ORPCError("CONFLICT", {
          message:
            "This item is on loan, so it has to be returned through the borrow record before it can go back to the store",
        });
      }

      const previousCustodianName = await resolveStaffName(
        tx,
        existing.custodianStaffId
      );

      await tx
        .update(inventoryItem)
        .set({ custodianStaffId: null })
        .where(eq(inventoryItem.id, existing.id));

      // `custody_released` with a null `new_custodian_staff_id` and null
      // manager columns: `inventory_custody_history_manager_columns` holds
      // because "is a custody type" is true and "both manager columns are
      // null" is also true, and `inventory_custody_history_reason_required`
      // holds because `returned_to_store` is not null. The reason is not free
      // text: it comes from the closed `INVENTORY_TRANSFER_REASONS` vocabulary
      // so a report can group releases by cause, and `returned_to_store` is the
      // honest cause for every release this procedure writes.
      const [history] = await tx
        .insert(inventoryCustodyHistory)
        .values({
          id: crypto.randomUUID(),
          itemId: existing.id,
          previousCustodianStaffId: existing.custodianStaffId,
          newCustodianStaffId: null,
          previousManagerStaffId: null,
          newManagerStaffId: null,
          changeType: "custody_released",
          reason: "returned_to_store",
          note: input.note ?? null,
          changedByStaffId: actor.staffId,
        })
        .returning();

      if (!history) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await insertInventoryTransaction(tx, {
        actor,
        action: "custody_released",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(existing),
        note: input.note ?? null,
        meta: { previousCustodianName, reason: "returned_to_store" },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "custody.release",
        entityType: "inventory_item",
        entityId: existing.id,
        before: {
          custodianStaffId: existing.custodianStaffId,
          custodianName: previousCustodianName,
        },
        after: { custodianStaffId: null, custodianName: null },
      });

      return {
        itemId: existing.id,
        previousCustodianName,
        custodianStaffId: null,
        custodianName: null,
        changeType: "custody_released" as const,
        changedAt: iso(history.changedAt),
      };
    });

    return result;
  });
