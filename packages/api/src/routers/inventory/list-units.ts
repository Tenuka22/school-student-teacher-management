/**
 * The asset-tag register: every physical unit, filterable, ordered the way a
 * register is read.
 *
 * The ordering is the point. `uniqueNo ASC` makes the list read down the page
 * the way a school's label drawer does — a clerk looking for "LT-0042" scans a
 * column of tags rather than a list sorted by when somebody last clicked. A
 * `createdAt DESC` default would be the more conventional API choice and the
 * less useful screen.
 */
import { ORPCError } from "@orpc/server";
import {
  itemConditionSchema,
  unitStatusSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryItem,
  inventoryItemIdSchema,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";
import { iso } from "./inventory-database";

/** How many tags a screen can show before pagination is somebody else's problem. */
const DEFAULT_UNIT_LIMIT = 200;

/**
 * `LIKE` treats `%`, `_` and `\` as syntax, and all three are characters a
 * clerk can produce: an asset tag typed from a damaged label can be `LT-%`, and
 * a search for `IT_04` would otherwise match every tag containing `IT` plus any
 * character. Escaping them is what makes `search` mean "contains this text".
 * `ESCAPE` is not needed because PostgreSQL's default escape character for
 * `LIKE` is already the backslash, and the backslash itself is escaped first
 * so the escape cannot be consumed by the character it is escaping.
 */
const escapeLikePattern = (value: string): string =>
  value.replaceAll(/[\\%_]/gu, (character) => `\\${character}`);

/**
 * **`adminProcedure`, not `requireInventoryPermission("read")`** — a deliberate
 * deviation from the obvious gate, and the reason is written down in two other
 * places in this repo.
 *
 * The gate changed because `requireInventoryPermission("read")` is
 * teacher-reachable: the `teacher` role holds `inventory: ["read"]`
 * (`packages/auth/src/permissions.ts`), and `requirePermission` in
 * `packages/api/src/index.ts` consults that statement for anybody outside
 * `ADMIN_ROLES`. A teacher can therefore pass that gate, and this list is the
 * school's whole label drawer — every asset tag in the building, with the item
 * it belongs to, where it is and what condition it is in. `itemId` is optional,
 * so omitting it returns the entire school; supplying one does not narrow the
 * exposure, it just changes the rows.
 *
 * It cannot be scoped to the caller instead, because the unit rows carry no
 * `managerStaffId` / `custodianStaffId` of their own — those pointers live on
 * `inventoryItem`, so "the tags of things I am responsible for" is a join across
 * two tables and a different procedure, not a filter this one can add. A teacher
 * reaches their own equipment through `listMyItems`, and the tags of one item
 * they hold through this page once they are on it as a storekeeper. What this
 * list now satisfies is the `teacher` statement's own contract, which names the
 * school-wide register as something that grant must not reach.
 */
export const listUnits = adminProcedure
  .input(
    v.object({
      itemId: v.optional(inventoryItemIdSchema),
      status: v.optional(unitStatusSchema),
      condition: v.optional(itemConditionSchema),
      search: v.optional(v.pipe(v.string(), v.maxLength(120))),
      limit: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    /**
     * A soft-deleted item's tags are not browsable, and the reason is
     * consistency with `getItem`: an item is either in the storebook or it is
     * not, and the two routes must not disagree about which. Without this the
     * detail page would 404 while the unit list happily rendered its tags —
     * and `itemId` in this response would point at nothing the user can open.
     *
     * Only checked when `itemId` is supplied. A school-wide read has no item to
     * be stale about, and the tags of a retired item are still on file: the
     * item row is retained precisely so the ledger can be reconciled against
     * the history, and hiding its tags would make that reconciliation harder,
     * not easier.
     */
    if (input.itemId !== undefined) {
      const [item] = await context.db
        .select({ id: inventoryItem.id })
        .from(inventoryItem)
        .where(
          and(
            eq(inventoryItem.id, input.itemId),
            isNull(inventoryItem.deletedAt)
          )
        )
        .limit(1);

      if (!item) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }
    }

    const filters: SQL[] = [];

    if (input.itemId !== undefined) {
      filters.push(eq(inventoryUnit.itemId, input.itemId));
    }

    if (input.status !== undefined) {
      filters.push(eq(inventoryUnit.status, input.status));
    }

    if (input.condition !== undefined) {
      filters.push(eq(inventoryUnit.condition, input.condition));
    }

    const search = input.search?.trim();

    /**
     * Search reaches the tag **and** the item's name and SKU, because all three
     * are things a clerk has in front of them: a barcode scanner reads the tag,
     * while a request from a department names the item. Matching on the tag
     * alone would make "projector" find nothing, which is the first thing any
     * user would try.
     *
     * The tag is matched against `normalizedUniqueNo` rather than `uniqueNo` so
     * the search is case-insensitive and whitespace-insensitive in the same way
     * the unique index is — a tag typed as `lt- 0042` finds `LT-0042`.
     */
    if (search) {
      const pattern = `%${escapeLikePattern(search.toLowerCase())}%`;
      // `or(...)` is typed as possibly-undefined, so the result is narrowed
      // here rather than pushed blindly — a filter list that could contain an
      // `undefined` is one that compiles and then sends a broken predicate.
      const searchFilter = or(
        ilike(inventoryUnit.normalizedUniqueNo, pattern),
        ilike(inventoryItem.name, `%${escapeLikePattern(search)}%`),
        ilike(inventoryItem.sku, `%${escapeLikePattern(search)}%`)
      );

      if (searchFilter) {
        filters.push(searchFilter);
      }
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    /**
     * `status: "available"` with no `itemId` is the school-wide "what is on the
     * shelf right now" query, and it is the one this index exists for:
     * `inventory_unit_status_created_at_idx` is a composite on
     * `(status, created_at)`, so filtering on status and reading a shelf in
     * receipt order comes straight off the index. A single-column status index
     * could only half-answer it and would force a sort over every tag in the
     * school to do the rest.
     */
    const [rows, countRows] = await Promise.all([
      context.db
        .select({
          id: inventoryUnit.id,
          itemId: inventoryUnit.itemId,
          uniqueNo: inventoryUnit.uniqueNo,
          status: inventoryUnit.status,
          condition: inventoryUnit.condition,
          location: inventoryUnit.location,
          note: inventoryUnit.note,
          purchaseValue: inventoryUnit.purchaseValue,
          currentValue: inventoryUnit.currentValue,
          createdAt: inventoryUnit.createdAt,
          updatedAt: inventoryUnit.updatedAt,
          itemName: inventoryItem.name,
          itemSku: inventoryItem.sku,
        })
        .from(inventoryUnit)
        .innerJoin(inventoryItem, eq(inventoryUnit.itemId, inventoryItem.id))
        .where(where)
        // `id` breaks `created_at` ties for the same reason `getAvailableUnits`
        // orders by it: two tags added in one transaction share a timestamp, and
        // an unstable order is an order that reorders itself on refresh.
        .orderBy(asc(inventoryUnit.uniqueNo), asc(inventoryUnit.id))
        .limit(input.limit ?? DEFAULT_UNIT_LIMIT),
      // Counted **before** the limit, in parallel with the page read rather
      // than after it: the total is what tells the UI that there are more tags
      // than it is showing, and a count of the truncated page would say there
      // are not.
      context.db
        .select({ value: count() })
        .from(inventoryUnit)
        .innerJoin(inventoryItem, eq(inventoryUnit.itemId, inventoryItem.id))
        .where(where),
    ]);

    return {
      /**
       * Thin on purpose. The joined item contributes `itemId`, `itemName` and
       * `itemSku` and nothing else — **not** the manager, the custodian, the
       * category or the item's condition. This is a list of tags, the UI
       * already has the item it filtered by, and every extra column is a
       * second place for the same fact to go stale. The two `staff` aliases
       * that `itemViewJoins` uses would mean a four-table join per row on the
       * one screen that is always open, to display a name the item page has
       * already displayed. If a screen needs the manager, join it there.
       */
      units: rows.map((row) => ({
        id: row.id,
        itemId: row.itemId,
        itemName: row.itemName,
        itemSku: row.itemSku,
        uniqueNo: row.uniqueNo,
        status: row.status,
        condition: row.condition,
        location: row.location,
        note: row.note,
        purchaseValue: row.purchaseValue,
        currentValue: row.currentValue,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
      total: countRows[0]?.value ?? 0,
    };
  });
