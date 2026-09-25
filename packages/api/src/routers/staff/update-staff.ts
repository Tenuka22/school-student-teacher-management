import { ORPCError } from "@orpc/server";
import { usernameForNic } from "@school-student-teacher-management/auth";
import { user } from "@school-student-teacher-management/db/schema/auth";
import {
  staff,
  staffUpdateSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq, ne } from "drizzle-orm";
import * as v from "valibot";
import { pick } from "valibot";

import { requireStaffPermission } from "../../index";

const EDITABLE_STAFF_FIELDS = [
  "name",
  "email",
  "nic",
  "phone",
  "birthDate",
  "gender",
  "religion",
  "motherTongue",
  "bloodGroup",
  "maritalStatus",
  "spouseName",
  "addressLine1",
  "addressLine2",
  "city",
  "district",
  "gramaNiladhariDivision",
  "postalCode",
  "emergencyContactName",
  "emergencyContactPhone",
  "appointmentType",
  "appointmentDate",
  "teacherServiceNo",
  "employmentStatus",
  "staffCategory",
  "portraitFileId",
  "nationalIdentityCardFileId",
] as const;

export const updateStaff = requireStaffPermission("update")
  .input(
    v.object({
      id: v.string(),
      ...pick(staffUpdateSchema, [...EDITABLE_STAFF_FIELDS]).entries,
    })
  )
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(staff)
      .where(eq(staff.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Staff member not found" });
    }

    if (existing.userId && input.nic === null) {
      throw new ORPCError("BAD_REQUEST", {
        message: "A NIC cannot be removed while the staff account is linked",
      });
    }

    const { id, ...updates } = input;
    const normalizedUpdates = {
      ...updates,
      teacherServiceNo:
        updates.teacherServiceNo?.toUpperCase() ?? updates.teacherServiceNo,
    };

    let record: typeof staff.$inferSelect | undefined;
    try {
      record = await context.db.transaction(async (tx) => {
        if (existing.userId && typeof input.nic === "string") {
          const nextUsername = usernameForNic(input.nic);
          const [usernameOwner] = await tx
            .select({ id: user.id })
            .from(user)
            .where(
              and(eq(user.username, nextUsername), ne(user.id, existing.userId))
            )
            .limit(1);

          if (usernameOwner) {
            throw new ORPCError("CONFLICT", {
              message: "A login account with this NIC already exists",
            });
          }

          await tx
            .update(user)
            .set({
              username: nextUsername,
              displayUsername: nextUsername,
            })
            .where(eq(user.id, existing.userId));
        }

        const [updated] = await tx
          .update(staff)
          .set(normalizedUpdates)
          .where(eq(staff.id, id))
          .returning();

        return updated;
      });
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.message.includes("staff_teacher_service_no_unique")) {
          throw new ORPCError("CONFLICT", {
            message: "This teacher service number is already in use",
          });
        }
        if (
          error.message.includes("staff_nic_unique") ||
          error.message.includes("user_username_unique")
        ) {
          throw new ORPCError("CONFLICT", {
            message: "A staff member with this NIC already exists",
          });
        }
      }
      throw error;
    }

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    const result = {
      id: record.id,
      name: record.name,
      email: record.email,
      nic: record.nic,
      phone: record.phone,
      birthDate: record.birthDate,
      gender: record.gender,
      staffCategory: record.staffCategory,
      appointmentType: record.appointmentType,
      appointmentDate: record.appointmentDate,
      employmentStatus: record.employmentStatus,
      teacherServiceNo: record.teacherServiceNo,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };

    return result;
  });
