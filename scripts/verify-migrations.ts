/**
 * Migration gate: proves the checked-in migration history builds a database
 * from nothing.
 *
 * Creates a throwaway database on the server `DATABASE_URL` points at, runs
 * drizzle's own migrator over `packages/db/src/migrations` (the same code path
 * `db:migrate` takes), then drops the database again — whether the run passed
 * or not. It never touches the database named in `DATABASE_URL` itself, only
 * the server it lives on.
 *
 * Exit code 0 means "an empty PostgreSQL reaches the latest schema with zero
 * errors". CI runs this before `drizzle-kit generate` is asked whether the
 * schema files have drifted from the last snapshot (see `.github/workflows`).
 *
 *   bun scripts/verify-migrations.ts            # create, migrate, drop
 *   bun scripts/verify-migrations.ts --keep     # leave the database for inspection
 */
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

const MIGRATIONS_FOLDER = path.join(
  import.meta.dir,
  "../packages/db/src/migrations"
);

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Point it at any database on the server to test against; a scratch database is created beside it."
  );
}

const keep = process.argv.includes("--keep");
const scratchName = `migrate_check_${Date.now()}`;
const serverUrl = new URL(baseUrl);
serverUrl.pathname = "/postgres";
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

const server = new Client({ connectionString: serverUrl.toString() });
await server.connect();
await server.query(`CREATE DATABASE "${scratchName}"`);
console.log(`created ${scratchName}`);

let failed = false;
const pool = new Pool({ connectionString: scratchUrl.toString(), max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations"
  );
  console.log(`migrated: ${rows[0]?.count} migrations applied from zero`);
} catch (error) {
  failed = true;
  const { cause } = error as { cause?: { message?: string } };
  console.error(
    `MIGRATION FAILED: ${cause?.message ?? (error as Error).message}`
  );
} finally {
  await pool.end();
  if (keep) {
    console.log(`kept ${scratchName} (--keep)`);
  } else {
    await server.query(`DROP DATABASE "${scratchName}" WITH (FORCE)`);
    console.log(`dropped ${scratchName}`);
  }
  await server.end();
}

process.exit(failed ? 1 : 0);
