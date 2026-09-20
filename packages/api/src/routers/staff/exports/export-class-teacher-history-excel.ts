import {
  class_,
  classTeacherAssignmentHistory,
} from "@school-student-teacher-management/db/schema/academics";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { aliasedTable, desc, eq } from "drizzle-orm";
import { object } from "valibot";

import { requireStaffPermission } from "../../../index";
import { buildExcelExport } from "../../../lib/export";

const previousTeacher = aliasedTable(staff, "previous_teacher");
const newTeacher = aliasedTable(staff, "new_teacher");

const CHANGE_TYPE_LABEL: Record<string, string> = {
  assigned: "Assigned",
  replaced: "Replaced",
  cleared: "Cleared",
};

/** Exports the homeroom teacher change history for an academic year as a single-sheet .xlsx workbook. */
export const exportClassTeacherHistoryExcel = requireStaffPermission("read")
  .input(object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        className: class_.name,
        gradeLevel: class_.gradeLevel,
        previousTeacherName: previousTeacher.name,
        newTeacherName: newTeacher.name,
        changeType: classTeacherAssignmentHistory.changeType,
        reason: classTeacherAssignmentHistory.reason,
        note: classTeacherAssignmentHistory.note,
        changedAt: classTeacherAssignmentHistory.changedAt,
      })
      .from(classTeacherAssignmentHistory)
      .innerJoin(class_, eq(classTeacherAssignmentHistory.classId, class_.id))
      .leftJoin(
        previousTeacher,
        eq(classTeacherAssignmentHistory.previousTeacherId, previousTeacher.id)
      )
      .leftJoin(
        newTeacher,
        eq(classTeacherAssignmentHistory.newTeacherId, newTeacher.id)
      )
      .where(
        eq(classTeacherAssignmentHistory.academicYearId, input.academicYearId)
      )
      .orderBy(desc(classTeacherAssignmentHistory.changedAt));

    return buildExcelExport("teacher-assignment-history.xlsx", [
      {
        name: "Teacher Assignment History",
        columns: [
          { header: "Class", key: "className", width: 12 },
          { header: "Grade", key: "gradeLevel", width: 10 },
          { header: "Change", key: "changeType", width: 14 },
          { header: "Previous Teacher", key: "previousTeacherName", width: 24 },
          { header: "New Teacher", key: "newTeacherName", width: 24 },
          { header: "Reason", key: "reason", width: 22 },
          { header: "Note", key: "note", width: 30 },
          { header: "Changed At", key: "changedAt", width: 20 },
        ],
        rows: rows.map((row) => ({
          className: row.className,
          gradeLevel: row.gradeLevel,
          changeType: CHANGE_TYPE_LABEL[row.changeType] ?? row.changeType,
          previousTeacherName: row.previousTeacherName ?? "",
          newTeacherName: row.newTeacherName ?? "",
          reason: row.reason ?? "",
          note: row.note ?? "",
          changedAt: row.changedAt.toISOString(),
        })),
      },
    ]);
  });
