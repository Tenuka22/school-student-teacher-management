import { ORPCError } from "@orpc/server";
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
      /*
       * `ORPCError("BAD_REQUEST")`, and the reason it was a bare `Error` is worth
       * stating because every other procedure in this repo gets it right.
       *
       * A plain `Error` inside an oRPC handler is not "a slightly less specific
       * error": it is serialised as `INTERNAL_SERVER_ERROR`, which means a clerk who
       * typed the primary range after the secondary one got a 500 — a server fault
       * badge, a masked message, and a monitor entry for a form-validation mistake.
       * The three conditions above are all *about what the caller sent*, so the
       * honest code is the one that says the request was bad, and the honest status
       * is the one the client can render as a sentence next to the form.
       *
       * The copy is therefore written for the person who has to fix it, and it
       * names both halves of the rule rather than the internals: the primary block
       * has to come before the secondary one, and the two must not overlap. "Both
       * ranges must be valid" was the part that told an administrator nothing —
       * validity is not something they can see from the form.
       */
      throw new ORPCError("BAD_REQUEST", {
        message:
          "The primary teaching block has to start before it ends, the secondary block has to start before it ends, and the two blocks cannot overlap",
      });
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
      /*
       * `INTERNAL_SERVER_ERROR`, not `BAD_REQUEST`, and stated as such because the
       * two lines in this handler used to be indistinguishable.
       *
       * `.returning()` on an `INSERT … ON CONFLICT DO UPDATE` comes back empty
       * when the write was swallowed by a rule rather than a filter, and there is
       * no input an administrator typed that can cause it. So this one is a genuine
       * server fault and says so — but it says it in oRPC's vocabulary rather than
       * as a bare `Error`, so it serialises as the 500 it is instead of arriving at
       * the client as an unlabelled string with no code to branch on.
       */
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "The attendance policy could not be read back after saving",
      });
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
