/**
 * What a teacher may take: a catalogue of what is on the shelf, and nothing
 * else.
 *
 * `takeItem` has existed behind `requireInventoryPermission("take")` since the
 * self-service path was built, and for a long time it was a door with no room
 * behind it — a `teacher` was authorised to take an item and was handed nothing
 * to take one from. `items.list` is the school-wide register and is
 * `adminProcedure` for a reason that has not changed: it is every item in the
 * school with every manager's and custodian's name, valuation, location and
 * condition beside it, and no filter on the input can un-leak that, because a
 * caller who wants the school simply asks for the unfiltered set.
 *
 * So this is a **catalogue, not a relaxed register**, and the difference is the
 * whole design. What somebody deciding what to borrow needs is "is there one on
 * the shelf", not "who is answerable for it and who is carrying it". Everything
 * a catalogue needs to answer that is joined in below; everything else about an
 * item stays behind the admin gate, and the projection is where that is enforced
 * rather than merely intended.
 */
import {
  inventoryCategory,
  inventoryCategoryIdSchema,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, asc, count, eq, ilike, isNull, ne, or } from "drizzle-orm";
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

import { requireInventoryPermission } from "../../index";
import {
  calculateAvailableQuantity,
  itemStatusExpression,
} from "./inventory-calculations";
import { countersOf, getInventoryActor } from "./inventory-database";

/**
 * The one status arm this catalogue offers.
 *
 * Named rather than written inline, because the string is a claim about the
 * `InventoryItemStatus` union and it is spelled in the SQL below rather than
 * checked by a type. `takeItem` compares the same arm, in TypeScript, against a
 * locked row — see the filter comment for why the two are required to agree.
 */
const AVAILABLE_STATUS = "available";

/** 200 matches `listMyItems` and the custody history, and is far past one shelf. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * A free-text search term is data, not a pattern.
 *
 * `%` and `_` are `ILIKE` wildcards, so a teacher typing an asset tag — or
 * typing "50% off" because they are looking for a discount-rated item and do not
 * know they are in a school storebook — would otherwise be handed the whole
 * shelf. Every metacharacter is prefixed with a backslash, which is
 * PostgreSQL's default `ILIKE` escape character, so no `ESCAPE` clause is needed.
 *
 * **This is the third copy of this function** (`list-items.ts` and
 * `list-teacher-options.ts` each hold one; `list-my-items.ts` holds a variant
 * under a different name), and none of the three is exported from a shared
 * module. That is a real duplication rather than a stylistic choice — the helpers
 * are module-private in their procedures and a shared module for one regex is not
 * worth a public surface — but it is why the comment is copied with the function:
 * the escape is the security-relevant part, and a copy that arrives without its
 * reason is a copy somebody will "simplify" back into a bug.
 */
const escapeLikePattern = (value: string): string =>
  value.replaceAll(/[\\%_]/gu, (character) => `\\${character}`);

/**
 * The columns the catalogue selects, and the whole of the security boundary.
 *
 * **`managerStaffId`, `managerName`, `custodianStaffId`, `custodianName`,
 * `description`, `purchaseValue`, `currentValue`, `borrowedQty` and `minQty` are
 * absent on purpose.** So are `qty`, `unit`, `borrowable`, `createdAt` and
 * `deletedAt`: the two counters are selected only to derive `availableQty`, and
 * everything else here is a fact about the shelf rather than about the school.
 *
 * What would break by adding one back is worth stating, because "just the name
 * of the person holding it, it would be more useful" is the request this file
 * exists to refuse:
 *
 * - `custodianName` / `managerName` turn the only school-wide read a teacher can
 *   make into the school-wide register — a roll of colleagues, their locations
 *   and their accountability — and the `teacher` statement in
 *   `packages/auth/src/permissions.ts`, which enumerates the five procedures
 *   `read` reaches, becomes false in the same commit that made it false.
 * - `purchaseValue` / `currentValue` publish what the school paid, and what it
 *   thinks each asset is worth, to every teacher in the building.
 * - `borrowedQty` / `qty` are not names, but they are the arithmetic behind "is
 *   any of this free", and `availableQty` already answers that without letting a
 *   reader work out how much of the school's stock is out.
 * - `description` is free text written by whoever created the line, so it is
 *   whatever that storekeeper typed — not a controlled vocabulary, and not the
 *   teacher's business.
 *
 * The `qty` / `borrowedQty` pair is the one thing selected but not returned, and
 * it is here rather than in SQL because `calculateAvailableQuantity` is the
 * single subtraction in this feature: a second `qty - borrowedQty` written
 * directly into the projection would be a third implementation of it, in the
 * one file whose entire claim is that it is narrower than its neighbours.
 */
const TAKEABLE_SELECTION = {
  id: inventoryItem.id,
  sku: inventoryItem.sku,
  name: inventoryItem.name,
  categoryId: inventoryItem.categoryId,
  categoryColor: inventoryCategory.color,
  categoryName: inventoryCategory.name,
  qty: inventoryItem.qty,
  borrowedQty: inventoryItem.borrowedQty,
  condition: inventoryItem.condition,
  location: inventoryItem.location,
} as const;

/**
 * The catalogue: what is on the shelf that this caller could take, right now.
 *
 * ## The gate, and why it is `read` when the action it feeds is `take`
 *
 * `requireInventoryPermission("read")` is the grant a `teacher` already holds,
 * and it is the honest one: *discovering* that an item is available is a read.
 * Nobody needs a second grant to look at a shelf, and granting `take` to read
 * would make this procedure depend on a permission whose subject is a write.
 * The pairing is the point — **a teacher may see what is available and may take
 * one, and everything else about an item stays behind the admin gate.** The
 * `take` grant stays exactly where `take-item.ts` puts it, on the write.
 *
 * This is **one of exactly five procedures a `teacher` can reach in this
 * feature** — `listMyItems`, `listCategories`, `listCustodyHistory`,
 * `listLentByMe`, and this one. It is the **only one of the five that reveals
 * anything about an item the caller has no relationship with**: the other four
 * are scoped to the caller's own rows in their own queries, or carry no item at
 * all. `listLentByMe` is the one that was added after this comment was written
 * and it does not change the shape of the claim — it *is* caller-scoped
 * (`managerStaffId = me`), so the count moved and the distinction did not. So the
 * five-count in the `teacher` statement is not a formality — it is the shape of
 * the teacher's entire view of the inventory, and it is what this procedure
 * widens, by exactly the amount of `availableQty` and nothing more.
 *
 * ## The filters are `takeItem`'s own guards, and nothing may be added to them
 *
 * A catalogue that offers something the action refuses is worse than no
 * catalogue: it is a button that always fails, which is the defect a previous
 * pass removed from the administrator's screen and the reason the mutation was
 * deleted from the teacher page. Each filter below names the guard it mirrors:
 *
 * - `isNull(deletedAt)` — `getLockedItem` treats a soft-deleted item as
 *   non-existent and `takeItem` calls it, so a retired line cannot be taken.
 * - `borrowable = true` — `takeItem` refuses "this is not one that is handed out
 *   to teachers" before it looks at the counters. An item the school never lends
 *   is not takeable, whatever else is true of it.
 * - **`itemStatusExpression() = 'available'`** — this is the derived status
 *   ladder, and it is a **declared duplicate of the TypeScript
 *   `calculateItemStatus` in `inventory-calculations.ts`**; read the warning on
 *   `itemStatusExpression` there, which is the authoritative statement of the
 *   duplication and of the rule that a change to one must change the other in
 *   the same commit. This file adds one new fact to that arrangement rather than
 *   restating it: the two implementations are now **load-bearing against each
 *   other**. `takeItem` computes the status in TypeScript against a row it
 *   locked, and this filter computed the same status in SQL to decide whether to
 *   show the row at all. A drift between them is not a stale badge — it is a
 *   catalogue advertising an item the write will refuse, or hiding one it would
 *   accept, and the second of those is the quieter failure of the two.
 *
 *   The arms and their order are the contract, and the `available` arm is
 *   therefore exactly `calculateItemStatus(counters, condition) === "available"`:
 *   `qty !== 0` **and** `borrowedQty === 0` **and** `condition !== "Damaged"`.
 *   That equivalence is worth reading carefully, because it settles two questions
 *   this file could otherwise get wrong by accident:
 *
 *   - **`out_of_stock` and `damaged` are excluded, and that is `takeItem`'s
 *     behaviour rather than a silent scope reduction of our own.** They are the
 *     other two arms of the same ladder, so requiring `available` excludes them
 *     as a consequence — and `takeItem` refuses both, with a message each
 *     ("There is no stock of this item left to take" / "This item is marked
 *     Damaged"). Adding a *separate* `condition <> 'Damaged'` term would be
 *     redundant, and adding `qty > 0` alongside the expression would be the same
 *     fact stated twice, which is the shape a future edit breaks.
 *   - **`Under Repair` is deliberately NOT excluded.** It is one of the four
 *     stored conditions and `calculateItemStatus` does not look at it — the
 *     damaged arm tests `condition === "Damaged"` and nothing else — so a unit
 *     under repair reads as `available` and `takeItem` accepts it. Filtering it
 *     out here would be a scope reduction the action does not share: a teacher
 *     would be told a device is unavailable while the server would have let them
 *     take it. If the school ever decides a repair-in-progress must not be handed
 *     out, the change belongs in `calculateItemStatus` **and** here, in the same
 *     commit, so both the badge and the refusal move together.
 * - **`custodianStaffId IS DISTINCT FROM me`** — `takeItem` refuses "This item is
 *   already assigned to you", and `custodianStaffId` is not an input to the
 *   status ladder, so without this predicate a teacher who already holds an item
 *   would be offered that same item. Two `ne`-safe arms rather than one, because
 *   `col <> me` is `NULL` for an unheld item and a `WHERE` that evaluated to
 *   `NULL` would throw away every item in the store.
 *
 *   This predicate is the one place the catalogue is scoped to the caller, and it
 *   is the only scoping it does. It is also the one that cannot leak: it compares
 *   against the caller's **own** staff id, so excluding the rows where it matches
 *   discloses nothing about any other person — the caller already knows what they
 *   are holding, which is what `custody.myItems` is for.
 *
 * ## What is deliberately *not* a filter: the no-staff-row refusal
 *
 * `takeItem` also refuses an account with no `staff` row, and that one is a fact
 * about the **caller** rather than about any item, so it cannot be a `WHERE`
 * term — there is no row to compare it against. It is answered in the early
 * return below, and it is the reason the catalogue is empty for the seeded
 * leadership accounts: they may pass this gate and find a shelf they cannot take
 * anything from, which is the truth, rather than a shelf full of buttons that
 * will all be refused. The teacher page does not even offer the action in that
 * state — see `my-equipment.tsx` — so this is the second of two guards on the
 * same condition, and both are needed: one stops the list, the other stops the
 * button.
 */
export const listTakeableItems = requireInventoryPermission("read")
  .input(
    object({
      search: optional(pipe(string(), maxLength(120))),
      categoryId: optional(inventoryCategoryIdSchema),
      limit: optional(
        pipe(number(), integer(), minValue(1), maxValue(MAX_LIMIT))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);

    // Same honest empty result `listMyItems` gives, and for the same reason: the
    // seeded `admin` / `principal` / `vicePrincipal` seats are users with no
    // staff identity by design, and a caller with no staff row can pass the gate
    // and can never claim an item. Returning the shelf here would be offering a
    // catalogue to somebody whose every use of it is refused.
    if (!actor.staffId) {
      return { items: [], total: 0 };
    }

    const { staffId } = actor;
    const limit = input.limit ?? DEFAULT_LIMIT;
    const search = input.search?.trim();

    /**
     * Every predicate names an `inventory_item` column, which is what lets the
     * same `where` be reused by the count below without re-declaring the join.
     */
    const conditions: (SQL | undefined)[] = [
      isNull(inventoryItem.deletedAt),
      eq(inventoryItem.borrowable, true),
      eq(itemStatusExpression(), AVAILABLE_STATUS),
      or(
        isNull(inventoryItem.custodianStaffId),
        ne(inventoryItem.custodianStaffId, staffId)
      ),
      input.categoryId
        ? eq(inventoryItem.categoryId, input.categoryId)
        : undefined,
      search
        ? or(
            ilike(inventoryItem.name, `%${escapeLikePattern(search)}%`),
            ilike(inventoryItem.sku, `%${escapeLikePattern(search)}%`)
          )
        : undefined,
    ];

    const where = and(...conditions);

    /**
     * Alphabetical, with `id` breaking the tie. A shelf is looked at rather than
     * audited, and the order a reader in a staffroom agrees on without being told
     * is the right default for a list they are going to scan. `id` is the tie-break
     * for the reason it is on every other list in this folder: two items created
     * in one transaction share a `defaultNow()` timestamp, and an order that
     * reorders itself under the user on refresh is not an order.
     */
    const [rows, [totalRow]] = await Promise.all([
      context.db
        .select(TAKEABLE_SELECTION)
        .from(inventoryItem)
        // An `inner` join, and correctly so: `categoryId` is a not-null foreign
        // key with a `restrict` action onto a unique primary key, so exactly one
        // category row matches an item row. The two staff joins `itemViewJoins`
        // needs are absent because this procedure selects no staff column — the
        // join that would leak the names is not merely unselected, it is not here.
        .innerJoin(
          inventoryCategory,
          eq(inventoryItem.categoryId, inventoryCategory.id)
        )
        .where(where)
        .orderBy(asc(inventoryItem.name), asc(inventoryItem.id))
        .limit(limit),
      // Counted against the same filter set **before** `limit`, because the
      // dialog says how many are on the shelf and a total that counted the page
      // rather than the match set would make that sentence a lie. No join is
      // needed: every predicate above names a bare `inventory_item` column.
      context.db.select({ value: count() }).from(inventoryItem).where(where),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        categoryColor: row.categoryColor,
        availableQty: calculateAvailableQuantity(countersOf(row)),
        condition: row.condition,
        location: row.location,
      })),
      total: totalRow?.value ?? 0,
    };
  });
