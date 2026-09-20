import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodAssignment,
  periodConfig,
} from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";
import { buildExcelExport } from "../../../lib/export";
import type { ExcelSheet } from "../../../lib/export";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Exports every class's weekly timetable for an academic year, one worksheet per class. */
export const exportAllTimetablesExcel = requireAssignmentPermission("read")
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [classes, periods, assignments] = await Promise.all([
      context.db
        .select()
        .from(class_)
        .where(eq(class_.academicYearId, input.academicYearId)),
      context.db
        .select()
        .from(periodConfig)
        .where(eq(periodConfig.academicYearId, input.academicYearId))
        .orderBy(periodConfig.periodNumber),
      context.db
        .select({
          classId: classPeriodAssignment.classId,
          dayOfWeek: classPeriodAssignment.dayOfWeek,
          periodNumber: classPeriodAssignment.periodNumber,
          subjectKey: classPeriodAssignment.subjectKey,
          teacherName: staff.name,
        })
        .from(classPeriodAssignment)
        .innerJoin(staff, eq(classPeriodAssignment.staffId, staff.id))
        .where(eq(classPeriodAssignment.academicYearId, input.academicYearId)),
    ]);

    const sheets: ExcelSheet[] = classes.map((classRecord) => {
      const classAssignments = assignments.filter(
        (a) => a.classId === classRecord.id
      );
      const cell = (dayOfWeek: number, periodNumber: number) => {
        const assignment = classAssignments.find(
          (a) => a.dayOfWeek === dayOfWeek && a.periodNumber === periodNumber
        );
        return assignment
          ? `${assignment.subjectKey} - ${assignment.teacherName}`
          : "";
      };

      return {
        name: classRecord.name,
        columns: [
          { header: "Period", key: "period", width: 20 },
          ...DAY_LABELS.map((day) => ({ header: day, key: day, width: 24 })),
        ],
        rows: periods.map((period) => ({
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
