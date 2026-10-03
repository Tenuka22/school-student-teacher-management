import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * Regression suite for the October 2026 security remediation: Z1 (editing an
 * administrative login through `updateStaff`), Z2 (Academic Administrator →
 * staff member → Deputy Principal), Z3 (a Deputy recommending their own
 * leave) and A1 (sessions surviving a password change or reset).
 *
 * Every test was run against the code before the fix and failed there.
 */
import { RPCHandler } from "@orpc/server/fetch";
import { createAuth } from "@school-student-teacher-management/auth";
import { LATEST_STRUCTURE_VERSION_KEY } from "@school-student-teacher-management/db/constants/structureVersions/index";

import type { Context, Session } from "../src/context";
import { appRouter } from "../src/routers/index";
import {
  BASE_URL,
  HARNESS_TIMEOUT_MS,
  TEST_PASSWORDS,
  authRequest,
  clientFor,
  createHarness,
  createTeacher,
  TEST_AUTH_CONFIG,
  nextNic,
  openCurrentYear,
  outcome,
  signIn,
  signInSeat,
} from "./support/harness";
import type { Harness } from "./support/harness";

type Client = Awaited<ReturnType<typeof clientFor>>;

let harness: Harness;
let yearId: string;
let admin: Client;
let academic: Client;
let principal: Client;
let academicCookie: string;
const YEAR = 2026;

const rpc = new RPCHandler(appRouter);

/** A raw HTTP call to `/api/rpc/<path>`, as `curl` with a cookie would make. */
const rpcOverHttp = async (
  procedurePath: string,
  input: unknown,
  cookie: string
): Promise<number> => {
  const session = (await harness.auth.api.getSession({
    headers: new Headers({ cookie }),
  })) as unknown as Session | null;
  const context: Context = { db: harness.db, auth: harness.auth, session };
  const { response } = await rpc.handle(
    new Request(`${BASE_URL}/api/rpc/${procedurePath}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: "/api/rpc", context }
  );
  return response?.status ?? 404;
};

const staffRow = async (id: string) => {
  const { rows } = await harness.sql.query<{
    nic: string;
    email: string | null;
    phone: string | null;
    user_id: string | null;
  }>(`select nic, email, phone, user_id from staff where id = $1`, [id]);
  const [row] = rows;
  if (!row) {
    throw new Error(`no staff ${id}`);
  }
  return row;
};

const staffField = async (
  id: string,
  field: "nic" | "email" | "phone" | "user_id"
) => {
  const row = await staffRow(id);
  return row[field];
};

const loginField = async (
  userId: string | null,
  field: "username" | "role"
): Promise<string | undefined> => {
  const { rows } = await harness.sql.query<{ username: string; role: string }>(
    `select username, role from "user" where id = $1`,
    [userId]
  );
  const [login] = rows;
  return login?.[field];
};

const sessionUser = async (cookie: string) => {
  const session = await harness.auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  return session?.user ?? null;
};

const assign = (
  client: Client,
  staffId: string,
  position: string,
  academicYearId = yearId
) =>
  client.staff.assignPosition({
    staffId,
    academicYearId,
    position,
    sectionalScope: null,
  } as never);

const casual = (date: string) => ({
  type: "casual" as const,
  startDate: date,
  endDate: date,
  dayPart: "full" as const,
  paymentStatus: "notApplicable" as const,
  reason: null,
});

const NEW_PASSWORD = "Fresh-password-2026!";

const teacherWithEmail = async (label: string) => {
  const email = `${label}@example.com`;
  const created = await admin.staff.createStaff({
    name: label,
    nic: nextNic(),
    email,
    staffCategory: "teacher",
    gender: "female",
  } as never);
  return {
    email,
    username: created.loginUsername,
    password: created.initialPassword,
  };
};

const auditRows = async (action: string, target: string) => {
  const { rows } = await harness.sql.query<{
    actor_role: string | null;
    outcome: string;
    detail: string | null;
  }>(
    `select actor_role, outcome, detail from account_audit_log
      where action = $1 and detail like $2 order by created_at`,
    [`rpc:${action}`, `target=${target}%`]
  );
  return rows;
};

beforeAll(async () => {
  harness = await createHarness();
  const year = await openCurrentYear(harness, YEAR);
  yearId = year.id;
  admin = await clientFor(harness, await signInSeat(harness, "admin"));
  academicCookie = await signInSeat(harness, "academic-admin");
  academic = await clientFor(harness, academicCookie);
  principal = await clientFor(harness, await signInSeat(harness, "principal"));
}, HARNESS_TIMEOUT_MS);

afterAll(async () => {
  await harness?.close();
}, HARNESS_TIMEOUT_MS);

describe("Z1: updateStaff on an administrative login", () => {
  test("academic admin cannot rewrite the administrator's NIC or login", async () => {
    const before = await staffRow("seed-staff-admin");
    const result = await outcome(
      academic.staff.updateStaff({
        id: "seed-staff-admin",
        nic: "199912345678",
      } as never)
    );
    expect(result).toBe("FORBIDDEN");
    expect(await staffField("seed-staff-admin", "nic")).toBe(before.nic);
    expect(await loginField(before.user_id, "username")).toBe("admin");
    // The fixed username still signs in.
    await signIn(harness, "admin", TEST_PASSWORDS.admin);
  });

  test("academic admin cannot edit any field of a seeded seat", async () => {
    const before = await staffRow("seed-staff-principal");
    const result = await outcome(
      academic.staff.updateStaff({
        id: "seed-staff-principal",
        nic: before.nic,
        email: "attacker@example.com",
      } as never)
    );
    expect(result).toBe("FORBIDDEN");
    expect(await staffField("seed-staff-principal", "email")).toBe(
      before.email
    );
  });

  test("academic admin cannot edit a staff member holding a leadership role", async () => {
    const deputy = await createTeacher(harness, "Z1 Deputy");
    expect(await outcome(assign(admin, deputy.staffId, "vicePrincipal"))).toBe(
      "OK"
    );
    const before = await staffRow(deputy.staffId);
    expect(await loginField(before.user_id, "role")).toBe("vicePrincipal");

    const result = await outcome(
      academic.staff.updateStaff({
        id: deputy.staffId,
        nic: nextNic(),
      } as never)
    );
    expect(result).toBe("FORBIDDEN");
    expect(await staffField(deputy.staffId, "nic")).toBe(before.nic);
  });

  test("the principal cannot edit the administrator's record either", async () => {
    const before = await staffRow("seed-staff-admin");
    expect(
      await outcome(
        principal.staff.updateStaff({
          id: "seed-staff-admin",
          nic: before.nic,
          phone: "0771234567",
        } as never)
      )
    ).toBe("FORBIDDEN");
  });

  test("even the administrator cannot change a seeded seat's NIC", async () => {
    expect(
      await outcome(
        admin.staff.updateStaff({
          id: "seed-staff-academic-admin",
          nic: "199912345679",
        } as never)
      )
    ).toBe("FORBIDDEN");
  });

  test("the administrator can save a seeded seat's record without renaming its login", async () => {
    const before = await staffRow("seed-staff-admin");
    expect(
      await outcome(
        admin.staff.updateStaff({
          id: "seed-staff-admin",
          nic: before.nic,
          phone: "0779876543",
        } as never)
      )
    ).toBe("OK");
    expect(await staffField("seed-staff-admin", "phone")).toBe("+94779876543");
    // Before the fix any save rewrote the username to the placeholder NIC.
    expect(await loginField(before.user_id, "username")).toBe("admin");
    await signIn(harness, "admin", TEST_PASSWORDS.admin);
  });

  test("academic admin still edits an ordinary teacher, NIC and login included", async () => {
    const teacher = await createTeacher(harness, "Z1 Ordinary");
    const nic = nextNic();
    expect(
      await outcome(
        academic.staff.updateStaff({
          id: teacher.staffId,
          nic,
          phone: "0711111111",
        } as never)
      )
    ).toBe("OK");
    const after = await staffRow(teacher.staffId);
    expect(after.nic).toBe(nic);
    expect(await loginField(after.user_id, "username")).toBe(nic);
  });

  test("a teacher's own profile edit is unchanged, and updateStaff stays closed to them", async () => {
    const teacher = await createTeacher(harness, "Z1 Self");
    expect(
      await outcome(
        teacher.client.staff.updateProfile({ phone: "0722222222" } as never)
      )
    ).toBe("OK");
    expect(await staffField(teacher.staffId, "phone")).toBe("+94722222222");
    expect(
      await outcome(
        teacher.client.staff.updateStaff({
          id: teacher.staffId,
          nic: nextNic(),
        } as never)
      )
    ).toBe("FORBIDDEN");
  });

  test("a direct HTTP request is refused the same way", async () => {
    const before = await staffRow("seed-staff-admin");
    const status = await rpcOverHttp(
      "staff/updateStaff",
      { id: "seed-staff-admin", nic: "199912345670" },
      academicCookie
    );
    expect(status).toBe(403);
    expect(await staffField("seed-staff-admin", "nic")).toBe(before.nic);
  });
});

describe("Z2: academic admin → staff member → Deputy Principal", () => {
  test("the whole chain fails: the new account never reaches leadership", async () => {
    // 1. The academic desk creates a staff member and receives the password.
    const created = await academic.staff.createStaff({
      name: "Chain Target",
      nic: nextNic(),
      staffCategory: "teacher",
      gender: "male",
    } as never);
    expect(created.initialPassword).toBeString();

    // 2. Appointing them Deputy is refused, by the client and over HTTP.
    expect(await outcome(assign(academic, created.id, "vicePrincipal"))).toBe(
      "FORBIDDEN"
    );
    expect(
      await rpcOverHttp(
        "staff/assignPosition",
        {
          staffId: created.id,
          academicYearId: yearId,
          position: "vicePrincipal",
          sectionalScope: null,
        },
        academicCookie
      )
    ).toBe(403);
    const { rows } = await harness.sql.query(
      `select 1 from staff_position where staff_id = $1 and position <> 'teacher'`,
      [created.id]
    );
    expect(rows).toHaveLength(0);

    // 3. Signing in with the captured credentials yields a teacher.
    const cookie = await signIn(
      harness,
      created.loginUsername,
      created.initialPassword
    );
    const signedIn = (await sessionUser(cookie)) as { role?: string } | null;
    expect(signedIn).toMatchObject({ role: "teacher" });

    // 4. Leadership surfaces stay closed to that session.
    const victim = await clientFor(harness, cookie);
    expect(
      await outcome(
        victim.staff.leaves.listLeaveRequests({ year: YEAR } as never)
      )
    ).toBe("FORBIDDEN");
    expect(
      await outcome(victim.staff.deleteStaff({ id: created.id } as never))
    ).toBe("FORBIDDEN");
    const authority = await victim.staff.leaves.getMyAuthority({ year: YEAR });
    expect(authority.isDeputy).toBe(false);
  });

  test("academic admin cannot assign any leadership position, in any year", async () => {
    const teacher = await createTeacher(harness, "Z2 Leadership");
    for (const position of [
      "vicePrincipal",
      "assistantPrincipal",
      "principal",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose
      expect(await outcome(assign(academic, teacher.staffId, position))).toBe(
        "FORBIDDEN"
      );
    }
    // A year that is not current yet: switching to it later would derive
    // the role, so the position is refused there too.
    const next = await academic.staff.createAcademicYear({
      year: 2027,
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      structureVersionKey: LATEST_STRUCTURE_VERSION_KEY,
    } as never);
    expect(
      await outcome(assign(academic, teacher.staffId, "vicePrincipal", next.id))
    ).toBe("FORBIDDEN");
  });

  test("academic admin cannot remove a Deputy either", async () => {
    const teacher = await createTeacher(harness, "Z2 Remove");
    const position = await assign(admin, teacher.staffId, "vicePrincipal");
    expect(
      await outcome(academic.staff.removePosition({ id: position.id } as never))
    ).toBe("FORBIDDEN");
  });

  test("academic admin still assigns teaching and sectional positions", async () => {
    const teacher = await createTeacher(harness, "Z2 Ordinary");
    expect(
      await outcome(assign(academic, teacher.staffId, "headOfDepartment"))
    ).toBe("OK");
    const sectional = await createTeacher(harness, "Z2 Sectional");
    expect(
      await outcome(
        academic.staff.assignPosition({
          staffId: sectional.staffId,
          academicYearId: yearId,
          position: "sectionalHead",
          sectionalScope: "primary",
        } as never)
      )
    ).toBe("OK");
  });

  test("the Principal and the Administrator still appoint Deputies", async () => {
    const one = await createTeacher(harness, "Z2 By Principal");
    const two = await createTeacher(harness, "Z2 By Admin");
    expect(await outcome(assign(principal, one.staffId, "vicePrincipal"))).toBe(
      "OK"
    );
    expect(
      await outcome(assign(admin, two.staffId, "assistantPrincipal"))
    ).toBe("OK");
  });

  test("a teacher cannot assign any position", async () => {
    const teacher = await createTeacher(harness, "Z2 Teacher");
    expect(
      await outcome(assign(teacher.client, teacher.staffId, "vicePrincipal"))
    ).toBe("FORBIDDEN");
    expect(
      await outcome(assign(teacher.client, teacher.staffId, "headOfDepartment"))
    ).toBe("FORBIDDEN");
  });
});

describe("Z3: a Deputy recommending their own leave", () => {
  test("own request refused; another Deputy's and another teacher's allowed", async () => {
    const deputyA = await createTeacher(harness, "Z3 Deputy A");
    const deputyB = await createTeacher(harness, "Z3 Deputy B");
    const teacher = await createTeacher(harness, "Z3 Teacher");
    await assign(admin, deputyA.staffId, "vicePrincipal");
    await assign(admin, deputyB.staffId, "vicePrincipal");

    const own = await deputyA.client.staff.leaves.applyLeave(
      casual("2026-05-04")
    );
    expect(
      await outcome(
        deputyA.client.staff.leaves.recommendLeave({
          id: own.id,
          year: YEAR,
          decision: "recommended",
        })
      )
    ).toBe("FORBIDDEN");
    const { rows } = await harness.sql.query<{ deputy_status: string }>(
      `select deputy_status from leave_request where id = $1`,
      [own.id]
    );
    const [ownRow] = rows;
    expect(ownRow?.deputy_status).toBe("pending");

    expect(
      await outcome(
        deputyB.client.staff.leaves.recommendLeave({
          id: own.id,
          year: YEAR,
          decision: "recommended",
        })
      )
    ).toBe("OK");

    const other = await teacher.client.staff.leaves.applyLeave(
      casual("2026-05-05")
    );
    expect(
      await outcome(
        deputyA.client.staff.leaves.recommendLeave({
          id: other.id,
          year: YEAR,
          decision: "recommended",
        })
      )
    ).toBe("OK");

    // The Principal's final decision is unchanged.
    expect(
      await outcome(
        principal.staff.leaves.finalizeLeave({
          id: own.id,
          year: YEAR,
          decision: "approved",
        })
      )
    ).toBe("OK");
  });
});

describe("A1: a password change or reset ends the other sessions", () => {
  test("password change: the other session dies, this device gets a fresh one", async () => {
    const account = await teacherWithEmail("a1-change");
    const sessionA = await signIn(harness, account.username, account.password);
    const sessionB = await signIn(harness, account.username, account.password);
    expect(await sessionUser(sessionB)).not.toBeNull();

    // The client does not ask for revocation; the server forces it.
    const response = await authRequest(
      harness,
      "/change-password",
      { currentPassword: account.password, newPassword: NEW_PASSWORD },
      sessionA
    );
    expect(response.status).toBe(200);

    expect(await sessionUser(sessionB)).toBeNull();
    expect(await sessionUser(sessionA)).toBeNull();
    const fresh = response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    expect(await sessionUser(fresh)).not.toBeNull();

    await signIn(harness, account.username, NEW_PASSWORD);
    await expect(
      signIn(harness, account.username, account.password)
    ).rejects.toThrow();
  });

  test("an explicit revokeOtherSessions: false is overridden", async () => {
    const account = await teacherWithEmail("a1-false");
    const sessionA = await signIn(harness, account.username, account.password);
    const sessionB = await signIn(harness, account.username, account.password);
    const response = await authRequest(
      harness,
      "/change-password",
      {
        currentPassword: account.password,
        newPassword: NEW_PASSWORD,
        revokeOtherSessions: false,
      },
      sessionA
    );
    expect(response.status).toBe(200);
    expect(await sessionUser(sessionB)).toBeNull();
  });

  test("password reset by emailed code: every session dies", async () => {
    const account = await teacherWithEmail("a1-reset");
    const session = await signIn(harness, account.username, account.password);
    const otp = await (
      harness.auth.api as unknown as {
        createVerificationOTP: (args: {
          body: { email: string; type: string };
        }) => Promise<string>;
      }
    ).createVerificationOTP({
      body: { email: account.email, type: "forget-password" },
    });

    const response = await authRequest(harness, "/email-otp/reset-password", {
      email: account.email,
      otp,
      password: NEW_PASSWORD,
    });
    expect(response.status).toBe(200);
    expect(await sessionUser(session)).toBeNull();
    await signIn(harness, account.username, NEW_PASSWORD);
    await expect(
      signIn(harness, account.username, account.password)
    ).rejects.toThrow();
  });

  test("A2: the server refuses a new password shorter than sign-up's floor", async () => {
    const account = await teacherWithEmail("a2-short");
    const session = await signIn(harness, account.username, account.password);
    const response = await authRequest(
      harness,
      "/change-password",
      { currentPassword: account.password, newPassword: "Short-pw-11" },
      session
    );
    expect(response.status).toBe(400);
    expect(await sessionUser(session)).not.toBeNull();
  });
});

describe("LOG1: privileged procedures are audited", () => {
  test("a refused updateStaff is recorded as denied, with the guard's code", async () => {
    await outcome(
      academic.staff.updateStaff({
        id: "seed-staff-leave-admin",
        nic: "199911112222",
      } as never)
    );
    const rows = await auditRows("staff.updateStaff", "seed-staff-leave-admin");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_role: "academicAdmin",
      outcome: "denied",
    });
    expect(rows[0]?.detail).toContain("error=FORBIDDEN");
    // The input's values are not written: the NIC tried is absent.
    expect(rows[0]?.detail).not.toContain("199911112222");
  });

  test("a refusal by the role guard itself is recorded too", async () => {
    const teacher = await createTeacher(harness, "LOG1 Teacher");
    await outcome(assign(teacher.client, teacher.staffId, "vicePrincipal"));
    const rows = await auditRows("staff.assignPosition", teacher.staffId);
    expect(rows.map((row) => [row.actor_role, row.outcome])).toEqual([
      ["teacher", "denied"],
    ]);
  });

  test("a successful position assignment is recorded as allowed", async () => {
    const teacher = await createTeacher(harness, "LOG1 Deputy");
    await assign(principal, teacher.staffId, "vicePrincipal");
    const rows = await auditRows("staff.assignPosition", teacher.staffId);
    expect(rows.map((row) => [row.actor_role, row.outcome])).toEqual([
      ["principal", "allowed"],
    ]);
  });

  test("reads are not audited", async () => {
    await admin.staff.listAcademicYears();
    const { rows } = await harness.sql.query(
      `select 1 from account_audit_log where action = 'rpc:staff.listAcademicYears'`
    );
    expect(rows).toHaveLength(0);
  });
});

describe("A3: account enumeration", () => {
  test("the username (NIC) availability probe is closed", async () => {
    const response = await authRequest(harness, "/is-username-available", {
      username: "admin",
    });
    expect(response.status).toBe(404);
  });

  test("sign-in does not say whether the username exists", async () => {
    const unknown = await authRequest(harness, "/sign-in/username", {
      username: "199999999999",
      password: "Wrong-password-123",
    });
    const known = await authRequest(harness, "/sign-in/username", {
      username: "admin",
      password: "Wrong-password-123",
    });
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
  });
});

describe("secret rotation: what rotating BETTER_AUTH_SECRET does", () => {
  test("every existing session cookie stops working; signing in again works", async () => {
    const cookie = await signInSeat(harness, "principal");
    expect(await sessionUser(cookie)).not.toBeNull();

    const rotated = createAuth(
      {
        ...TEST_AUTH_CONFIG,
        BETTER_AUTH_SECRET: `rotated-${crypto.randomUUID()}`,
      },
      harness.db
    );
    const after = await rotated.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(after).toBeNull();

    const fresh = await rotated.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/username`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL },
        body: JSON.stringify({
          username: "principal",
          password: TEST_PASSWORDS.principal,
        }),
      })
    );
    expect(fresh.status).toBe(200);
  });
});

describe("Z1 alternate path: renaming your own login", () => {
  test("a signed-in user cannot change their own username (it is their NIC)", async () => {
    const teacher = await createTeacher(harness, "Rename Self");
    const response = await authRequest(
      harness,
      "/update-user",
      { username: "199988887777" },
      teacher.cookie
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    const { rows } = await harness.sql.query<{ username: string }>(
      `select u.username from "user" u join staff s on s.user_id = u.id where s.id = $1`,
      [teacher.staffId]
    );
    expect(rows[0]?.username).toBe(teacher.username);
  });

  test("a seeded seat cannot rename itself either", async () => {
    const cookie = await signInSeat(harness, "academic-admin");
    const response = await authRequest(
      harness,
      "/update-user",
      { username: "academic-admin-2" },
      cookie
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    await signInSeat(harness, "academic-admin");
  });
});

describe("Z2 alternate path: carrying positions into a new year", () => {
  test("the academic desk's port skips leadership positions", async () => {
    const deputy = await createTeacher(harness, "Port Deputy");
    const teacher = await createTeacher(harness, "Port Teacher");
    await assign(admin, deputy.staffId, "vicePrincipal");
    await assign(admin, teacher.staffId, "headOfDepartment");
    const { rows } = await harness.sql.query<{ id: string }>(
      `select id from academic_year where year = 2027`
    );
    const [next] = rows;
    if (!next) {
      throw new Error("2027 was created by an earlier test");
    }
    const result = await academic.staff.portTeachersFromPreviousYear({
      toAcademicYearId: next.id,
      excludeStaffIds: [],
    } as never);
    expect(result.skippedLeadership).toBeGreaterThan(0);
    const carried = await harness.sql.query<{ position: string }>(
      `select position from staff_position where academic_year_id = $1 and staff_id = any($2)`,
      [next.id, [deputy.staffId, teacher.staffId]]
    );
    const positions = carried.rows.map((row) => row.position).toSorted();
    expect(positions).not.toContain("vicePrincipal");
    expect(positions).toContain("headOfDepartment");
  });
});
