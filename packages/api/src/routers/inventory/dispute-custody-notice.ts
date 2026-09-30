/**
 * "This did not happen as recorded" — the recipient's rebuttal of a
 * custody-change notice, not a second write path onto the item.
 *
 * Disputing does **not** reverse `inventoryItem.managerStaffId`/
 * `custodianStaffId`, and that is deliberate rather than a missing feature:
 * the change this row describes already moved those columns, and undoing
 * that from an unverified claim would let anyone disown custody by disputing
 * it — a genuine dispute (a wrong id typed at the scanner, a colleague who
 * was never actually handed anything) is one the person who is now
 * accountable for the item, or an administrator, resolves by making the
 * correcting write itself (`transferCustody`/`releaseCustody`) with a real
 * reason on it. This procedure only raises the flag: it names the row, records
 * why, and leaves it on `list-custody-history.ts`'s trail for whoever looks
 * into it. A dispute is also, by definition, the recipient's own response to
 * the notice, so it acknowledges the row in the same write.
 *
 * Acts on the `inventoryCustodyNoticeRecipient` row's own id — see
 * `acknowledge-custody-notice.ts` for why a single custody-history row now
 * has one recipient row per person it concerns, each disputed independently.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryCustodyNoticeRecipient,
  inventoryCustodyNoticeRecipientIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq } from "drizzle-orm";
import { minLength, object, pipe, string } from "valibot";

import { requireInventoryPermission } from "../../index";
import { getInventoryActor } from "./inventory-database";

/** Restated from `release-custody.ts`/`list-custody-history.ts` — see either. */
const ADMIN_ROLES = new Set([
  "admin",
  "principal",
  "vicePrincipal",
  "inventoryAdmin",
]);

/** The cap on a dispute's reason — long enough for a sentence, short of a report. */
const DISPUTE_NOTE_MAX_LENGTH = 500;

export const disputeCustodyNotice = requireInventoryPermission("acknowledge")
  .input(
    object({
      id: inventoryCustodyNoticeRecipientIdSchema,
      note: pipe(string(), minLength(1, "Say what is wrong with this record")),
    })
  )
  .handler(async ({ input, context }) => {
    if (input.note.length > DISPUTE_NOTE_MAX_LENGTH) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Keep the dispute note under ${DISPUTE_NOTE_MAX_LENGTH} characters`,
      });
    }

    const actor = await getInventoryActor(context);
    const role = context.session?.user.role ?? "";
    const isLeadership = ADMIN_ROLES.has(role);

    const [row] = await context.db
      .select({
        id: inventoryCustodyNoticeRecipient.id,
        staffId: inventoryCustodyNoticeRecipient.staffId,
        disputedAt: inventoryCustodyNoticeRecipient.disputedAt,
      })
      .from(inventoryCustodyNoticeRecipient)
      .where(eq(inventoryCustodyNoticeRecipient.id, input.id))
      .limit(1);

    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Notice not found" });
    }

    const isRecipient = row.staffId === actor.staffId;

    if (!isRecipient && !isLeadership) {
      throw new ORPCError("FORBIDDEN", {
        message: "This notice was not addressed to you",
      });
    }

    if (row.disputedAt) {
      throw new ORPCError("BAD_REQUEST", {
        message: "This record has already been disputed",
      });
    }

    const now = new Date();
    await context.db
      .update(inventoryCustodyNoticeRecipient)
      .set({ acknowledgedAt: now, disputedAt: now, disputeNote: input.note })
      .where(eq(inventoryCustodyNoticeRecipient.id, input.id));

    return { id: row.id, disputed: true };
  });
