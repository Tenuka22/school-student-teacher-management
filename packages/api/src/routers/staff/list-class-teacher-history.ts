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

import { requireStaffPermission } from "../../index";

const previousTeacher = aliasedTable(staff, "previous_teacher");
const newTeacher = aliasedTable(staff, "new_teacher");

/** Full audit trail of homeroom teacher changes for an academic year. */
export const listClassTeacherHistory = requireStaffPermission("read")
  .input(object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        id: classTeacherAssignmentHistory.id,
        classId: classTeacherAssignmentHistory.classId,
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

    return rows.map((row) => ({
      ...row,
      changedAt: row.changedAt.toISOString(),
    }));
  });
