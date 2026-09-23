import type { Database } from "@school-student-teacher-management/db";
import {
  account,
  user,
} from "@school-student-teacher-management/db/schema/auth";
import {
  academicYear,
  staff,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { hashPassword } from "better-auth/crypto";
import { and, eq, or } from "drizzle-orm";

import type { AuthConfig } from "./index";

/** Position keys (see db/constants/positions.ts) for the two leadership seats. */
export const PRINCIPAL_POSITION = "principal";
export const DEPUTY_PRINCIPAL_POSITION = "vicePrincipal";

/** Synthetic internal email backing a username login (never shown). */
export const internalEmailForUsername = (accountUsername: string) =>
  `${accountUsername.toLowerCase()}@school-student-teacher-management.internal`;

/**
 * Username for a staff login account: **the NIC itself** (lowercased so
 * "991234567V" and "991234567v" are the same account). Uniqueness is
 * guaranteed by the unique index on `staff.nic` — one NIC, one person,
 * one account. No random suffixes, nothing auto-generated to remember.
 */
export const usernameForNic = (nic: string) => nic.toLowerCase();

/**
 * Creates a staff credential account whose username is the **staff
 * member's NIC** (lowercased).
 *
 * Used by both self-service sign-up and admin-created staff. A synthetic
 * internal email (never shown) satisfies Better Auth's required email
 * field unless the staff member provided their own email.
 *
 * Returns the user id and the username (the NIC) for confirmation.
 */
export const createStaffCredential = async (
  database: Database,
  {
    nic,
    password,
    name,
    email,
    role = "teacher",
  }: {
    nic: string;
    password: string;
    name: string;
    email?: string;
    role?: string;
  }
) => {
  const accountUsername = usernameForNic(nic);
  const internalEmail = email ?? internalEmailForUsername(accountUsername);

  const [hash, [existing]] = await Promise.all([
    hashPassword(password),
    database
      .select()
      .from(user)
      .where(
        or(eq(user.username, accountUsername), eq(user.email, internalEmail))
      )
      .limit(1),
  ]);

  if (existing) {
    throw new Error(
      `An account with username "${accountUsername}" already exists`
    );
  }

  const userId = crypto.randomUUID();
  await database.insert(user).values({
    id: userId,
    name,
    email: internalEmail,
    emailVerified: true,
    username: accountUsername,
    displayUsername: accountUsername,
    role,
  });

  await database.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hash,
  });

  return { userId, username: accountUsername };
};

interface EnsureLeadershipUserConfig {
  /** Leadership position key ("principal" | "vicePrincipal"). */
  position: typeof PRINCIPAL_POSITION | typeof DEPUTY_PRINCIPAL_POSITION;
  /** The leadership member's NIC — also their login username. */
  nic: string;
  password: string;
  /** Display name, e.g. "Principal". */
  name: string;
}

/**
 * Bootstraps one leadership account (Principal or Deputy Principal) using
 * direct database operations — bypassing Better Auth's HTTP API layer.
 *
 * Creates (or re-syncs the password of) three linked rows:
 * 1. `user` + `account` — login with username = NIC, role `admin`.
 * 2. `staff` — the permanent staff record (`staffCategory: "officeStaff"`).
 * 3. `staff_position` — the leadership position for the current academic
 *    year, so the leave review chain (`recommendLeave` / `finalizeLeave`)
 *    recognises this member immediately.
 *
 * If a current academic year does not exist yet, the user + staff rows are
 * still created; the position row is linked later by `signupLeadership`
 * logic or manually.
 */
const ensureLeadershipUser = async (
  database: Database,
  { position, nic, password, name }: EnsureLeadershipUserConfig
) => {
  const accountUsername = usernameForNic(nic);
  const internalEmail = internalEmailForUsername(accountUsername);

  const [hash, [existing]] = await Promise.all([
    hashPassword(password),
    database
      .select()
      .from(user)
      .where(
        or(eq(user.username, accountUsername), eq(user.email, internalEmail))
      )
      .limit(1),
  ]);

  let userId: string;

  if (existing) {
    // Re-secure on every server start so env stays the source of truth.
    userId = existing.id;
    await database
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.id, userId));
    const [existingAccount] = await database
      .select()
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "credential"))
      )
      .limit(1);
    // oxlint-disable-next-line unicorn/prefer-ternary -- update vs insert branches have different shapes
    if (existingAccount) {
      await database
        .update(account)
        .set({ password: hash })
        .where(eq(account.id, existingAccount.id));
    } else {
      await database.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hash,
      });
    }
  } else {
    userId = crypto.randomUUID();
    await database.insert(user).values({
      id: userId,
      name,
      email: internalEmail,
      emailVerified: true,
      username: accountUsername,
      displayUsername: accountUsername,
      role: "admin",
    });
    await database.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
    });
  }

  // Ensure the staff row exists and links to the login account.
  const [existingStaff] = await database
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.nic, nic))
    .limit(1);

  let staffId: string;

  if (existingStaff) {
    staffId = existingStaff.id;
    await database
      .update(staff)
      .set({ userId, staffCategory: "officeStaff" })
      .where(eq(staff.id, staffId));
  } else {
    const [record] = await database
      .insert(staff)
      .values({
        id: crypto.randomUUID(),
        name,
        email: internalEmail,
        nic,
        staffCategory: "officeStaff",
        userId,
      })
      .returning({ id: staff.id });
    if (!record) {
      throw new Error(`Failed to create staff row for ${name}`);
    }
    staffId = record.id;
  }

  // Attach the leadership position for the current academic year (if any).
  const [currentYear] = await database
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(eq(academicYear.isCurrent, true))
    .limit(1);

  if (currentYear) {
    const [existingPosition] = await database
      .select({ id: staffPosition.id })
      .from(staffPosition)
      .where(
        and(
          eq(staffPosition.staffId, staffId),
          eq(staffPosition.academicYearId, currentYear.id),
          eq(staffPosition.position, position)
        )
      )
      .limit(1);

    if (!existingPosition) {
      await database.insert(staffPosition).values({
        id: crypto.randomUUID(),
        staffId,
        academicYearId: currentYear.id,
        position,
      });
    }
  }

  console.log(`[auth] Ensured ${position} account (${accountUsername})`);
};

/**
 * Bootstraps (or re-secures) the Principal and Deputy Principal accounts
 * from env. Runs on every server start so credentials stay in sync.
 */
export const ensureLeadershipUsers = async (
  database: Database,
  env: AuthConfig
) => {
  await Promise.all([
    ensureLeadershipUser(database, {
      position: PRINCIPAL_POSITION,
      nic: env.PRINCIPAL_NIC,
      password: env.PRINCIPAL_PASSWORD,
      name: env.PRINCIPAL_NAME || "Principal",
    }),
    ensureLeadershipUser(database, {
      position: DEPUTY_PRINCIPAL_POSITION,
      nic: env.DEPUTY_PRINCIPAL_NIC,
      password: env.DEPUTY_PRINCIPAL_PASSWORD,
      name: env.DEPUTY_PRINCIPAL_NAME || "Deputy Principal",
    }),
  ]);
};
