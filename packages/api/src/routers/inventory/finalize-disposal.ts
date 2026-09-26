/**
 * Finalise a signed-off write-off. **This is where the stock actually leaves the
 * books.**
 *
 * The third step and the only one that moves a counter. `createDisposal` and
 * `approveDisposal` are both paper: they leave `inventoryItem.qty` alone and say
 * so in the ledger by writing identical `before` and `after` pairs. Here
 * `qty` drops by the disposal quantity, the tagged units become `disposed`, and
 * the `disposal_finalized` ledger row is the one place in the flow where the two
 * sides of the counter genuinely differ.
 *
 * The procedure level is `adminProcedure`, the same gate as `approveDisposal` and
 * for the same reason, and the argument for it is written out on that export: the
 * two gates (`adminProcedure` versus `requireInventoryPermission("approve")`)
 * happen to admit the same three leadership seats today, the tighter of the two is
 * chosen because it is written as a literal role list rather than as a mutable
 * grants table, and the genuine separation of duties lives in the handler's
 * self-approval refusal.
 *
 * **Three ordering facts this file depends on, each of which is a constraint
 * violation if got wrong:**
 *
 * 1. `qty` is decremented and `borrowedQty` is not. A unit on loan cannot be
 *    written off, and it does not need a special case to be excluded — the
 *    availability check in the handler works out `qty - borrowedQty`, so a
 *    borrowed unit is already outside the quantity being written off. Touching
 *    `borrowedQty` here would corrupt the count of what is still out.
 * 2. All four actor/timestamp columns that this step sets are set together, and
 *    `cancelled_*` is never touched. `inventory_disposal_approval_state`,
 *    `inventory_disposal_finalization_state` and
 *    `inventory_disposal_cancellation_state` each compare a pair of columns for
 *    null-equality, and the terminal arm of `inventory_disposal_status_state`
 *    requires the approved pair **and** the finalized pair to be non-null with
 *    the cancelled pair null.
 * 3. The item is locked *after* the disposal. Locking in a consistent order is
 *    what keeps a finalize and a concurrent borrow from deadlocking; nothing else
 *    in this flow takes both locks in the other order.
 *
 * The `getLockedDisposal` helper below is duplicated verbatim in
 * `approve-disposal.ts` and `cancel-disposal.ts` — see that file for why.
 */
import { ORPCError } from "@orpc/server";
import {
  disposalFinalStatusSchema,
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
import { eq, inArray } from "drizzle-orm";
import { object, optional, string } from "valibot";

import { adminProcedure } from "../../index";
import {
  calculateAvailableQuantity,
  calculateItemStatus,
} from "./inventory-calculations";
import type { Executor, LifecycleUnitClaim } from "./inventory-database";
import {
  assertSufficientAvailableQuantity,
  assertUnitsNotPendingDisposal,
  claimLifecycleUnits,
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
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
 * `estimatedValue` is a `numeric(14,2)` column, and the input is declared as a
 * plain string (as `inventoryDisposalInsertSchema` declares `estimatedValue`, and
 * as the rest of the flow takes it). Valibot's own `moneyStringSchema` is the
 * column's precision and scale written out, and a malformed money string handed
 * straight to the driver comes back as a Postgres parse error, not as a
 * validation message. Re-checking it here turns that into guidance without
 * changing the declared input shape.
 */
const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/u;

/**
 * The name of the partial unique index on `inventory_disposal_unit.unit_id`
 * where `released_at is null`, matched by string in the `catch` below the way
 * `create-issue.ts` matches `ISSUE_UNIT_UNIQUE_CONSTRAINT` and
 * `create-staff.ts` matches `staff_nic_unique`.
 *
 * **What it is for, and whether the FIFO fallback above can still hit it.**
 * The index says a device may be pinned to at most one *unreleased* certificate
 * at a time, and `cancelDisposal` stamps `releasedAt` so a cancelled request
 * stops pinning. A unit that is in the index is therefore one of exactly two
 * things, and neither can be selected by the FIFO pick:
 *
 * 1. **Pinned by a live certificate** — `pending_approval` or `approved`. That
 *    is what `assertUnitsNotPendingDisposal` filters for immediately above, and
 *    it is the whole reason that guard runs on the unpinned path only: in the
 *    pinned case it would find this certificate's own rows and refuse it against
 *    itself.
 * 2. **Pinned by a finalised certificate.** The unit is then `disposed` — the
 *    status written further down in this same transaction — and
 *    `getAvailableUnits` filters on `status = "available"`, so a written-off
 *    device is never in the FIFO candidate set to begin with.
 *
 * So the violation is unreachable through normal sequencing, and the pre-check
 * is the thing doing the work. The `catch` is still here because "unreachable"
 * is a claim about two filters in two different files, and the cost of being
 * wrong is a raw Postgres error surfacing as a 500 at the moment somebody signs
 * a certificate — not a message a principal can act on. A unique violation from
 * a concurrent finalisation of the same tag is exactly the race
 * `createIssue` translates the same way.
 */
const DISPOSAL_UNIT_ACTIVE_CONSTRAINT = "inventory_disposal_unit_active_unique";

/**
 * Which tag to name when `inventory_disposal_unit_active_unique` fires.
 *
 * Same reasoning as `contestedTag` in `create-issue.ts`: the constraint says
 * that *one* row of the bulk insert already carries a claim, not which, and by
 * the time Postgres refuses, the transaction that won has committed and this one
 * can no longer find out. The FIFO pick has no caller-supplied tag to fall back
 * on, so the first tag this procedure claimed is named — it is on the label in
 * the approver's hand, and "one of the assets" would give them nothing to search
 * the cupboard for.
 */
const contestedTag = (claimedTags: string[]): string =>
  claimedTags[0] ?? "The selected asset";

/**
 * Pin the devices this finalisation just picked, and refuse to pin any that
 * another live certificate already holds.
 *
 * **Only ever called on the unpinned path**, and the reason is not tidiness: in the
 * pinned case the guard would be self-defeating, because this very disposal is
 * `approved` and already holds those pins, so `assertUnitsNotPendingDisposal` would
 * find this request's own rows and refuse the request against itself. Nor would it
 * prove anything extra — `inventory_disposal_unit_active_unique` means a unit is
 * pinned to at most one *unreleased* disposal at a time, and a cancelled certificate
 * has stamped `releasedAt`, so the only pin that can be unreleased and belong to a
 * different request is another live one, which is precisely what this guard reports.
 *
 * Extracted out of the handler rather than inlined because the handler was already
 * at the top of this folder's complexity budget and the argument above is longer
 * than the code it explains: held inside the handler it pushed a *signing* flow
 * over the limit, and the remedy for that is to give the block a name, not to
 * delete a guard.
 */
const pinFreshlyClaimedUnits = async (
  db: Executor,
  disposalId: string,
  units: NonNullable<LifecycleUnitClaim["units"]>
): Promise<void> => {
  await assertUnitsNotPendingDisposal(
    db,
    units.map((unit) => unit.id)
  );

  /**
   * One bulk insert, never a loop, and wrapped because the pre-check above is a
   * read. The window between it and this statement is the same real window
   * `createIssue` guards, and the index behind it is the authority: both
   * transactions' unit status writes and the `qty` decrement roll back with the
   * failed insert, so the whole finalisation aborts rather than writing a
   * certificate that names a device somebody else has claimed.
   */
  try {
    await db
      .insert(inventoryDisposalUnit)
      .values(units.map((unit) => ({ disposalId, unitId: unit.id })));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(DISPOSAL_UNIT_ACTIVE_CONSTRAINT)
    ) {
      throw new ORPCError("CONFLICT", {
        message: `Asset ${contestedTag(units.map((unit) => unit.uniqueNo))} is already pinned to another write-off request that has not been finalised or cancelled. Reload the request and finalise the units that are still available`,
      });
    }

    throw error;
  }
};

export const finalizeDisposal = adminProcedure
  .input(
    object({
      disposalId: inventoryDisposalIdSchema,
      /**
       * One of the **six terminal statuses only**. `disposalFinalStatusSchema` is
       * a picklist over `DISPOSAL_FINAL_STATUSES`, so `pending_approval`,
       * `approved` and `cancelled` are not reachable here at all — the input
       * cannot express "finalise it as still pending", which is the mistake the
       * terminal arm of the status CHECK would otherwise have to catch.
       */
      finalStatus: disposalFinalStatusSchema,
      estimatedValue: optional(string()),
      note: optional(string()),
    })
  )
  .handler(async ({ input, context }) => {
    if (
      input.estimatedValue !== undefined &&
      !MONEY_PATTERN.test(input.estimatedValue)
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Enter the estimated value as an amount, up to two decimal places",
      });
    }

    // Resolved before the transaction opens: `getInventoryActor` reads `staff`
    // through `context.db`, a different connection from the transaction either
    // way, and the disposal lock has to be taken before anything reads the
    // certificate. The checks on the actor stay inside the transaction, after the
    // record is read, so `NOT_FOUND` and `CONFLICT` keep precedence.
    const actor = await getInventoryActor(context);

    return context.db.transaction(async (tx) => {
      const existing = await getLockedDisposal(tx, input.disposalId);

      /**
       * A write-off can only be finalised from `approved`, and that two-step gap
       * is the entire point of the flow — so the message has to explain it rather
       * than just refuse. The wording distinguishes the two cases a user meets
       * here: a request somebody else already finalised or cancelled, and a
       * request that was never signed off at all.
       */
      if (existing.status !== "approved") {
        const neverSignedOff =
          existing.status === "pending_approval" ||
          existing.status === "cancelled";
        throw new ORPCError("CONFLICT", {
          message: neverSignedOff
            ? "This request has not been signed off yet, so there is nothing to finalise"
            : `This request is already ${disposalStatusLabel(existing.status)}`,
        });
      }

      /**
       * A signature the certificate cannot name. The terminal arm of
       * `inventory_disposal_status_state` requires
       * `finalized_by_staff_id IS NOT NULL`, and `InventoryActor.staffId` is null
       * for the seeded `admin` / `principal` / `deputy-principal` seats. Such a
       * write is refused by PostgreSQL however it is composed, so it is refused
       * here with the same `BAD_REQUEST` (never `FORBIDDEN` — the role gate has
       * already passed, and the missing thing is an identity, not an authority)
       * and the same remedy `approveDisposal` and `take-item` name. A disposal
       * raised under a leadership account is therefore unapprovable as well as
       * unfinalisable, which is a real consequence of the ladder requiring a
       * `staff` pointer on every arm but `pending_approval`.
       */
      if (actor.staffId === null) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Your account has no staff record, so it cannot sign a disposal certificate. Ask an administrator to link your account to your staff profile",
        });
      }

      // FOR UPDATE, and deliberately *after* the disposal lock above so the two
      // rows are always taken in the same order by this flow. A soft-deleted item
      // is a non-existent item here: writing stock off a record that has left
      // the storebook would produce a certificate describing an item the school
      // can no longer show, so such a request can only be cancelled, never
      // finalised.
      const item = await getLockedItem(tx, existing.itemId);

      /**
       * Re-check availability **now**, not just at request time.
       *
       * Time passed between the request and the signature — sometimes weeks — and
       * in that time the units may have been issued to another school, borrowed
       * by a teacher, or written off under a different certificate. The check at
       * request time was true when it was made and proves nothing now; this one is
       * the authority, and it runs against the row this transaction holds locked
       * so nothing can move underneath it.
       */
      assertSufficientAvailableQuantity(
        countersOf(item),
        existing.qty,
        "write off"
      );

      /**
       * Which physical devices are being written off.
       *
       * Three cases, and the difference is the point of the whole pin design.
       *
       * - **Pinned at request time.** The clerk named the devices, so those are
       *   the devices, and `getAvailableUnits` is asked for exactly them. It still
       *   filters on `status = 'available'`, so a unit that was borrowed in the
       *   interval is reported as unavailable rather than silently written off —
       *   which is why the exact-count rule inside it is a `CONFLICT` here and not
       *   a surprise at audit.
       * - **Not pinned, tagged item.** FIFO by oldest tag, decided now, at the
       *   moment somebody is actually taking the devices off the shelf. This
       *   fallback is the reason the pin rows may be inserted at finalisation, and
       *   it is why `inventoryDisposalUnit.disposalId` is `onDelete: "restrict"`:
       *   a disposal certificate is evidence, so a `DELETE` can never remove the
       *   evidence of which devices a live request is waiting on.
       * - **Not pinned, counted line.** Nothing to claim, and nothing to pin. A
       *   bulk item has no `inventory_unit` rows, so calling `getAvailableUnits`
       *   here unconditionally answered "Only 0 unit(s) are available" at the
       *   moment somebody signed the certificate — which is the same dead end
       *   `createDisposal` already avoided when it raised the request. The
       *   certificate still describes the write-off honestly: it names the item,
       *   the count and the reason, and `inventory_disposal_unit` is empty
       *   because the school tagged nothing.
       *
       * `claimLifecycleUnits` is what draws the line, by asking the item whether it
       * has any tagged units rather than by inferring it from the absence of pins —
       * because a tagged certificate raised without pins is the common case, and
       * reading it as a bulk line would sign off a write-off of stock nobody
       * tracked.
       */
      const pinned = await tx
        .select({ unitId: inventoryDisposalUnit.unitId })
        .from(inventoryDisposalUnit)
        .where(eq(inventoryDisposalUnit.disposalId, existing.id))
        .for("update");

      const pinnedUnitIds = pinned.map((row) => row.unitId);
      const claim = await claimLifecycleUnits(
        tx,
        item.id,
        existing.qty,
        pinnedUnitIds.length > 0 ? pinnedUnitIds : null
      );
      const { units } = claim;

      if (pinnedUnitIds.length === 0 && units) {
        await pinFreshlyClaimedUnits(tx, existing.id, units);
      }

      /**
       * The counter write. `borrowedQty` is untouched on purpose: the
       * availability check above has already excluded everything that is out on
       * loan, so decrementing `qty` alone leaves `borrowedQty <= qty` intact —
       * which is what `inventory_item_counters_within_qty` requires, and what it
       * would reject if the borrowed units had been counted into the write-off.
       */
      const [updatedItem] = await tx
        .update(inventoryItem)
        .set({ qty: item.qty - existing.qty })
        .where(eq(inventoryItem.id, item.id))
        .returning();

      if (!updatedItem) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      // One statement for the whole page of devices, not a loop, and the same
      // ids that were just validated as available. Empty for a counted line, and
      // skipped rather than issued as `where id in ()` — see `stock-out.ts` for
      // why the counter write above is the whole of a bulk write-off.
      const unitIds = units?.map((unit) => unit.id) ?? [];
      if (unitIds.length > 0) {
        await tx
          .update(inventoryUnit)
          .set({ status: "disposed" })
          .where(inArray(inventoryUnit.id, unitIds));
      }

      const finalizedAt = new Date();

      /**
       * `status`, both halves of the finalization pair, and optionally the
       * valuation — one statement. `cancelled_*` is not written, and neither is
       * the approval pair: the approver is whoever signed it earlier and is not
       * this procedure's to overwrite.
       *
       * `estimatedValue` is spread conditionally rather than passed as
       * `input.estimatedValue ?? null` because the input is optional: omitting
       * it must leave the value the requester estimated, while supplying it
       * revises it. Writing `null` on omission would silently erase the estimate
       * on a finalisation that said nothing about it.
       */
      const [updated] = await tx
        .update(inventoryDisposal)
        .set({
          status: input.finalStatus,
          finalizedByStaffId: actor.staffId,
          finalizedAt,
          ...(input.estimatedValue === undefined
            ? {}
            : { estimatedValue: input.estimatedValue }),
        })
        .where(eq(inventoryDisposal.id, existing.id))
        .returning();

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await tx.insert(inventoryDisposalStatusHistory).values({
        id: crypto.randomUUID(),
        disposalId: existing.id,
        fromStatus: existing.status,
        toStatus: input.finalStatus,
        note:
          input.note ??
          `Disposal finalised as ${disposalStatusLabel(input.finalStatus)}`,
        changedByStaffId: actor.staffId,
      });

      // The one row in this flow where the two sides of the ledger differ. The
      // `before` is the row this transaction locked and the `after` is the row it
      // just wrote, never the values the client sent.
      await insertInventoryTransaction(tx, {
        actor,
        action: "disposal_finalized",
        item: { id: item.id, name: item.name, sku: item.sku },
        before: countersOf(item),
        after: countersOf(updatedItem),
        note: `Write-off of ${existing.qty} × ${item.name} finalised as ${disposalStatusLabel(input.finalStatus)}${input.note ? ` — ${input.note}` : ""}`,
        meta: {
          disposalId: existing.id,
          method: existing.method,
          finalStatus: input.finalStatus,
          reason: existing.reason,
          estimatedValue: updated.estimatedValue,
          // Empty for a counted line, never absent — an auditor reconciling a
          // certificate against a clipboard needs "this line was counted, not
          // tagged" to be a value rather than an absence.
          uniqueUnitIds: unitIds,
          bulkItem: claim.isBulk,
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "disposal.finalize",
        entityType: "inventory_disposal",
        entityId: existing.id,
        before: {
          status: existing.status,
          finalizedAt: null,
          qty: item.qty,
        },
        after: {
          status: updated.status,
          finalizedByStaffId: actor.staffId,
          qty: updatedItem.qty,
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        finalizedAt: iso(finalizedAt),
        // The guard above has established that `actor.staffId` is non-null, so
        // this is the `staff` row's own name — the same string the ledger and the
        // audit log denormalise, so the toast and the certificate agree.
        finalizedByName: actor.name,
        // The item's own counters and derived status, so the web app can update
        // the item badge from the mutation's return value instead of re-reading
        // the item behind the user's back.
        item: {
          qty: updatedItem.qty,
          borrowedQty: updatedItem.borrowedQty,
          availableQty: calculateAvailableQuantity(countersOf(updatedItem)),
          // Derived by the same function every item badge in the app uses, so a
          // finalised write-off cannot show a different status here than on the
          // item list.
          status: calculateItemStatus(
            countersOf(updatedItem),
            updatedItem.condition
          ),
        },
        // `disposed` on every row: that is the single status written above, and
        // these are exactly the devices it was written to.
        //
        // `null` for a counted line, matching `createDisposal`'s own `units` and
        // for the same reason: the certificate is the document an auditor reads to
        // find out *which* property left the school, and "this line is counted, not
        // tagged" is a sentence. An empty list under the same heading reads as a
        // device somebody wrote down and then lost the paper for.
        units:
          units?.map((unit) => ({
            id: unit.id,
            uniqueNo: unit.uniqueNo,
            status: "disposed" as const,
          })) ?? null,
      };
    });
  });
