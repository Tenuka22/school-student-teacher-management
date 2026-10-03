/**
 * Copies uploaded photos out of the retired MinIO bucket into `files.data`,
 * so migration 0011 can make that column NOT NULL and drop `files.key` (M11).
 *
 *   # dry run: reports what would be copied, changes nothing
 *   bun --env-file=apps/web/.env scripts/backfill-file-bytes.ts
 *   # copy
 *   bun --env-file=apps/web/.env scripts/backfill-file-bytes.ts --apply
 *
 * Needs `DATABASE_URL` and the old object-store settings (`MINIO_ENDPOINT`,
 * `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`,
 * `MINIO_BUCKET`) — the same values the app used before 203f827.
 *
 * What it does and does not do:
 *
 * - adds `files.data` as a NULLable column if it is missing (`--apply` only);
 * - for every row with no bytes, reads the object named by `files.key` and
 *   writes it **only if** its length equals the row's recorded `size`;
 * - never deletes a row, never drops `key`, never overwrites bytes already
 *   present — so it is safe to re-run after a partial or interrupted run;
 * - exits 1 and lists every row it could not fill (object missing, read
 *   failed, length mismatch). Migration 0011 refuses to run while any such
 *   row remains; what to do with a photo whose object is gone is a decision
 *   for a person, not for this script (docs/operations.md, "Migration 0011").
 *
 * Once `files.key` no longer exists (0011 has run), there is nothing to do and
 * the script says so.
 */
import { S3Client } from "bun";
import { Pool } from "pg";

export type FetchObject = (key: string) => Promise<Uint8Array | null>;

export interface BackfillProblem {
  id: string;
  key: string;
  reason: string;
}

export interface BackfillReport {
  /** `files.key` is gone: 0011 has already run. */
  alreadyMigrated: boolean;
  total: number;
  alreadyFilled: number;
  copied: number;
  problems: BackfillProblem[];
}

export const backfillFileBytes = async ({
  pool,
  fetchObject,
  apply,
}: {
  pool: Pool;
  fetchObject: FetchObject;
  apply: boolean;
}): Promise<BackfillReport> => {
  const { rows: columns } = await pool.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = current_schema() and table_name = 'files'
       and column_name in ('key', 'data')`
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has("key")) {
    return {
      alreadyMigrated: true,
      total: 0,
      alreadyFilled: 0,
      copied: 0,
      problems: [],
    };
  }
  if (apply && !names.has("data")) {
    await pool.query(
      `ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "data" bytea`
    );
    names.add("data");
  }

  const hasData = names.has("data");
  const { rows } = await pool.query<{
    id: string;
    key: string;
    size: number;
    filled: boolean;
  }>(
    `select id, key, size, ${hasData ? `"data" is not null` : "false"} as filled
     from "files" order by created_at`
  );

  const report: BackfillReport = {
    alreadyMigrated: false,
    total: rows.length,
    alreadyFilled: 0,
    copied: 0,
    problems: [],
  };

  for (const row of rows) {
    if (row.filled) {
      report.alreadyFilled += 1;
      continue;
    }
    let bytes: Uint8Array | null;
    try {
      // oxlint-disable-next-line no-await-in-loop -- one object at a time keeps memory flat
      bytes = await fetchObject(row.key);
    } catch (error) {
      report.problems.push({
        id: row.id,
        key: row.key,
        reason: `read failed: ${(error as Error).message}`,
      });
      continue;
    }
    if (!bytes) {
      report.problems.push({
        id: row.id,
        key: row.key,
        reason: "object not found",
      });
      continue;
    }
    if (bytes.byteLength !== row.size) {
      report.problems.push({
        id: row.id,
        key: row.key,
        reason: `object is ${bytes.byteLength} bytes, row records ${row.size}`,
      });
      continue;
    }
    if (apply) {
      // `data is null`: never overwrite bytes another run already wrote.
      // oxlint-disable-next-line no-await-in-loop -- see above
      await pool.query(
        `update "files" set "data" = $1 where id = $2 and "data" is null`,
        [Buffer.from(bytes), row.id]
      );
    }
    report.copied += 1;
  }
  return report;
};

const objectStoreFetcher = (): FetchObject => {
  const required = [
    "MINIO_ENDPOINT",
    "MINIO_PORT",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_BUCKET",
  ] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `The old object-store settings are needed to copy photos: ${missing.join(", ")}`
    );
  }
  const scheme = process.env.MINIO_USE_SSL === "true" ? "https" : "http";
  const client = new S3Client({
    endpoint: `${scheme}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
    bucket: process.env.MINIO_BUCKET,
    virtualHostedStyle: false,
  });
  const readObject: FetchObject = async (key) => {
    const file = client.file(key);
    if (!(await file.exists())) {
      return null;
    }
    return new Uint8Array(await file.arrayBuffer());
  };
  return readObject;
};

if (import.meta.main) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const apply = process.argv.includes("--apply");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const { rows } = await pool.query<{ count: string }>(
      `select count(*)::text as count from information_schema.columns
       where table_schema = current_schema() and table_name = 'files' and column_name = 'key'`
    );
    const needsStore = rows[0]?.count !== "0";
    const report = await backfillFileBytes({
      pool,
      apply,
      fetchObject: needsStore
        ? objectStoreFetcher()
        : () => Promise.resolve(null),
    });
    if (report.alreadyMigrated) {
      console.log(
        "files.key no longer exists: migration 0011 has already run. Nothing to do."
      );
    } else {
      console.log(
        `${apply ? "copied" : "would copy"} ${report.copied} of ${report.total} file(s); ${report.alreadyFilled} already had their bytes`
      );
      for (const problem of report.problems) {
        console.error(`  ${problem.id} (${problem.key}): ${problem.reason}`);
      }
      if (report.problems.length > 0) {
        console.error(
          `${report.problems.length} file(s) could not be copied. Migration 0011 will refuse to run until each is resolved.`
        );
        process.exitCode = 1;
      } else if (!apply) {
        console.log("Dry run. Re-run with --apply to copy.");
      }
    }
  } finally {
    await pool.end();
  }
}
