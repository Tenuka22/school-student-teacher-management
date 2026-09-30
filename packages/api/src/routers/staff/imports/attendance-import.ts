import {
  teacherAttendance,
  teacherPeriodAbsence,
} from "@school-student-teacher-management/db/schema/attendance";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import * as v from "valibot";

import type { Context } from "../../../context";
import { academicProcedure } from "../../../index";
import {
  assertDateWithinAcademicYear,
  requireAttendanceAcademicYear,
} from "../attendance/academic-year";

type Database = Context["db"];

/**
 * Importing a day's register from a spreadsheet.
 *
 * The file is the authority — every row in it overwrites whatever the register
 * already said about that person on that date, which is the point of an import:
 * the spreadsheet is how the register was collected, and reconciling it with
 * what somebody typed by hand afterwards would defeat it. The preview shows the
 * mark that is there next to the mark the row will leave, so the overwrite is
 * seen before it happens rather than discovered after.
 *
 * Two things still win over the file:
 *
 * - **An approved leave.** `markAttendance` refuses to be overridden without the
 *   Principal's authority and a reason, and an import has neither. Those rows
 *   are reported as blocked rather than written, so the file cannot quietly
 *   erase an approved absence.
 * - **A blank reason cell.** The mark is the file's answer; the reason is a note
 *   somebody wrote, and a column left empty is not an instruction to delete it.
 *   A reason the file *does* carry replaces the one on the row.
 */
export const attendanceImportRowSchema = v.object({
  nic: v.pipe(v.string(), v.maxLength(64)),
  /** The `Present` column: `true`/`false` (and the usual spellings of them). */
  present: v.pipe(v.string(), v.maxLength(32)),
  reason: v.pipe(v.string(), v.maxLength(500)),
});

const attendanceImportInput = v.object({
  academicYearId: academicYearIdSchema,
  date: isoDateSchema,
  rows: v.pipe(v.array(attendanceImportRowSchema), v.maxLength(5000)),
});

export type AttendanceImportOutcome =
  | "ready"
  | "no-nic"
  | "unknown-nic"
  | "duplicate-nic"
  | "no-value"
  | "bad-value"
  | "blocked-by-leave";

export interface ResolvedAttendanceImportRow {
  /** Position in the file, one-based, so an error names a spreadsheet row. */
  rowNumber: number;
  nic: string;
  name: string | null;
  /** `null` when the row has no usable answer. */
  present: boolean | null;
  current: string;
  outcome: AttendanceImportOutcome;
  reason: string;
  staffId: string | null;
}

const TRUE_SPELLINGS = new Set(["true", "yes", "y", "1", "present"]);
const FALSE_SPELLINGS = new Set(["false", "no", "n", "0", "absent"]);

const parsePresentCell = (value: string): boolean | null | undefined => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "") {
    return null;
  }
  if (TRUE_SPELLINGS.has(normalized)) {
    return true;
  }
  if (FALSE_SPELLINGS.has(normalized)) {
    return false;
  }
  return undefined;
};

/**
 * Resolves every row of the file against the register, once, for both the
 * preview and the write.
 *
 * Shared deliberately: a preview that read the database one way and an apply
 * that read it another would show one answer and do another, and the only test
 * that catches that is the one nobody writes. Preview and apply are the same
 * function, so they agree by construction.
 */
const resolveImportRows = async (
  db: Database,
  academicYearId: string,
  date: string,
  rows: v.InferOutput<typeof attendanceImportRowSchema>[]
): Promise<ResolvedAttendanceImportRow[]> => {
  const nicSet = new Set<string>();
  for (const row of rows) {
    const nic = row.nic.trim();
    if (nic !== "") {
      nicSet.add(nic);
    }
  }
  const wantedNics = [...nicSet];

  const [marks, approvedLeaves, staffByNic] = await Promise.all([
    db
      .select({
        staffId: teacherAttendance.staffId,
        status: teacherAttendance.status,
      })
      .from(teacherAttendance)
      .where(
        and(
          eq(teacherAttendance.academicYearId, academicYearId),
          eq(teacherAttendance.date, date)
        )
      ),
    db
      .select({ staffId: leaveRequest.staffId, type: leaveRequest.type })
      .from(leaveRequest)
      .where(
        and(
          eq(leaveRequest.academicYearId, academicYearId),
          eq(leaveRequest.status, "approved"),
          lte(leaveRequest.startDate, date),
          gte(leaveRequest.endDate, date)
        )
      ),
    wantedNics.length > 0
      ? db
          .select({ id: staff.id, name: staff.name, nic: staff.nic })
          .from(staff)
          .where(inArray(staff.nic, wantedNics))
      : Promise.resolve([]),
  ]);

  const currentByStaff = new Map(
    marks.map((mark) => [mark.staffId, mark.status])
  );
  const leaveByStaff = new Map(
    approvedLeaves.map((leave) => [leave.staffId, leave.type])
  );
  /**
   * The `nic` column of the sheet is how a row finds its person, so the map is
   * keyed on it directly.
   *
   * It used to be filtered through a `record.nic !== null` type guard, which
   * existed because `staff.nic` was nullable and a null would have put an
   * unusable key in the map. The column is `NOT NULL` now, the guard's premise
   * is gone, and a filter that can never drop a row is a step a reader has to
   * verify before trusting the map below it.
   */
  const staffByNicMap = new Map(
    staffByNic.map((record) => [record.nic, record])
  );

  const seen = new Set<string>();

  return rows.map((row, position) => {
    const nic = row.nic.trim();
    const present = parsePresentCell(row.present);
    const staffRecord = nic === "" ? undefined : staffByNicMap.get(nic);

    // The heading row is spreadsheet row 1, so the first data row is 2 — the
    // number a message should name when it points at one.
    const rowNumber = position + 2;

    const base = {
      rowNumber,
      nic,
      name: staffRecord?.name ?? null,
      present: present === undefined ? null : present,
      reason: row.reason.trim(),
      staffId: staffRecord?.id ?? null,
      current: "unmarked",
      outcome: "ready" as AttendanceImportOutcome,
    };

    if (nic === "") {
      return { ...base, outcome: "no-nic" as const };
    }
    if (seen.has(nic)) {
      return { ...base, outcome: "duplicate-nic" as const };
    }
    seen.add(nic);

    if (!staffRecord) {
      return { ...base, outcome: "unknown-nic" as const };
    }

    const current = currentByStaff.get(staffRecord.id) ?? "unmarked";
    const withCurrent = { ...base, current };

    if (present === null) {
      return { ...withCurrent, outcome: "no-value" as const };
    }
    if (present === undefined) {
      return { ...withCurrent, outcome: "bad-value" as const };
    }
    if (leaveByStaff.has(staffRecord.id)) {
      return { ...withCurrent, outcome: "blocked-by-leave" as const };
    }

    return withCurrent;
  });
};

/** The outcome counts, for the toast that follows a write. */
const countOutcomes = (
  rows: ResolvedAttendanceImportRow[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.outcome] = (counts[row.outcome] ?? 0) + 1;
  }
  return counts;
};

/**
 * What the file would do, without doing it.
 *
 * Reads the same rows through the same resolution the apply uses, so the two
 * columns the dialog shows — what is there, what will be there — are the answer
 * the write will actually give.
 */
export const previewAttendanceImport = academicProcedure
  .input(attendanceImportInput)
  .handler(async ({ context, input }) => {
    const year = await requireAttendanceAcademicYear(
      context.db,
      input.academicYearId
    );
    assertDateWithinAcademicYear(input.date, year);

    const rows = await resolveImportRows(
      context.db,
      input.academicYearId,
      input.date,
      input.rows
    );

    return { rows, outcomes: countOutcomes(rows) };
  });

/**
 * Writes the file over the register: one transaction, all or nothing.
 *
 * A transaction because an import that half-lands leaves a register nobody can
 * trust, and the retry would find some rows already overwritten — at which
 * point there is no version of the file left to try again with.
 *
 * The write itself is delete-then-insert for the people the file names, not an
 * update inside a loop. "The file wins" means the row is *replaced*, and
 * replacing it as a select, a decision and a write per person would be three
 * round trips each, sixty times, through one transaction. The rows of anyone
 * the file does **not** mention are left where they are: an import overwrites
 * what it covers, it does not empty the day.
 */
export const applyAttendanceImport = academicProcedure
  .input(attendanceImportInput)
  .handler(async ({ context, input }) => {
    const year = await requireAttendanceAcademicYear(
      context.db,
      input.academicYearId
    );
    assertDateWithinAcademicYear(input.date, year);

    const rows = await resolveImportRows(
      context.db,
      input.academicYearId,
      input.date,
      input.rows
    );
    const ready = rows.filter(
      (row): row is ResolvedAttendanceImportRow & { staffId: string } =>
        row.outcome === "ready" && row.staffId !== null
    );
    const outcomes = countOutcomes(rows);

    if (ready.length === 0) {
      return { marked: 0, outcomes };
    }

    const staffIds = ready.map((row) => row.staffId);

    await context.db.transaction(async (tx) => {
      const replaced = await tx
        .select({
          id: teacherAttendance.id,
          staffId: teacherAttendance.staffId,
          reason: teacherAttendance.reason,
        })
        .from(teacherAttendance)
        .where(
          and(
            eq(teacherAttendance.academicYearId, input.academicYearId),
            eq(teacherAttendance.date, input.date),
            inArray(teacherAttendance.staffId, staffIds)
          )
        );

      // A note the file has no opinion about is carried across rather than
      // dropped: a blank cell means "I had nothing to say here", not "delete
      // the remark somebody wrote on this row".
      const carriedReason = new Map(
        replaced
          .filter((record) => record.reason !== null)
          .map((record) => [record.staffId, record.reason])
      );

      const replacedIds = replaced.map((record) => record.id);
      if (replacedIds.length > 0) {
        // Period absences hang off a row that is about to go.
        await tx
          .delete(teacherPeriodAbsence)
          .where(
            inArray(teacherPeriodAbsence.teacherAttendanceId, replacedIds)
          );
      }

      await tx
        .delete(teacherAttendance)
        .where(
          and(
            eq(teacherAttendance.academicYearId, input.academicYearId),
            eq(teacherAttendance.date, input.date),
            inArray(teacherAttendance.staffId, staffIds)
          )
        );

      await tx.insert(teacherAttendance).values(
        ready.map((row) => ({
          id: crypto.randomUUID(),
          staffId: row.staffId,
          academicYearId: input.academicYearId,
          date: input.date,
          status: row.present ? "present" : "absent",
          reason:
            row.reason === ""
              ? (carriedReason.get(row.staffId) ?? null)
              : row.reason,
        }))
      );
    });

    return { marked: ready.length, outcomes };
  });
