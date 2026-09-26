/**
 * The counter ledger, read: *"what happened to the stock, and what did the
 * numbers look like immediately before and after?"*
 *
 * `inventory_transaction` is the only place in this module that can answer the
 * second half of that sentence. `inventoryItem` answers "how many are there",
 * and a `qty` that is wrong is only detectable by replaying this table — which
 * is why every write path funnels through `insertInventoryTransaction` and why
 * both sides of every counter are stored rather than a delta.
 *
 * The two names on a row come from two places on purpose. `inventoryItem` and
 * `staff` are the live truth, and `meta` holds the denormalised copy the writer
 * took at the time; the live value wins and `meta` is the fallback, which gives
 * the right answer in both directions — a renamed item shows its current name
 * in the ledger, and a departed storekeeper still shows the name they had.
 */
import {
  inventoryActionLabel,
  inventoryActionSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import type { InventoryAction } from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryItem,
  inventoryItemIdSchema,
  inventoryTransaction,
} from "@school-student-teacher-management/db/schema/inventory";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import {
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, count, desc, eq, gte, ilike, lt, or } from "drizzle-orm";
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
import { addDaysIsoDate } from "./inventory-calculations";
import type { Executor } from "./inventory-database";
import { iso } from "./inventory-database";

/** A year of movements is a plausible page size; 500 is the hard ceiling. */
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

/**
 * `%` and `_` are LIKE metacharacters, and a storekeeper searching the ledger
 * for "50% of the" or for an asset tag written with an underscore should find
 * the note they meant rather than every row in the table. Backslash is
 * PostgreSQL's default LIKE escape character, so it is doubled first — doing it
 * last would let the escapes this function just added be escaped again.
 */
const likePattern = (raw: string): string =>
  raw
    .trim()
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");

/**
 * One string out of a `jsonb` blob, or null.
 *
 * `meta` is typed `Record<string, unknown>`, so `meta.itemName` is `unknown` at
 * compile time and `string` only by the writer's discipline. This refuses
 * anything that is not a non-blank string rather than casting and hoping, so a
 * hand-inserted `{"itemName": 42}` renders as a missing name instead of a
 * number on screen.
 */
const metaText = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

/**
 * `meta` rebuilt as a fresh plain object, for the wire.
 *
 * Two facts make this safe to hand to a client. First, `jsonb` has no date,
 * timestamp or binary type: the driver returns JSON primitives, arrays and
 * plain objects, so anything date-shaped inside the blob is a **string** and is
 * deliberately left as one — re-parsing it here would bolt a timezone onto a
 * value the store recorded without one, and the UI is the layer that knows what
 * a given field meant. Second, the blob is re-created rather than passed
 * through, so a payload that is not a record at all (jsonb will store an array
 * or a bare string perfectly happily) reaches the client as null instead of as
 * something the UI will try to spread.
 */
const metaRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return { ...(value as Record<string, unknown>) };
};

/**
 * The select-and-join chain, shared by the row read and the count so the two
 * cannot drift.
 *
 * Both joins are one-to-one — `item_id` is a foreign key onto the item primary
 * key and `actor_staff_id` onto the staff primary key — so neither multiplies a
 * row, which is what makes the `count(*)` below exact without a `groupBy`.
 * `staff` is a `left` join because `actor_staff_id` is nullable by design (see
 * the ledger's schema comment), and an inner join here would silently delete
 * every movement performed by a seeded administrator, who has no staff row.
 */
const ledgerSelection = {
  id: inventoryTransaction.id,
  action: inventoryTransaction.action,
  itemId: inventoryTransaction.itemId,
  qtyBefore: inventoryTransaction.qtyBefore,
  qtyAfter: inventoryTransaction.qtyAfter,
  borrowedQtyBefore: inventoryTransaction.borrowedQtyBefore,
  borrowedQtyAfter: inventoryTransaction.borrowedQtyAfter,
  note: inventoryTransaction.note,
  meta: inventoryTransaction.meta,
  createdAt: inventoryTransaction.createdAt,
  actorStaffId: inventoryTransaction.actorStaffId,
  itemName: inventoryItem.name,
  itemSku: inventoryItem.sku,
  actorName: staff.name,
} as const;

const ledgerQuery = (db: Executor) =>
  db
    .select(ledgerSelection)
    .from(inventoryTransaction)
    .innerJoin(inventoryItem, eq(inventoryTransaction.itemId, inventoryItem.id))
    .leftJoin(staff, eq(inventoryTransaction.actorStaffId, staff.id));

type LedgerRow = Awaited<ReturnType<typeof ledgerQuery>>[number];

/**
 * One ledger row as the wire sees it.
 *
 * The `id` ordering that pairs rows correctly is applied by the caller, below.
 */
const toTransactionRow = (row: LedgerRow) => {
  const meta = metaRecord(row.meta);

  return {
    id: row.id,
    // The column is `text` under a database CHECK; the picklist is the same list
    // the CHECK is built from, so this cast is the type layer agreeing with the
    // constraint rather than a claim the compiler cannot see.
    action: row.action as InventoryAction,
    actionLabel: inventoryActionLabel(row.action),
    itemId: row.itemId,
    /**
     * Live join first, denormalised copy second. `||` rather than `??` because a
     * blank name is not a name: the item CHECK forbids it, and falling back is
     * the better answer if a row ever carries one anyway.
     */
    itemName: row.itemName || metaText(meta?.itemName),
    sku: row.itemSku || metaText(meta?.sku),
    actorStaffId: row.actorStaffId,
    /**
     * The fallback is not a nicety — `meta.actorName` exists precisely for the
     * case the join cannot answer. `actor_staff_id` is `set null`, so a
     * storekeeper who leaves the school is removed from the live join and the
     * only name left for every movement they ever made is the copy their writer
     * put in `meta`; the same copy is the *only* attribution a write by a seeded
     * administrator ever has, since those accounts have no staff row.
     */
    actorName: row.actorName || metaText(meta?.actorName),
    qtyBefore: row.qtyBefore,
    qtyAfter: row.qtyAfter,
    /**
     * The deltas are derived here rather than selected as a column. The ledger
     * stores the *pair* precisely so the delta is derivable and so either side
     * can be sanity-checked against the last row's `after`; a persisted delta
     * column would be one more value that can silently disagree with the pair it
     * was computed from, and the one thing this table must never do is be the
     * reason a school's numbers stop adding up.
     */
    qtyDelta: row.qtyAfter - row.qtyBefore,
    borrowedQtyBefore: row.borrowedQtyBefore,
    borrowedQtyAfter: row.borrowedQtyAfter,
    borrowedQtyDelta: row.borrowedQtyAfter - row.borrowedQtyBefore,
    note: row.note,
    meta,
    createdAt: iso(row.createdAt),
  };
};

/**
 * **`adminProcedure`, not `requireInventoryPermission("read")`** — a deliberate
 * deviation from the obvious gate, and the reason is written down in two other
 * places in this repo.
 *
 * The gate changed because `requireInventoryPermission("read")` is
 * teacher-reachable: the `teacher` role holds `inventory: ["read"]`
 * (`packages/auth/src/permissions.ts`), and `requirePermission` in
 * `packages/api/src/index.ts` consults that statement for anybody outside
 * `ADMIN_ROLES`. A teacher can therefore pass that gate, and this is the whole
 * counter ledger — every movement of every item in the school, naming the person
 * who made it, with both sides of the counter, the free-text note and the `meta`
 * blob beside it. `meta` is where the custody names live: `previousCustodianName`
 * and `newCustodianName` on every `custody_transferred` row, so this list is a
 * chronological record of who held what and who signed for it.
 *
 * It cannot be scoped to the caller in any useful way: the ledger's job is
 * replaying the school's numbers, and a `WHERE actorStaffId = me` version of it
 * would answer a question nobody asks while still not being the screen this one
 * is. What this list now satisfies is the `teacher` statement's own contract,
 * which names the school-wide ledger as something that grant must not reach.
 */
export const listTransactions = adminProcedure
  .input(
    object({
      itemId: optional(inventoryItemIdSchema),
      action: optional(inventoryActionSchema),
      actorStaffId: optional(staffIdSchema),
      search: optional(pipe(string(), maxLength(120))),
      from: optional(isoDateSchema),
      to: optional(isoDateSchema),
      limit: optional(
        pipe(number(), integer(), minValue(1), maxValue(MAX_LIMIT))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const search = input.search?.trim();
    const limit = input.limit ?? DEFAULT_LIMIT;

    // The date filter is half-open on a UTC calendar day. The column is a
    // `timestamp` — an instant — while the input is a bare `YYYY-MM-DD`, and
    // the repo's other range reads close with `T23:59:59Z`, which drops the
    // last second of the requested day. A ledger that silently omits a 23:59:59
    // stock-in is worse than one that admits it, so the upper bound is midnight
    // on the *following* day and stays exclusive.
    const conditions: (SQL | undefined)[] = [
      input.itemId ? eq(inventoryTransaction.itemId, input.itemId) : undefined,
      input.action ? eq(inventoryTransaction.action, input.action) : undefined,
      input.actorStaffId
        ? eq(inventoryTransaction.actorStaffId, input.actorStaffId)
        : undefined,
      search
        ? or(
            ilike(inventoryItem.name, likePattern(search)),
            ilike(inventoryItem.sku, likePattern(search)),
            ilike(inventoryTransaction.note, likePattern(search))
          )
        : undefined,
      input.from
        ? gte(
            inventoryTransaction.createdAt,
            new Date(`${input.from}T00:00:00Z`)
          )
        : undefined,
      input.to
        ? lt(
            inventoryTransaction.createdAt,
            new Date(`${addDaysIsoDate(1, input.to)}T00:00:00Z`)
          )
        : undefined,
    ];

    const where = and(...conditions);

    // One `where` object drives both queries, so the page and the total it
    // reports can never describe different result sets.
    //
    // `id` is the tie-break, and it has to be: `created_at` is a `defaultNow()`
    // timestamp, so every movement written inside one transaction shares it, and
    // an unstable order between them hands the same ledger two different pages.
    const [rows, countRows] = await Promise.all([
      ledgerQuery(context.db)
        .where(where)
        .orderBy(
          desc(inventoryTransaction.createdAt),
          desc(inventoryTransaction.id)
        )
        .limit(limit),
      context.db
        .select({ value: count() })
        .from(inventoryTransaction)
        .innerJoin(
          inventoryItem,
          eq(inventoryTransaction.itemId, inventoryItem.id)
        )
        .leftJoin(staff, eq(inventoryTransaction.actorStaffId, staff.id))
        .where(where),
    ]);

    const [totalRow] = countRows;

    return {
      transactions: rows.map((row) => toTransactionRow(row)),
      total: totalRow?.value ?? 0,
    };
  });
