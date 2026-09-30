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
    "acknowledge",
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
    "acknowledge",
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
    "acknowledge",
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
    "acknowledge",
  ],
});

/**
 * Inventory Administrator \u2014 a seeded, inventory-only seat (see
 * `packages/auth/src/admin.ts`). Everything the school-wide register, custody
 * ledger, borrows, issues and disposals need, so this account is the one place
 * custody is assigned, transferred and returned to the store \u2014 never the
 * teacher on the other end of the assignment.
 *
 * Deliberately **no** `take` or `manageOwn`: those two actions exist only so a
 * teacher can claim/hand back their own custody or reassign what they already
 * manage, and this redesign removes that self-service entirely. Everything
 * `take`/`manageOwn` used to do for a teacher, this seat does instead through
 * `update`-gated `transferCustody` (assign to a named teacher) and
 * `assignManager` (appoint who is in charge) \u2014 both `adminOnlyProcedure`
 * today, widened in `packages/api/src/index.ts` to also admit this role.
 *
 * Not in `ADMIN_ROLES`: this seat does not reach staff management, leave
 * review, academic years or any other admin surface \u2014 only inventory.
 */
export const inventoryAdmin = ac.newRole({
  inventory: ["create", "read", "update", "delete", "approve", "acknowledge"],
});

/**
 * Leave Administrator — a seeded, leave-only seat (see
 * `packages/auth/src/admin.ts`). Reviews and reports on the school-wide leave
 * ledger and sets leave-type entitlements/quotas — everything
 * `academicAdmin` used to reach through `academicProcedure` for
 * `listLeaveRequests`, and everything `admin` alone used to reach through
 * `adminOnlyProcedure` for the three entitlement procedures.
 *
 * There is no `leave` resource in `statement` — leave authorization has
 * always been role-string gated (`leaveOverseerProcedure` /
 * `leaveManagerProcedure` in `packages/api/src/index.ts`), not
 * permission-checked, so this role carries no statement grant of its own.
 * It exists so the seat is a real, nameable role better-auth's admin plugin
 * can assign and display — not so a `requirePermission` check can consult it.
 *
 * Not in `ADMIN_ROLES`, and it does not inherit the leadership
 * recommend/finalize authority: that chain is resolved from `staffPosition`
 * rows (or the seeded principal/vicePrincipal role strings) in
 * `resolveAuthority`, and this seat holds neither. It reviews the queue and
 * sets quotas; it does not stand in the Deputy → Principal approval chain.
 */
export const leaveAdmin = ac.newRole({});

/**
 * Academic Administrator \u2014 the seeded academic desk (see
 * `packages/auth/src/admin.ts`): the teacher register, class and period
 * assignment, attendance, academic years, teacher requests and the accounts
 * list. Its own workspace at `/academic-admin/$year`, deliberately separate
 * from `/admin/$year` so the seat cannot wander into the register or the
 * top-administrator-only screens.
 *
 * **`...adminAc.statements` is the accounts grant, and it is deliberate.**
 * The users page drives ban/unban/session-revocation through better-auth's
 * admin plugin (`authClient.admin.*`), which consults these `user`/`session`
 * statements rather than a role name. Without them the seat reaches
 * `/academic-admin/$year/users` and every button on it fails. It buys account
 * administration and nothing else: the role-transition hook in
 * `packages/auth/src/index.ts` still refuses every role change except to
 * `teacher` or `user`, and the seeded institutional accounts are protected
 * from both ban and role change by `isSeededAccount`.
 *
 * **No `inventory`, `file`, `student`, `mark` or `exam` grant.** The register
 * is the Inventory Administrator's desk, and `requirePermission` in
 * `packages/api/src/index.ts` does not bypass this role the way it bypasses
 * `ADMIN_ROLES` \u2014 so the grants below are the whole of what this seat can
 * reach through the permission-checked procedures (staff CRUD, class/period
 * assignment, qualifications). The `adminProcedure`-family reads the academic
 * pages need sit on the separate role-list tiers in `packages/api/src/index.ts`
 * (`academicProcedure`, `adminOrAcademicProcedure`).
 *
 * Not in `ADMIN_ROLES`: leadership leave review, position appointment and the
 * inventory overseer tiers must not follow from this seat. Nor is the
 * leave queue itself: `listLeaveRequests` moved from `academicProcedure` to
 * `leaveOverseerProcedure` when the Leave Administrator seat was carved out,
 * so this desk no longer sees the school-wide leave ledger at all — leave
 * review and entitlements belong to `leaveAdmin` (and `ADMIN_ROLES`) now.
 */
export const academicAdmin = ac.newRole({
  ...adminAc.statements,
  staff: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  qualification: ["create", "read", "approve"],
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
 * `inventory: ["read", "acknowledge"]` is the entire inventory surface of this
 * role, and it is **two grants**. This paragraph used to describe three of them
 * and a round trip — `read`, `take` and `manageOwn`, "see what is on the shelf,
 * take one, hand it back, call it back" — and it was left behind when the role was
 * narrowed, which is the exact failure this file is written to prevent: a comment
 * that reads as a specification of what a teacher can do and is not one.
 *
 * **Why the round trip is gone.** Custody in this school is set from the seeded
 * Inventory Administrator's seat, not by whoever opens a row. The three
 * self-service verbs (`takeItem` and `releaseCustody` on `take`,
 * `transferOwnership` and `reclaimCustody` on `manageOwn`) are still written,
 * still tested, and still reachable — by the three leadership seats, which hold
 * both grants. They are not reachable by a teacher, and the affordances that
 * would have offered them were removed with the grant: the teacher's own page
 * reads `myItems`, `lent` and `history` and offers nothing else, and the
 * register's row menu draws its self-service pair only for a role that holds
 * `take` (`canSelfServeInventory` in `roles.ts`). So the seat that could not
 * press the buttons is not shown them.
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
 *   **It is on `read` and therefore still reachable by this role, and nothing in
 *   the teacher page calls it** — a catalogue for an act the caller cannot
 *   perform. That is left in place rather than re-gated because it discloses no
 *   person and narrowing it would mean a second, bespoke guard for a procedure
 *   with no caller; the line to remember is that a `read` grant here is about
 *   disclosure, not about whether the act behind it is available.
 *
 * It reaches **no** school-wide register, no ledger, no movement list and no
 * write-off list. `listItems`, `getItem`, `listUnits`, `listAssignableStaff`,
 * `listBorrows`, `listIssues`, `listTransactions`, `listAuditLogs` and
 * `listDisposals` are all `adminProcedure`. The distinction to hold on to is
 * that a *register* answers "what does the school own, and who is answerable for
 * it" while a *catalogue* answers "what is free right now" — and only the second
 * question is one a teacher has any business asking.
 *
 * **`take` and `manageOwn` are not granted to this role at all**, and the two
 * paragraphs that used to count their procedures are gone with the grants. For
 * the record, and because a future editor widening this role will want to know
 * what they are picking up:
 *
 * - `take` reaches exactly two procedures: `takeItem`, narrowed to the caller's
 *   own staff row with `newCustodianStaffId` not an input; and `releaseCustody`,
 *   which is now **required to name a successor** (`custodian_staff_id` is
 *   `NOT NULL`) and is narrowed to the item the caller already holds.
 * - `manageOwn` reaches exactly two: `transferOwnership` (required, non-nullable
 *   `newOwnerStaffId`) and `reclaimCustody` (the owner calling an item back from
 *   a colleague; it requires a reason and lands the item with the person in
 *   charge). Both narrow in-handler to items the caller manages.
 *
 * **Re-granting either one is a product decision, not a bug fix**, and it would
 * need the two things the narrowing removed alongside it: the round trip in the
 * teacher's own page, and a reason to believe a teacher is the right person to
 * decide who holds school property.
 *
 * A teacher therefore cannot move property to an arbitrary third party
 * (`transferCustody` is `update`), cannot appoint an owner for anything
 * (`assignManager` is `update`), cannot claim or hand back anything
 * (`take` is absent), and cannot sign off a write-off (`approve`). What they
 * *can* do is see: what they hold, what they are answerable for that is out with
 * somebody else, the trail of either, and the handover notices addressed to them
 * — which they acknowledge or dispute, their own read receipt on somebody else's
 * change.
 *
 * **The scoping is enforced in the procedures, not by the permission.** That is
 * the invariant a future editor will break: `requirePermission` in
 * `packages/api/src/index.ts` short-circuits only the `ADMIN_ROLES` seats and
 * otherwise consults this statement, so a grant here says *which procedures may
 * run*, never *which rows they may return*. Of the five procedures on `read`,
 * three carry item rows and scope them in their own queries (`listMyItems`,
 * `listCustodyHistory`, `listLentByMe`), one (`listCategories`) carries no item
 * and no person at all, and the fifth (`listTakeableItems`) carries item rows the
 * caller has no relationship with and is narrowed by **projection** instead of by
 * predicate, because what it withholds is a column rather than a row. Both of
 * those are the same obligation. `acknowledge` is the narrowest grant in the
 * statement: it reaches exactly `acknowledgeCustodyNotice` and
 * `disputeCustodyNotice`, each scoped in-handler to the caller's own recipient
 * row. Adding a sixth procedure on `requireInventoryPermission("read")` without
 * one of those narrowings is a data leak, not a style choice.
 */
export const teacher = ac.newRole({
  student: ["read"],
  mark: ["create", "read", "update"],
  exam: ["read"],
  assignment: ["read"],
  // Read-only. Custody \u2014 who has what, when it moves, when it comes back \u2014
  // is set exclusively by the seeded Inventory Administrator account (see
  // `inventoryAdmin` above); a teacher can see their own equipment but never
  // claim, hand back, transfer or reassign it themselves. `take` and
  // `manageOwn` are deliberately absent.
  //
  // `acknowledge` is the one exception, and it is not a custody action: it
  // reaches exactly two procedures, `acknowledgeCustodyNotice` and
  // `disputeCustodyNotice`, both scoped in-handler to the caller's own
  // notice row. Marking "I saw this" (or disputing it) about a change someone
  // else already made moves nothing \u2014 it is the teacher's own read receipt,
  // not a lever over who holds anything.
  inventory: ["read", "acknowledge"],
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
