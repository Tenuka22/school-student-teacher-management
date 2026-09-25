import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-valibot";
import * as v from "valibot";

import { LEAVE_DAY_PARTS, LEAVE_PAYMENT_STATUSES } from "../constants/leave";
import { brand } from "./brand";
import type { Brand } from "./brand";
import { isoDateSchema } from "./primitives";
import {
  academicYear,
  academicYearIdSchema,
  staff,
  staffIdSchema,
} from "./staff";

export type LeaveRequestId = Brand<string, "LeaveRequestId">;
export const leaveRequestIdSchema = v.pipe(
  v.string(),
  brand<string, "LeaveRequestId">()
);

/**
 * Leave categories a teacher can request. `duty` covers official
 * duty leave (exam duty, sports meets, in-service days) where the
 * school sends the teacher out rather than the teacher being away
 * for personal reasons.
 */
export const leaveTypeSchema = v.picklist([
  "annual",
  "casual",
  "medical",
  "maternity",
  "duty",
  "other",
]);
export type LeaveType = v.InferOutput<typeof leaveTypeSchema>;

export const leaveDayPartSchema = v.picklist(LEAVE_DAY_PARTS);
export type LeaveDayPart = v.InferOutput<typeof leaveDayPartSchema>;

export const leavePaymentStatusSchema = v.picklist(LEAVE_PAYMENT_STATUSES);
export type LeavePaymentStatus = v.InferOutput<typeof leavePaymentStatusSchema>;

export const leaveStatusSchema = v.picklist([
  "pending",
  "recommended",
  "approved",
  "rejected",
  "cancelled",
]);
export type LeaveStatus = v.InferOutput<typeof leaveStatusSchema>;

export const deputyStatusSchema = v.picklist([
  "pending",
  "recommended",
  "rejected",
]);
export type DeputyStatus = v.InferOutput<typeof deputyStatusSchema>;

export const finalStatusSchema = v.picklist([
  "pending",
  "approved",
  "rejected",
]);
export type FinalStatus = v.InferOutput<typeof finalStatusSchema>;

/**
 * One row per leave application. A teacher submits a request with a
 * type, date range and reason; an admin then reviews it (approve or
 * reject, with an optional comment). The request stays `pending` until
 * reviewed; the owner can `cancel` their own pending request.
 */
/**
 * One row per leave application. Two-step approval chain:
 * the Deputy Principal (vice/assistant principal position) **recommends**
 * (or rejects), then the Principal **approves/rejects** — only the
 * Principal's action finalises the request (locked via `finalizedAt`).
 * The owner can cancel any non-finalised request.
 */
export const leaveRequest = pgTable(
  "leave_request",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    /** ISO date string, e.g. "2026-09-22" (inclusive) */
    startDate: text("start_date").notNull(),
    /** ISO date string, inclusive; same as startDate for single-day leave */
    endDate: text("end_date").notNull(),
    dayPart: text("day_part").notNull().default("full"),
    paymentStatus: text("payment_status").notNull().default("notApplicable"),
    reason: text("reason"),
    /** Overall status derived from the two-step chain; kept in sync server-side. */
    status: text("status").notNull().default("pending"),

    // ─── Step 1: Deputy Principal recommendation ───
    deputyStatus: text("deputy_status").notNull().default("pending"),
    deputyStaffId: text("deputy_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    deputyActedAt: timestamp("deputy_acted_at"),
    deputyComment: text("deputy_comment"),

    // ─── Step 2: Principal decision (final) ───
    finalStatus: text("final_status").notNull().default("pending"),
    principalStaffId: text("principal_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    principalActedAt: timestamp("principal_acted_at"),
    principalComment: text("principal_comment"),
    /** Set the moment the Principal acts — request becomes immutable. */
    finalizedAt: timestamp("finalized_at"),

    // Legacy single-step review columns (pre-chain requests); nullable.
    reviewedByStaffId: text("reviewed_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    reviewComment: text("review_comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("leave_request_staff_idx").on(table.staffId),
    index("leave_request_status_idx").on(table.status),
    index("leave_request_deputy_status_idx").on(table.deputyStatus),
    index("leave_request_final_status_idx").on(table.finalStatus),
    index("leave_request_start_date_idx").on(table.startDate),
    index("leave_request_year_idx").on(table.academicYearId),
  ]
);

/**
 * Dynamic, per-year leave quota: one row per (academic year, leave type).
 * Changing next year's quota is a data edit on that year's rows — no code
 * change, and historical years keep their own rows (history never corrupts).
 * Consumption is derived (SUM of approved leave days), never stored.
 */
export const leaveEntitlement = pgTable(
  "leave_entitlement",
  {
    id: text("id").primaryKey(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    leaveType: text("leave_type").notNull(),
    paymentStatus: text("payment_status").notNull().default("notApplicable"),
    /** Maximum days for this type in this year (e.g. 21 medical, 20 other). */
    maxDays: integer("max_days").notNull(),
    /** Floor used for validation/warnings (e.g. minimum notice). */
    minDays: integer("min_days").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("leave_entitlement_year_type_payment_unique").on(
      table.academicYearId,
      table.leaveType,
      table.paymentStatus
    ),
    index("leave_entitlement_year_idx").on(table.academicYearId),
  ]
);

const leaveRequestColumnRefinements = {
  id: () => leaveRequestIdSchema,
  staffId: () => staffIdSchema,
  academicYearId: () => academicYearIdSchema,
  type: () => leaveTypeSchema,
  startDate: () => isoDateSchema,
  endDate: () => isoDateSchema,
  dayPart: () => leaveDayPartSchema,
  paymentStatus: () => leavePaymentStatusSchema,
  reason: () => v.optional(v.nullable(v.string())),
  status: () => leaveStatusSchema,
  deputyStatus: () => deputyStatusSchema,
  deputyStaffId: () => v.optional(v.nullable(staffIdSchema)),
  finalStatus: () => finalStatusSchema,
  principalStaffId: () => v.optional(v.nullable(staffIdSchema)),
  reviewedByStaffId: () => v.optional(v.nullable(staffIdSchema)),
  reviewComment: () => v.optional(v.nullable(v.string())),
};

export const leaveEntitlementIdSchema = v.pipe(
  v.string(),
  brand<string, "LeaveEntitlementId">()
);
export type LeaveEntitlementId = Brand<string, "LeaveEntitlementId">;

const leaveEntitlementColumnRefinements = {
  id: () => leaveEntitlementIdSchema,
  academicYearId: () => academicYearIdSchema,
  leaveType: () => leaveTypeSchema,
  paymentStatus: () => leavePaymentStatusSchema,
  maxDays: () => v.pipe(v.number(), v.integer(), v.minValue(0)),
  minDays: () => v.pipe(v.number(), v.integer(), v.minValue(0)),
};

export const leaveEntitlementSelectSchema = createSelectSchema(
  leaveEntitlement,
  leaveEntitlementColumnRefinements
);
export const leaveEntitlementInsertSchema = createInsertSchema(
  leaveEntitlement,
  leaveEntitlementColumnRefinements
);
export const leaveEntitlementUpdateSchema = createUpdateSchema(
  leaveEntitlement,
  leaveEntitlementColumnRefinements
);

export const leaveRequestSelectSchema = createSelectSchema(
  leaveRequest,
  leaveRequestColumnRefinements
);
export const leaveRequestInsertSchema = createInsertSchema(
  leaveRequest,
  leaveRequestColumnRefinements
);
export const leaveRequestUpdateSchema = createUpdateSchema(
  leaveRequest,
  leaveRequestColumnRefinements
);
