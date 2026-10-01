import { ORPCError } from "@orpc/server";
import { createStaffCredential } from "@school-student-teacher-management/auth";
import {
  NIC_FORMAT_MESSAGE,
  isValidNicFormat,
} from "@school-student-teacher-management/db/schema/primitives";
import {
  staff,
  staffInsertSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { pick } from "valibot";
import * as v from "valibot";

import { requireStaffPermission } from "../../index";
import { isUniqueViolation, pgErrorOf } from "../../lib/db-errors";
import { currentAcademicYearId } from "./set-current-year";

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

    /**
     * Staff row, its current-year position, its login and the link between
     * them are one transaction (F-17). This used to be four separate writes
     * with hand-written compensating deletes, so a crash between them left an
     * orphan staff row holding the NIC (and a later create of the same person
     * failed), or an orphan login holding the username. A failure anywhere
     * now leaves nothing behind.
     */
    let record: typeof staff.$inferSelect;
    let username: string;
    try {
      ({ record, username } = await context.db.transaction(async (tx) => {
        const [inserted] = await tx
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

        if (!inserted) {
          throw new ORPCError("INTERNAL_SERVER_ERROR");
        }

        const currentYearId = await currentAcademicYearId(tx);
        if (currentYearId) {
          await tx.insert(staffPosition).values({
            id: crypto.randomUUID(),
            staffId: inserted.id,
            academicYearId: currentYearId,
            position: "teacher",
          });
        }

        let credential: { userId: string; username: string };
        try {
          credential = await createStaffCredential(tx, {
            nic: input.nic,
            password: initialPassword,
            name: input.name,
            email: email ?? undefined,
            role: "teacher",
            emailVerified: true,
          });
        } catch (error) {
          if (error instanceof ORPCError) {
            throw error;
          }
          // `createStaffCredential` refuses a username or address already
          // in use with a plain Error; that is a conflict, not a fault.
          if (!pgErrorOf(error)) {
            throw new ORPCError("CONFLICT", {
              message: `A login for NIC ${input.nic} (or this email) already exists`,
            });
          }
          throw error;
        }

        await tx
          .update(staff)
          .set({ userId: credential.userId })
          .where(eq(staff.id, inserted.id));

        return { record: inserted, username: credential.username };
      }));
    } catch (error) {
      if (isUniqueViolation(error, "staff_nic_unique")) {
        throw new ORPCError("CONFLICT", {
          message: "A staff member with this NIC already exists",
        });
      }
      if (isUniqueViolation(error, "staff_teacher_service_no_unique")) {
        throw new ORPCError("CONFLICT", {
          message: `Teacher service number ${badgeNumber} is already taken`,
        });
      }
      if (
        isUniqueViolation(error, "user_username_unique") ||
        isUniqueViolation(error, "user_email_unique")
      ) {
        throw new ORPCError("CONFLICT", {
          message: `A login for NIC ${input.nic} (or this email) already exists`,
        });
      }
      throw error;
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
