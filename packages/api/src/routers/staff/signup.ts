import { ORPCError } from "@orpc/server";
import { createStaffCredential } from "@school-student-teacher-management/auth";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  academicYear,
  STAFF_CATEGORIES,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { publicProcedure } from "../../index";

const nicSchema = v.pipe(
  v.string(),
  v.regex(
    /^(?<nic>\d{9}[VvXx]|\d{12})$/u,
    "Enter a valid Sri Lankan NIC (9 digits + V/X, or 12 digits)"
  )
);

/**
 * Staff self-service sign-up. The **NIC is the identity AND the login
 * username** (lowercased; unique index on `staff.nic` guarantees one
 * account per person). Creates the login (role `teacher`) and the linked
 * staff row with `staffCategory` (`teacher` | `officeStaff`).
 *
 * Returns the username (= NIC) for confirmation on screen.
 */
export const signupStaff = publicProcedure
  .input(
    v.object({
      name: v.pipe(v.string(), v.minLength(2), v.maxLength(120)),
      nic: nicSchema,
      /** The staff member's own email — shown on their profile. */
      email: v.pipe(v.string(), v.email()),
      phone: v.optional(v.pipe(v.string(), v.minLength(9))),
      staffCategory: v.picklist(STAFF_CATEGORIES),
      password: v.pipe(v.string(), v.minLength(8)),
    })
  )
  .handler(async ({ input, context }) => {
    // NIC uniqueness is the identity check — one account per person.
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

    const [existingEmail] = await context.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, input.email.toLowerCase()))
      .limit(1);

    if (existingEmail) {
      throw new ORPCError("CONFLICT", {
        message: "This email is already registered",
      });
    }

    const credential = await createStaffCredential(context.db, {
      nic: input.nic,
      password: input.password,
      name: input.name,
      // Real email on the account so password resets can target it later;
      // uniqueness already verified above.
      email: input.email.toLowerCase(),
      role: "teacher",
    });

    const [record] = await context.db
      .insert(staff)
      .values({
        id: crypto.randomUUID(),
        name: input.name,
        email: input.email.toLowerCase(),
        nic: input.nic,
        phone: input.phone ?? null,
        staffCategory: input.staffCategory,
        userId: credential.userId,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      staffId: record.id,
      /** Shown once — the member signs in with this. */
      username: credential.username,
    };
  });

/**
 * Leadership sign-up (Deputy Principal / Principal). Same NIC-as-username
 * rule, plus the shared setup code from env (`LEADERSHIP_SETUP_CODE`) so
 * the page cannot be used by outsiders. Also creates the matching
 * `staff_position` row for the current academic year so review-chain
 * authority resolves.
 */
export const signupLeadership = publicProcedure
  .input(
    v.object({
      name: v.pipe(v.string(), v.minLength(2), v.maxLength(120)),
      nic: nicSchema,
      email: v.pipe(v.string(), v.email()),
      phone: v.optional(v.pipe(v.string(), v.minLength(9))),
      position: v.picklist([
        "principal",
        "vicePrincipal",
        "assistantPrincipal",
      ]),
      setupCode: v.pipe(v.string(), v.minLength(1)),
      password: v.pipe(v.string(), v.minLength(8)),
    })
  )
  .handler(async ({ input, context }) => {
    if (input.setupCode !== context.env?.LEADERSHIP_SETUP_CODE) {
      throw new ORPCError("FORBIDDEN", {
        message: "Invalid setup code",
      });
    }

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
      email: input.email.toLowerCase(),
      role: "admin",
    });

    const [record] = await context.db
      .insert(staff)
      .values({
        id: crypto.randomUUID(),
        name: input.name,
        email: input.email.toLowerCase(),
        nic: input.nic,
        phone: input.phone ?? null,
        staffCategory: "officeStaff",
        userId: credential.userId,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    // Attach the leadership position for the current academic year so the
    // review chain recognises this member immediately.
    const [currentYear] = await context.db
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(eq(academicYear.isCurrent, true))
      .limit(1);

    if (currentYear) {
      const { staffPosition } =
        await import("@school-student-teacher-management/db/schema/staff");
      await context.db.insert(staffPosition).values({
        id: crypto.randomUUID(),
        staffId: record.id,
        academicYearId: currentYear.id,
        position: input.position,
      });
    }

    return {
      staffId: record.id,
      username: credential.username,
      positionLinked: Boolean(currentYear),
    };
  });
