import { ORPCError } from "@orpc/server";
import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import {
  class_,
  classIdSchema,
} from "@school-student-teacher-management/db/schema/academics";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";
import { buildPdfExport } from "../../../lib/export";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Exports one class's weekly timetable (5 days x 8 periods) as a printable PDF. */
export const exportClassTimetablePdf = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      classId: classIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const [classRecord] = await context.db
      .select()
      .from(class_)
      .where(eq(class_.id, input.classId));

    if (!classRecord) {
      throw new ORPCError("NOT_FOUND", { message: "Class not found" });
    }

    const assignments = await context.db
      .select({
        dayOfWeek: classPeriodAssignment.dayOfWeek,
        periodNumber: classPeriodAssignment.periodNumber,
        subjectKey: classPeriodAssignment.subjectKey,
        teacherName: staff.name,
      })
      .from(classPeriodAssignment)
      .innerJoin(staff, eq(classPeriodAssignment.staffId, staff.id))
      .where(
        and(
          eq(classPeriodAssignment.academicYearId, input.academicYearId),
          eq(classPeriodAssignment.classId, input.classId)
        )
      );

    const cell = (dayOfWeek: number, periodNumber: number) => {
      const assignment = assignments.find(
        (a) => a.dayOfWeek === dayOfWeek && a.periodNumber === periodNumber
      );
      return assignment
        ? `${subjectLabel(assignment.subjectKey)}\n${assignment.teacherName}`
        : "—";
    };

    const tableBody = [
      ["Period", ...DAY_LABELS],
      ...CODE_DEFINED_PERIODS.map((period) => [
        `${period.periodNumber}\n${period.startTime}-${period.endTime}`,
        ...DAY_LABELS.map((_, index) => cell(index + 1, period.periodNumber)),
      ]),
    ];

    return buildPdfExport(
      `${classRecord.name.replaceAll(/\s+/gu, "-")}-timetable.pdf`,
      {
        pageOrientation: "landscape",
        content: [
          { text: `${classRecord.name} — Weekly Timetable`, style: "header" },
          {
            table: {
              headerRows: 1,
              widths: ["auto", "*", "*", "*", "*", "*"],
              body: tableBody,
            },
            layout: "lightHorizontalLines",
          },
        ],
        styles: {
          header: { fontSize: 16, bold: true, margin: [0, 0, 0, 12] },
        },
        defaultStyle: { fontSize: 9 },
      }
    );
  });
