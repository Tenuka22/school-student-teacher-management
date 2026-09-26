/**
 * Close a loan: the laptop comes back.
 *
 * This is the half of the borrow flow people forget to build, and it is the
 * half that actually maintains anything. A check-out only moves a counter; a
 * check-in decides three things at once — the loan is finished, the asset tags
 * are back on the shelf, and **what condition they came back in**. That last
 * one is why `returnCondition` is required rather than optional, and why it
 * overwrites the unit's stored condition rather than being merged with it: a
 * laptop that left in "Good" and came back with a cracked hinge is now a
 * cracked-hinge laptop, and the condition on the row has to say so, because the
 * next clerk to open the cupboard is relying on it.
 *
 * Two things in here are about concurrency and one is about honesty, and all
 * three have the same shape: refuse rather than repair. Two clerks clicking
 * "Return" on the same loan at the same second is not a hypothetical, and the
 * `FOR UPDATE` on the borrow row is what makes the second one wait and then see
 * the first one's write. A counter that has drifted away from the loans it
 * claims to cover is refused for the same reason — clamping it would hide the
 * drift instead of surfacing it, and a storebook that quietly lies is worth
 * less than one that complains.
 *
 * **A student is a recorded borrower, never an actor.** A loan may name a
 * student (`borrowerStudentId`) rather than a member of staff, and it closes
 * exactly as a staff loan does — but the `student` table has no `userId` link,
 * so a student can never sign in and there is no student-facing half of this
 * flow. The person who presses Return is always a member of staff, and
 * `returnedByStaffId` is what the trail records about them. See the header on
 * `create-borrow.ts`.
 */
import { ORPCError } from "@orpc/server";
import { itemConditionSchema } from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryBorrow,
  inventoryBorrowUnit,
  inventoryItem,
  inventoryUnit,
  inventoryBorrowIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { object, optional, string } from "valibot";

import { requireInventoryPermission } from "../../index";
import {
  calculateAvailableQuantity,
  calculateItemStatus,
} from "./inventory-calculations";
import type { InventoryItemStatus } from "./inventory-calculations";
import {
  countersOf,
  describeBorrower,
  getBorrower,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
  isoOrNull,
} from "./inventory-database";
import type { InventoryBorrower } from "./inventory-database";

type BorrowRow = typeof inventoryBorrow.$inferSelect;

/**
 * A borrow row as `jsonb` should hold it. The before/after pair here is the
 * only record of *which* return condition was written onto which unit on the
 * day, once the unit row itself has moved on to a later loan.
 *
 * The resolved borrower is passed in rather than joined, for the reason it is
 * denormalised on check-out: the person is named here, so a departure cannot
 * blank the record of who was holding the kit.
 */
const borrowAuditSnapshot = (
  row: BorrowRow,
  borrower: InventoryBorrower
): Record<string, unknown> => ({
  id: row.id,
  itemId: row.itemId,
  qty: row.qty,
  borrowerStaffId: row.borrowerStaffId,
  borrowerStudentId: row.borrowerStudentId,
  borrower: {
    type: borrower.type,
    id: borrower.id,
    name: borrower.name,
    reference: borrower.reference,
    className: borrower.className,
  },
  purpose: row.purpose,
  expectedReturnDate: row.expectedReturnDate,
  approvedBy: row.approvedBy,
  note: row.note,
  status: row.status,
  borrowedByStaffId: row.borrowedByStaffId,
  borrowedAt: iso(row.borrowedAt),
  returnedAt: row.returnedAt ? iso(row.returnedAt) : null,
  returnedByStaffId: row.returnedByStaffId,
  returnCondition: row.returnCondition,
  returnNote: row.returnNote,
});

export const returnBorrow = requireInventoryPermission("update")
  .input(
    object({
      borrowId: inventoryBorrowIdSchema,
      /**
       * Required, and required *by the database too*: `inventory_borrow_return_state`
       * refuses a `returned` row without a non-null `returnCondition`. A clerk
       * who has to pick Good / Fair / Damaged / Under Repair is not being
       * asked an annoying question — they are recording the one fact the
       * return exists to capture. A return with a blank condition is discovered
       * at the next audit, which is exactly the failure the CHECK exists to
       * prevent.
       *
       * **Still required for a bulk loan**, where the item has no tagged units to
       * write it onto. The condition is recorded on `inventoryBorrow` rather than
       * on a unit, so the CHECK holds either way, and the question is not a
       * per-device one: forty chairs come back with three cracked, and "Damaged"
       * is the sentence the next storekeeper needs whether the stock was tagged or
       * merely counted. Making it optional for bulk lines would be a way of never
       * being asked.
       */
      returnCondition: itemConditionSchema,
      returnNote: optional(string()),
    })
  )
  .handler(({ input, context }) =>
    context.db.transaction(async (tx) => {
      /**
       * The borrow row's lock and the caller's identity are independent reads,
       * so they are taken together. The lock is what the guard below depends on
       * — two clerks clicking Return on the same loan at the same second both
       * read `status = "borrowed"`, both subtract the quantity from the item,
       * and the item's counter drifts below the truth, which the next
       * consistency check would then report as a register error rather than as
       * the double click it actually was. The lock makes the second transaction
       * wait, re-read `status = "returned"`, and take the CONFLICT path with a
       * timestamp the user can check against their own.
       */
      const [actor, borrowRows] = await Promise.all([
        getInventoryActor(context),
        tx
          .select()
          .from(inventoryBorrow)
          .where(eq(inventoryBorrow.id, input.borrowId))
          .limit(1)
          .for("update"),
      ]);

      const [existingBorrow] = borrowRows;

      if (!existingBorrow) {
        throw new ORPCError("NOT_FOUND", {
          message: "Borrow record not found",
        });
      }

      if (existingBorrow.status === "returned") {
        throw new ORPCError("CONFLICT", {
          message: `This loan was already returned on ${isoOrNull(existingBorrow.returnedAt) ?? "an earlier date"}`,
        });
      }

      /**
       * The item under its row lock, and the person the loan was to, taken
       * together because they are two independent reads and the person is needed
       * by everything below — the two drift refusals, both audit snapshots and
       * the response all say the same name, so it is resolved **once**. Nothing
       * about the return depends on who the borrower is, which is exactly what
       * makes that safe: a student loan closes by the same path, through the
       * same refusals and into the same words, as a teacher's.
       *
       * The item is locked so the counter read below cannot race a concurrent
       * stock movement. Lock order is borrow-then-item in every borrow path, and
       * item-then-borrow never happens, so the two cannot deadlock. The
       * borrower read takes no locks at all, which is why the two can share a
       * batch: the transaction's own connection runs them in order regardless.
       */
      const [item, borrower] = await Promise.all([
        getLockedItem(tx, existingBorrow.itemId),
        getBorrower(tx, existingBorrow),
      ]);

      // ─── Drift detection ──────────────────────────────────────────────────
      // The item claims fewer units are out on loan than this single loan says
      // it took. Something moved the counter without moving the loan (a
      // hand-edited register, a partially-applied migration, a bug in a sibling
      // flow). Subtracting anyway would drive `borrowedQty` negative, and the
      // `inventory_item_counters_nonneg` CHECK would turn that into a raw
      // constraint violation; clamping to zero would hide the drift. So: say
      // so, and send somebody to reconcile.
      //
      // The borrower is named in the message because the message is read by
      // somebody holding the register, and "this loan is for 3" does not tell
      // them which row to go and look at. It also keeps the sentence honest
      // for a student: the loan to Nimali Fernando is as real a loan as the one
      // to R. Perera, and a message that only ever spoke about staff would be a
      // small lie about half the rows in this table.
      //
      // **This half of the drift check is counter-level, so it applies to a bulk
      // loan exactly as it does to a tagged one.** `createBorrow` records
      // `meta.bulkItem` and claims no units for a counted line, which means the
      // only thing holding that loan and the item together is this pair of
      // numbers — and a bulk loan whose counter has drifted is precisely the case
      // this refusal is for. Nothing below it is weakened to let a bulk loan
      // through.
      if (item.borrowedQty < existingBorrow.qty) {
        throw new ORPCError("CONFLICT", {
          message: `The register says only ${item.borrowedQty} unit(s) are out on loan but the loan to ${describeBorrower(borrower)} is for ${existingBorrow.qty} — the counters need reconciling before this can be returned`,
        });
      }

      const returnedAt = new Date();
      const before = countersOf(item);

      // `borrowedQty` falls by the returned quantity. `qty` is untouched for
      // the same reason it is untouched on check-out: the unit never left the
      // school, so the school still owns it.
      const [updatedItem] = await tx
        .update(inventoryItem)
        .set({ borrowedQty: item.borrowedQty - existingBorrow.qty })
        .where(eq(inventoryItem.id, item.id))
        .returning();

      if (!updatedItem) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      // The *unreleased* join rows — the units this loan still has out. Locking
      // them (`FOR UPDATE` over the join) takes the unit rows too, so a
      // concurrent movement of the same asset cannot slip past between the read
      // and the update below.
      const activeUnits = await tx
        .select({
          unitId: inventoryBorrowUnit.unitId,
          uniqueNo: inventoryUnit.uniqueNo,
          normalizedUniqueNo: inventoryUnit.normalizedUniqueNo,
        })
        .from(inventoryBorrowUnit)
        .innerJoin(
          inventoryUnit,
          eq(inventoryBorrowUnit.unitId, inventoryUnit.id)
        )
        .where(
          and(
            eq(inventoryBorrowUnit.borrowId, existingBorrow.id),
            isNull(inventoryBorrowUnit.releasedAt)
          )
        )
        .for("update");

      /**
       * Whether this loan is a **bulk loan**, and the probe is deliberately the
       * *item's* unit rows rather than the borrow's.
       *
       * `createBorrow` claims nothing for a counted line, so "this loan has no
       * `inventory_borrow_unit` rows" is true for two quite different reasons: the
       * item is counted in bulk and there was never anything to attach, or the item
       * is tagged and the rows are missing — which is drift, and is refused two
       * paragraphs below. The item's own unit rows tell the two apart, and they are
       * a sound discriminator: `createItem` mints tags at creation and a counted
       * line is registered with none, and the only other writer of
       * `inventory_unit` — `stockIn` — *requires* exactly `qty` tags on every
       * delivery, so a tag cannot appear on a counted line by accident.
       *
       * **The one thing that can change it mid-loan, stated rather than glossed
       * over:** a `stockIn` delivery *against* a counted line does add tags to it,
       * and that call also makes the item's counters and its unit rows disagree
       * (200 chairs plus a 5-tag delivery is `qty = 205` with 5 unit rows) — a
       * pre-existing consequence of `stockIn` requiring a tag per unit, and not this
       * procedure's to change. If that happens while a bulk loan is open, this probe
       * says "tagged" and the return is refused as drift, which is the *conservative*
       * answer and the one this guard has always produced. The alternative — trusting
       * the emptiness and closing the loan — would be the one that hides a real
       * disagreement between the counter and the tag register.
       *
       * Run only when there is nothing attached, so the ordinary tagged check-in
       * costs the same single query it always did, and it is safe without its own
       * lock because the **item row is already held**: `getLockedItem` above took it
       * `FOR UPDATE`, and `stockIn` — the only writer this probe races — begins with
       * the same lock, so it is blocked behind this transaction and the answer cannot
       * change between the probe and the write.
       */
      let isBulkLoan = false;

      if (activeUnits.length === 0) {
        const [anyUnitOfItem] = await tx
          .select({ id: inventoryUnit.id })
          .from(inventoryUnit)
          .where(eq(inventoryUnit.itemId, item.id))
          .limit(1);

        isBulkLoan = !anyUnitOfItem;

        /**
         * The other half of the drift check, and the guard that was **wrong for a
         * bulk line**: the counter above said these units are out and this loan
         * claims them, so for a *tagged* item a join with no rows means the two
         * halves of the record disagree about what is still out, and releasing
         * nothing would quietly close the loan with the assets still marked
         * borrowed. Refuse and let a person reconcile.
         *
         * For a counted line the same emptiness is the design, not the symptom, and
         * refusing it made "a store with 200 chairs can never get them back" a
         * permanent fact. So the refusal is now conditional on the item actually
         * having tags, and what a bulk return writes is exactly what a tagged return
         * writes minus the per-device part: `borrowedQty` falls, the loan closes,
         * `returnCondition` is still recorded — it is required by
         * `inventory_borrow_return_state` and it is the same question for forty
         * chairs as for one projector — and no unit row is touched because there is
         * none to touch.
         */
        if (!isBulkLoan) {
          throw new ORPCError("CONFLICT", {
            message: `The loan to ${describeBorrower(borrower)} has no asset tags attached to it, so nothing can be put back on the shelf — the register needs reconciling before this can be returned`,
          });
        }
      }

      const unitIds = activeUnits.map((row) => row.unitId);

      // A unit only goes back on the shelf once a person has said what condition
      // it came back in. The condition is overwritten rather than merged: what
      // the clerk is recording is the device's condition *now*, and a merge
      // would let a pre-existing "Good" survive a damaged return. Skipped for a
      // bulk return for the only reason that is true — there are no rows — and not
      // because the condition was optional: it was asked for and it is written to
      // the loan either way.
      if (unitIds.length > 0) {
        await tx
          .update(inventoryUnit)
          .set({ status: "available", condition: input.returnCondition })
          .where(inArray(inventoryUnit.id, unitIds));
      }

      // Stamping `released_at` is what closes the join row without deleting it,
      // and it is what makes the partial unique index
      // `inventory_borrow_unit_active_unique` (`unit_id` where
      // `released_at is null`) free the unit for its next loan. The row itself
      // stays as the record that this asset was out on this loan and has come
      // back — nothing in this system deletes a borrow.
      //
      // Guarded on the same `unitIds.length` as the update above rather than
      // rewritten, so there is one place that knows whether this loan had
      // anything to release.
      if (unitIds.length > 0) {
        await tx
          .update(inventoryBorrowUnit)
          .set({ releasedAt: returnedAt })
          .where(
            and(
              eq(inventoryBorrowUnit.borrowId, existingBorrow.id),
              inArray(inventoryBorrowUnit.unitId, unitIds)
            )
          );
      }

      // `inventory_borrow_return_state` needs `status = "returned"` together
      // with a non-null `returnedAt` **and** a non-null `returnCondition`;
      // `returnNote` and `returnedByStaffId` are unconstrained on that arm.
      // All four were NULL on the `borrowed` row written by `createBorrow`, so
      // this UPDATE is the first and only time they are ever set.
      const [updatedBorrow] = await tx
        .update(inventoryBorrow)
        .set({
          status: "returned",
          returnedAt,
          returnedByStaffId: actor.staffId,
          returnCondition: input.returnCondition,
          returnNote: input.returnNote ?? null,
        })
        .where(eq(inventoryBorrow.id, existingBorrow.id))
        .returning();

      if (!updatedBorrow) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await insertInventoryTransaction(tx, {
        actor,
        action: "returned",
        item: { id: item.id, name: item.name, sku: item.sku },
        before,
        after: countersOf(updatedItem),
        note: `Returned ${updatedBorrow.qty} unit(s) in ${input.returnCondition} condition`,
        meta: {
          returnCondition: input.returnCondition,
          returnNote: input.returnNote ?? null,
          // The borrower, denormalised for the same reason as on check-out: a
          // closed loan's ledger row has to say whose loan it was without a
          // join, and the person it was may since have been dealt with.
          borrowerType: borrower.type,
          borrowerId: borrower.id,
          borrowerName: borrower.name,
          borrowerReference: borrower.reference,
          // The stored normalized tags, for the same reason as on check-out:
          // this ledger row is read later by somebody matching a clipboard
          // against it, and `lt-0042` is how that lookup has to be spelled.
          // Empty — never absent — for a bulk return, so this row says "counted,
          // not tagged" the same way the check-out row beside it does.
          uniqueUnitIds: activeUnits.map((row) => row.normalizedUniqueNo),
          // The counterpart of the `bulkItem` flag `createBorrow` wrote, and it is
          // written even though it is only ever `true` when there is nothing else
          // to read: a reader comparing the two rows of one bulk loan should not
          // have to infer the return's shape from an empty array.
          bulkItem: isBulkLoan,
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "borrow.return",
        entityType: "inventory_borrow",
        entityId: existingBorrow.id,
        before: borrowAuditSnapshot(existingBorrow, borrower),
        after: borrowAuditSnapshot(updatedBorrow, borrower),
      });

      return {
        id: updatedBorrow.id,
        status: updatedBorrow.status,
        returnedAt: iso(updatedBorrow.returnedAt ?? returnedAt),
        returnCondition: updatedBorrow.returnCondition,
        /**
         * The person the loan was to, resolved once above and returned so a
         * closed loan can be labelled from this response alone. A return
         * screen is the one place a clerk has just handed a device back and
         * wants to confirm it was the right one; making them re-open the row
         * to learn whose loan they just closed is the round trip this saves.
         */
        borrower,
        item: {
          qty: updatedItem.qty,
          borrowedQty: updatedItem.borrowedQty,
          availableQty: calculateAvailableQuantity(countersOf(updatedItem)),
          // Recomputed rather than left to the client, so the item's badge can
          // be updated in place from this response instead of forcing a refetch
          // of the item page the clerk is still looking at.
          status: calculateItemStatus(
            countersOf(updatedItem),
            updatedItem.condition
          ) as InventoryItemStatus,
        },
        // The values just written, not a re-read: the update above is the
        // authority on what those columns now say, and the `uniqueNo` came from
        // the locked row.
        //
        // `null` for a bulk return, and the client's toast is the reason that
        // matters: it prints `result.units.length` in "N unit(s) back on the
        // shelf", which for a counted line would read "0 unit(s) back on the
        // shelf" immediately after forty chairs were returned. `null` is the one
        // value that lets it say what actually happened.
        units:
          activeUnits.length > 0
            ? activeUnits.map((row) => ({
                id: row.unitId,
                uniqueNo: row.uniqueNo,
                status: "available" as const,
                condition: input.returnCondition,
              }))
            : null,
      };
    })
  );
