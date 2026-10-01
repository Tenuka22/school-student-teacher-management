/**
 * Baseline for a database that was built with `drizzle-kit push` (or by hand)
 * and therefore has no migration ledger.
 *
 * Such a database cannot simply run `db:migrate`: the migrator would replay
 * 0000 onto tables that already exist. This script decides, without guessing,
 * whether the database is exactly what migrations 0000..N would have produced,
 * and only then records 0000..N as applied so `db:migrate` continues from N+1.
 *
 *   bun --env-file=apps/web/.env scripts/baseline-existing-db.ts --through 0008
 *       read-only: builds a reference database from 0000..0008 on the same
 *       server, compares catalogs (tables, columns, types, nullability,
 *       defaults, constraints, indexes), prints every difference, drops the
 *       reference. Changes nothing.
 *
 *   ... --through 0008 --apply
 *       the same check; if and only if there is no difference, inserts the
 *       ledger rows for 0000..0008 in one transaction. Then run `db:migrate`.
 *
 * Back the database up first (`pg_dump`) regardless; see docs/operations.md.
 */
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

const MIGRATIONS = path.join(import.meta.dir, "../packages/db/src/migrations");

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const args = process.argv.slice(2);
const through = args[args.indexOf("--through") + 1];
const apply = args.includes("--apply");
if (!(args.includes("--through") && through && /^\d{4}$/u.test(through))) {
  throw new Error("Usage: baseline-existing-db.ts --through NNNN [--apply]");
}
const targetUrl = process.env.DATABASE_URL;
if (!targetUrl) {
  throw new Error("DATABASE_URL is not set");
}

const journal = JSON.parse(
  readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf-8")
) as { entries: JournalEntry[] };
const included = journal.entries.filter(
  (entry) => entry.tag.slice(0, 4) <= through
);
if (included.length === 0 || included.at(-1)?.tag.slice(0, 4) !== through) {
  throw new Error(`No migration ${through} in the journal`);
}

/** The catalog facts two databases must agree on, one line per fact. */
const CATALOG_QUERY = `
  select 'column ' || table_name || '.' || column_name || ' ' || data_type
         || ' null=' || is_nullable || ' default=' || coalesce(column_default, '-') as fact
    from information_schema.columns where table_schema = 'public'
  union all
  select 'constraint ' || rel.relname || '.' || con.conname || ' ' || pg_get_constraintdef(con.oid)
    from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace where ns.nspname = 'public'
  union all
  select 'index ' || indexname || ' ' || indexdef from pg_indexes where schemaname = 'public'
  order by 1`;

const catalogOf = async (url: string): Promise<Set<string>> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ fact: string }>(CATALOG_QUERY);
    return new Set(rows.map((row) => row.fact));
  } finally {
    await client.end();
  }
};

// 1. A reference database built from 0000..through, on the same server.
const referenceName = `baseline_ref_${Date.now()}`;
const serverUrl = new URL(targetUrl);
serverUrl.pathname = "/postgres";
const referenceUrl = new URL(targetUrl);
referenceUrl.pathname = `/${referenceName}`;

const folder = mkdtempSync(path.join(tmpdir(), "baseline-"));
cpSync(MIGRATIONS, folder, { recursive: true });
writeFileSync(
  path.join(folder, "meta/_journal.json"),
  JSON.stringify({ ...journal, entries: included }, null, 2)
);

const server = new Client({ connectionString: serverUrl.toString() });
await server.connect();
await server.query(`CREATE DATABASE "${referenceName}"`);
let differences: string[] = [];
try {
  const pool = new Pool({ connectionString: referenceUrl.toString(), max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: folder });
  await pool.end();

  // 2. Compare catalogs.
  const [reference, target] = await Promise.all([
    catalogOf(referenceUrl.toString()),
    catalogOf(targetUrl),
  ]);
  differences = [
    ...[...reference]
      .filter((fact) => !target.has(fact))
      .map((fact) => `missing in your database: ${fact}`),
    ...[...target]
      .filter((fact) => !reference.has(fact))
      .map((fact) => `extra in your database:   ${fact}`),
  ];
} finally {
  await server.query(`DROP DATABASE "${referenceName}" WITH (FORCE)`);
  await server.end();
  rmSync(folder, { recursive: true, force: true });
}

if (differences.length > 0) {
  console.error(
    `Your database is NOT what migrations 0000..${through} produce (${differences.length} difference(s)):`
  );
  for (const line of differences) {
    console.error(`  ${line}`);
  }
  console.error(
    "Nothing was changed. Reconcile these by hand (or restore into a fresh database built from the migrations), then re-run."
  );
  process.exit(1);
}

console.log(`Your database matches migrations 0000..${through} exactly.`);
if (!apply) {
  console.log(
    "Re-run with --apply to record them as applied. Nothing was changed."
  );
  process.exit(0);
}

// 3. Record the ledger rows exactly as drizzle's migrator would have.
const target = new Client({ connectionString: targetUrl });
await target.connect();
try {
  await target.query("BEGIN");
  await target.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await target.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`
  );
  const { rows } = await target.query<{ n: string }>(
    `select count(*)::text as n from drizzle.__drizzle_migrations`
  );
  if (Number(rows[0]?.n) > 0) {
    throw new Error(
      "The ledger already has rows; this database is not a push-built one"
    );
  }
  for (const entry of included) {
    const sql = readFileSync(
      path.join(MIGRATIONS, `${entry.tag}.sql`)
    ).toString();
    const hash = createHash("sha256").update(sql).digest("hex");
    // oxlint-disable-next-line no-await-in-loop -- one transaction, in journal order
    await target.query(
      `insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`,
      [hash, entry.when]
    );
  }
  await target.query("COMMIT");
  console.log(
    `Recorded ${included.length} migrations as applied. Now run: bun run db:migrate`
  );
} catch (error) {
  await target.query("ROLLBACK");
  throw error;
} finally {
  await target.end();
}
