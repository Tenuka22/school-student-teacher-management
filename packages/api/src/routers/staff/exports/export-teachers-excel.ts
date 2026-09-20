import { staff } from "@school-student-teacher-management/db/schema/staff";
import { desc } from "drizzle-orm";

import { requireStaffPermission } from "../../../index";
import { buildExcelExport } from "../../../lib/export";

/** Exports every staff record as a single-sheet .xlsx workbook. */
export const exportTeachersExcel = requireStaffPermission("read").handler(
  async ({ context }) => {
    const rows = await context.db
      .select()
      .from(staff)
      .orderBy(desc(staff.createdAt));

    return buildExcelExport("teachers.xlsx", [
      {
        name: "Teachers",
        columns: [
          { header: "Name", key: "name", width: 28 },
          { header: "Email", key: "email", width: 28 },
          { header: "Phone", key: "phone", width: 18 },
          { header: "NIC", key: "nic", width: 18 },
          { header: "Gender", key: "gender", width: 12 },
          { header: "Appointment Type", key: "appointmentType", width: 20 },
          { header: "Employment Status", key: "employmentStatus", width: 20 },
          { header: "Teacher Service No.", key: "teacherServiceNo", width: 18 },
        ],
        rows: rows.map((row) => ({
          name: row.name,
          email: row.email ?? "",
          phone: row.phone ?? "",
          nic: row.nic ?? "",
          gender: row.gender ?? "",
          appointmentType: row.appointmentType ?? "",
          employmentStatus: row.employmentStatus ?? "",
          teacherServiceNo: row.teacherServiceNo ?? "",
        })),
      },
    ]);
  }
);
