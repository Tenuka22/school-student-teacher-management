import { ORPCError } from "@orpc/server";
import { createStaffCredential } from "@school-student-teacher-management/auth";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  NIC_FORMAT_MESSAGE,
  isValidNicFormat,
} from "@school-student-teacher-management/db/schema/primitives";
import {
  academicYear,
  staff,
  staffInsertSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { pick } from "valibot";
import * as v from "valibot";

import { requireStaffPermission } from "../../index";

const BADGE_NUMBER_RE = /^T\d{3,6}$/u;

const badgeNumberSchema = v.pipe(
  v.string(),
  v.regex(BADGE_NUMBER_RE, "Badge number must look like T0142 (T + 3-6 digits)")
);

/**
 * The NIC becomes the login username, so it is validated here in exactly the
 * format the `staff` table accepts. This used to also allow a trailing `X`,
 * which passed this check and then failed the insert — leaving the credential
 * created and the staff record missing.
 */
const nicLoginSchema = v.pipe(
  v.string(),
  v.check(isValidNicFormat, NIC_FORMAT_MESSAGE)
);

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
        "staffCategory",
        "appointmentType",
        "appointmentDate",
        "employmentStatus",
      ]).entries,
      teacherServiceNo: v.optional(badgeNumberSchema),
      /** Required — it becomes the login username. */
      nic: nicLoginSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const badgeNumber = input.teacherServiceNo?.toUpperCase() ?? null;
    const email = input.email?.toLowerCase() ?? null;
    const initialPassword = `${crypto.randomUUID()}Aa1!`;
    const id = crypto.randomUUID();

    if (email) {
      const [emailOwner] = await context.db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.email, email))
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
          email,
          nic: input.nic,
          phone: input.phone,
          gender: input.gender,
          birthDate: input.birthDate,
          staffCategory: input.staffCategory,
          appointmentType: input.appointmentType,
          appointmentDate: input.appointmentDate,
          employmentStatus: input.employmentStatus,
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
            message: `Teacher service number ${badgeNumber} is already taken`,
          });
        }
      }
      throw error;
    }

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    const [currentYear] = await context.db
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(eq(academicYear.isCurrent, true))
      .limit(1);
    if (currentYear) {
      await context.db.insert(staffPosition).values({
        id: crypto.randomUUID(),
        staffId: record.id,
        academicYearId: currentYear.id,
        position: "teacher",
      });
    }

    let credentialUserId: string | undefined;
    let username: string;
    try {
      const credential = await createStaffCredential(context.db, {
        nic: input.nic,
        password: initialPassword,
        name: input.name,
        email: email ?? undefined,
        role: "teacher",
        emailVerified: true,
      });
      const { userId, username: createdUsername } = credential;
      credentialUserId = userId;
      username = createdUsername;

      await context.db
        .update(staff)
        .set({ userId: credential.userId })
        .where(eq(staff.id, record.id));
    } catch (error) {
      await context.db.delete(staff).where(eq(staff.id, record.id));
      if (credentialUserId) {
        await context.db
          .delete(userTable)
          .where(eq(userTable.id, credentialUserId));
      }
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
      staffCategory: record.staffCategory,
      appointmentType: record.appointmentType,
      appointmentDate: record.appointmentDate,
      employmentStatus: record.employmentStatus,
      teacherServiceNo: record.teacherServiceNo,
      loginUsername: username,
      initialPassword,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
