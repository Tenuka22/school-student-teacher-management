/**
 * A teacher claims an available item for themselves.
 *
 * This is the self-service mirror of `transferCustody`, and it exists for a
 * specific reason: a `teacher` role holding `inventory: ["read"]` is otherwise
 * a dead end. A teacher who needs a tripod before Friday's fieldwork has no
 * route to the equipment that does not go through an administrator's desk, and
 * the workaround — an admin editing the record by hand — is exactly the change
 * nobody wants made on the teacher's behalf.
 *
 * The permission is `requireInventoryPermission("take")` — the narrow
 * self-service action, **not** `update`. `update` is the gate on
 * `transferCustody`, `assignManager`, `updateItem`, `updateUnit`, `stockOut`,
 * `returnBorrow` and `cancelDisposal`, so granting a teacher `update` to reach
 * this button would hand them all seven of those with it. The procedure
 * **narrows** rather than widens: the custodian is always the caller's own staff
 * row and `newCustodianStaffId` is deliberately not an input. A teacher can
 * therefore claim an item for themselves and can never take one away from a
 * colleague — that is what `transferCustody` and an administrator are for.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryCustodyHistory,
  inventoryItem,
  inventoryItemIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { minLength, object, optional, pipe, string } from "valibot";

import { requireInventoryPermission } from "../../index";
import { calculateItemStatus } from "./inventory-calculations";
import type { InventoryItemStatus } from "./inventory-calculations";
import type { Executor } from "./inventory-database";
import {
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertCustodyNoticeRecipients,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
} from "./inventory-database";

/**
 * Why an item cannot be claimed, one line per derived status.
 *
 * The four statuses are told apart because they mean different things to the
 * person at the screen: "we have none" is a request to the store, "it is out on
 * loan" is a date to wait for, and "it is damaged" is a report to file. A single
 * "not available" would leave the teacher guessing which.
 *
 * The `available` entry is unreachable — it is only read after the status has
 * been compared against `"available"` — but the map is total on purpose so that
 * adding a fifth status to `calculateItemStatus` fails to compile here instead
 * of silently falling through to a message that describes the wrong thing.
 */
const STATUS_REFUSAL_MESSAGES = {
  out_of_stock: "There is no stock of this item left to take",
  damaged: "This item is marked Damaged and is not available to be taken",
  available: "This item cannot be taken from the store right now",
} as const satisfies Record<InventoryItemStatus, string>;

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

export const takeItem = requireInventoryPermission("take")
  .input(
    object({
      itemId: inventoryItemIdSchema,
      note: optional(pipe(string(), minLength(1))),
    })
  )
  .handler(async ({ input, context }) => {
    // Admin accounts cannot own or take items for themselves. This guard reads
    // the session only, so it runs before the actor is resolved: an admin who
    // may not take anything has no use for the lookup that would tell them who
    // they are.
    if (context.session?.user?.role === "admin") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Admin accounts cannot own or claim equipment",
      });
    }

    // Resolved before the transaction opens: the null-staff refusal below should
    // not take a row lock on an item it is about to abandon.
    const actor = await getInventoryActor(context);

    const result = await context.db.transaction(async (tx) => {
      const existing = await getLockedItem(tx, input.itemId);

      // `borrowable` is the item's own policy flag and the status is the
      // derived truth, and they are refused with different messages: "this
      // kind of thing is not handed out" and "this particular thing is not on
      // the shelf today" are different reports.
      if (!existing.borrowable) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "This item is not one that is handed out to teachers, so it stays with the store",
        });
      }

      // Derived by the same function the list badges and the list's SQL filter
      // use, so a teacher can never be told an item is available here while the
      // store's own list shows it as borrowed.
      const status = calculateItemStatus(
        countersOf(existing),
        existing.condition
      );
      if (status !== "available") {
        throw new ORPCError("BAD_REQUEST", {
          message: STATUS_REFUSAL_MESSAGES[status],
        });
      }

      const previousCustodianName = existing.custodianStaffId
        ? await resolveStaffName(tx, existing.custodianStaffId)
        : null;

      if (existing.custodianStaffId === actor.staffId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This item is already assigned to you",
        });
      }

      // Somebody else is already holding it. This used to be reachable —
      // `calculateItemStatus` never looks at custody, so a colleague's
      // claimed item could still read as "available" — and a teacher
      // could walk off with a colleague's equipment with nobody asked. That is
      // exactly the gap `custody.requests` exists to close: an item already in
      // a named person's hands is requested, not taken, and the current
      // holder decides. `listTakeableItems` carries the identical guard in SQL
      // now, so the catalogue and this refusal cannot drift apart again.
      if (existing.custodianStaffId) {
        throw new ORPCError("BAD_REQUEST", {
          message: `${previousCustodianName ?? "A colleague"} is already holding this item — send a request instead of taking it directly`,
        });
      }

      await tx
        .update(inventoryItem)
        .set({ custodianStaffId: actor.staffId })
        .where(eq(inventoryItem.id, existing.id));

      // The guard above means `existing.custodianStaffId` is always null by
      // this point, so every claim this procedure makes is a first claim on an
      // unheld item — `custody_taken`, with no reason to record because
      // nobody was displaced.
      const changeType = "custody_taken" as const;
      const reason = null;

      const [history] = await tx
        .insert(inventoryCustodyHistory)
        .values({
          id: crypto.randomUUID(),
          itemId: existing.id,
          previousCustodianStaffId: existing.custodianStaffId,
          newCustodianStaffId: actor.staffId,
          previousManagerStaffId: null,
          newManagerStaffId: null,
          changeType,
          reason,
          note: input.note ?? null,
          changedByStaffId: actor.staffId,
        })
        .returning();

      if (!history) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await insertCustodyNoticeRecipients(tx, {
        custodyHistoryId: history.id,
        itemId: existing.id,
        previousCustodianStaffId: existing.custodianStaffId,
        managerStaffId: existing.managerStaffId,
        changedByStaffId: actor.staffId,
      });

      // Taking an item is a change of hands, not of stock: the units are still
      // in the school's possession, so the counters are written identically on
      // both sides and the borrow flow is what moves them.
      await insertInventoryTransaction(tx, {
        actor,
        action: changeType,
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(existing),
        note: input.note ?? null,
        meta: {
          previousCustodianName,
          // `actor.name` is the staff row's name whenever `staffId` is
          // now always present via actor.staffId.
          newCustodianName: actor.name,
          reason,
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
        after: { custodianStaffId: actor.staffId, custodianName: actor.name },
      });

      // The same shape `transferCustody` returns, so the web app can render one
      // success toast for both and the caller never has to re-read the item to
      // learn who holds it now.
      return {
        itemId: existing.id,
        previousCustodianName,
        custodianStaffId: actor.staffId,
        custodianName: actor.name,
        changeType,
        changedAt: iso(history.changedAt),
      };
    });

    return result;
  });
