import { ORPCError } from "@orpc/server";
import {
  classPeriodSubject,
  classPeriodTeacher,
  classPeriodTeacherInsertSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { eq } from "drizzle-orm";
import { pick } from "valibot";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";
import { isUniqueViolation } from "../../../lib/db-errors";
import {
  assertTeacherEligibleForYear,
  getClassForAcademicYear,
} from "../teacher-eligibility";

/**
 * Name a teacher for a subject already on the timetable. The second, later
 * step of the subject-first flow: `createClassPeriodSubject` puts the subject
 * on the slot with nobody teaching it yet, and this names one teacher for it.
 *
 * Several rows may point at the same `classPeriodSubjectId` — co-taught
 * subjects (a lead teacher and a support teacher in the same period) are a
 * real timetable shape. The DB UNIQUE constraint on
 * (classPeriodSubjectId, staffId) refuses only a *duplicate* — the same
 * teacher named twice for the same subject-slot entry.
 */
export const assignTeacherToPeriodSubject = requireAssignmentPermission(
  "create"
)
  .input(
    v.object({
      classPeriodSubjectId: v.pipe(v.string(), v.minLength(1)),
      ...pick(classPeriodTeacherInsertSchema, ["staffId"]).entries,
      isCombinedSession: v.optional(v.boolean()),
    })
  )
  .handler(async ({ input, context }) => {
    const [subject] = await context.db
      .select()
      .from(classPeriodSubject)
      .where(eq(classPeriodSubject.id, input.classPeriodSubjectId));

    if (!subject) {
      throw new ORPCError("NOT_FOUND", {
        message: "Period subject not found",
      });
    }

    const classRecord = await getClassForAcademicYear(
      context.db,
      subject.academicYearId,
      subject.classId
    );

    await assertTeacherEligibleForYear({
      db: context.db,
      academicYearId: subject.academicYearId,
      staffId: input.staffId,
      subjectKey: subject.subjectKey,
      gradeLevel: classRecord.gradeLevel,
    });

    const id = crypto.randomUUID();

    try {
      const [record] = await context.db
        .insert(classPeriodTeacher)
        .values({
          id,
          classPeriodSubjectId: input.classPeriodSubjectId,
          staffId: input.staffId,
          isCombinedSession: input.isCombinedSession ?? false,
        })
        .returning();

      if (!record) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      return {
        id: record.id,
        classPeriodSubjectId: record.classPeriodSubjectId,
        staffId: record.staffId,
        isCombinedSession: record.isCombinedSession,
        createdAt: record.createdAt.toISOString(),
      };
    } catch (error) {
      if (
        isUniqueViolation(error, "class_period_teacher_subject_staff_unique")
      ) {
        throw new ORPCError("CONFLICT", {
          message: "This teacher is already assigned to this subject here",
        });
      }
      throw error;
    }
  });
