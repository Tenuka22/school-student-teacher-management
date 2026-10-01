/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * F-01 regression: account administration through better-auth's admin plugin.
 *
 * Every request goes through the real `auth.handler` with a real sign-in
 * cookie, exactly as `curl` against `/api/auth/admin/*` would.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  HARNESS_TIMEOUT_MS,
  authRequest,
  clientFor,
  createHarness,
  outcome,
  signIn,
  signInSeat,
  TEST_PASSWORDS,
} from "./support/harness";
import type { Harness } from "./support/harness";

let harness: Harness;
let adminCookie: string;
let academicCookie: string;
let principalCookie: string;
let teacher: { userId: string; username: string; password: string };

const userIdOf = async (username: string): Promise<string> => {
  const { rows } = await harness.sql.query<{ id: string }>(
    `select id from "user" where username = $1`,
    [username]
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(`no user ${username}`);
  }
  return id;
};

beforeAll(async () => {
  harness = await createHarness();
  adminCookie = await signInSeat(harness, "admin");
  academicCookie = await signInSeat(harness, "academic-admin");
  principalCookie = await signInSeat(harness, "principal");

  const admin = await clientFor(harness, adminCookie);
  const created = await admin.staff.createStaff({
    name: "Test Teacher",
    nic: "199012345678",
    staffCategory: "teacher",
  } as never);
  teacher = {
    userId: await userIdOf(created.loginUsername),
    username: created.loginUsername,
    password: created.initialPassword,
  };
}, HARNESS_TIMEOUT_MS);

afterAll(async () => {
  await harness?.close();
}, HARNESS_TIMEOUT_MS);

describe("privileged verbs are closed to every seat", () => {
  test("academic admin cannot create an admin account", async () => {
    const response = await authRequest(
      harness,
      "/admin/create-user",
      {
        email: "intruder@example.com",
        password: "Intruder-password-1",
        name: "Intruder",
        role: "admin",
      },
      academicCookie
    );
    expect(response.status).toBe(403);
    const { rows } = await harness.sql.query(
      `select 1 from "user" where email = 'intruder@example.com'`
    );
    expect(rows).toHaveLength(0);
  });

  test("principal cannot create any account", async () => {
    const response = await authRequest(
      harness,
      "/admin/create-user",
      {
        email: "p@example.com",
        password: "Intruder-password-1",
        name: "P",
      },
      principalCookie
    );
    expect(response.status).toBe(403);
  });

  test("academic admin cannot set the administrator's password", async () => {
    const adminId = await userIdOf("admin");
    const response = await authRequest(
      harness,
      "/admin/set-user-password",
      { userId: adminId, newPassword: "Taken-over-password-1" },
      academicCookie
    );
    expect(response.status).toBe(403);
    // The original password still works; the takeover password does not.
    await signIn(harness, "admin", TEST_PASSWORDS.admin);
    await expect(
      signIn(harness, "admin", "Taken-over-password-1")
    ).rejects.toThrow();
  });

  test("even admin cannot set another user's password through the plugin", async () => {
    const response = await authRequest(
      harness,
      "/admin/set-user-password",
      { userId: teacher.userId, newPassword: "Admin-chosen-password-1" },
      adminCookie
    );
    expect(response.status).toBe(403);
  });

  test("academic admin cannot delete the administrator", async () => {
    const response = await authRequest(
      harness,
      "/admin/remove-user",
      { userId: await userIdOf("admin") },
      academicCookie
    );
    expect(response.status).toBe(403);
    expect(await userIdOf("admin")).toBeString();
  });

  test("academic admin cannot impersonate the principal", async () => {
    const response = await authRequest(
      harness,
      "/admin/impersonate-user",
      { userId: await userIdOf("principal") },
      academicCookie
    );
    expect(response.status).toBe(403);
  });

  test("academic admin cannot set anyone's role", async () => {
    const response = await authRequest(
      harness,
      "/admin/set-role",
      { userId: teacher.userId, role: "admin" },
      academicCookie
    );
    expect(response.status).toBe(403);
    const { rows } = await harness.sql.query<{ role: string }>(
      `select role from "user" where id = $1`,
      [teacher.userId]
    );
    expect(rows[0]?.role).toBe("teacher");
  });
});

describe("peer seats cannot act on privileged accounts", () => {
  test("academic admin cannot ban the principal", async () => {
    const response = await authRequest(
      harness,
      "/admin/ban-user",
      { userId: await userIdOf("principal") },
      academicCookie
    );
    expect(response.status).toBe(403);
  });

  test("academic admin cannot sign the administrator out everywhere", async () => {
    const response = await authRequest(
      harness,
      "/admin/revoke-user-sessions",
      { userId: await userIdOf("admin") },
      academicCookie
    );
    expect(response.status).toBe(403);
    // The admin's session survived.
    const session = await harness.auth.api.getSession({
      headers: new Headers({ cookie: adminCookie }),
    });
    // better-auth's inferred type omits the username plugin's field; the
    // runtime object carries it (see `SessionUser` in src/context.ts).
    expect((session?.user as { username?: string } | undefined)?.username).toBe(
      "admin"
    );
  });

  test("seeded seats cannot be banned even by the administrator", async () => {
    const response = await authRequest(
      harness,
      "/admin/ban-user",
      { userId: await userIdOf("principal") },
      adminCookie
    );
    expect(response.status).toBe(403);
  });
});

describe("the accounts page's own flows still work", () => {
  test("academic admin can ban and unban a teacher, and revoke their sessions", async () => {
    const teacherCookie = await signIn(
      harness,
      teacher.username,
      teacher.password
    );

    const ban = await authRequest(
      harness,
      "/admin/ban-user",
      { userId: teacher.userId, banReason: "test" },
      academicCookie
    );
    expect(ban.status).toBe(200);
    const banned = await harness.auth.api.getSession({
      headers: new Headers({ cookie: teacherCookie }),
    });
    expect(banned).toBeNull();

    const unban = await authRequest(
      harness,
      "/admin/unban-user",
      { userId: teacher.userId },
      academicCookie
    );
    expect(unban.status).toBe(200);

    const revoke = await authRequest(
      harness,
      "/admin/revoke-user-sessions",
      { userId: teacher.userId },
      adminCookie
    );
    expect(revoke.status).toBe(200);
  });
});

describe("other doors", () => {
  test("better-auth's own public sign-up is closed", async () => {
    const response = await authRequest(harness, "/sign-up/email", {
      email: "walk-in@example.com",
      password: "Walk-in-password-1",
      name: "Walk In",
    });
    expect(response.status).not.toBe(200);
    const { rows } = await harness.sql.query(
      `select 1 from "user" where email = 'walk-in@example.com'`
    );
    expect(rows).toHaveLength(0);
  });

  test("anonymous and teacher callers are refused the accounts list", async () => {
    const anonymous = await clientFor(harness);
    expect(await outcome(anonymous.staff.listAccounts({} as never))).toBe(
      "UNAUTHORIZED"
    );
    const teacherClient = await clientFor(
      harness,
      await signIn(harness, teacher.username, teacher.password)
    );
    expect(await outcome(teacherClient.staff.listAccounts({} as never))).toBe(
      "FORBIDDEN"
    );
  });

  test("with no mail transport in production, sending a code is refused instead of faked", async () => {
    // better-auth swallows send failures, so without this guard the answer
    // was 200 "check your inbox" while nothing was sent (NEW-F-05).
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const response = await authRequest(
        harness,
        "/email-otp/send-verification-otp",
        { email: "principal@aloysiuscollege.lk", type: "forget-password" }
      );
      expect(response.status).toBe(503);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  test("denials and actions are written to the account audit log", async () => {
    const { rows } = await harness.sql.query<{
      action: string;
      outcome: string;
    }>(`select action, outcome from account_audit_log`);
    const has = (action: string, result: string) =>
      rows.some((row) => row.action === action && row.outcome === result);
    expect(has("/admin/create-user", "denied")).toBe(true);
    expect(has("/admin/set-user-password", "denied")).toBe(true);
    expect(has("/admin/ban-user", "denied")).toBe(true);
    expect(has("/admin/ban-user", "allowed")).toBe(true);
  });
});
