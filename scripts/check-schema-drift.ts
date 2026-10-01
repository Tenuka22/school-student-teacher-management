/**
 * Drift gate: proves `packages/db/src/schema/*.ts` and the latest migration
 * snapshot describe the same database.
 *
 * Runs `drizzle-kit generate` against a temporary copy of the migrations
 * folder, so the real folder is never written to, and fails if drizzle-kit
 * produced a new migration. A schema edit committed without its migration (or
 * a hand-edited snapshot that no longer matches the schema) fails here instead
 * of surfacing as a surprise diff on someone else's machine.
 *
 *   bun scripts/check-schema-drift.ts
 */
import { cpSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const dbPackage = path.join(import.meta.dir, "../packages/db");
const migrations = path.join(dbPackage, "src/migrations");
// Relative to the db package, not the OS temp dir: drizzle-kit joins `--out`
// onto the working directory, so an absolute Windows path becomes
// `packages\db\C:\...` and the run fails while still exiting 0.
const scratchName = `.drift-check-${Date.now()}`;
const scratch = path.join(dbPackage, scratchName);

/** drizzle-kit's own all-clear line; anything else is not an all-clear. */
const NO_CHANGES = /No schema changes/u;

const countSql = (dir: string) =>
  readdirSync(dir).filter((name) => name.endsWith(".sql")).length;

try {
  cpSync(migrations, scratch, { recursive: true });
  const before = countSql(scratch);

  const result = Bun.spawnSync(
    [
      "bun",
      "x",
      "drizzle-kit",
      "generate",
      "--dialect",
      "postgresql",
      "--schema",
      "./src/schema",
      "--out",
      `./${scratchName}`,
    ],
    { cwd: dbPackage, stdout: "pipe", stderr: "pipe" }
  );
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  const after = countSql(scratch);

  if (after === before && !NO_CHANGES.test(output)) {
    // drizzle-kit can fail (ENOENT, a bad schema import) and still exit 0, so
    // the absence of both a new file and the all-clear is itself a failure.
    console.error(output);
    console.error(
      `drift check could not run: drizzle-kit exited ${result.exitCode} without reporting "No schema changes"`
    );
    process.exitCode = 1;
  } else if (after === before) {
    console.log("no schema drift: schema/*.ts matches the latest snapshot");
  } else {
    const added = readdirSync(scratch)
      .filter((name) => name.endsWith(".sql"))
      .toSorted()
      .slice(before);
    console.error(output);
    console.error(
      `SCHEMA DRIFT: drizzle-kit generated ${added.join(", ")}. Commit the migration with the schema change.`
    );
    process.exitCode = 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
