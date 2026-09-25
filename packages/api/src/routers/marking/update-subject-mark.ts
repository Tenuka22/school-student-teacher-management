import {
  subjectMark,
  subjectMarkUpdateSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { requireMarkPermission } from "../../index";
import { assertCanEnterMarkForAssignment } from "./enter-subject-mark";

/**
 * Corrects a mark that was entered in error.
 *
 * The same rule as entry applies: a mark belongs to the class it was entered
 * for, so the caller must be that class's homeroom teacher. Updating by `id`
 * alone would otherwise let any teacher with `mark: ["update"]` rewrite
 * another teacher's record by guessing its identifier.
 */
export const updateSubjectMark = requireMarkPermission("update")
  .input(pick(subjectMarkUpdateSchema, ["id", "mark", "grade"]))
  .handler(async ({ input, context }) => {
    const { id, ...updates } = input;

    if (!id) {
      return null;
    }

    const [existing] = await context.db
      .select({
        id: subjectMark.id,
        studentClassAssignmentId: subjectMark.studentClassAssignmentId,
      })
      .from(subjectMark)
      .where(eq(subjectMark.id, id))
      .limit(1);

    if (!existing) {
      return null;
    }

    await assertCanEnterMarkForAssignment(
      context.db,
      context.session.user.id,
      existing.studentClassAssignmentId
    );

    const [record] = await context.db
      .update(subjectMark)
      .set(updates)
      .where(eq(subjectMark.id, id))
      .returning();

    if (!record) {
      return null;
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
