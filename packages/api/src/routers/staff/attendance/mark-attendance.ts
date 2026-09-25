import { ORPCError } from "@orpc/server";
import { getDayPartPeriodNumbers } from "@school-student-teacher-management/db/periods";
import {
  attendancePolicy,
  teacherAttendance,
  teacherAttendanceStatusSchema,
  teacherPeriodAbsence,
} from "@school-student-teacher-management/db/schema/attendance";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import type { LeaveDayPart } from "@school-student-teacher-management/db/schema/leaves";
import { periodNumberSchema } from "@school-student-teacher-management/db/schema/periods";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq, gte, lte } from "drizzle-orm";
import * as v from "valibot";

import type { Context } from "../../../context";
import { adminProcedure } from "../../../index";
import { resolveAuthority } from "../leaves/leadership-review";
import {
  assertDateWithinAcademicYear,
  requireAttendanceAcademicYear,
} from "./academic-year";

const absentPeriodSchema = v.object({
  periodNumber: periodNumberSchema,
  reason: v.optional(v.string(), ""),
});

type ApiDatabase = Context["db"];

interface MarkAttendanceInput {
  staffId: string;
  academicYearId: string;
  date: string;
  overrideApprovedLeave: boolean;
  overrideReason?: string;
}

interface ApprovedLeave {
  id: string;
  dayPart: string;
  type: string;
}

const findApprovedLeave = async (
  db: ApiDatabase,
  input: MarkAttendanceInput
): Promise<ApprovedLeave | undefined> => {
  const [leave] = await db
    .select({
      id: leaveRequest.id,
      dayPart: leaveRequest.dayPart,
      type: leaveRequest.type,
    })
    .from(leaveRequest)
    .where(
      and(
        eq(leaveRequest.staffId, input.staffId),
        eq(leaveRequest.academicYearId, input.academicYearId),
        eq(leaveRequest.status, "approved"),
        lte(leaveRequest.startDate, input.date),
        gte(leaveRequest.endDate, input.date)
      )
    )
    .limit(1);
  return leave;
};

const validateLeaveOverride = async (
  db: ApiDatabase,
  leave: ApprovedLeave | undefined,
  input: MarkAttendanceInput & { userId: string }
) => {
  if (!leave || !input.overrideApprovedLeave) {
    return;
  }
  if (!input.overrideReason?.trim()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A reason is required to override approved leave attendance",
    });
  }
  const authority = await resolveAuthority(
    db,
    input.userId,
    input.academicYearId
  );
  if (!authority?.isPrincipal) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only the Principal can override approved leave attendance",
    });
  }
};

const periodsForAttendanceStatus = (
  status: string,
  absentPeriods: { periodNumber: number; reason: string }[],
  dayPart: LeaveDayPart,
  primaryRange: { startPeriodNumber: number; endPeriodNumber: number },
  secondaryRange: { startPeriodNumber: number; endPeriodNumber: number }
) => {
  if (status === "partial") {
    return absentPeriods;
  }
  if (status !== "halfDay") {
    return [];
  }
  if (absentPeriods.length > 0) {
    return absentPeriods;
  }
  return getDayPartPeriodNumbers(dayPart, primaryRange, secondaryRange).map(
    (periodNumber) => ({
      periodNumber,
      reason: "",
    })
  );
};

export const markAttendance = adminProcedure
  .input(
    v.object({
      staffId: staffIdSchema,
      academicYearId: academicYearIdSchema,
      date: isoDateSchema,
      status: teacherAttendanceStatusSchema,
      reason: v.optional(v.nullable(v.string())),
      absentPeriods: v.optional(v.array(absentPeriodSchema), []),
      overrideApprovedLeave: v.optional(v.boolean(), false),
      overrideReason: v.optional(v.string()),
    })
  )
  .handler(async ({ input, context }) => {
    const year = await requireAttendanceAcademicYear(
      context.db,
      input.academicYearId
    );
    assertDateWithinAcademicYear(input.date, year);

    const approvedLeave = await findApprovedLeave(context.db, input);
    if (approvedLeave && !input.overrideApprovedLeave) {
      throw new ORPCError("CONFLICT", {
        message: `Attendance is locked by approved ${approvedLeave.type} leave`,
      });
    }
    await validateLeaveOverride(context.db, approvedLeave, {
      ...input,
      userId: context.session.user.id,
    });

    const [policy] = await context.db
      .select()
      .from(attendancePolicy)
      .where(eq(attendancePolicy.academicYearId, input.academicYearId))
      .limit(1);

    if (
      input.status === "halfDay" &&
      input.absentPeriods.length === 0 &&
      !policy
    ) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "Attendance policy is not configured for this academic year",
      });
    }

    const isPresent =
      input.status === "present" || input.status === "lateShortLeave";
    const requestedPeriods = periodsForAttendanceStatus(
      input.status,
      input.absentPeriods,
      approvedLeave?.dayPart === "afternoon" ? "afternoon" : "morning",
      {
        startPeriodNumber: policy?.primaryStartPeriodNumber ?? 1,
        endPeriodNumber: policy?.primaryEndPeriodNumber ?? 4,
      },
      {
        startPeriodNumber: policy?.secondaryStartPeriodNumber ?? 5,
        endPeriodNumber: policy?.secondaryEndPeriodNumber ?? 8,
      }
    );
    let normalizedStatus: "present" | "partial" | "absent" = "partial";
    if (isPresent) {
      normalizedStatus = "present";
    } else if (input.status === "absent" && requestedPeriods.length === 0) {
      normalizedStatus = "absent";
    }

    return await context.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: teacherAttendance.id })
        .from(teacherAttendance)
        .where(
          and(
            eq(teacherAttendance.staffId, input.staffId),
            eq(teacherAttendance.academicYearId, input.academicYearId),
            eq(teacherAttendance.date, input.date)
          )
        )
        .limit(1);

      if (isPresent) {
        if (approvedLeave && input.overrideApprovedLeave) {
          if (existing) {
            await tx
              .update(teacherAttendance)
              .set({
                status: "present",
                reason: input.overrideReason?.trim() || null,
                leaveRequestId: null,
                markedAt: new Date(),
              })
              .where(eq(teacherAttendance.id, existing.id));
            await tx
              .delete(teacherPeriodAbsence)
              .where(eq(teacherPeriodAbsence.teacherAttendanceId, existing.id));
          } else {
            await tx.insert(teacherAttendance).values({
              id: crypto.randomUUID(),
              staffId: input.staffId,
              academicYearId: input.academicYearId,
              date: input.date,
              status: "present",
              reason: input.overrideReason?.trim() || null,
            });
          }
        } else if (existing) {
          await tx
            .delete(teacherPeriodAbsence)
            .where(eq(teacherPeriodAbsence.teacherAttendanceId, existing.id));
          await tx
            .delete(teacherAttendance)
            .where(eq(teacherAttendance.id, existing.id));
        }

        return {
          staffId: input.staffId,
          academicYearId: input.academicYearId,
          date: input.date,
          status: "present" as const,
          absentPeriods: [],
        };
      }

      const id = existing?.id ?? crypto.randomUUID();
      const reason = input.reason?.trim() || null;

      if (existing) {
        await tx
          .update(teacherAttendance)
          .set({
            status: normalizedStatus,
            reason,
            leaveRequestId: null,
            markedAt: new Date(),
          })
          .where(eq(teacherAttendance.id, id));
        await tx
          .delete(teacherPeriodAbsence)
          .where(eq(teacherPeriodAbsence.teacherAttendanceId, id));
      } else {
        await tx.insert(teacherAttendance).values({
          id,
          staffId: input.staffId,
          academicYearId: input.academicYearId,
          date: input.date,
          status: normalizedStatus,
          reason,
        });
      }

      const uniquePeriods = new Map(
        requestedPeriods.map((period) => [period.periodNumber, period.reason])
      );
      if (uniquePeriods.size > 0) {
        await tx.insert(teacherPeriodAbsence).values(
          [...uniquePeriods].map(([periodNumber, periodReason]) => ({
            id: crypto.randomUUID(),
            teacherAttendanceId: id,
            periodNumber,
            reason: periodReason,
          }))
        );
      }

      return {
        staffId: input.staffId,
        academicYearId: input.academicYearId,
        date: input.date,
        status: normalizedStatus,
        absentPeriods: [...uniquePeriods].map(
          ([periodNumber, periodReason]) => ({
            periodNumber,
            reason: periodReason,
          })
        ),
      };
    });
  });
