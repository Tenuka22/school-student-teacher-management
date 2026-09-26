/**
 * The **only** manual lever on a physical unit's status, and it is deliberately
 * two verbs wide.
 *
 * A unit's status in this schema is a *conclusion*, and almost all of it is
 * reached by a workflow rather than typed:
 *
 * | status | who sets it | how |
 * | --- | --- | --- |
 * | `borrowed` | the borrow procedure | checking stock out to a member of staff |
 * | `issued` | the issue procedure | a permanent hand-over out of the store |
 * | `disposed` | disposal finalisation | a two-stage certificate that was approved and signed |
 * | `available` | the borrow **return** procedure, or this file | stock came back to the shelf |
 * | `removed` | this file, or `stockOut` | it is no longer held and nobody is bringing it back |
 *
 * So this file can set `available` or `removed` and nothing else, and the guard
 * below is the whole point of the file. A clerk who types `borrowed` by hand
 * would be asserting that a colleague has taken a device they never took; a
 * clerk who types `available` over a borrowed unit would be putting a laptop
 * that is in a classroom back on a shelf in the cupboard, and the register
 * would then agree with itself and disagree with the school. The counter on the
 * parent item would not move, either, because `borrowedQty` is owned by the
 * borrow lifecycle. The edit looks correct on screen and corrupts three tables
 * at once. It is refused here, with a message that says which procedure to use
 * instead, because an error that tells a clerk the next step is worth more than
 * an error that is merely true.
 */
import { ORPCError } from "@orpc/server";
import type {
  ItemCondition,
  UnitStatus,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  itemConditionSchema,
  unitStatusSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryItem,
  inventoryUnit,
  inventoryUnitIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure } from "../../index";
import {
  calculateAvailableQuantity,
  calculateItemStatus,
} from "./inventory-calculations";
import type {
  Executor,
  InventoryActor,
  InventoryItemRow,
  InventoryUnitRow,
} from "./inventory-database";
import {
  assertNoActiveLifecycleUnit,
  assertUnitsNotPendingDisposal,
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
} from "./inventory-database";

/** The only two statuses a person may set by hand. See the banner comment. */
const MANUAL_UNIT_STATUSES = ["available", "removed"] as const;

type ManualUnitStatus = (typeof MANUAL_UNIT_STATUSES)[number];

/**
 * One refusal that names the three routes the other three statuses belong to.
 *
 * It is one message for all of them on purpose: the clerk has one decision to
 * make ("where does this change happen?") and three procedures to choose
 * between, and a message that only said "not allowed" would send them to the
 * source of the register to ask a human.
 */
const MANUAL_STATUS_REFUSAL = [
  "Only Available or Removed can be set here.",
  "A borrowed unit changes status through the return procedure when the device comes back,",
  "an issued unit is terminal — it left the store permanently — and a disposed unit changes status through write-off finalisation.",
].join(" ");

const isManualUnitStatus = (value: string): value is ManualUnitStatus =>
  (MANUAL_UNIT_STATUSES as readonly string[]).includes(value);

/**
 * The one enforcement point for the rule above.
 *
 * It is a function rather than an inline `throw` so that the status-changing
 * path can re-assert it as its own first statement: that path is the one that
 * moves a counter, and a second caller of it must not be able to skip the check
 * by being written in a different file.
 */
const assertManualStatusAllowed = (value: string): void => {
  if (!isManualUnitStatus(value)) {
    throw new ORPCError("BAD_REQUEST", { message: MANUAL_STATUS_REFUSAL });
  }
};

/**
 * How much one unit's move changes the **item's** on-hand counter.
 *
 * Only the `removed` boundary moves `qty`, because only that boundary changes
 * whether the school still holds the device. `borrowed` and `issued` are
 * counted by `borrowedQty` and by the issue certificate respectively, and
 * `disposed` is reached through disposal finalisation — none of them is
 * reachable from here, and all of them are `0` here as a second line of
 * defence in case the guard above is ever weakened.
 *
 * Written as a named function rather than inlined because this is a truth table
 * and a truth table belongs somewhere a reader can check in one glance:
 *
 * | from \ to | available | removed |
 * | --- | ---: | ---: |
 * | available | 0 | −1 |
 * | removed | +1 | 0 |
 *
 * `available → available` and `removed → removed` are the no-ops, and the caller
 * rejects them before asking. `removed → available` is the interesting one: the
 * device was written off and has turned up in a cupboard, so the school holds
 * it again and the register has to say so.
 */
const unitQuantityDelta = (fromStatus: string, toStatus: string): number => {
  if (toStatus === "removed") {
    return fromStatus === "removed" ? 0 : -1;
  }

  if (fromStatus === "removed") {
    return 1;
  }

  return 0;
};

/** The unit's own fields, as a JSON-safe snapshot for the audit log. */
const unitSnapshot = (unit: InventoryUnitRow): Record<string, unknown> => ({
  status: unit.status,
  condition: unit.condition,
  location: unit.location,
  note: unit.note,
});

/**
 * The parent item, read **without** a lock.
 *
 * Used only on the detail-only path, where nothing here writes a counter, so a
 * `SELECT … FOR UPDATE` would buy nothing and would refuse a legitimate edit to
 * the tag of a soft-deleted item (a soft-deleted item is a `NOT_FOUND` to
 * `getLockedItem`). The status-changing path does not come through here — it
 * takes the locked row, because it is about to change `qty`.
 */
const readItemForResult = async (
  db: Executor,
  itemId: string
): Promise<InventoryItemRow> => {
  const [record] = await db
    .select()
    .from(inventoryItem)
    .where(eq(inventoryItem.id, itemId))
    .limit(1);

  if (!record) {
    throw new ORPCError("NOT_FOUND", { message: "Item not found" });
  }

  return record;
};

/**
 * The procedure's return shape.
 *
 * The `item` half exists for its recomputed `status`, not for its counters. A
 * unit that is removed can turn an item's badge from *Available* to *Out of
 * stock* or to *Borrowed*, and the UI would otherwise have to refetch the whole
 * item to repaint one chip — a refetch that races the mutation it is reacting
 * to. Returning the derived status closes the loop without a second request.
 */
const toUpdateResult = (unit: InventoryUnitRow, item: InventoryItemRow) => {
  const counters = countersOf(item);

  return {
    unit: {
      id: unit.id,
      uniqueNo: unit.uniqueNo,
      status: unit.status,
      condition: unit.condition,
      location: unit.location,
      note: unit.note,
    },
    item: {
      id: item.id,
      name: item.name,
      sku: item.sku,
      qty: item.qty,
      borrowedQty: item.borrowedQty,
      availableQty: calculateAvailableQuantity(counters),
      status: calculateItemStatus(counters, item.condition),
    },
  };
};

/** The handler's input, stated as a type so the two paths below can take it. */
interface UpdateUnitInput {
  unitId: string;
  status?: UnitStatus | undefined;
  condition?: ItemCondition | undefined;
  location?: string | undefined;
  note?: string | undefined;
}

/**
 * The detail-only path: condition, location and note, with no status change.
 *
 * No counter moves and the parent item is not written, so the item is read back
 * **without** a lock — see `readItemForResult`. Keeping this out of the main
 * handler is not only about the complexity limit: it is the clearest statement
 * of the rule that re-tagging a device is not a movement.
 */
const applyDetailEdit = async (
  tx: Executor,
  actor: InventoryActor,
  existing: InventoryUnitRow,
  input: UpdateUnitInput
) => {
  const [updatedUnit] = await tx
    .update(inventoryUnit)
    .set({
      condition: input.condition ?? existing.condition,
      location: input.location ?? existing.location,
      note: input.note ?? existing.note,
    })
    .where(eq(inventoryUnit.id, existing.id))
    .returning();

  if (!updatedUnit) {
    throw new ORPCError("NOT_FOUND", { message: "Asset unit not found" });
  }

  await insertInventoryAuditLog(tx, {
    actor,
    action: "unit.update",
    entityType: "inventory_unit",
    entityId: existing.id,
    before: unitSnapshot(existing),
    after: unitSnapshot(updatedUnit),
  });

  const item = await readItemForResult(tx, existing.itemId);
  return toUpdateResult(updatedUnit, item);
};

/**
 * The status-changing path, and the only one in this file that writes to
 * `inventoryItem`.
 *
 * The ordering is load-bearing and runs top to bottom: the two lifecycle
 * guards, then the item lock, then the counter guards, then the counter write,
 * then the unit write, then the audit. Nothing is written before every guard
 * that could refuse it has run, so a refusal leaves no partial movement behind.
 */
const applyStatusChange = async (
  tx: Executor,
  actor: InventoryActor,
  existing: InventoryUnitRow,
  input: UpdateUnitInput,
  status: string
) => {
  // Re-asserted here as well as in the handler: this is the path that moves a
  // counter, so it is the path that must never be callable with a status no
  // person is allowed to type.
  assertManualStatusAllowed(status);

  /**
   * Both guards, before the counter arithmetic and before any write.
   *
   * `assertNoActiveLifecycleUnit` answers "may this unit move at all?" and
   * covers the three things that speak for it: an unreleased borrow, a prior
   * issue (permanent — the device is not in this building), and a disposal
   * waiting on a signature. `assertUnitsNotPendingDisposal` is then asked
   * separately because a *finalised* disposal leaves a row here whose unit is
   * already written off, and that one must not block a restore.
   */
  await assertNoActiveLifecycleUnit(tx, existing.id);
  await assertUnitsNotPendingDisposal(tx, [existing.id]);

  /**
   * **The lock is on the item, not on the unit.** That is the entire point of
   * this call, and getting it backwards is a real bug rather than a style
   * preference: `qty` lives on `inventoryItem`, so two clerks removing two
   * different tags of the same laptop at the same moment both read `qty = 3`
   * and both write `qty = 2`, and the store is now over-counted by one with no
   * trace. The unit row's own update is a single-row write that cannot lose a
   * counter, so locking it buys nothing, and locking only it is the classic way
   * to ship this bug.
   */
  const lockedItem = await getLockedItem(tx, existing.itemId);

  const delta = unitQuantityDelta(existing.status, status);
  let itemRow = lockedItem;

  if (delta !== 0) {
    /**
     * Both directions are guarded, and both are refusals rather than
     * corrections. Removing a unit from an item with nothing free and clear on
     * the shelf is refused because it would drive `qty` below `borrowedQty` and
     * trip `inventory_item_counters_within_qty` — the store would claim to
     * hold fewer things than it has lent out. The message says *why*, because
     * "cannot be written off" with no reason sends the clerk to an
     * administrator to ask.
     */
    const available = calculateAvailableQuantity(countersOf(lockedItem));

    if (delta < 0 && available < 1) {
      throw new ORPCError("CONFLICT", {
        message: `Every unit of ${lockedItem.name} is on loan — return the borrowed unit before writing one off`,
      });
    }

    if (delta > 0 && lockedItem.qty < 1) {
      throw new ORPCError("CONFLICT", {
        message: `${lockedItem.name} has nothing on its books to restore — check how it was written off`,
      });
    }

    const [record] = await tx
      .update(inventoryItem)
      .set({ qty: lockedItem.qty + delta })
      .where(eq(inventoryItem.id, lockedItem.id))
      .returning();

    if (!record) {
      throw new ORPCError("NOT_FOUND", { message: "Item not found" });
    }

    itemRow = record;

    /**
     * The note **names the asset tag**.
     *
     * A single unit is not an anonymous quantity in a school's books. The
     * transaction screen is a list of movements and "Stock in +1" on a row of
     * forty tells an auditor nothing; "Restored to stock: LT-0042" tells them
     * which device reappeared and lets them find the write-off that removed
     * it. The `meta` carries the unit id as well as the tag, for the same
     * reason the source app did: one of the two is what a human reads and the
     * other is what a program joins on.
     */
    await insertInventoryTransaction(tx, {
      actor,
      action: delta > 0 ? "stock_in" : "stock_out",
      item: { id: lockedItem.id, name: lockedItem.name, sku: lockedItem.sku },
      before: countersOf(lockedItem),
      after: countersOf(record),
      note:
        delta > 0
          ? `Restored to stock: ${existing.uniqueNo}`
          : `Written off: ${existing.uniqueNo}`,
      meta: {
        unitId: existing.id,
        uniqueNo: existing.uniqueNo,
        statusFrom: existing.status,
        statusTo: status,
      },
    });
  }

  const [updatedUnit] = await tx
    .update(inventoryUnit)
    .set({
      status,
      condition: input.condition ?? existing.condition,
      location: input.location ?? existing.location,
      note: input.note ?? existing.note,
    })
    .where(eq(inventoryUnit.id, existing.id))
    .returning();

  if (!updatedUnit) {
    throw new ORPCError("NOT_FOUND", { message: "Asset unit not found" });
  }

  await insertInventoryAuditLog(tx, {
    actor,
    action: "unit.update",
    entityType: "inventory_unit",
    entityId: existing.id,
    before: unitSnapshot(existing),
    after: unitSnapshot(updatedUnit),
  });

  return toUpdateResult(updatedUnit, itemRow);
};

export const updateUnit = adminOnlyProcedure
  .input(
    v.object({
      unitId: inventoryUnitIdSchema,
      status: v.optional(unitStatusSchema),
      condition: v.optional(itemConditionSchema),
      location: v.optional(v.string()),
      note: v.optional(v.string()),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);

    return context.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(inventoryUnit)
        .where(eq(inventoryUnit.id, input.unitId))
        .limit(1);

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "Asset unit not found" });
      }

      /**
       * First thing after the row is resolved, before anything is written.
       *
       * This is the invariant a future editor is most likely to break, because
       * the code above it reads as a perfectly ordinary optional field and the
       * failure is silent and remote: the edit succeeds, the screen updates,
       * and the register stops matching the cupboard. If you are tempted to
       * widen this to accept more statuses because a screen needs it, the
       * screen needs the procedure that owns the lifecycle instead.
       */
      if (input.status !== undefined) {
        assertManualStatusAllowed(input.status);
      }

      // A status that is absent, or identical to the one already stored, is a
      // detail edit: nothing about the school's holdings has changed, so no
      // counter and no ledger row is written for it. A caller that re-submits
      // the form unchanged gets a no-op rather than a spurious movement.
      const statusChanged =
        input.status !== undefined && input.status !== existing.status;

      if (!statusChanged) {
        return applyDetailEdit(tx, actor, existing, input);
      }

      // `statusChanged` proves `input.status` is defined.
      return applyStatusChange(
        tx,
        actor,
        existing,
        input,
        input.status ?? existing.status
      );
    });
  });
