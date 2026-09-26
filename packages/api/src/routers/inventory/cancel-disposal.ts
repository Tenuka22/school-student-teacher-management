/**
 * Withdraw a write-off request. **No stock moves, and the request does not
 * vanish.**
 *
 * This procedure exists because the source app had a hole. `cancelled` was in
 * `DISPOSAL_STATUSES`, it was an arm of the `inventory_disposal_status_state`
 * ladder, and it had a label — but no procedure in the source repo's
 * `disposals.ts` could set it. Every write path went `pending_approval` →
 * `approved` → one of the six finals, and none of them had a "we got this
 * wrong" exit. So a request that turned out to be based on a miscount, a
 * duplicated tag or a projector that turned out to be working had **nowhere to
 * go**: it sat in the queue looking actionable, and the only way to stop it was
 * for someone to edit the row in a database console. This is that exit, and the
 * reason the `cancelled` arm of the ladder is as tight as the final arm — see
 * `inventoryDisposal`'s doc comment, which says exactly this: a certificate that
 * says "cancelled", names nobody and happened at no time is indistinguishable
 * from a request that was never looked at.
 *
 * **The reason is mandatory, and the 500-character cap is deliberate.** This is
 * the only input in the whole flow that is required. A cancellation with no
 * stated cause is how an asset register becomes unauditable: the next person to
 * ask "why was this write-off dropped?" gets nothing, and the answer was known at
 * the moment it was dropped. The cap keeps the answer a sentence rather than a
 * pasted log, which is what makes it readable on the certificate a year later.
 *
 * **The stock counters do not change, and that is the point.** A cancellation is
 * a change of mind about a *certificate*, not a movement of stock: no unit left
 * the store, so there is nothing to reverse. Writing a `stock_in` row here — the
 * instinct, and a wrong one twice over — would corrupt the ledger in two separate
 * ways: it would add `qty` that was never subtracted, and it would make the
 * feed claim the school received stock on a day nothing was delivered. The
 * ledger row below is written with the item's real counters on **both** sides,
 * which is how every other non-movement in this module (`custody_transferred`,
 * `disposal_requested`, `disposal_approved`) says "nothing was counted here".
 *
 * The `getLockedDisposal` helper below is duplicated verbatim in
 * `approve-disposal.ts` and `finalize-disposal.ts` — see that file for why.
 */
import { ORPCError } from "@orpc/server";
import {
  DISPOSAL_FINAL_STATUSES,
  disposalStatusLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryDisposal,
  inventoryDisposalIdSchema,
  inventoryDisposalStatusHistory,
  inventoryDisposalUnit,
  inventoryItem,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, eq, isNull } from "drizzle-orm";
import { maxLength, minLength, object, pipe, string } from "valibot";

import { adminOnlyProcedure } from "../../index";
import type { Executor } from "./inventory-database";
import {
  countersOf,
  getInventoryActor,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
  isoOrNull,
} from "./inventory-database";

/** Read one disposal under a row lock. Duplicated; see the module comment. */
const getLockedDisposal = async (db: Executor, disposalId: string) => {
  const [record] = await db
    .select()
    .from(inventoryDisposal)
    .where(eq(inventoryDisposal.id, disposalId))
    .limit(1)
    .for("update");

  if (!record) {
    throw new ORPCError("NOT_FOUND", { message: "Disposal request not found" });
  }

  return record;
};

/**
 * The six outcomes that are a certificate rather than a proposal. Membership is
 * tested against `DISPOSAL_FINAL_STATUSES` so that adding a seventh terminal
 * outcome in `constants/inventory.ts` widens this guard in the same commit
 * instead of leaving it able to cancel a finalised write-off.
 */
const isFinalOutcome = (status: string): boolean =>
  (DISPOSAL_FINAL_STATUSES as readonly string[]).includes(status);

export const cancelDisposal = adminOnlyProcedure
  .input(
    object({
      disposalId: inventoryDisposalIdSchema,
      /**
       * Required, no exceptions, and capped — see the module comment. It is
       * written to three places on purpose: `inventoryDisposal.cancellationReason`
       * on the certificate, the status-history row's `note` so the transition
       * reads on its own, and the ledger row's `note`.
       */
      reason: pipe(string(), minLength(1), maxLength(500)),
    })
  )
  .handler(async ({ input, context }) => {
    // Resolved before the transaction opens: `getInventoryActor` reads `staff`
    // through `context.db`, a different connection from the transaction either
    // way, and the disposal lock has to be taken before anything reads the
    // certificate. The check on the actor stays inside the transaction, after the
    // record is read, so a missing or already-finalised disposal still reports
    // that rather than the caller's identity.
    const actor = await getInventoryActor(context);

    return context.db.transaction(async (tx) => {
      const existing = await getLockedDisposal(tx, input.disposalId);

      /**
       * A finalised disposal is a certificate that has been issued, and an issued
       * certificate is not withdrawn — it is superseded. Nothing here undoes the
       * `qty` decrement or the `disposed` units, and pretending otherwise would
       * leave the storebook disagreeing with the certificate.
       */
      if (isFinalOutcome(existing.status)) {
        throw new ORPCError("CONFLICT", {
          message: `This write-off is already ${disposalStatusLabel(existing.status)} and cannot be withdrawn — a finalised certificate is not reversible`,
        });
      }

      if (existing.status === "cancelled") {
        throw new ORPCError("CONFLICT", {
          message: `This request was already cancelled on ${isoOrNull(existing.cancelledAt) ?? "an earlier occasion"}`,
        });
      }

      /**
       * A cancellation the schema cannot record. The `cancelled` arm of
       * `inventory_disposal_status_state` requires
       * `cancelled_by_staff_id IS NOT NULL`, and `InventoryActor.staffId` is null
       * for the seeded `admin` / `principal` / `deputy-principal` seats. That
       * write is refused by PostgreSQL however it is composed, so it is refused
       * here — `BAD_REQUEST`, never `FORBIDDEN`, because the `update` permission
       * has already been granted and the missing thing is an identity the
       * certificate can name rather than an authority to act. Same remedy, same
       * wording as `approveDisposal` and `take-item`.
       */
      if (actor.staffId === null) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Your account has no staff record, so it cannot be recorded as cancelling a disposal request. Ask an administrator to link your account to your staff profile",
        });
      }

      // Reaching here means `existing.status` is `pending_approval` or
      // `approved`, which are the only two the ladder's `cancelled` arm accepts
      // alongside this procedure. Cancelling from `approved` is the interesting
      // case and the reason this procedure exists: the request was signed off by
      // somebody, and then turned out to be wrong. That sequence — signature,
      // then withdrawal, with both the signature and the reason on the record — is
      // exactly the kind of thing an audit asks about, and in the source app it
      // was unrecordable.

      /**
       * The pinned units, read for the audit trail and then released.
       * `FOR UPDATE` because a concurrent `finalizeDisposal` of this same
       * certificate must not be able to read a half-released set of pins.
       *
       * **Nothing about `inventoryUnit` changes here, and that is a fact about
       * the flow rather than an oversight.** `createDisposal` inserts pin rows
       * and leaves `inventoryUnit.status` at `available`; only `finalizeDisposal`
       * writes `disposed`. A cancelled request has therefore never moved a
       * device — it is still `available` on the shelf — so there is no status to
       * put back and the unit's own row is deliberately left alone.
       *
       * What does change is the pin's own lifecycle column:
       * `inventoryDisposalUnit.releasedAt` is stamped `cancelledAt` below, which
       * is what takes these rows out of the partial unique index
       * `inventory_disposal_unit_active_unique` (`where released_at is null`).
       * The rows stay — they are the record of which certificate once claimed the
       * device, and the certificate is never deleted — but they no longer hold a
       * claim on it, so a later disposal may pin the same unit again. The mirror
       * image is `inventoryBorrowUnit.releasedAt`, stamped at check-in for the
       * same reason against `inventory_borrow_unit_active_unique`.
       *
       * The item comes back in the same `Promise.all`: it is read for the ledger
       * row's name and counters, it does not depend on the pins, and it is
       * deliberately read *without* a lock — no counter is written on this path,
       * and a cancellation that had to queue behind the item's row lock would be
       * refused whenever the store was busy, for a change that moves nothing.
       */
      const [pinnedUnits, [item]] = await Promise.all([
        tx
          .select({
            id: inventoryUnit.id,
            uniqueNo: inventoryUnit.uniqueNo,
            status: inventoryUnit.status,
          })
          .from(inventoryDisposalUnit)
          .innerJoin(
            inventoryUnit,
            eq(inventoryDisposalUnit.unitId, inventoryUnit.id)
          )
          .where(eq(inventoryDisposalUnit.disposalId, existing.id))
          .for("update"),
        tx
          .select({
            id: inventoryItem.id,
            name: inventoryItem.name,
            sku: inventoryItem.sku,
            qty: inventoryItem.qty,
            borrowedQty: inventoryItem.borrowedQty,
          })
          .from(inventoryItem)
          .where(eq(inventoryItem.id, existing.itemId))
          .limit(1),
      ]);

      if (!item) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      const cancelledAt = new Date();

      /**
       * `status`, both halves of the cancellation pair and the reason, in one
       * statement. `finalized_*` is not written and must stay null — the
       * `cancelled` arm requires both to be null, and a certificate that had been
       * finalised could not be cancelled at all (refused above). The approval pair
       * is not written either: whether it is set depends on whether the request
       * was signed off before it was withdrawn, and the ladder's `cancelled` arm
       * correctly makes no demand either way, so the history below is what records
       * which of the two happened.
       */
      const [updated] = await tx
        .update(inventoryDisposal)
        .set({
          status: "cancelled",
          cancelledByStaffId: actor.staffId,
          cancelledAt,
          cancellationReason: input.reason,
        })
        .where(eq(inventoryDisposal.id, existing.id))
        .returning();

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      /**
       * Release this certificate's claims, in the same transaction that cancels
       * it. The `is null` filter makes the statement idempotent against itself:
       * a certificate can only be cancelled once (refused above on the second
       * attempt), so this touches every row it is going to touch — but spelling
       * it out means a future caller cannot accidentally rewrite the moment a pin
       * was released, and it keeps the write honest about which rows leave
       * `inventory_disposal_unit_active_unique`.
       *
       * `cancelledAt` is the same instant stamped on the certificate, not
       * `new Date()` again, so "when was the claim dropped" and "when was the
       * request withdrawn" are one fact rather than two that can disagree.
       */
      await tx
        .update(inventoryDisposalUnit)
        .set({ releasedAt: cancelledAt })
        .where(
          and(
            eq(inventoryDisposalUnit.disposalId, existing.id),
            isNull(inventoryDisposalUnit.releasedAt)
          )
        );

      /**
       * `fromStatus` is the status the request was actually in, so this row says
       * whether the certificate was withdrawn before or after its signature. The
       * source repo declared this table and never wrote a row; this procedure and
       * its two siblings are what give it a writer, and `listDisposals` is what
       * gives it a reader.
       */
      await tx.insert(inventoryDisposalStatusHistory).values({
        id: crypto.randomUUID(),
        disposalId: existing.id,
        fromStatus: existing.status,
        toStatus: "cancelled",
        note: input.reason,
        changedByStaffId: actor.staffId,
      });

      /**
       * The ledger row, with the item's **real** counters on both sides.
       *
       * The action is `edited`, not a `disposal_*` value, and that is a deliberate
       * reading of `INVENTORY_TRANSACTION_ACTIONS` rather than an oversight:
       * the list has `disposal_requested`, `disposal_approved` and
       * `disposal_finalized` but **no** `disposal_cancelled`, and
       * `inventory_transaction_action_check` is a closed set, so the value
       * cannot be invented here.
       *
       * Of what is available, `disposal_requested` would be a false statement in
       * the feed — the transactions screen would render "Disposal requested" on
       * the very row that says the request was dropped — and `stock_in` would be
       * worse (see the module comment). `edited` is the honest generic: this
       * record changed and no counter was counted. The event is distinguishable
       * programmatically from `meta.disposalStatus`, which is written below, and
       * readable by a human from the note.
       */
      await insertInventoryTransaction(tx, {
        actor,
        action: "edited",
        item: { id: item.id, name: item.name, sku: item.sku },
        before: countersOf(item),
        after: countersOf(item),
        note: `Write-off of ${existing.qty} × ${item.name} cancelled: ${input.reason}`,
        meta: {
          disposalId: existing.id,
          // Not derivable from the action, which is the whole reason it is here.
          disposalStatus: "cancelled",
          fromStatus: existing.status,
          method: existing.method,
          cancellationReason: input.reason,
          pinnedUnitIds: pinnedUnits.map((unit) => unit.id),
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "disposal.cancel",
        entityType: "inventory_disposal",
        entityId: existing.id,
        before: {
          status: existing.status,
          cancellationReason: existing.cancellationReason,
          cancelledAt: null,
        },
        after: {
          status: updated.status,
          cancellationReason: updated.cancellationReason,
          cancelledByStaffId: actor.staffId,
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        cancelledAt: iso(cancelledAt),
        // The guard above has established that `actor.staffId` is non-null, so
        // this is the `staff` row's own name — the same string the ledger and the
        // audit log denormalise, so the toast, the certificate and the trail
        // cannot disagree about who withdrew it.
        cancelledByName: actor.name,
        cancellationReason: updated.cancellationReason,
      };
    });
  });
