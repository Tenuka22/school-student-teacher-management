/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * F-07 / F-17 / F-21 / F-35 regression: the leave quota, the request state
 * machine, calendar-date validation and the approval's attendance write.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  HARNESS_TIMEOUT_MS,
  clientFor,
  createHarness,
  createTeacher,
  openCurrentYear,
  outcome,
  signInSeat,
} from "./support/harness";
import type { Harness } from "./support/harness";

let harness: Harness;
let principal: Awaited<ReturnType<typeof clientFor>>;
let yearId: string;
const YEAR = 2026;

/** Sets this year's casual-leave quota. */
const setCasualQuota = async (days: number) => {
  await harness.sql.query(
    `update leave_entitlement set max_days = $1
      where academic_year_id = $2 and leave_type = 'casual'`,
    [days, yearId]
  );
};

/** A full-day casual request, with every field the procedure's contract names. */
const casual = (startDate: string, endDate = startDate) => ({
  type: "casual" as const,
  startDate,
  endDate,
  dayPart: "full" as const,
  paymentStatus: "notApplicable" as const,
  reason: null,
});

const finalize = (id: string, overrideReason = "Deputy unavailable (test)") =>
  principal.staff.leaves.finalizeLeave({
    id,
    year: YEAR,
    decision: "approved",
    overrideReason,
  });

beforeAll(async () => {
  harness = await createHarness();
  const created = await openCurrentYear(harness, YEAR);
  yearId = created.id;
  principal = await clientFor(harness, await signInSeat(harness, "principal"));
}, HARNESS_TIMEOUT_MS);

afterAll(async () => {
  await harness?.close();
}, HARNESS_TIMEOUT_MS);

describe("quota (F-07)", () => {
  test("pending requests reserve days: the third request over a 2-day quota is refused", async () => {
    await setCasualQuota(2);
    const teacher = await createTeacher(harness, "Quota Teacher");
    expect(
      await outcome(
        teacher.client.staff.leaves.applyLeave(casual("2026-03-02"))
      )
    ).toBe("OK");
    expect(
      await outcome(
        teacher.client.staff.leaves.applyLeave(casual("2026-03-03"))
      )
    ).toBe("OK");
    // Before the fix only approved days counted, so this passed.
    expect(
      await outcome(
        teacher.client.staff.leaves.applyLeave(casual("2026-03-04"))
      )
    ).toBe("PRECONDITION_FAILED");
  });

  test("two simultaneous requests for the last day: exactly one succeeds", async () => {
    await setCasualQuota(1);
    const teacher = await createTeacher(harness, "Race Teacher");
    const results = await Promise.all([
      outcome(teacher.client.staff.leaves.applyLeave(casual("2026-04-06"))),
      outcome(teacher.client.staff.leaves.applyLeave(casual("2026-04-07"))),
    ]);
    expect(results.toSorted()).toEqual(["OK", "PRECONDITION_FAILED"]);
  });

  test("a double-click files one request, not two", async () => {
    await setCasualQuota(10);
    const teacher = await createTeacher(harness, "Double Click");
    const results = await Promise.all([
      outcome(teacher.client.staff.leaves.applyLeave(casual("2026-04-13"))),
      outcome(teacher.client.staff.leaves.applyLeave(casual("2026-04-13"))),
    ]);
    expect(results.toSorted()).toEqual(["CONFLICT", "OK"]);
    const { rows } = await harness.sql.query(
      `select 1 from leave_request where staff_id = $1`,
      [teacher.staffId]
    );
    expect(rows).toHaveLength(1);
  });

  test("approval re-checks the quota against what is already approved", async () => {
    await setCasualQuota(2);
    const teacher = await createTeacher(harness, "Recheck Teacher");
    const first = await teacher.client.staff.leaves.applyLeave(
      casual("2026-05-04")
    );
    const second = await teacher.client.staff.leaves.applyLeave(
      casual("2026-05-05")
    );
    expect(await outcome(finalize(first.id))).toBe("OK");
    // The quota is lowered after both were filed.
    await setCasualQuota(1);
    expect(await outcome(finalize(second.id))).toBe("PRECONDITION_FAILED");
  });

  test("the balance shows pending days and the remainder the server enforces", async () => {
    await setCasualQuota(5);
    const teacher = await createTeacher(harness, "Balance Teacher");
    await teacher.client.staff.leaves.applyLeave(
      casual("2026-06-01", "2026-06-02")
    );
    const balance = await teacher.client.staff.leaves.getMyLeaveBalance({});
    const row = balance.balances.find((entry) => entry.leaveType === "casual");
    expect(row?.pendingDays).toBe(2);
    expect(row?.usedDays).toBe(0);
    expect(row?.remainingDays).toBe(3);
  });
});

describe("state machine (F-07 / F-17)", () => {
  test("a cancelled request cannot be approved, even with an override reason", async () => {
    await setCasualQuota(10);
    const teacher = await createTeacher(harness, "Cancel Teacher");
    const request = await teacher.client.staff.leaves.applyLeave(
      casual("2026-07-06")
    );
    await teacher.client.staff.leaves.cancelLeave({ id: request.id });
    expect(await outcome(finalize(request.id))).toBe("CONFLICT");
  });

  test("a decided request cannot be cancelled", async () => {
    await setCasualQuota(10);
    const teacher = await createTeacher(harness, "Late Cancel");
    const request = await teacher.client.staff.leaves.applyLeave(
      casual("2026-07-13")
    );
    await finalize(request.id);
    expect(
      await outcome(teacher.client.staff.leaves.cancelLeave({ id: request.id }))
    ).toBe("CONFLICT");
  });

  test("a double-submitted approval decides once and writes attendance once", async () => {
    await setCasualQuota(10);
    const teacher = await createTeacher(harness, "Double Approve");
    // Monday 3 August to Friday 7 August: five working days.
    const request = await teacher.client.staff.leaves.applyLeave(
      casual("2026-08-03", "2026-08-07")
    );
    const results = await Promise.all([
      outcome(finalize(request.id)),
      outcome(finalize(request.id)),
    ]);
    expect(results.toSorted()).toEqual(["CONFLICT", "OK"]);
    const { rows } = await harness.sql.query<{ date: string; status: string }>(
      `select date, status from teacher_attendance where staff_id = $1 order by date`,
      [teacher.staffId]
    );
    expect(rows.map((row) => row.date)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]);
    expect(new Set(rows.map((row) => row.status))).toEqual(new Set(["absent"]));
  });
});

describe("calendar dates (F-21)", () => {
  test.each([
    ["2026-02-30", "a day that does not exist"],
    ["2026-13-45", "a month that does not exist"],
    ["2026-02-29", "29 February in a non-leap year"],
  ])("%s (%s) is refused", async (date) => {
    const teacher = await createTeacher(harness, "Date Teacher");
    expect(
      await outcome(teacher.client.staff.leaves.applyLeave(casual(date)))
    ).toBe("BAD_REQUEST");
  });

  test("a weekend-only request is refused rather than counted as zero days", async () => {
    const teacher = await createTeacher(harness, "Weekend Teacher");
    // Saturday 7 and Sunday 8 March 2026.
    expect(
      await outcome(
        teacher.client.staff.leaves.applyLeave(
          casual("2026-03-07", "2026-03-08")
        )
      )
    ).toBe("BAD_REQUEST");
  });

  test("end before start is refused", async () => {
    const teacher = await createTeacher(harness, "Reversed Teacher");
    expect(
      await outcome(
        teacher.client.staff.leaves.applyLeave(
          casual("2026-03-10", "2026-03-09")
        )
      )
    ).toBe("BAD_REQUEST");
  });

  test("the database refuses an unknown status or reversed dates even if code is bypassed", async () => {
    const teacher = await createTeacher(harness, "Raw Insert");
    const insert = (status: string, start: string, end: string) =>
      harness.sql.query(
        `insert into leave_request (id, staff_id, academic_year_id, type, start_date, end_date, status)
         values (gen_random_uuid()::text, $1, $2, 'casual', $3, $4, $5)`,
        [teacher.staffId, yearId, start, end, status]
      );
    await expect(
      insert("approvedd", "2026-09-01", "2026-09-01")
    ).rejects.toThrow(/leave_request_status_check/u);
    await expect(insert("pending", "2026-09-02", "2026-09-01")).rejects.toThrow(
      /leave_request_date_order/u
    );
  });
});
