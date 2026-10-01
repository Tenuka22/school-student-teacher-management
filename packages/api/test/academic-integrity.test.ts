/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * Regression for the academic-year and staff invariants:
 * F-06 (conflicts are 409, not 500), F-08 (atomic year creation),
 * F-09 (one current year), F-10 (leadership roles follow positions),
 * F-15 (deletes that can succeed, seeded rows that cannot be deleted),
 * F-22 (a closed year is read-only).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  HARNESS_TIMEOUT_MS,
  clientFor,
  createHarness,
  createTeacher,
  nextNic,
  openCurrentYear,
  outcome,
  signInSeat,
} from "./support/harness";
import type { Harness } from "./support/harness";

let harness: Harness;
let admin: Awaited<ReturnType<typeof clientFor>>;
let currentYearId: string;

const roleOf = async (username: string) => {
  const { rows } = await harness.sql.query<{ role: string }>(
    `select role from "user" where username = $1`,
    [username]
  );
  return rows[0]?.role;
};

const currentYears = async () => {
  const { rows } = await harness.sql.query<{ year: number }>(
    `select year from academic_year where is_current order by year`
  );
  return rows.map((row) => row.year);
};

const createYear = (year: number) =>
  admin.staff.createAcademicYear({
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  } as never);

beforeAll(async () => {
  harness = await createHarness();
  const opened = await openCurrentYear(harness, 2026);
  currentYearId = opened.id;
  admin = await clientFor(harness, await signInSeat(harness, "admin"));
}, HARNESS_TIMEOUT_MS);

afterAll(async () => {
  await harness?.close();
}, HARNESS_TIMEOUT_MS);

describe("academic year creation (F-08)", () => {
  test("a new year comes with its policy, quotas and curriculum", async () => {
    const created = await createYear(2027);
    const count = async (table: string) => {
      const { rows } = await harness.sql.query<{ n: string }>(
        `select count(*)::text as n from ${table} where academic_year_id = $1`,
        [created.id]
      );
      return Number(rows[0]?.n);
    };
    expect(await count("attendance_policy")).toBe(1);
    expect(await count("leave_entitlement")).toBe(7);
    expect(await count("grade_subject_config")).toBeGreaterThan(0);
    // 2026 is current, so 2027 is not.
    expect(created.isCurrent).toBe(false);
  });

  test("a duplicate year is a 409, not a 500", async () => {
    expect(await outcome(createYear(2027))).toBe("CONFLICT");
  });

  test("a failure on the last insert leaves no half-created year", async () => {
    await harness.sql.query(`
      create function fail_policy() returns trigger language plpgsql as
      $$ begin raise exception 'injected failure'; end $$;
      create trigger fail_policy before insert on attendance_policy
        for each row execute function fail_policy();`);
    try {
      expect(await outcome(createYear(2031))).not.toBe("OK");
    } finally {
      await harness.sql.query(`
        drop trigger fail_policy on attendance_policy;
        drop function fail_policy();`);
    }
    const { rows } = await harness.sql.query(
      `select 1 from academic_year where year = 2031`
    );
    expect(rows).toHaveLength(0);
    const orphans = await harness.sql.query(
      `select 1 from leave_entitlement e
        where not exists (select 1 from academic_year y where y.id = e.academic_year_id)`
    );
    expect(orphans.rows).toHaveLength(0);
  });
});

describe("one current year (F-09)", () => {
  test("the database refuses a second current year", async () => {
    await expect(
      harness.sql.query(
        `update academic_year set is_current = true where year = 2027`
      )
    ).rejects.toThrow(/academic_year_single_current/u);
  });

  test("two simultaneous switches leave exactly one current year", async () => {
    const y2028 = await createYear(2028);
    const y2029 = await createYear(2029);
    const results = await Promise.all([
      outcome(admin.staff.setCurrentYear({ id: y2028.id } as never)),
      outcome(admin.staff.setCurrentYear({ id: y2029.id } as never)),
    ]);
    expect(results).toEqual(["OK", "OK"]);
    expect(await currentYears()).toHaveLength(1);
    // Restore 2026 as current for the rest of the file.
    await admin.staff.setCurrentYear({ id: currentYearId } as never);
    expect(await currentYears()).toEqual([2026]);
  });
});

describe("leadership roles follow positions (F-10)", () => {
  test("a Principal with no position in the next year stops being Principal", async () => {
    const teacher = await createTeacher(harness, "Acting Principal");
    await admin.staff.assignPosition({
      staffId: teacher.staffId,
      academicYearId: currentYearId,
      position: "principal",
    } as never);
    expect(await roleOf(teacher.username)).toBe("principal");

    const next = await createYear(2030);
    await admin.staff.setCurrentYear({ id: next.id } as never);
    // Before the fix the role stayed `principal` with no position behind it.
    expect(await roleOf(teacher.username)).toBe("teacher");

    // Switching back restores it, from the 2026 position.
    await admin.staff.setCurrentYear({ id: currentYearId } as never);
    expect(await roleOf(teacher.username)).toBe("principal");
  });

  test("removing the position demotes in the same transaction", async () => {
    const teacher = await createTeacher(harness, "Acting Deputy");
    const position = await admin.staff.assignPosition({
      staffId: teacher.staffId,
      academicYearId: currentYearId,
      position: "vicePrincipal",
    } as never);
    expect(await roleOf(teacher.username)).toBe("vicePrincipal");
    await admin.staff.removePosition({ id: position.id } as never);
    expect(await roleOf(teacher.username)).toBe("teacher");
  });

  test("a position on the administrator's own staff row never changes the admin role", async () => {
    await admin.staff.assignPosition({
      staffId: "seed-staff-admin",
      academicYearId: currentYearId,
      position: "vicePrincipal",
    } as never);
    expect(await roleOf("admin")).toBe("admin");
  });
});

describe("deletes (F-15)", () => {
  test("a staff member entered a minute ago can be deleted", async () => {
    const teacher = await createTeacher(harness, "Typo Teacher");
    // createStaff gave them a `teacher` position in the current year, which
    // used to make the delete impossible.
    expect(
      await outcome(admin.staff.deleteStaff({ id: teacher.staffId } as never))
    ).toBe("OK");
    const { rows } = await harness.sql.query(
      `select 1 from "user" where username = $1`,
      [teacher.username]
    );
    expect(rows).toHaveLength(0);
  });

  test("a staff member with leave history cannot be deleted", async () => {
    const teacher = await createTeacher(harness, "History Teacher");
    await teacher.client.staff.leaves.applyLeave({
      type: "casual",
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      dayPart: "full",
      paymentStatus: "notApplicable",
      reason: null,
    });
    expect(
      await outcome(admin.staff.deleteStaff({ id: teacher.staffId } as never))
    ).toBe("CONFLICT");
  });

  test("the seeded administrator's staff row cannot be deleted", async () => {
    expect(
      await outcome(
        admin.staff.deleteStaff({ id: "seed-staff-admin" } as never)
      )
    ).toBe("FORBIDDEN");
    expect(await roleOf("admin")).toBe("admin");
  });

  test("an empty, non-current year can be closed", async () => {
    const empty = await createYear(2032);
    expect(
      await outcome(admin.staff.deleteAcademicYear({ id: empty.id } as never))
    ).toBe("OK");
  });
});

describe("a closed year is read-only (F-22)", () => {
  let closedYearId: string;

  beforeAll(async () => {
    const year = await createYear(2033);
    closedYearId = year.id;
    await admin.staff.deleteAcademicYear({ id: closedYearId } as never);
  }, HARNESS_TIMEOUT_MS);

  test("a closed year cannot be made current", async () => {
    expect(
      await outcome(admin.staff.setCurrentYear({ id: closedYearId } as never))
    ).toBe("CONFLICT");
  });

  test("procedures with no year check of their own are refused by the database", async () => {
    expect(
      await outcome(
        admin.staff.createClass({
          academicYearId: closedYearId,
          gradeLevel: 6,
          name: "6A",
          medium: "english",
        } as never)
      )
    ).toBe("CONFLICT");
    const leaveAdmin = await clientFor(
      harness,
      await signInSeat(harness, "leave-admin")
    );
    expect(
      await outcome(
        leaveAdmin.staff.leaves.upsertLeaveEntitlement({
          academicYearId: closedYearId,
          leaveType: "casual",
          paymentStatus: "notApplicable",
          maxDays: 99,
        } as never)
      )
    ).toBe("CONFLICT");
  });

  test("a raw write is refused with the closed-year SQLSTATE", async () => {
    await expect(
      harness.sql.query(
        `update leave_entitlement set max_days = 1 where academic_year_id = $1`,
        [closedYearId]
      )
    ).rejects.toMatchObject({ code: "YR001" });
  });

  test("restoring the year makes it writable again", async () => {
    await admin.staff.restoreAcademicYear({ id: closedYearId } as never);
    expect(
      await outcome(
        admin.staff.createClass({
          academicYearId: closedYearId,
          gradeLevel: 6,
          name: "6A",
          medium: "english",
        } as never)
      )
    ).toBe("OK");
  });
});

describe("conflicts are 409, never 500 (F-06)", () => {
  test("duplicate NIC and duplicate service number", async () => {
    const nic = nextNic();
    await admin.staff.createStaff({
      name: "First",
      nic,
      staffCategory: "teacher",
      teacherServiceNo: "T9001",
    } as never);
    expect(
      await outcome(
        admin.staff.createStaff({
          name: "Second",
          nic,
          staffCategory: "teacher",
        } as never)
      )
    ).toBe("CONFLICT");
    expect(
      await outcome(
        admin.staff.createStaff({
          name: "Third",
          nic: nextNic(),
          staffCategory: "teacher",
          teacherServiceNo: "T9001",
        } as never)
      )
    ).toBe("CONFLICT");
    // The failed creates left no orphan login behind (F-17).
    const { rows } = await harness.sql.query(
      `select 1 from "user" u where u.role = 'teacher'
         and not exists (select 1 from staff s where s.user_id = u.id)`
    );
    expect(rows).toHaveLength(0);
  });

  test("duplicate timetable slot subject", async () => {
    const created = await admin.staff.createClass({
      academicYearId: currentYearId,
      gradeLevel: 6,
      name: "6B",
      medium: "english",
    } as never);
    const { rows } = await harness.sql.query<{ subject_key: string }>(
      `select subject_key from grade_subject_config
        where academic_year_id = $1 and grade_level = 6 limit 1`,
      [currentYearId]
    );
    const slot = {
      academicYearId: currentYearId,
      classId: created.id,
      dayOfWeek: 1,
      periodNumber: 1,
      subjectKey: rows[0]?.subject_key,
    };
    expect(
      await outcome(admin.staff.periods.createClassPeriodSubject(slot as never))
    ).toBe("OK");
    expect(
      await outcome(admin.staff.periods.createClassPeriodSubject(slot as never))
    ).toBe("CONFLICT");
  });
});
