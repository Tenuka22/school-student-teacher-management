import { ORPCError } from "@orpc/server";
import { createStaffCredential } from "@school-student-teacher-management/auth";
import {
  staff,
  staffInsertSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { pick } from "valibot";
import * as v from "valibot";

import { requireStaffPermission } from "../../index";

/**
 * Badge number (teacher service no.) format: "T" + digits, e.g. T0142.
 * Internal reference only — the login username is the **NIC**
 * (see `usernameForNic`).
 */
const BADGE_NUMBER_RE = /^T\d{3,6}$/u;

const badgeNumberSchema = v.pipe(
  v.string(),
  v.regex(BADGE_NUMBER_RE, "Badge number must look like T0142 (T + 3-6 digits)")
);

/** NIC format: old 9-digit + V/X or new 12-digit. Doubles as the username. */
const NIC_RE = /^(?<nic>\d{9}[VvXx]|\d{12})$/u;

const nicLoginSchema = v.pipe(
  v.string(),
  v.regex(NIC_RE, "NIC must be 9 digits + V/X or 12 digits")
);

/**
 * Temporary password handed to the teacher at account creation; the
 * teacher (or admin) rotates it from the portal afterwards. 12+ chars
 * with upper, lower, digit and special satisfies the strong-password rule.
 */
export const INITIAL_TEACHER_PASSWORD = "Welcome#2026";

export const createStaff = requireStaffPermission("create")
  .input(
    v.object({
      ...pick(staffInsertSchema, [
        "name",
        "email",
        "nic",
        "phone",
        "gender",
        "birthDate",
      ]).entries,
      teacherServiceNo: badgeNumberSchema,
      /** Required — it becomes the login username. */
      nic: nicLoginSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const badgeNumber = input.teacherServiceNo.toUpperCase();
    const id = crypto.randomUUID();

    // Optional staff email must not collide with a login account's
    // synthetic internal email either.
    if (input.email) {
      const [emailOwner] = await context.db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.email, input.email))
        .limit(1);
      if (emailOwner) {
        throw new ORPCError("CONFLICT", {
          message: "A staff member with this email already exists",
        });
      }
    }

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
          teacherServiceNo: badgeNumber,
        })
        .returning();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("staff_nic_unique")) {
          throw new ORPCError("CONFLICT", {
            message: "A staff member with this NIC already exists",
          });
        }
        if (error.message.includes("staff_teacher_service_no_unique")) {
          throw new ORPCError("CONFLICT", {
            message: `Badge number ${badgeNumber} is already taken`,
          });
        }
      }
      throw error;
    }

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    // Every teacher gets a login: username = NIC (lowercased), password =
    // the initial welcome password (shown to the admin once, then the
    // teacher rotates it).
    let username: string;
    try {
      const credential = await createStaffCredential(context.db, {
        nic: input.nic,
        password: INITIAL_TEACHER_PASSWORD,
        name: input.name,
        role: "teacher",
      });
      ({ username } = credential);

      await context.db
        .update(staff)
        .set({ userId: credential.userId })
        .where(eq(staff.id, record.id));
    } catch (error) {
      // Roll back the staff row so a half-created teacher (without a
      // working login) never lingers in the list.
      await context.db.delete(staff).where(eq(staff.id, record.id));
      throw new ORPCError("CONFLICT", {
        message:
          error instanceof Error
            ? error.message
            : `Could not create login for NIC ${input.nic}`,
      });
    }

    return {
      id: record.id,
      name: record.name,
      email: record.email,
      nic: record.nic,
      phone: record.phone,
      gender: record.gender,
      birthDate: record.birthDate,
      teacherServiceNo: record.teacherServiceNo,
      loginUsername: username,
      initialPassword: INITIAL_TEACHER_PASSWORD,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
