/**
 * The inventory page a teacher is given: what they are responsible for, and
 * what they are holding.
 *
 * **Security property, in one sentence: this is the only inventory read a
 * `teacher` can reach, and it is scoped to the caller here in the query rather
 * than by the permission — so the `or(managerStaffId = me, custodianStaffId =
 * me)` predicate must never be lifted.** `requireInventoryPermission("read")`
 * is reachable by the `teacher` role and grants nothing about *which* rows are
 * visible; a school-wide item list is `adminProcedure` work. The scope lives
 * here and nowhere else, which is why an account with no staff row gets an
 * honest empty result rather than an unfiltered one.
 */
import { inventoryItem } from "@school-student-teacher-management/db/schema/inventory";
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  integer,
  maxValue,
  minValue,
  number,
  object,
  optional,
  picklist,
  pipe,
  string,
} from "valibot";

import { requireInventoryPermission } from "../../index";
import { itemStatusExpression } from "./inventory-calculations";
import type { InventoryItemStatus } from "./inventory-calculations";
import {
  getInventoryActor,
  itemViewJoins,
  toItemView,
} from "./inventory-database";

/**
 * The derived status as a valibot picklist, so the status filter can never
 * offer a value `calculateItemStatus` does not return. `satisfies` is the whole
 * point: adding a fifth status to the union below is a compile error rather
 * than a filter that silently never matches.
 */
const itemStatusSchema = picklist([
  "out_of_stock",
  "borrowed",
  "damaged",
  "available",
] as const satisfies readonly InventoryItemStatus[]);

/** 200 is more than a teacher can hold, and is the same ceiling the history list uses. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * `%` and `_` are LIKE metacharacters, and a teacher typing "50% off" into the
 * search box should find nothing rather than every item in the store. Backslash
 * is PostgreSQL's default LIKE escape character, so doubling it first is what
 * keeps the other two from being escaped by each other.
 */
const likePattern = (raw: string): string =>
  raw
    .trim()
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");

export const listMyItems = requireInventoryPermission("read")
  .input(
    object({
      search: optional(string()),
      status: optional(itemStatusSchema),
      limit: optional(
        pipe(number(), integer(), minValue(1), maxValue(MAX_LIMIT))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);

    // An account with no staff row — the seeded admin, principal and
    // deputy-principal seats are seeded as users with no staff identity on
    // purpose — has no item to be responsible for and none to be holding. That
    // is an empty page, not an error: the caller is a legitimate user who has
    // simply never been on the teaching roll. Throwing here would make the
    // route unreachable for exactly the accounts most likely to click through
    // it, and returning an unfiltered list instead would hand the school's
    // whole storebook to a read grant that is not meant to see it.
    if (!actor.staffId) {
      return { items: [], total: 0, staffId: null, staffName: actor.name };
    }

    const { staffId } = actor;
    const search = input.search?.trim();
    const limit = input.limit ?? DEFAULT_LIMIT;

    // Every predicate here names only `inventory_item` columns, which is what
    // lets the same `conditions` be reused by the count query below without
    // re-declaring the joins.
    const conditions: (SQL | undefined)[] = [
      isNull(inventoryItem.deletedAt),
      // The whole security boundary of this procedure.
      or(
        eq(inventoryItem.managerStaffId, staffId),
        eq(inventoryItem.custodianStaffId, staffId)
      ),
      search
        ? or(
            ilike(inventoryItem.name, likePattern(search)),
            ilike(inventoryItem.sku, likePattern(search)),
            ilike(inventoryItem.location, likePattern(search))
          )
        : undefined,
      input.status ? eq(itemStatusExpression(), input.status) : undefined,
    ];

    const where = and(...conditions);

    // Ordering is a product decision about what this page is for. A teacher's
    // page is not a store list with their name on it: the top of it should be
    // the things they are *accountable* for, because those are the ones they
    // will be asked about, and the things they merely happen to be carrying
    // follow underneath. An item that is both sorts as responsible. Name is the
    // tie-break because alphabetical order is the one order every reader in a
    // staffroom agrees on without being told.
    const [rows, [totalRow]] = await Promise.all([
      itemViewJoins(context.db)
        .where(where)
        .orderBy(
          sql`case when ${inventoryItem.managerStaffId} = ${staffId} then 0 else 1 end`,
          asc(inventoryItem.name)
        )
        .limit(limit),
      context.db.select({ value: count() }).from(inventoryItem).where(where),
    ]);

    return {
      // `itemViewJoins` + `toItemView`, so this list and the administrator's
      // list are byte-for-byte the same row shape and the web app renders them
      // with one component.
      items: rows.map((row) => toItemView(row)),
      total: totalRow?.value ?? 0,
      staffId,
      staffName: actor.name,
    };
  });
