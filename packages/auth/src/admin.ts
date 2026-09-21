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
 * Creates a new teacher credential account from the admin panel.
 * The admin enters: teacher name, email, password.
 */
export const createTeacherCredential = async (
  database: Database,
  { email, password, name }: { email: string; password: string; name: string }
) => {
  const [hash, [existing]] = await Promise.all([
    hashPassword(password),
    database.select().from(user).where(eq(user.email, email)).limit(1),
  ]);

  if (existing) {
    throw new Error(`User with email "${email}" already exists`);
  }

  const userId = crypto.randomUUID();
  await database.insert(user).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    role: "teacher",
  });

  await database.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hash,
  });

  console.log(`[auth] Created teacher user: email=${email}`);
  return { userId, email };
};

/**
 * Rotates a teacher's password. Called from the admin panel.
 */
export const rotateTeacherPassword = async (
  database: Database,
  { email, newPassword }: { email: string; newPassword: string }
) => {
  const [existing] = await database
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!existing) {
    throw new Error(`User with email "${email}" not found`);
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

  console.log(`[auth] Rotated password for teacher: email=${email}`);
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
