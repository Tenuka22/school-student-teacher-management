/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * F-03 regression: the boot refuses short, missing or published seat passwords.
 */
import { describe, expect, test } from "bun:test";

import {
  assertSeatPasswords,
  seatPasswordProblem,
} from "../src/seat-password-policy";

describe("seat password policy", () => {
  test("a long, unpublished password is accepted", () => {
    expect(seatPasswordProblem("k3Jq9-unique-Zr77")).toBeNull();
  });

  test("a short password is refused", () => {
    expect(seatPasswordProblem("short-1")).toMatch(/shorter than 12/u);
  });

  test("every value ever committed to .env.example is refused", () => {
    // These are the public placeholders from the committed example file —
    // published values, which is exactly why they are tested by value.
    for (const published of [
      "change-me-academic-admin",
      "change-me-inventory-admin",
      "change-me-leave-admin",
      "change-me-principal",
    ]) {
      expect(seatPasswordProblem(published)).toMatch(/published/u);
    }
  });

  test("the boot check names the variable, never the value", () => {
    const leaked = "change-me-academic-admin";
    let message = "";
    try {
      assertSeatPasswords({
        ACADEMIC_ADMIN_PASSWORD: leaked,
        ADMIN_PASSWORD: undefined,
      });
    } catch (error) {
      ({ message } = error as Error);
    }
    expect(message).toContain("ACADEMIC_ADMIN_PASSWORD");
    expect(message).toContain("ADMIN_PASSWORD is not set");
    expect(message).not.toContain(leaked);
  });
});
