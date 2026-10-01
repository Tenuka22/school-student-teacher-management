/**
 * Rotates a seeded seat's password to the value currently in the environment,
 * and signs that seat out everywhere.
 *
 * The env password of a seat is its *initial* password only: boot never
 * overwrites an existing credential (`ensureBootstrapAccount` in
 * packages/auth/src/admin.ts), so changing `.env` alone does nothing to a seat
 * that already exists. This is the deliberate, one-seat way to do it — used to
 * retire a password that leaked (forensic audit F-03).
 *
 *   bun --env-file=apps/web/.env scripts/rotate-seat-password.ts academic-admin
 *
 * Prints the username and the number of sessions revoked; never the password.
 */
import { seatPasswordProblem } from "@school-student-teacher-management/auth/seat-password-policy";
import { hashPassword } from "better-auth/crypto";
import { Client } from "pg";

const ENV_KEY_BY_SEAT: Record<string, string> = {
  admin: "ADMIN_PASSWORD",
  principal: "PRINCIPAL_PASSWORD",
  "inventory-admin": "INVENTORY_ADMIN_PASSWORD",
  "academic-admin": "ACADEMIC_ADMIN_PASSWORD",
  "leave-admin": "LEAVE_ADMIN_PASSWORD",
};

const seat = process.argv[2] ?? "";
const envKey = ENV_KEY_BY_SEAT[seat];
if (!envKey) {
  throw new Error(
    `Usage: rotate-seat-password.ts <${Object.keys(ENV_KEY_BY_SEAT).join("|")}>`
  );
}

const password = process.env[envKey];
if (!password) {
  throw new Error(`${envKey} is not set`);
}
const problem = seatPasswordProblem(password);
if (problem) {
  throw new Error(`${envKey} ${problem}; choose another before rotating`);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  const { rows } = await client.query<{ id: string }>(
    `select id from "user" where username = $1`,
    [seat]
  );
  const userId = rows[0]?.id;
  if (!userId) {
    throw new Error(
      `No account with username "${seat}" — boot once to create it`
    );
  }
  const updated = await client.query(
    `update account set password = $1, updated_at = now()
      where user_id = $2 and provider_id = 'credential'`,
    [await hashPassword(password), userId]
  );
  if (updated.rowCount !== 1) {
    throw new Error(`"${seat}" has no credential account to rotate`);
  }
  const revoked = await client.query(`delete from session where user_id = $1`, [
    userId,
  ]);
  await client.query("COMMIT");
  console.log(
    `rotated ${seat}: password replaced from ${envKey}, ${revoked.rowCount} session(s) revoked`
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
