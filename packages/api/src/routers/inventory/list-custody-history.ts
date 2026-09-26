/**
 * The whole story of who held an item, in order.
 *
 * This table is the answer to "who had the microscope last June", and it is
 * **append-only by design**: nothing here is ever updated or deleted, and it
 * holds a row per change rather than a single current value. The
 * `custodianStaffId` column on `inventory_item` is only the latest state — it
 * is overwritten in place, it says nothing about how the item got there, and it
 * goes null on `set null` when a teacher leaves. So this procedure is the only
 * place the sequence exists, and it is read whole rather than summarised.
 *
 * A `null` previous or new staff id is expected, not a defect: the four staff
 * columns on `inventoryCustodyHistory` are nullable `set null` rather than
 * cascade, precisely so that deleting a staff record retires the name from the
 * trail instead of deleting the trail. The row still says what happened, the
 * `changeType` still says which of the two pointers moved, and the `reason`
 * column still names the cause.
 *
 * **Security property, in one sentence: the trail names real people, so it is
 * scoped to the caller here rather than by the permission.** It stays on
 * `requireInventoryPermission("read")` because this is the "My Equipment"
 * page's history panel and a teacher who holds an item has to be able to open
 * it — but the trail for *any* `itemId` is the school-wide record of who had
 * what and when, so the scoping is the handler's job, below.
 */
import { ORPCError } from "@orpc/server";
import {
  custodyChangeTypeLabel,
  inventoryTransferReasonLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryCustodyHistory,
  inventoryItem,
  inventoryItemIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  integer,
  maxValue,
  minValue,
  number,
  object,
  optional,
  pipe,
} from "valibot";

import { requireInventoryPermission } from "../../index";
import { getInventoryActor, iso } from "./inventory-database";

/**
 * The three leadership seats, restated from `ADMIN_ROLES` in
 * `packages/api/src/index.ts:77` rather than imported — that list is module
 * private there, and a second copy with a pointer is cheaper than widening a
 * module's public surface for one scoping guard. `release-custody.ts` and
 * `list-items.ts` each carry the same copy for the same reason.
 */
const ADMIN_ROLES = new Set(["admin", "principal", "vicePrincipal"]);

/**
 * `staff` four times, once per pointer on the history row. They are four
 * distinct aliases rather than one table joined repeatedly because a single
 * alias could not label which of the four it had matched, and the whole value
 * of this screen is that "Priya → null" and "null → Priya" are told apart by
 * the pair of columns they sit in.
 *
 * All four are `left` joins: a null id is the normal case for the manager pair
 * on a custody row and for the new custodian on a release, and an inner join
 * would delete exactly those rows from the audit.
 */
const previousCustodian = alias(staff, "previous_custodian_staff");
const newCustodian = alias(staff, "new_custodian_staff");
const previousManager = alias(staff, "previous_manager_staff");
const newManager = alias(staff, "new_manager_staff");

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export const listCustodyHistory = requireInventoryPermission("read")
  .input(
    object({
      itemId: inventoryItemIdSchema,
      limit: optional(
        pipe(number(), integer(), minValue(1), maxValue(MAX_LIMIT))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    /**
     * The caller's identity and the item's two current pointers, in one round
     * trip. They are independent reads against the same pool — the actor lookup
     * is on `staff` and the item read is on `inventory_item`, neither can reject
     * (the permission gate has already established a session) and neither depends
     * on the other — so batching them is `release-custody.ts`'s pattern for the
     * same two values.
     *
     * **`getLockedItem` is deliberately not used for the item.** This is a read,
     * so it takes no row lock: a lock here would serialise every teacher's
     * history sheet against every stock movement in the school, on a procedure
     * whose entire output is a static, append-only list. The two pointers are
     * selected rather than joined so the scope test below is a two-comparison
     * check in TypeScript instead of a second round trip.
     *
     * `getInventoryActor` returns `staffId: null` for an account with no staff
     * row, and that is **not** a bug on a later read: the seeded `admin` /
     * `principal` / `vicePrincipal` seats are users with no staff identity by
     * design, so a null `staffId` here means a leadership account, and the role
     * check short-circuits it. It never reaches the pointer comparison below, so
     * "null === null" is never evaluated and no leadership seat is refused.
     */
    const [actor, [item]] = await Promise.all([
      getInventoryActor(context),
      context.db
        .select({
          id: inventoryItem.id,
          managerStaffId: inventoryItem.managerStaffId,
          custodianStaffId: inventoryItem.custodianStaffId,
        })
        .from(inventoryItem)
        .where(
          and(
            eq(inventoryItem.id, input.itemId),
            isNull(inventoryItem.deletedAt)
          )
        )
        .limit(1),
    ]);

    // A soft-deleted item is a non-existent item here, matching
    // `getLockedItem`. The history is still on the table, but nothing in the
    // app routes to it, and a 200-item list of a deleted row is a dead end.
    // This is checked before the scoping below so a caller with no claim on the
    // item learns `NOT_FOUND` about a deleted record rather than `FORBIDDEN`
    // about one that still exists.
    if (!item) {
      throw new ORPCError("NOT_FOUND", { message: "Item not found" });
    }

    /**
     * The scope. A teacher may read the trail of an item they hold or are in
     * charge of — that is the "My Equipment" panel — and nothing else. The three
     * leadership seats may read any trail, which is what the school-wide audit
     * question ("who had the microscope last June") needs.
     *
     * Both pointers are checked because they answer different questions: a
     * teacher can *manage* an item without currently carrying it (a departmental
     * set they are accountable for), and can *hold* one they are not the manager
     * of. Requiring both would refuse either case, and the `listMyItems` filter
     * this mirrors is an `or` for the same reason.
     */
    const role = context.session?.user.role ?? "";
    const isLeadership = ADMIN_ROLES.has(role);
    const isCallerInvolved =
      actor.staffId !== null &&
      (item.managerStaffId === actor.staffId ||
        item.custodianStaffId === actor.staffId);

    if (!isLeadership && !isCallerInvolved) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "You can only see the custody history of an item you hold or are in charge of",
      });
    }

    const rows = await context.db
      .select({
        id: inventoryCustodyHistory.id,
        changeType: inventoryCustodyHistory.changeType,
        reason: inventoryCustodyHistory.reason,
        note: inventoryCustodyHistory.note,
        changedAt: inventoryCustodyHistory.changedAt,
        previousCustodianStaffId:
          inventoryCustodyHistory.previousCustodianStaffId,
        newCustodianStaffId: inventoryCustodyHistory.newCustodianStaffId,
        previousManagerStaffId: inventoryCustodyHistory.previousManagerStaffId,
        newManagerStaffId: inventoryCustodyHistory.newManagerStaffId,
        previousCustodianName: previousCustodian.name,
        newCustodianName: newCustodian.name,
        previousManagerName: previousManager.name,
        newManagerName: newManager.name,
      })
      .from(inventoryCustodyHistory)
      .leftJoin(
        previousCustodian,
        eq(
          inventoryCustodyHistory.previousCustodianStaffId,
          previousCustodian.id
        )
      )
      .leftJoin(
        newCustodian,
        eq(inventoryCustodyHistory.newCustodianStaffId, newCustodian.id)
      )
      .leftJoin(
        previousManager,
        eq(inventoryCustodyHistory.previousManagerStaffId, previousManager.id)
      )
      .leftJoin(
        newManager,
        eq(inventoryCustodyHistory.newManagerStaffId, newManager.id)
      )
      .where(eq(inventoryCustodyHistory.itemId, input.itemId))
      // Newest first, because the question this screen is opened for is always
      // about the most recent change. `id` breaks the tie: `changed_at` is a
      // `defaultNow()` and two changes inside one transaction share it, and an
      // unstable order would let a cursor-page reorder rows the reader has
      // already seen.
      .orderBy(
        desc(inventoryCustodyHistory.changedAt),
        desc(inventoryCustodyHistory.id)
      )
      .limit(input.limit ?? DEFAULT_LIMIT);

    return rows.map((row) => ({
      id: row.id,
      changeType: row.changeType,
      // Labels are generated server-side, next to the keys they render, so an
      // export and a screen cannot disagree about what `custody_taken` reads
      // as. `inventoryTransferReasonLabel` is the null-safe one: a `custody_taken`
      // row has no reason and renders as "Not set" rather than as a gap.
      changeTypeLabel: custodyChangeTypeLabel(row.changeType),
      reason: row.reason,
      reasonLabel: inventoryTransferReasonLabel(row.reason),
      note: row.note,
      changedAt: iso(row.changedAt),
      previousCustodianStaffId: row.previousCustodianStaffId,
      newCustodianStaffId: row.newCustodianStaffId,
      previousManagerStaffId: row.previousManagerStaffId,
      newManagerStaffId: row.newManagerStaffId,
      // A null name beside a non-null id means the staff record was deleted;
      // a null on both means the slot was empty at the time, which is a fact
      // about the change rather than a missing value.
      previousCustodianName: row.previousCustodianName,
      newCustodianName: row.newCustodianName,
      previousManagerName: row.previousManagerName,
      newManagerName: row.newManagerName,
    }));
  });
