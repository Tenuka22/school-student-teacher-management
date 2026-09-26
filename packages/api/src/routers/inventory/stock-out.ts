/**
 * Writing stock off the shelf: breakage, theft, a projector that died and was
 * not repaired, a laptop that a student spilled tea on.
 *
 * ## This is one of three different things, and they are not interchangeable
 *
 * The inventory has three routes that all reduce an item's presence, and a
 * later reader who blurs them will build the wrong screen:
 *
 * 1. **`stockOut` — this file.** The device is *gone*. It is not in the store
 *    and it is not coming back: no one is accountable for it and nothing is
 *    expected back. `qty` falls and the unit becomes `removed`.
 * 2. **Issue** (a sibling procedure). The device left the store deliberately
 *    and permanently, to a named recipient, and the school is better off
 *    because of it. `qty` falls, but there is a `inventoryIssue` certificate
 *    naming who took it and why, and the unit becomes `issued` — **terminal**.
 *    A projector given to another school cannot be given away twice.
 * 3. **Borrow** (a sibling procedure). The device is with a member of staff
 *    and is **expected back**. `qty` does *not* fall: it is still the school's
 *    property and still on its books. `borrowedQty` rises instead, and the unit
 *    becomes `borrowed` until the return procedure releases it.
 *
 * The practical consequence, which is why the distinction is written out here
 * rather than left implicit: only this file is the right answer to "we wrote
 * one off", and the other two are the right answer to "it went out". A clerk
 * who has genuinely lost a device must not be told to raise a disposal
 * certificate, and a clerk who has handed a device to a student must not be
 * told to record a loss.
 */
import { ORPCError } from "@orpc/server";
import { itemConditionSchema } from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryItem,
  inventoryItemIdSchema,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure } from "../../index";
import {
  assertSufficientAvailableQuantity,
  assertUnitsNotPendingDisposal,
  claimLifecycleUnits,
  claimedUnitTags,
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
} from "./inventory-database";

export const stockOut = adminOnlyProcedure
  .input(
    v.object({
      itemId: inventoryItemIdSchema,
      qty: v.pipe(v.number(), v.integer(), v.minValue(1)),
      /**
       * Asset tags (or unit ids) to write off. Omit it and the oldest
       * available units go FIFO, which is the ordering a school counts on: the
       * projector bought in 2024 leaves before the one bought this term. Supply
       * it when the storekeeper has the devices in front of them and the choice
       * has already been made.
       *
       * **Omitting it on a counted line is the other legal answer, and it is not
       * the same as omitting it on a tagged one.** A bulk item has no unit rows to
       * claim, so `claimLifecycleUnits` returns none and the `qty` write below is
       * the whole of the write-off; a tagged item with no tags named still has its
       * devices claimed oldest-first. The helper asks the item which case it is
       * rather than reading the absence of tags as the answer, because a clerk
       * writing off "the two broken chairs from the hall" sends no tags whether
       * or not the chairs have been asset-tagged.
       */
      uniqueItemIds: v.optional(v.array(v.string())),
      /**
       * Required, and required in full sentences rather than a token.
       *
       * This is the first field an auditor reads on a write-off, and the
       * difference between "damaged" and "projector bulb failed during the
       * Grade 11 practical on 14 March, chassis cracked, written off with the
       * Principal's approval" is the difference between a storebook that
       * explains itself and one that cannot. `trim()` runs before the length
       * check so a field holding three spaces is refused rather than becoming
       * the reason on a certificate.
       */
      reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
      approvedBy: v.optional(v.string()),
      note: v.optional(v.string()),
      /**
       * Set only when the storekeeper is recording the condition of the device
       * they are holding — "Damaged" for the cracked chassis.
       *
       * The `reason` already records the cause, and it is free text: a
       * procedure that inferred `condition: "Damaged"` from a reason mentioning
       * breakage would be guessing a fact from prose, and a guess written into
       * the condition ledger is worse than no guess at all, because the ledger
       * looks authoritative. Left out, the unit keeps whatever condition it
       * was last assessed at, which is the true state of knowledge.
       */
      condition: v.optional(itemConditionSchema),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);
    const reason = input.reason.trim();

    return context.db.transaction(async (tx) => {
      // `FOR UPDATE` — the item is the thing two concurrent write-offs race
      // for, and the `before` counters have to be read from the locked row
      // rather than from anything the client sent.
      const existing = await getLockedItem(tx, input.itemId);

      /**
       * The guard computes `calculateAvailableQuantity(counters)` itself and
       * phrases the refusal as "Only N unit(s) are available to write off" —
       * the number is the part the caller cannot know before the read, and the
       * verb phrase is the part only this procedure can supply.
       */
      assertSufficientAvailableQuantity(
        countersOf(existing),
        input.qty,
        "write off"
      );

      /**
       * FIFO when no tags are given, exact-match when they are, and **nothing to
       * claim when the item is counted in bulk**. The helper already keeps the ways
       * a claim can fail — too few rows back (the other write-off happened first), a
       * tag nobody has (a typo), a tag that belongs to another item, and a row that
       * was not asked for (a bug in the caller) — in separate messages, because they
       * mean different things to the person at the counter. None of it is
       * re-implemented here, and `units` is `null` rather than `[]` for a bulk line
       * so that "no tags" and "no rows" cannot be confused downstream.
       */
      const claim = await claimLifecycleUnits(
        tx,
        existing.id,
        input.qty,
        input.uniqueItemIds
      );
      const { units } = claim;

      const unitIds = units?.map((unit) => unit.id) ?? [];

      /**
       * A unit already committed to a disposal certificate cannot be written
       * off a second time by a second route. The certificate names a device; if
       * this route also removed it, the two records would disagree about who
       * disposed of what, and only one of them has an approval signature on it.
       */
      await assertUnitsNotPendingDisposal(tx, unitIds);

      const newQty = existing.qty - input.qty;
      const [updated] = await tx
        .update(inventoryItem)
        .set({ qty: newQty })
        .where(eq(inventoryItem.id, existing.id))
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      /**
       * One `where … inArray(...)` for the whole batch, whatever the count.
       *
       * `status: "removed"` and not `"disposed"`: `disposed` is a **disposal
       * outcome** and is only ever written by disposal finalisation, which is
       * the two-stage certificate a school needs when it is destroying
       * property. A lost laptop is not a disposal — nobody approved its
       * destruction — it is simply no longer held, and `removed` is the status
       * that says exactly that and can be reversed by `updateUnit` if the
       * device turns up in a cupboard next term.
       *
       * `condition` is written only when the caller supplied one, deliberately.
       *
       * **Skipped entirely for a counted line.** `unitIds` is empty for a bulk
       * item, and `where id in ()` would match nothing while still costing a
       * statement inside a transaction that is holding the item's row lock. The
       * counter write above is the whole of a bulk write-off, exactly as the
       * `borrowable`-independent `qty` semantics say it should be.
       */
      if (unitIds.length > 0) {
        await tx
          .update(inventoryUnit)
          .set({
            status: "removed",
            ...(input.condition ? { condition: input.condition } : {}),
          })
          .where(inArray(inventoryUnit.id, unitIds));
      }

      await insertInventoryTransaction(tx, {
        actor,
        action: "stock_out",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(updated),
        note: `Written off: -${input.qty}`,
        meta: {
          reason,
          approvedBy: input.approvedBy ?? null,
          note: input.note ?? null,
          // The **tags**, not the row ids. A school reconciling a write-off
          // against a certificate reads `LT-0042`; a UUID in `meta` answers no
          // question anybody asked. Empty rather than absent for a bulk line —
          // see `claimedUnitTags` for why the two must be distinguishable.
          uniqueUnitIds: claimedUnitTags(claim),
          bulkItem: claim.isBulk,
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "item.stock_out",
        entityType: "inventory_item",
        entityId: existing.id,
        before: countersOf(existing),
        after: countersOf(updated),
      });

      return {
        itemId: existing.id,
        qty: updated.qty,
        removed: input.qty,
        /**
         * `null` for a counted line. The web app quotes these tags in its success
         * toast, and an empty array there produces "Removed 3 unit(s) from stock —
         * " with nothing after the dash; `null` is the one value the toast can turn
         * into a sentence about a counted line instead of a truncated list.
         */
        units:
          units?.map((unit) => ({ id: unit.id, uniqueNo: unit.uniqueNo })) ??
          null,
      };
    });
  });
