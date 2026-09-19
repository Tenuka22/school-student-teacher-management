import {
  student,
  studentUpdateSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { requireStudentPermission } from "../../index";

export const updateStudent = requireStudentPermission("update")
  .input(
    pick(studentUpdateSchema, [
      "id",
      "admissionNumber",
      "firstName",
      "lastName",
      "dateOfBirth",
      "gender",
      "phone",
      "parentPhone",
      "admissionYear",
    ])
  )
  .handler(async ({ input, context }) => {
    const { id, ...updates } = input;

    if (!id) {
      return null;
    }

    const [record] = await context.db
      .update(student)
      .set(updates)
      .where(eq(student.id, id))
      .returning();

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      admissionNumber: record.admissionNumber,
      firstName: record.firstName,
      lastName: record.lastName,
      dateOfBirth: record.dateOfBirth,
      gender: record.gender,
      phone: record.phone,
      parentPhone: record.parentPhone,
      admissionYear: record.admissionYear,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
