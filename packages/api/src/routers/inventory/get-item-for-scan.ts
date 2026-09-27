/**
 * One item, read for a QR scan — the narrow, teacher-reachable sibling of
 * `get-item.ts`, which is deliberately `inventoryOverseerProcedure` and refuses a teacher
 * outright.
 *
 * `getItem` cannot be widened for this: it hands back any item in the school
 * on request — name, valuation, location, manager, custodian — and a teacher
 * who could look any item up by id would have the whole register one scan
 * away, which is exactly the school-wide read `packages/auth/src/permissions.ts`
 * keeps off the `teacher` statement. A QR scanner still needs *some* by-id
 * read, so this procedure narrows the same way every other self-service
 * procedure in this feature does: it returns the item only when the caller
 * could already reach it through a properly-scoped list —
 * `listTakeableItems` (available to claim) or `listMyItems` (already theirs,
 * either as manager or custodian) — and refuses everything else with the
 * same message a teacher would get for typing an unrelated item's id into a
 * URL bar. Leadership, who may already read the whole register, is admitted
 * unconditionally, same as `list-custody-history.ts`.
 *
 * A fourth door widened this beyond the original three: **an item a named
 * colleague already holds**, scanned by somebody who is neither its manager
 * nor its custodian. That scan is now admitted too, because the physical
 * label in front of the scanner is exactly the fact `custody.requests.create`
 * needs — which item, held by whom — and refusing the scan would send a
 * teacher standing in front of the projector to a search box to find the same
 * item by name instead. `canRequest` on the response is what a widened scan
 * offers instead of `canTake`, and `custodianName` travels with it for the
 * same reason `list-requestable-items.ts` selects it: the caller is about to
 * send a named person a request, not browse a roster.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryItem,
  inventoryItemIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, eq, isNull } from "drizzle-orm";
import { object } from "valibot";

import { requireInventoryPermission } from "../../index";
import {
  calculateAvailableQuantity,
  calculateItemStatus,
} from "./inventory-calculations";
import {
  countersOf,
  getInventoryActor,
  itemViewJoins,
  toItemView,
} from "./inventory-database";

/** Restated from `release-custody.ts`/`list-custody-history.ts` — see either. */
const ADMIN_ROLES = new Set(["admin", "principal", "vicePrincipal"]);

export const getItemForScan = requireInventoryPermission("read")
  .input(object({ itemId: inventoryItemIdSchema }))
  .handler(async ({ input, context }) => {
    const [actor, [row]] = await Promise.all([
      getInventoryActor(context),
      itemViewJoins(context.db)
        .where(
          and(
            eq(inventoryItem.id, input.itemId),
            isNull(inventoryItem.deletedAt)
          )
        )
        .limit(1),
    ]);

    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Item not found" });
    }

    const role = context.session?.user.role ?? "";
    const isLeadership = ADMIN_ROLES.has(role);

    const isInvolved =
      row.managerStaffId === actor.userId ||
      row.custodianStaffId === actor.userId;

    const status = calculateItemStatus(countersOf(row), row.condition);
    const isTakeable =
      row.borrowable &&
      row.custodianStaffId === null &&
      status === "available" &&
      calculateAvailableQuantity(countersOf(row)) > 0;

    // Requestable: somebody else already holds it, it is one the school lends
    // out, and it is not marked Damaged — the same admission
    // `create-custody-request.ts` itself checks under a row lock before
    // writing anything, restated here only to decide what the scan may offer.
    const isRequestable =
      row.borrowable &&
      row.custodianStaffId !== null &&
      row.custodianStaffId !== actor.userId &&
      status !== "damaged";

    if (!isLeadership && !isInvolved && !isTakeable && !isRequestable) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "You can only scan an item that is available to take or request, or one you already hold or are in charge of",
      });
    }

    return {
      ...toItemView(row),
      // What the scanner offers next, decided server-side so the client never
      // has to re-derive eligibility from raw counters and risk offering a
      // button the mutation behind it would refuse.
      canTake: isTakeable && row.custodianStaffId !== actor.userId,
      canHandBack: row.custodianStaffId === actor.userId,
      canRequest: isRequestable,
    };
  });
