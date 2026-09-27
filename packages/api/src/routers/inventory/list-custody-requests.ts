/**
 * The two queues a custody request appears on: the custodian's ("somebody is
 * asking for something you hold") and the requester's own ("what I've asked
 * for, and what came of it"). Both are scoped to the caller's own staff id —
 * neither procedure takes a staff id as input — because a request is between
 * two named people and nobody else's queue is this caller's business.
 */
import {
  inventoryCustodyRequest,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { object } from "valibot";

import { requireInventoryPermission } from "../../index";
import { getInventoryActor } from "./inventory-database";

const requesterUser = alias(user, "custody_request_requester");
const decidedByUser = alias(user, "custody_request_decided_by");

const REQUEST_SELECTION = {
  id: inventoryCustodyRequest.id,
  itemId: inventoryCustodyRequest.itemId,
  itemName: inventoryItem.name,
  itemSku: inventoryItem.sku,
  status: inventoryCustodyRequest.status,
  note: inventoryCustodyRequest.note,
  requesterStaffId: inventoryCustodyRequest.requesterStaffId,
  requesterName: requesterUser.name,
  custodianStaffId: inventoryCustodyRequest.custodianStaffId,
  requestedAt: inventoryCustodyRequest.requestedAt,
  decidedByStaffId: inventoryCustodyRequest.decidedByStaffId,
  decidedByName: decidedByUser.name,
  decidedAt: inventoryCustodyRequest.decidedAt,
  decisionNote: inventoryCustodyRequest.decisionNote,
} as const;

/** Every request pending my decision, newest first. */
export const listIncomingCustodyRequests = requireInventoryPermission("read")
  .input(object({}))
  .handler(async ({ context }) => {
    const actor = await getInventoryActor(context);

    const rows = await context.db
      .select(REQUEST_SELECTION)
      .from(inventoryCustodyRequest)
      .innerJoin(
        inventoryItem,
        eq(inventoryCustodyRequest.itemId, inventoryItem.id)
      )
      .innerJoin(
        requesterUser,
        eq(inventoryCustodyRequest.requesterStaffId, requesterUser.id)
      )
      .leftJoin(
        decidedByUser,
        eq(inventoryCustodyRequest.decidedByStaffId, decidedByUser.id)
      )
      .where(
        and(
          eq(inventoryCustodyRequest.custodianStaffId, actor.userId),
          eq(inventoryCustodyRequest.status, "pending")
        )
      )
      .orderBy(desc(inventoryCustodyRequest.requestedAt));

    return {
      requests: rows.map((row) => ({
        ...row,
        requestedAt: row.requestedAt.toISOString(),
        decidedAt: row.decidedAt?.toISOString() ?? null,
      })),
    };
  });

/** Everything I have asked for, newest first, whatever became of it. */
export const listOutgoingCustodyRequests = requireInventoryPermission("read")
  .input(object({}))
  .handler(async ({ context }) => {
    const actor = await getInventoryActor(context);

    const rows = await context.db
      .select(REQUEST_SELECTION)
      .from(inventoryCustodyRequest)
      .innerJoin(
        inventoryItem,
        eq(inventoryCustodyRequest.itemId, inventoryItem.id)
      )
      .innerJoin(
        requesterUser,
        eq(inventoryCustodyRequest.requesterStaffId, requesterUser.id)
      )
      .leftJoin(
        decidedByUser,
        eq(inventoryCustodyRequest.decidedByStaffId, decidedByUser.id)
      )
      .where(eq(inventoryCustodyRequest.requesterStaffId, actor.userId))
      .orderBy(desc(inventoryCustodyRequest.requestedAt));

    return {
      requests: rows.map((row) => ({
        ...row,
        requestedAt: row.requestedAt.toISOString(),
        decidedAt: row.decidedAt?.toISOString() ?? null,
      })),
    };
  });
