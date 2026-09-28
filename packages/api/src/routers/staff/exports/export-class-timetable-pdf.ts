import { ORPCError } from "@orpc/server";
import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import {
  class_,
  classIdSchema,
} from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
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

    const rows = await context.db
      .select({
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
      .where(
        and(
          eq(classPeriodSubject.academicYearId, input.academicYearId),
          eq(classPeriodSubject.classId, input.classId)
        )
      );

    // A slot can hold several subjects, and a subject can have several named
    // teachers — group the (subject, teacher) pairs the join returns back
    // into one entry per subject before rendering the cell.
    const teacherNamesBySubjectKey = new Map<string, string[]>();
    const subjectKeysBySlot = new Map<string, string[]>();
    for (const row of rows) {
      const subjectId = `${row.dayOfWeek}-${row.periodNumber}-${row.subjectKey}`;
      if (row.teacherName) {
        const names = teacherNamesBySubjectKey.get(subjectId) ?? [];
        names.push(row.teacherName);
        teacherNamesBySubjectKey.set(subjectId, names);
      }
      const slotKey = `${row.dayOfWeek}-${row.periodNumber}`;
      const slotSubjects = subjectKeysBySlot.get(slotKey) ?? [];
      if (!slotSubjects.includes(subjectId)) {
        slotSubjects.push(subjectId);
      }
      subjectKeysBySlot.set(slotKey, slotSubjects);
    }

    const cell = (dayOfWeek: number, periodNumber: number) => {
      const slotKey = `${dayOfWeek}-${periodNumber}`;
      const subjectIds = subjectKeysBySlot.get(slotKey) ?? [];
      if (subjectIds.length === 0) {
        return "—";
      }
      return subjectIds
        .map((subjectId) => {
          const subjectKey = subjectId.split("-").slice(2).join("-");
          const teacherNames = teacherNamesBySubjectKey.get(subjectId) ?? [];
          const teacherLine =
            teacherNames.length > 0 ? teacherNames.join(", ") : "Unassigned";
          return `${subjectLabel(subjectKey)}\n${teacherLine}`;
        })
        .join("\n\n");
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
