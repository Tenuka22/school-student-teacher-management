/**
 * The grade boundaries for a year — "A is 75 and above", and so on.
 *
 * **Scoping rule: school-wide by design, and deliberately not narrowed to the
 * caller's classes.**
 *
 * This is the published marking policy and nothing else. A row is a letter, a
 * minimum mark, a maximum mark and an optional `subjectKey`: no pupil, no mark
 * anyone received, no person named and no pointer to one. It is also the one
 * piece of data in this folder that a teacher *must* have before they are
 * entitled to do anything at all — entering a mark that is graded against the
 * wrong boundary is how a child is failed, so the policy is deliberately
 * knowable by every teacher rather than consulted through a class claim.
 *
 * `subjectKey` is the caller's own narrowing tool, exactly as `gradeLevel` is on
 * `listExamTypes`. Restricting the unfiltered fallback to a teacher's own
 * classes would not narrow it so much as break it: a default scale
 * (`subjectKey = null`) applies to every subject, and a subject teacher who
 * could not read the school's default boundaries could not mark correctly in a
 * subject they are timetabled for.
 *
 * So the school-wide read stays, and this comment is the record of having
 * considered narrowing it. `exam: ["read"]` is granted to the `teacher` role and
 * to nobody else, so the population of callers is already small and already
 * known — which is the part that would need re-deciding if that changed.
 */
import { gradeScale } from "@school-student-teacher-management/db/schema/marking";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireExamPermission } from "../../index";

const listGradeScaleSchema = v.object({
  academicYearId: v.string(),
  subjectKey: v.optional(v.nullable(v.string())),
});

export const listGradeScale = requireExamPermission("read")
  .input(listGradeScaleSchema)
  .handler(async ({ input, context }) => {
    const conditions = [eq(gradeScale.academicYearId, input.academicYearId)];

    if (input.subjectKey) {
      conditions.push(eq(gradeScale.subjectKey, input.subjectKey));
    }

    const rows = await context.db
      .select()
      .from(gradeScale)
      .where(and(...conditions))
      // Ascending by the lower bound, so the bands read in the order a mark
      // falls through them; `grade` breaks ties so a pair of bands sharing a
      // boundary cannot swap between two renders of the same page.
      .orderBy(asc(gradeScale.minMark), asc(gradeScale.grade));

    return rows.map((row) => ({
      id: row.id,
      academicYearId: row.academicYearId,
      subjectKey: row.subjectKey,
      grade: row.grade,
      minMark: row.minMark,
      maxMark: row.maxMark,
      createdAt: row.createdAt.toISOString(),
    }));
  });
