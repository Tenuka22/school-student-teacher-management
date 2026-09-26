import { ORPCError } from "@orpc/server";
import {
  class_,
  classTeacherAssignmentHistory,
} from "@school-student-teacher-management/db/schema/academics";
import {
  attendancePolicy,
  shortLeaveUsage,
  teacherAttendance,
} from "@school-student-teacher-management/db/schema/attendance";
import {
  leaveEntitlement,
  leaveRequest,
} from "@school-student-teacher-management/db/schema/leaves";
import {
  examType,
  gradeScale,
  studentAdmission,
  studentClassAssignment,
  studentSubjectSelection,
} from "@school-student-teacher-management/db/schema/marking";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYear,
  academicYearIdSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { teacherSubjectAssignment } from "@school-student-teacher-management/db/schema/teacher-subjects";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure } from "../../index";

/**
 * Tables that hold actual user-created data scoped to an academic year.
 * `gradeSubjectConfig` is deliberately excluded — it's auto-populated from
 * the curriculum structure version at creation time, not user data, so
 * every year would always fail the emptiness check if it were included.
 *
 * **Every table here is `ON DELETE CASCADE` from `academic_year`, so a table
 * missing from this list is deleted silently.** The procedure still returns
 * `{ success: true }` and the operator is told nothing, which is why this
 * array is a list of every year-scoped table carrying real data rather than a
 * summary of the interesting ones. `exam_type` and `grade_scale` were missing,
 * and so were the three student tables. Because `subject_mark` cascades from
 * both `student_class_assignment` and `exam_type`, deleting one year with no
 * other dependents used to take that year's admissions, class placements,
 * subject selections and **every mark entered in it** with it, silently. If
 * you add a year-scoped table to the schema, add it here in the same commit.
 */
const DEPENDENT_TABLES = [
  { table: class_, label: "classes" },
  { table: staffPosition, label: "position assignments" },
  { table: teacherSubjectAssignment, label: "subject assignments" },
  { table: leaveRequest, label: "leave requests" },
  { table: leaveEntitlement, label: "leave entitlements" },
  { table: teacherAttendance, label: "attendance records" },
  { table: attendancePolicy, label: "attendance policy" },
  { table: shortLeaveUsage, label: "attendance usage" },
  { table: classPeriodAssignment, label: "period assignments" },
  { table: classTeacherAssignmentHistory, label: "homeroom history" },
  { table: examType, label: "exam types" },
  { table: gradeScale, label: "grade scales" },
  { table: studentAdmission, label: "student admissions" },
  { table: studentClassAssignment, label: "student class assignments" },
  { table: studentSubjectSelection, label: "student subject selections" },
] as const;

export const deleteAcademicYear = adminOnlyProcedure
  .input(v.object({ id: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(academicYear)
      .where(eq(academicYear.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Academic year not found" });
    }

    if (existing.deletedAt) {
      throw new ORPCError("BAD_REQUEST", {
        message: "This academic year is already deleted",
      });
    }

    if (existing.isCurrent) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Cannot delete the active academic year. Switch to another year first.",
      });
    }

    const dependentRows = await Promise.all(
      DEPENDENT_TABLES.map(({ table }) =>
        context.db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.academicYearId, input.id))
          .limit(1)
      )
    );

    const firstDependent = DEPENDENT_TABLES.find(
      (_, index) => (dependentRows[index] ?? []).length > 0
    );

    if (firstDependent) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Cannot delete this academic year: it still has ${firstDependent.label}. Remove them first.`,
      });
    }

    // Soft delete, not `DELETE FROM` — every dependent table above is
    // `ON DELETE CASCADE` from `academic_year`, so this emptiness check is
    // what makes a hard delete survivable at all, and a soft delete needs it
    // for a different reason: a year is a fact about the school's history,
    // and hiding an empty one from the switcher is not the same claim as
    // saying the year never happened.
    await context.db
      .update(academicYear)
      .set({ deletedAt: new Date() })
      .where(eq(academicYear.id, input.id));

    return { success: true };
  });
