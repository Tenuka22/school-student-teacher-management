import {
  appointmentTypeLabel,
  employmentStatusLabel,
} from "@school-student-teacher-management/db/constants/display";
import {
  academicYearIdSchema,
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { desc, inArray } from "drizzle-orm";
import * as v from "valibot";

import { requireStaffPermission } from "../../../index";
import { buildExcelExport } from "../../../lib/export";
import { getYearRosterTeacherIds } from "../teacher-eligibility";

/**
 * The staff establishment as a spreadsheet.
 *
 * Without `academicYearId` this is every staff record the school has ever had —
 * office staff, retired and terminated teachers, and people from years that have
 * closed. The Teachers page it sits on shows a single year's roster, so the
 * button labelled "Export as Excel" produced a file describing a different
 * population from the one on screen. Passing the year scopes the export to the
 * roster the administrator is actually looking at; passing explicit `ids` (the
 * bulk selection) still wins.
 *
 * The columns are also written as words rather than as the stored keys, so a
 * spreadsheet does not carry `specifiedPeriod` where the screen says
 * "Specified Period".
 */
export const exportTeachersExcel = requireStaffPermission("read")
  .input(
    v.optional(
      v.object({
        ids: v.optional(
          v.pipe(
            v.array(staffIdSchema),
            v.maxLength(5000, "Too many teachers selected")
          )
        ),
        academicYearId: v.optional(academicYearIdSchema),
      })
    )
  )
  .handler(async ({ context, input }) => {
    const ids = input?.ids;
    const academicYearId = input?.academicYearId;

    let rows: (typeof staff.$inferSelect)[] = [];

    if (ids) {
      rows = await context.db
        .select()
        .from(staff)
        .where(inArray(staff.id, ids))
        .orderBy(desc(staff.createdAt));
    } else if (academicYearId) {
      // The year roster comes from the same helper the Teachers page reads, so
      // the file and the screen cannot describe different populations.
      const rosterIds = await getYearRosterTeacherIds(
        context.db,
        academicYearId
      );

      rows = rosterIds.length
        ? await context.db
            .select()
            .from(staff)
            .where(inArray(staff.id, rosterIds))
            .orderBy(desc(staff.createdAt))
        : [];
    } else {
      rows = await context.db
        .select()
        .from(staff)
        .orderBy(desc(staff.createdAt));
    }

    let fileName = "teachers-all-years.xlsx";
    if (ids) {
      fileName = "teachers-selected.xlsx";
    } else if (academicYearId) {
      fileName = "teachers-this-year.xlsx";
    }

    return buildExcelExport(fileName, [
      {
        name: "Teachers",
        columns: [
          { header: "Name", key: "name", width: 28 },
          { header: "Email", key: "email", width: 28 },
          { header: "Phone", key: "phone", width: 18 },
          { header: "NIC", key: "nic", width: 18 },
          { header: "Gender", key: "gender", width: 12 },
          { header: "Staff Category", key: "staffCategory", width: 18 },
          { header: "Appointment Type", key: "appointmentType", width: 20 },
          {
            header: "Appointment Date",
            key: "appointmentDate",
            width: 18,
          },
          {
            header: "Employment Status",
            key: "employmentStatus",
            width: 20,
          },
          {
            header: "Teacher Service No.",
            key: "teacherServiceNo",
            width: 18,
          },
        ],
        rows: rows.map((row) => ({
          name: row.name,
          email: row.email ?? "",
          phone: row.phone ?? "",
          nic: row.nic ?? "",
          gender: row.gender ?? "",
          staffCategory:
            row.staffCategory === "officeStaff" ? "Office staff" : "Teacher",
          appointmentType: appointmentTypeLabel(row.appointmentType),
          appointmentDate: row.appointmentDate ?? "",
          employmentStatus: employmentStatusLabel(row.employmentStatus),
          teacherServiceNo: row.teacherServiceNo ?? "",
        })),
      },
    ]);
  });
