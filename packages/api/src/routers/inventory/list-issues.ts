/**
 * The store's issue history: what has permanently left the building, and to whom.
 *
 * Read counterpart of `create-issue.ts`. Two things this list has to get right
 * that a plain record list does not:
 *
 * 1. **The units come with the row.** An issue is only legible with the asset
 *    tags that went out on it — "3 projectors issued to Nimal" is not an audit
 *    answer, "PROJ-011, PROJ-012, PROJ-014" is — so the tags are part of the
 *    page, not a detail fetch behind a click.
 * 2. **`isOutstanding` is not a state.** See the note on the flag below; an
 *    issue is terminal and this list must not pretend otherwise.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryIssue,
  inventoryIssueUnit,
  inventoryItem,
  inventoryItemIdSchema,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  integer,
  maxLength,
  maxValue,
  minValue,
  number,
  object,
  optional,
  pipe,
  string,
} from "valibot";

import { adminProcedure } from "../../index";
import { addDaysIsoDate, todayIsoDate } from "./inventory-calculations";
import { iso } from "./inventory-database";

/**
 * Page size when the caller does not choose one. The history screen renders a
 * term's worth of movements, and there is no `offset` in the input on purpose —
 * this is a reverse-chronological feed, so a caller that needs older rows
 * narrows with `from` / `to` rather than turning pages through a ledger that
 * nobody scrolls linearly. `total` is what tells it the page is truncated.
 */
const DEFAULT_LIMIT = 200;

export interface IssueUnitView {
  id: string;
  uniqueNo: string;
  /**
   * The condition at the moment the device left. `string` rather than
   * `ItemCondition` because the column is `text` with a CHECK, not an enum —
   * `itemConditionSchema` is the picklist a client validates against, and
   * `toItemView` leaves it as `string` for the same reason.
   */
  condition: string;
  location: string;
}

export interface IssueListItem {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  qty: number;
  receiverName: string;
  receiverDepartment: string | null;
  receiverPhone: string | null;
  purpose: string;
  approvedBy: string | null;
  expectedReturnDate: string | null;
  note: string | null;
  issuedByStaffId: string | null;
  /**
   * Null when the storekeeper who issued it has since left the school. That is
   * **expected and not a bug**: `inventory_issue.issued_by_staff_id` is
   * `on delete: set null`, because deleting a teacher must not reach back and
   * erase the fact that they handed over four laptops. The UI has to tolerate
   * the null (render "Unknown" or the id, never the word "null" and never a
   * blank cell) and must not treat it as a broken row.
   */
  issuedByName: string | null;
  issuedAt: string;
  /**
   * `expectedReturnDate` exists and today is past it.
   *
   * THIS IS A RECONCILIATION AID, NOT A WORKFLOW. An issue is terminal — there
   * is no return path, no cancel, and no status column — so nothing in this app
   * chases an overdue issue and `isOutstanding` is not the first arm of a state
   * machine that happens to be missing the rest. It exists so a clerk doing a
   * term-end reconciliation can find the handful of rows worth *asking about*:
   * stock that was promised back and demonstrably was not. Treat it as a
   * question the list helps you ask, and do not build a transition out of it.
   */
  isOutstanding: boolean;
  units: IssueUnitView[];
}

export interface IssueListResult {
  issues: IssueListItem[];
  /** Full match count, taken before `limit` so a client can say "showing 200 of 613". */
  total: number;
}

/**
 * Neutralise the `LIKE` metacharacters in a user's search text.
 *
 * `ilike` gives a search box no way to escape them, so a clerk typing `Lab_3`
 * would otherwise match every lab with any single character in that position,
 * and a leading `%` would match the entire table and hand the UI a result set
 * the user did not ask for. The backslash goes first in the class so it cannot
 * double-escape the two characters that follow it. `\` is also Postgres's
 * default `LIKE` escape, and the pattern travels as a bound parameter rather
 * than a string literal, so there is no second layer of escaping to get wrong.
 */
const escapeLikePattern = (value: string): string =>
  value.replaceAll(/[\\%_]/gu, (char) => `\\${char}`);

const listIssuesInput = object({
  itemId: optional(inventoryItemIdSchema),
  /**
   * Matched case-insensitively against the receiver, the purpose **and** the
   * item's own name and SKU, because the two things a clerk remembers about a
   * hand-over are who it went to and what it was.
   */
  search: optional(pipe(string(), maxLength(120))),
  /** Inclusive first day, `YYYY-MM-DD`. */
  from: optional(isoDateSchema),
  /** Inclusive last day, `YYYY-MM-DD`. */
  to: optional(isoDateSchema),
  limit: optional(pipe(number(), integer(), minValue(1), maxValue(500))),
});

/**
 * **`adminProcedure`, not `requireInventoryPermission("read")`** — a deliberate
 * deviation from the obvious gate, and the reason is written down in two other
 * places in this repo.
 *
 * The gate changed because `requireInventoryPermission("read")` is
 * teacher-reachable: the `teacher` role holds `inventory: ["read"]`
 * (`packages/auth/src/permissions.ts`), and `requirePermission` in
 * `packages/api/src/index.ts` consults that statement for anybody outside
 * `ADMIN_ROLES`. A teacher can therefore pass that gate, and this is every
 * hand-over that has permanently left the building — each receiver's **name**,
 * department and phone number, the purpose it was given for, who approved it,
 * and the specific asset tags that went out on it. An issue is terminal and
 * never comes back, so this is a list of the school property now in someone
 * else's hands, addressed to them.
 *
 * It cannot be scoped to the caller: a receiver here is free text rather than a
 * `staff` pointer, so there is no column to match `actor.staffId` against, and
 * the units that left are exactly the units a teacher must not be able to
 * enumerate. `listMyItems` is the teacher's read. What this list now satisfies
 * is the `teacher` statement's own contract, which names the school-wide
 * movement and write-off lists as things that grant must not reach.
 */
export const listIssues = adminProcedure
  .input(listIssuesInput)
  .handler(async ({ input, context }): Promise<IssueListResult> => {
    /**
     * A retired item is a non-existent item here, exactly as it is in
     * `getLockedItem` and `getItem`. Without this the caller's stale link would
     * come back as an empty page, which reads as "this item has never had
     * anything issued" rather than as the 404 it is.
     *
     * A *hard* unknown id is left to return an empty page, and that is a
     * deliberate asymmetry: `inventory_issue.item_id` is `on delete: restrict`,
     * so an item that has ever been issued can never be hard-deleted and an
     * unmatched id can only be a typo or a cross-tenant guess, neither of which
     * is worth a round trip to distinguish from "no issues yet".
     */
    if (input.itemId) {
      const [requested] = await context.db
        .select({ deletedAt: inventoryItem.deletedAt })
        .from(inventoryItem)
        .where(eq(inventoryItem.id, input.itemId))
        .limit(1);

      if (requested?.deletedAt) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }
    }

    const conditions: SQL[] = [];

    if (input.itemId) {
      conditions.push(eq(inventoryIssue.itemId, input.itemId));
    }

    if (input.search) {
      const pattern = `%${escapeLikePattern(input.search.trim())}%`;
      const searchCondition = or(
        ilike(inventoryIssue.receiverName, pattern),
        ilike(inventoryIssue.purpose, pattern),
        ilike(inventoryItem.name, pattern),
        ilike(inventoryItem.sku, pattern)
      );

      // `or(...)` is typed `SQL | undefined` because it is variadic and
      // drizzle cannot see that four arguments are never zero. The guard keeps
      // the array's element type honest instead of asserting it away.
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (input.from) {
      // Day-inclusive. `issuedAt` is a timestamp and `from` is a bare date, so
      // the bound is widened to the start of that day rather than left to
      // Postgres to coerce `'2026-01-01'` — which would silently drop every
      // hand-over made during the 1st.
      conditions.push(
        sql`${inventoryIssue.issuedAt} >= ${`${input.from} 00:00:00`}`
      );
    }

    if (input.to) {
      // Exclusive upper bound one day past `to`, which is the arithmetic
      // `addDaysIsoDate` exists to get right across a daylight-saving
      // boundary. `addDaysIsoDate(1, "2026-01-01")` is `"2026-01-02"`, so the
      // whole of the 1st is inside the range and the 2nd is not.
      conditions.push(
        sql`${inventoryIssue.issuedAt} < ${`${addDaysIsoDate(1, input.to)} 00:00:00`}`
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // The count reuses the same `where`, so `total` can never describe a
    // different set than the rows underneath it — and it must repeat the
    // `inventoryItem` inner join, because two of the four `search` predicates
    // live on that table and a bare `inventory_issue` count would throw on the
    // missing relation. The `staff` left-join is deliberately absent: no
    // condition can reference it, and joining it would multiply the count by
    // nothing while making the query look like it was filtering on the issuer.
    //
    // It is a second round trip on purpose, and a single one for the whole page
    // rather than one per row.
    const [rows, countRows] = await Promise.all([
      context.db
        .select({
          id: inventoryIssue.id,
          itemId: inventoryIssue.itemId,
          itemName: inventoryItem.name,
          itemSku: inventoryItem.sku,
          qty: inventoryIssue.qty,
          receiverName: inventoryIssue.receiverName,
          receiverDepartment: inventoryIssue.receiverDepartment,
          receiverPhone: inventoryIssue.receiverPhone,
          purpose: inventoryIssue.purpose,
          approvedBy: inventoryIssue.approvedBy,
          expectedReturnDate: inventoryIssue.expectedReturnDate,
          note: inventoryIssue.note,
          issuedByStaffId: inventoryIssue.issuedByStaffId,
          issuedByName: staff.name,
          issuedAt: inventoryIssue.issuedAt,
        })
        .from(inventoryIssue)
        // inner: `item_id` is `not null` and `restrict`, so an issue always has
        // an item. Naming it here rather than returning the ids and letting the
        // UI look them up is what keeps this list one query per concern.
        .innerJoin(inventoryItem, eq(inventoryIssue.itemId, inventoryItem.id))
        // LEFT, not inner: see the `issuedByName` note on `IssueListItem`. An
        // inner join here would silently delete every historic issue whose
        // storekeeper has since left the school — the rows an audit is most
        // likely to ask about.
        .leftJoin(staff, eq(inventoryIssue.issuedByStaffId, staff.id))
        .where(where)
        // `id` breaks ties so the order is total. Two hand-overs recorded in
        // the same transaction share a `defaultNow()` `issuedAt`, and an
        // unstable order is an order that shuffles a page under the clerk's
        // cursor on every refetch.
        .orderBy(desc(inventoryIssue.issuedAt), desc(inventoryIssue.id))
        .limit(input.limit ?? DEFAULT_LIMIT),
      context.db
        .select({ value: count() })
        .from(inventoryIssue)
        .innerJoin(inventoryItem, eq(inventoryIssue.itemId, inventoryItem.id))
        .where(where),
    ]);

    const pageIds = rows.map((row) => row.id);

    /**
     * The tags for the whole page in ONE query, grouped in memory.
     *
     * This is the N+1 a list view always invites: a detail route naturally
     * fetches its own units, and the obvious way to reuse it here is to map over
     * the rows — which turns a 200-row page into 201 queries inside one HTTP
     * request. `inArray` against the page's ids keeps it at two round trips for
     * the entire page, and the `Map` is built once.
     *
     * The `length` guard is not an optimisation: `inArray` with an empty list is
     * valid SQL but reads badly in a log, and an empty page has no units to ask
     * for.
     */
    const unitsByIssue = new Map<string, IssueUnitView[]>();
    if (pageIds.length > 0) {
      const unitRows = await context.db
        .select({
          issueId: inventoryIssueUnit.issueId,
          id: inventoryUnit.id,
          uniqueNo: inventoryUnit.uniqueNo,
          condition: inventoryUnit.condition,
          location: inventoryUnit.location,
        })
        .from(inventoryIssueUnit)
        .innerJoin(
          inventoryUnit,
          eq(inventoryIssueUnit.unitId, inventoryUnit.id)
        )
        .where(inArray(inventoryIssueUnit.issueId, pageIds));

      for (const unit of unitRows) {
        const bucket = unitsByIssue.get(unit.issueId) ?? [];
        bucket.push({
          id: unit.id,
          uniqueNo: unit.uniqueNo,
          condition: unit.condition,
          location: unit.location,
        });
        unitsByIssue.set(unit.issueId, bucket);
      }
    }

    // Computed once, outside the map, so a 200-row page calls the clock once.
    const today = todayIsoDate();

    return {
      issues: rows.map((row) => ({
        id: row.id,
        itemId: row.itemId,
        itemName: row.itemName,
        itemSku: row.itemSku,
        qty: row.qty,
        receiverName: row.receiverName,
        receiverDepartment: row.receiverDepartment,
        receiverPhone: row.receiverPhone,
        purpose: row.purpose,
        approvedBy: row.approvedBy,
        expectedReturnDate: row.expectedReturnDate,
        note: row.note,
        issuedByStaffId: row.issuedByStaffId,
        issuedByName: row.issuedByName,
        issuedAt: iso(row.issuedAt),
        // String comparison, not a `Date` parse: the column is `text` written
        // by `isoDateSchema`, so both sides are canonical `YYYY-MM-DD` and
        // ordering them lexically is the same as ordering them as dates. A
        // `new Date("2026-01-01")` would introduce a timezone question the
        // stored format has no answer to. Strictly after today, so an issue
        // due *today* is not yet outstanding.
        isOutstanding:
          row.expectedReturnDate !== null && row.expectedReturnDate < today,
        units: unitsByIssue.get(row.id) ?? [],
      })),
      total: countRows[0]?.value ?? 0,
    };
  });
