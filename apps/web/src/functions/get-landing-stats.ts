import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { teacherAttendance } from "@school-student-teacher-management/db/schema/attendance";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import {
  student,
  studentClassAssignment,
} from "@school-student-teacher-management/db/schema/marking";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYear,
  staff,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/services.server";

import rootPackage from "../../../../package.json";

/** One module tile, with the live figure that gives it substance. */
export interface LandingModule {
  num: string;
  name: string;
  desc: string;
  /** Live count from the database, or null when it could not be read. */
  value: number | null;
  /** How the figure should be read, e.g. "teachers on roll". */
  unit: string;
}

export interface LandingStats {
  /** Deployment version reported in the footer, not a placeholder. */
  version: string;
  /** Live current academic year, or null before one is opened. */
  currentYear: number | null;
  /** ISO start/end dates of the current year, when recorded. */
  yearStart: string | null;
  yearEnd: string | null;
  /** Whole days remaining in the current year, or null when undetermined. */
  daysRemaining: number | null;
  /** Aggregate headcounts — no names, NICs or other personal data. */
  staffCount: number;
  studentCount: number;
  /** Live counts behind the module tiles. */
  modules: LandingModule[];
  /** Server clock at render, so the page is visibly not a mock. */
  serverTime: string;
  /** Whether the database answered during this render. */
  databaseUp: boolean;
}

const getDaysRemaining = (end: string | null): number | null => {
  if (!end) {
    return null;
  }

  const endMs = Date.parse(end);

  if (Number.isNaN(endMs)) {
    return null;
  }

  return Math.max(0, Math.ceil((endMs - Date.now()) / 86_400_000));
};

/**
 * Live, public-safe figures for the landing page.
 *
 * Only aggregate counts, the current academic year and server time leave the
 * server — no staff names, NICs, emails or leave detail — because this page is
 * reachable without a session. The counts double as a health check: if the
 * database is unreachable the handler degrades to nulls with
 * `databaseUp: false` instead of throwing, so the landing page still renders.
 */
export const getLandingStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingStats> => {
    const { version } = rootPackage;
    const serverTime = new Date().toISOString();

    try {
      const yearRows = await db
        .select({
          id: academicYear.id,
          year: academicYear.year,
          startDate: academicYear.startDate,
          endDate: academicYear.endDate,
        })
        .from(academicYear)
        .where(eq(academicYear.isCurrent, true))
        .limit(1);

      const [year] = yearRows;
      const yearId = yearRows[0]?.id;

      // Every figure below is scoped to the open year, because that is what the
      // page says it is showing. They used to be lifetime totals wearing a
      // "this year" caption, and the attendance tile counted every stored row —
      // including `present` — under a label reading "absence exceptions".
      const [
        staffRows,
        studentRows,
        classRows,
        slotRows,
        openLeaveRows,
        absenceRows,
      ] = yearId
        ? await Promise.all([
            db
              .select({ id: staff.id })
              .from(staff)
              .innerJoin(staffPosition, eq(staffPosition.staffId, staff.id))
              .where(eq(staffPosition.academicYearId, yearId)),
            db
              .select({ id: student.id })
              .from(student)
              .innerJoin(
                studentClassAssignment,
                eq(studentClassAssignment.studentId, student.id)
              )
              .where(eq(studentClassAssignment.academicYearId, yearId)),
            db
              .select({ id: class_.id })
              .from(class_)
              .where(eq(class_.academicYearId, yearId)),
            db
              .select({ id: classPeriodAssignment.id })
              .from(classPeriodAssignment)
              .where(eq(classPeriodAssignment.academicYearId, yearId)),
            db
              .select({ id: leaveRequest.id })
              .from(leaveRequest)
              .where(
                and(
                  eq(leaveRequest.academicYearId, yearId),
                  isNull(leaveRequest.finalizedAt)
                )
              ),
            db
              .select({ id: teacherAttendance.id })
              .from(teacherAttendance)
              .where(
                and(
                  eq(teacherAttendance.academicYearId, yearId),
                  ne(teacherAttendance.status, "present")
                )
              ),
          ])
        : [[], [], [], [], [], []];

      return {
        version,
        currentYear: year?.year ?? null,
        yearStart: year?.startDate ?? null,
        yearEnd: year?.endDate ?? null,
        daysRemaining: getDaysRemaining(year?.endDate ?? null),
        staffCount: staffRows.length,
        studentCount: studentRows.length,
        serverTime,
        databaseUp: true,
        modules: [
          {
            num: "01",
            name: "Staff",
            desc: "Teachers holding a position this year",
            value: staffRows.length,
            unit: "positioned",
          },
          {
            num: "02",
            name: "Students",
            desc: "Students assigned to a class this year",
            value: studentRows.length,
            unit: "enrolled",
          },
          {
            num: "03",
            name: "Classes",
            desc: "Sections running this year",
            value: classRows.length,
            unit: "sections",
          },
          {
            num: "04",
            name: "Timetable",
            desc: "Weekly slots filled this year",
            value: slotRows.length,
            unit: "slots assigned",
          },
          {
            num: "05",
            name: "Leave",
            desc: "Requests still waiting on a decision",
            value: openLeaveRows.length,
            unit: "open",
          },
          {
            num: "06",
            name: "Attendance",
            desc: "Absence records raised this year",
            value: absenceRows.length,
            unit: "exceptions",
          },
        ],
      };
    } catch {
      return {
        version,
        currentYear: null,
        yearStart: null,
        yearEnd: null,
        daysRemaining: null,
        staffCount: 0,
        studentCount: 0,
        serverTime,
        databaseUp: false,
        modules: [],
      };
    }
  }
);
