import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { aliasedTable, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireStaffPermission } from "../../../index";
import { buildExcelExport } from "../../../lib/export";

const homeroomTeacher = aliasedTable(staff, "homeroom_teacher");
const subHomeroomTeacher = aliasedTable(staff, "sub_homeroom_teacher");

/** Exports every class for an academic year, with homeroom teachers, as a single-sheet .xlsx workbook. */
export const exportClassesExcel = requireStaffPermission("read")
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        name: class_.name,
        gradeLevel: class_.gradeLevel,
        medium: class_.medium,
        homeroomTeacherName: homeroomTeacher.name,
        subHomeroomTeacherName: subHomeroomTeacher.name,
      })
      .from(class_)
      .leftJoin(
        homeroomTeacher,
        eq(class_.homeroomTeacherId, homeroomTeacher.id)
      )
      .leftJoin(
        subHomeroomTeacher,
        eq(class_.subHomeroomTeacherId, subHomeroomTeacher.id)
      )
      .where(eq(class_.academicYearId, input.academicYearId));

    return buildExcelExport("classes.xlsx", [
      {
        name: "Classes",
        columns: [
          { header: "Class Name", key: "name", width: 20 },
          { header: "Grade Level", key: "gradeLevel", width: 14 },
          { header: "Medium", key: "medium", width: 14 },
          { header: "Homeroom Teacher", key: "homeroomTeacherName", width: 26 },
          {
            header: "Sub-Homeroom Teacher",
            key: "subHomeroomTeacherName",
            width: 26,
          },
        ],
        rows: rows.map((row) => ({
          name: row.name,
          gradeLevel: row.gradeLevel,
          medium: row.medium,
          homeroomTeacherName: row.homeroomTeacherName ?? "",
          subHomeroomTeacherName: row.subHomeroomTeacherName ?? "",
        })),
      },
    ]);
  });
