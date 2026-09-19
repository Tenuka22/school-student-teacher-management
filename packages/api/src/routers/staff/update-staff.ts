import { staff, staffUpdateSchema } from "@school-student-teacher-management/db/schema/staff";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import * as v from "valibot";
import { pick } from "valibot";

import { adminProcedure } from "../../index";

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
  "portraitFileId",
  "nationalIdentityCardFileId",
] as const;

export const updateStaff = adminProcedure
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

    const { id, ...updates } = input;

    const [record] = await context.db
      .update(staff)
      .set(updates)
      .where(eq(staff.id, id))
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    const result = {
      id: record.id,
      name: record.name,
      email: record.email,
      nic: record.nic,
      phone: record.phone,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };

    return result;
  });
