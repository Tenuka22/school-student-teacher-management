import { ORPCError } from "@orpc/server";
import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import {
  class_,
  gradeSubjectConfig,
} from "@school-student-teacher-management/db/schema/academics";
import {
  academicYear,
  staff,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { teacherSubjectAssignment } from "@school-student-teacher-management/db/schema/teacher-subjects";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";

import type { Context } from "../../context";

type Database = Context["db"];

interface TeacherEligibilityInput {
  db: Database;
  academicYearId: string;
  staffId: string;
  subjectKey?: string;
  gradeLevel?: number;
}

const activeOrUnsetEmployment = or(
  eq(staff.employmentStatus, "active"),
  isNull(staff.employmentStatus)
);

/**
 * "On the teaching roll and still employed", as a `where` fragment.
 *
 * **Exported because a second procedure needs it, and a third copy of this rule
 * is a bug waiting to happen.** The rule is `staff_category = 'teacher' AND
 * (employment_status = 'active' OR IS NULL)`, and a null status is allowed on
 * purpose: nobody has confirmed it yet, and refusing those would lock a working
 * teacher out of their own class because an administrator left one field blank.
 * `listStaff` keeps a private `defaultTeachingStaff` that spells the same rule
 * out again, and `listTeachersForAttendance` needs it too — so it lives here,
 * once, and the callers that can import it do. Anything that needs the same rule
 * in TypeScript rather than SQL (the marking folder's `isTeachingStaff`) still
 * has to mirror it, because a guard that has to name *which* half of the rule
 * failed cannot use a single opaque fragment.
 */
export const teachingStaff = and(
  eq(staff.staffCategory, "teacher"),
  activeOrUnsetEmployment
);

export const getEligibleTeacherIds = async (
  db: Database,
  academicYearId: string
): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ id: staff.id })
    .from(staff)
    .innerJoin(
      staffPosition,
      and(
        eq(staffPosition.staffId, staff.id),
        eq(staffPosition.academicYearId, academicYearId)
      )
    )
    .where(teachingStaff);

  return rows.map((row) => row.id);
};

export const getYearRosterTeacherIds = async (
  db: Database,
  academicYearId: string
): Promise<string[]> => {
  const [year] = await db
    .select({
      startDate: academicYear.startDate,
      endDate: academicYear.endDate,
    })
    .from(academicYear)
    .where(eq(academicYear.id, academicYearId))
    .limit(1);

  // The three reads are independent of one another, so they run together
  // instead of making the caller wait for the round trip in sequence.
  const [positioned, createdDuringYear] = await Promise.all([
    getEligibleTeacherIds(db, academicYearId),
    year?.startDate && year.endDate
      ? db
          .select({ id: staff.id })
          .from(staff)
          .where(
            and(
              teachingStaff,
              gte(staff.createdAt, new Date(`${year.startDate}T00:00:00Z`)),
              lte(staff.createdAt, new Date(`${year.endDate}T23:59:59Z`))
            )
          )
      : Promise.resolve([]),
  ]);

  return [
    ...new Set([...positioned, ...createdDuringYear.map((row) => row.id)]),
  ];
};

export const getClassForAcademicYear = async (
  db: Database,
  academicYearId: string,
  classId: string
) => {
  const [record] = await db
    .select({
      id: class_.id,
      gradeLevel: class_.gradeLevel,
    })
    .from(class_)
    .where(
      and(eq(class_.id, classId), eq(class_.academicYearId, academicYearId))
    )
    .limit(1);

  if (!record) {
    throw new ORPCError("NOT_FOUND", {
      message: "Class not found for the selected academic year",
    });
  }

  return record;
};

export const assertTeacherEligibleForYear = async ({
  db,
  academicYearId,
  staffId,
  subjectKey,
  gradeLevel,
}: TeacherEligibilityInput) => {
  const [teacher] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);

  if (!teacher) {
    throw new ORPCError("NOT_FOUND", {
      message: "Teacher not found",
    });
  }

  const [eligibleTeacher] = await db
    .select({ id: staff.id })
    .from(staff)
    .innerJoin(
      staffPosition,
      and(
        eq(staffPosition.staffId, staff.id),
        eq(staffPosition.academicYearId, academicYearId)
      )
    )
    .where(and(eq(staff.id, staffId), teachingStaff))
    .limit(1);

  if (!eligibleTeacher) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Teacher must be teaching staff, actively employed or have an unset employment status, and have a position in the selected academic year",
    });
  }

  if (subjectKey === undefined) {
    return eligibleTeacher;
  }

  const [configuredSubject] = await db
    .select({ id: teacherSubjectAssignment.id })
    .from(teacherSubjectAssignment)
    .where(
      and(
        eq(teacherSubjectAssignment.staffId, staffId),
        eq(teacherSubjectAssignment.academicYearId, academicYearId),
        eq(teacherSubjectAssignment.subjectKey, subjectKey)
      )
    )
    .limit(1);

  if (!configuredSubject) {
    throw new ORPCError("BAD_REQUEST", {
      message: `This teacher is not configured to teach ${subjectLabel(subjectKey)} for the selected academic year`,
    });
  }

  if (gradeLevel !== undefined) {
    const [offeredSubject] = await db
      .select({ id: gradeSubjectConfig.id })
      .from(gradeSubjectConfig)
      .where(
        and(
          eq(gradeSubjectConfig.academicYearId, academicYearId),
          eq(gradeSubjectConfig.gradeLevel, gradeLevel),
          eq(gradeSubjectConfig.subjectKey, subjectKey)
        )
      )
      .limit(1);

    if (!offeredSubject) {
      throw new ORPCError("BAD_REQUEST", {
        message: `${subjectLabel(subjectKey)} is not offered for this class grade in the selected academic year`,
      });
    }
  }

  return eligibleTeacher;
};
