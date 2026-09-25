import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYear,
  academicYearIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq, inArray, isNull } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";
import { getYearRosterTeacherIds } from "./teacher-eligibility";

/** The school week the timetable is built over. */
const TEACHING_DAYS = 5;

/** Accounts that have not yet been decided on as staff. */
const REQUESTER_ROLES = ["teacher-requester", "user"];

/**
 * Everything the administrator's home page claims, counted from the database.
 *
 * This exists because the page used to render module-level constants: hardcoded
 * teacher and class counts, a fixed 62% completion ring, a "1,736 of 2,800"
 * slot total, and a "All systems operational" card that had no health check
 * behind it. Every figure below is a query, so a number on screen and a number
 * in the database cannot drift apart.
 */
export const getAdminOverview = adminProcedure
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const { db } = context;
    const { academicYearId } = input;

    const periodCount = CODE_DEFINED_PERIODS.length;

    const [
      yearRows,
      classRows,
      slotRows,
      rosterTeacherIds,
      openLeaveRows,
      requestRows,
    ] = await Promise.all([
      db
        .select({
          year: academicYear.year,
          startDate: academicYear.startDate,
          endDate: academicYear.endDate,
        })
        .from(academicYear)
        .where(eq(academicYear.id, academicYearId))
        .limit(1),
      db
        .select({
          id: class_.id,
          homeroomTeacherId: class_.homeroomTeacherId,
        })
        .from(class_)
        .where(eq(class_.academicYearId, academicYearId)),
      db
        .select({
          id: classPeriodAssignment.id,
          staffId: classPeriodAssignment.staffId,
          classId: classPeriodAssignment.classId,
          dayOfWeek: classPeriodAssignment.dayOfWeek,
          periodNumber: classPeriodAssignment.periodNumber,
          isCombinedSession: classPeriodAssignment.isCombinedSession,
        })
        .from(classPeriodAssignment)
        .where(eq(classPeriodAssignment.academicYearId, academicYearId)),
      getYearRosterTeacherIds(db, academicYearId),
      db
        .select({
          id: leaveRequest.id,
          status: leaveRequest.status,
        })
        .from(leaveRequest)
        .where(
          and(
            eq(leaveRequest.academicYearId, academicYearId),
            isNull(leaveRequest.finalizedAt)
          )
        ),
      db
        .select({
          id: user.id,
          role: user.role,
          emailVerified: user.emailVerified,
        })
        .from(user)
        .where(inArray(user.role, REQUESTER_ROLES)),
    ]);

    const [year] = yearRows;

    // Classes without a homeroom teacher are the single most common thing an
    // administrator needs to fix, so they are named rather than just counted.
    const classIds = classRows.map((row) => row.id);
    const classesWithoutHomeroom = classRows.filter(
      (row) => !row.homeroomTeacherId
    );

    // A class is "covered" when it has a teacher in every slot it needs; the
    // denominator is the whole school week, because that is what a complete
    // timetable means.
    const slotsByClass = new Map<string, Set<string>>();
    for (const slot of slotRows) {
      const key = `${slot.dayOfWeek}-${slot.periodNumber}`;
      const existing = slotsByClass.get(slot.classId) ?? new Set<string>();
      existing.add(key);
      slotsByClass.set(slot.classId, existing);
    }

    const expectedSlotsPerClass = TEACHING_DAYS * periodCount;
    const classesWithoutTimetable = classIds.filter((id) => {
      const filled = slotsByClass.get(id)?.size ?? 0;
      return filled < expectedSlotsPerClass;
    });

    const teachersWithSlots = new Set(slotRows.map((slot) => slot.staffId));
    const teachersWithoutPeriods = rosterTeacherIds.filter(
      (id) => !teachersWithSlots.has(id)
    );

    // A teacher booked into the same slot more than once is only legitimate
    // when the overlap is explicitly marked as a combined session.
    const occupancy = new Map<string, typeof slotRows>();
    for (const slot of slotRows) {
      const key = `${slot.staffId}-${slot.dayOfWeek}-${slot.periodNumber}`;
      const group = occupancy.get(key) ?? [];
      group.push(slot);
      occupancy.set(key, group);
    }

    let conflictCount = 0;
    for (const group of occupancy.values()) {
      if (group.length < 2) {
        continue;
      }
      if (group.some((slot) => !slot.isCombinedSession)) {
        conflictCount += 1;
      }
    }

    const awaitingDeputy = openLeaveRows.filter(
      (row) => row.status === "pending"
    ).length;
    const awaitingPrincipal = openLeaveRows.filter(
      (row) => row.status === "recommended" || row.status === "rejected"
    ).length;

    const requestsAwaitingApproval = requestRows.filter(
      (row) => row.role === "teacher-requester" && row.emailVerified
    ).length;
    const requestsAwaitingVerification = requestRows.filter(
      (row) => row.role === "teacher-requester" && !row.emailVerified
    ).length;

    const totalSlots = classIds.length * expectedSlotsPerClass;

    return {
      year: year
        ? {
            year: year.year,
            startDate: year.startDate,
            endDate: year.endDate,
          }
        : null,
      teachers: {
        roster: rosterTeacherIds.length,
        withoutPeriods: teachersWithoutPeriods.length,
      },
      classes: {
        total: classIds.length,
        withoutHomeroom: classesWithoutHomeroom.length,
        withoutTimetable: classesWithoutTimetable.length,
      },
      timetable: {
        assigned: slotRows.length,
        capacity: totalSlots,
        conflicts: conflictCount,
        periodsPerDay: periodCount,
        teachingDays: TEACHING_DAYS,
      },
      leave: {
        awaitingDeputy,
        awaitingPrincipal,
      },
      requests: {
        awaitingApproval: requestsAwaitingApproval,
        awaitingVerification: requestsAwaitingVerification,
      },
    };
  });
