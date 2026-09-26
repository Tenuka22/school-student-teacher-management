/**
 * The exam types defined for a year.
 *
 * **Scoping rule: school-wide by design, and deliberately not narrowed to the
 * caller's classes.**
 *
 * This is reference data, not a record about anybody. A row is a name, a
 * category (`firstTerm`, `scholarship`, `levelTest`, …), a grade level, a
 * maximum mark and a sort order — the shape of the school's examinations. It
 * names no pupil, discloses no mark anyone received, and carries no pointer to
 * a person: the only thing a teacher learns from an unfiltered list is that the
 * school runs a grade 11 scholarship exam, which is printed in the handbook and
 * announced at assembly.
 *
 * Narrowing it would also break it. These rows are on the critical path of
 * legitimate teacher work — a mark-entry form cannot render without knowing
 * which exams exist and what they are out of — and the grade filter is the
 * caller's own tool for narrowing, which is why `gradeLevel` is an input. A
 * teacher who is timetabled to 9-A needs the 9 rows that apply to grade 9, and
 * `gradeLevel: 9` is how they ask for them. Restricting the unfiltered
 * fallback to a teacher's own classes would produce a list that is wrong
 * rather than narrow: an exam definition belongs to a grade, not to a person,
 * and the honest version of "only what you need" here is the filter the caller
 * already holds.
 *
 * So the school-wide read stays, and this comment is the record of having
 * considered narrowing it. `exam: ["read"]` is granted to the `teacher` role and
 * to nobody else, so the population of callers is already small and already
 * known — which is the part that would need re-deciding if that changed.
 */
import { examType } from "@school-student-teacher-management/db/schema/marking";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireExamPermission } from "../../index";

const listExamTypesSchema = v.object({
  academicYearId: v.string(),
  /** Optional: only exam types for this grade (plus ungraded legacy rows). */
  gradeLevel: v.optional(v.number()),
});

export const listExamTypes = requireExamPermission("read")
  .input(listExamTypesSchema)
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select()
      .from(examType)
      .where(
        input.gradeLevel === undefined
          ? eq(examType.academicYearId, input.academicYearId)
          : and(
              eq(examType.academicYearId, input.academicYearId),
              eq(examType.gradeLevel, input.gradeLevel)
            )
      )
      .orderBy(asc(examType.sortOrder), asc(examType.name));

    return rows.map((row) => ({
      id: row.id,
      academicYearId: row.academicYearId,
      name: row.name,
      category: row.category,
      gradeLevel: row.gradeLevel,
      maxMark: row.maxMark,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    }));
  });
