/**
 * The inventory register, filtered.
 *
 * This is the screen the store is run from, so it is the one read in this module
 * that carries filters. Every item read in this feature — this list, `getItem`,
 * and the `InventoryItemView` returned by the three write procedures — goes out
 * through `itemViewJoins` + `toItemView`, which is what makes a row's
 * `availableQty` and `status` identical wherever it is rendered. A list that
 * derived them itself would eventually disagree with the badge the detail page
 * draws, and a storebook that disagrees with itself is worse than no storebook.
 */
import { ORPCError } from "@orpc/server";
import { itemConditionSchema } from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryCategoryIdSchema,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import type { SQL } from "drizzle-orm";
import { and, count, desc, eq, ilike, isNull, lte, or, sql } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";
import type { InventoryItemStatus } from "./inventory-calculations";
import { itemStatusExpression } from "./inventory-calculations";
import { itemViewJoins, toItemView } from "./inventory-database";

/** The page size the register falls back to when the caller does not choose one. */
const DEFAULT_LIMIT = 200;

/**
 * The three leadership seats, restated from `ADMIN_ROLES` in
 * `packages/api/src/index.ts:77` rather than imported — that list is module
 * private there, and a second copy with a pointer is cheaper than widening a
 * module's public surface for one filter guard.
 */
const ADMIN_ROLES = new Set(["admin", "principal", "vicePrincipal"]);

/**
 * The four derived statuses. The list is `satisfies` the `InventoryItemStatus`
 * union rather than annotated as it, so adding an arm to `calculateItemStatus`
 * makes this a type error instead of a filter that silently never matches.
 */
const itemStatusSchema = v.picklist([
  "out_of_stock",
  "borrowed",
  "damaged",
  "available",
] as const satisfies readonly InventoryItemStatus[]);

/**
 * A free-text search term is data, not a pattern.
 *
 * `%` and `_` are `LIKE`/`ILIKE` wildcards, so a storekeeper typing an asset
 * reference like `LT_0042` would otherwise match `LT-0042` as well, and a
 * literal backslash typed into the box would be consumed by the escape
 * machinery. Every such character is prefixed with a backslash — which is
 * PostgreSQL's default `LIKE` escape character, so no `ESCAPE` clause is needed
 * — and the user's own `%` then matches exactly one `%`. The class is anchored on
 * a single character so a backslash is escaped once and not re-escaped by the
 * pass that handles the next character.
 */
const escapeLikePattern = (value: string): string =>
  value.replaceAll(/[\\%_]/gu, (character) => `\\${character}`);

/**
 * The filtered register.
 *
 * **Filters compose as AND**, each one narrowing the last. `status` is the
 * awkward one: it is *computed* from `qty`, `borrowedQty` and `condition` rather
 * than stored on a column, so it cannot be a `WHERE` term on the same table the
 * free-text `search` reads — the two are applied to different things. A UI that
 * sets both is asking for "items named like `proj` **that are** out of stock",
 * which is a real and answerable question, but the answer is the *intersection*
 * of a text match and a computed predicate rather than a text match that happens
 * to be out of stock. Treat a status filter as a narrowing of a search rather
 * than a companion to it: put the term in the box, pick the badge, and say
 * "matching: out of stock" so a user is never surprised by an empty list.
 *
 * `total` is counted against the same filter set **before** `limit`, because the
 * list header renders "showing 50 of 312" and a total that silently counted the
 * page rather than the match set makes that line a lie.
 *
 * **`adminProcedure`, not `requireInventoryPermission("read")`** — a deliberate
 * deviation from the obvious gate, and the reason is written down in two other
 * places in this repo.
 *
 * The gate changed because `requireInventoryPermission("read")` is
 * teacher-reachable: the `teacher` role holds `inventory: ["read"]`
 * (`packages/auth/src/permissions.ts`), and `requirePermission` in
 * `packages/api/src/index.ts` consults that statement for anybody outside
 * `ADMIN_ROLES`. A teacher can therefore pass that gate, and this list is the
 * whole item register — every item in the school, with every manager's and
 * custodian's name, valuation, location and condition beside it. That is other
 * people's business, and no filter on the input can fix it: a caller who wants
 * the school asks for the unfiltered set.
 *
 * Narrowing it to the caller is not available either, which is exactly what
 * `listMyItems` is for — a separate procedure whose
 * `or(managerStaffId = me, custodianStaffId = me)` predicate is how the same
 * `read` grant is honoured without leaking anything. So what this list now
 * satisfies is the `teacher` statement's own contract, which names the
 * school-wide register, ledger, movement and write-off lists as things that
 * grant must not reach.
 */
export const listItems = adminProcedure
  .input(
    v.object({
      search: v.optional(v.pipe(v.string(), v.maxLength(120))),
      categoryId: v.optional(inventoryCategoryIdSchema),
      condition: v.optional(itemConditionSchema),
      status: v.optional(itemStatusSchema),
      custodianStaffId: v.optional(staffIdSchema),
      managerStaffId: v.optional(staffIdSchema),
      lowStockOnly: v.optional(v.boolean()),
      includeDeleted: v.optional(v.boolean()),
      limit: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    // ─── The one admin-only filter ──────────────────────────────────────────
    // Everything else in this input is a narrowing of a read that the
    // `inventory:read` grant already covers: a storekeeper and a teacher both
    // legitimately see the same rows, and none of the remaining filters reveal
    // anything a reader could not get by walking the unfiltered list. This one
    // is different in kind rather than degree — it un-hides every retired record
    // in the school at once, including the ones whose names, valuations and
    // holders were dropped from the working register on purpose. A
    // per-item override would be worthless as a control (the caller would simply
    // ask for the whole set), so the flag is gated on the leadership roles
    // alone. `deletedAt` still comes back on every row, so the UI can mark a
    // retired record as retired rather than resurrecting it by accident.
    if (input.includeDeleted) {
      const role = context.session?.user.role ?? "";
      if (!ADMIN_ROLES.has(role)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an administrator can view retired inventory records",
        });
      }
    }

    // `SQL | undefined` because drizzle types the combinators that way, and
    // `and(...)` skips the undefined entries — which is the behaviour we want,
    // since a filter the caller did not ask for must not narrow anything.
    const filters: (SQL | undefined)[] = [];

    if (!input.includeDeleted) {
      filters.push(isNull(inventoryItem.deletedAt));
    }

    if (input.categoryId) {
      filters.push(eq(inventoryItem.categoryId, input.categoryId));
    }

    if (input.condition) {
      filters.push(eq(inventoryItem.condition, input.condition));
    }

    // The SQL mirror of `calculateItemStatus`, used rather than a third
    // hand-written ladder. There are two implementations of that decision — the
    // TypeScript one in `inventory-calculations` and the `sql` one beside it —
    // and this is the second place that would otherwise grow a third. If the two
    // ever drift, the filter stops agreeing with the badges on the rows it
    // returns, which is the bug the shared module exists to prevent.
    if (input.status) {
      filters.push(sql`${itemStatusExpression()} = ${input.status}`);
    }

    // Filtered on the `inventory_item` foreign-key columns rather than through
    // the `managerStaff` / `custodianStaff` aliases the view joins for their
    // names. The join is one-to-one on a non-null foreign key, so both spellings
    // select the same rows, and the column form is the one the
    // `inventory_item_manager_staff_idx` / `..._custodian_staff_idx` indexes
    // can answer.
    if (input.managerStaffId) {
      filters.push(eq(inventoryItem.managerStaffId, input.managerStaffId));
    }

    if (input.custodianStaffId) {
      filters.push(eq(inventoryItem.custodianStaffId, input.custodianStaffId));
    }

    // `minQty` is a reorder **threshold**, not a stock floor: the database
    // CHECK is only `min_qty >= 0`, and that is deliberate (see
    // `inventory_item_min_qty` in the schema) — a hard floor would make every
    // write-off and disposal fail at exactly the moment they are most needed.
    // So this is a warning surface and nothing more, which is why it is a filter
    // the user opts into and not a constraint the write paths enforce.
    if (input.lowStockOnly) {
      filters.push(lte(inventoryItem.qty, inventoryItem.minQty));
    }

    const trimmedSearch = input.search?.trim();
    if (trimmedSearch) {
      const pattern = `%${escapeLikePattern(trimmedSearch)}%`;
      filters.push(
        or(
          ilike(inventoryItem.name, pattern),
          ilike(inventoryItem.sku, pattern),
          ilike(inventoryItem.description, pattern)
        )
      );
    }

    const where = and(...filters);
    const limit = input.limit ?? DEFAULT_LIMIT;

    // Newest first, with `id` breaking the tie. The register sits beside the
    // movement ledger, which is also newest first, and `id` is there for the
    // same reason it is on the ledger: two items created inside the same
    // transaction share a `defaultNow()` timestamp, and an unstable order is an
    // order that reorders itself under the user on refresh.
    const [rows, counted] = await Promise.all([
      itemViewJoins(context.db)
        .where(where)
        .orderBy(desc(inventoryItem.createdAt), desc(inventoryItem.id))
        .limit(limit),
      // The count needs no joins. Every filter above names an `inventory_item`
      // column, and the view's only `inner` join is the category, which is a
      // non-null foreign key onto a unique primary key — one row in, one row
      // out. Counting the bare table is therefore the same number for a fraction
      // of the work, and it cannot drift from the list as long as both are built
      // from the same `where`.
      context.db.select({ value: count() }).from(inventoryItem).where(where),
    ]);

    return {
      items: rows.map((row) => toItemView(row)),
      total: counted[0]?.value ?? 0,
    };
  });
