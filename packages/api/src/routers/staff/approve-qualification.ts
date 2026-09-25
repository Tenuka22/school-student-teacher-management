import { ORPCError } from "@orpc/server";
import {
  teacherQualification,
  teacherQualificationIdSchema,
} from "@school-student-teacher-management/db/schema/qualifications";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireQualificationPermission } from "../../index";

/**
 * Approve or reject a qualification's supporting document.
 * Requires qualification:approve. Sets the reviewedBy, reviewNote, and reviewedAt fields.
 */
export const approveQualification = requireQualificationPermission("approve")
  .input(
    v.object({
      id: teacherQualificationIdSchema,
      status: v.picklist(["approved", "rejected"]),
      reviewNote: v.optional(v.string()),
    })
  )
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(teacherQualification)
      .where(eq(teacherQualification.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Qualification not found",
      });
    }

    const [reviewer] = await context.db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.userId, context.session.user.id))
      .limit(1);

    const [record] = await context.db
      .update(teacherQualification)
      .set({
        documentStatus: input.status,
        reviewedBy: reviewer?.id ?? null,
        reviewNote: input.reviewNote,
        reviewedAt: new Date(),
      })
      .where(eq(teacherQualification.id, input.id))
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      staffId: record.staffId,
      qualification: record.qualification,
      documentStatus: record.documentStatus,
      reviewedBy: record.reviewedBy,
      reviewNote: record.reviewNote,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
    };
  });
