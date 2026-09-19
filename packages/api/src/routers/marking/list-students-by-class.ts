import {
  studentClassAssignment,
  student,
} from "@school-student-teacher-management/db/schema/marking";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../index";

const listStudentsByClassSchema = v.object({
  academicYearId: v.string(),
  classId: v.string(),
});

export const listStudentsByClass = requireAssignmentPermission("read")
  .input(listStudentsByClassSchema)
  .handler(async ({ input, context }) => {
    const assignments = await context.db
      .select({
        id: studentClassAssignment.id,
        studentId: studentClassAssignment.studentId,
        classId: studentClassAssignment.classId,
        academicYearId: studentClassAssignment.academicYearId,
        createdAt: studentClassAssignment.createdAt,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
      })
      .from(studentClassAssignment)
      .innerJoin(student, eq(studentClassAssignment.studentId, student.id))
      .where(eq(studentClassAssignment.classId, input.classId));

    return assignments.map((row) => ({
      assignmentId: row.id,
      studentId: row.studentId,
      firstName: row.firstName,
      lastName: row.lastName,
      admissionNumber: row.admissionNumber,
      classId: row.classId,
      academicYearId: row.academicYearId,
      createdAt: row.createdAt.toISOString(),
    }));
  });
