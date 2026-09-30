/**
 * Designate — or replace — the teacher in charge of an item.
 *
 * **The manager is not the custodian.** The manager is the person accountable
 * for the item: the one a principal asks why the science cupboard is short, and
 * the one whose name goes on the audit when a microscope cannot be found. The
 * custodian is the person the register says has it. Neither pointer may ever be
 * empty — both columns on `inventory_item` are `NOT NULL` — but a school still
 * needs to change one without disturbing the other: replacing who is
 * answerable must not disturb who is carrying it, and vice versa. Collapsing
 * the two into a single "owner" pointer would force every hand-over to rewrite
 * accountability as well, and the trail could no longer answer "who is
 * responsible for this?" independently of "who has it?".
 *
 * **There is no clearing this pointer any more.** `newManagerStaffId` is
 * required, non-nullable: "nobody is answerable for this" is a state the
 * register will not write, and a legacy row that has no owner is fixed by
 * appointing one rather than by keeping an emptying verb around for it. The
 * appointment-from-nothing case (`previousManagerStaffId` null →
 * `manager_assigned`) is the one route by which an unowned row becomes owned.
 *
 * That is also why the history table has a `changeType` at all, and why this
 * procedure writes the **custodian** columns as `null` (and `transfer-custody`
 * writes the manager columns as `null`): the
 * `inventory_custody_history_manager_columns` CHECK treats "this is a custody
 * row" and "both manager columns are null" as the same fact, and cross-writing
 * them fails the insert.
 */
import { ORPCError } from "@orpc/server";
import { inventoryTransferReasonSchema } from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryCustodyHistory,
  inventoryItem,
  inventoryItemIdSchema,
  staffRefSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { minLength, object, optional, pipe, string } from "valibot";

import { inventoryManagerProcedure } from "../../index";
import type { Executor } from "./inventory-database";
import {
  assertStaffIsAssignable,
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
} from "./inventory-database";

/**
 * The display name behind a `staff` pointer, or null once that staff row is
 * gone (`*_staff_id` is `set null` on the history table precisely so a
 * departure retires the name without deleting the trail).
 */
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

/**
 * The two manager outcomes, decided from the current one.
 *
 * Deliberately total over the reachable combinations rather than nullable: the
 * no-op case (same manager) is refused by the caller before this runs, and the
 * successor is required by the input and can never be null, so the only branch
 * that matters is whether there was an owner to replace. `manager_cleared` is
 * not one of the outcomes because nothing in this folder can write it any more
 * — the vocabulary keeps the value for rows written before the clearing path
 * was removed.
 */
const resolveManagerChangeType = (
  previousManagerStaffId: string | null
): "manager_assigned" | "manager_changed" =>
  previousManagerStaffId ? "manager_changed" : "manager_assigned";

/**
 * The audit verb for a manager outcome.
 *
 * Two verbs rather than one, because the questions they answer are two: who
 * appointed this manager, and who replaced one. A single `manager.update` would
 * make the audit log unable to distinguish an appointment from a resignation.
 */
const managerAuditAction = (
  changeType: "manager_assigned" | "manager_changed"
): string =>
  changeType === "manager_assigned" ? "manager.assign" : "manager.change";

export const assignManager = inventoryManagerProcedure
  .input(
    object({
      itemId: inventoryItemIdSchema,
      /** Required, non-nullable: every item stays answerable to a person, so
       *  there is no clearing this pointer any more (see the file comment).
       *  Must differ from the current manager — the no-op is refused below.
       *  The label says "staff member" because that is who may be put in
       *  charge of a school item. */
      newManagerStaffId: staffRefSchema,
      /** Required unconditionally — see `transfer-custody.ts` for why that is
       *  stricter than `inventory_custody_history_reason_required`. Only
       *  `manager_assigned` is exempt there, and the stricter input costs one
       *  dropdown click on the first appointment. */
      reason: inventoryTransferReasonSchema,
      note: optional(pipe(string(), minLength(1))),
    })
  )
  .handler(async ({ input, context }) => {
    // The pointer, the history row, the ledger row and the audit row commit or
    // roll back together: a manager change without its history row is a change
    // nobody could account for later.
    const result = await context.db.transaction(async (tx) => {
      // Independent reads: the actor lookup is on `context.db` against
      // `staff`, so it cannot race the `FOR UPDATE` on the item below.
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedItem(tx, input.itemId),
      ]);
      const { newManagerStaffId } = input;

      const previousManagerName = existing.managerStaffId
        ? await resolveStaffName(tx, existing.managerStaffId)
        : null;

      if (existing.managerStaffId === newManagerStaffId) {
        throw new ORPCError("BAD_REQUEST", {
          message: `${previousManagerName ?? existing.managerStaffId} is already the manager in charge of this item`,
        });
      }

      // The successor must be real, employable staff — the same school-domain
      // assertion every holder write makes, so an item cannot be put in the
      // charge of a departed or unassignable row. Returns the name this write
      // needs on the new side of the change.
      const newManager = await assertStaffIsAssignable(
        tx,
        newManagerStaffId,
        "staff member"
      );
      const newManagerName = newManager.name;

      const changeType = resolveManagerChangeType(existing.managerStaffId);

      await tx
        .update(inventoryItem)
        .set({ managerStaffId: newManagerStaffId })
        .where(eq(inventoryItem.id, existing.id));

      const [history] = await tx
        .insert(inventoryCustodyHistory)
        .values({
          id: crypto.randomUUID(),
          itemId: existing.id,
          // A manager change moves nothing, so who was holding the item is not
          // a fact this row records. Null here is what marks the row as a
          // manager row for `inventory_custody_history_manager_columns`.
          previousCustodianStaffId: null,
          newCustodianStaffId: null,
          previousManagerStaffId: existing.managerStaffId,
          newManagerStaffId,
          changeType,
          reason: input.reason,
          note: input.note ?? null,
          changedByStaffId: actor.staffId,
        })
        .returning();

      if (!history) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      // Counters are untouched by a change of accountability: the same pairs
      // on both sides, and the meta carries the cause instead.
      await insertInventoryTransaction(tx, {
        actor,
        action: changeType,
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(existing),
        note: input.note ?? null,
        meta: {
          previousManagerName,
          newManagerName,
          reason: input.reason,
        },
      });

      // Two audit verbs rather than one, because the questions they answer
      // are two: who appointed this manager, and who replaced one.
      await insertInventoryAuditLog(tx, {
        actor,
        action: managerAuditAction(changeType),
        entityType: "inventory_item",
        entityId: existing.id,
        before: {
          managerStaffId: existing.managerStaffId,
          managerName: previousManagerName,
        },
        after: {
          managerStaffId: newManagerStaffId,
          managerName: newManagerName,
        },
      });

      return {
        itemId: existing.id,
        previousManagerName,
        managerStaffId: newManagerStaffId,
        managerName: newManagerName,
        changeType,
        changedAt: iso(history.changedAt),
      };
    });

    return result;
  });
