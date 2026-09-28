import { ORPCError } from "@orpc/server";
import {
  employmentStatusLabel,
  humanizeKey,
  subjectLabel,
} from "@school-student-teacher-management/db/constants/display";
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

/**
 * Why this particular teacher cannot be assigned, named one condition at a time.
 *
 * **The reason this exists, and the reason the check cannot be a single `where`.**
 * The eligibility rule is three independent conditions — teaching staff, still
 * employed, and positioned in the selected year — and a single query that asked for
 * all three at once could only answer yes or no. So the refusal was one sentence
 * restating the whole rule:
 *
 * > Teacher must be teaching staff, actively employed or have an unset employment
 * > status, and have a position in the selected academic year
 *
 * which is three facts presented as one, none of them specific, and all of them
 * about a rule rather than about the teacher in the dialog. Somebody whose
 * employment status had been set to *Retired* was told to be "actively employed",
 * and somebody who had simply not been given a position this year — the most common
 * case by far — was told the same three things as somebody who was not a teacher at
 * all.
 *
 * Each clause below is a statement about **this** teacher, carrying the value that
 * failed: "their employment status is Retired", "they have no position in the 2026
 * academic year". Two of the three can fail at once and both are then said, because
 * a refusal that names one of two reasons is the same defect in a smaller font.
 */
const ineligibilityReasons = ({
  employmentStatus,
  hasPosition,
  staffCategory,
}: {
  employmentStatus: string | null;
  hasPosition: boolean;
  staffCategory: string | null;
}): string[] => {
  const reasons: string[] = [];

  if (staffCategory !== "teacher") {
    reasons.push(
      `their staff category is ${humanizeKey(staffCategory ?? "not set")}, not teaching staff`
    );
  }

  // A null status is allowed on purpose: nobody has confirmed it yet, and refusing
  // those would lock a working teacher out of their own class because an
  // administrator left one field blank.
  if (employmentStatus !== null && employmentStatus !== "active") {
    reasons.push(
      `their employment status is ${employmentStatusLabel(employmentStatus)}`
    );
  }

  if (!hasPosition) {
    reasons.push("they have no position in the selected academic year");
  }

  return reasons;
};

/** "a", "a and b", "a, b and c" — so a two-reason refusal still reads as a sentence. */
const asSentence = (reasons: string[]): string => {
  if (reasons.length <= 1) {
    return reasons[0] ?? "";
  }

  return `${reasons.slice(0, -1).join(", ")} and ${reasons.at(-1)}`;
};

export const assertTeacherEligibleForYear = async ({
  db,
  academicYearId,
  staffId,
  subjectKey,
  gradeLevel,
}: TeacherEligibilityInput) => {
  const [teacher] = await db
    .select({
      id: staff.id,
      name: staff.name,
      staffCategory: staff.staffCategory,
      employmentStatus: staff.employmentStatus,
    })
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);

  if (!teacher) {
    throw new ORPCError("NOT_FOUND", {
      message: "Teacher not found",
    });
  }

  /*
   * The three conditions read separately rather than as one `teachingStaff` join,
   * because a query that returns a row only when all three hold cannot report which
   * one did not. This is the case `teachingStaff`'s own comment anticipates: "a
   * guard that has to name which half of the rule failed cannot use a single opaque
   * fragment."
   */
  const [position] = await db
    .select({ id: staffPosition.id })
    .from(staffPosition)
    .where(
      and(
        eq(staffPosition.staffId, staffId),
        eq(staffPosition.academicYearId, academicYearId)
      )
    )
    .limit(1);

  const reasons = ineligibilityReasons({
    employmentStatus: teacher.employmentStatus,
    hasPosition: Boolean(position),
    staffCategory: teacher.staffCategory,
  });

  if (reasons.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: `${teacher.name} cannot be assigned to a class or subject because ${asSentence(reasons)}. Fix it on their staff record, or give them a position in this academic year.`,
    });
  }

  if (subjectKey === undefined) {
    return teacher;
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
      message: `${teacher.name} is not configured to teach ${subjectLabel(subjectKey)} for the selected academic year. Assign the subject on their record first.`,
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
        message: `${subjectLabel(subjectKey)} is not offered for this class grade in the selected academic year. Add it to this grade's subjects first.`,
      });
    }
  }

  return teacher;
};
