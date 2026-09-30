import { custodyChangeTypeLabel } from "@school-student-teacher-management/db/constants/inventory";
/**
 * "Something changed hands and it concerns you" — up to three audiences a
 * custody change can have, and none of them ever heard about it before this
 * procedure existed.
 *
 * `takeItem`/`transferCustody`/`releaseCustody`/`reclaimCustody`/
 * `decideCustodyRequest`/`transferOwnership` all write one
 * `inventoryCustodyHistory` row per change, and — since that row was written —
 * one `inventoryCustodyNoticeRecipient` row per person it concerns:
 * `previous_custodian` (whoever just lost the item), `manager` (the item's
 * current manager, who stays accountable regardless of who holds it) and
 * `sub_manager` (everyone else who held the item earlier in the same
 * unbroken chain of hand-overs since it was last back in the store — A lent
 * it to B, B lent it to C, and C just lent it to D: B is a `sub_manager` on
 * that row, notified because they vouched for C when they passed the item on).
 *
 * This app has no push channel (no email, no websocket, no polling badge
 * outside a query result), so "notified" here means "surfaced the next time
 * that person's own equipment page reads their own unacknowledged recipient
 * rows" — the same shape as every other queue in this feature
 * (`listTakeableItems`, `listMyItems`).
 */
import {
  inventoryCustodyHistory,
  inventoryCustodyNoticeRecipient,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { requireInventoryPermission } from "../../index";
import { getInventoryActor, iso } from "./inventory-database";

const currentCustodian = alias(staff, "notice_current_custodian");
const changedBy = alias(staff, "notice_changed_by");

const NOTICE_LIMIT = 50;

export const listCustodyNotices = requireInventoryPermission("read").handler(
  async ({ context }) => {
    const actor = await getInventoryActor(context);

    const rows = await context.db
      .select({
        recipientId: inventoryCustodyNoticeRecipient.id,
        role: inventoryCustodyNoticeRecipient.role,
        historyId: inventoryCustodyHistory.id,
        itemId: inventoryCustodyHistory.itemId,
        itemName: inventoryItem.name,
        itemSku: inventoryItem.sku,
        changeType: inventoryCustodyHistory.changeType,
        note: inventoryCustodyHistory.note,
        changedAt: inventoryCustodyHistory.changedAt,
        changedByName: changedBy.name,
        currentCustodianName: currentCustodian.name,
      })
      .from(inventoryCustodyNoticeRecipient)
      .innerJoin(
        inventoryCustodyHistory,
        eq(
          inventoryCustodyNoticeRecipient.custodyHistoryId,
          inventoryCustodyHistory.id
        )
      )
      .innerJoin(
        inventoryItem,
        eq(inventoryCustodyHistory.itemId, inventoryItem.id)
      )
      .leftJoin(
        currentCustodian,
        eq(inventoryCustodyHistory.newCustodianStaffId, currentCustodian.id)
      )
      .leftJoin(
        changedBy,
        eq(inventoryCustodyHistory.changedByStaffId, changedBy.id)
      )
      .where(
        and(
          eq(inventoryCustodyNoticeRecipient.staffId, actor.staffId),
          isNull(inventoryCustodyNoticeRecipient.acknowledgedAt)
        )
      )
      .orderBy(
        desc(inventoryCustodyHistory.changedAt),
        desc(inventoryCustodyNoticeRecipient.id)
      )
      .limit(NOTICE_LIMIT);

    return {
      notices: rows.map((row) => ({
        // The recipient row's own id — this, not the history row's id, is
        // what `acknowledgeCustodyNotice`/`disputeCustodyNotice` take, since
        // acknowledgement and dispute are now per person, not per event.
        id: row.recipientId,
        historyId: row.historyId,
        itemId: row.itemId,
        itemName: row.itemName,
        itemSku: row.itemSku,
        changeType: row.changeType,
        changeTypeLabel: custodyChangeTypeLabel(row.changeType),
        note: row.note,
        changedAt: iso(row.changedAt),
        changedByName: row.changedByName,
        // Which role this notice names the caller under. A person is named
        // under exactly one role per event (see `insertCustodyNoticeRecipients`'
        // precedence rule), unlike the old shared-column design where the same
        // two flags could both be true on one row.
        role: row.role,
        asPreviousCustodian: row.role === "previous_custodian",
        asManager: row.role === "manager",
        asSubManager: row.role === "sub_manager",
        currentCustodianName: row.currentCustodianName,
      })),
    };
  }
);
