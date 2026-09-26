/**
 * Designate — or un-designate — the teacher in charge of an item.
 *
 * **The manager is not the custodian.** The manager is the person accountable
 * for the item: the one a principal asks why the science cupboard is short, and
 * the one whose name goes on the audit when a microscope cannot be found. The
 * custodian is the person physically carrying it. A manager can be set on an
 * item sitting in the store with nobody holding it, and a custodian can hold an
 * item that has no manager at all — both are ordinary states, and a school needs
 * to be able to change one without disturbing the other. Collapsing the two into
 * a single "owner" pointer would force every hand-over to rewrite
 * accountability as well, and the trail could no longer answer "who is
 * responsible for this?" independently of "who has it?".
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
} from "@school-student-teacher-management/db/schema/inventory";
import {
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { minLength, nullable, object, optional, pipe, string } from "valibot";

import { adminOnlyProcedure } from "../../index";
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
 * The three manager outcomes, decided from the two pointers.
 *
 * Deliberately total over the reachable combinations rather than nullable: the
 * no-op case (same manager, or clearing an already-empty slot) is refused by
 * the caller before this runs, so a null here would only ever be a bug.
 */
const resolveManagerChangeType = (
  previousManagerStaffId: string | null,
  newManagerStaffId: string | null
): "manager_assigned" | "manager_changed" | "manager_cleared" => {
  if (previousManagerStaffId) {
    return newManagerStaffId ? "manager_changed" : "manager_cleared";
  }

  return "manager_assigned";
};

/**
 * The audit verb for a manager outcome.
 *
 * Three verbs rather than one, because the questions they answer are three: who
 * appointed this manager, who replaced one, and who decided an item no longer
 * has anybody in charge of it. A single `manager.update` would make the audit
 * log unable to distinguish an appointment from a resignation.
 */
const managerAuditAction = (
  changeType: "manager_assigned" | "manager_changed" | "manager_cleared"
): string => {
  if (changeType === "manager_assigned") {
    return "manager.assign";
  }

  return changeType === "manager_changed" ? "manager.change" : "manager.clear";
};

export const assignManager = adminOnlyProcedure
  .input(
    object({
      itemId: inventoryItemIdSchema,
      /** `null` clears the manager. Deliberately nullable, not merely
       *  optional: "leave it alone" and "remove the current manager" are
       *  different requests and the UI has to be able to say both. */
      newManagerStaffId: optional(nullable(staffIdSchema)),
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
      const newManagerStaffId = input.newManagerStaffId ?? null;

      const previousManagerName = existing.managerStaffId
        ? await resolveStaffName(tx, existing.managerStaffId)
        : null;

      if (existing.managerStaffId === newManagerStaffId) {
        throw new ORPCError("BAD_REQUEST", {
          message: newManagerStaffId
            ? `${previousManagerName ?? existing.managerStaffId} is already the manager in charge of this item`
            : "This item already has nobody in charge of it",
        });
      }

      // Only a set manager is checked: `null` is not a person and there is
      // nothing to assert about it. The label says "teacher" because that is
      // who may be put in charge of a school item.
      let newManagerName: string | null = null;
      if (newManagerStaffId) {
        const newManager = await assertStaffIsAssignable(
          tx,
          newManagerStaffId,
          "staff member"
        );
        newManagerName = newManager.name;
      }

      const changeType = resolveManagerChangeType(
        existing.managerStaffId,
        newManagerStaffId
      );

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

      // Three audit verbs rather than one, because the questions they answer
      // are three: who appointed this manager, who replaced one, and who
      // decided an item no longer has anybody in charge of it.
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
