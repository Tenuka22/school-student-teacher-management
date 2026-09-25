import { ORPCError } from "@orpc/server";
import {
  class_,
  classTeacherAssignmentHistory,
} from "@school-student-teacher-management/db/schema/academics";
import {
  teacherAttendance,
  teacherPeriodAbsence,
  shortLeaveUsage,
} from "@school-student-teacher-management/db/schema/attendance";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import { subjectMark } from "@school-student-teacher-management/db/schema/marking";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  employmentVerification,
  passwordRotationHistory,
  teacherQualification,
} from "@school-student-teacher-management/db/schema/qualifications";
import {
  staff,
  staffIdSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { teacherSubjectAssignment } from "@school-student-teacher-management/db/schema/teacher-subjects";
import { eq, or } from "drizzle-orm";
import * as v from "valibot";

import { requireStaffPermission } from "../../index";

export const deleteStaff = requireStaffPermission("delete")
  .input(v.object({ id: staffIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(staff)
      .where(eq(staff.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Staff member not found" });
    }

    const historyChecks = await Promise.all([
      context.db
        .select({ id: staffPosition.id })
        .from(staffPosition)
        .where(eq(staffPosition.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: class_.id })
        .from(class_)
        .where(
          or(
            eq(class_.homeroomTeacherId, input.id),
            eq(class_.subHomeroomTeacherId, input.id)
          )
        )
        .limit(1),
      context.db
        .select({ id: classTeacherAssignmentHistory.id })
        .from(classTeacherAssignmentHistory)
        .where(
          or(
            eq(classTeacherAssignmentHistory.previousTeacherId, input.id),
            eq(classTeacherAssignmentHistory.newTeacherId, input.id)
          )
        )
        .limit(1),
      context.db
        .select({ id: leaveRequest.id })
        .from(leaveRequest)
        .where(eq(leaveRequest.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: teacherAttendance.id })
        .from(teacherAttendance)
        .where(eq(teacherAttendance.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: teacherPeriodAbsence.id })
        .from(teacherPeriodAbsence)
        .where(eq(teacherPeriodAbsence.substituteStaffId, input.id))
        .limit(1),
      context.db
        .select({ id: shortLeaveUsage.id })
        .from(shortLeaveUsage)
        .where(eq(shortLeaveUsage.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: classPeriodAssignment.id })
        .from(classPeriodAssignment)
        .where(eq(classPeriodAssignment.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: teacherSubjectAssignment.id })
        .from(teacherSubjectAssignment)
        .where(eq(teacherSubjectAssignment.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: teacherQualification.id })
        .from(teacherQualification)
        .where(eq(teacherQualification.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: employmentVerification.id })
        .from(employmentVerification)
        .where(eq(employmentVerification.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: passwordRotationHistory.id })
        .from(passwordRotationHistory)
        .where(eq(passwordRotationHistory.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: subjectMark.id })
        .from(subjectMark)
        .where(eq(subjectMark.enteredByStaffId, input.id))
        .limit(1),
    ]);

    if (historyChecks.some((rows) => rows.length > 0)) {
      throw new ORPCError("CONFLICT", {
        message:
          "Staff member has historical records or current assignments and cannot be deleted; set the employment status to terminated instead",
      });
    }

    await context.db.transaction(async (tx) => {
      await tx.delete(staff).where(eq(staff.id, input.id));

      if (existing.userId) {
        await tx.delete(user).where(eq(user.id, existing.userId));
      }
    });

    return { success: true };
  });
