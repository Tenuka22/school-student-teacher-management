/**
 * The database half of the inventory service layer: every read, every guard and
 * every ledger write that more than one procedure needs, in one place.
 *
 * This module is a shared helper, not a router. Nothing here is an oRPC
 * procedure, nothing here takes request input, and nothing here decides who may
 * call it — the procedures in this folder own authorization and input schemas.
 * What lives here is the part where two procedures would otherwise write the
 * same guard and eventually disagree about it.
 *
 * Every helper takes an `Executor` rather than a `Database` so it can run
 * inside a caller's `db.transaction(...)`. That is not a convenience: several
 * of these helpers are only correct under the transaction's locks, and
 * `getLockedItem`'s `FOR UPDATE` is worthless if it is taken on one connection
 * and the write it guards happens on another.
 */
import { ORPCError } from "@orpc/server";
import type { InventoryAction } from "@school-student-teacher-management/db/constants/inventory";
import { normalizeInventoryKey } from "@school-student-teacher-management/db/constants/inventory";
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { user } from "@school-student-teacher-management/db/schema/auth";
import {
  inventoryAuditLog,
  inventoryBorrowUnit,
  inventoryCategory,
  inventoryDisposal,
  inventoryDisposalUnit,
  inventoryIssueUnit,
  inventoryItem,
  inventoryTransaction,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import {
  student,
  studentClassAssignment,
} from "@school-student-teacher-management/db/schema/marking";
import {
  academicYear,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Context } from "../../context";
import {
  calculateAvailableQuantity,
  calculateItemStatus,
} from "./inventory-calculations";
import type {
  InventoryCounters,
  InventoryItemStatus,
} from "./inventory-calculations";

type Database = Context["db"];

/**
 * A `Database` or a `db.transaction(...)` callback's transaction — the two are
 * the same interface for every query this module issues. Exported because the
 * procedures pass it straight through to their own helpers.
 */
export type Executor =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];

// ─── Row shapes ─────────────────────────────────────────────────────────────

/** One `inventory_item` row exactly as the driver returns it. */
export type InventoryItemRow = typeof inventoryItem.$inferSelect;
export type InventoryUnitRow = typeof inventoryUnit.$inferSelect;

/** The two counters `inventoryItem` carries, and nothing else. */
export type InventoryCountersRow = Pick<
  InventoryItemRow,
  "qty" | "borrowedQty"
>;

/**
 * The counter pair of any row that has the two columns on it, so a caller can
 * hand a full `inventory_item` row to a guard that only cares about the
 * counters. Deliberately total: there is no "no counters supplied" case, and a
 * defaulting overload would let a caller pass a partial row and read the
 * resulting zeros as fact.
 */
export const countersOf = (row: InventoryCountersRow): InventoryCounters => ({
  qty: row.qty,
  borrowedQty: row.borrowedQty,
});

/**
 * `staff` joined twice onto the same `inventory_item` row.
 *
 * Both staff aliases must be `left` joins and not `inner` joins: an item sitting
 * unassigned in the store has a null `managerStaffId` and a null
 * `custodianStaffId`, and an inner join would drop exactly the rows a new store
 * is full of.
 *
 * The two aliases are distinct tables rather than one table joined twice
 * because `manager` and `custodian` answer different questions — see the
 * `inventoryItem` schema comment — and a single join could not label which of
 * the two it had matched.
 */
export const managerStaff = alias(staff, "manager_staff");
export const custodianStaff = alias(staff, "custodian_staff");

/**
 * Every `inventory_item` column, plus everything the web app needs that lives
 * on another table, so that one selection and one join chain serve both the
 * list and the detail route.
 *
 * The two unit counts are correlated subqueries rather than a joined `count`,
 * because joining the units table multiplies the item row out and would need a
 * `groupBy` on every list query in the app to undo. The literal `'removed'` is
 * `UNIT_STATUSES[4]` written out because a `sql` fragment cannot interpolate a
 * bound parameter in a subquery predicate and still use the status index.
 */
export const itemViewSelection = {
  id: inventoryItem.id,
  sku: inventoryItem.sku,
  categoryId: inventoryItem.categoryId,
  name: inventoryItem.name,
  description: inventoryItem.description,
  unit: inventoryItem.unit,
  minQty: inventoryItem.minQty,
  qty: inventoryItem.qty,
  borrowedQty: inventoryItem.borrowedQty,
  borrowable: inventoryItem.borrowable,
  condition: inventoryItem.condition,
  location: inventoryItem.location,
  purchaseValue: inventoryItem.purchaseValue,
  currentValue: inventoryItem.currentValue,
  createdByStaffId: inventoryItem.createdByStaffId,
  managerStaffId: inventoryItem.managerStaffId,
  custodianStaffId: inventoryItem.custodianStaffId,
  deletedAt: inventoryItem.deletedAt,
  createdAt: inventoryItem.createdAt,
  updatedAt: inventoryItem.updatedAt,

  categoryName: inventoryCategory.name,
  categoryColor: inventoryCategory.color,

  managerName: managerStaff.name,
  custodianName: custodianStaff.name,

  uniqueIdCount: sql<number>`(
    select ${count()} from ${inventoryUnit}
    where ${inventoryUnit.itemId} = ${inventoryItem.id}
  )`.mapWith(Number),
  activeUnitCount: sql<number>`(
    select ${count()} from ${inventoryUnit}
    where ${inventoryUnit.itemId} = ${inventoryItem.id}
      and ${inventoryUnit.status} <> 'removed'
  )`.mapWith(Number),
} as const;

export type ItemViewSelection = typeof itemViewSelection;

/**
 * A row selected with `itemViewSelection` plus `itemViewJoins`.
 *
 * Derived from the query below rather than written out, so the two cannot
 * drift: adding a column to the selection changes this type and breaks
 * `toItemView` in the same commit.
 */
export type InventoryItemJoinedRow = Awaited<
  ReturnType<typeof itemViewJoins>
>[number];

/**
 * The select-and-join chain every item read in this module starts from.
 *
 * Drizzle 0.45 has no standalone `innerJoin` / `leftJoin` helpers, so the joins
 * cannot be exported as a spreadable array the way the older docs show. They
 * are applied here instead, which is strictly better for the same reason the
 * selection is exported: a caller cannot add one of the two aliased staff
 * joins and forget the other, and cannot quietly change one join to an inner
 * join and start dropping unassigned items.
 *
 * `from(inventoryItem)` comes first so callers extend the chain with their own
 * `where` / `orderBy` / `limit` — and anything they add on top is theirs,
 * which is why a filtered list still ends in `toItemView` with the same shape.
 *
 * Callers filter on the joined staff tables through the exported
 * `managerStaff` / `custodianStaff` aliases and the plain `SQL` join form,
 * exactly as this function does. The callback `on` form is typed against the
 * *selection* rather than against table aliases in this version of drizzle, so
 * it cannot name `manager_staff.id`.
 */
export const itemViewJoins = (db: Executor) =>
  db
    .select(itemViewSelection)
    .from(inventoryItem)
    .innerJoin(
      inventoryCategory,
      eq(inventoryItem.categoryId, inventoryCategory.id)
    )
    .leftJoin(managerStaff, eq(inventoryItem.managerStaffId, managerStaff.id))
    .leftJoin(
      custodianStaff,
      eq(inventoryItem.custodianStaffId, custodianStaff.id)
    );

// ─── Actor resolution ───────────────────────────────────────────────────────

/**
 * Who is making the change. Every ledger and audit row points at a `staff` row
 * where one exists rather than at a `user` row, because an inventory action has
 * to survive the departure of the person who performed it — a storekeeper who
 * leaves the school must not be deletable until every item they issued is
 * accounted for.
 *
 * `staffId` is nullable because **not every account in this system is staff**.
 * The school administrator manages the inventory, and the seeded `admin`,
 * `principal` and `deputy-principal` accounts are seeded as users with no staff
 * identity on purpose (see `packages/auth/src/admin.ts`): they are leadership
 * seats, not employees on the teaching roll, and inventing a staff row for one
 * would be the same fake row `inventoryIssue.receiverName` exists to avoid. A
 * null `staffId` is therefore a legitimate actor, not a failure — see
 * `getInventoryActor` for what the write is attributed by instead.
 */
export interface InventoryActor {
  /** The caller's staff row, or null for an account that has none (the seeded
   *  admin / principal / deputy-principal accounts are seeded as users with no
   *  staff identity on purpose). Null is a legitimate actor, not an error. */
  staffId: string | null;
  /** Denormalised onto the ledger so the trail keeps a name even after the
   *  staff row is gone. Never null. */
  name: string;
  userId: string;
}

/**
 * `name` falls back through the session user's name, username and display
 * username because the seeded accounts that manage the inventory have no
 * `staff` row to read a name from, and an inventory error or ledger row shown to
 * one of them must still say who was acting. The last entry cannot be empty for
 * an authenticated account, so `InventoryActor.name` stays a `string` and no
 * caller has to null-check it.
 */
const sessionDisplayName = (sessionUser: {
  name: string;
  username?: string | null;
  displayUsername?: string | null;
}): string => {
  const candidates = [
    sessionUser.name,
    sessionUser.username,
    sessionUser.displayUsername,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "Unknown user";
};

/**
 * Resolve the caller to the `staff` row the ledger will name — and to nothing,
 * when there is not one.
 *
 * **Why a null `staffId` is allowed.** The write is attributed by `userId` plus
 * the denormalised `name`, not by the staff pointer. Every `*_staff_id` column
 * on every inventory table is already nullable and already `set null` — the
 * ledger has to survive the departure of the person who wrote it, and
 * `inventoryTransaction` denormalises `meta.actorName` and
 * `inventoryAuditLog.actorName` for exactly that reason. An actor with no staff
 * row therefore writes a row that is attributed by name and by the account that
 * produced it, and a teacher who is later deleted does not reach back through
 * those columns to strip the attribution off.
 *
 * The alternative — throwing `FORBIDDEN` for a caller with no staff row — is
 * what this function used to do, and it made the feature unreachable: the write
 * gate is `requireInventoryPermission(...)`, whose `admin` / `principal` /
 * `vicePrincipal` grants are all short-circuited by the `ADMIN_ROLES` bypass in
 * `requirePermission`, so precisely the three roles the feature was built for
 * would pass the permission check and then be refused here. A refusal that
 * follows a successful authorization check is a bug, not a policy.
 *
 * Authorization is not weakened by this: the caller still has to be signed in
 * (hence the `UNAUTHORIZED` below), and the procedure that called this still
 * had to pass its own `requireInventoryPermission` gate first. What changed is
 * that a leadership account no longer needs a staff record to exercise the
 * authority it already holds.
 */
export const getInventoryActor = async (
  context: Context
): Promise<InventoryActor> => {
  const sessionUser = context.session?.user;
  if (!sessionUser) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Sign in to act on the inventory",
    });
  }

  const [record] = await context.db
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(eq(staff.userId, sessionUser.id))
    .limit(1);

  return {
    staffId: record?.id ?? null,
    name: record?.name || sessionDisplayName(sessionUser),
    userId: sessionUser.id,
  };
};

// ─── Borrower resolution ────────────────────────────────────────────────────

export type InventoryBorrowerType = "staff" | "student";

/**
 * Whoever a loan is owed back to, in the one shape both kinds of borrower
 * arrive in.
 *
 * **A borrow has exactly one borrower of exactly one type.** `inventoryBorrow`
 * carries two nullable pointer columns and
 * `inventory_borrow_borrower_exclusive` refuses both-set and neither-set, so
 * "a teacher *or* a student" is a fact the database holds rather than a union
 * each caller assembles for itself. **Every read goes through `getBorrower`**
 * for the same reason: if one procedure joins `staff` and its neighbour joins
 * `student`, the two agree everywhere except the edges — the same loan renders
 * as "R. Perera" on one screen and as an empty cell on the other, and the
 * difference is invisible until a user's screen is wrong. One resolver, one
 * shape, and a caller that wants a borrower asks for it rather than
 * reimplementing the two-case read.
 *
 * `reference` and `className` are nullable and each is nullable for its own
 * reason, not because a borrower is "sometimes incomplete": a staff member
 * whose record carries no badge number is still a staff member, and a student
 * with no class assignment **this** year is still the person the loan is owed
 * to. Both fields are UI decoration for the label beside a name; neither is
 * allowed to become a reason to fail a resolution.
 */
export interface InventoryBorrower {
  type: InventoryBorrowerType;
  id: string;
  /** "R. Perera" for staff; "Nimali Fernando" for a student. Always populated. */
  name: string;
  /** Secondary line for the UI: the badge number for staff, the admission number for a student. */
  reference: string | null;
  /** "Grade 9B" when the student is in a class this academic year, otherwise null. Staff have no class. */
  className: string | null;
}

/**
 * `notNull` on both name columns is a database fact and not a promise that they
 * hold anything: a legacy import can carry a student whose names are a space
 * each, and an empty label on a loan ledger row is the one thing a storekeeper
 * cannot work around. The admission number is the fallback because it is the
 * one field on the row that is `notNull` **and** `unique`, so it is always
 * present and always identifies the person to a human.
 */
const studentDisplayName = (row: {
  firstName: string;
  lastName: string;
  admissionNumber: string;
}): string => `${row.firstName} ${row.lastName}`.trim() || row.admissionNumber;

/**
 * Many staff borrowers in one query, keyed by staff id.
 *
 * The batch form exists because a list view wants this for the whole page at
 * once, and the single-row form below is implemented on top of it rather than
 * beside it — see the note on `getBorrower` about the two cases being unable to
 * diverge. A caller with one id still gets one query; a caller with fifty gets
 * one query.
 *
 * A missing id is simply absent from the map rather than an error: this is the
 * batched path, one bad pointer among fifty must not fail the list, and the
 * single-row resolvers are where "that person does not exist" becomes a
 * `NOT_FOUND` a user can act on.
 */
export const resolveBorrowerStaffBatch = async (
  db: Executor,
  staffIds: readonly string[]
): Promise<Map<string, InventoryBorrower>> => {
  const borrowers = new Map<string, InventoryBorrower>();
  if (staffIds.length === 0) {
    return borrowers;
  }

  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      // The badge / service number, and the one staff identifier a person can
      // be given across a counter. `teacher_service_no` is unique and nullable,
      // so an office record that was never issued one yields a null reference
      // rather than a missing row.
      reference: staff.teacherServiceNo,
    })
    .from(staff)
    .where(inArray(staff.id, [...staffIds]));

  for (const row of rows) {
    borrowers.set(row.id, {
      type: "staff",
      id: row.id,
      name: row.name,
      reference: row.reference,
      // Staff are not on the class roll in this system: `class_` is keyed to
      // `student` through `studentClassAssignment`, and a teacher who also
      // teaches 9B has no row of their own in it. This is a structural null
      // rather than a missing lookup, and it is the reason `className` is not
      // a field every procedure has to defend.
      className: null,
    });
  }

  return borrowers;
};

/**
 * Many student borrowers in one query, keyed by student id, with each one's
 * class for the **current** academic year.
 *
 * **The current year is the whole point of the join.** `studentClassAssignment`
 * is unique on `(studentId, academicYearId)` and gets a *new* row every year,
 * so a student who was in 9B last year and is in 10A now has two assignment
 * rows, and an unfiltered join would return them two classes or pick one
 * arbitrarily. Neither is acceptable here: a loan made in 2026 must not
 * silently re-label itself when the class roll moves, so the historical row is
 * never read. The register of what a student was lent is a record of an
 * obligation, and an obligation that changes its own subject every January is
 * not a record. `className` is therefore "which class are they in **now**", or
 * null for a student with no assignment in the current year — a real answer,
 * and not a missing one.
 *
 * The unique index is also what makes this join safe to return rows from: one
 * student can be in at most one class in the current year, so the join cannot
 * multiply a student row and the map cannot be overwritten by a second class.
 */
export const resolveBorrowerStudentBatch = async (
  db: Executor,
  studentIds: readonly string[]
): Promise<Map<string, InventoryBorrower>> => {
  const borrowers = new Map<string, InventoryBorrower>();
  if (studentIds.length === 0) {
    return borrowers;
  }

  const rows = await db
    .select({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      className: class_.name,
    })
    .from(student)
    .leftJoin(
      studentClassAssignment,
      eq(studentClassAssignment.studentId, student.id)
    )
    // The `isCurrent` test lives in the join rather than in a `where`, because
    // a `where` on the outer table's null-joined columns would turn the
    // left join into an inner one and drop every student who is not currently
    // in a class — the exact rows whose `className` is supposed to be null.
    .leftJoin(
      academicYear,
      and(
        eq(academicYear.id, studentClassAssignment.academicYearId),
        eq(academicYear.isCurrent, true)
      )
    )
    .leftJoin(class_, eq(class_.id, studentClassAssignment.classId))
    .where(inArray(student.id, [...studentIds]));

  for (const row of rows) {
    borrowers.set(row.id, {
      type: "student",
      id: row.id,
      name: studentDisplayName(row),
      reference: row.admissionNumber,
      className: row.className,
    });
  }

  return borrowers;
};

export const resolveBorrowerStaff = async (
  db: Executor,
  staffId: string
): Promise<InventoryBorrower> => {
  const borrowers = await resolveBorrowerStaffBatch(db, [staffId]);
  const borrower = borrowers.get(staffId);
  if (!borrower) {
    throw new ORPCError("NOT_FOUND", { message: "Staff member not found" });
  }

  // Verify that the staff member's linked user (if any) is not an admin
  const [staffRecord] = await db
    .select({ role: user.role })
    .from(staff)
    .leftJoin(user, eq(staff.userId, user.id))
    .where(eq(staff.id, staffId))
    .limit(1);

  if (staffRecord?.role === "admin") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Cannot lend items to an admin account",
    });
  }

  return borrower;
};

/**
 * A student loan is refused rather than papered over: the caller picked this
 * person out of a picker, so "no such student" is a `NOT_FOUND` they can act
 * on, and it is the same failure a staff borrower gets. A missing student row
 * under a `restrict` foreign key means a deleted record the loan still names.
 */
export const resolveBorrowerStudent = async (
  db: Executor,
  studentId: string
): Promise<InventoryBorrower> => {
  const borrowers = await resolveBorrowerStudentBatch(db, [studentId]);
  const borrower = borrowers.get(studentId);
  if (!borrower) {
    throw new ORPCError("NOT_FOUND", { message: "Student not found" });
  }

  return borrower;
};

/**
 * The one read of "who is this loan about". Callers pass the row's two pointer
 * columns and get back the resolved person, whichever table they name.
 *
 * The order of the two arms is not a preference between staff and students: the
 * exclusivity CHECK refuses a row with both set, so only one arm can ever
 * match, and "staff first" is written out rather than left implicit so the
 * impossible case is visibly a decision rather than an accident.
 *
 * Neither-set is a `500` and not a `404`, and the distinction is the point: a
 * borrow row that names nobody is a corrupt register, not a missing person, and
 * answering it as "not found" would send a clerk looking for a student who
 * exists.
 *
 * Not `async`: it awaits nothing of its own, it chooses which resolver to hand
 * the row to. The `Promise` return type is what callers program against and is
 * the same either way.
 */
export const getBorrower = (
  db: Executor,
  row: { borrowerStaffId: string | null; borrowerStudentId: string | null }
): Promise<InventoryBorrower> => {
  if (row.borrowerStaffId) {
    return resolveBorrowerStaff(db, row.borrowerStaffId);
  }

  if (row.borrowerStudentId) {
    return resolveBorrowerStudent(db, row.borrowerStudentId);
  }

  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "This loan record names no borrower",
  });
};

/**
 * How a borrower is named in a message, a ledger note or a toast.
 *
 * The reference is appended when there is one, and that is not decoration: "Nimali
 * Fernando" is one of nine hundred names in a school, while "Nimali Fernando
 * (STU/2025/001)" is a person the storekeeper can find on the roll, and the
 * whole point of a store naming somebody is that somebody can act on it. Staff
 * get the same treatment from their badge number, and a staff member with no
 * badge simply renders as their name, which is what `reference: null` means.
 *
 * One function, so the two messages that name a borrower — the ledger note on
 * check-out and the drift refusal on check-in — cannot spell a student one way
 * and a teacher another.
 */
export const describeBorrower = (borrower: InventoryBorrower): string =>
  borrower.reference
    ? `${borrower.name} (${borrower.reference})`
    : borrower.name;

// ─── Item locking and existence guards ──────────────────────────────────────

/**
 * Read one live item **under a row lock**.
 *
 * The lock is the whole point: two concurrent borrow requests both read
 * `qty = 3`, both decide three are available, and both commit without it. Every
 * procedure that changes a counter must call this inside its transaction and
 * compute `before` from the row it returns, never from the values the client
 * sent. A soft-deleted item is a non-existent item for every caller here.
 */
export const getLockedItem = async (
  db: Executor,
  itemId: string
): Promise<InventoryItemRow> => {
  const [record] = await db
    .select()
    .from(inventoryItem)
    .where(and(eq(inventoryItem.id, itemId), isNull(inventoryItem.deletedAt)))
    .limit(1)
    .for("update");

  if (!record) {
    throw new ORPCError("NOT_FOUND", { message: "Item not found" });
  }

  return record;
};

/**
 * Read one **retired** item under a row lock — the deliberate inverse of
 * `getLockedItem`.
 *
 * The predicate is `isNotNull(deletedAt)` rather than a bare id, so this cannot be
 * reached with a live item's id. That is the whole reason it is a second function
 * rather than a flag on the first: `restoreItem` needs a row that every other
 * caller in this module treats as non-existent, and a shared `getLockedItem(itemId,
 * { includeDeleted: true })` would be one optional argument away from being used on
 * the wrong side of every guard in the feature.
 *
 * The failure is `NOT_FOUND` and not `CONFLICT`, and the distinction matters: an
 * id that is live, or an id that never existed, are both "there is no retired item
 * with this id", which is the sentence the caller can act on. "This item is not
 * retired" would send somebody hunting for a retired record that is not there.
 */
export const getLockedRetiredItem = async (
  db: Executor,
  itemId: string
): Promise<InventoryItemRow> => {
  const [record] = await db
    .select()
    .from(inventoryItem)
    .where(
      and(eq(inventoryItem.id, itemId), isNotNull(inventoryItem.deletedAt))
    )
    .limit(1)
    .for("update");

  if (!record) {
    throw new ORPCError("NOT_FOUND", {
      message:
        "No retired item with this id — it may already be back on the register",
    });
  }

  return record;
};

/**
 * The category must exist before the item that references it.
 *
 * The foreign key is `restrict`, so an unknown category id would otherwise
 * surface as a raw constraint violation from the driver. This turns it into a
 * message the picker can act on.
 */
export const assertCategoryExists = async (
  db: Executor,
  categoryId: string
): Promise<void> => {
  const [record] = await db
    .select({ id: inventoryCategory.id })
    .from(inventoryCategory)
    .where(eq(inventoryCategory.id, categoryId))
    .limit(1);

  if (!record) {
    throw new ORPCError("NOT_FOUND", { message: "Category not found" });
  }
};

/**
 * The target must be a real member of staff who is still employed.
 *
 * This is the school-domain replacement for the source app's
 * `assertActiveOwnerExists`, which asked whether a `user` row was banned. A
 * banned login and a departed member of staff are the same fact about the
 * store, and this repo states it as a person: **employment status that is
 * `"active"` or null**, and nothing else. There is no `staffCategory`
 * predicate, and its removal is the decision rather than an omission — a
 * Principal is a person in the building, not only a login, and the bursar is
 * who a school projector actually leaves the office with. `STAFF_CATEGORIES` has
 * two values (`teacher`, `officeStaff`) and both describe people who are
 * employed, so filtering on the column would have excluded a colleague rather
 * than a category of person who cannot hold property.
 *
 * **The employment-status half is the half doing the work, and it is the half
 * that stays.** It is what stops the register naming somebody who is not a real,
 * employed person: a *terminated* or *on-leave* colleague is refused, because
 * the equipment leaves the building with them. A *null* status is admitted,
 * because a null means nobody has confirmed it — refusing those would make the
 * ledger unusable until an administrator filled in a field the storekeeper has
 * no business editing.
 *
 * **`label` names the role being filled, never the category of person.** It is
 * interpolated into the refusal below, and the whole point of the widened
 * predicate is that a clerk who picks the bursar is now correct — so a message
 * telling them to select a *teacher* would instruct them to make a mistake.
 * Every call site passes a role phrase ("staff member", "staff member holding
 * the item"), and the two lists that feed those fields —
 * `listAssignableStaff` and this guard — must keep saying the same thing.
 *
 * The returned `{ id, name }` exists so the caller can write the holder's name
 * into a message or a `meta` payload without a second read.
 */
export const assertStaffIsAssignable = async (
  db: Executor,
  staffId: string,
  label: string
): Promise<{ id: string; name: string }> => {
  const [record] = await db
    .select({ id: staff.id, name: staff.name, role: user.role })
    .from(staff)
    .leftJoin(user, eq(staff.userId, user.id))
    .where(
      and(
        eq(staff.id, staffId),
        or(eq(staff.employmentStatus, "active"), isNull(staff.employmentStatus))
      )
    )
    .limit(1);

  if (!record) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Select an active ${label} to be in charge of this item`,
    });
  }

  if (record.role === "admin") {
    throw new ORPCError("BAD_REQUEST", {
      message: `Cannot assign an admin account as ${label}`,
    });
  }

  return { id: record.id, name: record.name };
};

// ─── Tagged units ───────────────────────────────────────────────────────────

/**
 * Normalize a request's asset tags and refuse the same tag twice.
 *
 * The duplicate check is a request-level guard, not a database one: the
 * `normalizedUniqueNo` index would reject a duplicate row, but only after the
 * caller had already been told its two entries were fine. More importantly the
 * two entries are usually a paste of the same tag into two fields, and the user
 * needs to be told that rather than shown a constraint error.
 *
 * The list comes back normalized, so callers must not re-normalize before
 * comparing it against `unit.normalizedUniqueNo`.
 */
const normalizeRequestedUnitKeys = (unitIds: string[]): string[] => {
  const normalized: string[] = [];

  for (const unitId of unitIds) {
    const key = normalizeInventoryKey(unitId);
    if (key) {
      normalized.push(key);
    }
  }

  if (new Set(normalized).size !== normalized.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The same asset tag was supplied more than once",
    });
  }

  return normalized;
};

/**
 * Claim exactly `qty` available units, FIFO, by oldest tag first.
 *
 * FIFO is the ordering a school counts on: the projector bought in 2024 leaves
 * before the one bought this term, so the oldest stock ages out first and the
 * tag a storekeeper finds in a cupboard is the tag they already expect. `id`
 * breaks created-at ties because `created_at` is a `defaultNow()` timestamp and
 * two tags added in the same transaction share it, and an unstable order is an
 * order that hands out a different projector on every retry.
 *
 * Supplied `unitIds` are matched against **either** the row `id` or the
 * normalized asset tag, because a teacher knows the number written on the
 * device and a program would send the primary key; insisting on one of the two
 * would force every caller to resolve tags to ids in a round trip this
 * function already performs.
 *
 * The three failure modes are kept apart because they mean different things to
 * the person at the counter: a tag nobody has is a typo, too few rows back is
 * "the other borrow happened first", and a row that was not asked for is a bug
 * in the query above this one rather than anything the user did.
 */
export const getAvailableUnits = async (
  db: Executor,
  itemId: string,
  qty: number,
  unitIds?: string[]
): Promise<InventoryUnitRow[]> => {
  const requested = unitIds ? normalizeRequestedUnitKeys(unitIds) : undefined;

  const rows = await db
    .select()
    .from(inventoryUnit)
    .where(
      and(
        eq(inventoryUnit.itemId, itemId),
        eq(inventoryUnit.status, "available"),
        requested
          ? or(
              inArray(inventoryUnit.id, requested),
              inArray(inventoryUnit.normalizedUniqueNo, requested)
            )
          : undefined
      )
    )
    .orderBy(asc(inventoryUnit.createdAt), asc(inventoryUnit.id))
    .limit(qty);

  if (requested) {
    const requestedSet = new Set(requested);
    for (const row of rows) {
      const wasRequested =
        requestedSet.has(row.id) || requestedSet.has(row.normalizedUniqueNo);
      if (!wasRequested) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Every selected asset tag must belong to this item",
        });
      }
    }

    const resolved = new Set(
      rows.flatMap((row) => [row.id, row.normalizedUniqueNo])
    );
    for (const key of requestedSet) {
      if (!resolved.has(key)) {
        throw new ORPCError("NOT_FOUND", {
          message: `No available asset tagged ${key}`,
        });
      }
    }
  }

  if (rows.length < qty) {
    throw new ORPCError("CONFLICT", {
      message: `Only ${rows.length} unit(s) are available`,
    });
  }

  return rows;
};

/**
 * The outcome of claiming the physical side of a lifecycle write. `units` is
 * **`null`, never `[]`, for a bulk line** — see `claimLifecycleUnits` and the note
 * on `createDisposal`'s return value, which is the same distinction made in a
 * response body.
 */
export interface LifecycleUnitClaim {
  /**
   * The claimed rows, or `null` when the item is counted in bulk and therefore has
   * no tagged rows to claim. A caller that writes `units.map(...)` here is a caller
   * that has not read this comment.
   */
  units: InventoryUnitRow[] | null;
  /** Whether the item turned out to have no tagged units at all. */
  isBulk: boolean;
}

/**
 * Claim the units a lifecycle write moves, or decide that there are none to claim.
 *
 * `createItem` permits a counted-but-untagged line — "200 chairs" is counted, not
 * tagged, and only a tagged item has unit rows — and `createDisposal` has always
 * handled the consequence. The other three lifecycle writes called
 * `getAvailableUnits` unconditionally and therefore refused every movement of a
 * bulk line with *"Only 0 unit(s) are available"*, which is a sentence about asset
 * tags on an item that has none. This function is the one place that decision is
 * made, so the three call sites cannot disagree about it.
 *
 * **The three arms, and why the middle one still exists.**
 *
 * 1. **Tags were named.** Always `getAvailableUnits` with them, whatever shape the
 *    item is. A tag is a claim about a specific device, so an item with no devices
 *    cannot satisfy one, and the refusal comes from the one helper that can name
 *    the offending tag: *"No available asset tagged LT-0042"*. This is the arm a
 *    stale picker lands in, and it is the right place for it to fail.
 * 2. **No tags named, and the item has unit rows.** FIFO, oldest first, exactly as
 *    every caller has always behaved. **This arm is why a shared helper is safer
 *    than a copied `? … : null`:** reading "absent tags" as "bulk item" without
 *    asking whether the item *is* one would silently stop claiming the devices of
 *    a tagged item, and the resulting loan would carry a counter with no unit rows
 *    behind it — the drift `returnBorrow` exists to catch, manufactured by the
 *    fix for it.
 * 3. **No tags named, and the item has no unit rows.** A bulk line. `units` is
 *    `null`: the counter still moves, and there is simply nothing per-device to
 *    move with it.
 *
 * **The empty array is folded to "not named" before anything else**, which is what
 * `createDisposal` does and for the reason its comment gives: an untouched
 * multi-select sends `[]`, and `getAvailableUnits` would read that as a request for
 * zero specific units and answer "Only 0 unit(s) are available" — which, on a bulk
 * item, is the exact bug this function exists to remove.
 *
 * The probe in arm 2/3 is one indexed `limit 1` and only runs when no tags were
 * named, so the common tagged-with-tags path costs nothing extra. It must be called
 * under the caller's `getLockedItem` lock, which is what makes it a statement about
 * a settled state rather than a race.
 */
export const claimLifecycleUnits = async (
  db: Executor,
  itemId: string,
  qty: number,
  requestedUnitIds?: string[] | null
): Promise<LifecycleUnitClaim> => {
  const requested = requestedUnitIds?.length ? requestedUnitIds : null;

  if (requested) {
    return {
      units: await getAvailableUnits(db, itemId, qty, requested),
      isBulk: false,
    };
  }

  const [anyUnit] = await db
    .select({ id: inventoryUnit.id })
    .from(inventoryUnit)
    .where(eq(inventoryUnit.itemId, itemId))
    .limit(1);

  if (!anyUnit) {
    return { units: null, isBulk: true };
  }

  return { units: await getAvailableUnits(db, itemId, qty), isBulk: false };
};

/**
 * The tag list a claim produced, for `meta.uniqueUnitIds` — normalized, and
 * **empty rather than absent for a bulk line**.
 *
 * The ledger's `meta` is read years later by somebody reconciling a certificate
 * against a clipboard, and "this movement named no tags" and "this row predates
 * tags" have to be distinguishable without a null check at the far end. An empty
 * array says the first; a missing key would say neither.
 */
export const claimedUnitTags = (
  claim: Pick<LifecycleUnitClaim, "units">
): string[] => claim.units?.map((unit) => unit.normalizedUniqueNo) ?? [];

/**
 * A unit cannot join a second movement while a disposal is waiting on a
 * signature.
 *
 * The window is `pending_approval` and `approved` only. A `cancelled` disposal
 * releases its units — that is the entire point of cancelling — and a
 * *finalized* one leaves a row here whose unit has already been written off, so
 * neither may block anything. What the two open statuses mean is that the unit
 * is spoken for on paper: it may still be sitting in the cupboard, and moving
 * it now would leave the certificate describing a device nobody can find.
 */
export const assertUnitsNotPendingDisposal = async (
  db: Executor,
  unitIds: string[]
): Promise<void> => {
  if (unitIds.length === 0) {
    return;
  }

  const [blocked] = await db
    .select({ uniqueNo: inventoryUnit.uniqueNo })
    .from(inventoryDisposalUnit)
    .innerJoin(
      inventoryDisposal,
      eq(inventoryDisposal.id, inventoryDisposalUnit.disposalId)
    )
    .innerJoin(
      inventoryUnit,
      eq(inventoryUnit.id, inventoryDisposalUnit.unitId)
    )
    .where(
      and(
        inArray(inventoryDisposalUnit.unitId, unitIds),
        inArray(inventoryDisposal.status, ["pending_approval", "approved"])
      )
    )
    .limit(1);

  if (blocked) {
    throw new ORPCError("CONFLICT", {
      message: `Asset ${blocked.uniqueNo} is already part of a disposal request that has not been finalised`,
    });
  }
};

/**
 * The three ways a single unit can be spoken for, checked together.
 *
 * They are one guard because they are one decision: "may this unit move?" is
 * asked once, before any of them is attempted, and answering it in three
 * separate round trips would let a unit pass the first and fail the third with
 * a confusing message about disposal when the real problem was a borrow. The
 * order is borrow, then issue, then disposal, and it is the order of how
 * irreversibly each commits the school: a borrow is released on return, an
 * issue never comes back, and a disposal waits for a signature.
 *
 * The tag is read in the same `Promise.all` as the three probes, because every
 * message here names the tag rather than saying "this unit" — a storekeeper
 * holding six devices needs to know which one, and a numbered list is not a
 * pointer to a row.
 */
export const assertNoActiveLifecycleUnit = async (
  db: Executor,
  unitId: string
): Promise<void> => {
  const [unitRows, borrowRows, issueRows, disposalRows] = await Promise.all([
    db
      .select({ uniqueNo: inventoryUnit.uniqueNo })
      .from(inventoryUnit)
      .where(eq(inventoryUnit.id, unitId))
      .limit(1),
    db
      .select({ borrowId: inventoryBorrowUnit.borrowId })
      .from(inventoryBorrowUnit)
      .where(
        and(
          eq(inventoryBorrowUnit.unitId, unitId),
          isNull(inventoryBorrowUnit.releasedAt)
        )
      )
      .limit(1),
    db
      .select({ issueId: inventoryIssueUnit.issueId })
      .from(inventoryIssueUnit)
      .where(eq(inventoryIssueUnit.unitId, unitId))
      .limit(1),
    db
      .select({ disposalId: inventoryDisposalUnit.disposalId })
      .from(inventoryDisposalUnit)
      .innerJoin(
        inventoryDisposal,
        eq(inventoryDisposal.id, inventoryDisposalUnit.disposalId)
      )
      .where(
        and(
          eq(inventoryDisposalUnit.unitId, unitId),
          inArray(inventoryDisposal.status, ["pending_approval", "approved"])
        )
      )
      .limit(1),
  ]);

  const [unit] = unitRows;
  if (!unit) {
    throw new ORPCError("NOT_FOUND", { message: "Unit not found" });
  }

  const [borrowed] = borrowRows;
  if (borrowed) {
    throw new ORPCError("CONFLICT", {
      message: `Asset ${unit.uniqueNo} is currently borrowed`,
    });
  }

  const [issued] = issueRows;
  if (issued) {
    throw new ORPCError("CONFLICT", {
      message: `Asset ${unit.uniqueNo} has already been issued out of the store`,
    });
  }

  const [pendingDisposal] = disposalRows;
  if (pendingDisposal) {
    throw new ORPCError("CONFLICT", {
      message: `Asset ${unit.uniqueNo} is pending disposal`,
    });
  }
};

/**
 * `what` is a verb phrase, not a noun: the guard reads "Only 2 unit(s) are
 * available to issue". That is why the sentence is assembled from `what`
 * rather than taking a pre-built message — the number is the part the caller
 * cannot know before the read, and the phrase is the part only the calling
 * procedure can supply.
 */
export const assertSufficientAvailableQuantity = (
  counters: InventoryCounters,
  requested: number,
  what: string
): void => {
  const available = calculateAvailableQuantity(counters);
  if (available < requested) {
    throw new ORPCError("CONFLICT", {
      message: `Only ${available} unit(s) are available to ${what}`,
    });
  }
};

// ─── Ledger writers ─────────────────────────────────────────────────────────

/**
 * The two counters as they were, or as they became, on one side of a change.
 *
 * Deliberately a distinct name from `InventoryCounters` even though the shape
 * is identical: `before` and `after` are the two sides of one ledger row, and
 * a signature that reads `before: counters, after: counters` invites a caller
 * to pass the same pair twice. The empty extension is the whole point of the
 * name, so the lint rule that would collapse it is switched off for this line.
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type
export interface InventorySnapshot extends InventoryCounters {}

export interface InsertTransactionInput {
  actor: InventoryActor;
  action: InventoryAction;
  item: { id: string; name: string; sku: string };
  before: InventoryCounters;
  after: InventoryCounters;
  note?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * One before/after row in the counter ledger.
 *
 * `itemName`, `sku` and `actorName` are denormalized into `meta` rather than
 * joined on purpose: the transactions screen renders a year of history and must
 * not turn into an N+1 over items and staff, and a store whose items are later
 * deleted must still be able to show what happened to them. `actorName` is
 * there for the same reason — `actorStaffId` is `set null`, so a departed
 * storekeeper's name would otherwise vanish from every historic row. It is also
 * what makes a **null** `actor.staffId` survivable: an account with no staff row
 * (a seeded administrator, say) writes an unattributed `actor_staff_id` and a
 * named `meta.actorName`, and the row still answers "who did this" long after
 * the session that produced it is gone.
 *
 * The three defaults are spread **last** and cannot be overridden. A caller
 * that already has the right values has no reason to pass them, and a caller
 * that passes a different `itemName` has a bug that would otherwise be
 * recorded as fact: a rendered ledger that names the wrong item is worse than
 * one that omits a custom field.
 */
export const insertInventoryTransaction = async (
  db: Executor,
  input: InsertTransactionInput
): Promise<void> => {
  await db.insert(inventoryTransaction).values({
    id: crypto.randomUUID(),
    actorStaffId: input.actor.staffId,
    action: input.action,
    itemId: input.item.id,
    qtyBefore: input.before.qty,
    qtyAfter: input.after.qty,
    borrowedQtyBefore: input.before.borrowedQty,
    borrowedQtyAfter: input.after.borrowedQty,
    note: input.note ?? null,
    meta: {
      ...input.meta,
      itemName: input.item.name,
      sku: input.item.sku,
      actorName: input.actor.name,
    },
  });
};

export interface InsertAuditLogInput {
  actor: InventoryActor;
  /** A CRUD verb — `"item.update"`, `"custody.transfer"` — not a ledger action. */
  action: string;
  /** The table name: `"inventory_item"`, `"inventory_custody_history"`. */
  entityType: string;
  entityId: string;
  before?: unknown | null;
  after?: unknown | null;
}

/**
 * The row-level before/after record, for the fields the counter ledger cannot
 * see. `before` / `after` are `unknown` rather than a typed entity on purpose:
 * this table is shared by every inventory entity, and one honest `unknown`
 * beats an entity type per caller. Callers pass whatever they just read or
 * wrote, which is JSON-safe by virtue of `toItemView` and its siblings — the
 * cast below asserts the one invariant the column cannot check for itself.
 *
 * `actorName` is written on every row, and that is the second half of the
 * `inventory_audit_log_actor_id_or_name` CHECK: the log's job is to answer "who
 * did this", `actor_staff_id` is nullable by design (`set null`, so a teacher
 * deletion does not delete the log), and a seeded administrator has no staff row
 * at all — so without the denormalised name, one deletion anonymises everything
 * that person ever did and the only question this table exists for goes
 * unanswered. A caller with neither is refused by the database.
 */
export const insertInventoryAuditLog = async (
  db: Executor,
  input: InsertAuditLogInput
): Promise<void> => {
  await db.insert(inventoryAuditLog).values({
    id: crypto.randomUUID(),
    actorStaffId: input.actor.staffId,
    actorName: input.actor.name,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: (input.before ?? null) as Record<string, unknown> | null,
    after: (input.after ?? null) as Record<string, unknown> | null,
  });
};

// ─── Serialisation ──────────────────────────────────────────────────────────

/** Drizzle rows carry Date objects; every oRPC handler in this repo returns JSON-safe plain objects. */
export const isoOrNull = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

export const iso = (value: Date): string => value.toISOString();

// ─── View mapping ───────────────────────────────────────────────────────────

/**
 * The wire shape of an item. Money stays a string on purpose: `numeric` comes
 * back in drizzle's default `mode: "string"` precisely so that 2400.50 does not
 * become 2400.5 on the way to a client, and parsing it here would put the
 * rounding error back. Only code that genuinely sums money — a report total —
 * should convert, and it should convert with a decimal-aware helper rather than
 * `Number(...)`.
 */
export interface InventoryItemView {
  id: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  managerStaffId: string | null;
  managerName: string | null;
  custodianStaffId: string | null;
  custodianName: string | null;
  unit: string;
  minQty: number;
  qty: number;
  borrowedQty: number;
  availableQty: number;
  status: InventoryItemStatus;
  borrowable: boolean;
  condition: string;
  location: string;
  purchaseValue: string | null;
  currentValue: string | null;
  uniqueIdCount: number;
  activeUnitCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Turn a joined row into the view.
 *
 * Every list and every get in this module ends here, which is what makes
 * `availableQty` and `status` agree between them — both are derived once, by
 * the functions in `inventory-calculations`, rather than each procedure
 * re-deriving them from whatever it happened to have selected.
 */
export const toItemView = (row: InventoryItemJoinedRow): InventoryItemView => {
  const counters = countersOf(row);
  const availableQty = calculateAvailableQuantity(counters);

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categoryColor: row.categoryColor,
    managerStaffId: row.managerStaffId,
    managerName: row.managerName,
    custodianStaffId: row.custodianStaffId,
    custodianName: row.custodianName,
    unit: row.unit,
    minQty: row.minQty,
    qty: row.qty,
    borrowedQty: row.borrowedQty,
    availableQty,
    status: calculateItemStatus(counters, row.condition),
    borrowable: row.borrowable,
    condition: row.condition,
    location: row.location,
    purchaseValue: row.purchaseValue,
    currentValue: row.currentValue,
    uniqueIdCount: row.uniqueIdCount,
    activeUnitCount: row.activeUnitCount,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: isoOrNull(row.deletedAt),
  };
};
