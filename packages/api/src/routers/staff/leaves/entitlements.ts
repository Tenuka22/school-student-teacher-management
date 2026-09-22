import {
  leaveEntitlement,
  leaveEntitlementInsertSchema,
  leaveRequest,
} from "@school-student-teacher-management/db/schema/leaves";
import type { LeaveType } from "@school-student-teacher-management/db/schema/leaves";
import {
  academicYear,
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import type { AcademicYearId } from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure, protectedProcedure } from "../../../index";

/** Default per-year quota split (data seed; editable per year afterwards). */
const DEFAULT_ENTITLEMENTS: Record<
  LeaveType,
  { maxDays: number; minDays: number }
> = {
  medical: { maxDays: 21, minDays: 0 },
  annual: { maxDays: 20, minDays: 0 },
  casual: { maxDays: 20, minDays: 0 },
  maternity: { maxDays: 84, minDays: 0 },
  duty: { maxDays: 30, minDays: 0 },
  other: { maxDays: 20, minDays: 0 },
};

/**
 * Lists the leave entitlement rows for one academic year together with
 * derived usage (approved leave days summed per type). Consumption is
 * computed, never stored, so it always agrees with the request ledger.
 */
export const listLeaveEntitlements = protectedProcedure
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
        maxDays: row.maxDays,
        minDays: row.minDays,
      })),
    };
  });

/**
 * Upserts one entitlement row (admin edits a quota). Editing a future
 * year's numbers is exactly how quotas "change over time" — no code
 * change, and past years keep their own rows.
 */
export const upsertLeaveEntitlement = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      leaveType: leaveEntitlementInsertSchema.entries.leaveType,
      maxDays: v.pipe(v.number(), v.integer(), v.minValue(0)),
      minDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
    })
  )
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select({ id: leaveEntitlement.id })
      .from(leaveEntitlement)
      .where(
        and(
          eq(leaveEntitlement.academicYearId, input.academicYearId),
          eq(leaveEntitlement.leaveType, input.leaveType)
        )
      )
      .limit(1);

    // oxlint-disable-next-line unicorn/prefer-ternary -- upsert reads clearer as branches
    if (existing) {
      await context.db
        .update(leaveEntitlement)
        .set({ maxDays: input.maxDays, minDays: input.minDays })
        .where(eq(leaveEntitlement.id, existing.id));
    } else {
      await context.db.insert(leaveEntitlement).values({
        id: crypto.randomUUID(),
        academicYearId: input.academicYearId,
        leaveType: input.leaveType,
        maxDays: input.maxDays,
        minDays: input.minDays,
      });
    }

    return { success: true };
  });

/**
 * Seeds the default entitlement rows for a year (idempotent). Called
 * when an academic year is created/opened; existing rows are untouched.
 */
export const seedLeaveEntitlements = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const existing = await context.db
      .select({ leaveType: leaveEntitlement.leaveType })
      .from(leaveEntitlement)
      .where(eq(leaveEntitlement.academicYearId, input.academicYearId));

    const present = new Set(existing.map((row) => row.leaveType));
    const missing = (Object.keys(DEFAULT_ENTITLEMENTS) as LeaveType[]).filter(
      (leaveType) => !present.has(leaveType)
    );

    if (missing.length > 0) {
      await context.db.insert(leaveEntitlement).values(
        missing.map((leaveType) => ({
          id: crypto.randomUUID(),
          academicYearId: input.academicYearId,
          leaveType,
          maxDays: DEFAULT_ENTITLEMENTS[leaveType].maxDays,
          minDays: DEFAULT_ENTITLEMENTS[leaveType].minDays,
        }))
      );
    }

    return { seeded: missing.length };
  });

/**
 * The signed-in staff member's leave balance for one year: entitlement
 * (max) minus approved usage (current) per type. Derived on read.
 */
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

    // Independent lookups — run in parallel.
    const [entitlements, approved] = await Promise.all([
      context.db
        .select()
        .from(leaveEntitlement)
        .where(eq(leaveEntitlement.academicYearId, academicYearId)),
      context.db
        .select({
          type: leaveRequest.type,
          startDate: leaveRequest.startDate,
          endDate: leaveRequest.endDate,
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

    const dayMs = 24 * 60 * 60 * 1000;
    const daysOf = (startDate: string, endDate: string) =>
      Math.floor(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / dayMs
      ) + 1;

    const usedByType = new Map<string, number>();
    for (const row of approved) {
      usedByType.set(
        row.type,
        (usedByType.get(row.type) ?? 0) + daysOf(row.startDate, row.endDate)
      );
    }

    return {
      academicYearId,
      balances: entitlements.map((row) => {
        const used = usedByType.get(row.leaveType) ?? 0;
        return {
          leaveType: row.leaveType as LeaveType,
          maxDays: row.maxDays,
          minDays: row.minDays,
          usedDays: used,
          remainingDays: row.maxDays - used,
        };
      }),
    };
  });
