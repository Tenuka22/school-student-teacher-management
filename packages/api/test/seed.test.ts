/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
/**
 * F-11 / NEW-F-03 regression: the demo seed and the full reset seed, run as
 * the real scripts against a scratch database.
 */
import path from "node:path";

import { findLedgerMismatches } from "../src/lib/inventory-reconciliation";
import { HARNESS_TIMEOUT_MS, createHarness } from "./support/harness";
import type { Harness } from "./support/harness";

const ROOT = path.join(import.meta.dir, "../../..");

let harness: Harness;

const runScript = (script: string, env: Record<string, string>) => {
  const result = Bun.spawnSync(["bun", path.join(ROOT, "scripts", script)], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "development", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
};

const count = async (query: string) => {
  const { rows } = await harness.sql.query<{ n: string }>(query);
  return Number(rows[0]?.n);
};

beforeAll(async () => {
  harness = await createHarness();
}, HARNESS_TIMEOUT_MS);

afterAll(async () => {
  await harness?.close();
}, HARNESS_TIMEOUT_MS);

describe("demo seed (F-11)", () => {
  test("seeds a fresh database with a complete current year", async () => {
    const run = runScript("seed.ts", { DATABASE_URL: harness.url });
    expect(run.exitCode, run.output).toBe(0);
    expect(
      await count(`select count(*) n from academic_year where is_current`)
    ).toBe(1);
    // The year arrives with its policy and quotas, not as a bare row.
    expect(
      await count(
        `select count(*) n from attendance_policy p join academic_year y on y.id = p.academic_year_id where y.is_current`
      )
    ).toBe(1);
    expect(
      await count(
        `select count(*) n from leave_entitlement e join academic_year y on y.id = e.academic_year_id where y.is_current`
      )
    ).toBe(7);
    expect(await count(`select count(*) n from inventory_item`)).toBe(2);
    // Seeded stock is ledgered like any other (§11): the counters reconcile.
    expect(await findLedgerMismatches(harness.db)).toEqual([]);
  });

  test("a second run changes nothing", async () => {
    const before = await Promise.all([
      count(`select count(*) n from "user"`),
      count(`select count(*) n from staff`),
      count(`select count(*) n from inventory_item`),
      count(`select count(*) n from academic_year`),
      count(`select count(*) n from leave_entitlement`),
    ]);
    const run = runScript("seed.ts", { DATABASE_URL: harness.url });
    expect(run.exitCode, run.output).toBe(0);
    const after = await Promise.all([
      count(`select count(*) n from "user"`),
      count(`select count(*) n from staff`),
      count(`select count(*) n from inventory_item`),
      count(`select count(*) n from academic_year`),
      count(`select count(*) n from leave_entitlement`),
    ]);
    expect(after).toEqual(before);
  });

  test("refuses to run in production", () => {
    const run = runScript("seed.ts", {
      DATABASE_URL: harness.url,
      NODE_ENV: "production",
    });
    expect(run.exitCode).not.toBe(0);
    expect(run.output).toMatch(/Refusing to seed/u);
  });
});

describe("full reset seed (NEW-F-03)", () => {
  test("refuses to truncate without naming the database", async () => {
    const users = await count(`select count(*) n from "user"`);
    const run = runScript("seed-comprehensive.ts", {
      DATABASE_URL: harness.url,
      CONFIRM_RESET_DATABASE: "",
    });
    expect(run.exitCode).not.toBe(0);
    expect(run.output).toMatch(/CONFIRM_RESET_DATABASE=/u);
    // Nothing was wiped.
    expect(await count(`select count(*) n from "user"`)).toBe(users);
  });

  test(
    "with the database named, it resets and reseeds under the new constraints",
    async () => {
      const { rows } = await harness.sql.query<{ name: string }>(
        `select current_database() as name`
      );
      const run = runScript("seed-comprehensive.ts", {
        DATABASE_URL: harness.url,
        CONFIRM_RESET_DATABASE: rows[0]?.name ?? "",
        BETTER_AUTH_URL: "http://localhost:3001",
        BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0001",
        ADMIN_PASSWORD: "Seed-admin-password-1",
        PRINCIPAL_PASSWORD: "Seed-principal-password-1",
        INVENTORY_ADMIN_PASSWORD: "Seed-inventory-password-1",
        ACADEMIC_ADMIN_PASSWORD: "Seed-academic-password-1",
        LEAVE_ADMIN_PASSWORD: "Seed-leave-password-1",
      });
      expect(run.exitCode, run.output.slice(-2000)).toBe(0);
      expect(
        await count(`select count(*) n from academic_year where is_current`)
      ).toBe(1);
      // Its stock must reconcile with its ledger too (§11).
      expect(await findLedgerMismatches(harness.db)).toEqual([]);
    },
    { timeout: 300_000 }
  );
});
