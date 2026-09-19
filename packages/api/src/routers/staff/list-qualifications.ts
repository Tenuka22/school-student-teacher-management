import { teacherQualification } from "@school-student-teacher-management/db/schema/qualifications";
import { staff, staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, desc, eq } from "drizzle-orm";
import * as v from "valibot";

import { protectedProcedure } from "../../index";

const documentStatusSchema = v.picklist(["pending", "approved", "rejected"]);

/**
 * List qualifications.
 * Admin can see all qualifications, optionally filtered by staffId and
 * document status. Regular staff can only see their own qualifications.
 */
export const listQualifications = protectedProcedure
  .input(
    v.object({
      staffId: v.optional(staffIdSchema),
      status: v.optional(documentStatusSchema),
    })
  )
  .handler(async ({ input, context }) => {
    const isAdmin = context.session.user.role === "admin";
    const conditions = [];

    if (isAdmin && input.staffId) {
      conditions.push(eq(teacherQualification.staffId, input.staffId));
    } else if (!isAdmin) {
      // Non-admin: only own qualifications
      const [staffRecord] = await context.db
        .select()
        .from(staff)
        .where(eq(staff.email, context.session.user.email));

      if (staffRecord) {
        conditions.push(eq(teacherQualification.staffId, staffRecord.id));
      }
    }

    if (input.status) {
      conditions.push(eq(teacherQualification.documentStatus, input.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await context.db
      .select({
        id: teacherQualification.id,
        staffId: teacherQualification.staffId,
        qualification: teacherQualification.qualification,
        yearObtained: teacherQualification.yearObtained,
        institution: teacherQualification.institution,
        subjectSpecialization: teacherQualification.subjectSpecialization,
        specializationCategory: teacherQualification.specializationCategory,
        documentFileId: teacherQualification.documentFileId,
        documentStatus: teacherQualification.documentStatus,
        reviewedBy: teacherQualification.reviewedBy,
        reviewNote: teacherQualification.reviewNote,
        createdAt: teacherQualification.createdAt,
        reviewedAt: teacherQualification.reviewedAt,
        staffName: staff.name,
      })
      .from(teacherQualification)
      .leftJoin(staff, eq(teacherQualification.staffId, staff.id))
      .where(where)
      .orderBy(desc(teacherQualification.createdAt));

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    }));
  });
