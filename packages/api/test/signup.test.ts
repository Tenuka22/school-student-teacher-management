/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * F-17 / F-19 regression: the public sign-up procedure.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { createRouterClient } from "@orpc/server";
import { purgeUnverifiedAccounts } from "@school-student-teacher-management/auth";

import { appRouter } from "../src/routers/index";
import { resetSignupRateLimits } from "../src/routers/staff/signup";
import {
  HARNESS_TIMEOUT_MS,
  createHarness,
  nextNic,
  outcome,
} from "./support/harness";
import type { Harness } from "./support/harness";

let harness: Harness;
let sequence = 0;

/** An anonymous client whose requests appear to come from `address`. */
const anonymousFrom = (address: string) =>
  createRouterClient(appRouter, {
    context: {
      db: harness.db,
      auth: harness.auth,
      session: null,
      headers: new Headers({ "x-forwarded-for": address }),
    },
  });

const teacherSignup = (overrides: Record<string, unknown> = {}) => {
  sequence += 1;
  return {
    accountType: "teacher" as const,
    name: `Applicant ${sequence}`,
    nic: nextNic(),
    email: `applicant${sequence}@example.com`,
    password: "a-long-enough-password",
    ...overrides,
  };
};

beforeAll(async () => {
  harness = await createHarness();
}, HARNESS_TIMEOUT_MS);

beforeEach(() => {
  resetSignupRateLimits();
});

afterAll(async () => {
  await harness?.close();
}, HARNESS_TIMEOUT_MS);

describe("password policy (F-19)", () => {
  test("an 8-character password is no longer enough", async () => {
    const client = anonymousFrom("10.0.0.1");
    expect(
      await outcome(
        client.staff.signupStaff(teacherSignup({ password: "eight888" }))
      )
    ).toBe("BAD_REQUEST");
  });

  test("a 12-character password is accepted", async () => {
    const client = anonymousFrom("10.0.0.2");
    expect(await outcome(client.staff.signupStaff(teacherSignup()))).toBe("OK");
  });
});

describe("rate limit (F-19)", () => {
  test("the sixth sign-up from one address in ten minutes is refused", async () => {
    const client = anonymousFrom("10.0.0.3");
    const results: string[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- the order is the test
      results.push(await outcome(client.staff.signupStaff(teacherSignup())));
    }
    expect(results.slice(0, 5)).toEqual(["OK", "OK", "OK", "OK", "OK"]);
    expect(results[5]).toBe("TOO_MANY_REQUESTS");
  });

  test("forging a new address per request still hits the global cap", async () => {
    let refused = 0;
    for (let attempt = 0; attempt < 61; attempt += 1) {
      const client = anonymousFrom(`198.51.100.${attempt}`);
      // Valid payloads: input validation runs before the handler, so an
      // invalid one never reaches the limiter (and costs nothing to refuse).
      // oxlint-disable-next-line no-await-in-loop -- the order is the test
      const result = await outcome(client.staff.signupStaff(teacherSignup()));
      if (result === "TOO_MANY_REQUESTS") {
        refused += 1;
      }
    }
    // 60 per hour overall: the 61st is refused although its address is new.
    expect(refused).toBe(1);
  }, 60_000);
});

describe("abandoned sign-ups (F-18)", () => {
  test("purging an unverified applicant frees their NIC to register again", async () => {
    const nic = nextNic();
    const client = anonymousFrom("10.0.2.1");
    await client.staff.signupStaff(teacherSignup({ nic }));
    // Past the seven-day retention window.
    await harness.sql.query(
      `update "user" set created_at = now() - interval '8 days' where username = $1`,
      [nic]
    );
    const { removed } = await purgeUnverifiedAccounts(harness.db);
    expect(removed).toBeGreaterThanOrEqual(1);
    const staffRows = await harness.sql.query(
      `select 1 from staff where nic = $1`,
      [nic]
    );
    expect(staffRows.rows).toHaveLength(0);
    // Before the fix the orphan staff row made this a CONFLICT forever.
    expect(
      await outcome(
        anonymousFrom("10.0.2.2").staff.signupStaff(teacherSignup({ nic }))
      )
    ).toBe("OK");
  });
});

describe("atomicity (F-17)", () => {
  test("two simultaneous sign-ups for one NIC leave one login and one staff row", async () => {
    const nic = nextNic();
    const [first, second] = await Promise.all([
      outcome(
        anonymousFrom("10.0.1.1").staff.signupStaff(
          teacherSignup({ nic, email: "same-nic-a@example.com" })
        )
      ),
      outcome(
        anonymousFrom("10.0.1.2").staff.signupStaff(
          teacherSignup({ nic, email: "same-nic-b@example.com" })
        )
      ),
    ]);
    expect([first, second].toSorted()).toEqual(["CONFLICT", "OK"]);
    const logins = await harness.sql.query(
      `select 1 from "user" where username = $1`,
      [nic]
    );
    const staffRows = await harness.sql.query(
      `select 1 from staff where nic = $1`,
      [nic]
    );
    expect(logins.rows).toHaveLength(1);
    expect(staffRows.rows).toHaveLength(1);
    // No login without a staff row, from either request.
    const orphans = await harness.sql.query(
      `select 1 from "user" u where u.role = 'teacher-requester'
         and not exists (select 1 from staff s where s.user_id = u.id)`
    );
    expect(orphans.rows).toHaveLength(0);
  });
});
