import { createAccessControl } from "better-auth/plugins/access";
import type { AccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

/**
 * Application-wide permission statements. Each key is a resource and the
 * array enumerates every action that can be granted on that resource.
 *
 * `defaultStatements` re-exports better-auth's built-in `user` and `session`
 * resources so we keep a single source of truth here.
 */
export const statement = {
  ...defaultStatements,
  /** File assets: upload (create), enumerate (list), remove (delete). */
  file: ["create", "list", "delete"],
  /** Staff records: full CRUD. */
  staff: ["create", "read", "update", "delete"],
  /** Teaching/position assignments: full CRUD. */
  assignment: ["create", "read", "update", "delete"],
  /** Qualifications: upload (create), view (read), approve/reject (approve). */
  qualification: ["create", "read", "approve"],
  /** Student records: full CRUD. */
  student: ["create", "read", "update", "delete"],
  /** Marks: enter, view, update marks for assigned classes. */
  mark: ["create", "read", "update"],
  /** Exam types and grade scales: manage exam definitions. */
  exam: ["create", "read", "update", "delete"],
  /** Inventory: read the ledger (read), register items (create), edit details
   *  and move custody (update), retire items (delete), sign off write-offs
   *  (approve), the narrow self-service claim/hand-back (take), and the narrow
   *  owner-authority pair (manageOwn).
   *
   *  `take` is deliberately a **separate action** and not a widening of
   *  `update`. It covers exactly one thing: a teacher claiming an available
   *  item into their own custody (`takeItem`) or handing one back
   *  (`releaseCustody`). Both procedures narrow the target to the caller's own
   *  staff row, or to the item the caller already holds, so this grant confers
   *  **no authority over any other item** — it cannot move property to another
   *  person, cannot change who is in charge of anything, and cannot sign off a
   *  write-off. `update` is the one that does those things, and it guards
   *  `transferCustody`, `assignManager`, `updateItem`, `updateUnit`, `stockOut`,
   *  `returnBorrow` and `cancelDisposal`. Granting a teacher `update` to reach
   *  the hand-back button would hand them all seven write gates with it.
   *
   *  `manageOwn` is a **third** narrow action, and it exists because an item's
   *  owner in this school is usually a `teacher` — who holds only `read` and
   *  `take`. It covers exactly two procedures, `transferOwnership` and
   *  `reclaimCustody`, and both are the *owner's* authority over an item they are
   *  already the manager of: handing that responsibility on to another teacher,
   *  and calling a held item back. It confers no authority over anybody else's
   *  items, it cannot appoint or clear a manager (that is `assignManager`, still
   *  `update`), and it cannot move property to an arbitrary third party (that is
   *  `transferCustody`, still `update`).
   *
   *  **The grant says which procedures may run, never which rows they may
   *  touch.** `manageOwn` is the sharpest case of that in this file, because its
   *  name names a scope — "your own" — that an access-control statement has no
   *  way to express. The scoping is a line of handler code in each of the two
   *  procedures (`caller === item.managerStaffId`, or one of the three
   *  leadership seats), and **the statement alone is not a security control.** A
   *  future editor who reads `manageOwn` and infers that the scoping is automatic
   *  has read a permission into a claim it does not make. */
  inventory: [
    "create",
    "read",
    "update",
    "delete",
    "approve",
    "take",
    "manageOwn",
  ],
} as const;

export type AppAccessControl = AccessControl<typeof statement>;

export const ac: AppAccessControl = createAccessControl(statement);

/**
 * Admin – full control over every resource.
 * Spreads the default admin statements so all built-in user/session
 * permissions are preserved.
 *
 * The `inventory` grants on this role and on `principal` / `vicePrincipal`
 * below are never evaluated at runtime: `requirePermission` in
 * `packages/api/src/index.ts` short-circuits every `ADMIN_ROLES` member before
 * it consults a role statement. They are kept because they document intent and
 * keep the three leadership statements honest with each other, not because
 * anything reads them. Anyone changing that bypass must revisit all three role
 * statements in the same commit — otherwise the grants and the check
 * disagree silently.
 */
export const admin = ac.newRole({
  ...adminAc.statements,
  file: ["create", "list", "delete"],
  staff: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  qualification: ["create", "read", "approve"],
  inventory: [
    "create",
    "read",
    "update",
    "delete",
    "approve",
    "take",
    "manageOwn",
  ],
});

/**
 * Principal / Vice Principal get their own seeded roles so an account is
 * self-describing (visible on `/admin/users`) and the workspace a member
 * lands on follows from the account rather than a second lookup.
 *
 * Both carry the full admin statement set — leadership still needs the
 * whole staff-management surface. The role never grants leave review
 * authority: that comes only from a current-year `staff_position` row, and
 * `assignPosition` is what promotes and demotes the role alongside it.
 */
export const principal = ac.newRole({
  ...adminAc.statements,
  file: ["create", "list", "delete"],
  staff: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  qualification: ["create", "read", "approve"],
  inventory: [
    "create",
    "read",
    "update",
    "delete",
    "approve",
    "take",
    "manageOwn",
  ],
});

export const vicePrincipal = ac.newRole({
  ...adminAc.statements,
  file: ["create", "list", "delete"],
  staff: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  qualification: ["create", "read", "approve"],
  inventory: [
    "create",
    "read",
    "update",
    "delete",
    "approve",
    "take",
    "manageOwn",
  ],
});

// Role names and guards live in `./roles` so isomorphic code (routes,
// components) can import them without pulling this package's server-only
// bootstrap code into the client bundle. Re-exported here for server callers.
export {
  ADMIN_ROLES,
  LEADERSHIP_ROLES,
  STAFF_ROLES,
  isAdminRole,
  isLeadershipRole,
  isSeededAccount,
  isStaffRole,
  needsVerification,
} from "./roles";
export type { AdminRole, LeadershipRole, StaffRole } from "./roles";

/**
 * Regular user – can upload and view own qualifications, but cannot approve.
 * Staff/assignment management is admin-only.
 */
export const user = ac.newRole({
  qualification: ["create", "read"],
});

/**
 * Teacher – reads and writes the academic record of the classes they teach.
 *
 * The old one-liner on this comment used to say "can read students in their
 * class", and it was **false**: eight teacher-reachable procedures in the
 * marking router applied no row scoping at all, and `listStudents` was an
 * unqualified `db.select().from(student)` — the whole school roll, with every
 * pupil's `dateOfBirth`, `phone`, `parentPhone` and `admissionNumber`, handed to
 * any teacher in the building who asked. The statements on this role were
 * correct throughout; the handlers did not narrow. So the paragraph below states
 * what is enforced **now**, and it is the security contract for the next editor.
 *
 * **What each grant actually reaches, and what each one is narrowed to:**
 *
 * - `student: ["read"]` is **scoped to the students of the classes the caller
 *   teaches**, in all five procedures it reaches: `listStudents`,
 *   `getStudent`, `getStudentHistory`, `getCurrentSubjectSelections` and
 *   `listSubjectSelectionHistory`. A teacher's `listStudents` is their own
 *   classes' rosters in the current year — a short list, and a deliberately
 *   different answer from an administrator's school-wide one, because "everyone
 *   in the school" is an administrative view and "my own classes" is a
 *   teaching one. The student-keyed reads resolve the pupil's class for the year
 *   they are about — the year in the input where there is one, the current year
 *   otherwise — and refuse when the caller does not teach that class, so **a
 *   student with no assignment in that year is not reachable by a teacher at
 *   all** (a leadership seat still sees them, placed or not; see the bypass
 *   note below). `create`, `update` and `delete` are not granted, so admission
 *   and student-record edits are administrator-only.
 * - `mark: ["create", "read", "update"]` is **scoped to the caller's classes the
 *   same way**: `listMarksForClass` is held by the same class claim. The one
 *   asymmetry is deliberate — `create` (`enterSubjectMark`) and `update`
 *   (`updateSubjectMark`) additionally pass `assertCanEnterMarkForAssignment`,
 *   which holds mark **entry** to the **homeroom teacher of that class alone**.
 *   Reading a class's marks and typing into them are different acts: a subject
 *   teacher with a timetable slot may read the marks of the class they are
 *   timetabled against, and may not write into them.
 * - `exam: ["read"]` is **school-wide reference data and deliberately not
 *   narrowed**. `listExamTypes` and `listGradeScale` return the shape of the
 *   year's examinations and the published grade boundaries: no pupil, no mark
 *   received, no person named, no pointer to one. A grade scale is also the one
 *   thing a teacher must be able to read *before* entering a mark at all, so
 *   gating it behind a class claim would break legitimate work rather than
 *   protect anything. `gradeLevel` and `subjectKey` are the caller's own
 *   narrowing tools.
 * - `assignment: ["read"]` reaches three procedures and is the quietest of the
 *   four: `listStudentsByClass`, which is class-scoped as above;
 *   `listTeacherSubjects`, which narrows to the caller's own staff row; and
 *   `listPeriodConfig`, which returns code constants and no rows. `create`,
 *   `update` and `delete` are not granted, which is why a teacher's
 *   `assignment: read` deliberately does not reach school-wide timetable reads
 *   (see `AGENTS.md`).
 *
 * **The three leadership seats bypass the class claims.** `admin`, `principal`
 * and `vicePrincipal` reach these procedures through the `ADMIN_ROLES`
 * short-circuit in `requirePermission` and are answered by the school-wide view.
 * The bypass is keyed on the role string, not on a `staff` row: **a principal is
 * a leader, not a teacher**, so a principal who holds a staff record is not
 * thereby the homeroom teacher of anything.
 *
 * **The standing invariant, and it is the sentence a future editor breaks: a
 * grant says which procedures may run, never which rows they may return.** A
 * statement that names a scope it cannot express — "your own classes" — is a
 * grant, not a boundary. The boundary is a comparison in handler code, and it
 * has to be written by hand in every procedure that returns student, mark or
 * class-roster rows. Eight of them once omitted that check while these
 * statements sat here looking correct the whole time. Adding another procedure on
 * `requireStudentPermission("read")`, `requireMarkPermission("read")` or
 * `requireAssignmentPermission("read")` that returns those rows **without** a
 * class check in its own handler is a data leak, not a style choice.
 *
 * `inventory: ["read", "take", "manageOwn"]` is the entire inventory surface of
 * this role, and it is three grants that together reach **nine procedures and
 * nothing else** — five on `read`, two on `take`, two on `manageOwn`. The three
 * numbers are written out rather than left to arithmetic because this comment is
 * the security contract, and a count that has to be recomputed in the reader's
 * head is a count that silently stops being checked.
 *
 * **`read` reaches exactly five procedures, and no more:**
 *
 * - `listMyItems`, which scopes its own query to the caller
 *   (`managerStaffId = me or custodianStaffId = me`).
 * - `listCategories`, a label vocabulary containing no person and no item.
 * - `listCustodyHistory`, which scopes its own query to an item the caller
 *   holds or is in charge of.
 * - `listLentByMe` — the caller's own accountability, scoped in its own query to
 *   `managerStaffId = me and custodianStaffId is not null and custodianStaffId <>
 *   me`: the things the caller is answerable for that are physically in somebody
 *   else's hands. It does disclose another person's **name** — the holder — and
 *   that is unavoidable for the list to mean anything: a teacher cannot act on a
 *   colleague's custody of their own equipment without knowing whose custody it
 *   is, and `listCustodyHistory` already discloses the same name to the same
 *   caller. It discloses nothing about an item the caller has no relationship
 *   with, and it deliberately **excludes** two things: items the caller both owns
 *   and holds (already on "My Equipment", and listing them twice would make an
 *   owner look like a lender of their own property), and items out on a **dated
 *   loan** (a loan is temporary and `listBorrows` is where it belongs). "Everything
 *   I am answerable for, wherever it is" is a **different query** over the borrow
 *   table, and this procedure is not it.
 * - `listTakeableItems` — **the one that is not caller-scoped**, and therefore
 *   the one this whole comment turns on. It is a *catalogue*, not a register: it
 *   answers "is there one of these on the shelf that I could take" and returns
 *   `id`, `sku`, `name`, `categoryId`, `categoryName`, `categoryColor`,
 *   `availableQty`, `condition` and `location` — nine fields, all of them facts
 *   about the shelf. It returns no `managerStaffId` / `managerName`, no
 *   `custodianStaffId` / `custodianName`, no `description`, no valuation, no
 *   `borrowedQty` and no `minQty`, so it discloses **no person at all**: nobody
 *   who is answerable for an item and nobody who is carrying one. Its filters
 *   are `takeItem`'s own guards, so it also cannot offer something the write
 *   would refuse.
 *
 * It reaches **no** school-wide register, no ledger, no movement list and no
 * write-off list. `listItems`, `getItem`, `listUnits`, `listAssignableStaff`,
 * `listBorrows`, `listIssues`, `listTransactions`, `listAuditLogs` and
 * `listDisposals` are all `adminProcedure`. The distinction to hold on to is
 * that a *register* answers "what does the school own, and who is answerable for
 * it" while a *catalogue* answers "what is free right now" — and only the second
 * question is one a teacher has any business asking.
 *
 * **`take` reaches exactly two procedures:**
 *
 * - `takeItem` — claiming an available item, narrowed to the caller's own staff
 *   row. `newCustodianStaffId` is not an input.
 * - `releaseCustody` — handing one back, narrowed to the item the caller
 *   already holds (plus the three leadership roles, so an administrator can
 *   clear a pointer after a departure).
 *
 * **`manageOwn` reaches exactly two procedures, and they are the owner's own
 * authority over the caller's own items:**
 *
 * - `transferOwnership` — handing the item the caller is in charge of to another
 *   teacher, permanently. `newOwnerStaffId` is **required and non-nullable**, so
 *   this verb can only ever move accountability to a person; leaving an item with
 *   nobody in charge of it is `assignManager({ newManagerStaffId: null })`, which
 *   is `update` and therefore administrator-only. Two verbs, one column, on
 *   purpose: one says "somebody different is answerable" and the other says
 *   "nobody is", and a single nullable input could not tell a caller which a
 *   `null` was going to do.
 * - `reclaimCustody` — demanding back an item the caller is in charge of that a
 *   colleague is holding. This is **not** `releaseCustody` and must not be
 *   confused with it: `releaseCustody` is the holder's own voluntary hand-back
 *   and sits on `take`, while this is the owner reaching into a colleague's hands
 *   — a different act, which is why it is a different verb, and why its `reason`
 *   is required and lands in the permanent trail. It clears `custodianStaffId`
 *   only; `managerStaffId` is untouched, because reclaiming custody is not
 *   transferring ownership.
 *
 * Both narrow themselves in the handler to items the caller is the manager of,
 * or that one of the three leadership seats is acting on an owner's behalf. **So
 * a teacher who is not in charge of an item cannot transfer it, cannot reclaim
 * it, and cannot use either verb to learn anything about it** — `manageOwn` is a
 * grant to the owner, not a promotion. What it adds is not authority over other
 * people's property; it is the ability to stop being the answerable party for
 * one's own, which until this action existed required an administrator's desk.
 *
 * A teacher still therefore cannot move property to an arbitrary third party
 * (`transferCustody` is `update`), cannot appoint or clear a manager for anything
 * (`assignManager` is `update`), and cannot sign off a write-off (`approve`).
 * What they *can* do is the whole round trip on their own equipment: see what is
 * on the shelf, take one, hand it back, and — when they are the owner in charge
 * of it — see what is out with other people, call it back, or pass the whole
 * responsibility on.
 *
 * **The scoping is enforced in the procedures, not by the permission.** That is
 * the invariant a future editor will break: `requirePermission` in
 * `packages/api/src/index.ts` short-circuits only the `ADMIN_ROLES` seats and
 * otherwise consults this statement, so a grant here says *which procedures may
 * run*, never *which rows they may return* — or, for `manageOwn`, which rows they
 * may **write**. Of the five procedures on `read`, three carry item rows and scope
 * them in their own queries (`listMyItems`, `listCustodyHistory`,
 * `listLentByMe`), one (`listCategories`) carries no item and no person at all,
 * and the fifth (`listTakeableItems`) carries item rows the caller has no
 * relationship with and is narrowed by **projection** instead of by predicate,
 * because what it withholds is a column rather than a row. Both of those are the
 * same obligation, and both procedures on `manageOwn` narrow their **write** to
 * items the caller manages. A permission that says "you may act on things you
 * own" and a handler that checks "you do own this" are two different claims, and
 * only the second is a security control: `manageOwn`'s name names a scope that an
 * access-control statement cannot express, so the narrowing **must** live in the
 * handler. Adding a sixth procedure on `requireInventoryPermission("read")`,
 * `("take")` or `("manageOwn")` without one of those narrowings is a data leak or
 * an over-grant, not a style choice.
 */
export const teacher = ac.newRole({
  student: ["read"],
  mark: ["create", "read", "update"],
  exam: ["read"],
  assignment: ["read"],
  inventory: ["read", "take", "manageOwn"],
});

/**
 * Teacher-requester — someone who signed up wanting staff access and is
 * waiting on an administrator to approve them. Deliberately no staff
 * permissions: until promotion they can sign in and verify their email, but
 * nothing else. Promotion to `teacher` is the admin's decision.
 */
export const teacherRequester = ac.newRole({
  qualification: ["create", "read"],
});
