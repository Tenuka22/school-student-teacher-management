import { ORPCError } from "@orpc/server";
import type { Database } from "@school-student-teacher-management/db";
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  studentClassAssignment,
  subjectMark,
  subjectMarkInsertSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { requireMarkPermission } from "../../index";

/**
 * Confirms the caller may record marks for the class a student sits in, and
 * returns the `staff.id` the mark has to be attributed to.
 *
 * A teacher holds `mark: ["create", "read", "update"]`, and the procedure used
 * to take that as the whole permission story: any teacher could post a mark
 * against any `studentClassAssignmentId` — another teacher's class, another
 * year — because nothing connected the caller to the class.
 *
 * **Two id spaces, and the column is in the `staff` one.**
 * `subject_mark.entered_by_staff_id` is `NOT NULL` and is a live foreign key to
 * `staff.id` (`subject_mark_entered_by_staff_id_staff_id_fk`, `ON DELETE
 * CASCADE`). It is not a `user.id`. The write used to put
 * `context.session.user.id` into that column — a `user.id` in a `staff.id`
 * column — so every real call raised a foreign key violation and the
 * attribution the column exists for was never written at all. The value this
 * function returns is the `staff.id` it just compared against
 * `class.homeroomTeacherId`, so what the check verified and what the row
 * records are the same fact rather than two ids that merely look alike.
 *
 * ── Who may enter a mark ────────────────────────────────────────────────────
 *
 * **The homeroom teacher of that class, and nobody else.** There is no role
 * check on the path below: `admin`, `principal` and `vicePrincipal` are refused
 * exactly as any other non-homeroom caller is. This comment used to say the
 * three leadership seats "may still enter any mark". That was never true — the
 * guard has never carried a role check — and it was the reason a Principal
 * believed a permission they did not have. The rule is stated as the code
 * enforces it, and the enforcement is left alone: widening it to the three
 * seats is a product decision, not a documentation fix.
 *
 * ── Not enough ──────────────────────────────────────────────────────────────
 *
 * `assertCallerTeachesClass` in `./assert-caller-teaches-class.ts` is the
 * *wider* rule — homeroom, sub-homeroom or a period assignment in the class's
 * year — and it lets the three leadership seats through by role. Neither of
 * those is enough here, deliberately. Reading a class's marks and writing into
 * them are different acts held to different bars: a sub-homeroom teacher
 * standing in for a term, a subject teacher with one period, and a principal
 * doing oversight are all legitimate reasons to *see* a class, and none of them
 * is a claim on being the person who signs its results.
 *
 * ── Why a caller with no `staff` row is refused, not tolerated ──────────────
 *
 * `getInventoryActor` returns `staffId: null` for exactly this case and argues
 * at length that a null actor is legitimate. That argument is sound *there* and
 * it does not transfer, because inventory's columns are nullable, `set null`,
 * and the write is attributed by a denormalised `userId` + `name` regardless.
 * `subject_mark` has no such fallback: `entered_by_staff_id` is `NOT NULL`, the
 * table carries no user column and no denormalised name, and the schema's own
 * description of it is "staff member who entered this mark". A mark cannot be
 * attributed to nobody, and the schema offers no shape in which it could be.
 * So this is the exception `getInventoryActor` says a refusal may be: the one
 * procedure where "your account is not linked to a staff record" is the honest
 * answer rather than a bug — and it is a named `FORBIDDEN` with a sentence a
 * principal can act on, not a constraint violation leaking out of a `values()`.
 *
 * The consequence is worth stating: until such a column exists, a leadership
 * seat with no staff row cannot enter a mark. That is not a new inconsistency —
 * it is the same homeroom-only fact the paragraph above already states, said in
 * the one place the caller will actually read it.
 */
export const assertCanEnterMarkForAssignment = async (
  db: Database,
  userId: string,
  studentClassAssignmentId: string
): Promise<string> => {
  const [row] = await db
    .select({ homeroomTeacherId: class_.homeroomTeacherId })
    .from(studentClassAssignment)
    .innerJoin(class_, eq(studentClassAssignment.classId, class_.id))
    .where(eq(studentClassAssignment.id, studentClassAssignmentId))
    .limit(1);

  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: "That student is not assigned to a class",
    });
  }

  const [caller] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.userId, userId))
    .limit(1);

  if (!caller) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "Your account is not linked to a staff record, so it cannot enter marks",
    });
  }

  if (row.homeroomTeacherId !== caller.id) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "Marks can only be entered by the homeroom teacher of the class this student is in",
    });
  }

  /**
   * The caller's own `staff.id`, returned rather than re-read. `enterSubjectMark`
   * writes exactly this into `entered_by_staff_id`, so the id the guard compared
   * to `class.homeroomTeacherId` is the id the row carries — one resolution, one
   * query, and no second code path that could resolve the caller differently.
   */
  return caller.id;
};

export const enterSubjectMark = requireMarkPermission("create")
  .input(
    pick(subjectMarkInsertSchema, [
      "studentClassAssignmentId",
      "examTypeId",
      "subjectKey",
      "mark",
      "grade",
    ])
  )
  .handler(async ({ input, context }) => {
    /**
     * The guard resolves the caller to their `staff` row and hands that `staff.id`
     * back, so the attribution written below is the same id the guard checked
     * against the class's homeroom teacher.
     */
    const enteredByStaffId = await assertCanEnterMarkForAssignment(
      context.db,
      context.session.user.id,
      input.studentClassAssignmentId
    );

    const id = crypto.randomUUID();

    const [record] = await context.db
      .insert(subjectMark)
      .values({
        id,
        studentClassAssignmentId: input.studentClassAssignmentId,
        examTypeId: input.examTypeId,
        subjectKey: input.subjectKey,
        mark: input.mark,
        grade: input.grade,
        enteredByStaffId,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      studentClassAssignmentId: record.studentClassAssignmentId,
      examTypeId: record.examTypeId,
      subjectKey: record.subjectKey,
      mark: record.mark,
      grade: record.grade,
      enteredByStaffId: record.enteredByStaffId,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
