import { ORPCError } from "@orpc/server";
import {
  class_,
  classTeacherAssignmentHistory,
} from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodAssignment,
  periodConfig,
} from "@school-student-teacher-management/db/schema/periods";
import {
  academicYear,
  academicYearIdSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

/**
 * Tables that hold actual user-created data scoped to an academic year.
 * `gradeSubjectConfig` is deliberately excluded — it's auto-populated from
 * the curriculum structure version at creation time, not user data, so
 * every year would always fail the emptiness check if it were included.
 */
const DEPENDENT_TABLES = [
  { table: class_, label: "classes" },
  { table: staffPosition, label: "position assignments" },
  { table: classPeriodAssignment, label: "period assignments" },
  { table: periodConfig, label: "period configuration" },
  { table: classTeacherAssignmentHistory, label: "homeroom history" },
] as const;

export const deleteAcademicYear = adminProcedure
  .input(v.object({ id: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(academicYear)
      .where(eq(academicYear.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Academic year not found" });
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

    await context.db.delete(academicYear).where(eq(academicYear.id, input.id));

    return { success: true };
  });
