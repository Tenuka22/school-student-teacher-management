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
 * the item unowned. **Nothing in this folder can leave an item unowned or
 * unheld either** — `assignManager` takes a required successor for the same
 * reason, so "nobody is answerable for this" and "nobody has this" are both
 * states the register cannot express. `assignManager` also stays the only way
 * to *appoint* an owner from nothing, because that is an act with no owner
 * behind it and therefore no owner to authorise it — the case that survives is
 * a legacy row written before both pointers were required.
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
 * ## Why the holder becomes the new owner
 *
 * `custodianStaffId` is set to `input.newOwnerStaffId` as part of the transfer,
 * never cleared, because `inventory_item.custodian_staff_id` is `NOT NULL` and
 * the register has no "nobody has this" state to clear into. Between "whoever
 * happened to be holding it" and "the person now answerable for it", the
 * accountable party wins: the new owner is by definition the person the register
 * should say has it. If they are not physically on the item yet, the correction
 * is a fresh act by whoever knows the truth — the previous holder's own
 * `transferCustody`, or the new owner's `takeItem` — rather than a side effect
 * of someone else's paperwork. Leaving the previous holder in place would make
 * every transfer produce a state the register would have to keep explaining
 * ("R. Perera owns it, but S. Fernando still has it?").
 *
 * When the holder already **is** the new owner — the ordinary motivating case,
 * an item lent to a colleague who is being given it — custody does not move at
 * all, and the transfer writes **one** history row rather than two. When it is
 * not, it writes **two** and each fills exactly one pair of the four staff
 * columns, which is what `inventory_custody_history_manager_columns` requires
 * and why the two rows cannot be merged into a single row that fills both pairs.
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

import { requireInventoryPermission } from "../../index";
import type { Executor } from "./inventory-database";
import {
  assertStaffIsAssignable,
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertCustodyNoticeRecipients,
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
  actorStaffId: string
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
       * it is an ordinary thing to want. Either way the holder becomes
       * `newOwnerStaffId` — it can never be cleared, and appointing an owner
       * from nothing is `assignManager`'s job, not this verb's.
       */
      newOwnerStaffId: staffRefSchema,
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

      // **The holder becomes the new owner, not cleared.** See the file comment
      // for the full argument: `custodian_staff_id` is `NOT NULL` so there is
      // no empty state to clear into, and of the two available stories — "the
      // owner has it" versus "the previous holder still has it" — the
      // accountable party is the one the register should name. A holder who
      // disagrees says so with their own act (`transferCustody` or `takeItem`)
      // rather than having this transfer guess for them.
      //
      // `custodyMoved` decides whether a second history row is needed: when the
      // holder already is the new owner (the item was lent to exactly this
      // person), custody does not move and one row is the whole story.
      const custodyMoved = existing.custodianStaffId !== input.newOwnerStaffId;
      await tx
        .update(inventoryItem)
        .set({
          managerStaffId: input.newOwnerStaffId,
          custodianStaffId: input.newOwnerStaffId,
        })
        .where(eq(inventoryItem.id, existing.id));

      // Two rows when two pointers moved, because the CHECK requires each row
      // to describe exactly one of them:
      // `inventory_custody_history_manager_columns` treats "this is a custody
      // type" and "both manager columns are null" as the same fact, so a single
      // row filling both pairs would be refused. The explicit nulls below are
      // the reason the two rows are not a merge.
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
        // The release of the holder, written **only when the holder actually
        // changed** — when it already was the new owner there is no custody
        // movement to record, and a row whose previous and new columns are the
        // same person would be a claim that something happened.
        //
        // `custody_released` rather than `custody_transferred`, carrying the new
        // owner as its successor: an ownership change starts a **new chapter**
        // in the derived custody chain (see `getUpstreamSubManagerStaffIds`),
        // exactly as it did when this row could name a null successor — the
        // previous owner's era of hand-overs ends here, and the new owner's
        // begins with them holding it.
        ...(custodyMoved
          ? [
              {
                id: crypto.randomUUID(),
                itemId: existing.id,
                previousCustodianStaffId: existing.custodianStaffId,
                newCustodianStaffId: input.newOwnerStaffId,
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
      // lie nobody could later disprove. The custody row is required whenever
      // `custodyMoved` says one was written, because a transaction commits
      // whatever was written — a missing row is a silent gap in the trail, not a
      // rolled-back transfer.
      const managerHistory = historyRows.find(
        (row) => row.changeType === "manager_changed"
      );
      const custodyHistory = historyRows.find(
        (row) => row.changeType === "custody_released"
      );
      if (!managerHistory || (custodyMoved && !custodyHistory)) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      if (custodyHistory) {
        // The new owner, not `existing.managerStaffId` — the item's
        // `managerStaffId` column was just moved to `input.newOwnerStaffId` in
        // the update above, and "who is the manager" for a notice always means
        // the item as it stands now, the same live read every other custody
        // notice uses.
        await insertCustodyNoticeRecipients(tx, {
          custodyHistoryId: custodyHistory.id,
          itemId: existing.id,
          previousCustodianStaffId: existing.custodianStaffId,
          managerStaffId: input.newOwnerStaffId,
          changedByStaffId: actor.staffId,
        });
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
          // The holder before the transfer: the person the second history row
          // records as handing over to the new owner, present whenever
          // `custodyMoved` — which, since the holder becomes the new owner, is
          // exactly when the two were different people.
          previousCustodianName,
          reason: input.reason,
        },
      });

      // `ownership.transfer` rather than `manager.change` (which `assignManager`
      // writes): the audit log's job is to be readable by a person who does not
      // know the schema, and "ownership was transferred" is the sentence they
      // would have written. `before` / `after` carry both pointers — the holder
      // before the transfer and the holder after it, which is the new owner
      // either way, so a reader can see at a glance whether custody moved too.
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
          custodianStaffId: input.newOwnerStaffId,
          custodianName: newOwner.name,
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
