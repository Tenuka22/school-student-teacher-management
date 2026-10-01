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

if (!process.env.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("[migrate] database is up to date");
} catch (error) {
  console.error(`[migrate] failed: ${error?.cause?.message ?? error?.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
