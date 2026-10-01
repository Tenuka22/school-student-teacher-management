import {
  humanizeKey,
  subjectLabel,
} from "@school-student-teacher-management/db/constants/display";
import { leaveTypeLabel } from "@school-student-teacher-management/db/constants/leave-labels";
import { format } from "date-fns";

import type { HistoryTab } from "./historical-data-search";

/**
 * One year's history, as `getHistoricalData` returns it, and the six row shapes
 * that come out of it.
 *
 * The tab names and the property names disagree on three of the six
 * (`homerooms` reads `homeroomHistory`, and so on), which is why `HistoryRows`
 * maps them rather than letting each caller remember: a table built from the
 * wrong property would be a silent empty tab, not an error.
 */
export interface HistoricalData {
  staff: {
    id: string;
    name: string;
    teacherServiceNo: string | null;
    positions: {
      id: string;
      position: string;
      sectionalScope: string | null;
    }[];
  }[];
  subjects: {
    id: string;
    staffId: string;
    staffName: string;
    subjectKey: string;
  }[];
  timetables: {
    id: string;
    classId: string;
    className: string;
    gradeLevel: number;
    staffId: string;
    staffName: string;
    dayOfWeek: number;
    periodNumber: number;
    subjectKey: string;
  }[];
  homeroomHistory: {
    id: string;
    className: string;
    gradeLevel: number;
    previousTeacherName: string | null;
    newTeacherName: string | null;
    changeType: string;
    reason: string | null;
    note: string | null;
    changedAt: string;
  }[];
  leaveDecisions: {
    id: string;
    staffId: string;
    staffName: string;
    type: string;
    startDate: string;
    endDate: string;
    dayPart: string;
    paymentStatus: string;
    reason: string | null;
    status: string;
    deputyStatus: string;
    deputyComment: string | null;
    finalStatus: string;
    principalComment: string | null;
    finalizedAt: string | null;
    createdAt: string;
  }[];
  attendanceExceptions: {
    id: string;
    staffId: string;
    staffName: string;
    date: string;
    status: string;
    reason: string | null;
    leaveRequestId: string | null;
    absentPeriods: { periodNumber: number; reason: string }[];
  }[];
}

type HistoryRows = {
  [TTab in HistoryTab]: TTab extends "staff"
    ? HistoricalData["staff"][number]
    : TTab extends "subjects"
      ? HistoricalData["subjects"][number]
      : TTab extends "timetables"
        ? HistoricalData["timetables"][number]
        : TTab extends "homerooms"
          ? HistoricalData["homeroomHistory"][number]
          : TTab extends "leaves"
            ? HistoricalData["leaveDecisions"][number]
            : HistoricalData["attendanceExceptions"][number];
};

/** The row a tab's table is built from. */
export type HistoryRow<TTab extends HistoryTab = HistoryTab> =
  HistoryRows[TTab];

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

/** A stored `dayOfWeek`, as the reader sees it — and as the search matches it. */
export const weekdayName = (dayOfWeek: number): string =>
  WEEKDAYS[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;

/**
 * A stored date as a reader sees it.
 *
 * A malformed stored value (a single-digit day slipped in outside the
 * `isoDateSchema`-validated write path, for instance) must not take the
 * whole history page down with it — `format` throws `RangeError: Invalid
 * time value` on an unparseable `Date`, which this tab let escape all the
 * way to the router's error boundary. The stored text is the fallback: it
 * is wrong, but it is not nothing.
 */
export const formatDate = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "d MMM yyyy");
};

export const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : format(parsed, "d MMM yyyy, HH:mm");
};

export const formatLeaveDescription = (
  type: string,
  dayPart: string,
  paymentStatus: string
): string => {
  let duration = "Full day";
  if (dayPart === "morning") {
    duration = "First half (Primary)";
  } else if (dayPart === "afternoon") {
    duration = "Second half (Secondary)";
  }
  if (type !== "maternity" || paymentStatus === "notApplicable") {
    return duration;
  }
  const payment = paymentStatus === "paid" ? "Paid" : "Unpaid";
  return `${duration} · ${payment}`;
};

/**
 * The three tabs with a status a reader narrows by, and the state each one
 * reports — `""` for the three that have none.
 *
 * `leaves` reports the **Principal's** decision rather than the request's own
 * `status`, because this tab is called "Leave decisions" and the deputy's step
 * is shown beside it: a request the Deputy recommended and the Principal has not
 * touched is `pending` here, which is the truth about the decision.
 */
export const historyStatusOf = (tab: HistoryTab, row: HistoryRow): string => {
  if (tab === "homerooms") {
    return (row as HistoryRows["homerooms"]).changeType;
  }
  if (tab === "leaves") {
    return (row as HistoryRows["leaves"]).finalStatus;
  }
  if (tab === "attendance") {
    return (row as HistoryRows["attendance"]).status;
  }
  return "";
};

const STATUS_LABELS: Record<string, string> = {
  assigned: "Assigned",
  replaced: "Replaced",
  cleared: "Cleared",
  pending: "Pending",
  recommended: "Recommended",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  partial: "Partial day",
  absent: "Absent",
  lateShortLeave: "Late · short leave",
  halfDay: "Half day",
};

/**
 * A stored status as a word.
 *
 * The labels are spelled out rather than derived, because `lateShortLeave`
 * upper-cased at the boundaries reads "late Short Leave" — the leading
 * lower-case and the absent article are what a human would never write, and
 * this is a screen about what happened to a person.
 */
export const historyStatusLabel = (value: string): string =>
  STATUS_LABELS[value] ?? humanizeKey(value);

/**
 * What a row's search box matches, in the words the row actually renders.
 *
 * Deliberately not "every string field": that would match a stored subject key
 * (`environmentRelatedActivities`) when the reader typed the label
 * ("Environmental-Related Activities"), and would match row and staff ids that
 * mean nothing to anybody reading a year. The haystack is the row as printed.
 */
export const historySearchText = (tab: HistoryTab, row: HistoryRow): string => {
  switch (tab) {
    case "staff": {
      const value = row as HistoryRows["staff"];
      return [
        value.name,
        value.teacherServiceNo ?? "",
        ...value.positions.flatMap((position) => [
          position.position,
          position.sectionalScope ?? "",
        ]),
      ].join(" ");
    }

    case "subjects": {
      const value = row as HistoryRows["subjects"];
      return [value.staffName, subjectLabel(value.subjectKey)].join(" ");
    }

    case "timetables": {
      const value = row as HistoryRows["timetables"];
      return [
        value.className,
        `Grade ${value.gradeLevel}`,
        weekdayName(value.dayOfWeek),
        `Period ${value.periodNumber}`,
        subjectLabel(value.subjectKey),
        value.staffName,
      ].join(" ");
    }

    case "homerooms": {
      const value = row as HistoryRows["homerooms"];
      return [
        value.className,
        `Grade ${value.gradeLevel}`,
        historyStatusLabel(value.changeType),
        value.previousTeacherName ?? "",
        value.newTeacherName ?? "",
        value.reason ?? "",
        value.note ?? "",
        formatDateTime(value.changedAt),
      ].join(" ");
    }

    case "leaves": {
      const value = row as HistoryRows["leaves"];
      return [
        value.staffName,
        leaveTypeLabel(value.type),
        formatLeaveDescription(value.type, value.dayPart, value.paymentStatus),
        `${formatDate(value.startDate)} ${formatDate(value.endDate)}`,
        historyStatusLabel(value.deputyStatus),
        historyStatusLabel(value.finalStatus),
        value.reason ?? "",
      ].join(" ");
    }

    default: {
      const value = row as HistoryRows["attendance"];
      return [
        value.staffName,
        formatDate(value.date),
        historyStatusLabel(value.status),
        value.absentPeriods
          .map((period) => `P${period.periodNumber}`)
          .join(" "),
        value.reason ?? "",
      ].join(" ");
    }
  }
};
