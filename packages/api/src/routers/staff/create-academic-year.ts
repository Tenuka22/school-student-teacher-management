import { ORPCError } from "@orpc/server";
import type { Database } from "@school-student-teacher-management/db";
import { isStructureEntryOfferedBySchool } from "@school-student-teacher-management/db/config/school";
import { DEFAULT_LEAVE_ENTITLEMENTS } from "@school-student-teacher-management/db/constants/leave";
import {
  COMPULSORY_BASKET_CATEGORY,
  getStructureVersion,
  resolveEntries,
} from "@school-student-teacher-management/db/constants/structureVersions/index";
import type { StructureVersionEntry } from "@school-student-teacher-management/db/constants/structureVersions/index";
import { gradeSubjectConfig } from "@school-student-teacher-management/db/schema/academics";
import { attendancePolicy } from "@school-student-teacher-management/db/schema/attendance";
import { leaveEntitlement } from "@school-student-teacher-management/db/schema/leaves";
import {
  academicYear,
  academicYearInsertSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { desc, isNull } from "drizzle-orm";
import { object, optional, pick } from "valibot";
import type { InferOutput } from "valibot";

import { adminOrAcademicProcedure } from "../../index";
import { isUniqueViolation } from "../../lib/db-errors";
import { currentAcademicYearId } from "./set-current-year";

const inputSchema = object({
  ...pick(academicYearInsertSchema, ["year", "startDate", "endDate"]).entries,
  structureVersionKey: optional(
    pick(academicYearInsertSchema, ["structureVersionKey"]).entries
      .structureVersionKey
  ),
  structureSubversionKey: optional(
    pick(academicYearInsertSchema, ["structureSubversionKey"]).entries
      .structureSubversionKey
  ),
});

export type OpenAcademicYearInput = InferOutput<typeof inputSchema>;

/**
 * The one way an academic year comes into existence: the year, its
 * curriculum, its leave quotas and its attendance policy, atomically. Called
 * by the `createAcademicYear` procedure and by `scripts/seed.ts`, which used
 * to insert a bare `academic_year` row of its own and left a year with no
 * policy or quotas (F-08, F-11).
 */
export const openAcademicYear = async (
  db: Database,
  input: OpenAcademicYearInput
) => {
  // Default to the most recently created academic year's structure
  // version — the common case (no scheme change) needs no explicit pick.
  const [mostRecent] = await db
    .select({
      structureVersionKey: academicYear.structureVersionKey,
      structureSubversionKey: academicYear.structureSubversionKey,
    })
    .from(academicYear)
    // Defaults come from the latest year still in use; a closed year is
    // not a template (F-08). One row is all this needs.
    .where(isNull(academicYear.deletedAt))
    .orderBy(desc(academicYear.createdAt))
    .limit(1);

  const structureVersionKey =
    input.structureVersionKey ?? mostRecent?.structureVersionKey;

  if (!structureVersionKey) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "structureVersionKey is required: no prior academic year exists to default from",
    });
  }

  // Validates against the code registry — throws if the key is unknown,
  // rather than silently accepting a typo'd or unshipped version.
  try {
    getStructureVersion(structureVersionKey);
  } catch {
    throw new ORPCError("BAD_REQUEST", {
      message: `Unknown structure version key: "${structureVersionKey}"`,
    });
  }

  // Resolve subversion: explicit > most recent's > latest
  const structureSubversionKey =
    input.structureSubversionKey ??
    mostRecent?.structureSubversionKey ??
    undefined;

  // Resolve entries from the specific subversion, or latest if not specified
  let entries;
  try {
    entries = resolveEntries(structureVersionKey, structureSubversionKey);
  } catch {
    throw new ORPCError("BAD_REQUEST", {
      message: `Unknown subversion ${structureSubversionKey} for version "${structureVersionKey}"`,
    });
  }

  const id = crypto.randomUUID();

  // Same filter the school applies, computed before the transaction: it is
  // pure code over the registry.
  const offeredEntries = entries.filter((entry) =>
    isStructureEntryOfferedBySchool(
      entry.gradeLevel,
      entry.basketCategory,
      COMPULSORY_BASKET_CATEGORY
    )
  );

  /**
   * The year, its curriculum, its leave quotas and its attendance policy
   * are one thing (F-08). They used to be four independent inserts, and a
   * failure after the first left a year with no policy or entitlements —
   * which then broke attendance and leave review with PRECONDITION_FAILED
   * until someone repaired it by hand in SQL. Either all four exist or
   * none does.
   */
  let record: typeof academicYear.$inferSelect | undefined;
  try {
    record = await db.transaction(async (tx) => {
      // The first year ever opened has nothing to be current relative to,
      // so it becomes current; every later one is switched to explicitly.
      // Decided by "is any year current", not "does any year exist", so a
      // school whose only years were all closed is not left with none.
      const currentId = await currentAcademicYearId(tx);

      const [inserted] = await tx
        .insert(academicYear)
        .values({
          id,
          year: input.year,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          structureVersionKey,
          structureSubversionKey: structureSubversionKey ?? null,
          isCurrent: currentId === null,
        })
        .returning();

      // One-time materialization: copy the version's entries into this
      // year's own gradeSubjectConfig rows. Later additions to the registry,
      // or to other years using the same key, can never retroactively
      // change these.
      if (offeredEntries.length > 0) {
        await tx.insert(gradeSubjectConfig).values(
          offeredEntries.map((entry: StructureVersionEntry) => ({
            id: crypto.randomUUID(),
            academicYearId: id,
            gradeLevel: entry.gradeLevel,
            basketCategory: entry.basketCategory,
            subjectKey: entry.subjectKey,
            sortOrder: entry.sortOrder,
          }))
        );
      }

      await tx.insert(leaveEntitlement).values(
        DEFAULT_LEAVE_ENTITLEMENTS.map((entitlement) => ({
          id: crypto.randomUUID(),
          academicYearId: id,
          leaveType: entitlement.leaveType,
          paymentStatus: entitlement.paymentStatus,
          maxDays: entitlement.maxDays,
          minDays: entitlement.minDays,
        }))
      );

      await tx.insert(attendancePolicy).values({
        id: crypto.randomUUID(),
        academicYearId: id,
      });

      return inserted;
    });
  } catch (error) {
    if (isUniqueViolation(error, "academic_year_year_unique")) {
      throw new ORPCError("CONFLICT", {
        message: `Academic year ${input.year} already exists. If it was closed, restore it instead of creating it again`,
      });
    }
    throw error;
  }

  if (!record) {
    throw new ORPCError("INTERNAL_SERVER_ERROR");
  }

  return {
    id: record.id,
    year: record.year,
    startDate: record.startDate,
    endDate: record.endDate,
    structureVersionKey: record.structureVersionKey,
    structureSubversionKey: record.structureSubversionKey,
    isCurrent: record.isCurrent,
    createdAt: record.createdAt.toISOString(),
  };
};

export const createAcademicYear = adminOrAcademicProcedure
  .input(inputSchema)
  .handler(({ input, context }) => openAcademicYear(context.db, input));
