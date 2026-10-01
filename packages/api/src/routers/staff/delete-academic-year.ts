import { ORPCError } from "@orpc/server";
import {
  class_,
  classTeacherAssignmentHistory,
} from "@school-student-teacher-management/db/schema/academics";
import {
  shortLeaveUsage,
  teacherAttendance,
} from "@school-student-teacher-management/db/schema/attendance";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import {
  examType,
  gradeScale,
  studentAdmission,
  studentClassAssignment,
  studentSubjectSelection,
} from "@school-student-teacher-management/db/schema/marking";
import { classPeriodSubject } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYear,
  academicYearIdSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { teacherSubjectAssignment } from "@school-student-teacher-management/db/schema/teacher-subjects";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminOrAcademicProcedure } from "../../index";

/**
 * Tables that hold actual user-created data scoped to an academic year.
 * `gradeSubjectConfig`, `leaveEntitlement` and `attendancePolicy` are
 * deliberately excluded: `createAcademicYear` writes all three for every year,
 * so including them meant **no** year could ever be deleted (F-15). They are
 * configuration of the year, not records made in it, and the soft delete
 * below keeps them with the year anyway.
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
  { table: teacherAttendance, label: "attendance records" },
  { table: shortLeaveUsage, label: "attendance usage" },
  { table: classPeriodSubject, label: "period assignments" },
  { table: classTeacherAssignmentHistory, label: "homeroom history" },
  { table: examType, label: "exam types" },
  { table: gradeScale, label: "grade scales" },
  { table: studentAdmission, label: "student admissions" },
  { table: studentClassAssignment, label: "student class assignments" },
  { table: studentSubjectSelection, label: "student subject selections" },
] as const;

export const deleteAcademicYear = adminOrAcademicProcedure
  .input(v.object({ id: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    // Locked and probed in one transaction, sequentially: fifteen parallel
    // probes used to run on the shared ten-connection pool, and nothing
    // stopped a class being created between the probe and the delete (F-35).
    await context.db.transaction(async (db) => {
      const [existing] = await db
        .select()
        .from(academicYear)
        .where(eq(academicYear.id, input.id))
        .for("update");

      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Academic year not found",
        });
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

      for (const { table, label } of DEPENDENT_TABLES) {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- one transaction is one connection, and the first hit ends the loop
        const rows = await db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.academicYearId, input.id))
          .limit(1);
        if (rows.length > 0) {
          throw new ORPCError("BAD_REQUEST", {
            message: `Cannot delete this academic year: it still has ${label}. Remove them first.`,
          });
        }
      }

      // Soft delete, not `DELETE FROM` — every dependent table above is
      // `ON DELETE CASCADE` from `academic_year`, so this emptiness check is
      // what makes a hard delete survivable at all, and a soft delete needs it
      // for a different reason: a year is a fact about the school's history,
      // and hiding an empty one from the switcher is not the same claim as
      // saying the year never happened.
      await db
        .update(academicYear)
        .set({ deletedAt: new Date() })
        .where(eq(academicYear.id, input.id));
    });

    return { success: true };
  });
