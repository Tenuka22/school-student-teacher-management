import { subjectAssignment } from "@school-student-teacher-management/db/schema/academics";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";
import { buildExcelExport } from "../../../lib/export";

/** Exports every subject assignment for an academic year as a single-sheet .xlsx workbook. */
export const exportSubjectAssignmentsExcel = requireAssignmentPermission("read")
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        subjectKey: subjectAssignment.subjectKey,
        gradeLevel: subjectAssignment.gradeLevel,
        classId: subjectAssignment.classId,
        teacherName: staff.name,
      })
      .from(subjectAssignment)
      .innerJoin(staff, eq(subjectAssignment.staffId, staff.id))
      .where(eq(subjectAssignment.academicYearId, input.academicYearId));

    return buildExcelExport("subject-assignments.xlsx", [
      {
        name: "Subject Assignments",
        columns: [
          { header: "Teacher", key: "teacherName", width: 28 },
          { header: "Subject", key: "subjectKey", width: 20 },
          { header: "Grade Level", key: "gradeLevel", width: 14 },
          { header: "Class", key: "classId", width: 20 },
        ],
        rows: rows.map((row) => ({
          teacherName: row.teacherName,
          subjectKey: row.subjectKey,
          gradeLevel: row.gradeLevel,
          classId: row.classId ?? "",
        })),
      },
    ]);
  });
