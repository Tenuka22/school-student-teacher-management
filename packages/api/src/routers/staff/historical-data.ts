import {
  class_,
  classTeacherAssignmentHistory,
} from "@school-student-teacher-management/db/schema/academics";
import {
  teacherAttendance,
  teacherPeriodAbsence,
} from "@school-student-teacher-management/db/schema/attendance";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staff,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { teacherSubjectAssignment } from "@school-student-teacher-management/db/schema/teacher-subjects";
import { eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const getHistoricalData = adminProcedure
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [
      staffRows,
      positionRows,
      subjectRows,
      classRows,
      timetableRows,
      historyRows,
      leaveRows,
      attendanceRows,
    ] = await Promise.all([
      context.db
        .select({
          id: staff.id,
          name: staff.name,
          teacherServiceNo: staff.teacherServiceNo,
        })
        .from(staff)
        .orderBy(staff.name),
      context.db
        .select({
          id: staffPosition.id,
          staffId: staffPosition.staffId,
          position: staffPosition.position,
          sectionalScope: staffPosition.sectionalScope,
        })
        .from(staffPosition)
        .where(eq(staffPosition.academicYearId, input.academicYearId)),
      context.db
        .select({
          id: teacherSubjectAssignment.id,
          staffId: teacherSubjectAssignment.staffId,
          subjectKey: teacherSubjectAssignment.subjectKey,
        })
        .from(teacherSubjectAssignment)
        .where(
          eq(teacherSubjectAssignment.academicYearId, input.academicYearId)
        ),
      context.db
        .select({
          id: class_.id,
          name: class_.name,
          gradeLevel: class_.gradeLevel,
          homeroomTeacherId: class_.homeroomTeacherId,
          subHomeroomTeacherId: class_.subHomeroomTeacherId,
        })
        .from(class_)
        .where(eq(class_.academicYearId, input.academicYearId)),
      context.db
        .select({
          id: classPeriodAssignment.id,
          classId: classPeriodAssignment.classId,
          staffId: classPeriodAssignment.staffId,
          dayOfWeek: classPeriodAssignment.dayOfWeek,
          periodNumber: classPeriodAssignment.periodNumber,
          subjectKey: classPeriodAssignment.subjectKey,
        })
        .from(classPeriodAssignment)
        .where(eq(classPeriodAssignment.academicYearId, input.academicYearId)),
      context.db
        .select({
          id: classTeacherAssignmentHistory.id,
          classId: classTeacherAssignmentHistory.classId,
          className: class_.name,
          gradeLevel: class_.gradeLevel,
          previousTeacherId: classTeacherAssignmentHistory.previousTeacherId,
          newTeacherId: classTeacherAssignmentHistory.newTeacherId,
          changeType: classTeacherAssignmentHistory.changeType,
          reason: classTeacherAssignmentHistory.reason,
          note: classTeacherAssignmentHistory.note,
          changedAt: classTeacherAssignmentHistory.changedAt,
        })
        .from(classTeacherAssignmentHistory)
        .innerJoin(class_, eq(classTeacherAssignmentHistory.classId, class_.id))
        .where(
          eq(classTeacherAssignmentHistory.academicYearId, input.academicYearId)
        ),
      context.db
        .select({
          id: leaveRequest.id,
          staffId: leaveRequest.staffId,
          type: leaveRequest.type,
          startDate: leaveRequest.startDate,
          endDate: leaveRequest.endDate,
          dayPart: leaveRequest.dayPart,
          paymentStatus: leaveRequest.paymentStatus,
          reason: leaveRequest.reason,
          status: leaveRequest.status,
          deputyStatus: leaveRequest.deputyStatus,
          deputyComment: leaveRequest.deputyComment,
          finalStatus: leaveRequest.finalStatus,
          principalComment: leaveRequest.principalComment,
          finalizedAt: leaveRequest.finalizedAt,
          createdAt: leaveRequest.createdAt,
        })
        .from(leaveRequest)
        .where(eq(leaveRequest.academicYearId, input.academicYearId)),
      context.db
        .select({
          id: teacherAttendance.id,
          staffId: teacherAttendance.staffId,
          date: teacherAttendance.date,
          status: teacherAttendance.status,
          reason: teacherAttendance.reason,
          leaveRequestId: teacherAttendance.leaveRequestId,
        })
        .from(teacherAttendance)
        .where(eq(teacherAttendance.academicYearId, input.academicYearId)),
    ]);

    const staffIds = new Set<string>();
    const addStaffId = (staffId: string | null) => {
      if (staffId) {
        staffIds.add(staffId);
      }
    };
    for (const row of positionRows) {
      staffIds.add(row.staffId);
    }
    for (const row of subjectRows) {
      staffIds.add(row.staffId);
    }
    for (const row of classRows) {
      addStaffId(row.homeroomTeacherId);
      addStaffId(row.subHomeroomTeacherId);
    }
    for (const row of timetableRows) {
      staffIds.add(row.staffId);
    }
    for (const row of historyRows) {
      addStaffId(row.previousTeacherId);
      addStaffId(row.newTeacherId);
    }
    for (const row of leaveRows) {
      staffIds.add(row.staffId);
    }
    for (const row of attendanceRows) {
      staffIds.add(row.staffId);
    }

    const yearStaffRows = staffRows.filter((row) => staffIds.has(row.id));
    const staffNameById = new Map(
      yearStaffRows.map((row) => [row.id, row.name])
    );
    const staffName = (staffId: string | null) =>
      staffId ? (staffNameById.get(staffId) ?? "Unknown staff member") : null;

    const attendanceIds = attendanceRows.map((row) => row.id);
    const absenceRows = attendanceIds.length
      ? await context.db
          .select({
            teacherAttendanceId: teacherPeriodAbsence.teacherAttendanceId,
            periodNumber: teacherPeriodAbsence.periodNumber,
            reason: teacherPeriodAbsence.reason,
          })
          .from(teacherPeriodAbsence)
          .where(
            inArray(teacherPeriodAbsence.teacherAttendanceId, attendanceIds)
          )
      : [];
    const absencesByAttendance = new Map<
      string,
      { periodNumber: number; reason: string }[]
    >();
    for (const row of absenceRows) {
      const current = absencesByAttendance.get(row.teacherAttendanceId) ?? [];
      current.push({
        periodNumber: row.periodNumber,
        reason: row.reason,
      });
      absencesByAttendance.set(row.teacherAttendanceId, current);
    }

    const positionsByStaff = new Map<
      string,
      { id: string; position: string; sectionalScope: string | null }[]
    >();
    for (const position of positionRows) {
      const current = positionsByStaff.get(position.staffId) ?? [];
      current.push({
        id: position.id,
        position: position.position,
        sectionalScope: position.sectionalScope,
      });
      positionsByStaff.set(position.staffId, current);
    }
    const classesById = new Map(classRows.map((row) => [row.id, row]));
    const attendanceExceptions = [];
    for (const row of attendanceRows) {
      if (row.status !== "present") {
        attendanceExceptions.push({
          id: row.id,
          staffId: row.staffId,
          staffName: staffName(row.staffId) ?? "Unknown staff member",
          date: row.date,
          status: row.status,
          reason: row.reason,
          leaveRequestId: row.leaveRequestId,
          absentPeriods: absencesByAttendance.get(row.id) ?? [],
        });
      }
    }

    return {
      staff: yearStaffRows.map((row) => ({
        id: row.id,
        name: row.name,
        teacherServiceNo: row.teacherServiceNo,
        positions: positionsByStaff.get(row.id) ?? [],
      })),
      subjects: subjectRows.map((row) => ({
        id: row.id,
        staffId: row.staffId,
        staffName: staffName(row.staffId) ?? "Unknown staff member",
        subjectKey: row.subjectKey,
      })),
      timetables: timetableRows.map((row) => ({
        id: row.id,
        classId: row.classId,
        className: classesById.get(row.classId)?.name ?? "Unknown class",
        gradeLevel: classesById.get(row.classId)?.gradeLevel ?? 0,
        staffId: row.staffId,
        staffName: staffName(row.staffId) ?? "Unknown staff member",
        dayOfWeek: row.dayOfWeek,
        periodNumber: row.periodNumber,
        subjectKey: row.subjectKey,
      })),
      homeroomHistory: historyRows.map((row) => ({
        id: row.id,
        className: row.className,
        gradeLevel: row.gradeLevel,
        previousTeacherName: staffName(row.previousTeacherId),
        newTeacherName: staffName(row.newTeacherId),
        changeType: row.changeType,
        reason: row.reason,
        note: row.note,
        changedAt: row.changedAt.toISOString(),
      })),
      leaveDecisions: leaveRows.map((row) => ({
        id: row.id,
        staffId: row.staffId,
        staffName: staffName(row.staffId) ?? "Unknown staff member",
        type: row.type,
        startDate: row.startDate,
        endDate: row.endDate,
        dayPart: row.dayPart,
        paymentStatus: row.paymentStatus,
        reason: row.reason,
        status: row.status,
        deputyStatus: row.deputyStatus,
        deputyComment: row.deputyComment,
        finalStatus: row.finalStatus,
        principalComment: row.principalComment,
        finalizedAt: row.finalizedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      attendanceExceptions,
    };
  });
