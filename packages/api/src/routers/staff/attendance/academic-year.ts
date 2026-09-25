import { ORPCError } from "@orpc/server";
import { academicYear } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";

import type { Context } from "../../../context";

type Database = Context["db"];

export interface AttendanceAcademicYear {
  id: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
}

export const requireAttendanceAcademicYear = async (
  db: Database,
  academicYearId: string
): Promise<AttendanceAcademicYear> => {
  const [record] = await db
    .select({
      id: academicYear.id,
      year: academicYear.year,
      startDate: academicYear.startDate,
      endDate: academicYear.endDate,
    })
    .from(academicYear)
    .where(eq(academicYear.id, academicYearId))
    .limit(1);

  if (!record) {
    throw new ORPCError("NOT_FOUND", {
      message: "Academic year not found",
    });
  }

  return record;
};

const assertCalendarDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Invalid attendance date: ${date}`,
    });
  }
};

const dateIsOutsideYear = (date: string, year: AttendanceAcademicYear) =>
  (year.startDate !== null && date < year.startDate) ||
  (year.endDate !== null && date > year.endDate);

const rangeLabel = (year: AttendanceAcademicYear) =>
  year.startDate && year.endDate
    ? `${year.startDate} to ${year.endDate}`
    : "the configured academic-year dates";

export const assertDateWithinAcademicYear = (
  date: string,
  year: AttendanceAcademicYear
) => {
  assertCalendarDate(date);

  if (dateIsOutsideYear(date, year)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Attendance date must be within academic year ${year.year} (${rangeLabel(year)})`,
    });
  }
};

export const assertDateRangeWithinAcademicYear = (
  startDate: string,
  endDate: string,
  year: AttendanceAcademicYear
) => {
  assertCalendarDate(startDate);
  assertCalendarDate(endDate);

  if (endDate < startDate) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Attendance range end date cannot be before the start date",
    });
  }

  if (dateIsOutsideYear(startDate, year) || dateIsOutsideYear(endDate, year)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Attendance range must be within academic year ${year.year} (${rangeLabel(year)})`,
    });
  }
};
