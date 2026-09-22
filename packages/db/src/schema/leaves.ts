import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-valibot";
import * as v from "valibot";

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

export const leaveStatusSchema = v.picklist([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export type LeaveStatus = v.InferOutput<typeof leaveStatusSchema>;

/**
 * One row per leave application. A teacher submits a request with a
 * type, date range and reason; an admin then reviews it (approve or
 * reject, with an optional comment). The request stays `pending` until
 * reviewed; the owner can `cancel` their own pending request.
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
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    /** Admin (staff id) who approved/rejected, null while pending. */
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
    index("leave_request_start_date_idx").on(table.startDate),
    index("leave_request_year_idx").on(table.academicYearId),
  ]
);

const leaveRequestColumnRefinements = {
  id: () => leaveRequestIdSchema,
  staffId: () => staffIdSchema,
  academicYearId: () => academicYearIdSchema,
  type: () => leaveTypeSchema,
  startDate: () => isoDateSchema,
  endDate: () => isoDateSchema,
  reason: () => v.optional(v.nullable(v.string())),
  status: () => leaveStatusSchema,
  reviewedByStaffId: () => v.optional(v.nullable(staffIdSchema)),
  reviewComment: () => v.optional(v.nullable(v.string())),
};

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
