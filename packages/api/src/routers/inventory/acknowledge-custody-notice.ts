/**
 * "I saw this" — the recipient's plain acknowledgement of a custody-change
 * notice `list-custody-notices.ts` surfaced to them.
 *
 * Terminal and one-way: there is no `unacknowledge`, because the point of the
 * flag is to stop showing a notice once its recipient has read it, not to
 * track a reader's changing mind about having read something.
 *
 * Acts on the `inventoryCustodyNoticeRecipient` row's own id, not the parent
 * `inventoryCustodyHistory` row's id — a single custody change can now name
 * up to three people (manager, previous custodian, sub-managers up the
 * chain), and each of them acknowledges their own row independently. One
 * recipient acknowledging never closes the notice for another.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryCustodyNoticeRecipient,
  inventoryCustodyNoticeRecipientIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq } from "drizzle-orm";
import { object } from "valibot";

import { requireInventoryPermission } from "../../index";
import { getInventoryActor } from "./inventory-database";

/** Restated from `release-custody.ts`/`list-custody-history.ts` — see either. */
const ADMIN_ROLES = new Set(["admin", "principal", "vicePrincipal"]);

export const acknowledgeCustodyNotice = requireInventoryPermission("take")
  .input(object({ id: inventoryCustodyNoticeRecipientIdSchema }))
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);
    const role = context.session?.user.role ?? "";
    const isLeadership = ADMIN_ROLES.has(role);

    const [row] = await context.db
      .select({
        id: inventoryCustodyNoticeRecipient.id,
        staffId: inventoryCustodyNoticeRecipient.staffId,
        acknowledgedAt: inventoryCustodyNoticeRecipient.acknowledgedAt,
      })
      .from(inventoryCustodyNoticeRecipient)
      .where(eq(inventoryCustodyNoticeRecipient.id, input.id))
      .limit(1);

    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Notice not found" });
    }

    const isRecipient = row.staffId === actor.userId;

    if (!isRecipient && !isLeadership) {
      throw new ORPCError("FORBIDDEN", {
        message: "This notice was not addressed to you",
      });
    }

    if (row.acknowledgedAt) {
      return { id: row.id, acknowledged: true };
    }

    await context.db
      .update(inventoryCustodyNoticeRecipient)
      .set({ acknowledgedAt: new Date() })
      .where(eq(inventoryCustodyNoticeRecipient.id, input.id));

    return { id: row.id, acknowledged: true };
  });
