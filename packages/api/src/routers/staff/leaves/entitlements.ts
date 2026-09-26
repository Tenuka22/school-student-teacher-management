import {
  DEFAULT_LEAVE_ENTITLEMENTS,
  calculateLeaveDays,
} from "@school-student-teacher-management/db/constants/leave";
import {
  leaveEntitlement,
  leaveEntitlementInsertSchema,
  leaveRequest,
} from "@school-student-teacher-management/db/schema/leaves";
import type {
  LeaveDayPart,
  LeavePaymentStatus,
  LeaveType,
} from "@school-student-teacher-management/db/schema/leaves";
import {
  academicYear,
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import type { AcademicYearId } from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure, protectedProcedure } from "../../../index";

const entitlementKey = (leaveType: string, paymentStatus: string) =>
  `${leaveType}:${paymentStatus}`;

/**
 * The quota table for one academic year — every leave type and payment status
 * the College recognises, maternity tiers included.
 *
 * **`adminOnlyProcedure`, not `protectedProcedure`.** This returns the whole
 * school's leave policy, not the caller's own balance: a teacher's own figures
 * come from `getMyLeaveBalance` below, which is scoped to their `staffId` and
 * net of what they have already taken. On `protectedProcedure` this procedure
 * was readable by any signed-in account, including the `user` role that no
 * screen ever issues, which handed every quota in the College — including the
 * 84-day maternity tiers — to anyone who asked.
 *
 * It is `adminOnly` rather than `admin` because it is the read half of the same
 * pair as `upsertLeaveEntitlement` and `seedLeaveEntitlements` below, which are
 * already `adminOnly`: a quota an administrator may set but not read back is
 * not a workable surface. Deleting it instead would leave the write half with
 * nothing to verify against.
 */
export const listLeaveEntitlements = adminOnlyProcedure
  .input(
    v.object({
      academicYearId: v.optional(academicYearIdSchema),
    })
  )
  .handler(async ({ input, context }) => {
    let academicYearId: AcademicYearId | undefined = input.academicYearId;

    if (!academicYearId) {
      const [currentYear] = await context.db
        .select({ id: academicYear.id })
        .from(academicYear)
        .where(eq(academicYear.isCurrent, true))
        .limit(1);
      if (!currentYear) {
        return { entitlements: [] };
      }
      academicYearId = currentYear.id as AcademicYearId;
    }

    const rows = await context.db
      .select()
      .from(leaveEntitlement)
      .where(eq(leaveEntitlement.academicYearId, academicYearId));

    return {
      academicYearId,
      entitlements: rows.map((row) => ({
        id: row.id,
        leaveType: row.leaveType as LeaveType,
        paymentStatus: row.paymentStatus as LeavePaymentStatus,
        maxDays: row.maxDays,
        minDays: row.minDays,
      })),
    };
  });

export const upsertLeaveEntitlement = adminOnlyProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      leaveType: leaveEntitlementInsertSchema.entries.leaveType,
      paymentStatus: leaveEntitlementInsertSchema.entries.paymentStatus,
      maxDays: v.pipe(v.number(), v.integer(), v.minValue(0)),
      minDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
    })
  )
  .handler(async ({ input, context }) => {
    await context.db
      .insert(leaveEntitlement)
      .values({
        id: crypto.randomUUID(),
        academicYearId: input.academicYearId,
        leaveType: input.leaveType,
        paymentStatus: input.paymentStatus,
        maxDays: input.maxDays,
        minDays: input.minDays,
      })
      .onConflictDoUpdate({
        target: [
          leaveEntitlement.academicYearId,
          leaveEntitlement.leaveType,
          leaveEntitlement.paymentStatus,
        ],
        set: { maxDays: input.maxDays, minDays: input.minDays },
      });

    return { success: true };
  });

export const seedLeaveEntitlements = adminOnlyProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const existing = await context.db
      .select({
        leaveType: leaveEntitlement.leaveType,
        paymentStatus: leaveEntitlement.paymentStatus,
      })
      .from(leaveEntitlement)
      .where(eq(leaveEntitlement.academicYearId, input.academicYearId));

    const present = new Set(
      existing.map((row) => entitlementKey(row.leaveType, row.paymentStatus))
    );
    const missing = DEFAULT_LEAVE_ENTITLEMENTS.filter(
      (entitlement) =>
        !present.has(
          entitlementKey(entitlement.leaveType, entitlement.paymentStatus)
        )
    );

    if (missing.length > 0) {
      await context.db.insert(leaveEntitlement).values(
        missing.map((entitlement) => ({
          id: crypto.randomUUID(),
          academicYearId: input.academicYearId,
          leaveType: entitlement.leaveType,
          paymentStatus: entitlement.paymentStatus,
          maxDays: entitlement.maxDays,
          minDays: entitlement.minDays,
        }))
      );
    }

    return { seeded: missing.length };
  });

export const getMyLeaveBalance = protectedProcedure
  .input(
    v.object({
      academicYearId: v.optional(academicYearIdSchema),
    })
  )
  .handler(async ({ input, context }) => {
    const [staffRecord] = await context.db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.userId, context.session.user.id))
      .limit(1);

    if (!staffRecord) {
      return { balances: [] };
    }

    let academicYearId: AcademicYearId | undefined = input.academicYearId;
    if (!academicYearId) {
      const [currentYear] = await context.db
        .select({ id: academicYear.id })
        .from(academicYear)
        .where(eq(academicYear.isCurrent, true))
        .limit(1);
      if (!currentYear) {
        return { balances: [] };
      }
      academicYearId = currentYear.id as AcademicYearId;
    }

    const [entitlements, approved] = await Promise.all([
      context.db
        .select()
        .from(leaveEntitlement)
        .where(eq(leaveEntitlement.academicYearId, academicYearId)),
      context.db
        .select({
          type: leaveRequest.type,
          paymentStatus: leaveRequest.paymentStatus,
          startDate: leaveRequest.startDate,
          endDate: leaveRequest.endDate,
          dayPart: leaveRequest.dayPart,
        })
        .from(leaveRequest)
        .where(
          and(
            eq(leaveRequest.staffId, staffRecord.id),
            eq(leaveRequest.academicYearId, academicYearId),
            eq(leaveRequest.status, "approved")
          )
        ),
    ]);

    const usedByEntitlement = new Map<string, number>();
    for (const row of approved) {
      const key = entitlementKey(row.type, row.paymentStatus);
      usedByEntitlement.set(
        key,
        (usedByEntitlement.get(key) ?? 0) +
          calculateLeaveDays(
            row.startDate,
            row.endDate,
            row.dayPart as LeaveDayPart
          )
      );
    }

    return {
      academicYearId,
      balances: entitlements.map((row) => {
        const used =
          usedByEntitlement.get(
            entitlementKey(row.leaveType, row.paymentStatus)
          ) ?? 0;
        return {
          leaveType: row.leaveType as LeaveType,
          paymentStatus: row.paymentStatus as LeavePaymentStatus,
          maxDays: row.maxDays,
          minDays: row.minDays,
          usedDays: used,
          remainingDays: row.maxDays - used,
        };
      }),
    };
  });
