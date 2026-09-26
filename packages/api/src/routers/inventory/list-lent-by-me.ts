/**
 * Everything the caller is answerable for that is currently in somebody else's
 * hands.
 *
 * This is the clearest piece of product logic that was missing: an owner is
 * accountable for an item they cannot currently see. `listMyItems` answers "what
 * am I responsible for, and what am I holding" and the answer to the first half
 * of that question is a dead end on its own — the register says R. Perera is
 * answerable for the microscope, R. Perera cannot act on it, cannot see who has
 * it, and cannot find out. An owner with no view of their own accountability is
 * an owner who finds out at the audit.
 *
 * ## The scoping is in the query, not in the permission
 *
 * `requireInventoryPermission("read")` is the honest gate — *seeing* what is out
 * is a read, and a `teacher` already holds it — but it says nothing about which
 * rows come back. The predicate below is the entire security boundary of this
 * procedure and it lives here, in the query, and nowhere else. It is a teacher's
 * read of **their own** accountability: it discloses the caller's own items, and
 * the one fact about another person it discloses is who is holding one of them —
 * which is unavoidable for the list to mean anything and is already disclosed by
 * `listCustodyHistory` to the same caller. It is not a way to learn about
 * anybody else's equipment, and the school-wide register (`items.list`) remains
 * `adminProcedure`.
 *
 * **What is deliberately excluded, and why:**
 *
 * - **Items the caller both owns and holds.** They are on "My Equipment" already,
 *   and appearing in both lists would make the owner look like a lender of their
 *   own property — which is the specific misreading this page exists to avoid.
 *   Hence the explicit `custodianStaffId <> me` rather than relying on the
 *   `isNotNull` half of the predicate.
 * - **Items out on a dated loan rather than held.** A loan is temporary by
 *   definition: it has a due date and a return flow, and the borrow list is where
 *   it belongs. Leaving them out keeps this page a statement about custody —
 *   "who is holding my things" — rather than a second, partial loan list that
 *   would go stale the moment somebody returned something. **If the school ever
 *   wants "everything I am answerable for, wherever it happens to be", that is a
 *   different query over `managerStaffId` plus the borrow table, and this one
 *   should not try to be it:** folding two different relationships into one list
 *   produces a page whose meaning changes depending on which of two unrelated
 *   processes last touched the item.
 *
 * ## The envelope, and the empty one
 *
 * The return shape is `listMyItems`'s exactly — `{ items, total, staffId,
 * staffName }` — so one component and one route guard can serve both pages, and
 * `itemViewJoins` + `toItemView` mean the rows are byte-for-byte the same shape
 * as every other list in this folder. `staffId` and `staffName` are in the
 * envelope rather than derived by the client because a caller with **no** staff
 * row has no items to be lent anything, and that is an honest empty page rather
 * than an error: the seeded `admin` / `principal` / `vicePrincipal` seats are
 * users with no staff identity on purpose, and throwing here would make the route
 * unreachable for exactly the accounts most likely to click through it. Returning
 * an unfiltered list instead would hand the school's whole storebook to a read
 * grant that is not meant to see it.
 */
import { inventoryItem } from "@school-student-teacher-management/db/schema/inventory";
import {
  and,
  asc,
  count,
  eq,
  ilike,
  isNotNull,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  integer,
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
  getInventoryActor,
  itemViewJoins,
  toItemView,
} from "./inventory-database";

/** 200 matches `listMyItems` and `listTakeableItems`. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * `%` and `_` are LIKE metacharacters, and a teacher typing "50% off" into the
 * search box should find nothing rather than every item in the store. Backslash
 * is PostgreSQL's default LIKE escape character, so doubling it first is what
 * keeps the other two from being escaped by each other.
 *
 * This is the fourth copy of this function in the folder (`list-items.ts`,
 * `list-teacher-options.ts`, `list-takeable-items.ts` and `list-my-items.ts` each
 * hold one), and none is exported from a shared module — the helpers are
 * module-private in their procedures, and a shared module for one regex is not
 * worth a public surface. It is a real duplication rather than a stylistic
 * choice, and it is why the comment travels with the function: the escape is the
 * security-relevant part, and a copy that arrives without its reason is a copy
 * somebody will "simplify" back into a bug.
 */
const likePattern = (raw: string): string =>
  raw
    .trim()
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");

export const listLentByMe = requireInventoryPermission("read")
  .input(
    object({
      search: optional(string()),
      limit: optional(
        pipe(number(), integer(), minValue(1), maxValue(MAX_LIMIT))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);

    // The same honest empty result `listMyItems` gives, and for the same reason:
    // an account with no staff row is a legitimate user who has never been on
    // the teaching roll, and it owns nothing. Throwing would make the route
    // unreachable for the seeded leadership seats; returning the unfiltered list
    // would hand them — and every other holder of `read` — the whole storebook.
    if (!actor.staffId) {
      return { items: [], total: 0, staffId: null, staffName: actor.name };
    }

    const { staffId } = actor;
    const search = input.search?.trim();
    const limit = input.limit ?? DEFAULT_LIMIT;

    // Every predicate names a bare `inventory_item` column, which is what lets the
    // same `where` be reused by the count query below without re-declaring the
    // joins.
    const conditions: (SQL | undefined)[] = [
      isNull(inventoryItem.deletedAt),
      // The whole security boundary of this procedure: owned by me.
      eq(inventoryItem.managerStaffId, staffId),
      // ...currently with somebody else. `isNotNull` and `ne` are both needed and
      // neither subsumes the other: `custodianStaffId <> me` alone is `null` for
      // an item sitting unheld in the store, and a `WHERE` that evaluated to
      // `null` would quietly drop every unassigned item the school owns. Written
      // as two terms, it cannot.
      isNotNull(inventoryItem.custodianStaffId),
      ne(inventoryItem.custodianStaffId, staffId),
      search
        ? or(
            ilike(inventoryItem.name, likePattern(search)),
            ilike(inventoryItem.sku, likePattern(search)),
            ilike(inventoryItem.location, likePattern(search))
          )
        : undefined,
    ];

    const where = and(...conditions);

    // Alphabetical by name, and the tie-break question does not arise the way it
    // does elsewhere: every row here is a `manager` row, so this is not the
    // "responsible first, then carried" ordering `listMyItems` needs. What the
    // reader is scanning is a list of colleagues' names, and the order everyone in
    // a staffroom agrees on without being told is the right one.
    const [rows, [totalRow]] = await Promise.all([
      itemViewJoins(context.db)
        .where(where)
        .orderBy(asc(inventoryItem.name))
        .limit(limit),
      context.db.select({ value: count() }).from(inventoryItem).where(where),
    ]);

    return {
      // `itemViewJoins` + `toItemView`, so these rows and the administrator's
      // list are the same shape and the web app renders them with one component.
      items: rows.map((row) => toItemView(row)),
      total: totalRow?.value ?? 0,
      staffId,
      staffName: actor.name,
    };
  });
