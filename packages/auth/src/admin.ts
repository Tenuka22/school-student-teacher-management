import type { Database } from "@school-student-teacher-management/db";
import {
  DEFAULT_INVENTORY_CATEGORIES,
  normalizeInventoryKey,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  account,
  user,
} from "@school-student-teacher-management/db/schema/auth";
import { inventoryCategory } from "@school-student-teacher-management/db/schema/inventory";
import { staff } from "@school-student-teacher-management/db/schema/staff";
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
 * The seeded admin/leadership accounts are the exception: they have a `staff`
 * row but no NIC on it, so they use the fixed usernames above. See
 * `ensureBootstrapAccount` for why no NIC is invented for them.
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
 * Stable `staff.id` for a seeded seat.
 *
 * **Not `crypto.randomUUID()`.** The insert below is already idempotent — the
 * conflict target is `staff.userId`, so a second boot's row is skipped rather
 * than written — which means a fresh UUID would never actually be persisted
 * twice. But an id that *looks* per-boot and is only accidentally stable is a
 * trap: the moment anyone adds a `select ... where staff.id = <that uuid>`
 * before the insert, or a code path that reaches the id another way, every
 * restart becomes a new person. A deterministic id makes the seat's identity
 * legible in the database (`seed-staff-principal` in a `SELECT *`), removes the
 * dependency on the conflict target for correctness, and means a dropped row is
 * re-created with the *same* id rather than orphaning every `managerStaffId` /
 * `custodianStaffId` that pointed at it.
 *
 * The removed `ensureLeadershipUsers` (9932fd4) used `crypto.randomUUID()` and
 * got away with it only because it did a separate `select ... where staff.nic`
 * before inserting. This departs from that deliberately: the conflict target
 * here is `userId`, and a deterministic id is what makes "same person across
 * boots" a property of the data rather than of the order of two statements.
 */
const SEEDED_STAFF_ID_PREFIX = "seed-staff-";

/**
 * The category a seeded seat's `staff` row carries, and the reason the row stays
 * off every teaching surface — see the `ensureBootstrapAccount` doc comment.
 * Named rather than inlined at the insert so the two log lines and the comment
 * cannot disagree about the value.
 */
const SEEDED_STAFF_CATEGORY = "officeStaff";

/** See {@link SEEDED_STAFF_ID_PREFIX} for why this is not a UUID. */
const seededStaffId = (accountUsername: string): string =>
  `${SEEDED_STAFF_ID_PREFIX}${accountUsername}`;

/**
 * Bootstraps one named account using direct database operations — bypassing
 * Better Auth's HTTP API layer.
 *
 * Creates or re-syncs two linked rows, `user` + `account`, at a fixed
 * institutional address, marked verified — and now **also** a linked `staff`
 * row, which is a change from the previous version of this comment.
 *
 * **Why the `staff` row exists at all.** The inventory register points at
 * people, not logins: `inventoryItem.managerStaffId` and
 * `inventoryItem.custodianStaffId` are both `staff.id`, and
 * `getInventoryActor` resolves the caller through `staff.userId` before it can
 * name anyone. So a seat with no `staff` row can *authorise* equipment and can
 * never hold, manage, borrow or sign for any — the register's central use case
 * closed to the person most likely to be handed a school laptop. These seats
 * have elevated permissions and are entitled to be treated as people in the
 * building, not only as logins.
 *
 * **What keeps it invisible to the school.** `staffCategory: "officeStaff"`,
 * and that one field is load-bearing rather than cosmetic. Every teaching
 * surface filters on it: `listStaff` with no year uses
 * `staffCategory = 'teacher' AND (employment_status = 'active' OR IS NULL)`
 * (`list-staff.ts:65`), and with a year it defers to
 * `getYearRosterTeacherIds`, whose `teachingStaff` predicate in
 * `teacher-eligibility.ts:32` carries the same `staffCategory = 'teacher'`
 * clause. A teacher-category row would have landed in the roster, in attendance
 * and in the teacher exports; an `officeStaff` row appears in none of them,
 * which is exactly what the old comment claimed and is now true for a
 * different reason.
 *
 * **No `staff_position` row, deliberately.** `resolveAuthority`
 * (`leadership-review.ts:175-185`) returns early for a seeded account —
 * `isSeededAccount(username)` plus a `principal` / `vicePrincipal` role —
 * with `staffId: null`, *before* it ever looks up a `staff` row, let alone a
 * position. A position row would therefore be unreachable: the only reader of
 * `staffPosition` in that function is past the early return. And it would look
 * authoritative while doing nothing, which is worse than absent — a future
 * reader would reasonably assume the position was load-bearing. Do not
 * "helpfully" add one. Leave-review authority comes from the seeded role.
 *
 * **The `staff` row is never overwritten.** `onConflictDoNothing({ target:
 * staff.userId })`, for the same reason the password is never re-asserted: an
 * administrator who renames the Principal to "Mrs Perera" must not find the
 * name silently reverted to "Principal" on the next restart, and a school that
 * fills in a NIC or a service number for the seat must not have it cleared.
 * Only a *missing* row is repaired.
 *
 * `nic` is left `null`. The column is `text("nic").unique()` and therefore
 * nullable; every ordinary staff member's NIC is their login username, but
 * these seats are the documented exception (`usernameForNic` below) and there
 * is no honest 10-digit identity to invent for them.
 *
 * `employmentStatus` is left `null` rather than asserted as `"active"`. The
 * widened guard in `listStaff` and in `teacher-eligibility.ts` accepts
 * `"active"` *or* null, and null means "nobody has confirmed this yet" — which
 * is the accurate description of a seeded account's employment. Asserting
 * `"active"` would be the seeder claiming a fact about a real person's job that
 * no human in the school has confirmed, and the only reader that would benefit
 * is the teaching roster, which this row is excluded from anyway.
 *
 * Runs on every server start, so it is idempotent by profile, not by
 * credential — see the password guard in the body for why the password is the
 * one field that is never re-asserted.
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

  let userId: string;

  if (existing) {
    // Re-assert the profile fields on every start: an account seeded under an
    // older scheme (a synthetic internal email) settles onto the current
    // address, and a role changed in the database is restored to the one the
    // seat is defined with. `banned` is deliberately **not** in this set — a
    // seat an administrator has banned must stay banned across a restart.
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

    // **The existing password is left alone, always.** This is the whole
    // point of the guard. A password that is re-derived from env on every
    // boot looks like a feature — "env stays the source of truth" — and it is
    // a security hole wearing that as a disguise: a password changed through
    // `/account` is silently reverted on the next restart, so an administrator
    // who rotated a compromised credential believes the rotation took while
    // the old value still opens the account. It also means the deployment's
    // `.env` is a standing master key for three named accounts, forever,
    // rather than the value that was used once to create them.
    //
    // A missing credential row is a different case and is repaired: that is
    // the account-creation path, not a reset, and an account with no password
    // row cannot sign in at all.
    if (!existingAccount) {
      const hash = await hashPassword(password);
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
    const hash = await hashPassword(password);
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

  // The `staff` row for this seat. Deliberately outside both branches above:
  // whether the account was created now or already existed, the person is
  // entitled to a staff record, and doing it once after the `user` row is
  // settled keeps a single code path for it.
  //
  // `onConflictDoNothing` on `userId` is the whole safety property, and it is
  // the same argument as the password guard: this statement *creates* and never
  // *asserts*. The conflict target is the unique index on `staff.userId`, so
  // the statement is a no-op the moment the row exists, and every field a
  // school may legitimately have edited in the meantime — the name above all —
  // survives. A `do update set name = excluded.name` here is indistinguishable
  // from a feature ("the seed keeps the name current") right up to the morning
  // an administrator renames the Principal and it comes back.
  const [createdStaff] = await database
    .insert(staff)
    .values({
      id: seededStaffId(accountUsername),
      name,
      email: accountEmail,
      userId,
      // See the doc comment: this is what keeps the row off every teaching
      // surface. Changing it to "teacher" is not a cosmetic change — it puts
      // the seat in the roster, the attendance register and the teacher export.
      staffCategory: SEEDED_STAFF_CATEGORY,
      // `nic` and `employmentStatus` are left null on purpose; see the doc
      // comment above for why neither is invented.
    })
    .onConflictDoNothing({ target: staff.userId })
    .returning({ id: staff.id });

  console.log(`[auth] Ensured ${role} account (${accountUsername})`);
  console.log(
    createdStaff
      ? `[auth] Created ${SEEDED_STAFF_CATEGORY} staff row (${createdStaff.id})`
      : `[auth] Staff row present for ${accountUsername}; left exactly as found`
  );
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
 * has since confirmed. Deleting a user cascades to their sessions and accounts.
 *
 * It does **not** remove the `staff` row a self-registered teacher created:
 * `staff.userId` is `ON DELETE SET NULL`, so the person is left as an unlinked
 * staff record rather than a deleted one. That is deliberate — the record holds
 * real personal data an administrator may want to keep or re-link — and the
 * dialog says so, because the previous comment here claimed the opposite and
 * told a future reader the sweep was tidier than it is.
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
 * Seeds the eight default inventory categories, mirroring
 * `api/routers/inventory/seed-categories.ts` exactly: one `insert` carrying
 * all eight values, and `onConflictDoNothing` on the
 * `inventoryCategory.normalizedName` unique index.
 *
 * **On boot, not behind a button — that is the point.** The storekeeper's first
 * act is registering the projector they were just handed, and the category
 * picker on the item form is populated from this table. Behind a button, the
 * first run of a fresh install hits an empty picker and the eight categories
 * get typed in by hand, one dialog at a time, with colours that then disagree
 * with the constants forever. `DEFAULT_INVENTORY_CATEGORIES` has carried the
 * comment "so a school never starts with an empty category picker" since the
 * schema landed; this is the code that makes that sentence true, and it is
 * idempotent, so a button was never needed.
 *
 * **Cheap enough to run on every start.** That is the only property that
 * matters for a boot-path statement: eight values in one statement, one
 * conflict clause, no read-back, no transaction, no per-row work. After the
 * first boot it is a no-op the database resolves from a unique index.
 *
 * **It skips, it never overwrites.** Same rule as the seeded `staff` row and
 * for the same reason: a school that has renamed `Furniture` to `Computing`, or
 * repainted `Audio Visual` to match its own palette, keeps that. A
 * `do update set color = excluded.color` would quietly repaint the school the
 * first time anything triggered a second run.
 *
 * `normalizedName` is recomputed with `normalizeInventoryKey` rather than read
 * off the constant, for the reason `seed-categories.ts` gives: a seeder that
 * lowercases differently from the API writes a key the API would then refuse to
 * re-create.
 */
const ensureInventoryCategories = async (database: Database) => {
  const created = await database
    .insert(inventoryCategory)
    .values(
      DEFAULT_INVENTORY_CATEGORIES.map((entry) => ({
        id: crypto.randomUUID(),
        name: entry.name,
        normalizedName: normalizeInventoryKey(entry.name),
        color: entry.color,
      }))
    )
    .onConflictDoNothing({ target: inventoryCategory.normalizedName })
    .returning({ normalizedName: inventoryCategory.normalizedName });

  console.log(
    created.length === 0
      ? "[auth] Inventory categories already present"
      : `[auth] Seeded ${created.length} inventory categories`
  );
};

/**
 * Bootstraps the admin, Principal and Deputy Principal accounts from env, and
 * the inventory register's default categories.
 *
 * Runs on every server start, so a missing account is created and a changed
 * role, name or address is restored. It does **not** re-assert a password that
 * already exists, nor overwrite a `staff` row a school has edited — see
 * `ensureBootstrapAccount` for why, and for how to reset one deliberately.
 *
 * The category seed runs after the three accounts, and therefore after
 * `Promise.all` settles: a boot that failed to create a seat has already told
 * the operator so, and the log lines stay readable in the order the work
 * happened rather than interleaved from three concurrent tasks.
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

  await ensureInventoryCategories(database);
};
