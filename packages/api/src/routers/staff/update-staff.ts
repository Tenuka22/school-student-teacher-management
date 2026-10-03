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
import { isUniqueViolation } from "../../lib/db-errors";
import { staffProtectionOf } from "../../lib/staff-protection";

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

    /**
     * An administrative login is administered by `admin` alone (Z1). The
     * `staff` grant reaches the Academic Administrator and, through the
     * `ADMIN_ROLES` bypass, the leadership seats; without this check any of
     * them could rewrite the top administrator's NIC and with it the login
     * username, locking the seat out. Same target rule as `adminEndpointGuard`.
     */
    const protection = await staffProtectionOf(context.db, existing);
    if (
      protection.holdsAdministrativeLogin &&
      context.session.user.role !== "admin"
    ) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "This staff member holds an administrative login; only the Administrator may edit the record",
      });
    }
    // A seeded seat signs in with a fixed username and carries a placeholder
    // NIC; changing the NIC would rename the login out from under the seat.
    if (protection.isSeededSeat && input.nic !== existing.nic) {
      throw new ORPCError("FORBIDDEN", {
        message: "The NIC of a seeded institutional account cannot be changed",
      });
    }

    /**
     * There used to be a guard here: "A NIC cannot be removed while the staff
     * account is linked". It was guarding against `staff.nic` being nullable, and
     * the column is `NOT NULL` now — a member of staff has an identity whether
     * or not they have ever signed in, and the one thing a linked login adds is
     * that changing the NIC has to move the login's username with it, which is
     * the block below.
     *
     * So a `null` NIC is not "refused with a reason" any more; it is a value the
     * request schema cannot carry at all, because `nic` is required in
     * `staffUpdateSchema` for the same reason it is required in
     * `staffInsertSchema`. A caller that wants a person to stop having a NIC has
     * to delete the staff record, and the NIC goes with it.
     */

    const { id, ...updates } = input;
    const normalizedUpdates = {
      ...updates,
      teacherServiceNo:
        updates.teacherServiceNo?.toUpperCase() ?? updates.teacherServiceNo,
    };

    let record: typeof staff.$inferSelect | undefined;
    try {
      record = await context.db.transaction(async (tx) => {
        // Only a changed NIC moves the login: `nic` is required on every
        // update, so keying on its presence rewrote the username of every
        // record saved, and a seeded seat's fixed username with it.
        if (
          existing.userId &&
          typeof input.nic === "string" &&
          input.nic !== existing.nic
        ) {
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
      if (isUniqueViolation(error, "staff_teacher_service_no_unique")) {
        throw new ORPCError("CONFLICT", {
          message: "This teacher service number is already in use",
        });
      }
      if (
        isUniqueViolation(error, "staff_nic_unique") ||
        isUniqueViolation(error, "user_username_unique")
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
