import { custodyChangeTypeLabel } from "@school-student-teacher-management/db/constants/inventory";
/**
 * "Something changed hands and it concerns you" — the two audiences a custody
 * change has and neither ever heard about it before this procedure existed.
 *
 * `takeItem`/`transferCustody` already write who lost the item
 * (`previousCustodianStaffId`) and, separately, `inventoryItem.managerStaffId`
 * already says who is accountable for it regardless of who is holding it —
 * both facts sat in the database from the moment they happened, and nothing
 * ever read them back to the two people they are about. This app has no push
 * channel (no email, no websocket, no polling badge outside a query result),
 * so "notified" here means "surfaced the next time that person's own
 * equipment page reads unacknowledged rows naming them" — the same shape as
 * every other queue in this feature (`listTakeableItems`, `listMyItems`).
 *
 * Two recipients, one query, because the row that changed is the same row for
 * both: the previous custodian ("X now has the item you were holding") and
 * the item's current manager, joined live rather than off the history row's
 * own (always-null, for a pure custody change) manager columns — the
 * `inventory_custody_history_manager_columns` CHECK means `custody_taken` /
 * `custody_transferred` / `custody_released` rows never populate
 * `previousManagerStaffId`/`newManagerStaffId`, so "who is the manager"
 * has to come from the item as it stands today, not from the row.
 */
import {
  inventoryCustodyHistory,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { requireInventoryPermission } from "../../index";
import { getInventoryActor, iso } from "./inventory-database";

const currentCustodian = alias(staff, "notice_current_custodian");
const changedBy = alias(staff, "notice_changed_by");

const NOTICE_LIMIT = 50;

export const listCustodyNotices = requireInventoryPermission("read").handler(
  async ({ context }) => {
    const actor = await getInventoryActor(context);

    // The seeded leadership seats have no staff row, and admin cannot own or
    // hold equipment at all (see `take-item.ts`) — so an account with no
    // `staffId` can be neither a previous custodian nor a manager, and the
    // honest answer is an empty list rather than a query built on a null
    // that could otherwise match a null column by accident.
    if (!actor.staffId) {
      return { notices: [] };
    }

    const { staffId } = actor;

    const rows = await context.db
      .select({
        id: inventoryCustodyHistory.id,
        itemId: inventoryCustodyHistory.itemId,
        itemName: inventoryItem.name,
        itemSku: inventoryItem.sku,
        changeType: inventoryCustodyHistory.changeType,
        note: inventoryCustodyHistory.note,
        changedAt: inventoryCustodyHistory.changedAt,
        previousCustodianStaffId:
          inventoryCustodyHistory.previousCustodianStaffId,
        newCustodianStaffId: inventoryCustodyHistory.newCustodianStaffId,
        changedByStaffId: inventoryCustodyHistory.changedByStaffId,
        changedByName: changedBy.name,
        managerStaffId: inventoryItem.managerStaffId,
        currentCustodianName: currentCustodian.name,
      })
      .from(inventoryCustodyHistory)
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
          isNull(inventoryCustodyHistory.acknowledgedAt),
          // Never notify somebody about their own action — a teacher who
          // just took an item does not need to be told they took it.
          or(
            isNull(inventoryCustodyHistory.changedByStaffId),
            ne(inventoryCustodyHistory.changedByStaffId, staffId)
          ),
          or(
            eq(inventoryCustodyHistory.previousCustodianStaffId, staffId),
            eq(inventoryItem.managerStaffId, staffId)
          )
        )
      )
      .orderBy(
        desc(inventoryCustodyHistory.changedAt),
        desc(inventoryCustodyHistory.id)
      )
      .limit(NOTICE_LIMIT);

    return {
      notices: rows.map((row) => ({
        id: row.id,
        itemId: row.itemId,
        itemName: row.itemName,
        itemSku: row.itemSku,
        changeType: row.changeType,
        changeTypeLabel: custodyChangeTypeLabel(row.changeType),
        note: row.note,
        changedAt: iso(row.changedAt),
        changedByName: row.changedByName,
        // Which of the two roles this notice is naming the caller as — a
        // teacher can be both (in charge of an item a colleague just took),
        // and the client renders one sentence per role it holds rather than
        // choosing between them.
        asPreviousCustodian: row.previousCustodianStaffId === staffId,
        asManager: row.managerStaffId === staffId,
        currentCustodianName: row.currentCustodianName,
      })),
    };
  }
);
