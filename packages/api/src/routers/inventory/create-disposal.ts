/**
 * Raise a request to write school property off the books. **Nothing moves.**
 *
 * This is the first of the two stages and the only one a storekeeper is trusted
 * with. It creates a *proposal*: a certificate that says somebody intends to
 * dispose of `qty` units of an item, and is waiting for a signature. The
 * counters on `inventoryItem` are deliberately untouched, which is what the
 * `inventory_disposal_status_state` CHECK is asking for — a `pending_approval`
 * row must carry nothing approved, nothing finalized and nothing cancelled, and
 * the ledger row written here records identical `before` and `after` counters to
 * say the same thing in the place an auditor looks.
 *
 * **Why the creation gate is `requireInventoryPermission("create")` and not the
 * approval gate.** The source app split this the same way (`managementProcedure`
 * to raise, `adminProcedure` to sign), and the split is the point: noticing that
 * a projector is broken and deciding that the school's books should say it is
 * not gone are different acts, and a storekeeper who could do both would be able
 * to write off the store they are accountable for. What the *gate* buys is
 * narrower than it looks — today `inventory: ["approve"]` is granted only to
 * `admin` / `principal` / `vicePrincipal`, and `requirePermission` short-circuits
 * all three, so the two gates currently admit the same people. The real
 * separation of duties is the explicit self-approval refusal in
 * `approveDisposal`, not this permission string. See that file for the gap that
 * leaves, which is stated there rather than glossed over here.
 *
 * **`assertCategoryExists` is deliberately absent**, where the source app called
 * it. Here `inventoryDisposal.itemId` is a foreign key onto `inventoryItem`
 * with `onDelete: "restrict"`, and `inventoryItem.categoryId` is a foreign key
 * onto `inventoryCategory` with `onDelete: "restrict"` as well. A category
 * therefore cannot be deleted while any item still points at it, and a disposal
 * always points at an item, so the dangling reference the source repo was
 * defending against is unreachable in this schema — the `restrict` chain is the
 * guarantee. Re-checking it here would be a second read of a fact the row lock
 * on the item has already made true.
 */
import {
  inventoryDisposal,
  inventoryDisposalInsertSchema,
  inventoryDisposalUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { array, object, optional, pick, string } from "valibot";

import { requireInventoryPermission } from "../../index";
import {
  assertSufficientAvailableQuantity,
  assertUnitsNotPendingDisposal,
  countersOf,
  getAvailableUnits,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
} from "./inventory-database";

export const createDisposal = requireInventoryPermission("create")
  .input(
    object({
      /**
       * The write-off fields are taken from the *generated insert schema* rather
       * than re-declared, so `qty >= 1`, `method` in the six methods,
       * `estimatedValue` in the `numeric(14,2)` money shape and the branded
       * `itemId` cannot drift from the columns and the CHECKs they enforce.
       */
      ...pick(inventoryDisposalInsertSchema, [
        "itemId",
        "qty",
        "reason",
        "method",
        "notes",
        "estimatedValue",
      ]).entries,
      /**
       * Optional asset tags, accepted as row `id`s **or** as the tag written on
       * the device, exactly as `getAvailableUnits` documents.
       *
       * Pinning is optional on purpose. A clerk raising a request for "the two
       * broken projectors" should not have to walk to the cupboard, read two
       * labels and paste them before the request can even be saved — and the
       * specific devices are not known for certain until somebody signs the
       * certificate, because a third projector may turn out to be the broken
       * one. When this is omitted the units are picked FIFO at finalisation
       * instead, which is the same order the store counts on.
       */
      uniqueItemIds: optional(array(string())),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);

    // An empty array is what an untouched multi-select sends, and it is
    // meaningfully different from "no pins supplied": `getAvailableUnits`
    // treats an empty list as a request for zero units and would refuse with a
    // count of zero. Fold it back to "not supplied" so the FIFO fallback runs.
    //
    // **This procedure raised a bulk request correctly from the start; the other
    // three lifecycle writes did not, and now do.** They ask
    // `claimLifecycleUnits` instead, which draws the same line from the other
    // side — by asking the item whether it *is* counted rather than inferring it
    // from the absence of tags, which is the only question a request can answer
    // before anybody has walked to the cupboard. The distinction between "no pins
    // yet" and "no devices exist" is why the FIFO fallback below lives here, at
    // finalisation, and is not attempted twice.
    const requestedUnitIds = input.uniqueItemIds?.length
      ? input.uniqueItemIds
      : null;

    return context.db.transaction(async (tx) => {
      // FOR UPDATE. The availability check below is a read of the counters, and
      // a counter read without a lock is a snapshot that a concurrent issue,
      // borrow or write-off can invalidate between the check and the commit.
      const item = await getLockedItem(tx, input.itemId);

      // "The units must actually be on the shelf to be written off." Raised as
      // a proposal, not finalised, this still has to be true — otherwise the
      // request sits in the queue asking a principal to sign off a write-off of
      // stock the school does not have, and the sign-off is where the stock
      // would be found missing.
      assertSufficientAvailableQuantity(
        countersOf(item),
        input.qty,
        "write off"
      );

      const units = requestedUnitIds
        ? await getAvailableUnits(tx, item.id, input.qty, requestedUnitIds)
        : null;

      if (units) {
        // Only meaningful when the caller pinned specific devices: those units
        // are now spoken for on paper, so nothing else may move them before the
        // certificate is signed.
        await assertUnitsNotPendingDisposal(
          tx,
          units.map((unit) => unit.id)
        );
      }

      const disposalId = crypto.randomUUID();
      const requestedAt = new Date();

      // `approvedByStaffId` / `approvedAt`, `finalizedByStaffId` /
      // `finalizedAt` and `cancelledByStaffId` / `cancelledAt` are omitted, not
      // set to null by hand. `inventory_disposal_approval_state` and its two
      // siblings compare each pair for null-equality, and the `pending_approval`
      // arm of `inventory_disposal_status_state` requires all six to be null —
      // so leaving them out is the same statement as saying all six are unset,
      // and it is the only statement a reader of this code has to check.
      await tx.insert(inventoryDisposal).values({
        id: disposalId,
        itemId: item.id,
        qty: input.qty,
        reason: input.reason,
        method: input.method,
        status: "pending_approval",
        notes: input.notes ?? null,
        estimatedValue: input.estimatedValue ?? null,
        // Null for the seeded admin / principal / deputy-principal seats, which
        // are users with no staff row by design. A legitimate actor, not a
        // failure — see `getInventoryActor`.
        requestedByStaffId: actor.staffId,
        requestedAt,
      });

      if (units) {
        // One statement, not a loop: `inventory_disposal_unit` is keyed
        // (disposalId, unitId), and `unitId` is additionally unique on its own
        // *among unreleased pins* — `inventory_disposal_unit_active_unique` is
        // partial on `released_at is null`. That is what stops two live requests
        // claiming the same device, while letting a cancelled one be re-pinned
        // by a later request: `cancelDisposal` stamps `releasedAt`. Left null
        // here because this request is live and holds the claim.
        await tx
          .insert(inventoryDisposalUnit)
          .values(units.map((unit) => ({ disposalId, unitId: unit.id })));
      }

      // A request is a proposal, not a movement, so both sides of the ledger
      // row are the counters as they stand. The row exists to say "this was
      // proposed, by whom, with what reason", and a reader who sums the deltas
      // of this feed gets the store's real movements — the counters move once,
      // at finalisation.
      await insertInventoryTransaction(tx, {
        actor,
        action: "disposal_requested",
        item: { id: item.id, name: item.name, sku: item.sku },
        before: countersOf(item),
        after: countersOf(item),
        note: `Disposal requested: ${input.qty} × ${item.name}`,
        meta: {
          disposalId,
          method: input.method,
          reason: input.reason,
          // Empty rather than absent when nothing was pinned, so a consumer can
          // tell "no pins" from "this row predates pins" without a null check.
          uniqueUnitIds: units?.map((unit) => unit.id) ?? [],
        },
      });

      // `before: null` because the entity did not exist a moment ago. The
      // source app passed the *item* row as this table's `before`, which is the
      // wrong entity: this log is about `inventory_disposal` rows.
      await insertInventoryAuditLog(tx, {
        actor,
        action: "disposal.create",
        entityType: "inventory_disposal",
        entityId: disposalId,
        after: {
          itemId: item.id,
          qty: input.qty,
          reason: input.reason,
          method: input.method,
          status: "pending_approval",
          unitCount: units?.length ?? 0,
        },
      });

      return {
        id: disposalId,
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        qty: input.qty,
        status: "pending_approval",
        requestedAt: iso(requestedAt),
        // Null, not [], when the devices were not pinned — the UI needs to say
        // "the specific units will be chosen at sign-off" rather than render an
        // empty tag list as though the clerk chose none on purpose.
        units:
          units?.map((unit) => ({ id: unit.id, uniqueNo: unit.uniqueNo })) ??
          null,
      };
    });
  });
