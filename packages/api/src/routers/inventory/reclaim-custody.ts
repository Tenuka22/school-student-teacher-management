/**
 * The owner demands an item back off the colleague who is holding it.
 *
 * **This is the owner's authority, and that is a different act from
 * `releaseCustody`, which is why it is a different verb.** `releaseCustody` is
 * the holder's own voluntary hand-back: it sits on the narrow `take` grant, is
 * deliberately narrowed to the person holding the item, and exists so that
 * `takeItem` is not a one-way door. This is the other direction — somebody who is
 * *not* holding the item uses their standing as the person answerable for it to
 * take it back. Collapsing the two would either let a holder's hand-back be
 * demanded by anyone (the opposite of what `take` means) or let an owner's
 * reclaim be refused because the owner was not the custodian (which would make
 * the verb useless — the whole premise is that the caller is not the holder).
 *
 * ## What changes, and what emphatically does not
 *
 * Only `custodianStaffId` is cleared. `managerStaffId` is **left exactly as it
 * was**, and that is the load-bearing decision in this file: reclaiming custody is
 * not transferring ownership, and a procedure that quietly moved the manager
 * column would move accountability by accident — the caller would be demanding
 * the item back and simultaneously declaring themselves still answerable for it,
 * which is a different and much larger claim than the one they made. `qty`,
 * `borrowedQty`, the unit rows and the loan records are all untouched, because
 * **the item never physically moved.**
 *
 * That last point is what distinguishes this from every other mutation in this
 * folder, and it is worth stating for the reader of the ledger: a
 * `custody_released` row here appears with **no counter movement on either side**,
 * and that is correct rather than a bug. `transferCustody` and `takeItem` also
 * write identical counters, but they do so because a hand-over is a change of
 * hands; here there was no movement of any kind — a register said one thing and a
 * teacher said another, and the teacher's version was right.
 *
 * ## The gate, and what the permission does not do
 *
 * The gate is `requireInventoryPermission("manageOwn")`, **not** `update`, for
 * the same reason as `transfer-ownership.ts`: an owner here is usually a
 * `teacher`, and a `teacher` does not hold `update`. `update` guards
 * `transferCustody`, `assignManager`, `updateItem`, `updateUnit`, `stockOut`,
 * `returnBorrow` and `cancelDisposal`, and granting it to reach this button would
 * hand over all seven.
 *
 * **The permission is not the security control and this handler is.** A grant says
 * *which procedures may run*; it can never say *which rows they may touch*, and
 * `manageOwn`'s name names a scope an access-control statement cannot express.
 * So the check below — caller is `managerStaffId`, or is one of the three
 * leadership seats acting on an owner's behalf — is the thing standing between a
 * teacher and a colleague's equipment. An ordinary member of staff is refused
 * even though their role holds the permission. The scoping lives here and nowhere
 * else, which is the invariant the `teacher` role comment in
 * `packages/auth/src/permissions.ts` states.
 */
import { ORPCError } from "@orpc/server";
import { inventoryTransferReasonSchema } from "@school-student-teacher-management/db/constants/inventory";
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
 * The three leadership seats, restated from `ADMIN_ROLES` in
 * `packages/api/src/index.ts:77` rather than imported — that list is module
 * private there, and a second copy with a pointer is cheaper than widening a
 * module's public surface for one scoping guard. `release-custody.ts`,
 * `list-items.ts`, `list-custody-history.ts` and `transfer-ownership.ts` each
 * carry the same copy for the same reason.
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

export const reclaimCustody = requireInventoryPermission("manageOwn")
  .input(
    object({
      itemId: inventoryItemIdSchema,
      /**
       * Required, and required rather than optional for a reason that has nothing
       * to do with the database: this is the act that takes property out of a
       * colleague's hands, it lands in a permanent trail, and the closed
       * `INVENTORY_TRANSFER_REASONS` vocabulary means a report can answer "how
       * much equipment did owners have to call back, and why" — which is the
       * question a department head asks when a reclaim rate is not what they
       * expected. `inventory_custody_history_reason_required` would refuse the row
       * without one anyway, since `custody_released` is not one of the two exempt
       * change types; requiring it here means the cost is a dropdown on the way
       * in rather than a constraint violation on the way out.
       */
      reason: inventoryTransferReasonSchema,
      note: optional(pipe(string(), minLength(1))),
    })
  )
  .handler(async ({ input, context }) => {
    // One transaction for the pointer, the history row, the ledger row and the
    // audit row: a reclaim without its history row would leave the register
    // asserting that a colleague still has the item, with nothing recording that
    // the owner asked for it back.
    const result = await context.db.transaction(async (tx) => {
      // `existing` was read FOR UPDATE, and the reason is the same as in
      // `transfer-custody.ts`: two callers reclaiming the same item concurrently
      // would both read the same previous holder, and the second history row would
      // claim a custodian the first reclaim had already cleared. The lock is on
      // the **item** because the item is what is contended — the history table is
      // append-only, so two writers there never conflict.
      //
      // The actor read is batched with it because the two are independent: it
      // runs on `context.db` against `staff` and touches no inventory row, so it
      // cannot race the lock, and neither result is needed to ask for the other.
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedItem(tx, input.itemId),
      ]);

      // Read before the first refusal, because the authorization message has to
      // name the person whose item it is.
      const ownerName = existing.managerStaffId
        ? await resolveStaffName(tx, existing.managerStaffId)
        : null;

      // The security control — see the file comment. The permission says the
      // procedure may run; this says whose item it may run against. FORBIDDEN
      // rather than CONFLICT because the question is "may you", not "is this
      // possible", and because a caller who is neither the owner nor leadership
      // must learn nothing about whether the item exists beyond the `NOT_FOUND`
      // `getLockedItem` already produced.
      const isOwner = existing.managerStaffId === actor.staffId;
      const isLeadership = ADMIN_ROLES.has(context.session?.user.role ?? "");
      if (!isOwner && !isLeadership) {
        throw new ORPCError("FORBIDDEN", {
          message: ownerName
            ? `${ownerName} is in charge of this item, so only they can call it back`
            : "This item has nobody in charge of it, so only an administrator can call it back",
        });
      }

      // Nothing to reclaim. Said before the loan guard so a caller who has
      // misread an item sitting unheld in the store is told the truth about that
      // rather than about a loan they may not know exists.
      if (!existing.custodianStaffId) {
        throw new ORPCError("CONFLICT", {
          message:
            "This item is not in anybody's custody, so there is nothing to call back",
        });
      }

      // **Load-bearing guard, and a different refusal from the one in
      // `release-custody.ts` even though it tests the same column.** Units out on
      // a dated loan are with a borrower under an `inventoryBorrow` row, not with
      // the custodian pointer: the physical object the custodian pointer describes
      // is somewhere else, and clearing the pointer here would assert that
      // somebody is looking after equipment that is in fact out with a student on
      // a due date. It has to come back through the **return flow**
      // (`orpc.inventory.borrows.return`), which is the process that records the
      // date it came back, who returned it and **the condition it came back in** —
      // and that last field is the whole reason this is refused rather than
      // allowed. A reclaim that quietly pre-empted a return would file the
      // condition assessment that only someone actually holding the object can give.
      if (existing.borrowedQty > 0) {
        throw new ORPCError("CONFLICT", {
          message:
            "This item is out on loan, so it has to come back through the borrow return flow (`borrows.return`), which records the condition it came back in, before its custody can be called in",
        });
      }

      const previousCustodianName = await resolveStaffName(
        tx,
        existing.custodianStaffId
      );

      // **`managerStaffId` is not in this `set`, on purpose.** Reclaiming custody
      // is not transferring ownership: the owner demanded the item back, which
      // says nothing about who answers for it afterwards, and writing the manager
      // column here would move accountability by accident. See the file comment.
      // Nothing else is touched either — no counters, no units, no loan record.
      await tx
        .update(inventoryItem)
        .set({ custodianStaffId: null })
        .where(eq(inventoryItem.id, existing.id));

      // One row, and the four staff columns are the whole story: the previous
      // custodian is named, the new one is null, and **both manager columns are
      // null** because this row is about custody and nothing else.
      // `inventory_custody_history_manager_columns` requires exactly that
      // equivalence — "is a custody type" must equal "both manager columns are
      // null" — and writing the owner's id here would fail the insert. The reason
      // is the closed transfer vocabulary rather than free text, and it is
      // required by `inventory_custody_history_reason_required` because
      // `custody_released` is not one of the two exempt change types.
      const [history] = await tx
        .insert(inventoryCustodyHistory)
        .values({
          id: crypto.randomUUID(),
          itemId: existing.id,
          previousCustodianStaffId: existing.custodianStaffId,
          newCustodianStaffId: null,
          // Explicit rather than omitted: the CHECK compares these two columns
          // against the change type, and a defaulted column that happened to
          // differ would be a constraint violation instead of a reviewable line of
          // code.
          previousManagerStaffId: null,
          newManagerStaffId: null,
          changeType: "custody_released",
          reason: input.reason,
          note: input.note ?? null,
          changedByStaffId: actor.staffId,
        })
        .returning();

      if (!history) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      // `before` and `after` are the same pair, and this is the ledger row where
      // that is most worth a reader's attention: **nothing was counted, because
      // nothing moved.** No unit crossed a boundary and no stock figure changed,
      // so identical counters on both sides are the honest record, and the meta
      // carries the cause instead. A reader who sees a `custody_released` row with
      // no counter movement should read it as "the register was corrected", not as
      // a missing entry.
      await insertInventoryTransaction(tx, {
        actor,
        action: "custody_released",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(existing),
        note: input.note ?? null,
        meta: { previousCustodianName, reason: input.reason },
      });

      // `custody.reclaim` rather than `custody.release` (which `releaseCustody`
      // writes) — and not `custody.transfer` either, which would imply the item
      // moved. The audit log is read by people, and "the owner called this item
      // back" is a different sentence from either of those. Both pointers are in
      // the before/after pair even though only one moved, so a reader can see that
      // the owner did not change.
      await insertInventoryAuditLog(tx, {
        actor,
        action: "custody.reclaim",
        entityType: "inventory_item",
        entityId: existing.id,
        before: {
          custodianStaffId: existing.custodianStaffId,
          custodianName: previousCustodianName,
          managerStaffId: existing.managerStaffId,
          managerName: ownerName,
        },
        after: {
          custodianStaffId: null,
          custodianName: null,
          // Unchanged, and written down as unchanged.
          managerStaffId: existing.managerStaffId,
          managerName: ownerName,
        },
      });

      // Mirrors `releaseCustody`'s return shape, so the web app renders one
      // success component for "handed back" and "called in" — `custodianStaffId`
      // and `custodianName` are literal nulls rather than a re-read of the row.
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
