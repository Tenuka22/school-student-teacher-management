import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";
import { buildExcelExport } from "../../../lib/export";
import type { ExcelSheet } from "../../../lib/export";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Exports every class's weekly timetable for an academic year, one worksheet per class. */
export const exportAllTimetablesExcel = adminProcedure
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [classes, rows] = await Promise.all([
      context.db
        .select()
        .from(class_)
        .where(eq(class_.academicYearId, input.academicYearId)),
      context.db
        .select({
          classId: classPeriodSubject.classId,
          dayOfWeek: classPeriodSubject.dayOfWeek,
          periodNumber: classPeriodSubject.periodNumber,
          subjectKey: classPeriodSubject.subjectKey,
          teacherName: staff.name,
        })
        .from(classPeriodSubject)
        .leftJoin(
          classPeriodTeacher,
          eq(classPeriodTeacher.classPeriodSubjectId, classPeriodSubject.id)
        )
        .leftJoin(staff, eq(classPeriodTeacher.staffId, staff.id))
        .where(eq(classPeriodSubject.academicYearId, input.academicYearId)),
    ]);

    // One (class, day, period) slot can now hold several subjects, and one
    // subject can have several named teachers — the join above returns one
    // row per (subject, teacher) pair, so a subject with no teacher yet or
    // two teachers on it are both grouped back into one slot entry here.
    const teacherNamesBySubject = new Map<string, string[]>();
    const subjectsBySlot = new Map<
      string,
      { subjectKey: string; key: string }[]
    >();
    for (const row of rows) {
      const subjectKey = `${row.classId}-${row.dayOfWeek}-${row.periodNumber}-${row.subjectKey}`;
      if (row.teacherName) {
        const names = teacherNamesBySubject.get(subjectKey) ?? [];
        // The join is one row per (subject, teacher) row, so a subject listed
        // twice under the same teacher would print the name twice.
        if (!names.includes(row.teacherName)) {
          names.push(row.teacherName);
        }
        teacherNamesBySubject.set(subjectKey, names);
      }
      const slotKey = `${row.classId}-${row.dayOfWeek}-${row.periodNumber}`;
      const slotSubjects = subjectsBySlot.get(slotKey) ?? [];
      if (!slotSubjects.some((s) => s.key === subjectKey)) {
        slotSubjects.push({ subjectKey: row.subjectKey, key: subjectKey });
      }
      subjectsBySlot.set(slotKey, slotSubjects);
    }

    const sheets: ExcelSheet[] = classes.map((classRecord) => {
      const cell = (dayOfWeek: number, periodNumber: number) => {
        const slotKey = `${classRecord.id}-${dayOfWeek}-${periodNumber}`;
        const slotSubjects = subjectsBySlot.get(slotKey) ?? [];
        return slotSubjects
          .map((entry) => {
            const teacherNames = teacherNamesBySubject.get(entry.key) ?? [];
            const teacherPart =
              teacherNames.length > 0 ? ` - ${teacherNames.join(", ")}` : "";
            return `${subjectLabel(entry.subjectKey)}${teacherPart}`;
          })
          .join("; ");
      };

      return {
        name: classRecord.name,
        columns: [
          { header: "Period", key: "period", width: 20 },
          ...DAY_LABELS.map((day) => ({ header: day, key: day, width: 32 })),
        ],
        rows: CODE_DEFINED_PERIODS.map((period) => ({
          period: `${period.periodNumber} (${period.startTime}-${period.endTime})`,
          ...Object.fromEntries(
            DAY_LABELS.map((day, index) => [
              day,
              cell(index + 1, period.periodNumber),
            ])
          ),
        })),
      };
    });

    return buildExcelExport("all-class-timetables.xlsx", sheets);
  });
