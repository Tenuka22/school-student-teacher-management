import { ORPCError } from "@orpc/server";
import {
  student,
  studentAdmission,
  studentClassAssignment,
  studentClassAssignmentInsertSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { count, eq } from "drizzle-orm";
import { pick } from "valibot";

import { requireAssignmentPermission } from "../../index";

/**
 * A student progressing to the next grade in a later year is just a new
 * studentClassAssignment row, not a fresh admission event. A studentAdmission
 * record is only created the very first time a student is ever assigned to
 * any class, using the admission details already recorded on the permanent
 * student row, so grade 7-11 continuation never re-registers the student.
 */
export const assignStudentToClass = requireAssignmentPermission("create")
  .input(
    pick(studentClassAssignmentInsertSchema, [
      "studentId",
      "academicYearId",
      "classId",
    ])
  )
  .handler(async ({ input, context }) => {
    // Placement and (first-time) admission as one unit, serialized per
    // student (F-17): two concurrent first placements both saw zero prior
    // assignments and both wrote an admission row.
    const record = await context.db.transaction(async (tx) => {
      const [studentRow] = await tx
        .select({
          admissionType: student.admissionType,
          birthCertificateNumber: student.birthCertificateNumber,
        })
        .from(student)
        .where(eq(student.id, input.studentId))
        .for("update");

      // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- the row lock above must be held before this count, which it serializes
      const [priorAssignmentRow] = await tx
        .select({ n: count() })
        .from(studentClassAssignment)
        .where(eq(studentClassAssignment.studentId, input.studentId));
      const isFirstAssignment = (priorAssignmentRow?.n ?? 0) === 0;

      const [inserted] = await tx
        .insert(studentClassAssignment)
        .values({
          id: crypto.randomUUID(),
          studentId: input.studentId,
          academicYearId: input.academicYearId,
          classId: input.classId,
        })
        .returning();

      if (!inserted) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      if (isFirstAssignment && studentRow?.admissionType) {
        await tx.insert(studentAdmission).values({
          id: crypto.randomUUID(),
          studentId: input.studentId,
          academicYearId: input.academicYearId,
          admissionType: studentRow.admissionType,
          birthCertificateNumber: studentRow.birthCertificateNumber,
        });
      }
      return inserted;
    });

    return {
      id: record.id,
      studentId: record.studentId,
      academicYearId: record.academicYearId,
      classId: record.classId,
      createdAt: record.createdAt.toISOString(),
    };
  });
