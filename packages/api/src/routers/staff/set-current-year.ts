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
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import * as v from "valibot";

import { adminOrAcademicProcedure } from "../../index";

/** Anything that can run a query: the pool or an open transaction. */
type Executor = Pick<Database, "select" | "update" | "execute">;

/** When a person holds more than one seat, the senior one describes them. */
const LEADERSHIP_PRECEDENCE = ["principal", "vicePrincipal"] as const;
type LeadershipRole = (typeof LEADERSHIP_PRECEDENCE)[number];

/**
 * The roles that follow a year's positions. Every other role is an office or
 * a seat — `admin`, the three specialist administrators, `teacher-requester` —
 * and is never rewritten here.
 */
const POSITION_DERIVED_ROLES: readonly string[] = LEADERSHIP_PRECEDENCE;

/**
 * Serializes year switches. `pg_advisory_xact_lock` is held until the switch's
 * transaction ends, so a second administrator's switch waits and then runs
 * against the committed state instead of interleaving with the first.
 */
const YEAR_SWITCH_LOCK = 734_119_001;

const senior = (
  current: LeadershipRole | null,
  candidate: LeadershipRole | null
): LeadershipRole | null => {
  if (!candidate) {
    return current;
  }
  if (!current) {
    return candidate;
  }
  return LEADERSHIP_PRECEDENCE.indexOf(candidate) <
    LEADERSHIP_PRECEDENCE.indexOf(current)
    ? candidate
    : current;
};

/**
 * Makes every position-derived role match the given (current) academic year.
 * The single authority for leadership roles: `setCurrentYear`,
 * `assignPosition` and `removePosition` all end by calling it.
 *
 * It used to iterate only the users holding a position **in the new year**,
 * so a Principal with no position in the next year was never looked at and
 * kept the `principal` role — and with it the leadership workspace and the
 * `ADMIN_ROLES` bypass in `requirePermission` (forensic audit F-10).
 * `removePosition` separately hard-coded `teacher` as the fallback, which made
 * an office-staff Deputy a teacher. Now the candidate set is the union of
 * "holds a leadership role" and "holds a position this year", and the
 * fallback follows the staff category in both places.
 *
 * Never touched: `admin`, the seeded institutional seats, and any role that is
 * not position-derived (the specialist administrators).
 */
export const reconcilePositionDerivedRoles = async (
  db: Executor,
  academicYearId: string
): Promise<void> => {
  const candidates = await db
    .select({
      userId: userTable.id,
      username: userTable.username,
      role: userTable.role,
      staffId: staff.id,
      staffCategory: staff.staffCategory,
    })
    .from(userTable)
    .innerJoin(staff, eq(staff.userId, userTable.id))
    .where(
      or(
        inArray(userTable.role, [...POSITION_DERIVED_ROLES]),
        inArray(
          staff.id,
          db
            .select({ staffId: staffPosition.staffId })
            .from(staffPosition)
            .where(eq(staffPosition.academicYearId, academicYearId))
        )
      )
    );

  if (candidates.length === 0) {
    return;
  }

  const positions = await db
    .select({
      staffId: staffPosition.staffId,
      position: staffPosition.position,
    })
    .from(staffPosition)
    .where(
      and(
        eq(staffPosition.academicYearId, academicYearId),
        inArray(
          staffPosition.staffId,
          candidates.map((candidate) => candidate.staffId)
        )
      )
    );

  const leadershipByStaffId = new Map<string, LeadershipRole | null>();
  for (const row of positions) {
    const role = leadershipRoleForPosition(
      row.position
    ) as LeadershipRole | null;
    leadershipByStaffId.set(
      row.staffId,
      senior(leadershipByStaffId.get(row.staffId) ?? null, role)
    );
  }

  const userIdsByRole = new Map<string, string[]>();
  for (const candidate of candidates) {
    const isOffice =
      candidate.role === "admin" || isSeededAccount(candidate.username);
    const roleFollowsPositions =
      candidate.role === null ||
      POSITION_DERIVED_ROLES.includes(candidate.role) ||
      candidate.role === "teacher" ||
      candidate.role === "user";
    if (isOffice || !roleFollowsPositions) {
      continue;
    }

    const nextRole =
      leadershipByStaffId.get(candidate.staffId) ??
      (candidate.staffCategory === "teacher" ? "teacher" : "user");

    if (candidate.role !== nextRole) {
      const ids = userIdsByRole.get(nextRole) ?? [];
      ids.push(candidate.userId);
      userIdsByRole.set(nextRole, ids);
    }
  }

  // One set-based update per target role (at most four), not one per person.
  await Promise.all(
    [...userIdsByRole].map(([role, ids]) =>
      db.update(userTable).set({ role }).where(inArray(userTable.id, ids))
    )
  );
};

/** The current year's id, or null when no year is current. */
export const currentAcademicYearId = async (
  db: Pick<Database, "select">
): Promise<string | null> => {
  const [row] = await db
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(eq(academicYear.isCurrent, true))
    .limit(1);
  return row?.id ?? null;
};

export const setCurrentYear = adminOrAcademicProcedure
  .input(v.object({ id: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    /**
     * One transaction, serialized by an advisory lock (F-09). The clear and
     * the set used to be two independent statements: a failure between them
     * left no current year, and two administrators switching at once could
     * leave two. The `academic_year_single_current` index now makes two
     * impossible regardless; the lock makes concurrent switches queue rather
     * than fail on it.
     */
    const record = await context.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${YEAR_SWITCH_LOCK})`);

      const [existing] = await tx
        .select({ id: academicYear.id, deletedAt: academicYear.deletedAt })
        .from(academicYear)
        .where(eq(academicYear.id, input.id))
        .limit(1);

      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Academic year not found",
        });
      }
      if (existing.deletedAt) {
        throw new ORPCError("CONFLICT", {
          message:
            "A closed academic year cannot be made current — restore it first",
        });
      }

      await tx
        .update(academicYear)
        .set({ isCurrent: false })
        .where(
          and(eq(academicYear.isCurrent, true), ne(academicYear.id, input.id))
        );

      const [updated] = await tx
        .update(academicYear)
        .set({ isCurrent: true })
        .where(eq(academicYear.id, input.id))
        .returning();

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      // The year just changed, so every position-derived role is re-derived
      // from it — inside the same transaction, so a failure leaves both the
      // year and the roles as they were.
      await reconcilePositionDerivedRoles(tx, updated.id);
      return updated;
    });

    return {
      id: record.id,
      year: record.year,
      isCurrent: record.isCurrent,
    };
  });
