import { afterAll, beforeAll, describe, expect, test } from "bun:test";
/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * D1 regression: the application runs as a non-superuser that holds DML and
 * nothing else, with migrations run by the table owner.
 *
 * A database is created **owned by a fresh non-superuser role**, migrated as
 * that role (so no migration quietly needs a superuser), granted with
 * `scripts/db-roles.ts`, and then the real auth bootstrap and real
 * procedures run over a connection as the app role.
 */
import path from "node:path";

import {
  createAuth,
  ensureBootstrapUsers,
} from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";
import { LATEST_STRUCTURE_VERSION_KEY } from "@school-student-teacher-management/db/constants/structureVersions/index";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

import { appRoleGrants } from "../../../scripts/db-roles";
import {
  BASE_URL,
  HARNESS_TIMEOUT_MS,
  TEST_PASSWORDS,
  clientFor,
  nextNic,
  outcome,
  signInSeat,
} from "./support/harness";
import type { Harness } from "./support/harness";

const MIGRATIONS = path.join(import.meta.dir, "../../db/src/migrations");
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const OWNER = `lp_owner_${suffix}`;
const APP = `lp_app_${suffix}`;
const DATABASE = `lp_${suffix}`;
const OWNER_PASSWORD = `owner-${crypto.randomUUID()}`;
const APP_PASSWORD = `app-${crypto.randomUUID()}`;

let server: Client;
let ownerPool: Pool;
let appPool: Pool;
let harness: Harness;

const urlAs = (user: string, password: string) => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.username = user;
  url.password = password;
  url.pathname = `/${DATABASE}`;
  return url.toString();
};

/** Runs `sql` as the app role: `"OK"`, or the SQLSTATE it was refused with. */
const sqlStateOf = async (sql: string, params: unknown[] = []) => {
  try {
    await appPool.query(sql, params);
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? "error";
  }
};

beforeAll(async () => {
  const admin = new URL(process.env.DATABASE_URL ?? "");
  admin.pathname = "/postgres";
  server = new Client({ connectionString: admin.toString() });
  await server.connect();
  await server.query(
    `CREATE ROLE "${OWNER}" LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB PASSWORD '${OWNER_PASSWORD}'`
  );
  await server.query(
    `CREATE ROLE "${APP}" LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB PASSWORD '${APP_PASSWORD}'`
  );
  await server.query(`CREATE DATABASE "${DATABASE}" OWNER "${OWNER}"`);

  ownerPool = new Pool({
    connectionString: urlAs(OWNER, OWNER_PASSWORD),
    max: 1,
  });
  await migrate(drizzle(ownerPool), { migrationsFolder: MIGRATIONS });
  for (const statement of appRoleGrants({
    database: DATABASE,
    owner: OWNER,
    app: APP,
  })) {
    // oxlint-disable-next-line no-await-in-loop -- in order
    await ownerPool.query(statement);
  }

  const appUrl = urlAs(APP, APP_PASSWORD);
  const db = createDb({ DATABASE_URL: appUrl } as never);
  const config = {
    BETTER_AUTH_URL: BASE_URL,
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0002",
    ADMIN_PASSWORD: TEST_PASSWORDS.admin,
    PRINCIPAL_PASSWORD: TEST_PASSWORDS.principal,
    INVENTORY_ADMIN_PASSWORD: TEST_PASSWORDS["inventory-admin"],
    ACADEMIC_ADMIN_PASSWORD: TEST_PASSWORDS["academic-admin"],
    LEAVE_ADMIN_PASSWORD: TEST_PASSWORDS["leave-admin"],
  };
  // The boot path itself — seats, staff rows, categories — as the app role.
  await ensureBootstrapUsers(db, config);
  appPool = new Pool({ connectionString: appUrl, max: 2 });
  harness = {
    db,
    auth: createAuth(config, db),
    sql: appPool,
    url: appUrl,
    close: () => Promise.resolve(),
  };
}, HARNESS_TIMEOUT_MS);

afterAll(async () => {
  await appPool?.end();
  await (
    harness?.db as unknown as { $client?: Pool } | undefined
  )?.$client?.end();
  await ownerPool?.end();
  await server.query(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`);
  await server.query(`DROP ROLE IF EXISTS "${APP}"`);
  await server.query(`DROP ROLE IF EXISTS "${OWNER}"`);
  await server.end();
}, HARNESS_TIMEOUT_MS);

describe("least-privilege database roles (D1)", () => {
  test("the app connection is not a superuser and owns nothing", async () => {
    const { rows } = await appPool.query<{ su: boolean; owned: string }>(
      `select (select rolsuper from pg_roles where rolname = current_user) su,
              (select count(*)::text from pg_tables
                where schemaname = 'public' and tableowner = current_user) owned`
    );
    expect(rows[0]).toEqual({ su: false, owned: "0" });
  });

  test("the application's real work runs as the app role", async () => {
    const admin = await clientFor(harness, await signInSeat(harness, "admin"));
    const year = await admin.staff.createAcademicYear({
      year: 2026,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      structureVersionKey: LATEST_STRUCTURE_VERSION_KEY,
    });
    expect(year.isCurrent).toBe(true);
    const created = await admin.staff.createStaff({
      name: "Least Privilege",
      nic: nextNic(),
      staffCategory: "teacher",
      gender: "female",
    } as never);
    expect(
      await outcome(
        admin.staff.updateStaff({
          id: created.id,
          nic: created.nic,
          phone: "0771231234",
        } as never)
      )
    ).toBe("OK");
    expect(
      await outcome(
        admin.staff.assignPosition({
          staffId: created.id,
          academicYearId: year.id,
          position: "vicePrincipal",
          sectionalScope: null,
        } as never)
      )
    ).toBe("OK");
    // The audit middleware's insert is allowed.
    const { rows } = await appPool.query(
      `select 1 from account_audit_log where action = 'rpc:staff.assignPosition'`
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  test("the closed-year trigger still fires for the app role", async () => {
    const { rows } = await appPool.query<{ id: string }>(
      `select id from academic_year limit 1`
    );
    const yearId = rows[0]?.id;
    await ownerPool.query(
      `update academic_year set is_current = false, deleted_at = now() where id = $1`,
      [yearId]
    );
    expect(
      await sqlStateOf(
        `update attendance_policy set updated_at = now() where academic_year_id = $1`,
        [yearId]
      )
    ).toBe("YR001");
    await ownerPool.query(
      `update academic_year set deleted_at = null, is_current = true where id = $1`,
      [yearId]
    );
  });

  test("DDL, TRUNCATE and audit-trail edits are refused", async () => {
    // 42501 = insufficient_privilege; 42P01-style errors would mean a typo.
    expect(await sqlStateOf(`create table intruder (id int)`)).toBe("42501");
    expect(await sqlStateOf(`drop table staff`)).toBe("42501");
    expect(await sqlStateOf(`truncate staff`)).toBe("42501");
    expect(await sqlStateOf(`alter table staff disable trigger all`)).toBe(
      "42501"
    );
    expect(await sqlStateOf(`delete from account_audit_log`)).toBe("42501");
    expect(
      await sqlStateOf(`update account_audit_log set outcome = 'allowed'`)
    ).toBe("42501");
    expect(await sqlStateOf(`select * from drizzle.__drizzle_migrations`)).toBe(
      "42501"
    );
  });
});
