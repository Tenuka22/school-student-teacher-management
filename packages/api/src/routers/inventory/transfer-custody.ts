/**
 * Hand an item from one teacher to another.
 *
 * This is the headline flow of the whole transfer feature: an administrator
 * standing in front of a store cupboard decides the microscope that was in Mr
 * Fernando's drawer now belongs to Ms Silva, and the school needs to be able to
 * answer "who had it last June" afterwards. Two things make that answerable and
 * are the reason this file is a command rather than an update: the previous
 * holder is read **under a row lock** before the pointer is overwritten, and
 * every change appends a row to `inventoryCustodyHistory` inside the same
 * transaction. The `custodianStaffId` column on the item is only the latest
 * state; the history table is the story.
 *
 * `managerStaffId` is deliberately untouched here. "Who is in charge" and "who is
 * holding it" are separate facts about a school, and a storekeeper must be able
 * to change one without touching the other — see `assign-manager.ts`, and the
 * `inventoryCustodyHistory` doc comment, which is why the manager columns are
 * written `null` here: that is what tells the database CHECK which of the two
 * kinds of change this row is.
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
import { minLength, object, optional, pipe, string } from "valibot";

import { requireInventoryPermission } from "../../index";
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
 * gone. The two `*_staff_id` columns on `inventoryCustodyHistory` are `set
 * null`, so a departed teacher leaves a trail that can still be read, just
 * without a name beside their id — a local read here rather than a join
 * because the caller is holding a row lock and this is the one name the write
 * needs on both sides of the change.
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

export const transferCustody = requireInventoryPermission("update")
  .input(
    object({
      itemId: inventoryItemIdSchema,
      newCustodianStaffId: staffIdSchema,
      /**
       * Required unconditionally by this input, which is **stricter** than the
       * database. `inventory_custody_history_reason_required` only demands a
       * reason when the changeType is not `custody_taken` (a first claim on an
       * item sitting in the store, which needs no justification because nothing
       * was displaced). Demanding one always costs a storekeeper one dropdown
       * click on the least interesting change in the feature and saves the API
       * from a branch that can only ever take one branch, because the no-op and
       * unknown-ids below are refused before the history row is written.
       */
      reason: inventoryTransferReasonSchema,
      note: optional(pipe(string(), minLength(1))),
    })
  )
  .handler(async ({ input, context }) => {
    // Every write below — the pointer, the history row, the ledger row and the
    // audit row — is one transaction, so a failure anywhere leaves the item
    // exactly as it was. A custody change without its history row would be a
    // change nobody could account for.
    const result = await context.db.transaction(async (tx) => {
      // `existing` was read FOR UPDATE. Two administrators transferring the
      // same item at the same time both read the same previous custodian here,
      // and without the lock the second history row would claim a previous
      // holder the first transfer had already overwritten.
      //
      // The actor read is batched with it because the two are independent: it
      // runs on `context.db` against `staff` and touches no inventory row, so
      // it cannot conflict with the lock, and neither result is needed to ask
      // for the other. The lock is the one that must be inside this
      // transaction — it is worthless taken on a different connection from the
      // write it guards.
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedItem(tx, input.itemId),
      ]);

      const previousCustodianName = existing.custodianStaffId
        ? await resolveStaffName(tx, existing.custodianStaffId)
        : null;

      // Refused before the assignee check, so "they already have it" is not
      // reported as "that teacher is not assignable" for a teacher who is.
      if (existing.custodianStaffId === input.newCustodianStaffId) {
        throw new ORPCError("BAD_REQUEST", {
          message: `${previousCustodianName ?? existing.custodianStaffId} is already the custodian of this item`,
        });
      }

      // The receiving teacher must be real teaching staff, active or with
      // nobody having confirmed an employment status yet. This is the
      // school-domain replacement for the source app's
      // `assertActiveOwnerExists`, and it returns the name this write needs.
      const newCustodian = await assertStaffIsAssignable(
        tx,
        input.newCustodianStaffId,
        "staff member"
      );

      // `existing.custodianStaffId` decides which of the two custody change
      // types this is. Both leave the manager columns null, which is precisely
      // what `inventory_custody_history_manager_columns` tests: the predicate
      // "changeType is a custody type" must equal "both manager columns are
      // null", so writing a manager id here would fail the insert.
      const changeType = existing.custodianStaffId
        ? "custody_transferred"
        : "custody_taken";

      await tx
        .update(inventoryItem)
        .set({ custodianStaffId: input.newCustodianStaffId })
        .where(eq(inventoryItem.id, existing.id));

      const [history] = await tx
        .insert(inventoryCustodyHistory)
        .values({
          id: crypto.randomUUID(),
          itemId: existing.id,
          previousCustodianStaffId: existing.custodianStaffId,
          newCustodianStaffId: input.newCustodianStaffId,
          // Explicit rather than omitted: the CHECK compares these two
          // columns against the change type, and a defaulted column that
          // happened to differ would be a constraint violation instead of a
          // reviewable line of code.
          previousManagerStaffId: null,
          newManagerStaffId: null,
          changeType,
          reason: input.reason,
          note: input.note ?? null,
          changedByStaffId: actor.staffId,
        })
        .returning();

      if (!history) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      // `before` and `after` are the same pair on purpose: a custody transfer
      // moves the *item* between people, and does not move a single unit in or
      // out of the store. The counters only change through the borrow and
      // stock flows, and writing identical values on both sides of a changed
      // row is what tells a reader of the ledger that nothing was counted here.
      // `borrowedQty` is in the meta unconditionally for the same reason: a
      // transfer of an item that is currently out on loan is legal (a person
      // does hand a borrowed item to a colleague) and the ledger has to be able
      // to explain it, which it cannot from a `before === after` pair alone.
      await insertInventoryTransaction(tx, {
        actor,
        action: changeType,
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(existing),
        note: input.note ?? null,
        meta: {
          previousCustodianName,
          newCustodianName: newCustodian.name,
          reason: input.reason,
          borrowedQty: existing.borrowedQty,
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "custody.transfer",
        entityType: "inventory_item",
        entityId: existing.id,
        before: {
          custodianStaffId: existing.custodianStaffId,
          custodianName: previousCustodianName,
        },
        after: {
          custodianStaffId: input.newCustodianStaffId,
          custodianName: newCustodian.name,
        },
      });

      // Everything the success toast needs. The history row is re-read rather
      // than the timestamp guessed, so the "changed at" the user sees is the
      // one that was actually written to the audit trail.
      return {
        itemId: existing.id,
        previousCustodianName,
        custodianStaffId: input.newCustodianStaffId,
        custodianName: newCustodian.name,
        changeType,
        changedAt: iso(history.changedAt),
      };
    });

    return result;
  });
