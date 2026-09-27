/**
 * The custodian's answer to a request: approve, and the item moves; deny, and
 * it doesn't. Both are one decision, not two procedures, because they share
 * every guard up to the point of writing an outcome — see the branch inside
 * the transaction for the one place they differ.
 *
 * Approving *is* the transfer. There is no second "now move the item" step:
 * the same transaction that flips the request to `approved` also moves
 * `inventoryItem.custodianStaffId`, inserts the `custody_transferred` row in
 * `inventoryCustodyHistory` and writes the counter-ledger entry —
 * exactly the three writes `transferCustody` makes for an administrator, made
 * here for the person the item actually belongs to at this moment: the
 * teacher who is currently holding it.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryCustodyHistory,
  inventoryCustodyRequest,
  inventoryCustodyRequestIdSchema,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { eq } from "drizzle-orm";
import {
  literal,
  minLength,
  object,
  optional,
  pipe,
  string,
  union,
} from "valibot";

import { requireInventoryPermission } from "../../index";
import { custodyRequestEvents } from "./custody-request-events";
import {
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertCustodyNoticeRecipients,
  insertInventoryAuditLog,
  insertInventoryTransaction,
} from "./inventory-database";

/** The same three leadership seats every other custody procedure admits on
 *  somebody else's behalf — see `release-custody.ts` for the canonical note. */
const ADMIN_ROLES = new Set(["admin", "principal", "vicePrincipal"]);

const resolveStaffName = async (
  db: Parameters<typeof getLockedItem>[0],
  staffId: string
): Promise<string | null> => {
  const [record] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, staffId))
    .limit(1);

  return record?.name ?? null;
};

export const decideCustodyRequest = requireInventoryPermission("take")
  .input(
    object({
      requestId: inventoryCustodyRequestIdSchema,
      decision: union([literal("approved"), literal("denied")]),
      note: optional(pipe(string(), minLength(1))),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);


    const result = await context.db.transaction(async (tx) => {
      const [requestRow] = await tx
        .select()
        .from(inventoryCustodyRequest)
        .where(eq(inventoryCustodyRequest.id, input.requestId))
        .limit(1)
        .for("update");

      if (!requestRow) {
        throw new ORPCError("NOT_FOUND", { message: "Request not found" });
      }

      if (requestRow.status !== "pending") {
        throw new ORPCError("CONFLICT", {
          message: `This request has already been ${requestRow.status}`,
        });
      }

      const role = context.session?.user.role ?? "";
      const isAdmin = ADMIN_ROLES.has(role);
      if (requestRow.custodianStaffId !== actor.userId && !isAdmin) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "Only the teacher currently holding this item, or an administrator, can decide this request",
        });
      }

      // The item under a row lock, re-checked against the custodian this
      // request actually named — see the table's doc comment for why the
      // request captures its own `custodianStaffId` rather than trusting the
      // item's live pointer at decision time.
      const existing = await getLockedItem(tx, requestRow.itemId);

      if (existing.custodianStaffId !== requestRow.custodianStaffId) {
        throw new ORPCError("CONFLICT", {
          message:
            "This item has changed hands since the request was raised, so it can no longer be approved. Ask the requester to raise a new one",
        });
      }

      // Independent: the requester's name for the outgoing event, and the
      // decision write itself.
      const [requesterName, [decided]] = await Promise.all([
        resolveStaffName(tx, requestRow.requesterStaffId),
        tx
          .update(inventoryCustodyRequest)
          .set({
            status: input.decision,
            decidedByStaffId: actor.userId,
            decidedAt: new Date(),
            decisionNote: input.note ?? null,
          })
          .where(eq(inventoryCustodyRequest.id, requestRow.id))
          .returning(),
      ]);

      if (!decided) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      if (input.decision === "denied") {
        return {
          request: decided,
          itemName: existing.name,
          requesterName,
          custodianName: actor.name,
        };
      }

      // Approved: the transfer itself, written the same way
      // `transferCustody` writes it for an administrator.
      await tx
        .update(inventoryItem)
        .set({ custodianStaffId: requestRow.requesterStaffId })
        .where(eq(inventoryItem.id, existing.id));

      const [history] = await tx
        .insert(inventoryCustodyHistory)
        .values({
          id: crypto.randomUUID(),
          itemId: existing.id,
          previousCustodianStaffId: existing.custodianStaffId,
          newCustodianStaffId: requestRow.requesterStaffId,
          previousManagerStaffId: null,
          newManagerStaffId: null,
          changeType: "custody_transferred",
          reason: "teacher_transfer",
          note: input.note ?? requestRow.note,
          changedByStaffId: actor.userId,
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
        changedByStaffId: actor.userId,
      });

      await insertInventoryTransaction(tx, {
        actor,
        action: "custody_transferred",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(existing),
        note: input.note ?? requestRow.note,
        meta: {
          previousCustodianName: actor.name,
          newCustodianName: requesterName,
          reason: "teacher_transfer",
          viaRequestId: requestRow.id,
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "custody.request.approve",
        entityType: "inventory_item",
        entityId: existing.id,
        before: {
          custodianStaffId: existing.custodianStaffId,
          custodianName: actor.name,
        },
        after: {
          custodianStaffId: requestRow.requesterStaffId,
          custodianName: requesterName,
        },
      });

      return {
        request: decided,
        itemName: existing.name,
        requesterName,
        custodianName: actor.name,
      };
    });

    custodyRequestEvents.publish(result.request.requesterStaffId, {
      type: input.decision,
      requestId: result.request.id,
      itemId: result.request.itemId,
      itemName: result.itemName,
      requesterStaffId: result.request.requesterStaffId,
      requesterName: result.requesterName ?? "",
      custodianStaffId: result.request.custodianStaffId,
      custodianName: result.custodianName,
      note: result.request.note,
      decisionNote: result.request.decisionNote,
      at: new Date().toISOString(),
    });

    return {
      id: result.request.id,
      status: result.request.status,
      decisionNote: result.request.decisionNote,
      decidedAt: result.request.decidedAt?.toISOString() ?? null,
    };
  });
