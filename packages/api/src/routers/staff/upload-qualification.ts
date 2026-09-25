import { ORPCError } from "@orpc/server";
import {
  teacherQualification,
  teacherQualificationInsertSchema,
} from "@school-student-teacher-management/db/schema/qualifications";
import {
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { pick } from "valibot";
import * as v from "valibot";

import { requireQualificationPermission } from "../../index";

/**
 * Record a qualification and its supporting document.
 * Staff can upload for themselves; admin can upload for any staff member.
 * New uploads start with documentStatus "pending" requiring admin approval.
 */
export const uploadQualification = requireQualificationPermission("create")
  .input(
    v.object({
      ...pick(teacherQualificationInsertSchema, [
        "qualification",
        "yearObtained",
        "institution",
        "subjectSpecialization",
        "specializationCategory",
        "documentFileId",
      ]).entries,
      staffId: v.optional(staffIdSchema),
    })
  )
  .handler(async ({ input, context }) => {
    const canManageAny = ["admin", "principal", "vicePrincipal"].includes(
      context.session.user.role ?? ""
    );
    let targetStaffId: string | undefined = input.staffId;

    if (!canManageAny) {
      const [staffRecord] = await context.db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.userId, context.session.user.id))
        .limit(1);

      if (!staffRecord) {
        throw new ORPCError("FORBIDDEN", {
          message: "A staff profile is required to upload qualifications",
        });
      }

      if (targetStaffId && targetStaffId !== staffRecord.id) {
        throw new ORPCError("FORBIDDEN", {
          message: "You can only upload qualifications for yourself",
        });
      }

      targetStaffId = staffRecord.id;
    }

    if (!targetStaffId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "staffId is required",
      });
    }

    const id = crypto.randomUUID();

    const [record] = await context.db
      .insert(teacherQualification)
      .values({
        id,
        staffId: targetStaffId,
        qualification: input.qualification,
        yearObtained: input.yearObtained,
        institution: input.institution,
        subjectSpecialization: input.subjectSpecialization,
        specializationCategory: input.specializationCategory,
        documentFileId: input.documentFileId,
        documentStatus: "pending",
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      staffId: record.staffId,
      qualification: record.qualification,
      yearObtained: record.yearObtained,
      institution: record.institution,
      subjectSpecialization: record.subjectSpecialization,
      specializationCategory: record.specializationCategory,
      documentFileId: record.documentFileId,
      documentStatus: record.documentStatus,
      createdAt: record.createdAt.toISOString(),
    };
  });
