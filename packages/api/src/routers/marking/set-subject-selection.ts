import { ORPCError } from "@orpc/server";
import { COMPULSORY_BASKET_CATEGORY } from "@school-student-teacher-management/db/constants/structureVersions/index";
import {
  class_,
  gradeSubjectConfig,
} from "@school-student-teacher-management/db/schema/academics";
import {
  student,
  studentClassAssignment,
  studentSubjectSelection,
  studentSubjectSelectionInsertSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { and, eq, isNull } from "drizzle-orm";
import { pick } from "valibot";

import { requireStudentPermission } from "../../index";

/**
 * Records a student's optional/basket subject choice for an academic year.
 * Never edits a prior selection in place: it stamps `supersededAt` on the
 * previously active row (if any) and inserts a new one, so
 * `subjectMark.subjectKey` rows entered under the old subject are never
 * affected by a later change here.
 */
export const setSubjectSelection = requireStudentPermission("update")
  .input(
    pick(studentSubjectSelectionInsertSchema, [
      "studentId",
      "academicYearId",
      "basketCategory",
      "subjectKey",
    ])
  )
  .handler(async ({ input, context }) => {
    if (input.basketCategory === COMPULSORY_BASKET_CATEGORY) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Compulsory subjects apply to every student automatically and are never selected",
      });
    }

    const [assignment] = await context.db
      .select({ gradeLevel: class_.gradeLevel })
      .from(studentClassAssignment)
      .innerJoin(class_, eq(studentClassAssignment.classId, class_.id))
      .where(
        and(
          eq(studentClassAssignment.studentId, input.studentId),
          eq(studentClassAssignment.academicYearId, input.academicYearId)
        )
      );

    if (!assignment) {
      throw new ORPCError("NOT_FOUND", {
        message: "Student is not assigned to a class in that academic year",
      });
    }

    const [offered] = await context.db
      .select({ id: gradeSubjectConfig.id })
      .from(gradeSubjectConfig)
      .where(
        and(
          eq(gradeSubjectConfig.academicYearId, input.academicYearId),
          eq(gradeSubjectConfig.gradeLevel, assignment.gradeLevel),
          eq(gradeSubjectConfig.basketCategory, input.basketCategory),
          eq(gradeSubjectConfig.subjectKey, input.subjectKey)
        )
      );

    if (!offered) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "That subject is not offered for this basket category at the student's grade in that academic year",
      });
    }

    // Supersede-then-insert as one unit, serialized per student (F-17): a
    // failure between the two used to leave the basket with no active
    // selection, and two concurrent changes left two active ones.
    const record = await context.db.transaction(async (tx) => {
      await tx
        .select({ id: student.id })
        .from(student)
        .where(eq(student.id, input.studentId))
        .for("update");

      const [activeSelection] = await tx
        .select({ id: studentSubjectSelection.id })
        .from(studentSubjectSelection)
        .where(
          and(
            eq(studentSubjectSelection.studentId, input.studentId),
            eq(studentSubjectSelection.academicYearId, input.academicYearId),
            eq(studentSubjectSelection.basketCategory, input.basketCategory),
            isNull(studentSubjectSelection.supersededAt)
          )
        );

      if (activeSelection) {
        await tx
          .update(studentSubjectSelection)
          .set({ supersededAt: new Date() })
          .where(eq(studentSubjectSelection.id, activeSelection.id));
      }

      const [inserted] = await tx
        .insert(studentSubjectSelection)
        .values({
          id: crypto.randomUUID(),
          studentId: input.studentId,
          academicYearId: input.academicYearId,
          basketCategory: input.basketCategory,
          subjectKey: input.subjectKey,
          previousSelectionId: activeSelection?.id ?? null,
        })
        .returning();
      return inserted;
    });

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      studentId: record.studentId,
      academicYearId: record.academicYearId,
      basketCategory: record.basketCategory,
      subjectKey: record.subjectKey,
      previousSelectionId: record.previousSelectionId,
      supersededAt: record.supersededAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  });
