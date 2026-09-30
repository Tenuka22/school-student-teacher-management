/**
 * A teacher hands an item back — to a named person, because the register never
 * says "nobody".
 *
 * Every item always has a custodian: `inventory_item.custodian_staff_id` is
 * `NOT NULL`, and a hand-back that left the pointer empty would violate it. So
 * this procedure asks **who takes it now** (`newCustodianStaffId`, required)
 * and writes that person in — the item returns to the store the way it returns
 * to a person.
 *
 * **Who may pick, and who may not, is the same narrowing this procedure has
 * always done, restated for a successor instead of a null.** The ordinary
 * hand-back lands on the item's in-charge person, and a holder whose role is
 * just `take` may pick *only* that person: moving custody to a third party is
 * what `transferCustody` does, and that sits on `update` — allowing a `take`
 * holder to aim a release anywhere would hand them the same move through the
 * narrower gate, with the reason field gone as well. The leadership seats (the
 * set below) may redirect a hand-back wherever they like, which costs them
 * nothing they could not already do with `transferCustody`, and is what makes
 * this dialog's picker on the admin register a free one. For a teacher, this
 * procedure is "put it back with the person answerable for it", and the scan
 * page renders exactly that: a stated destination, not a choice.
 *
 * That is the point of keeping this verb separate from `transferCustody`:
 * `update` is the write gate on `transferCustody`, `assignManager`,
 * `updateItem`, `updateUnit`, `stockOut`, `returnBorrow` and `cancelDisposal`,
 * and a teacher who could move items around freely would hold all of those.
 * The procedure narrows it from the opposite direction: only the teacher
 * currently holding the item may release it, plus the leadership seats, so an
 * administrator can move custody on after a departure without the departed
 * teacher having to log in.
 */
import { ORPCError } from "@orpc/server";
import { itemConditionSchema } from "@school-student-teacher-management/db/constants/inventory";
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
 * The roles that may release an item on somebody else's behalf, and — since a
 * successor exists now — the roles whose hand-back may be aimed at anybody
 * rather than only at the person in charge. The three leadership seats from
 * `ADMIN_ROLES` in `packages/api/src/index.ts:77` plus `inventoryAdmin`: that
 * list is not exported from there, so it is restated with a pointer rather than
 * imported from a module that already has a reason to own it, and
 * `inventoryAdmin` joins it because the register is this seat's whole job.
 */
const ADMIN_ROLES = new Set([
  "admin",
  "principal",
  "vicePrincipal",
  "inventoryAdmin",
]);

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

export const releaseCustody = requireInventoryPermission("take")
  .input(
    object({
      itemId: inventoryItemIdSchema,
      /**
       * Required, and required by the database rather than by taste:
       * `inventory_item.custodian_staff_id` is `NOT NULL`, so a hand-back has
       * to say whose hands the item lands in. Must not be the current holder —
       * that is refused below as a no-op rather than written as a row that
       * claims custody moved when it did not. For a holder who is not
       * leadership it must also be the item's in-charge person; see the file
       * comment for why `take` does not get a free aim.
       */
      newCustodianStaffId: staffRefSchema,
      note: optional(pipe(string(), minLength(1))),
      /**
       * What condition the item is in as it comes back, optional because
       * most hand-backs change nothing about the item itself \u2014 only who
       * holds it. Left unset, the item's condition is untouched; set, it
       * overwrites `inventoryItem.condition` the same write `updateItem`
       * makes, so a teacher handing back a cracked tripod can say so at the
       * moment it matters rather than relying on a separate "Report a
       * problem" action or an administrator noticing later.
       */
      condition: optional(itemConditionSchema),
    })
  )
  .handler(async ({ input, context }) => {
    // The pointer, the history row, the ledger row and the audit row commit or
    // roll back together: a release without its history row would leave the
    // successor holding an item with no record of how it reached them.
    const result = await context.db.transaction(async (tx) => {
      // Independent reads: the actor lookup is on `context.db` against
      // `staff` and cannot race the `FOR UPDATE` on the item below. It cannot
      // reject either, because the permission gate has already established a
      // session.
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedItem(tx, input.itemId),
      ]);

      if (!existing.custodianStaffId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This item is not in anyone's custody",
        });
      }

      // Authorization check: a teacher who is not the holder learns nothing
      // about the item's stock state.
      const role = context.session?.user.role ?? "";
      const isAdmin = ADMIN_ROLES.has(role);
      if (existing.custodianStaffId !== actor.staffId && !isAdmin) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "Only the teacher holding this item, or an administrator, can hand it back to the store",
        });
      }

      // The narrowing from the file comment: a holder outside the leadership
      // set hands back to the person in charge and to nobody else, because
      // aiming custody at a third party is `transferCustody`'s move and that
      // sits on `update`. Read before the assignability check so a teacher is
      // told who they *can* hand to rather than whether a person they may not
      // pick is employable.
      const ownerName = existing.managerStaffId
        ? await resolveStaffName(tx, existing.managerStaffId)
        : null;
      if (!isAdmin && input.newCustodianStaffId !== existing.managerStaffId) {
        throw new ORPCError("FORBIDDEN", {
          message: ownerName
            ? `You can hand this back to ${ownerName}, the person in charge of this item — moving it to somebody else is an administrator's transfer`
            : "This item has nobody in charge of it, so only an administrator can hand it back",
        });
      }

      // The successor must be real, employable staff — the same school-domain
      // assertion every holder write makes, so a released item cannot land on a
      // departed or unassignable row. Returns the name the ledger and the
      // return payload need.
      const newHolder = await assertStaffIsAssignable(
        tx,
        input.newCustodianStaffId,
        "staff member"
      );

      // Refused as a no-op rather than written as a `custody_released` row that
      // moves nothing: a trail entry claiming custody changed hands when it did
      // not is the kind of row an audit cannot use.
      if (input.newCustodianStaffId === existing.custodianStaffId) {
        throw new ORPCError("CONFLICT", {
          message: `${newHolder.name} is already holding this item`,
        });
      }

      const previousCustodianName = await resolveStaffName(
        tx,
        existing.custodianStaffId
      );

      await tx
        .update(inventoryItem)
        .set({
          custodianStaffId: input.newCustodianStaffId,
          ...(input.condition ? { condition: input.condition } : {}),
        })
        .where(eq(inventoryItem.id, existing.id));

      // `custody_released` naming the **new** holder rather than a null:
      // `inventory_custody_history_manager_columns` holds because "is a custody
      // type" is true and "both manager columns are null" is also true, and
      // `inventory_custody_history_reason_required` holds because
      // `returned_to_store` is not null. The reason is not free text: it comes
      // from the closed `INVENTORY_TRANSFER_REASONS` vocabulary so a report can
      // group hand-backs by cause, and `returned_to_store` is the honest cause —
      // the item went back the way it came, into the hands the store answers
      // through.
      const [history] = await tx
        .insert(inventoryCustodyHistory)
        .values({
          id: crypto.randomUUID(),
          itemId: existing.id,
          previousCustodianStaffId: existing.custodianStaffId,
          newCustodianStaffId: input.newCustodianStaffId,
          previousManagerStaffId: null,
          newManagerStaffId: null,
          changeType: "custody_released",
          reason: "returned_to_store",
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

      await insertInventoryTransaction(tx, {
        actor,
        action: "custody_released",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(existing),
        note: input.note ?? null,
        meta: {
          previousCustodianName,
          newCustodianName: newHolder.name,
          reason: "returned_to_store",
          ...(input.condition
            ? {
                conditionBefore: existing.condition,
                conditionAfter: input.condition,
              }
            : {}),
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "custody.release",
        entityType: "inventory_item",
        entityId: existing.id,
        before: {
          custodianStaffId: existing.custodianStaffId,
          custodianName: previousCustodianName,
          ...(input.condition ? { condition: existing.condition } : {}),
        },
        after: {
          custodianStaffId: input.newCustodianStaffId,
          custodianName: newHolder.name,
          ...(input.condition ? { condition: input.condition } : {}),
        },
      });

      return {
        itemId: existing.id,
        previousCustodianName,
        custodianStaffId: input.newCustodianStaffId,
        custodianName: newHolder.name,
        condition: input.condition ?? existing.condition,
        changeType: "custody_released" as const,
        changedAt: iso(history.changedAt),
      };
    });

    return result;
  });
