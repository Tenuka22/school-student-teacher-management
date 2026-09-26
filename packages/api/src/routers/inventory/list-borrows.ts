/**
 * The borrow ledger: every check-out and every check-in, filterable, with the
 * units attached.
 *
 * Three decisions in here are the reason this is not a plain `select *`.
 *
 * **Overdue is computed in SQL, on every row.** The source app computed it in
 * TypeScript after fetching, which works until the day someone adds a filter:
 * the filter said "late" and the badge said "on time" because two
 * implementations of one idea had drifted. Here the expression below *is* the
 * definition — the `overdueOnly` filter and the `isOverdue` / `overdueDays`
 * columns are the same SQL, so they cannot disagree — and it is evaluated on
 * every row rather than only under the filter, because a storekeeper scanning
 * the reverse-chronological feed needs to see which of those rows is late
 * without having to ask for a different list.
 *
 * **Units come back in one query for the whole page, released ones included.**
 * Per-row reads would make this an N+1 over a 200-row page, and filtering the
 * join rows to `released_at is null` would throw away the reason the row
 * exists: "this laptop came back in Fair condition on 3 March" is a fact about
 * the past, and a borrow record that could only describe the present would not
 * be an audit trail. So a returned loan still carries its units, each with the
 * condition it came back in and the moment it was released.
 *
 * **Borrowers are resolved in two batched queries, not one per row.** See the
 * note on the resolver calls below — it is the same rule as the units query
 * above, and the reason it is stated twice is that this is the procedure where
 * the temptation is strongest: a list view is a loop, and a loop that calls
 * `getBorrower` fifty times is the N+1 this file used to be one join away from.
 */
import { ORPCError } from "@orpc/server";
import { inventoryBorrowStatusSchema } from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryBorrow,
  inventoryBorrowUnit,
  inventoryItem,
  inventoryItemIdSchema,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import {
  student,
  studentIdSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import {
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
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

import { adminProcedure } from "../../index";
import { normalizeText, todayIsoDate } from "./inventory-calculations";
import {
  iso,
  isoOrNull,
  resolveBorrowerStaffBatch,
  resolveBorrowerStudentBatch,
} from "./inventory-database";
import type { InventoryBorrower } from "./inventory-database";

/**
 * `staff` joined once onto the same `inventory_borrow` row: for the storekeeper
 * who handed it over. A left join, and necessarily so — `borrowedByStaffId` is
 * `set null`, so a departed storekeeper leaves the row and must not take the
 * whole list with it.
 *
 * There is deliberately **no second** `staff` join for the borrower. The column
 * this file used to join on is `borrowerStaffId`, and it is now one of two
 * mutually exclusive pointers, so a join on it can only ever name half the
 * people in this table: a loan to a student would render with a null holder on
 * a page whose entire job is to say who is holding what. The borrower's name is
 * batched in instead, which is also the only version of this read that stays a
 * constant number of queries at fifty rows.
 */
const issuedByStaff = alias(staff, "issued_by_staff");

/**
 * The one definition of "this loan is late", reused as a filter, as a rendered
 * column and as the leading sort key.
 *
 * `expected_return_date` is `text` holding canonical `YYYY-MM-DD`, so a lexical
 * comparison against today's ISO date is a date comparison — the same
 * assumption the `inventory_borrow_expected_return_date_iso` CHECK exists to
 * guarantee. The literal `'borrowed'` is written inline rather than as a bound
 * parameter for the same reason `itemStatusExpression` does: it is a constant
 * from `BORROW_STATUSES`, and the `(status, expected_return_date)` index
 * answers the predicate without a plan change.
 *
 * A function rather than a module constant, for one reason: the "today" it
 * compares against has to be the day the *request* arrives on. A constant
 * built at import time would be a module-load date that silently went stale the
 * first night the server stayed up past midnight — which for a feature whose
 * whole purpose is noticing that a date has passed is the one bug that must not
 * exist.
 */
const isOverdueExpression = (today: string): SQL<boolean> => sql<boolean>`(
  ${inventoryBorrow.status} = 'borrowed'
  and ${inventoryBorrow.expectedReturnDate} < ${today}
)`;

/**
 * Whole days past the due date, or null when the loan is not late.
 *
 * `current_date - text::date` is Postgres's own day difference, so the arithmetic
 * stays in one timezone-free calendar rather than being recomputed in JS from a
 * parsed timestamp. Null is meaningful and not a placeholder: "not overdue" and
 * "overdue by zero days" are different answers, and only one of them is a row
 * somebody has to act on.
 */
const overdueDaysExpression = (today: string): SQL<number | null> =>
  sql<number | null>`case
  when ${isOverdueExpression(today)} then (current_date - ${inventoryBorrow.expectedReturnDate}::date)
  else null
end`;

/**
 * `\` `%` `_` escaped, so a search for a tag like `LT_0042` is a literal
 * search and not a single-character wildcard that matches every projector in
 * the school. The escape character is doubled first, so a backslash typed by
 * the user does not turn the following `%` back into a live wildcard.
 */
const escapeLikePattern = (value: string): string =>
  value.replaceAll(/[\\%_]/gu, (character) => `\\${character}`);

/**
 * A student's name as the one string a search box can be given.
 *
 * Concatenated in SQL rather than assembled in the handler because the filter
 * has to be applied **before** the page is taken — a post-filter over the
 * returned rows would search fifty of nine hundred loans and call the answer
 * the whole list. Two `ILIKE`s on `first_name` and `last_name` separately would
 * not do: a clerk types the name as it is written on the roll.
 *
 * This is a **search predicate and nothing else.** The borrower's name in the
 * response comes from the batched resolvers below, never from this expression,
 * so there is one place a person's name is *resolved* and one place their name
 * is *matched*, and the second cannot be mistaken for the first. The
 * `student` left join exists for this term alone.
 */
const studentSearchName = sql<string>`${student.firstName} || ' ' || ${student.lastName}`;

/**
 * **`adminProcedure`, not `requireInventoryPermission("read")`** — a deliberate
 * deviation from the obvious gate, and the reason is written down in two other
 * places in this repo.
 *
 * The gate changed because `requireInventoryPermission("read")` is
 * teacher-reachable: the `teacher` role holds `inventory: ["read"]`
 * (`packages/auth/src/permissions.ts`), and `requirePermission` in
 * `packages/api/src/index.ts` consults that statement for anybody outside
 * `ADMIN_ROLES`. A teacher can therefore pass that gate, and this is every loan
 * in the school: each borrower's name, who issued it, what was taken, the date
 * it was due back and — because overdue is computed on every row rather than
 * only under the filter — precisely **whose loan is late and by how many days**.
 * A teacher would learn the entire staff's borrowing habits and which of their
 * colleagues is behind on a return, which is nobody's business but the store's.
 *
 * It cannot be narrowed to the caller here, and the reason is that a teacher is
 * the one party this ledger is most careful *not* to show: the borrower columns
 * are the people who would have to be matched, and "my own loans" is a
 * different screen for a different question. `listMyItems` is the teacher's
 * read. What this list now satisfies is the `teacher` statement's own contract,
 * which names the school-wide ledger and movement lists as things that grant
 * must not reach.
 */
const listBorrowsInput = object({
  itemId: optional(inventoryItemIdSchema),
  /**
   * Both borrower filters, and they are two filters rather than one union input
   * on purpose: a storekeeper asking "what is out with this person" should not
   * have to know which table that person lives in, and asking for both is a
   * different request rather than a broader one.
   *
   * They are checked against each other in `borrowConditions` below. A borrow
   * has exactly one borrower of exactly one type, so a request naming a staff
   * member *and* a student can only ever match nothing — and "you asked for
   * something impossible" is not the same answer as "there are no results",
   * because one of them sends the clerk to the roll to check they picked the
   * right child and the other sends them to the filter box.
   */
  borrowerStaffId: optional(staffIdSchema),
  borrowerStudentId: optional(studentIdSchema),
  status: optional(inventoryBorrowStatusSchema),
  /** Open loans whose due date has passed. See `isOverdueExpression`. */
  overdueOnly: optional(boolean()),
  /**
   * Free text over the item's name, its SKU, the stated purpose, and the
   * borrower's own name or admission number. The last two are here because half
   * the rows in this table are now student loans, and a register that cannot be
   * searched by the name of the child carrying the laptop is not searchable by
   * the person an anxious parent will ask about.
   */
  search: optional(pipe(string(), maxLength(120))),
  /** Inclusive `borrowed_at` bounds, as ISO `YYYY-MM-DD` strings. */
  from: optional(isoDateSchema),
  to: optional(isoDateSchema),
  limit: optional(pipe(number(), integer(), minValue(1), maxValue(500))),
});

type ListBorrowsInput = InferOutput<typeof listBorrowsInput>;

/**
 * Every filter on this list, folded into one `where` clause, or `undefined` when
 * none were supplied.
 *
 * It is a function rather than inline code in the handler because this is the
 * half of the procedure that has nothing to do with fetching: eight optional
 * inputs, each of which may or may not contribute a term. Kept apart, the
 * handler below reads as what it is — three batched reads and a batched
 * resolve — and the filter set can be read as a list, which is the only way to
 * check that `total` and the page are built from the same one.
 *
 * It is also the only place the two borrower filters meet, which is why the
 * both-supplied refusal lives here: the contradiction is a property of the
 * filters, so it is answered where the filters are, and it is **answered**
 * rather than left to match nothing.
 */
const borrowConditions = (
  input: ListBorrowsInput,
  today: string
): SQL | undefined => {
  // A loan cannot belong to two people, so naming two is a contradiction the
  // caller has to resolve — not a filter that happens to be too narrow.
  if (input.borrowerStaffId && input.borrowerStudentId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Pick either a staff member or a student to filter by — a loan has only one of them",
    });
  }

  const conditions: SQL[] = [];

  if (input.itemId) {
    conditions.push(eq(inventoryBorrow.itemId, input.itemId));
  }

  if (input.borrowerStaffId) {
    conditions.push(eq(inventoryBorrow.borrowerStaffId, input.borrowerStaffId));
  }

  if (input.borrowerStudentId) {
    conditions.push(
      eq(inventoryBorrow.borrowerStudentId, input.borrowerStudentId)
    );
  }

  if (input.status) {
    conditions.push(eq(inventoryBorrow.status, input.status));
  }

  if (input.overdueOnly) {
    // The filter is the same expression the row's own `isOverdue` column is
    // built from, so a row that appears here is a row that renders as overdue.
    conditions.push(isOverdueExpression(today));
  }

  const searchTerm = input.search ? normalizeText(input.search) : "";
  if (searchTerm) {
    const pattern = `%${escapeLikePattern(searchTerm)}%`;
    conditions.push(
      or(
        ilike(inventoryItem.name, pattern),
        ilike(inventoryItem.sku, pattern),
        ilike(inventoryBorrow.purpose, pattern),
        // The student's name as one string, so a search for "Nimali Fernando"
        // matches the person rather than only the half of them that happens to
        // be a substring of it. The admission number is searched on its own
        // because it is the string a front office actually reads out.
        ilike(studentSearchName, pattern),
        ilike(student.admissionNumber, pattern)
      ) as SQL
    );
  }

  if (input.from) {
    conditions.push(
      gte(inventoryBorrow.borrowedAt, new Date(`${input.from}T00:00:00.000Z`))
    );
  }

  if (input.to) {
    conditions.push(
      lte(inventoryBorrow.borrowedAt, new Date(`${input.to}T23:59:59.999Z`))
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
};

export const listBorrows = adminProcedure
  .input(listBorrowsInput)
  .handler(async ({ input, context }) => {
    const today = todayIsoDate();
    const where = borrowConditions(input, today);

    /**
     * Three independent reads, issued as one batch: the soft-delete probe, the
     * `total` for the paginator, and the page itself.
     *
     * `total` is counted before the limit and from the identical `FROM` /
     * `WHERE` as the page — including both joins, because `search` filters on
     * the item's columns and on the student's name and admission number. A count
     * that disagreed with the page's own conditions would show a paginator
     * promising results the query cannot produce.
     *
     * The `student` join is a left join and appears in **both** statements for
     * the one reason stated on `studentSearchName`: it exists to make
     * `search` reach a student's name, and it contributes nothing to the rows
     * the page returns. The borrower's name is batched in the next step rather
     * than read off this join, so the two cannot drift and the query count
     * stays the same whether or not `search` was supplied.
     *
     * The probe rides along beside them and is checked afterwards, because it
     * is a read and blocking the page on it would only make the list slower to
     * arrive. A soft-deleted item is a non-existent item here exactly as it is
     * in `getLockedItem` and `getItem`, so filtering on one is refused with
     * `NOT_FOUND` rather than answered with an empty page that reads as "this
     * item has never been borrowed".
     */
    const [liveItemRows, totalRows, rows] = await Promise.all([
      input.itemId
        ? context.db
            .select({ id: inventoryItem.id })
            .from(inventoryItem)
            .where(
              and(
                eq(inventoryItem.id, input.itemId),
                isNull(inventoryItem.deletedAt)
              )
            )
            .limit(1)
        : undefined,
      context.db
        .select({ value: count() })
        .from(inventoryBorrow)
        .innerJoin(inventoryItem, eq(inventoryBorrow.itemId, inventoryItem.id))
        .leftJoin(student, eq(inventoryBorrow.borrowerStudentId, student.id))
        .where(where),
      context.db
        .select({
          id: inventoryBorrow.id,
          itemId: inventoryBorrow.itemId,
          itemName: inventoryItem.name,
          itemSku: inventoryItem.sku,
          qty: inventoryBorrow.qty,
          // Both pointers, unresolved. Which one is set *is* the borrower's
          // type, so these two nullable columns are the discriminator the row
          // already carries and nothing has to be inferred from a name.
          borrowerStaffId: inventoryBorrow.borrowerStaffId,
          borrowerStudentId: inventoryBorrow.borrowerStudentId,
          purpose: inventoryBorrow.purpose,
          expectedReturnDate: inventoryBorrow.expectedReturnDate,
          approvedBy: inventoryBorrow.approvedBy,
          note: inventoryBorrow.note,
          status: inventoryBorrow.status,
          borrowedByStaffId: inventoryBorrow.borrowedByStaffId,
          issuedByName: issuedByStaff.name,
          borrowedAt: inventoryBorrow.borrowedAt,
          returnedAt: inventoryBorrow.returnedAt,
          returnedByStaffId: inventoryBorrow.returnedByStaffId,
          returnCondition: inventoryBorrow.returnCondition,
          returnNote: inventoryBorrow.returnNote,
          createdAt: inventoryBorrow.createdAt,
          isOverdue: isOverdueExpression(today),
          overdueDays: overdueDaysExpression(today),
        })
        .from(inventoryBorrow)
        .innerJoin(inventoryItem, eq(inventoryBorrow.itemId, inventoryItem.id))
        .leftJoin(student, eq(inventoryBorrow.borrowerStudentId, student.id))
        .leftJoin(
          issuedByStaff,
          eq(inventoryBorrow.borrowedByStaffId, issuedByStaff.id)
        )
        .where(where)
        // An overdue loan is the row a clerk must act on, so it sorts to the top
        // of a list that is otherwise reverse-chronological. Within each group
        // the due date runs ascending, because a loan due this afternoon
        // matters more than one due in June, and everything after that falls
        // back to newest-first.
        .orderBy(
          desc(isOverdueExpression(today)),
          asc(inventoryBorrow.expectedReturnDate),
          desc(inventoryBorrow.borrowedAt),
          desc(inventoryBorrow.id)
        )
        .limit(input.limit ?? 200),
    ]);

    const [liveItem] = liveItemRows ?? [];
    if (input.itemId && !liveItem) {
      throw new ORPCError("NOT_FOUND", { message: "Item not found" });
    }

    const [totalRow] = totalRows;

    const pageIds = rows.map((row) => row.id);

    /**
     * The distinct borrower pointers on the page, split by which table they
     * name. A `Set` because a page is fifty loans to perhaps four people, and
     * fifty of the same id in an `IN` list is a query that asks the same
     * question fifty times.
     */
    const borrowerStaffIds = new Set<string>();
    const borrowerStudentIds = new Set<string>();
    for (const row of rows) {
      if (row.borrowerStaffId) {
        borrowerStaffIds.add(row.borrowerStaffId);
      }
      if (row.borrowerStudentId) {
        borrowerStudentIds.add(row.borrowerStudentId);
      }
    }

    /**
     * Three queries for the whole page: the units, every staff borrower, every
     * student borrower. **This is the N+1 a list view invites and it is banned
     * here** — the version of this file that called `getBorrower` per row was
     * fifty round trips for a page a storekeeper opens to answer "what is late",
     * and it is exactly the shape of code that looks correct in review because
     * it is inside a `map`. A `map` over rows is not a place to talk to the
     * database; it is a place to read from something already fetched.
     *
     * The two resolvers are batched **per type** rather than as one query over
     * a union, and that is not a stylistic choice: `student` and `staff` share
     * no table, so a single statement would have to `UNION` two projections
     * and null the columns that do not apply — a query whose result set is
     * half-empty by construction. Two statements, each one honest about what it
     * is reading, and the count is the same either way.
     *
     * They are issued together with the units query because none of the three
     * depends on another's result: the ids came off the page, which arrived in
     * the previous batch. Three round trips' worth of latency in one.
     */
    const [unitRows, staffBorrowers, studentBorrowers] = await Promise.all([
      /**
       * No `pageIds.length` guard, deliberately. `inArray` renders an empty
       * value list as `false` rather than as invalid SQL, so an empty page
       * costs one round trip that returns nothing and the shape below stays
       * exactly one type — a conditional here would make `unitRows` a union of
       * `never[]` and the row array, and every `Map` built from it would have to
       * be written against that union. The constant query count is worth more
       * here than saving one query on the one request that has no rows.
       */
      context.db
        .select({
          borrowId: inventoryBorrowUnit.borrowId,
          id: inventoryUnit.id,
          uniqueNo: inventoryUnit.uniqueNo,
          condition: inventoryUnit.condition,
          location: inventoryUnit.location,
          releasedAt: inventoryBorrowUnit.releasedAt,
        })
        .from(inventoryBorrowUnit)
        .innerJoin(
          inventoryUnit,
          eq(inventoryBorrowUnit.unitId, inventoryUnit.id)
        )
        .where(inArray(inventoryBorrowUnit.borrowId, pageIds))
        .orderBy(
          asc(inventoryBorrowUnit.borrowId),
          asc(inventoryUnit.uniqueNo)
        ),
      resolveBorrowerStaffBatch(context.db, [...borrowerStaffIds]),
      resolveBorrowerStudentBatch(context.db, [...borrowerStudentIds]),
    ]);

    const unitsByBorrow = new Map<string, typeof unitRows>();
    for (const unitRow of unitRows) {
      const existing = unitsByBorrow.get(unitRow.borrowId);
      if (existing) {
        existing.push(unitRow);
      } else {
        unitsByBorrow.set(unitRow.borrowId, [unitRow]);
      }
    }

    /**
     * The one place a row's `borrower` is built, and the only place that has to
     * know the two columns are exclusive.
     *
     * A miss here is unreachable while both borrower foreign keys are
     * `restrict` — a person who is deleted while a loan names them is refused
     * by the database, so a pointer cannot dangle. That is precisely why this
     * throws rather than falling back to the raw id as this procedure used to:
     * the fallback would exist only for a state the schema forbids, and it would
     * render it as a row with a blank-looking holder instead of as a register
     * that has stopped making sense. One bad row fails the page loudly, which is
     * a better outcome than 199 correct rows and one lie.
     */
    const borrowerOf = (row: (typeof rows)[number]): InventoryBorrower => {
      let borrower: InventoryBorrower | undefined;

      if (row.borrowerStaffId) {
        borrower = staffBorrowers.get(row.borrowerStaffId);
      }

      if (!borrower && row.borrowerStudentId) {
        borrower = studentBorrowers.get(row.borrowerStudentId);
      }

      if (!borrower) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: `Loan ${row.id} names a borrower who is not in the register`,
        });
      }

      return borrower;
    };

    return {
      borrows: rows.map((row) => ({
        id: row.id,
        itemId: row.itemId,
        itemName: row.itemName,
        itemSku: row.itemSku,
        qty: row.qty,
        /**
         * One shape for both kinds of borrower, in place of the old
         * `borrowerStaffId` / `borrowerName` pair — a pair that could only
         * ever be right for half the rows in this table. A client rendering
         * this list branches on `borrower.type` and gets a name, a reference
         * and a class for each row, from one field.
         */
        borrower: borrowerOf(row),
        purpose: row.purpose,
        expectedReturnDate: row.expectedReturnDate,
        approvedBy: row.approvedBy,
        note: row.note,
        status: row.status,
        borrowedByStaffId: row.borrowedByStaffId,
        issuedByName: row.issuedByName,
        borrowedAt: iso(row.borrowedAt),
        returnedAt: isoOrNull(row.returnedAt),
        returnedByStaffId: row.returnedByStaffId,
        returnCondition: row.returnCondition,
        returnNote: row.returnNote,
        createdAt: iso(row.createdAt),
        isOverdue: row.isOverdue,
        overdueDays: row.overdueDays,
        // A bulk item has no tags at all, so this is legitimately empty — which
        // is different from a tagged item whose units went missing, and is the
        // only difference between the two as far as this list can tell.
        units: (unitsByBorrow.get(row.id) ?? []).map((unitRow) => ({
          id: unitRow.id,
          uniqueNo: unitRow.uniqueNo,
          condition: unitRow.condition,
          location: unitRow.location,
          releasedAt: isoOrNull(unitRow.releasedAt),
        })),
      })),
      total: totalRow?.value ?? 0,
    };
  });
