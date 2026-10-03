// Applies pending migrations, then exits. Plain JavaScript so the Node runtime
// image can run it before the server starts (apps/web/Dockerfile); it uses the
// same drizzle migrator as `db:migrate` and `scripts/verify-migrations.ts`.
//
// The deploy used to start the server without migrating at all (forensic audit
// F-28), so a new release ran against whatever schema the last manual step
// left behind. drizzle applies the pending batch in one transaction and
// records each file, so running this on every start is idempotent: an
// up-to-date database is a no-op.
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const here = import.meta.dirname;
const migrationsFolder = path.join(here, "../packages/db/src/migrations");

// Migrations are DDL and run as the role that owns the tables
// (`MIGRATION_DATABASE_URL`); the server itself connects as a DML-only role
// (`DATABASE_URL`, see scripts/db-roles.ts, D1). A deployment that has not
// split the roles yet sets only `DATABASE_URL`, which is used for both.
const connectionString =
  process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "[migrate] neither MIGRATION_DATABASE_URL nor DATABASE_URL is set"
  );
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("[migrate] database is up to date");
} catch (error) {
  console.error(`[migrate] failed: ${error?.cause?.message ?? error?.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
