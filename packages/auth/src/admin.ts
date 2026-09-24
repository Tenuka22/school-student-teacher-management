import type { Database } from "@school-student-teacher-management/db";
import {
  account,
  user,
} from "@school-student-teacher-management/db/schema/auth";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, lt, or } from "drizzle-orm";

import type { AuthConfig } from "./index";

/** Position keys (see db/constants/positions.ts) for the two leadership seats. */
export const PRINCIPAL_POSITION = "principal";
export const DEPUTY_PRINCIPAL_POSITION = "vicePrincipal";

/**
 * Auth role for each leadership position. Principal gets `principal`; both
 * deputy seats (Vice and Assistant Principal) get `vicePrincipal`, since the
 * role names the tier and the position row carries the exact title.
 */
export const LEADERSHIP_ROLE_BY_POSITION = {
  principal: "principal",
  vicePrincipal: "vicePrincipal",
  assistantPrincipal: "vicePrincipal",
} as const;

export type SeededLeadershipRole =
  (typeof LEADERSHIP_ROLE_BY_POSITION)[keyof typeof LEADERSHIP_ROLE_BY_POSITION];

/** The role to use for a leadership position key, or `null` if not one. */
export const leadershipRoleForPosition = (
  position: string
): SeededLeadershipRole | null =>
  LEADERSHIP_ROLE_BY_POSITION[
    position as keyof typeof LEADERSHIP_ROLE_BY_POSITION
  ] ?? null;

/**
 * Login usernames for the seeded accounts. Fixed rather than configurable:
 * they are operational constants that the Principal, Deputy and admin all
 * know, and keeping them out of env removes a class of misconfiguration.
 * Passwords stay in env — those are genuinely per-deployment secrets.
 */
export const ADMIN_USERNAME = "admin";
export const PRINCIPAL_USERNAME = "principal";
export const DEPUTY_PRINCIPAL_USERNAME = "deputy-principal";

/**
 * Real, deliverable addresses for the seeded accounts. Unlike ordinary staff
 * — whose accounts carry the email they typed at sign-up — these are fixed
 * institutional addresses, so one-time codes for elevated actions have
 * somewhere to go. They are seeded already verified: the accounts are created
 * from server-side env secrets, not self-service, so there is nobody to prove
 * ownership to.
 */
export const ADMIN_EMAIL = "admin@aloysiuscollege.lk";
export const PRINCIPAL_EMAIL = "principal@aloysiuscollege.lk";
export const DEPUTY_PRINCIPAL_EMAIL = "deputy-principal@aloysiuscollege.lk";

/** Synthetic internal email backing a username login (never shown). */
export const internalEmailForUsername = (accountUsername: string) =>
  `${accountUsername.toLowerCase()}@school-student-teacher-management.internal`;

/**
 * Username for a staff login account: **the NIC itself** (lowercased so
 * "991234567V" and "991234567v" are the same account). Uniqueness is
 * guaranteed by the unique index on `staff.nic` — one NIC, one person,
 * one account. No random suffixes, nothing auto-generated to remember.
 *
 * The seeded admin/leadership accounts are the exception: they have no staff
 * identity, so they use the fixed usernames above.
 */
export const usernameForNic = (nic: string) => nic.toLowerCase();

/**
 * Validates the bootstrap username values. Usernames must match what Better
 * Auth accepts (letters/digits/dots/underscores — hyphens are additionally
 * allowed via the custom `usernameValidator`), so a bad value fails fast
 * with a clear message instead of silently breaking sign-in.
 */
const assertValidBootstrapUsername = (username: string, label: string) => {
  if (!/^[a-z0-9_-]+$/u.test(username)) {
    throw new Error(
      `Invalid ${label} username "${username}": use only letters, digits, "-" or "_"`
    );
  }
};

/**
 * Creates a staff credential account whose username is the **staff
 * member's NIC** (lowercased). Used by both self-service sign-up and
 * admin-created staff. A synthetic internal email (never shown) satisfies
 * Better Auth's required email field unless the staff member provided their
 * own email.
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
    emailVerified = false,
  }: {
    nic: string;
    password: string;
    name: string;
    email?: string;
    role?: string;
    /**
     * Self-service accounts start unverified: the address is only proven once
     * the member enters the code sent to it. Admin-created staff pass `true`,
     * because an administrator vouching for the details is the check.
     */
    emailVerified?: boolean;
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
    emailVerified,
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

interface EnsureBootstrapAccountConfig {
  /** Fixed login username, e.g. "principal". */
  username: string;
  /** Real institutional address, used for OTP delivery. */
  email: string;
  password: string;
  /** Display name, e.g. "Principal". */
  name: string;
  /** Seeded auth role: `admin`, `principal`, `vicePrincipal` or `teacher`. */
  role: string;
}

/**
 * Bootstraps (or re-secures) one named account using direct database
 * operations — bypassing Better Auth's HTTP API layer.
 *
 * Creates or updates just two linked rows, `user` + `account`, at a fixed
 * institutional address, marked verified. Deliberately **no `staff` row and
 * no `staff_position`**: these are pure admin accounts, not members of the
 * teaching staff, so they need no NIC and never appear in staff lists or
 * attendance. Their leave-review authority comes from the seeded role.
 *
 * Idempotent: runs on every server start, so env stays the source of truth
 * for the password and the role.
 */
const ensureBootstrapAccount = async (
  database: Database,
  { username, email, password, name, role }: EnsureBootstrapAccountConfig
) => {
  assertValidBootstrapUsername(username, name);
  const accountUsername = username.toLowerCase();
  const accountEmail = email.toLowerCase();

  const [existing] = await database
    .select()
    .from(user)
    .where(or(eq(user.username, accountUsername), eq(user.email, accountEmail)))
    .limit(1);

  // Kick off hashing while the next query runs; resolved below before use.
  const hashPromise = hashPassword(password);

  let userId: string;

  if (existing) {
    // Re-secure on every server start so env stays the source of truth, and
    // re-assert the role and address so an account seeded under an older
    // scheme (synthetic internal email) settles onto the current values.
    userId = existing.id;
    await database
      .update(user)
      .set({ role, name, email: accountEmail })
      .where(eq(user.id, userId));
    const [existingAccount] = await database
      .select()
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "credential"))
      )
      .limit(1);
    const hash = await hashPromise;
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
    const hash = await hashPromise;
    await database.insert(user).values({
      id: userId,
      name,
      email: accountEmail,
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
  }

  console.log(`[auth] Ensured ${role} account (${accountUsername})`);
};

/**
 * How long an unverified account is kept before being swept.
 *
 * Verification codes are deliberately short-lived, so an account that never
 * confirms its address is almost always abandoned rather than slow — a week
 * is generous while still stopping the table filling with throwaways.
 */
export const UNVERIFIED_ACCOUNT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Deletes accounts that never confirmed their email address and are older
 * than `UNVERIFIED_ACCOUNT_TTL_MS`.
 *
 * Only `emailVerified: false` rows are eligible, so this can never touch the
 * seeded institutional accounts (seeded verified) or a real staff member who
 * has since confirmed. Cascades take their sessions, accounts and — for a
 * teacher requester — the linked `staff` row with them, so a sweep does not
 * leave an orphaned staff record behind.
 *
 * Returns the ids removed, so the caller can log the sweep.
 */
export const purgeUnverifiedAccounts = async (
  database: Database,
  { olderThanMs = UNVERIFIED_ACCOUNT_TTL_MS }: { olderThanMs?: number } = {}
) => {
  const cutoff = new Date(Date.now() - olderThanMs);

  const stale = await database
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.emailVerified, false), lt(user.createdAt, cutoff)));

  if (stale.length === 0) {
    return { removed: 0 };
  }

  const ids = stale.map((row) => row.id);
  await database.delete(user).where(inArray(user.id, ids));

  return { removed: ids.length };
};

/**
 * Bootstraps (or re-secures) the admin, Principal and Deputy Principal
 * accounts from env. Runs on every server start so credentials stay in sync.
 */
export const ensureBootstrapUsers = async (
  database: Database,
  env: AuthConfig
) => {
  await Promise.all([
    ensureBootstrapAccount(database, {
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      name: env.ADMIN_NAME || "Admin",
      role: "admin",
    }),
    ensureBootstrapAccount(database, {
      username: PRINCIPAL_USERNAME,
      email: PRINCIPAL_EMAIL,
      password: env.PRINCIPAL_PASSWORD,
      name: env.PRINCIPAL_NAME || "Principal",
      role: leadershipRoleForPosition(PRINCIPAL_POSITION) ?? "admin",
    }),
    ensureBootstrapAccount(database, {
      username: DEPUTY_PRINCIPAL_USERNAME,
      email: DEPUTY_PRINCIPAL_EMAIL,
      password: env.DEPUTY_PRINCIPAL_PASSWORD,
      name: env.DEPUTY_PRINCIPAL_NAME || "Deputy Principal",
      role: leadershipRoleForPosition(DEPUTY_PRINCIPAL_POSITION) ?? "admin",
    }),
  ]);
};
