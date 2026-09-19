import { staff, staffInsertSchema } from "@school-student-teacher-management/db/schema/staff";
import { ORPCError } from "@orpc/server";
import { pick } from "valibot";

import { requireStaffPermission } from "../../index";

export const createStaff = requireStaffPermission("create")
  .input(
    pick(staffInsertSchema, [
      "name",
      "email",
      "nic",
      "phone",
      "gender",
      "birthDate",
    ])
  )
  .handler(async ({ input, context }) => {
    const id = crypto.randomUUID();

    const [record] = await context.db
      .insert(staff)
      .values({
        id,
        name: input.name,
        email: input.email,
        nic: input.nic,
        phone: input.phone,
        gender: input.gender,
        birthDate: input.birthDate,
      })
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
      gender: record.gender,
      birthDate: record.birthDate,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };

    return result;
  });
