import { ORPCError } from "@orpc/server";
import { isSeededAccount } from "@school-student-teacher-management/auth";
import type { Database } from "@school-student-teacher-management/db";
import { getDayPartPeriodNumbers } from "@school-student-teacher-management/db/periods";
import {
  attendancePolicy,
  teacherAttendance,
  teacherPeriodAbsence,
} from "@school-student-teacher-management/db/schema/attendance";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import type {
  DeputyStatus,
  FinalStatus,
} from "@school-student-teacher-management/db/schema/leaves";
import {
  academicYear,
  staff,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import type { Context } from "../../../context";
import { protectedProcedure } from "../../../index";

type ApiDatabase = Context["db"];
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export const leaveYearSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(2000),
  v.maxValue(2100)
);

export const requireLeaveAcademicYear = async (
  db: ApiDatabase,
  year: number
) => {
  const [record] = await db
    .select({ id: academicYear.id, year: academicYear.year })
    .from(academicYear)
    .where(eq(academicYear.year, year))
    .limit(1);

  if (!record) {
    throw new ORPCError("NOT_FOUND", {
      message: `Academic year ${year} not found`,
    });
  }

  return record;
};

const recordApprovedLeaveAttendance = async (
  tx: DatabaseTransaction,
  request: typeof leaveRequest.$inferSelect,
  markedAt: Date
) => {
  const [policy] = await tx
    .select()
    .from(attendancePolicy)
    .where(eq(attendancePolicy.academicYearId, request.academicYearId))
    .limit(1);

  if (!policy) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "Attendance policy is not configured for this academic year",
    });
  }

  const start = new Date(`${request.startDate}T00:00:00Z`);
  const end = new Date(`${request.endDate}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  const dayCount = Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / dayMs) + 1
  );
  const dates = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  }).filter((date) => {
    const day = date.getUTCDay();
    return day !== 0 && day !== 6;
  });

  await Promise.all(
    dates.map(async (date) => {
      const dateString = date.toISOString().slice(0, 10);
      const [existing] = await tx
        .select({ id: teacherAttendance.id })
        .from(teacherAttendance)
        .where(
          and(
            eq(teacherAttendance.staffId, request.staffId),
            eq(teacherAttendance.academicYearId, request.academicYearId),
            eq(teacherAttendance.date, dateString)
          )
        )
        .limit(1);
      const attendanceId = existing?.id ?? crypto.randomUUID();
      const absencePeriods = getDayPartPeriodNumbers(
        request.dayPart,
        {
          startPeriodNumber: policy.primaryStartPeriodNumber,
          endPeriodNumber: policy.primaryEndPeriodNumber,
        },
        {
          startPeriodNumber: policy.secondaryStartPeriodNumber,
          endPeriodNumber: policy.secondaryEndPeriodNumber,
        }
      );
      const status = absencePeriods.length > 0 ? "partial" : "absent";
      const reason = `Approved ${request.type} leave`;

      if (existing) {
        await tx
          .update(teacherAttendance)
          .set({
            status,
            reason,
            leaveRequestId: request.id,
            markedAt,
          })
          .where(eq(teacherAttendance.id, attendanceId));
        await tx
          .delete(teacherPeriodAbsence)
          .where(eq(teacherPeriodAbsence.teacherAttendanceId, attendanceId));
      } else {
        await tx.insert(teacherAttendance).values({
          id: attendanceId,
          staffId: request.staffId,
          academicYearId: request.academicYearId,
          date: dateString,
          status,
          reason,
          leaveRequestId: request.id,
        });
      }

      if (absencePeriods.length > 0) {
        await tx.insert(teacherPeriodAbsence).values(
          absencePeriods.map((periodNumber) => ({
            id: crypto.randomUUID(),
            teacherAttendanceId: attendanceId,
            periodNumber,
            reason,
          }))
        );
      }
    })
  );
};

/** Position keys (see constants/positions.ts) that may recommend leave. */
const DEPUTY_POSITIONS = new Set(["vicePrincipal", "assistantPrincipal"]);
/** Position keys that may finalise a leave request. */
const PRINCIPAL_POSITIONS = new Set(["principal"]);

export const resolveAuthority = async (
  db: ApiDatabase,
  userId: string,
  academicYearId: string
) => {
  const [account] = await db
    .select({ role: user.role, username: user.username })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const isSeededLeadership =
    isSeededAccount(account?.username) &&
    (account?.role === "principal" || account?.role === "vicePrincipal");

  if (account && isSeededLeadership) {
    return {
      staffId: null,
      isDeputy: account.role === "vicePrincipal",
      isPrincipal: account.role === "principal",
    };
  }

  const [staffRecord] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.userId, userId))
    .limit(1);

  if (!staffRecord) {
    return null;
  }

  const positions = await db
    .select({ position: staffPosition.position })
    .from(staffPosition)
    .where(
      and(
        eq(staffPosition.staffId, staffRecord.id),
        eq(staffPosition.academicYearId, academicYearId)
      )
    );
  const positionKeys = positions.map((row) => row.position);

  return {
    staffId: staffRecord.id,
    isDeputy: positionKeys.some((key) => DEPUTY_POSITIONS.has(key)),
    isPrincipal: positionKeys.some((key) => PRINCIPAL_POSITIONS.has(key)),
  };
};

/**
 * Deputy Principal acts on a leave request: **recommends** (or rejects).
 * This is a recommendation only — it does not finalise the request.
 */
export const recommendLeave = protectedProcedure
  .input(
    v.object({
      id: v.string(),
      year: leaveYearSchema,
      decision: v.picklist(["recommended", "rejected"]),
      comment: v.optional(v.nullable(v.string())),
    })
  )
  .handler(async ({ input, context }) => {
    const selectedYear = await requireLeaveAcademicYear(context.db, input.year);
    const authority = await resolveAuthority(
      context.db,
      context.session.user.id,
      selectedYear.id
    );

    if (!authority?.isDeputy) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only the Deputy Principal can recommend leave requests",
      });
    }

    const [record] = await context.db
      .select()
      .from(leaveRequest)
      .where(
        and(
          eq(leaveRequest.id, input.id),
          eq(leaveRequest.academicYearId, selectedYear.id)
        )
      )
      .limit(1);

    if (!record) {
      throw new ORPCError("NOT_FOUND", { message: "Leave request not found" });
    }

    if (record.finalizedAt) {
      throw new ORPCError("CONFLICT", {
        message: "This request is already finalised by the Principal",
      });
    }

    if (record.deputyStatus !== "pending" || record.status !== "pending") {
      throw new ORPCError("CONFLICT", {
        message: "This request has already received a Deputy decision",
      });
    }

    const [updated] = await context.db
      .update(leaveRequest)
      .set({
        deputyStatus: input.decision satisfies DeputyStatus,
        deputyStaffId: authority.staffId,
        deputyActedAt: new Date(),
        deputyComment: input.comment ?? null,
        // Overall status mirrors the recommendation step until the
        // Principal finalises.
        status: input.decision === "recommended" ? "recommended" : "rejected",
      })
      .where(
        and(
          eq(leaveRequest.id, input.id),
          eq(leaveRequest.academicYearId, selectedYear.id)
        )
      )
      .returning();

    if (!updated) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: updated.id,
      status: updated.status,
      deputyStatus: updated.deputyStatus,
    };
  });

/**
 * Principal acts on a leave request: approve or reject. **Final** — sets
 * `finalizedAt`, after which no further action is possible (the deputy
 * recommendation is preserved for the audit trail).
 */
export const finalizeLeave = protectedProcedure
  .input(
    v.object({
      id: v.string(),
      year: leaveYearSchema,
      decision: v.picklist(["approved", "rejected"]),
      comment: v.optional(v.nullable(v.string())),
      overrideReason: v.optional(v.string()),
    })
  )
  .handler(async ({ input, context }) => {
    const selectedYear = await requireLeaveAcademicYear(context.db, input.year);
    const authority = await resolveAuthority(
      context.db,
      context.session.user.id,
      selectedYear.id
    );

    if (!authority?.isPrincipal) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only the Principal can approve or reject leave requests",
      });
    }

    const updated = await context.db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(leaveRequest)
        .where(
          and(
            eq(leaveRequest.id, input.id),
            eq(leaveRequest.academicYearId, selectedYear.id)
          )
        )
        .limit(1);

      if (!record) {
        throw new ORPCError("NOT_FOUND", {
          message: "Leave request not found",
        });
      }

      if (record.finalizedAt) {
        throw new ORPCError("CONFLICT", {
          message: "This request was already finalised",
        });
      }

      const isBypass =
        record.deputyStatus !== "recommended" ||
        record.status !== "recommended";
      if (isBypass && !input.overrideReason?.trim()) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "A Principal override reason is required when bypassing the Deputy review",
        });
      }

      const now = new Date();
      const [result] = await tx
        .update(leaveRequest)
        .set({
          finalStatus: input.decision satisfies FinalStatus,
          principalStaffId: authority.staffId,
          principalActedAt: now,
          principalComment: input.comment ?? input.overrideReason ?? null,
          finalizedAt: now,
          status: input.decision,
        })
        .where(
          and(
            eq(leaveRequest.id, input.id),
            eq(leaveRequest.academicYearId, selectedYear.id)
          )
        )
        .returning();

      if (!result) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      if (result.status === "approved") {
        await recordApprovedLeaveAttendance(tx, result, now);
      }

      return result;
    });

    return {
      id: updated.id,
      status: updated.status,
      finalStatus: updated.finalStatus,
      finalizedAt: updated.finalizedAt?.toISOString() ?? null,
    };
  });

/**
 * The signed-in user's review-chain authority for the selected academic
 * year. Lets the UI show only the buttons that member can actually use:
 * the Deputy Principal gets recommend controls, the Principal gets the
 * finalise controls, everyone else gets neither.
 */
export const getMyAuthority = protectedProcedure
  .input(v.object({ year: leaveYearSchema }))
  .handler(async ({ input, context }) => {
    const selectedYear = await requireLeaveAcademicYear(context.db, input.year);
    const authority = await resolveAuthority(
      context.db,
      context.session.user.id,
      selectedYear.id
    );

    return {
      isDeputy: authority?.isDeputy ?? false,
      isPrincipal: authority?.isPrincipal ?? false,
    };
  });
