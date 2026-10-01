import { ORPCError } from "@orpc/server";
import {
  classPeriodSubject,
  classPeriodSubjectInsertSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { pick } from "valibot";

import { requireAssignmentPermission } from "../../../index";
import { isUniqueViolation } from "../../../lib/db-errors";
import { getClassForAcademicYear } from "../teacher-eligibility";

/**
 * Put a subject on a class's timetable slot. Subject-first: this names *what*
 * is taught in a (class, day, period) slot and nothing about *who* teaches
 * it — see `assignTeacherToPeriodSubject` for the separate, later step that
 * names a teacher.
 *
 * A slot is no longer one subject: several subjects can legitimately share a
 * slot (e.g. a split period), so this only refuses a *duplicate* — the same
 * subject entered twice for the same class in the same slot — via the DB
 * UNIQUE constraint on (academicYearId, classId, dayOfWeek, periodNumber,
 * subjectKey).
 */
export const createClassPeriodSubject = requireAssignmentPermission("create")
  .input(
    pick(classPeriodSubjectInsertSchema, [
      "academicYearId",
      "classId",
      "dayOfWeek",
      "periodNumber",
      "subjectKey",
    ])
  )
  .handler(async ({ input, context }) => {
    await getClassForAcademicYear(
      context.db,
      input.academicYearId,
      input.classId
    );

    const id = crypto.randomUUID();

    try {
      const [record] = await context.db
        .insert(classPeriodSubject)
        .values({
          id,
          academicYearId: input.academicYearId,
          classId: input.classId,
          dayOfWeek: input.dayOfWeek,
          periodNumber: input.periodNumber,
          subjectKey: input.subjectKey,
        })
        .returning();

      if (!record) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      return {
        id: record.id,
        academicYearId: record.academicYearId,
        classId: record.classId,
        dayOfWeek: record.dayOfWeek,
        periodNumber: record.periodNumber,
        subjectKey: record.subjectKey,
        createdAt: record.createdAt.toISOString(),
      };
    } catch (error) {
      if (
        isUniqueViolation(error, "class_period_subject_slot_subject_unique")
      ) {
        throw new ORPCError("CONFLICT", {
          message: "This subject is already on this period for this class",
        });
      }
      throw error;
    }
  });
