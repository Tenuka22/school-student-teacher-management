/**
 * The entity audit trail, read: *"what did this row look like before and after
 * it was changed?"*
 *
 * This is the sibling of the counter ledger, not its subset. `inventoryTransaction`
 * records what happened to the two counters; this records what happened to every
 * other field of every inventory entity — the renamed category, the corrected
 * `expectedReturnDate`, the value written off in March. The source app's
 * `item_value_history` table was dropped in the port and its contents live here,
 * as a `before` / `after` pair with `action = "item.update"` (see the note on
 * `inventoryTransaction` in the schema).
 *
 * Because one table serves every entity, `entityType` and `entityId` are the
 * primary read: the composite `inventory_audit_log_entity_idx (entity_type,
 * entity_id)` exists to answer "the history of *this one thing*" without
 * scanning a log that only ever grows. They are supplied together for that
 * reason — a bare `entityType` is a low-cardinality filter that the index's
 * leading column can answer but cannot narrow to a row's history, and a bare
 * `entityId` matches an id that is unique within one table and meaningless
 * across ten, so it can return several unrelated entities at once.
 */
import { inventoryAuditLog } from "@school-student-teacher-management/db/schema/inventory";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import {
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
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
import { iso } from "./inventory-database";

/** Matches the ledger read, so the two history screens paginate identically. */
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

/**
 * One `before` / `after` blob, normalised for the wire.
 *
 * `jsonb` has no date, timestamp or binary type, so the driver hands back JSON
 * primitives, arrays and plain objects — a date a writer put in `before` is a
 * **string**, and it stays one. Parsing it here would attach a timezone to a
 * value the store recorded without one, and which fields are dates is a
 * property of the entity being audited rather than of this table; the UI is the
 * layer that knows. The record is re-created rather than passed through so that
 * a payload which is not a record (an array, a bare string — jsonb stores both
 * happily) reaches the client as null rather than as something the diff view
 * will try to spread.
 */
const jsonRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return { ...(value as Record<string, unknown>) };
};

const auditSelection = {
  id: inventoryAuditLog.id,
  action: inventoryAuditLog.action,
  entityType: inventoryAuditLog.entityType,
  entityId: inventoryAuditLog.entityId,
  before: inventoryAuditLog.before,
  after: inventoryAuditLog.after,
  /** The name as it stood when the row was written; see the column's comment. */
  recordedActorName: inventoryAuditLog.actorName,
  actorStaffId: inventoryAuditLog.actorStaffId,
  createdAt: inventoryAuditLog.createdAt,
  /** The live name, null once the staff row is gone. */
  joinedActorName: staff.name,
} as const;

/**
 * **`adminProcedure`, not `requireInventoryPermission("read")`** — a deliberate
 * deviation from the obvious gate, and the reason is written down in two other
 * places in this repo.
 *
 * The gate changed because `requireInventoryPermission("read")` is
 * teacher-reachable: the `teacher` role holds `inventory: ["read"]`
 * (`packages/auth/src/permissions.ts`), and `requirePermission` in
 * `packages/api/src/index.ts` consults that statement for anybody outside
 * `ADMIN_ROLES`. A teacher can therefore pass that gate, and this is the change
 * log for **every** inventory entity — the whole `before` / `after` pair for
 * each field of each row, across items, units, borrows, issues, disposals,
 * categories and custody, with the name of whoever made the change. `actorName`
 * is `notNull` by design precisely so the log survives a departure, so a
 * teacher's read of it would be a permanent, attributed record of every internal
 * change anybody in the school has made.
 *
 * `entityId` alone is the worst of it: it is unique within one table and
 * meaningless across ten, so an unfiltered call — or one that guesses — is the
 * entire log. The `before` / `after` blobs are the one place in this module where
 * a value nobody was meant to publish (a valuation, a corrected name, a revoked
 * figure) is written down verbatim, which is what makes this the most sensitive
 * read in the feature and the least suitable for a `read` grant. What it now
 * satisfies is the `teacher` statement's own contract, which names the
 * school-wide register and ledger as things that grant must not reach.
 */
export const listAuditLogs = adminProcedure
  .input(
    object({
      entityType: optional(pipe(string(), maxLength(60))),
      entityId: optional(pipe(string(), maxLength(64))),
      actorStaffId: optional(staffIdSchema),
      /**
       * Free text, deliberately. On this table `action` is a CRUD verb —
       * `"item.update"`, `"custody.transfer"`, `"category.create"` — and not one
       * of the counter-ledger actions. The schema says so outright: reusing
       * `inventoryActionSchema` here would be a category error, because
       * `INVENTORY_TRANSACTION_ACTIONS` enumerates movements of the two
       * counters and nothing else. Adding a closed set here would mean a
       * migration every time an entity is audited for a new kind of change, and
       * would refuse a legitimate row that used a verb the set did not list.
       * Bounded length instead of a picklist: it is a filter, not a contract
       * about what callers may write.
       */
      action: optional(pipe(string(), maxLength(60))),
      from: optional(isoDateSchema),
      to: optional(isoDateSchema),
      limit: optional(
        pipe(number(), integer(), minValue(1), maxValue(MAX_LIMIT))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;

    // Half-open UTC day bounds, for the same reason as the ledger read: the
    // column is an instant and the input is a bare date, so the upper bound is
    // midnight on the following day rather than `T23:59:59Z`, which would drop
    // the last second of the day the user asked for.
    const conditions: (SQL | undefined)[] = [
      input.entityType
        ? eq(inventoryAuditLog.entityType, input.entityType)
        : undefined,
      input.entityId
        ? eq(inventoryAuditLog.entityId, input.entityId)
        : undefined,
      input.actorStaffId
        ? eq(inventoryAuditLog.actorStaffId, input.actorStaffId)
        : undefined,
      input.action ? eq(inventoryAuditLog.action, input.action) : undefined,
      input.from
        ? gte(inventoryAuditLog.createdAt, new Date(`${input.from}T00:00:00Z`))
        : undefined,
      input.to
        ? lt(
            inventoryAuditLog.createdAt,
            new Date(`${addDaysIsoDate(1, input.to)}T00:00:00Z`)
          )
        : undefined,
    ];

    const where = and(...conditions);

    // `id` breaks `createdAt` ties. Two changes written in one transaction
    // share a `defaultNow()` timestamp, and an unstable order between them
    // pages the same history differently on every reload — which for a diff view
    // means the "after" of one row can appear before the "before" of the next.
    const orderBy = [
      desc(inventoryAuditLog.createdAt),
      desc(inventoryAuditLog.id),
    ];

    // Every predicate names only `inventoryAuditLog` columns, so unlike the
    // counter ledger the count needs no join at all — which is why the two reads
    // can be batched here without a second copy of a join chain to keep in step.
    const [rows, countRows] = await Promise.all([
      context.db
        .select(auditSelection)
        .from(inventoryAuditLog)
        .leftJoin(staff, eq(inventoryAuditLog.actorStaffId, staff.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit),
      context.db
        .select({ value: count() })
        .from(inventoryAuditLog)
        .where(where),
    ]);

    const [totalRow] = countRows;

    return {
      auditLogs: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: jsonRecord(row.before),
        after: jsonRecord(row.after),
        actorStaffId: row.actorStaffId,
        /**
         * The live staff name when it exists, and the row's own `actorName`
         * column when it does not.
         *
         * That column is `notNull` precisely so the log survives the departure
         * of the person who wrote it: `actor_staff_id` is `set null` by design, so
         * a deletion anonymises the pointer — and without the denormalised name
         * every row that teacher ever touched would answer the only question
         * this table exists for with "somebody who no longer works here". It is
         * `notNull` rather than nullable because Postgres evaluates CHECK
         * constraints during the `UPDATE` a `set null` performs, so a single
         * name-less row would wedge every later `delete from staff`.
         */
        actorName: row.joinedActorName ?? row.recordedActorName,
        createdAt: iso(row.createdAt),
      })),
      total: totalRow?.value ?? 0,
    };
  });
