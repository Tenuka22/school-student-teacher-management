import { staff, staffUpdateSchema } from "@school-student-teacher-management/db/schema/staff";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { protectedProcedure } from "../../index";

/**
 * Self-service profile update.
 * Staff can update their own phone and portrait only.
 * Admin fields (name, email, nic) are NOT editable here.
 */
export const updateProfile = protectedProcedure
  .input(pick(staffUpdateSchema, ["phone", "portraitFileId"]))
  .handler(async ({ input, context }) => {
    // Find the staff record linked to this user by email
    const [staffRecord] = await context.db
      .select()
      .from(staff)
      .where(eq(staff.email, context.session.user.email));

    if (!staffRecord) {
      throw new ORPCError("NOT_FOUND", {
        message: "Staff profile not found for this user",
      });
    }

    const [record] = await context.db
      .update(staff)
      .set({
        phone: input.phone,
        portraitFileId: input.portraitFileId,
      })
      .where(eq(staff.id, staffRecord.id))
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      name: record.name,
      phone: record.phone,
      portraitFileId: record.portraitFileId,
    };
  });
