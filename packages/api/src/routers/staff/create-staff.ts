import { ORPCError } from "@orpc/server";
import {
  staff,
  staffInsertSchema,
} from "@school-student-teacher-management/db/schema/staff";
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

    let record: typeof staff.$inferSelect | undefined;
    try {
      [record] = await context.db
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
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("staff_nic_unique")
      ) {
        throw new ORPCError("CONFLICT", {
          message: "A staff member with this NIC already exists",
        });
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
      gender: record.gender,
      birthDate: record.birthDate,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };

    return result;
  });
