import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../index";

/**
 * Default class letters per grade band, per Sri Lankan school convention:
 * - Primary (1-5): 5 classes, A-E
 * - Secondary (6-11): 6 classes, A-F
 * - Collegiate (12-13): not seeded — A/L stream counts vary by year based on
 *   student subject-basket demand and can't be predicted, so those classes
 *   are always created manually.
 * Class "A" is the English-medium section; the rest are Sinhala-medium.
 */
const PRIMARY_GRADES = [1, 2, 3, 4, 5] as const;
const SECONDARY_GRADES = [6, 7, 8, 9, 10, 11] as const;
const PRIMARY_LETTERS = ["A", "B", "C", "D", "E"] as const;
const SECONDARY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

const mediumForLetter = (letter: string) =>
  letter === "A" ? "english" : "sinhala";

const plannedClasses = () => {
  const planned: { gradeLevel: number; name: string; medium: string }[] = [];
  for (const gradeLevel of PRIMARY_GRADES) {
    for (const letter of PRIMARY_LETTERS) {
      planned.push({
        gradeLevel,
        name: `${gradeLevel}-${letter}`,
        medium: mediumForLetter(letter),
      });
    }
  }
  for (const gradeLevel of SECONDARY_GRADES) {
    for (const letter of SECONDARY_LETTERS) {
      planned.push({
        gradeLevel,
        name: `${gradeLevel}-${letter}`,
        medium: mediumForLetter(letter),
      });
    }
  }
  return planned;
};

export const seedDefaultClasses = requireAssignmentPermission("create")
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const existing = await context.db
      .select({ gradeLevel: class_.gradeLevel, name: class_.name })
      .from(class_)
      .where(eq(class_.academicYearId, input.academicYearId));

    const existingKeys = new Set(
      existing.map((row) => `${row.gradeLevel}:${row.name}`)
    );

    const planned = plannedClasses();
    const toCreate = planned.filter(
      (plan) => !existingKeys.has(`${plan.gradeLevel}:${plan.name}`)
    );

    if (toCreate.length > 0) {
      await context.db.insert(class_).values(
        toCreate.map((plan) => ({
          id: crypto.randomUUID(),
          academicYearId: input.academicYearId,
          gradeLevel: plan.gradeLevel,
          name: plan.name,
          medium: plan.medium,
        }))
      );
    }

    return {
      created: toCreate.length,
      skipped: planned.length - toCreate.length,
    };
  });
