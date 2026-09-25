import { ORPCError } from "@orpc/server";
import { leadershipRoleForPosition } from "@school-student-teacher-management/auth";
import { isSeededAccount } from "@school-student-teacher-management/auth/roles";
import type { Database } from "@school-student-teacher-management/db";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  academicYear,
  academicYearIdSchema,
  staff,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure } from "../../index";

/** When a person holds more than one seat, the senior one describes them. */
const LEADERSHIP_PRECEDENCE = ["principal", "vicePrincipal"] as const;

/**
 * Recomputes position-derived roles so they match one academic year.
 *
 * Assigning a Principal position promotes the account's role, because the
 * workspace guard and the sidebar read that role. Nothing used to undo it:
 * switch to a year where the person holds no Principal position and they still
 * landed in `/principal`, showing leadership navigation with no current-year
 * authority behind it. The role now follows the position in both directions.
 *
 * Two kinds of account are deliberately left alone:
 * - the three institutional logins, whose role belongs to the College rather
 *   than to a year, and
 * - `admin`, which is a College-wide office, not a seat in a year.
 *
 * Everyone else ends up holding the role their year implies: a leadership
 * seat if they have one, otherwise `teacher` for teaching staff and `user` for
 * everyone else. An account whose role already matches is not written at all.
 */
export const reconcilePositionDerivedRoles = async (
  db: Database,
  academicYearId: string
): Promise<void> => {
  const rows = await db
    .select({
      userId: userTable.id,
      username: userTable.username,
      role: userTable.role,
      position: staffPosition.position,
      staffCategory: staff.staffCategory,
    })
    .from(staffPosition)
    .innerJoin(staff, eq(staffPosition.staffId, staff.id))
    .innerJoin(userTable, eq(staff.userId, userTable.id))
    .where(eq(staffPosition.academicYearId, academicYearId));

  // One account can hold several positions; the senior seat wins.
  const expectedByUserId = new Map<
    string,
    { leadership: string | null; staffCategory: string | null }
  >();

  for (const row of rows) {
    const existing = expectedByUserId.get(row.userId);
    const leadership = leadershipRoleForPosition(row.position);

    if (!existing) {
      expectedByUserId.set(row.userId, {
        leadership,
        staffCategory: row.staffCategory,
      });
      continue;
    }

    if (
      leadership &&
      LEADERSHIP_PRECEDENCE.includes(
        leadership as (typeof LEADERSHIP_PRECEDENCE)[number]
      ) &&
      (!existing.leadership ||
        LEADERSHIP_PRECEDENCE.indexOf(
          leadership as (typeof LEADERSHIP_PRECEDENCE)[number]
        ) <
          LEADERSHIP_PRECEDENCE.indexOf(
            existing.leadership as (typeof LEADERSHIP_PRECEDENCE)[number]
          ))
    ) {
      existing.leadership = leadership;
    }
  }

  const rowsByUserId = new Map(rows.map((row) => [row.userId, row]));

  const updates: Promise<unknown>[] = [];

  for (const [userId, expected] of expectedByUserId) {
    const current = rowsByUserId.get(userId);

    if (!current) {
      continue;
    }

    const nextRole =
      expected.leadership ??
      (expected.staffCategory === "teacher" ? "teacher" : "user");

    if (
      current.role === nextRole ||
      current.role === "admin" ||
      isSeededAccount(current.username)
    ) {
      continue;
    }

    updates.push(
      db
        .update(userTable)
        .set({ role: nextRole })
        .where(eq(userTable.id, userId))
    );
  }

  await Promise.all(updates);
};

export const setCurrentYear = adminOnlyProcedure
  .input(v.object({ id: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(academicYear)
      .where(eq(academicYear.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Academic year not found" });
    }

    // Unset all current flags
    await context.db
      .update(academicYear)
      .set({ isCurrent: false })
      .where(sql`1 = 1`);

    // Set the selected year as current
    const [record] = await context.db
      .update(academicYear)
      .set({ isCurrent: true })
      .where(eq(academicYear.id, input.id))
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    // The year just changed, so every position-derived role has to be
    // re-derived from it.
    await reconcilePositionDerivedRoles(context.db, record.id);

    return {
      id: record.id,
      year: record.year,
      isCurrent: record.isCurrent,
    };
  });
