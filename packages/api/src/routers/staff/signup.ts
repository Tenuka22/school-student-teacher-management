import { ORPCError } from "@orpc/server";
import { createStaffCredential } from "@school-student-teacher-management/auth";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  NIC_FORMAT_MESSAGE,
  isValidNicFormat,
} from "@school-student-teacher-management/db/schema/primitives";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { publicProcedure } from "../../index";

const nicSchema = v.pipe(
  v.string(),
  v.check(isValidNicFormat, NIC_FORMAT_MESSAGE)
);

/** Fields only a staff account needs — the NIC identifies them. */
const teacherSignupSchema = v.object({
  accountType: v.literal("teacher"),
  name: v.pipe(v.string(), v.minLength(2), v.maxLength(120)),
  nic: nicSchema,
  /** The staff member's own email — shown on their profile. */
  email: v.pipe(v.string(), v.email()),
  phone: v.optional(v.pipe(v.string(), v.minLength(9))),
  password: v.pipe(v.string(), v.minLength(8)),
});

/**
 * Fields a general user needs. No NIC, no staff record — the email doubles
 * as the login username, so there is nothing else to collect.
 */
const userSignupSchema = v.object({
  accountType: v.literal("user"),
  name: v.pipe(v.string(), v.minLength(2), v.maxLength(120)),
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
});

/**
 * Self-service sign-up for two kinds of account.
 *
 * - **teacher** — identified by NIC, which is also the login username. Creates
 *   a linked `staff` row so the person appears in staff lists while an
 *   administrator decides on the request.
 * - **user** — no staff identity at all. The email is the username, and the
 *   account starts with the `user` role, which reaches no staff tooling.
 *
 * Office staff deliberately have no self-service path. Their accounts are
 * issued by an administrator, who creates the staff record and hands over the
 * login. Accepting an office-staff registration here produced an account that
 * could verify its address, reach the approval queue, and then be refused by
 * approval for the one reason it could never fix itself.
 */
export const signupStaff = publicProcedure
  .input(v.variant("accountType", [teacherSignupSchema, userSignupSchema]))
  .handler(async ({ input, context }) => {
    const email = input.email.toLowerCase();

    const [existingEmail] = await context.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (existingEmail) {
      throw new ORPCError("CONFLICT", {
        message: "This email is already registered",
      });
    }

    if (input.accountType === "user") {
      // Username is the email, lowercased for consistency with the NIC rule.
      const credential = await createStaffCredential(context.db, {
        nic: email,
        password: input.password,
        name: input.name,
        email,
        role: "user",
        emailVerified: false,
      });

      return {
        accountType: "user" as const,
        userId: credential.userId,
        username: credential.username,
      };
    }

    // NIC uniqueness is the identity check — one NIC, one person, one account.
    const [existingStaff] = await context.db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.nic, input.nic))
      .limit(1);

    if (existingStaff) {
      throw new ORPCError("CONFLICT", {
        message: "A staff record with this NIC already exists",
      });
    }

    const credential = await createStaffCredential(context.db, {
      nic: input.nic,
      password: input.password,
      name: input.name,
      // Real email on the account so the verification code and any later
      // password reset can reach it; uniqueness already verified above.
      email,
      // Asking for staff access is not the same as having it: an
      // administrator promotes `teacher-requester` to `teacher` once they
      // have checked the employment details.
      role: "teacher-requester",
      emailVerified: false,
    });

    const [record] = await context.db
      .insert(staff)
      .values({
        id: crypto.randomUUID(),
        name: input.name,
        email,
        nic: input.nic,
        phone: input.phone ?? null,
        // Every self-service registration is a teaching applicant; office
        // staff are added by an administrator under Teachers.
        staffCategory: "teacher",
        userId: credential.userId,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      accountType: "teacher" as const,
      staffId: record.id,
      /** Shown once — the member signs in with this. */
      username: credential.username,
    };
  });
