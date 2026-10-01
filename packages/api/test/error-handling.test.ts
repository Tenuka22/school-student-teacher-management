/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * F-06 / F-34 regression: database errors become client-safe responses and
 * PII-free log lines.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ORPCError } from "@orpc/server";
import { staff } from "@school-student-teacher-management/db/schema/staff";

import { isUniqueViolation, pgErrorOf } from "../src/lib/db-errors";
import { logServerError } from "../src/lib/log";
import { HARNESS_TIMEOUT_MS, createHarness } from "./support/harness";
import type { Harness } from "./support/harness";

let harness: Harness;
const NIC = "198811112222";
let duplicateCalls = 0;
const EMAIL = "private.person@example.com";

/** A real DrizzleQueryError whose parameters carry a NIC and an email. */
const duplicateNicError = async (): Promise<unknown> => {
  // A fresh NIC per call: the first insert must succeed for the second to be
  // the duplicate. The PII assertion below checks this exact value.
  duplicateCalls += 1;
  const nic = `${NIC.slice(0, -1)}${duplicateCalls}`;
  const row = {
    id: crypto.randomUUID(),
    name: "Private Person",
    nic,
    email: EMAIL,
    staffCategory: "teacher" as const,
  };
  await harness.db.insert(staff).values(row);
  try {
    await harness.db
      .insert(staff)
      .values({ ...row, id: crypto.randomUUID(), email: "other@example.com" });
  } catch (error) {
    return error;
  }
  throw new Error("expected a unique violation");
};

beforeAll(async () => {
  harness = await createHarness();
}, HARNESS_TIMEOUT_MS);

afterAll(async () => {
  await harness?.close();
}, HARNESS_TIMEOUT_MS);

describe("structured database errors (F-06)", () => {
  test("the SQLSTATE and constraint are read from the cause, not the message", async () => {
    const error = await duplicateNicError();
    // The message is the SQL and its parameters — and no constraint name,
    // which is why matching on it never worked.
    expect((error as Error).message).not.toContain("staff_nic_unique");
    expect(pgErrorOf(error)).toEqual({
      code: "23505",
      constraint: "staff_nic_unique",
    });
    expect(isUniqueViolation(error, "staff_nic_unique")).toBe(true);
    expect(isUniqueViolation(error, "some_other_constraint")).toBe(false);
  });
});

describe("logging (F-34)", () => {
  test("a database error is logged by SQLSTATE, never by its parameters", async () => {
    const error = await duplicateNicError();
    // The NIC really is in the driver error (its parameters), which is the
    // whole reason the raw error must never be logged.
    const nicInError = (error as Error).message.match(/\d{12}/u)?.[0];
    expect(nicInError).toBeDefined();
    const lines: string[] = [];
    logServerError(
      error,
      { requestId: "req-1", userId: "u-1", path: ["staff", "createStaff"] },
      (line) => lines.push(line)
    );
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "";
    expect(line).not.toContain(nicInError ?? NIC);
    expect(line).not.toContain("private.person");
    expect(JSON.parse(line)).toMatchObject({
      level: "error",
      requestId: "req-1",
      userId: "u-1",
      path: "staff.createStaff",
      error: {
        kind: "database",
        sqlstate: "23505",
        constraint: "staff_nic_unique",
      },
    });
  });

  test("an expected client error is a warning without detail", () => {
    const lines: string[] = [];
    logServerError(
      new ORPCError("CONFLICT", {
        message: "A staff member with this NIC already exists",
      }),
      { requestId: "req-2" },
      (line) => lines.push(line)
    );
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      level: "warn",
      error: { kind: "application", code: "CONFLICT" },
    });
  });
});
