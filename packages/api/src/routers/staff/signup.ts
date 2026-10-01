import { ORPCError } from "@orpc/server";
import { createStaffCredential } from "@school-student-teacher-management/auth";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  NIC_FORMAT_MESSAGE,
  accountPasswordSchema,
  isValidNicFormat,
} from "@school-student-teacher-management/db/schema/primitives";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { publicProcedure } from "../../index";
import { isUniqueViolation, pgErrorOf } from "../../lib/db-errors";
import {
  clientAddressOf,
  createFixedWindowLimiter,
} from "../../lib/rate-limit";

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
  password: accountPasswordSchema,
});

/**
 * Fields a general user needs. No NIC, no staff record — the email doubles
 * as the login username, so there is nothing else to collect.
 */
const userSignupSchema = v.object({
  accountType: v.literal("user"),
  name: v.pipe(v.string(), v.minLength(2), v.maxLength(120)),
  email: v.pipe(v.string(), v.email()),
  password: accountPasswordSchema,
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
/**
 * `createStaffCredential` refuses a username or address already in use with
 * a plain `Error`, which surfaced as a 500; and a concurrent sign-up for the
 * same NIC loses on the unique index instead. Both are a 409.
 */
const createLogin = async <T>(write: () => Promise<T>): Promise<T> => {
  try {
    return await write();
  } catch (error) {
    if (error instanceof ORPCError) {
      throw error;
    }
    if (!pgErrorOf(error) || isUniqueViolation(error)) {
      throw new ORPCError("CONFLICT", {
        message: "An account with these details already exists",
      });
    }
    throw error;
  }
};

/**
 * Public and unauthenticated, and every call costs a password hash and up to
 * three writes, so it is rate limited before any of that runs (F-19): five
 * sign-ups per address per ten minutes, and sixty per hour across everyone —
 * the second bound holds even against a forged `X-Forwarded-For`.
 */
const SIGNUPS_PER_ADDRESS = createFixedWindowLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
});
const SIGNUPS_OVERALL = createFixedWindowLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
});

export const resetSignupRateLimits = () => {
  SIGNUPS_PER_ADDRESS.reset();
  SIGNUPS_OVERALL.reset();
};

const assertSignupAllowed = (headers: Headers | undefined) => {
  const wait = Math.max(
    SIGNUPS_PER_ADDRESS.hit(clientAddressOf(headers)),
    SIGNUPS_OVERALL.hit("all")
  );
  if (wait > 0) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: `Too many sign-up attempts. Try again in ${Math.ceil(wait / 60_000)} minute(s).`,
    });
  }
};

export const signupStaff = publicProcedure
  .input(v.variant("accountType", [teacherSignupSchema, userSignupSchema]))
  .handler(async ({ input, context }) => {
    assertSignupAllowed(context.headers);
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
      const credential = await createLogin(() =>
        createStaffCredential(context.db, {
          nic: email,
          password: input.password,
          name: input.name,
          email,
          role: "user",
          emailVerified: false,
        })
      );

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

    // Login and staff row together or not at all (F-17): a failed staff
    // insert used to leave a login holding the NIC-username, which then
    // blocked the real person from ever registering.
    const record = await createLogin(() =>
      context.db.transaction(async (tx) => {
        const credential = await createStaffCredential(tx, {
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

        const [inserted] = await tx
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
        return { inserted, username: credential.username };
      })
    );

    if (!record.inserted) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      accountType: "teacher" as const,
      staffId: record.inserted.id,
      /** Shown once — the member signs in with this. */
      username: record.username,
    };
  });
