/**
 * The owner hands the item to the person they have lent it to, permanently: *"this
 * is yours now, and you are answerable for it."*
 *
 * **The accountability moves; the property does not.** Nothing here is issued,
 * lent, returned or counted — the item is in the same cupboard it was in before
 * and it will be in the same cupboard afterwards. What changes is the name a
 * principal would read out when the microscope cannot be found, and that is why
 * this is a separate verb from `transferCustody` (who is carrying it, today) and
 * from `reclaimCustody` (take it back off them) rather than another mode of
 * either.
 *
 * ## Two verbs, one column
 *
 * `newOwnerStaffId` is **required and non-nullable** here, and that is the whole
 * design in one line: this verb moves an owner to a *person*, so it cannot leave
 * the item unowned. **Clearing the owner with no successor is a different verb** —
 * `assignManager({ newManagerStaffId: null })`, which is gated on `update` and is
 * therefore administrator-only. Two verbs writing one column is deliberate, not a
 * duplicate: one of them says "somebody different is answerable for this" and the
 * other says "nobody is", and a single nullable input could not tell a caller
 * which of those a `null` was going to do. `assignManager` also stays the only
 * way to *appoint* an owner from nothing, because that is an act with no owner
 * behind it and therefore no owner to authorise it.
 *
 * ## The gate, and what the permission does not do
 *
 * The gate is `requireInventoryPermission("manageOwn")`, **not** `update`. An
 * owner in this school is usually a `teacher`, and a `teacher` holds
 * `inventory: ["read", "take", "manageOwn"]` — so gating this on `update` would
 * mean the owner cannot hand on their own responsibility, which is the one thing
 * this procedure exists to let them do. The reason `update` is still the wrong
 * gate is unchanged: it guards `transferCustody`, `assignManager`, `updateItem`,
 * `updateUnit`, `stockOut`, `returnBorrow` and `cancelDisposal`, and granting a
 * teacher `update` to reach the "transfer ownership" button would hand them all
 * seven of those with it.
 *
 * **The permission is not the security control, and this handler is.** A grant
 * says *which procedures may run*; it can never say *which rows they may touch*,
 * and `manageOwn` is the sharpest case of that in the whole statement, because
 * its name names a scope ("your own") that an access-control statement has no way
 * to express. So the check that matters is the `isOwnerOrLeadership` one below:
 * a caller who is not `managerStaffId` and not in the three leadership seats is
 * refused, **even though their role holds the permission**. If somebody widens
 * this procedure's gate later without moving that check, the permission alone
 * would hand every teacher the power to reassign every item in the school. The
 * scoping lives here and nowhere else, which is the same invariant the `teacher`
 * role comment in `packages/auth/src/permissions.ts` states.
 *
 * ## Why the holder is cleared
 *
 * `custodianStaffId` is set to `null` as part of the transfer, and the reasoning
 * is in the handler: a record that reads "R. Perera owns it and S. Fernando is
 * holding it" *after the ownership has just changed hands* is almost always a
 * data-entry slip rather than an intent, because the new owner is by definition
 * the accountable party and there is no longer a separate question of who has it
 * to answer. If the new owner is physically sitting on it — which is the ordinary
 * case, since the motivating scenario is an item lent to a colleague — they can
 * record that with `takeItem`, which is a deliberate act they have to perform
 * rather than a side effect of someone else's paperwork. The alternative, leaving
 * the holder in place, would make every transfer produce a state the register
 * would have to keep explaining.
 *
 * Because the holder is cleared, the transfer writes **two** history rows and not
 * one, and each of them fills exactly one pair of the four staff columns — which
 * is what `inventory_custody_history_manager_columns` requires and why the two
 * rows cannot be merged into a single row that fills both pairs.
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
 * The three leadership seats, restated from `ADMIN_ROLES` in
 * `packages/api/src/index.ts:77` rather than imported — that list is module
 * private there, and a second copy with a pointer is cheaper than widening a
 * module's public surface for one scoping guard. `release-custody.ts`,
 * `list-items.ts`, `list-custody-history.ts` and `transfer-ownership.ts`'s
 * sibling `reclaim-custody.ts` each carry the same copy for the same reason.
 */
const ADMIN_ROLES = new Set(["admin", "principal", "vicePrincipal"]);

/**
 * The display name behind a `staff` pointer, or null once that staff row is
 * gone. The four `*_staff_id` columns on `inventoryCustodyHistory` are `set
 * null`, so a departed teacher leaves a trail that can still be read, just
 * without a name beside their id.
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
 * May this caller reassign the owner of this item?
 *
 * Two ways to answer yes, and the difference between them is the point:
 *
 * - **The owner themself** may hand their own responsibility on. This is the case
 *   the procedure exists for, and it is why a `teacher` needs a gate at all.
 * - **A leadership seat** may reassign on an owner's behalf, which is what makes
 *   the action usable when the owner has left the school, is on long absence, or
 *   simply cannot be reached. An *ordinary* member of staff may **not** — a
 *   colleague who happens to be able to see the item has no standing to decide
 *   who answers for it, and `manageOwn` is a grant to the owner rather than a
 *   promotion.
 *
 * Returns the owner only for the refusal message; `true` otherwise, so the caller
 * cannot accidentally use a truthy value as a name.
 */
const mayReassignOwner = (
  role: string,
  ownerStaffId: string | null,
  actorStaffId: string | null
): boolean =>
  (ownerStaffId !== null && ownerStaffId === actorStaffId) ||
  ADMIN_ROLES.has(role);

export const transferOwnership = requireInventoryPermission("manageOwn")
  .input(
    object({
      itemId: inventoryItemIdSchema,
      /**
       * Required, non-nullable, and **not** the current custodian by
       * construction. See the file comment: the motivating case is "the person I
       * lent it to", but nothing forces the successor to be the current holder,
       * because an owner giving their item to a colleague who has never touched
       * it is an ordinary thing to want and the holder is cleared either way.
       * Clearing the owner instead is `assignManager({ newManagerStaffId: null })`.
       */
      newOwnerStaffId: staffIdSchema,
      /**
       * Required unconditionally, and it is not free text — it is a member of the
       * closed `INVENTORY_TRANSFER_REASONS` vocabulary, so a report can group
       * ownership handovers by cause. `inventory_custody_history_reason_required`
       * would in fact refuse this row without one, since `manager_changed` is not
       * one of the two exempt change types.
       */
      reason: inventoryTransferReasonSchema,
      note: optional(pipe(string(), minLength(1))),
    })
  )
  .handler(async ({ input, context }) => {
    // One transaction for the pointer, both history rows, the ledger row and the
    // audit row. A transfer that wrote the new owner without its trail would
    // leave the register claiming a state nobody could account for.
    const result = await context.db.transaction(async (tx) => {
      // `existing` was read FOR UPDATE. Two callers reassigning the same item
      // concurrently would otherwise both read the same previous owner, and the
      // second history row would claim a predecessor the first transfer had
      // already overwritten. The lock is on the **item** and not on a history row
      // because the item is the thing being contended: the history table is
      // append-only, so two writers there never conflict, while two writers of
      // `managerStaffId` do.
      //
      // The actor read is batched with it because the two are independent: it
      // runs on `context.db` against `staff` and touches no inventory row, so it
      // cannot race the lock, and neither result is needed to ask for the other.
      // The lock is the one that must be inside this transaction — taken on a
      // different connection from the write it guards, it is worthless.
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedItem(tx, input.itemId),
      ]);

      // Both names are read before the first refusal, because both the
      // authorization message and the ledger row need one and neither can be
      // produced from the locked row — `inventoryItem` carries ids, not names.
      const previousOwnerName = existing.managerStaffId
        ? await resolveStaffName(tx, existing.managerStaffId)
        : null;
      const previousCustodianName = existing.custodianStaffId
        ? await resolveStaffName(tx, existing.custodianStaffId)
        : null;

      // The security control. See the file comment: the permission says the
      // procedure may run, and this says whose item it may run against. Named
      // before the check so the refusal can tell the caller who to ask.
      if (
        !mayReassignOwner(
          context.session?.user.role ?? "",
          existing.managerStaffId,
          actor.staffId
        )
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: previousOwnerName
            ? `${previousOwnerName} is in charge of this item, so only they can hand on the ownership of it`
            : "This item has nobody in charge of it, so only an administrator can hand on the ownership of it",
        });
      }

      // The receiving teacher must be real teaching staff, active or with nobody
      // having confirmed an employment status yet — the school-domain
      // replacement for the source app's `assertActiveOwnerExists`. Returns the
      // name this write needs on the new side of the change.
      const newOwner = await assertStaffIsAssignable(
        tx,
        input.newOwnerStaffId,
        "staff member"
      );

      // Refused as a no-op rather than written as a `manager_changed` row that
      // changes nothing: a trail entry that says a responsibility moved when it
      // did not is the kind of row an audit cannot use.
      if (existing.managerStaffId === input.newOwnerStaffId) {
        throw new ORPCError("CONFLICT", {
          message: `${newOwner.name} is already in charge of this item`,
        });
      }

      // **Load-bearing guard.** An item with units out on a dated loan is not in
      // the owner's hands to give away: the units are with a borrower under an
      // `inventoryBorrow` row with a due date, and the person who made this
      // request is not the person the register currently holds responsible for
      // them. Moving the owner would create a record the register cannot honour —
      // a new owner who has never seen the equipment and is answerable for a loan
      // they did not take out, while the borrow still names somebody else
      // returning it. The return flow is the route that closes the loan and
      // records the condition it came back in, and it has to happen first.
      //
      // `transferCustody` deliberately does **not** guard this (a person does hand
      // a borrowed item to a colleague, and it is recorded), and the reason the
      // two differ is the column each one writes: custody does not change who is
      // answerable, ownership is nothing but who is answerable.
      if (existing.borrowedQty > 0) {
        throw new ORPCError("CONFLICT", {
          message:
            "This item is out on loan, so the loan has to be closed through the borrow return flow before the ownership of it can change hands",
        });
      }

      // **The holder is cleared, not carried over.** See the file comment for the
      // full argument: a record reading "X owns it, Y is holding it" immediately
      // after the ownership changed hands is a data-entry slip far more often
      // than it is an intent, the new owner is now the accountable party, and a
      // new owner who is physically sitting on the item can say so themselves
      // with `takeItem`. Clearing it is also what makes the second history row
      // below necessary rather than optional.
      await tx
        .update(inventoryItem)
        .set({
          managerStaffId: input.newOwnerStaffId,
          custodianStaffId: null,
        })
        .where(eq(inventoryItem.id, existing.id));

      // Two rows, because two pointers moved and the CHECK requires each row to
      // describe exactly one of them: `inventory_custody_history_manager_columns`
      // treats "this is a custody type" and "both manager columns are null" as
      // the same fact, so a single row filling both pairs would be refused. The
      // explicit nulls below are the reason the two rows are not a merge.
      const historyValues = [
        {
          id: crypto.randomUUID(),
          itemId: existing.id,
          // The manager change. Both custodian columns are null because who was
          // carrying the item is not a fact *this* row records.
          previousCustodianStaffId: null,
          newCustodianStaffId: null,
          previousManagerStaffId: existing.managerStaffId,
          newManagerStaffId: input.newOwnerStaffId,
          changeType: "manager_changed",
          reason: input.reason,
          note: input.note ?? null,
          changedByStaffId: actor.staffId,
        },
        // The release of the holder, written **only when there was a holder**. An
        // item sitting unheld in the store has nothing to release, and a
        // `custody_released` row with a null previous custodian would be a claim
        // that somebody gave something back.
        ...(existing.custodianStaffId
          ? [
              {
                id: crypto.randomUUID(),
                itemId: existing.id,
                previousCustodianStaffId: existing.custodianStaffId,
                newCustodianStaffId: null,
                // Both manager columns null, for the same CHECK as above.
                previousManagerStaffId: null,
                newManagerStaffId: null,
                changeType: "custody_released",
                reason: input.reason,
                note: input.note ?? null,
                changedByStaffId: actor.staffId,
              },
            ]
          : []),
      ];

      const historyRows = await tx
        .insert(inventoryCustodyHistory)
        .values(historyValues)
        .returning();

      // Matched by `changeType` rather than by position: a multi-row `INSERT ...
      // RETURNING` is not contractually ordered, and a transfer whose ledger said
      // "released at 09:14" because it read the wrong row of the two would be a
      // lie nobody could later disprove. Both rows are required, because a
      // transaction commits whatever was written — a missing row is a silent gap
      // in the trail, not a rolled-back transfer.
      const managerHistory = historyRows.find(
        (row) => row.changeType === "manager_changed"
      );
      const releaseHistory = historyRows.find(
        (row) => row.changeType === "custody_released"
      );
      if (!managerHistory || (existing.custodianStaffId && !releaseHistory)) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      // `before` and `after` are the same pair on purpose: ownership moved, stock
      // did not. The item is in the same cupboard and no unit crossed a boundary,
      // so the counters are written identically on both sides and the meta carries
      // the cause instead. That is what tells a reader of the ledger that nothing
      // was counted here — the same reasoning as `assignManager`, and the reason a
      // counter ledger that only wrote deltas would not be able to say so.
      await insertInventoryTransaction(tx, {
        actor,
        action: "manager_changed",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(existing),
        note: input.note ?? null,
        meta: {
          previousOwnerName,
          newOwnerName: newOwner.name,
          // Null whenever the item was sitting unheld, which is the ordinary case
          // for a transfer and is exactly what the second history row records.
          previousCustodianName,
          reason: input.reason,
        },
      });

      // `ownership.transfer` rather than `manager.change` (which `assignManager`
      // writes): the audit log's job is to be readable by a person who does not
      // know the schema, and "ownership was transferred" is the sentence they
      // would have written. `before` / `after` carry both pointers because this
      // verb moved both.
      await insertInventoryAuditLog(tx, {
        actor,
        action: "ownership.transfer",
        entityType: "inventory_item",
        entityId: existing.id,
        before: {
          managerStaffId: existing.managerStaffId,
          managerName: previousOwnerName,
          custodianStaffId: existing.custodianStaffId,
          custodianName: previousCustodianName,
        },
        after: {
          managerStaffId: input.newOwnerStaffId,
          managerName: newOwner.name,
          custodianStaffId: null,
          custodianName: null,
        },
      });

      // The same shape `assignManager` returns, field for field, so the web app
      // renders one success component for "reassigned" and "handed on" and the
      // caller never has to re-read the item to learn who answers for it now. The
      // timestamp is re-read from the row that was written rather than guessed, so
      // the "changed at" the user sees is the one in the audit trail.
      return {
        itemId: existing.id,
        previousOwnerName,
        managerStaffId: input.newOwnerStaffId,
        managerName: newOwner.name,
        changeType: "manager_changed" as const,
        changedAt: iso(managerHistory.changedAt),
      };
    });

    return result;
  });
