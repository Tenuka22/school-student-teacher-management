import {
  student,
  studentSelectSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { requireStudentPermission } from "../../index";

export const getStudent = requireStudentPermission("read")
  .input(pick(studentSelectSchema, ["id"]))
  .handler(async ({ input, context }) => {
    const [row] = await context.db
      .select()
      .from(student)
      .where(eq(student.id, input.id));

    if (!row) {
      return null;
    }

    return {
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
    };
  });
