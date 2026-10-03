import { afterAll, beforeAll, describe, expect, test } from "bun:test";
/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * M11 regression: migration 0011 (`files.key` → `files.data`) on databases
 * that already hold uploaded files, and the backfill that copies the bytes in.
 *
 * Each test builds a scratch database **through 0010 only**, inserts rows in
 * the pre-0011 shape, and then runs the real migrator over the real folder —
 * exactly what `db:migrate` or the container's `migrate.mjs` would do on an
 * existing deployment. The original 0011 failed every populated case here
 * (`column "data" … contains null values`); had it been forced through, it
 * would have dropped every object key before a single image was copied.
 */
import {
  cpSync,
  mkdirSync,
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

import { backfillFileBytes } from "../../../scripts/backfill-file-bytes";
import type { FetchObject } from "../../../scripts/backfill-file-bytes";
import { HARNESS_TIMEOUT_MS } from "./support/harness";

const MIGRATIONS = path.join(import.meta.dir, "../../db/src/migrations");
const BEFORE_0011 = 11;

let throughTen: string;
let server: Client;

/** A copy of the migrations folder whose journal stops before 0011. */
const buildThroughTenFolder = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "m11-"));
  mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf-8")
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx < BEFORE_0011);
  for (const entry of journal.entries) {
    cpSync(
      path.join(MIGRATIONS, `${entry.tag}.sql`),
      path.join(dir, `${entry.tag}.sql`)
    );
  }
  writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  return dir;
};

interface Scratch {
  pool: Pool;
  close: () => Promise<void>;
}

/** A database migrated through 0010, as an existing deployment would be. */
const scratchAt0010 = async (): Promise<Scratch> => {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL is not set");
  }
  const name = `m11_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await server.query(`CREATE DATABASE "${name}"`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 2 });
  await migrate(drizzle(pool), { migrationsFolder: throughTen });
  await pool.query(
    `insert into "user" (id, name, email) values ('u1', 'Uploader', 'u1@example.com')`
  );
  return {
    pool,
    close: async () => {
      await pool.end();
      await server.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    },
  };
};

const bytesFor = (index: number) =>
  new Uint8Array(
    Array.from({ length: 64 + index }, (_, i) => (i * 7 + index) % 256)
  );

/** Inserts `count` rows in the pre-0011 shape; returns their keys → bytes. */
const insertLegacyFiles = async (pool: Pool, count: number) => {
  const store = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index += 1) {
    const key = `inventory/${index}.webp`;
    const bytes = bytesFor(index);
    store.set(key, bytes);
    // oxlint-disable-next-line no-await-in-loop -- fixture setup
    await pool.query(
      `insert into "files" (id, name, size, type, key, user_id)
       values ($1, $2, $3, 'image/webp', $4, 'u1')`,
      [`f${index}`, `${index}.webp`, bytes.byteLength, key]
    );
  }
  return store;
};

const fetcherFrom =
  (store: Map<string, Uint8Array>): FetchObject =>
  (key) =>
    Promise.resolve(store.get(key) ?? null);

const migrateToLatest = async (pool: Pool): Promise<string> => {
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
    return "OK";
  } catch (error) {
    const { cause } = error as { cause?: { message?: string } };
    return cause?.message ?? (error as Error).message;
  }
};

const columnsOfFiles = async (pool: Pool) => {
  const { rows } = await pool.query<{
    column_name: string;
    is_nullable: string;
  }>(
    `select column_name, is_nullable from information_schema.columns
     where table_name = 'files' and column_name in ('key', 'data')`
  );
  return Object.fromEntries(
    rows.map((row) => [row.column_name, row.is_nullable])
  );
};

beforeAll(async () => {
  throughTen = buildThroughTenFolder();
  const admin = new URL(process.env.DATABASE_URL ?? "");
  admin.pathname = "/postgres";
  server = new Client({ connectionString: admin.toString() });
  await server.connect();
}, HARNESS_TIMEOUT_MS);

afterAll(async () => {
  await server?.end();
  rmSync(throughTen, { recursive: true, force: true });
}, HARNESS_TIMEOUT_MS);

describe("migration 0011 on existing databases (M11)", () => {
  test(
    "empty files table: migrates straight through",
    async () => {
      const db = await scratchAt0010();
      try {
        expect(await migrateToLatest(db.pool)).toBe("OK");
        expect(await columnsOfFiles(db.pool)).toEqual({ data: "NO" });
      } finally {
        await db.close();
      }
    },
    HARNESS_TIMEOUT_MS
  );

  test(
    "one file, not yet copied: refused, nothing changed, key intact",
    async () => {
      const db = await scratchAt0010();
      try {
        await insertLegacyFiles(db.pool, 1);
        const result = await migrateToLatest(db.pool);
        expect(result).toContain("1 row(s)");
        expect(result).toContain("nothing was changed");
        // Rolled back as one transaction: no "data", "key" still there.
        expect(await columnsOfFiles(db.pool)).toEqual({ key: "NO" });
        const { rows } = await db.pool.query(`select key from files`);
        expect(rows).toEqual([{ key: "inventory/0.webp" }]);
      } finally {
        await db.close();
      }
    },
    HARNESS_TIMEOUT_MS
  );

  test(
    "one file: backfill, then migrate, bytes preserved",
    async () => {
      const db = await scratchAt0010();
      try {
        const store = await insertLegacyFiles(db.pool, 1);
        const report = await backfillFileBytes({
          pool: db.pool,
          fetchObject: fetcherFrom(store),
          apply: true,
        });
        expect(report).toMatchObject({ total: 1, copied: 1, problems: [] });
        expect(await migrateToLatest(db.pool)).toBe("OK");
        const { rows } = await db.pool.query<{ data: Buffer }>(
          `select data from files where id = 'f0'`
        );
        expect(new Uint8Array(rows[0]?.data ?? [])).toEqual(bytesFor(0));
        expect(await columnsOfFiles(db.pool)).toEqual({ data: "NO" });
      } finally {
        await db.close();
      }
    },
    HARNESS_TIMEOUT_MS
  );

  test(
    "many files: every byte arrives, counts verified",
    async () => {
      const db = await scratchAt0010();
      try {
        const store = await insertLegacyFiles(db.pool, 40);
        const report = await backfillFileBytes({
          pool: db.pool,
          fetchObject: fetcherFrom(store),
          apply: true,
        });
        expect(report).toMatchObject({ total: 40, copied: 40, problems: [] });
        expect(await migrateToLatest(db.pool)).toBe("OK");
        const { rows } = await db.pool.query<{
          id: string;
          data: Buffer;
          size: number;
        }>(`select id, data, size from files order by id`);
        expect(rows).toHaveLength(40);
        for (const row of rows) {
          const index = Number(row.id.slice(1));
          expect(new Uint8Array(row.data)).toEqual(bytesFor(index));
          expect(row.data.byteLength).toBe(row.size);
        }
      } finally {
        await db.close();
      }
    },
    HARNESS_TIMEOUT_MS
  );

  test(
    "a missing source object: reported, migration refused, nothing lost",
    async () => {
      const db = await scratchAt0010();
      try {
        const store = await insertLegacyFiles(db.pool, 3);
        store.delete("inventory/1.webp");
        const report = await backfillFileBytes({
          pool: db.pool,
          fetchObject: fetcherFrom(store),
          apply: true,
        });
        expect(report.copied).toBe(2);
        expect(report.problems).toEqual([
          { id: "f1", key: "inventory/1.webp", reason: "object not found" },
        ]);
        const result = await migrateToLatest(db.pool);
        expect(result).toContain("1 row(s)");
        // Every row and every key is still there to retry from.
        const { rows } = await db.pool.query(
          `select id, key, data is not null as filled from files order by id`
        );
        expect(rows).toEqual([
          { id: "f0", key: "inventory/0.webp", filled: true },
          { id: "f1", key: "inventory/1.webp", filled: false },
          { id: "f2", key: "inventory/2.webp", filled: true },
        ]);
      } finally {
        await db.close();
      }
    },
    HARNESS_TIMEOUT_MS
  );

  test(
    "a truncated object is refused by the backfill and by the migration",
    async () => {
      const db = await scratchAt0010();
      try {
        const store = await insertLegacyFiles(db.pool, 2);
        store.set("inventory/0.webp", bytesFor(0).slice(0, 10));
        const report = await backfillFileBytes({
          pool: db.pool,
          fetchObject: fetcherFrom(store),
          apply: true,
        });
        expect(report.problems[0]?.reason).toContain("row records");
        // Even bytes written out of band must match the recorded size.
        await db.pool.query(`update files set data = '\\x00' where id = 'f0'`);
        const result = await migrateToLatest(db.pool);
        expect(result).toContain("differs from their recorded size");
        expect(await columnsOfFiles(db.pool)).toMatchObject({ key: "NO" });
      } finally {
        await db.close();
      }
    },
    HARNESS_TIMEOUT_MS
  );

  test(
    "interrupted backfill, re-run, and re-run migration: no corruption",
    async () => {
      const db = await scratchAt0010();
      try {
        const store = await insertLegacyFiles(db.pool, 5);
        let reads = 0;
        const flaky: FetchObject = (key) => {
          reads += 1;
          if (reads === 3) {
            return Promise.reject(new Error("connection reset"));
          }
          return fetcherFrom(store)(key);
        };
        const first = await backfillFileBytes({
          pool: db.pool,
          fetchObject: flaky,
          apply: true,
        });
        expect(first.copied).toBe(4);
        expect(first.problems[0]?.reason).toContain("connection reset");

        const second = await backfillFileBytes({
          pool: db.pool,
          fetchObject: fetcherFrom(store),
          apply: true,
        });
        expect(second).toMatchObject({
          copied: 1,
          alreadyFilled: 4,
          problems: [],
        });

        expect(await migrateToLatest(db.pool)).toBe("OK");
        expect(await migrateToLatest(db.pool)).toBe("OK");
        const third = await backfillFileBytes({
          pool: db.pool,
          fetchObject: fetcherFrom(store),
          apply: true,
        });
        expect(third.alreadyMigrated).toBe(true);
        const { rows } = await db.pool.query<{ id: string; data: Buffer }>(
          `select id, data from files order by id`
        );
        for (const row of rows) {
          expect(new Uint8Array(row.data)).toEqual(
            bytesFor(Number(row.id.slice(1)))
          );
        }
      } finally {
        await db.close();
      }
    },
    HARNESS_TIMEOUT_MS
  );

  test(
    "a dry run changes nothing",
    async () => {
      const db = await scratchAt0010();
      try {
        const store = await insertLegacyFiles(db.pool, 2);
        const report = await backfillFileBytes({
          pool: db.pool,
          fetchObject: fetcherFrom(store),
          apply: false,
        });
        expect(report.copied).toBe(2);
        expect(await columnsOfFiles(db.pool)).toEqual({ key: "NO" });
      } finally {
        await db.close();
      }
    },
    HARNESS_TIMEOUT_MS
  );
});
