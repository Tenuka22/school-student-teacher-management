/**
 * Integration-test harness: a real PostgreSQL database per test file, built
 * by the same migrator production uses, a real better-auth instance over it,
 * and the real oRPC router called with the session better-auth resolves from
 * a real sign-in cookie. Nothing is mocked: the point of these tests is the
 * behaviour of the actual guards, transactions and constraints.
 *
 * Needs `DATABASE_URL` pointing at any database on a server the test may
 * `CREATE DATABASE` on; a scratch `test_<random>` database is created beside
 * it and dropped afterwards. Run with `bun run test` from the repo root.
 */
import path from "node:path";

import { createRouterClient } from "@orpc/server";
import {
  createAuth,
  ensureBootstrapUsers,
} from "@school-student-teacher-management/auth";
import type { AuthConfig } from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";
import type { Database } from "@school-student-teacher-management/db";
import { LATEST_STRUCTURE_VERSION_KEY } from "@school-student-teacher-management/db/constants/structureVersions/index";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

import type { Context, Session } from "../../src/context";
import { appRouter } from "../../src/routers/index";

const MIGRATIONS = path.join(import.meta.dir, "../../../db/src/migrations");

export const BASE_URL = "http://localhost:3001";

/**
 * For `beforeAll`/`afterAll` around `createHarness`: creating a database and
 * applying every migration takes longer than Bun's 5 s hook default when
 * several suites do it at once.
 */
export const HARNESS_TIMEOUT_MS = 120_000;

/** Seeded-seat passwords for tests only; never a deployment value. */
export const TEST_PASSWORDS = {
  admin: "Test-admin-password-1",
  principal: "Test-principal-password-1",
  "inventory-admin": "Test-inventory-password-1",
  "academic-admin": "Test-academic-password-1",
  "leave-admin": "Test-leave-password-1",
} as const;

export type SeatUsername = keyof typeof TEST_PASSWORDS;

const authConfig: AuthConfig = {
  BETTER_AUTH_URL: BASE_URL,
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0001",
  ADMIN_PASSWORD: TEST_PASSWORDS.admin,
  PRINCIPAL_PASSWORD: TEST_PASSWORDS.principal,
  INVENTORY_ADMIN_PASSWORD: TEST_PASSWORDS["inventory-admin"],
  ACADEMIC_ADMIN_PASSWORD: TEST_PASSWORDS["academic-admin"],
  LEAVE_ADMIN_PASSWORD: TEST_PASSWORDS["leave-admin"],
};

export interface Harness {
  db: Database;
  auth: ReturnType<typeof createAuth>;
  /** Raw SQL on the scratch database, for fixtures and assertions. */
  sql: Pool;
  /** Connection string of the scratch database, for child processes. */
  url: string;
  close: () => Promise<void>;
}

const serverUrl = () => {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      "DATABASE_URL is not set — integration tests need a PostgreSQL server (see packages/api/test/support/harness.ts)"
    );
  }
  return base;
};

export const createHarness = async (): Promise<Harness> => {
  const name = `test_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const admin = new URL(serverUrl());
  admin.pathname = "/postgres";
  const scratch = new URL(serverUrl());
  scratch.pathname = `/${name}`;

  const server = new Client({ connectionString: admin.toString() });
  await server.connect();
  await server.query(`CREATE DATABASE "${name}"`);

  const db = createDb({ DATABASE_URL: scratch.toString() } as never);
  await migrate(db, { migrationsFolder: MIGRATIONS });
  const auth = createAuth(authConfig, db);
  await ensureBootstrapUsers(db, authConfig);
  const sql = new Pool({ connectionString: scratch.toString(), max: 4 });

  return {
    db,
    auth,
    sql,
    url: scratch.toString(),
    close: async () => {
      await sql.end();
      await (db as unknown as { $client: Pool }).$client.end();
      await server.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await server.end();
    },
  };
};

/** POSTs JSON to a better-auth path through the real handler. */
export const authRequest = (
  harness: Harness,
  endpoint: string,
  body: unknown,
  cookie?: string
): Promise<Response> =>
  harness.auth.handler(
    new Request(`${BASE_URL}/api/auth${endpoint}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    })
  );

/** Signs in through `/sign-in/username` and returns the cookie header. */
export const signIn = async (
  harness: Harness,
  username: string,
  password: string
): Promise<string> => {
  const response = await authRequest(harness, "/sign-in/username", {
    username,
    password,
  });
  if (!response.ok) {
    throw new Error(
      `sign-in as ${username} failed: ${response.status} ${await response.text()}`
    );
  }
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
};

export const signInSeat = (harness: Harness, seat: SeatUsername) =>
  signIn(harness, seat, TEST_PASSWORDS[seat]);

/** An oRPC client acting as whoever `cookie` belongs to (or anonymous). */
export const clientFor = async (harness: Harness, cookie?: string) => {
  const session = cookie
    ? ((await harness.auth.api.getSession({
        headers: new Headers({ cookie }),
      })) as unknown as Session | null)
    : null;
  const context: Context = { db: harness.db, auth: harness.auth, session };
  return createRouterClient(appRouter, { context });
};

/** The error code an oRPC call rejected with, or `"OK"`. */
export const outcome = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
};

let nicSequence = 0;
/** A fresh, valid 12-digit NIC per call. */
export const nextNic = () => {
  nicSequence += 1;
  return `19900000${String(nicSequence).padStart(4, "0")}`;
};

/**
 * A teacher created the way the school creates one (`staff.createStaff` as
 * the administrator), signed in, with an oRPC client of their own.
 */
export const createTeacher = async (harness: Harness, name = "Teacher") => {
  const admin = await clientFor(harness, await signInSeat(harness, "admin"));
  const created = await admin.staff.createStaff({
    name,
    nic: nextNic(),
    staffCategory: "teacher",
    gender: "female",
  } as never);
  const cookie = await signIn(
    harness,
    created.loginUsername,
    created.initialPassword
  );
  return {
    staffId: created.id,
    username: created.loginUsername,
    cookie,
    client: await clientFor(harness, cookie),
  };
};

/** Creates a current academic year through the real procedure. */
export const openCurrentYear = async (harness: Harness, year = 2026) => {
  const admin = await clientFor(harness, await signInSeat(harness, "admin"));
  return admin.staff.createAcademicYear({
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    structureVersionKey: LATEST_STRUCTURE_VERSION_KEY,
  });
};
