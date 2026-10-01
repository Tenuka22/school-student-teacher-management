/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * F-21 unit tests: strict calendar dates and working-day counting.
 */
import { describe, expect, test } from "bun:test";

import {
  calculateLeaveDays,
  countWorkingDays,
  listWorkingDates,
} from "../src/constants/leave";
import { isCalendarDate, schoolToday } from "../src/dates";

describe("schoolToday (F-20)", () => {
  test("04:30 in Colombo is already today, though it is yesterday in UTC", () => {
    // 2026-03-01T04:30+05:30 == 2026-02-28T23:00Z
    expect(schoolToday(new Date("2026-02-28T23:00:00Z"))).toBe("2026-03-01");
  });

  test("23:30 in Colombo is still today, though UTC agrees", () => {
    expect(schoolToday(new Date("2026-03-01T18:00:00Z"))).toBe("2026-03-01");
  });

  test("the month rolls at Colombo midnight, not UTC midnight", () => {
    // 2026-01-01T00:10+05:30 == 2025-12-31T18:40Z: a new school year.
    expect(schoolToday(new Date("2025-12-31T18:40:00Z"))).toBe("2026-01-01");
  });
});

describe("isCalendarDate", () => {
  test.each([
    ["2026-01-01", true],
    // A leap year, and a century divisible by 400.
    ["2028-02-29", true],
    ["2000-02-29", true],
    ["2026-12-31", true],
    // Not a leap year, and a century not divisible by 400.
    ["2026-02-29", false],
    ["1900-02-29", false],
    ["2026-02-30", false],
    ["2026-13-45", false],
    ["2026-04-31", false],
    ["2026-00-10", false],
    ["2026-1-1", false],
    ["", false],
    ["2026-01-01T00:00:00Z", false],
  ])("%s → %p", (value, expected) => {
    expect(isCalendarDate(value)).toBe(expected);
  });
});

describe("working days", () => {
  test("a Monday-to-Friday week is five days", () => {
    expect(countWorkingDays("2026-08-03", "2026-08-07")).toBe(5);
  });

  test("Friday to Monday is two working days", () => {
    expect(listWorkingDates("2026-08-07", "2026-08-10")).toEqual([
      "2026-08-07",
      "2026-08-10",
    ]);
  });

  test("a range across a month and a year boundary", () => {
    // Wed 30 Dec 2026 → Mon 4 Jan 2027: Wed, Thu, Fri, Mon.
    expect(countWorkingDays("2026-12-30", "2027-01-04")).toBe(4);
  });

  test("a leap-day range", () => {
    // Mon 28 Feb 2028 → Wed 1 Mar 2028 includes 29 Feb (Tue).
    expect(countWorkingDays("2028-02-28", "2028-03-01")).toBe(3);
  });

  test("a reversed range is empty", () => {
    expect(countWorkingDays("2026-08-07", "2026-08-03")).toBe(0);
  });

  test("a same-day half day is 0.5", () => {
    expect(calculateLeaveDays("2026-08-03", "2026-08-03", "morning")).toBe(0.5);
  });

  test("invalid dates throw instead of counting as 1 or 0 days", () => {
    // Before F-21: 2026-02-30 counted as 1 day and 2026-13-45 as 0.
    expect(() =>
      calculateLeaveDays("2026-02-30", "2026-02-30", "full")
    ).toThrow(RangeError);
    expect(() =>
      calculateLeaveDays("2026-13-45", "2026-13-45", "full")
    ).toThrow(RangeError);
    expect(() =>
      calculateLeaveDays("2026-02-30", "2026-02-30", "morning")
    ).toThrow(RangeError);
  });
});
