import { ORPCError } from "@orpc/server";
import { TEACHER_REASSIGNMENT_REASONS } from "@school-student-teacher-management/db/constants/teachers";
import {
  class_,
  classIdSchema,
  classInsertSchema,
  classTeacherAssignmentHistory,
} from "@school-student-teacher-management/db/schema/academics";
import { eq } from "drizzle-orm";
import {
  object,
  optional,
  picklist,
  pick,
  pipe,
  string,
  minLength,
} from "valibot";

import { requireAssignmentPermission } from "../../index";
import { assertTeacherEligibleForYear } from "./teacher-eligibility";

const reasonSchema = picklist(
  Object.keys(TEACHER_REASSIGNMENT_REASONS) as [string, ...string[]]
);

type TeacherChangeType = "assigned" | "replaced" | "cleared" | null;

const resolveChangeType = (
  previousTeacherId: string | null,
  newTeacherId: string | null
): TeacherChangeType => {
  if (previousTeacherId && !newTeacherId) {
    return "cleared";
  }
  if (previousTeacherId && newTeacherId && previousTeacherId !== newTeacherId) {
    return "replaced";
  }
  if (!previousTeacherId && newTeacherId) {
    return "assigned";
  }
  return null;
};

export const assignClassTeacher = requireAssignmentPermission("update")
  .input(
    object({
      classId: classIdSchema,
      ...pick(classInsertSchema, ["homeroomTeacherId"]).entries,
      /** Required when replacing or clearing an existing assignment. */
      reason: optional(reasonSchema),
      note: optional(pipe(string(), minLength(1))),
    })
  )
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(class_)
      .where(eq(class_.id, input.classId));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Class not found" });
    }

    const previousTeacherId = existing.homeroomTeacherId;
    const newTeacherId = input.homeroomTeacherId ?? null;

    const changeType = resolveChangeType(previousTeacherId, newTeacherId);

    if (
      (changeType === "replaced" || changeType === "cleared") &&
      !input.reason
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "A reason is required when replacing or clearing an existing homeroom teacher",
      });
    }

    if (newTeacherId) {
      await assertTeacherEligibleForYear({
        db: context.db,
        academicYearId: existing.academicYearId,
        staffId: newTeacherId,
      });
    }

    const [record] = await context.db
      .update(class_)
      .set({ homeroomTeacherId: newTeacherId })
      .where(eq(class_.id, input.classId))
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    if (changeType) {
      await context.db.insert(classTeacherAssignmentHistory).values({
        id: crypto.randomUUID(),
        classId: record.id,
        academicYearId: record.academicYearId,
        previousTeacherId,
        newTeacherId,
        changeType,
        reason: input.reason ?? null,
        note: input.note ?? null,
      });
    }

    return {
      id: record.id,
      academicYearId: record.academicYearId,
      gradeLevel: record.gradeLevel,
      name: record.name,
      medium: record.medium,
      homeroomTeacherId: record.homeroomTeacherId,
      subHomeroomTeacherId: record.subHomeroomTeacherId,
      createdAt: record.createdAt.toISOString(),
    };
  });
