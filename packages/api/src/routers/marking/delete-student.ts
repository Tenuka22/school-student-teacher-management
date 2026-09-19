import {
  student,
  studentSelectSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { requireStudentPermission } from "../../index";

export const deleteStudent = requireStudentPermission("delete")
  .input(pick(studentSelectSchema, ["id"]))
  .handler(async ({ input, context }) => {
    const [record] = await context.db
      .delete(student)
      .where(eq(student.id, input.id))
      .returning();

    return { deleted: !!record };
  });
