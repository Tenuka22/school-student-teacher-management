/**
 * The one place in the marking router that answers "may this caller see this
 * class?".
 *
 * A teacher holds `student: ["read"]`, `mark: ["create", "read", "update"]`,
 * `exam: ["read"]` and `assignment: ["read"]`
 * (`packages/auth/src/permissions.ts`). `requirePermission` in
 * `packages/api/src/index.ts` reads those statements and then stops: it says a
 * *procedure* may run and nothing at all about which *rows* it may return. Eight
 * procedures in this folder used to take that as the whole story, and
 * `listStudents` was the worst of them — an unqualified
 * `db.select().from(student)` with no `where` and no `limit`, so `student: read`
 * was the entire school roll: every pupil's `dateOfBirth`, `phone`,
 * `parentPhone` and `admissionNumber`. This module is the narrowing that was
 * missing, and it follows `assertCanEnterMarkForAssignment` in
 * `./enter-subject-mark.ts` as the model — the same idea, widened from "may this
 * teacher enter this mark" to "does this caller teach this class at all".
 *
 * ── What "teaches this class" means, and why ───────────────────────────────
 *
 * The class in question is one `class` row, so it carries its own
 * `academicYearId` and the year is never something the caller gets to choose.
 * A caller **teaches class C** when, for the year `C` belongs to, any of these
 * is true:
 *
 * 1. **`class.homeroomTeacherId` is the caller.** Included because it is the
 *    school's own statement of the claim: `assertCanEnterMarkForAssignment`
 *    already trusts it for the stricter question of who may *write* a mark, and
 *    the homeroom teacher owns the class's academic welfare — the register, the
 *    marks, the pupil's year.
 * 2. **`class.subHomeroomTeacherId` is the caller.** Included for the same
 *    reason it exists in the schema at all: a class routinely has a deputy when
 *    the homeroom teacher is on leave, and a deputy who covers a term is the
 *    person standing in front of that class. Refusing them the roster would make
 *    the column useless the one week it exists for. It is deliberately *not*
 *    enough to enter a mark — see "not enough" in `enter-subject-mark.ts` — but
 *    reading a roster and writing to it are different acts and are held to
 *    different bars.
 * 3. **A `class_period_assignment` row for the class, in the class's year, names
 *    the caller.** Included because that row *is* the claim: it is the school
 *    having scheduled this teacher to teach this class, in a named period, at a
 *    named subject. A subject teacher's claim on the roster they teach in front
 *    of is not a favour or a convenience — the period cannot be taught without
 *    the class list, and the school already decided the row is legitimate when
 *    it was written.
 *
 * Deliberately **excluded**, each for a reason that is checkable rather than
 * merely asserted:
 *
 * - **`class_teacher_assignment_history`.** That table is an audit trail of
 *   *past and replaced* homeroom assignments. Being recorded in it says a
 *   teacher once held the seat; it says nothing about this year's roster, and a
 *   trail is exactly the kind of thing that accumulates stale grants. A teacher
 *   moved off 9-B last year is not on 9-B's teaching staff now.
 * - **A period assignment, homeroom seat or sub-homeroom seat in a *different*
 *   academic year.** `class`, `class_period_assignment` and
 *   `student_class_assignment` are all keyed by `academicYearId`, and a year
 *   rollover mints a *new* `class` row (9-B last year and 9-B this year are two
 *   rows, not one row with a flag). So "last year's claim" is a different
 *   `classId` and the year predicates below already exclude it — but the reason
 *   is written down because it is the question the school will ask, and because
 *   a future refactor that made the year optional would otherwise quietly open
 *   the hole.
 * - **A `staff_position` row** (sectional head, principal, and so on). A
 *   position is a grade-wide or school-wide oversight label —
 *   `sectionalScope` is a *grade*, not a class — and nothing in the schema maps
 *   a grade-scoped seat onto a specific class's roster. Admitting it would hand
 *   a sectional head every roll in the grade on the strength of a one-word
 *   scope. Oversight is what the leadership bypass below is for; a position is
 *   not.
 * - **A `staff` row at all.** Being on the teaching roll is not a claim on
 *   anyone's students. See `isTeachingStaff`.
 *
 * ── The leadership seats ────────────────────────────────────────────────────
 *
 * `admin`, `principal` and `vicePrincipal` **do bypass this check**, by role and
 * not by staff row. Three reasons, and the third is the important one:
 *
 * 1. These procedures are reachable by those three roles today —
 *   `requireStudentPermission` / `requireMarkPermission` short-circuit the
 *   `ADMIN_ROLES` seats in `requirePermission` before they ever consult a
 *   statement. A guard that then refused a principal would produce a
 *   `FORBIDDEN` immediately after a successful authorization check, which
 *   `getInventoryActor` names for exactly what it is: "a refusal that follows a
 *   successful authorization check is a bug, not a policy."
 * 2. School-wide reading of the roll and the marks is the job those seats exist
 *   to do. The same tier is spelled `adminProcedure` everywhere else.
 * 3. **A principal is a leader, not a teacher.** The seeded Principal and Deputy
 *   Principal accounts are users with no staff identity on purpose
 *   (`packages/auth/src/admin.ts`), and where a real principal *does* hold a
 *   `staff` row that row is `staffCategory = "officeStaff"` with a
 *   `staffPosition`, not a homeroom assignment. So the bypass is keyed on the
 *   **role string** and the class-claim logic above is never reached for a
 *   leadership seat: a principal with a staff row is not thereby the homeroom
 *   teacher of anything, and nothing in this module would say otherwise. What
 *   the bypass grants is oversight, not a classroom.
 *
 * Every procedure therefore calls the `…OrLeadershipSeat` wrapper rather than
 * the bare rule, so the bypass is stated once, here, instead of eight times.
 */
import { ORPCError } from "@orpc/server";
import { isAdminRole } from "@school-student-teacher-management/auth";
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { studentClassAssignment } from "@school-student-teacher-management/db/schema/marking";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYear,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Context } from "../../context";

type Database = Context["db"];

/**
 * `staff` joined onto `class.homeroomTeacherId` purely to put a **name** in a
 * refusal message. A `FORBIDDEN` that says "not your class" leaves a teacher
 * with nothing to act on; "its homeroom teacher is R. Perera" tells them who to
 * ask. A `left` join, because a class with a null homeroom slot is a real state
 * (a class nobody has claimed yet) and the message has to be able to say so.
 */
const homeroomStaff = alias(staff, "class_homeroom_staff");

/**
 * On the teaching roll and still employed — the TypeScript mirror of the
 * `activeOrUnsetEmployment` / `teachingStaff` pair in
 * `packages/api/src/routers/staff/teacher-eligibility.ts`.
 *
 * That pair decides who may be *scheduled*; this one decides who may be *read*,
 * and it is a function rather than a SQL fragment because the guard has to tell
 * the two failure modes apart in order to say which one happened (see
 * `assertCallerIsTeachingStaff`). The rule is identical, including the reason
 * `employmentStatus` accepts null: a null means nobody has confirmed it yet, and
 * refusing those would lock a working teacher out of their own class because an
 * administrator left one field blank.
 */
const isTeachingStaff = (caller: {
  staffCategory: string;
  employmentStatus: string | null;
}): boolean =>
  caller.staffCategory === "teacher" &&
  (caller.employmentStatus === "active" || caller.employmentStatus === null);

/**
 * Who is calling, in the shape the guards below compare against.
 *
 * `staffId` is nullable and **that is not a bug**: the seeded `admin` /
 * `principal` / `vicePrincipal` accounts are users with no staff identity on
 * purpose (see `packages/auth/src/admin.ts`), and `name` falls back to the
 * session display name so a message can always name somebody. The same
 * reasoning as `getInventoryActor`, for the same reason.
 */
export interface MarkingActor {
  /** The caller's `staff` row, or null for an account that has none. */
  staffId: string | null;
  /** Never null — every refusal has to be able to name the caller. */
  name: string;
  /** The session role, and the only thing the leadership bypass reads. */
  role: string;
}

/**
 * `isAdminRole` from the auth package, which is the one canonical list of the
 * three seats (`packages/auth/src/roles.ts`) and the same set as `ADMIN_ROLES`
 * in `packages/api/src/index.ts`. Imported rather than restated: the roles
 * module is dependency-free and the api package already imports the auth barrel
 * elsewhere, so there is no bundling reason to copy the list a third time.
 */
const isLeadershipSeat = (actor: MarkingActor): boolean =>
  isAdminRole(actor.role);

/**
 * The session user's name, falling back the way `getInventoryActor` falls back,
 * so `MarkingActor.name` is a `string` and no caller null-checks it.
 */
const sessionDisplayName = (user: {
  name: string;
  username?: string | null;
  displayUsername?: string | null;
}): string => {
  for (const candidate of [user.name, user.username, user.displayUsername]) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "Unknown user";
};

/**
 * Resolve the caller to a `staff` row, a name and a role.
 *
 * Takes the whole `Context` rather than a `userId` because the three values are
 * always wanted together and the role is not in the database — it is on the
 * session, and reading it from the `user` table would be a second authority for
 * a fact the session already states.
 */
export const resolveMarkingActor = async (
  context: Context
): Promise<MarkingActor> => {
  const sessionUser = context.session?.user;
  if (!sessionUser) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Sign in to reach student and mark records",
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
    role: sessionUser.role ?? "",
  };
};

/**
 * The caller's own `staff` row, or `undefined` for an account with none.
 *
 * Selected as the two columns the predicate needs rather than the whole row, so
 * a `staff` read that exists only to answer "is this person on the teaching
 * roll" does not also pull a NIC, a home address and a next-of-kin phone number
 * across the wire to decide a boolean.
 */
const readCallerStaffRow = async (
  db: Database,
  actor: MarkingActor
): Promise<
  { staffCategory: string; employmentStatus: string | null } | undefined
> => {
  if (actor.staffId === null) {
    return undefined;
  }

  const [record] = await db
    .select({
      staffCategory: staff.staffCategory,
      employmentStatus: staff.employmentStatus,
    })
    .from(staff)
    .where(eq(staff.id, actor.staffId))
    .limit(1);

  return record;
};

/**
 * Half of "teaches this class", and the half with its own failure messages:
 * "you are not on the staff roll" and "you are not on *this* class" are
 * different conversations, and a teacher who has been moved to office staff
 * deserves to be told which one happened.
 *
 * Returns the caller's `staff` id so that every caller gets a narrowed
 * `string` and none of them has to re-derive that it is not null.
 */
const assertCallerIsTeachingStaff = (
  actor: MarkingActor,
  caller: { staffCategory: string; employmentStatus: string | null } | undefined
): string => {
  if (actor.staffId === null || !caller) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "Your account is not linked to a staff record, so it has no class to teach",
    });
  }

  if (!isTeachingStaff(caller)) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "Only teaching staff — teaching category, still employed or with an unset employment status — can reach a class roster",
    });
  }

  return actor.staffId;
};

/**
 * Read the class the caller asked about, and refuse it if the caller named a
 * year it does not belong to.
 *
 * A year mismatch is `NOT_FOUND` and not `FORBIDDEN`, matching
 * `getClassForAcademicYear` in the staff folder: a class id from last year is a
 * *different class*, and telling someone "forbidden" about a class that does
 * not exist in the year they are working in would send them hunting for a
 * permissions problem they do not have.
 */
const readClassForScope = async (
  db: Database,
  input: { classId: string; academicYearId?: string }
) => {
  const [row] = await db
    .select({
      name: class_.name,
      academicYearId: class_.academicYearId,
      homeroomTeacherId: class_.homeroomTeacherId,
      subHomeroomTeacherId: class_.subHomeroomTeacherId,
      homeroomTeacherName: homeroomStaff.name,
    })
    .from(class_)
    .leftJoin(homeroomStaff, eq(class_.homeroomTeacherId, homeroomStaff.id))
    .where(eq(class_.id, input.classId))
    .limit(1);

  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Class not found" });
  }

  if (
    input.academicYearId !== undefined &&
    input.academicYearId !== row.academicYearId
  ) {
    throw new ORPCError("NOT_FOUND", {
      message: "Class not found for the selected academic year",
    });
  }

  return row;
};

/**
 * The refusal sentence, assembled in one place so every class-scoped procedure
 * in this folder refuses a teacher in the same words and names the same two
 * facts: which class, and who does hold it.
 *
 * "You are not on 9-B's teaching staff this year; its homeroom teacher is R.
 * Perera" is actionable. "Forbidden" is not, and a bare `FORBIDDEN` is what
 * this folder used to produce — a teacher whose screen said nothing was looking
 * at a bug.
 */
const classScopeRefusal = (subject: {
  className: string;
  homeroomTeacherName: string | null;
}): string =>
  subject.homeroomTeacherName === null
    ? `You are not on ${subject.className}'s teaching staff this year, and it has no homeroom teacher set`
    : `You are not on ${subject.className}'s teaching staff this year; its homeroom teacher is ${subject.homeroomTeacherName}`;

/**
 * The class claim itself, with no leadership bypass.
 * `assertCallerTeachesClassOrLeadershipSeat` is what the procedures call; this
 * one is the rule the school argues about, kept separately callable so it can be
 * exercised on its own without a role in the way.
 *
 * The class read and the caller read are batched because they are independent —
 * one is on `class`, one is on `staff`, and neither can reject before the
 * permission middleware has run — and the refusal needs both. This is
 * `list-custody-history.ts`'s pattern for the same two values.
 */
export const assertCallerTeachesClass = async (
  db: Database,
  input: { classId: string; academicYearId?: string },
  actor: MarkingActor
): Promise<void> => {
  const [classRow, caller] = await Promise.all([
    readClassForScope(db, input),
    readCallerStaffRow(db, actor),
  ]);

  const staffId = assertCallerIsTeachingStaff(actor, caller);

  const isHomeroom = classRow.homeroomTeacherId === staffId;
  const isSubHomeroom = classRow.subHomeroomTeacherId === staffId;

  /**
   * The timetable probe, deliberately **not** run when the caller is already the
   * homeroom or sub-homeroom teacher: a claim that has already been established
   * does not need a second one, and a homeroom teacher whose timetable has not
   * been filled in yet must still reach their own class.
   *
   * The year predicate is the *class's* year, and that is the whole reason a
   * teacher who taught 9-B last year is refused this year: `class` and
   * `class_period_assignment` are both year-keyed, and last year's slot names
   * last year's class row.
   */
  let isPeriodTeacher = false;
  if (!isHomeroom && !isSubHomeroom) {
    const [slot] = await db
      .select({ id: classPeriodAssignment.id })
      .from(classPeriodAssignment)
      .where(
        and(
          eq(classPeriodAssignment.classId, input.classId),
          eq(classPeriodAssignment.academicYearId, classRow.academicYearId),
          eq(classPeriodAssignment.staffId, staffId)
        )
      )
      .limit(1);

    isPeriodTeacher = Boolean(slot);
  }

  if (!(isHomeroom || isSubHomeroom || isPeriodTeacher)) {
    throw new ORPCError("FORBIDDEN", {
      message: classScopeRefusal({
        className: classRow.name,
        homeroomTeacherName: classRow.homeroomTeacherName,
      }),
    });
  }
};

/**
 * What the eight procedures actually call: the rule above with the leadership
 * bypass in front of it.
 *
 * The bypass is keyed on the role string and nothing else. A principal who
 * happens to hold a `staff` row is not thereby on any teaching staff, and this
 * function returns before the class-claim logic is ever reached for them — see
 * the module doc for why a leader is not a teacher.
 */
export const assertCallerTeachesClassOrLeadershipSeat = async (
  db: Database,
  input: { classId: string; academicYearId?: string },
  actor: MarkingActor
): Promise<void> => {
  if (isLeadershipSeat(actor)) {
    return;
  }

  await assertCallerTeachesClass(db, input, actor);
};

/**
 * Every class the caller teaches in one year — the predicate `listStudents`
 * needs, because a *list* cannot be guarded one class at a time.
 *
 * The three claims are unioned rather than intersected because they are three
 * independent ways of being on the staff of a class, and
 * `assertCallerTeachesClass` unions them for the same reason: requiring all
 * three would refuse a homeroom teacher with an empty timetable.
 *
 * **`null` means "not narrowed", and it is a dangerous value, so it is named
 * here rather than discovered at a call site.** It is returned only for a
 * leadership seat and it means *every* class in the year is in scope. A caller
 * that wants "the classes this teacher teaches" must handle the `null` arm
 * explicitly, and the only one that does is `listStudents` — the procedure whose
 * whole job is to choose between the administrative view and the teacher's view.
 * Treating `null` as "no classes" would be safe; treating it as "all classes"
 * is the leak this module exists to close, so the type says `string[] | null`
 * and every consumer has to make that decision in the open.
 */
export const listCallerTaughtClassIds = async (
  db: Database,
  academicYearId: string,
  actor: MarkingActor
): Promise<string[] | null> => {
  if (isLeadershipSeat(actor)) {
    return null;
  }

  const staffId = assertCallerIsTeachingStaff(
    actor,
    await readCallerStaffRow(db, actor)
  );

  // The two reads are independent — one is on `class`, one is on
  // `class_period_assignment`, and neither needs the other's result — so they
  // run together rather than costing the caller two round trips in sequence.
  const [seatHeld, periodTaught] = await Promise.all([
    db
      .select({ id: class_.id })
      .from(class_)
      .where(
        and(
          eq(class_.academicYearId, academicYearId),
          or(
            eq(class_.homeroomTeacherId, staffId),
            eq(class_.subHomeroomTeacherId, staffId)
          )
        )
      ),
    db
      .selectDistinct({ classId: classPeriodAssignment.classId })
      .from(classPeriodAssignment)
      .where(
        and(
          eq(classPeriodAssignment.academicYearId, academicYearId),
          eq(classPeriodAssignment.staffId, staffId)
        )
      ),
  ]);

  const classIds = new Set<string>(seatHeld.map((row) => row.id));
  for (const row of periodTaught) {
    classIds.add(row.classId);
  }

  return [...classIds];
};

/**
 * The id of the year the school is currently running.
 *
 * Used only by the three procedures that take no year in their input
 * (`listStudents`, `getStudent` and `getStudentHistory`). Every year-explicit
 * procedure takes the year from the caller and never guesses one: "the year you
 * are working in" and "the year you asked about" are different questions, and
 * guessing the wrong one returns a real class's real roster.
 */
export const getCurrentAcademicYearId = async (
  db: Database
): Promise<string> => {
  const [year] = await db
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(eq(academicYear.isCurrent, true))
    .limit(1);

  if (!year) {
    throw new ORPCError("NOT_FOUND", {
      message: "No academic year has been set as the current one",
    });
  }

  return year.id;
};

/**
 * A teacher reaches a student only through a class they teach. So a
 * student-keyed read resolves the student's class **for the year in question**
 * and hands it to the class guard — the student is not a scope, the class is.
 *
 * A student with no assignment in that year is `NOT_FOUND` for a teacher, and
 * the reason is the important part: there is no class to scope the read to, and
 * inventing one — falling back to "some class they were ever in" — is how a
 * history screen becomes a whole-school export. A **leadership seat sees them
 * anyway**: the bypass runs before the assignment lookup, so an administrator
 * reading a subject-selection trail for a pupil who has not been placed in a
 * class this term is not refused, because that read was never about a class.
 */
export const assertCallerReachesStudent = async (
  db: Database,
  input: { studentId: string; academicYearId: string },
  actor: MarkingActor
): Promise<void> => {
  if (isLeadershipSeat(actor)) {
    return;
  }

  assertCallerIsTeachingStaff(actor, await readCallerStaffRow(db, actor));

  const [assignment] = await db
    .select({ classId: studentClassAssignment.classId })
    .from(studentClassAssignment)
    .where(
      and(
        eq(studentClassAssignment.studentId, input.studentId),
        eq(studentClassAssignment.academicYearId, input.academicYearId)
      )
    )
    .limit(1);

  if (!assignment) {
    throw new ORPCError("NOT_FOUND", {
      message:
        "That student is not in a class in the selected academic year, so a teacher has no class through which to reach them",
    });
  }

  await assertCallerTeachesClass(
    db,
    { classId: assignment.classId, academicYearId: input.academicYearId },
    actor
  );
};

/**
 * The same rule for the procedures that take no year in their input, resolving
 * the year to the current one first.
 *
 * The consequence worth stating plainly: a teacher who taught a pupil *last*
 * year can no longer read that pupil's record. That is the intended reading of
 * "can read students in their class" — the class, this year — and it is why
 * `getStudentHistory`, which is where an old year's record is legitimately
 * wanted, is reached by someone who still teaches the pupil.
 */
export const assertCallerReachesStudentInCurrentYear = async (
  db: Database,
  studentId: string,
  actor: MarkingActor
): Promise<void> => {
  if (isLeadershipSeat(actor)) {
    return;
  }

  await assertCallerReachesStudent(
    db,
    { studentId, academicYearId: await getCurrentAcademicYearId(db) },
    actor
  );
};
