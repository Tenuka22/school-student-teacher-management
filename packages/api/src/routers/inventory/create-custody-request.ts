/**
 * A teacher asks a colleague for something the colleague already holds.
 *
 * This is the third door onto custody, alongside `takeItem` (an unheld item,
 * no approval needed because nobody is displaced) and `transferCustody` (an
 * administrator moving an item by hand). Here the item is displaced from a
 * named colleague, so the school's rule — stated in the product request this
 * table was built for — is that the colleague decides, not the requester and
 * not an administrator standing in for them. Raising a request never moves
 * the item; only `decideCustodyRequest`, called by the custodian named on the
 * row, does that.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryCustodyRequest,
  inventoryItemIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { and, eq } from "drizzle-orm";
import { minLength, object, optional, pipe, string } from "valibot";

import { requireInventoryPermission } from "../../index";
import { custodyRequestEvents } from "./custody-request-events";
import { calculateItemStatus } from "./inventory-calculations";
import {
  countersOf,
  getInventoryActor,
  getLockedItem,
} from "./inventory-database";

export const createCustodyRequest = requireInventoryPermission("take")
  .input(
    object({
      itemId: inventoryItemIdSchema,
      note: optional(pipe(string(), minLength(1))),
    })
  )
  .handler(async ({ input, context }) => {
    // Same guard `takeItem` opens with, for the same reason: the seeded
    // `admin` account owns and borrows nothing, so a request raised in its
    // name has no requester for `decideCustodyRequest` to hand the item to.
    if (context.session?.user?.role === "admin") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Admin accounts cannot request equipment",
      });
    }

    const actor = await getInventoryActor(context);


    const result = await context.db.transaction(async (tx) => {
      const existing = await getLockedItem(tx, input.itemId);

      if (!existing.borrowable) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This item is not one that is handed out to teachers",
        });
      }

      if (!existing.custodianStaffId) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Nobody is holding this item — take it directly instead of requesting it",
        });
      }

      if (existing.custodianStaffId === actor.userId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This item is already assigned to you",
        });
      }

      const status = calculateItemStatus(
        countersOf(existing),
        existing.condition
      );
      if (status === "damaged") {
        throw new ORPCError("BAD_REQUEST", {
          message: "This item is marked Damaged and is not requestable",
        });
      }

      // The unique index (`inventory_custody_request_open_unique`) would
      // catch a second pending request with a raw constraint violation; this
      // read is what turns that into a message the requester can act on
      // rather than a 500.
      const [openRequest] = await tx
        .select({ id: inventoryCustodyRequest.id })
        .from(inventoryCustodyRequest)
        .where(
          and(
            eq(inventoryCustodyRequest.itemId, input.itemId),
            eq(inventoryCustodyRequest.requesterStaffId, actor.userId),
            eq(inventoryCustodyRequest.status, "pending")
          )
        )
        .limit(1);

      if (openRequest) {
        throw new ORPCError("CONFLICT", {
          message: "You already have a pending request for this item",
        });
      }

      // Neither read depends on the other's result, so they run concurrently:
      // the custodian's name for the outgoing event, and the request row
      // itself.
      const [[custodian], [created]] = await Promise.all([
        tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, existing.custodianStaffId))
          .limit(1),
        tx
          .insert(inventoryCustodyRequest)
          .values({
            id: crypto.randomUUID(),
            itemId: existing.id,
            requesterStaffId: actor.userId,
            custodianStaffId: existing.custodianStaffId,
            note: input.note ?? null,
          })
          .returning(),
      ]);

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      return {
        request: created,
        itemName: existing.name,
        custodianName: custodian?.name ?? null,
      };
    });

    custodyRequestEvents.publish(result.request.custodianStaffId, {
      type: "requested",
      requestId: result.request.id,
      itemId: result.request.itemId,
      itemName: result.itemName,
      requesterStaffId: actor.userId,
      requesterName: actor.name,
      custodianStaffId: result.request.custodianStaffId,
      custodianName: result.custodianName ?? "",
      note: result.request.note,
      decisionNote: null,
      at: new Date().toISOString(),
    });

    return {
      id: result.request.id,
      itemId: result.request.itemId,
      itemName: result.itemName,
      status: result.request.status,
      note: result.request.note,
      custodianName: result.custodianName,
      requestedAt: result.request.requestedAt.toISOString(),
    };
  });
