/**
 * "I saw this" — the recipient's plain acknowledgement of a custody-change
 * notice `list-custody-notices.ts` surfaced to them.
 *
 * Terminal and one-way: there is no `unacknowledge`, because the point of the
 * flag is to stop showing a notice once its recipient has read it, not to
 * track a reader's changing mind about having read something.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryCustodyHistory,
  inventoryCustodyHistoryIdSchema,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq } from "drizzle-orm";
import { object } from "valibot";

import { requireInventoryPermission } from "../../index";
import { getInventoryActor } from "./inventory-database";

/** Restated from `release-custody.ts`/`list-custody-history.ts` — see either. */
const ADMIN_ROLES = new Set(["admin", "principal", "vicePrincipal"]);

export const acknowledgeCustodyNotice = requireInventoryPermission("take")
  .input(object({ id: inventoryCustodyHistoryIdSchema }))
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);
    const role = context.session?.user.role ?? "";
    const isLeadership = ADMIN_ROLES.has(role);

    const [row] = await context.db
      .select({
        id: inventoryCustodyHistory.id,
        previousCustodianStaffId:
          inventoryCustodyHistory.previousCustodianStaffId,
        managerStaffId: inventoryItem.managerStaffId,
        acknowledgedAt: inventoryCustodyHistory.acknowledgedAt,
      })
      .from(inventoryCustodyHistory)
      .innerJoin(
        inventoryItem,
        eq(inventoryCustodyHistory.itemId, inventoryItem.id)
      )
      .where(eq(inventoryCustodyHistory.id, input.id))
      .limit(1);

    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Notice not found" });
    }

    const isRecipient =
      actor.staffId !== null &&
      (row.previousCustodianStaffId === actor.staffId ||
        row.managerStaffId === actor.staffId);

    if (!isRecipient && !isLeadership) {
      throw new ORPCError("FORBIDDEN", {
        message: "This notice was not addressed to you",
      });
    }

    if (row.acknowledgedAt) {
      return { id: row.id, acknowledged: true };
    }

    await context.db
      .update(inventoryCustodyHistory)
      .set({ acknowledgedAt: new Date() })
      .where(eq(inventoryCustodyHistory.id, input.id));

    return { id: row.id, acknowledged: true };
  });
