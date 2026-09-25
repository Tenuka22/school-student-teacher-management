import {
  attendancePolicy,
  timeOfDaySchema,
} from "@school-student-teacher-management/db/schema/attendance";
import { periodNumberSchema } from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure } from "../../../index";
import { requireAttendanceAcademicYear } from "./academic-year";

const boundedPeriodSchema = v.pipe(
  periodNumberSchema,
  v.integer(),
  v.minValue(1),
  v.maxValue(8)
);

const resolvePolicyValue = <T>(
  input: T | undefined,
  existing: T | undefined,
  fallback: T
) => input ?? existing ?? fallback;

export const updatePolicy = adminOnlyProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      arrivalCutoffTime: v.optional(timeOfDaySchema),
      shortLeavesPerMonth: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(31))
      ),
      primaryStartPeriodNumber: v.optional(boundedPeriodSchema),
      primaryEndPeriodNumber: v.optional(boundedPeriodSchema),
      secondaryStartPeriodNumber: v.optional(boundedPeriodSchema),
      secondaryEndPeriodNumber: v.optional(boundedPeriodSchema),
    })
  )
  .handler(async ({ input, context }) => {
    await requireAttendanceAcademicYear(context.db, input.academicYearId);

    const [existing] = await context.db
      .select()
      .from(attendancePolicy)
      .where(eq(attendancePolicy.academicYearId, input.academicYearId))
      .limit(1);

    const policy = {
      arrivalCutoffTime: resolvePolicyValue(
        input.arrivalCutoffTime,
        existing?.arrivalCutoffTime,
        "07:30"
      ),
      shortLeavesPerMonth: resolvePolicyValue(
        input.shortLeavesPerMonth,
        existing?.shortLeavesPerMonth,
        2
      ),
      primaryStartPeriodNumber: resolvePolicyValue(
        input.primaryStartPeriodNumber,
        existing?.primaryStartPeriodNumber,
        1
      ),
      primaryEndPeriodNumber: resolvePolicyValue(
        input.primaryEndPeriodNumber,
        existing?.primaryEndPeriodNumber,
        4
      ),
      secondaryStartPeriodNumber: resolvePolicyValue(
        input.secondaryStartPeriodNumber,
        existing?.secondaryStartPeriodNumber,
        5
      ),
      secondaryEndPeriodNumber: resolvePolicyValue(
        input.secondaryEndPeriodNumber,
        existing?.secondaryEndPeriodNumber,
        8
      ),
    };

    const primaryIsInvalid =
      policy.primaryStartPeriodNumber > policy.primaryEndPeriodNumber;
    const secondaryIsInvalid =
      policy.secondaryStartPeriodNumber > policy.secondaryEndPeriodNumber;
    const rangesOverlap =
      policy.primaryStartPeriodNumber <= policy.secondaryEndPeriodNumber &&
      policy.secondaryStartPeriodNumber <= policy.primaryEndPeriodNumber;

    if (primaryIsInvalid || secondaryIsInvalid || rangesOverlap) {
      throw new Error(
        "Primary must come before Secondary and both ranges must be valid"
      );
    }

    const [saved] = await context.db
      .insert(attendancePolicy)
      .values({
        id: existing?.id ?? crypto.randomUUID(),
        academicYearId: input.academicYearId,
        ...policy,
      })
      .onConflictDoUpdate({
        target: attendancePolicy.academicYearId,
        set: {
          ...policy,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!saved) {
      throw new Error("Attendance policy missing after save");
    }

    return {
      academicYearId: saved.academicYearId,
      arrivalCutoffTime: saved.arrivalCutoffTime,
      shortLeavesPerMonth: saved.shortLeavesPerMonth,
      primaryStartPeriodNumber: saved.primaryStartPeriodNumber,
      primaryEndPeriodNumber: saved.primaryEndPeriodNumber,
      secondaryStartPeriodNumber: saved.secondaryStartPeriodNumber,
      secondaryEndPeriodNumber: saved.secondaryEndPeriodNumber,
    };
  });
