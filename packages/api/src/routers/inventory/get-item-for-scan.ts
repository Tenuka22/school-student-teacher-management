/**
 * One item, read for a QR scan — the narrow, teacher-reachable sibling of
 * `get-item.ts`, which is deliberately `adminProcedure` and refuses a teacher
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
      actor.staffId !== null &&
      (row.managerStaffId === actor.staffId ||
        row.custodianStaffId === actor.staffId);

    const status = calculateItemStatus(countersOf(row), row.condition);
    const isTakeable =
      row.borrowable &&
      status === "available" &&
      calculateAvailableQuantity(countersOf(row)) > 0;

    if (!isLeadership && !isInvolved && !isTakeable) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "You can only scan an item that is available to take, or one you already hold or are in charge of",
      });
    }

    return {
      ...toItemView(row),
      // What the scanner offers next, decided server-side so the client never
      // has to re-derive eligibility from raw counters and risk offering a
      // button the mutation behind it would refuse.
      canTake: isTakeable && row.custodianStaffId !== actor.staffId,
      canHandBack: row.custodianStaffId === actor.staffId,
    };
  });
