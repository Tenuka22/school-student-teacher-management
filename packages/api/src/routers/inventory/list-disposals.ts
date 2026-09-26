/**
 * The disposal register: every write-off certificate, its current state, who
 * raised it, who signed it, and — optionally — how it got there.
 *
 * One handler, three queries, no N+1. The units and the status history are
 * fetched for the whole page in a single statement each and grouped in memory,
 * because a per-row lookup here would be the obvious way to write it and would
 * turn a 50-row page into 100 extra round trips on the page a storekeeper opens
 * every morning. The status-history table is the extra that the source repo
 * declared and never read: nothing ever wrote to it, so there was nothing to
 * read, and it is the `approve` / `finalize` / `cancel` procedures in this
 * folder that gave it a writer. This is where it finally becomes visible.
 *
 * **Ordering is a product decision: `pending_approval` first.** A request
 * awaiting a signature is the one row on this page that needs a decision from
 * the person looking at it; everything else is history. Within each group,
 * newest first, with `id` as the tie-break so two requests raised in the same
 * millisecond do not swap places between page loads.
 *
 * The `summary` is computed by the aggregate query below rather than by counting
 * in the page or by a second endpoint, because it is the page header and it must
 * describe the **whole filtered set**, not the 50 rows on screen — a header
 * reading "3 awaiting approval" while the list shows 1 of them is a bug the user
 * cannot see through. The page's `total` and all four summary counts come out of
 * one round trip, which is also why this handler is three queries in two phases
 * rather than five.
 */
import { ORPCError } from "@orpc/server";
import {
  DISPOSAL_FINAL_STATUSES,
  disposalMethodLabel,
  disposalMethodSchema,
  disposalStatusLabel,
  disposalStatusSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryDisposal,
  inventoryDisposalStatusHistory,
  inventoryDisposalUnit,
  inventoryItem,
  inventoryItemIdSchema,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  boolean,
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
import type { InferOutput } from "valibot";

import type { Context } from "../../context";
import { adminProcedure } from "../../index";
import { iso, isoOrNull } from "./inventory-database";

type Database = Context["db"];

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * Four aliases of the same table, because a disposal names four different people
 * and one join cannot say which of them it matched.
 *
 * Every one is a **left** join. All four staff columns are `onDelete: "set null"`
 * by design — a storekeeper who leaves the school must not delete the record of
 * the write-offs they signed — so a non-null `*ByStaffId` with a null name is a
 * normal, expected row: the person has since been deleted. It is not a join that
 * failed and not data to repair, and the UI must render it as "someone who is no
 * longer here" rather than as an error or a blank cell that looks unfilled.
 */
const requestedByStaff = alias(staff, "disposal_requested_by");
const approvedByStaff = alias(staff, "disposal_approved_by");
const finalizedByStaff = alias(staff, "disposal_finalized_by");
const cancelledByStaff = alias(staff, "disposal_cancelled_by");
/** A fifth alias, for the status-history rows rather than the certificates. */
const changedByStaff = alias(staff, "disposal_history_changed_by");

/**
 * `%` and `_` are LIKE metacharacters, so a search for "50% broken" would
 * otherwise match every row in the register. Backslash is PostgreSQL's default
 * LIKE escape character, so it is doubled first — otherwise the backslashes this
 * function adds for `%` and `_` would escape each other.
 */
const likePattern = (raw: string): string =>
  raw
    .trim()
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");

const listDisposalsInput = object({
  itemId: optional(inventoryItemIdSchema),
  status: optional(disposalStatusSchema),
  method: optional(disposalMethodSchema),
  search: optional(pipe(string(), maxLength(120))),
  /**
   * Both bounds filter `requestedAt`, a `timestamp` — not a `date` column — so a
   * bare `YYYY-MM-DD` has to be widened to a day at each end. `from` is the first
   * instant of the day and `to` the last, both in UTC, which is the only zone the
   * stored values are compared in consistently.
   */
  from: optional(isoDateSchema),
  to: optional(isoDateSchema),
  limit: optional(pipe(number(), integer(), minValue(1), maxValue(MAX_LIMIT))),
  /**
   * Off by default, and the absence of the key is the signal: a
   * `pending_approval` request legitimately has **no** history rows yet (raising
   * one writes none), so an empty array cannot mean "no decisions recorded" on
   * its own, and a client that needs to tell the two apart must check whether it
   * asked.
   */
  withHistory: optional(boolean()),
});

type ListDisposalsInput = InferOutput<typeof listDisposalsInput>;

/** Every predicate for both the page and the aggregate, in one place. */
const disposalConditions = (input: ListDisposalsInput): (SQL | undefined)[] => {
  const search = input.search?.trim();

  return [
    input.itemId === undefined
      ? undefined
      : eq(inventoryDisposal.itemId, input.itemId),
    input.status === undefined
      ? undefined
      : eq(inventoryDisposal.status, input.status),
    input.method === undefined
      ? undefined
      : eq(inventoryDisposal.method, input.method),
    input.from === undefined
      ? undefined
      : gte(
          inventoryDisposal.requestedAt,
          new Date(`${input.from}T00:00:00.000Z`)
        ),
    input.to === undefined
      ? undefined
      : lte(
          inventoryDisposal.requestedAt,
          new Date(`${input.to}T23:59:59.999Z`)
        ),
    // Free text across the certificate's own prose *and* the thing it is about.
    // A storekeeper remembers "the projector" or "INV-00042", not the word the
    // requester happened to type into `reason`.
    search
      ? or(
          ilike(inventoryDisposal.reason, likePattern(search)),
          ilike(inventoryDisposal.notes, likePattern(search)),
          ilike(inventoryItem.name, likePattern(search)),
          ilike(inventoryItem.sku, likePattern(search))
        )
      : undefined,
  ];
};

const disposalSelect = {
  id: inventoryDisposal.id,
  itemId: inventoryDisposal.itemId,
  itemName: inventoryItem.name,
  itemSku: inventoryItem.sku,
  qty: inventoryDisposal.qty,
  reason: inventoryDisposal.reason,
  method: inventoryDisposal.method,
  status: inventoryDisposal.status,
  notes: inventoryDisposal.notes,
  estimatedValue: inventoryDisposal.estimatedValue,
  requestedByStaffId: inventoryDisposal.requestedByStaffId,
  requestedAt: inventoryDisposal.requestedAt,
  approvedByStaffId: inventoryDisposal.approvedByStaffId,
  approvedAt: inventoryDisposal.approvedAt,
  finalizedByStaffId: inventoryDisposal.finalizedByStaffId,
  finalizedAt: inventoryDisposal.finalizedAt,
  cancelledByStaffId: inventoryDisposal.cancelledByStaffId,
  cancelledAt: inventoryDisposal.cancelledAt,
  cancellationReason: inventoryDisposal.cancellationReason,

  requestedByName: requestedByStaff.name,
  approvedByName: approvedByStaff.name,
  finalizedByName: finalizedByStaff.name,
  cancelledByName: cancelledByStaff.name,
} as const;

const disposalRows = (db: Database) =>
  db
    .select(disposalSelect)
    .from(inventoryDisposal)
    // Inner: `itemId` is a foreign key with `onDelete: "restrict"`, so there is
    // no such thing as a disposal without an item — and the item's name and SKU
    // are on the certificate the user is looking for.
    .innerJoin(inventoryItem, eq(inventoryDisposal.itemId, inventoryItem.id))
    .leftJoin(
      requestedByStaff,
      eq(inventoryDisposal.requestedByStaffId, requestedByStaff.id)
    )
    .leftJoin(
      approvedByStaff,
      eq(inventoryDisposal.approvedByStaffId, approvedByStaff.id)
    )
    .leftJoin(
      finalizedByStaff,
      eq(inventoryDisposal.finalizedByStaffId, finalizedByStaff.id)
    )
    .leftJoin(
      cancelledByStaff,
      eq(inventoryDisposal.cancelledByStaffId, cancelledByStaff.id)
    );

type DisposalRow = Awaited<ReturnType<typeof disposalRows>>[number];

/**
 * The page's units, in ONE statement for the whole page.
 *
 * `pageIds` is the only thing that ties this to the page above, which is why it
 * cannot be issued until that query has run — and why the handler is two phases
 * rather than one. An empty page short-circuits to `[]` rather than sending
 * `in ()`, which is both faster and one less dialect edge.
 */
const disposalUnitRows = async (
  db: Database,
  pageIds: string[]
): Promise<
  { disposalId: string; id: string; uniqueNo: string; status: string }[]
> => {
  if (pageIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      disposalId: inventoryDisposalUnit.disposalId,
      id: inventoryUnit.id,
      uniqueNo: inventoryUnit.uniqueNo,
      status: inventoryUnit.status,
    })
    .from(inventoryDisposalUnit)
    .innerJoin(
      inventoryUnit,
      eq(inventoryDisposalUnit.unitId, inventoryUnit.id)
    )
    .where(inArray(inventoryDisposalUnit.disposalId, pageIds))
    // Oldest first within a certificate, matching the FIFO order the units were
    // chosen in, so the list reads in the order they left the store.
    .orderBy(asc(inventoryUnit.createdAt), asc(inventoryUnit.id));

  return rows;
};

/** The page's status history, in ONE statement for the whole page. */
const disposalHistoryRows = async (
  db: Database,
  pageIds: string[]
): Promise<
  {
    disposalId: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    changedByStaffId: string | null;
    changedByName: string | null;
    changedAt: Date;
  }[]
> => {
  if (pageIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      disposalId: inventoryDisposalStatusHistory.disposalId,
      fromStatus: inventoryDisposalStatusHistory.fromStatus,
      toStatus: inventoryDisposalStatusHistory.toStatus,
      note: inventoryDisposalStatusHistory.note,
      // **The key of the left join, projected as well as the match.**
      //
      // `changed_by_staff_id` is nullable with `onDelete: "set null"`, so a
      // transition written by a colleague who has since left arrives as a non-null
      // id with a null name — and a transition written by an account that never had
      // a staff row (the seeded admin / principal / deputy-principal seats) arrives
      // as a null id with a null name. Without the id on the wire those two are the
      // same value, and the history is the one surface in this feature that cannot
      // tell a departed person from an account that was never on the roll — while
      // every other `*ByStaffId` in the row above projects both and its UI renders
      // the difference with `PartyName`.
      //
      // The two are genuinely different facts and one of them is a lie to state
      // wrongly: a withdrawal signed by a storekeeper who has since left *happened*,
      // and a blank cell or the word "unknown" next to it suggests the school
      // cannot say who did it. This column is what lets the client say it.
      changedByStaffId: inventoryDisposalStatusHistory.changedByStaffId,
      changedByName: changedByStaff.name,
      changedAt: inventoryDisposalStatusHistory.createdAt,
    })
    .from(inventoryDisposalStatusHistory)
    .leftJoin(
      changedByStaff,
      eq(inventoryDisposalStatusHistory.changedByStaffId, changedByStaff.id)
    )
    .where(inArray(inventoryDisposalStatusHistory.disposalId, pageIds))
    // Newest first, and the grouping below *pushes* in query order, so each
    // certificate's history arrives already reversed without a second sort per
    // row.
    .orderBy(
      desc(inventoryDisposalStatusHistory.createdAt),
      desc(inventoryDisposalStatusHistory.id)
    );

  return rows;
};

/**
 * The wire shape of one pinned device, as the UI renders it.
 *
 * Exported because the router's inferred return type runs through this name, and
 * an unexported interface a composed router cannot name is a `TS4023` at the
 * composition site. Same reason `inventory-database.ts` exports
 * `InventoryItemView`.
 */
export interface DisposalUnitSummary {
  id: string;
  uniqueNo: string;
  status: string;
}

/**
 * One line of a certificate's history, newest first within its disposal.
 * Exported for the same `TS4023` reason as `DisposalUnitSummary`.
 */
export interface DisposalHistoryEntry {
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  /**
   * The `staff` row this transition was attributed to, or null for a leadership
   * account that has none. Present **so that a null `changedByName` can be read**.
   *
   * The two nullable columns are a two-state code, not one: `(null, null)` is "the
   * account had no staff row" and `(id, null)` is "the person was real and has
   * since been dealt with". Shipping the name alone collapsed them, which is why
   * this entry used to have a `changedByName` and no way to say which of the two a
   * null meant. Both are projected, in that order, by `disposalHistoryRows`.
   */
  changedByStaffId: string | null;
  /** Null whenever `changedByStaffId` is set and the staff row is gone. */
  changedByName: string | null;
  changedAt: string;
}

/**
 * `history: null` is the "was not asked for" signal, kept out of the row itself
 * by the conditional spread below. A `[]` therefore always means "asked, and
 * there are no transitions recorded" — which is the truth for a request nobody has
 * signed off yet.
 */
const toDisposalRow = (
  row: DisposalRow,
  units: DisposalUnitSummary[],
  history: DisposalHistoryEntry[] | null
) => ({
  id: row.id,
  itemId: row.itemId,
  itemName: row.itemName,
  itemSku: row.itemSku,
  qty: row.qty,
  reason: row.reason,
  method: row.method,
  // The stored key *and* the wording to show, from the same constants the
  // database CHECK is written against, so a filter and the badge beside it can
  // never name the same state differently.
  methodLabel: disposalMethodLabel(row.method),
  status: row.status,
  statusLabel: disposalStatusLabel(row.status),
  notes: row.notes,
  estimatedValue: row.estimatedValue,
  requestedByStaffId: row.requestedByStaffId,
  requestedByName: row.requestedByName,
  requestedAt: iso(row.requestedAt),
  approvedByStaffId: row.approvedByStaffId,
  approvedByName: row.approvedByName,
  approvedAt: isoOrNull(row.approvedAt),
  finalizedByStaffId: row.finalizedByStaffId,
  finalizedByName: row.finalizedByName,
  finalizedAt: isoOrNull(row.finalizedAt),
  cancelledByStaffId: row.cancelledByStaffId,
  cancelledByName: row.cancelledByName,
  cancelledAt: isoOrNull(row.cancelledAt),
  cancellationReason: row.cancellationReason,
  // The one boolean the list needs, so the "Approve" / "Finalise" / "Cancel"
  // controls are driven by the server's own state rather than by a comparison the
  // client has to re-derive and can get wrong.
  pendingApproval: row.status === "pending_approval",
  // Always an array, even when a bulk item has no tagged devices: an empty list
  // means "this item is counted in bulk", which is different from a missing key.
  units,
  ...(history === null ? {} : { history }),
});

/**
 * **`adminProcedure`, not `requireInventoryPermission("read")`** — a deliberate
 * deviation from the obvious gate, and the reason is written down in two other
 * places in this repo.
 *
 * `packages/api/src/index.ts` warns on `requireInventoryPermission` that the
 * `read` action "is reachable by the `teacher` role, so any inventory read
 * procedure built on it MUST scope its own result set to the caller", and the
 * `teacher` role's own statement in `packages/auth/src/permissions.ts` says the
 * same thing harder: "The school-wide ledger, stock movements, **write-offs** and
 * custody transfers stay behind `adminProcedure`."
 *
 * This list is exactly that. A disposal certificate carries what was written
 * off, why, at what estimated value, who signed it and, for a cancelled one, the
 * reason it was dropped — a teacher's `inventory: ["read"]` is a grant to see the
 * items they personally hold, and `listMyItems` is where that grant is honoured by
 * narrowing the rows to `managerStaffId = me or custodianStaffId = me`. A
 * teacher can reach no items through this list at all, so narrowing it to the
 * caller would mean permanently showing them an empty page, and widening it would
 * hand every teacher the school's whole register of write-offs.
 *
 * For the three leadership seats the two gates are identical in effect —
 * `requirePermission` short-circuits all of them — so nothing that was meant to
 * reach this page is refused by the change.
 */
export const listDisposals = adminProcedure
  .input(listDisposalsInput)
  .handler(async ({ input, context }) => {
    /**
     * A soft-deleted item is a non-existent item here, matching `getItem` and
     * `getLockedItem`. Asking for the certificates of a deleted item returns
     * `NOT_FOUND` rather than a page of write-offs against a record the storebook
     * no longer shows — the item row is still there (disposals `restrict`), which
     * is exactly why this check has to be explicit rather than left to a join.
     */
    if (input.itemId !== undefined) {
      const [item] = await context.db
        .select({ id: inventoryItem.id, deletedAt: inventoryItem.deletedAt })
        .from(inventoryItem)
        .where(eq(inventoryItem.id, input.itemId))
        .limit(1);

      if (!item || item.deletedAt !== null) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }
    }

    const where = and(...disposalConditions(input));
    const limit = input.limit ?? DEFAULT_LIMIT;

    const [rows, [aggregate]] = await Promise.all([
      disposalRows(context.db)
        .where(where)
        // `pending_approval` first, then newest first. The `case` is a literal in
        // SQL for the same reason `itemStatusExpression` is: the ordering and the
        // buttons the UI shows must not disagree, and there is only one place
        // this is written.
        .orderBy(
          sql`case when ${inventoryDisposal.status} = 'pending_approval' then 0 else 1 end`,
          desc(inventoryDisposal.requestedAt),
          desc(inventoryDisposal.id)
        )
        .limit(limit),
      // `total` and all four header counts from one round trip, over the filtered
      // set and not the page. The six terminal statuses are one bucket because
      // the header asks "how many have actually left the books", not which way
      // each of them left. The four staff aliases are absent from this chain
      // because the `where` above names only `inventory_disposal` and
      // `inventory_item` columns, so they cannot change the result.
      context.db
        .select({
          total: count(),
          pendingApproval:
            sql<number>`coalesce(sum(case when ${inventoryDisposal.status} = 'pending_approval' then 1 else 0 end), 0)`.mapWith(
              Number
            ),
          approved:
            sql<number>`coalesce(sum(case when ${inventoryDisposal.status} = 'approved' then 1 else 0 end), 0)`.mapWith(
              Number
            ),
          finalized:
            sql<number>`coalesce(sum(case when ${inArray(inventoryDisposal.status, [...DISPOSAL_FINAL_STATUSES])} then 1 else 0 end), 0)`.mapWith(
              Number
            ),
          cancelled:
            sql<number>`coalesce(sum(case when ${inventoryDisposal.status} = 'cancelled' then 1 else 0 end), 0)`.mapWith(
              Number
            ),
        })
        .from(inventoryDisposal)
        .innerJoin(
          inventoryItem,
          eq(inventoryDisposal.itemId, inventoryItem.id)
        )
        .where(where),
    ]);

    const pageIds = rows.map((row) => row.id);

    /**
     * Phase two, and the only reason it is a second phase: the page's ids are not
     * known until the first query has run. Two statements, both `where id IN (…)`
     * across the whole page, grouped here rather than queried per row.
     */
    const [unitRows, historyRows] = await Promise.all([
      disposalUnitRows(context.db, pageIds),
      input.withHistory ? disposalHistoryRows(context.db, pageIds) : [],
    ]);

    const unitsByDisposal = new Map<string, DisposalUnitSummary[]>();
    for (const row of unitRows) {
      const bucket = unitsByDisposal.get(row.disposalId);
      const unit = { id: row.id, uniqueNo: row.uniqueNo, status: row.status };
      if (bucket) {
        bucket.push(unit);
      } else {
        unitsByDisposal.set(row.disposalId, [unit]);
      }
    }

    const historyByDisposal = new Map<string, DisposalHistoryEntry[]>();
    for (const row of historyRows) {
      const bucket = historyByDisposal.get(row.disposalId);
      const entry = {
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        note: row.note,
        // Both halves, and they are read together on purpose: the name is the
        // person, the id is the *proof* the transition was attributed to somebody
        // who existed. `null` name with a non-null id is a `set null` staff column
        // — see the note on the aliases — and `null` for both is a leadership
        // account, which is a legitimate actor rather than a missing one.
        changedByStaffId: row.changedByStaffId,
        changedByName: row.changedByName,
        changedAt: iso(row.changedAt),
      };
      if (bucket) {
        bucket.push(entry);
      } else {
        historyByDisposal.set(row.disposalId, [entry]);
      }
    }

    return {
      disposals: rows.map((row) =>
        toDisposalRow(
          row,
          unitsByDisposal.get(row.id) ?? [],
          input.withHistory ? (historyByDisposal.get(row.id) ?? []) : null
        )
      ),
      total: aggregate?.total ?? 0,
      summary: {
        pendingApproval: aggregate?.pendingApproval ?? 0,
        approved: aggregate?.approved ?? 0,
        finalized: aggregate?.finalized ?? 0,
        cancelled: aggregate?.cancelled ?? 0,
      },
    };
  });
