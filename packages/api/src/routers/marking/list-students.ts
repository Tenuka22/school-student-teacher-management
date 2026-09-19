import { student } from "@school-student-teacher-management/db/schema/marking";
import { desc } from "drizzle-orm";

import { requireStudentPermission } from "../../index";

export const listStudents = requireStudentPermission("read").handler(
  async ({ context }) => {
    const rows = await context.db
      .select()
      .from(student)
      .orderBy(desc(student.createdAt));

    return rows.map((row) => ({
      id: row.id,
      admissionNumber: row.admissionNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
      phone: row.phone,
      parentPhone: row.parentPhone,
      admissionYear: row.admissionYear,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
);
