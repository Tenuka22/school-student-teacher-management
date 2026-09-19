import { staff } from "@school-student-teacher-management/db/schema/staff";
import { desc } from "drizzle-orm";

import { requireStaffPermission } from "../../index";

export const listStaff = requireStaffPermission("read").handler(
  async ({ context }) => {
    const rows = await context.db
      .select()
      .from(staff)
      .orderBy(desc(staff.createdAt));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      nic: row.nic,
      phone: row.phone,
      gender: row.gender,
      birthDate: row.birthDate,
      portraitFileId: row.portraitFileId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
);
