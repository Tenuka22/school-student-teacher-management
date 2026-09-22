import type { Database } from "@school-student-teacher-management/db";
import {
  account,
  user,
} from "@school-student-teacher-management/db/schema/auth";
import { hashPassword } from "better-auth/crypto";
import { and, eq, or } from "drizzle-orm";

import type { AuthConfig } from "./index";

/**
 * Bootstraps (or re-secures) a credential login using direct database
 * operations — bypassing Better Auth's HTTP API layer entirely.
 *
 * The account signs in with username + password. A synthetic internal email
 * (`<username>@school-student-teacher-management.internal`) satisfies Better Auth's required
 * email field and is never shown to the user.
 */
const ensureCredentialUser = async (
  database: Database,
  {
    username: accountUsername,
    password,
    name,
    role,
  }: { username: string; password: string; name: string; role: string }
) => {
  const internalEmail = `${accountUsername.toLowerCase()}@school-student-teacher-management.internal`;
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

  if (!existing) {
    const userId = crypto.randomUUID();
    await database.insert(user).values({
      id: userId,
      name,
      email: internalEmail,
      emailVerified: true,
      username: accountUsername,
      role,
    });

    await database.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
    });

    console.log(`[auth] Created ${role} user`);
    return;
  }

  await database.update(user).set({ role }).where(eq(user.id, existing.id));

  const [existingAccount] = await database
    .select()
    .from(account)
    .where(eq(account.userId, existing.id))
    .limit(1);

  // oxlint-disable-next-line unicorn/prefer-ternary
  if (existingAccount) {
    await database
      .update(account)
      .set({ password: hash })
      .where(eq(account.id, existingAccount.id));
  } else {
    await database.insert(account).values({
      id: crypto.randomUUID(),
      accountId: existing.id,
      providerId: "credential",
      userId: existing.id,
      password: hash,
    });
  }

  console.log(`[auth] Rotated password for ${role} user`);
};

/**
 * Username for a staff login account: **the NIC itself** (lowercased so
 * "991234567V" and "991234567v" are the same account). Uniqueness is
 * guaranteed by the unique index on `staff.nic` — one NIC, one person,
 * one account. No random suffixes, nothing auto-generated to remember.
 */
export const usernameForNic = (nic: string) => nic.toLowerCase();

/** Legacy helper: badge-number usernames (pre NIC-username era). */
export const usernameForBadgeNumber = (badgeNumber: string) =>
  badgeNumber.toLowerCase();

/** Synthetic internal email backing a username login (never shown). */
export const internalEmailForUsername = (accountUsername: string) =>
  `${accountUsername.toLowerCase()}@school-student-teacher-management.internal`;

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

/**
 * Creates a new teacher credential account.
 *
 * The teacher signs in with their **badge number** as the username plus a
 * password chosen by the admin at creation time. A synthetic internal
 * email (never shown) satisfies Better Auth's required email field.
 *
 * Returns the generated user id so the staff row can link to it.
 */
export const createTeacherCredential = async (
  database: Database,
  {
    badgeNumber,
    password,
    name,
  }: { badgeNumber: string; password: string; name: string }
) => {
  const accountUsername = usernameForBadgeNumber(badgeNumber);
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

  if (existing) {
    throw new Error(`A user with username "${accountUsername}" already exists`);
  }

  const userId = crypto.randomUUID();
  await database.insert(user).values({
    id: userId,
    name,
    email: internalEmail,
    emailVerified: true,
    username: accountUsername,
    displayUsername: badgeNumber,
    role: "teacher",
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

/**
 * Rotates a teacher's password. Called from the admin panel.
 * Looks the teacher up by badge number (their username).
 */
export const rotateTeacherPassword = async (
  database: Database,
  { badgeNumber, newPassword }: { badgeNumber: string; newPassword: string }
) => {
  const accountUsername = usernameForBadgeNumber(badgeNumber);
  const [existing] = await database
    .select()
    .from(user)
    .where(eq(user.username, accountUsername))
    .limit(1);

  if (!existing) {
    throw new Error(`No account found for badge number "${badgeNumber}"`);
  }

  const [hash, [existingAccount]] = await Promise.all([
    hashPassword(newPassword),
    database
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, existing.id),
          eq(account.providerId, "credential")
        )
      )
      .limit(1),
  ]);

  // oxlint-disable-next-line unicorn/prefer-ternary
  if (existingAccount) {
    await database
      .update(account)
      .set({ password: hash })
      .where(eq(account.id, existingAccount.id));
  } else {
    await database.insert(account).values({
      id: crypto.randomUUID(),
      accountId: existing.id,
      providerId: "credential",
      userId: existing.id,
      password: hash,
    });
  }
};

/**
 * Bootstraps (or re-secures) the admin account using username + password.
 * Runs on every server start so the admin credential stays in sync with env.
 */
export const ensureAdminUser = (database: Database, env: AuthConfig) =>
  ensureCredentialUser(database, {
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
    name: "Administrator",
    role: "admin",
  });
