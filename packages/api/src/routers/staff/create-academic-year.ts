import { ORPCError } from "@orpc/server";
import { isStructureEntryOfferedBySchool } from "@school-student-teacher-management/db/config/school";
import {
  COMPULSORY_BASKET_CATEGORY,
  getStructureVersion,
  resolveEntries,
} from "@school-student-teacher-management/db/constants/structureVersions/index";
import type { StructureVersionEntry } from "@school-student-teacher-management/db/constants/structureVersions/index";
import { gradeSubjectConfig } from "@school-student-teacher-management/db/schema/academics";
import {
  academicYear,
  academicYearInsertSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { desc } from "drizzle-orm";
import { object, optional, pick } from "valibot";

import { adminProcedure } from "../../index";

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

export const createAcademicYear = adminProcedure
  .input(inputSchema)
  .handler(async ({ input, context }) => {
    // Default to the most recently created academic year's structure
    // version — the common case (no scheme change) needs no explicit pick.
    const [mostRecent] = await context.db
      .select({
        structureVersionKey: academicYear.structureVersionKey,
        structureSubversionKey: academicYear.structureSubversionKey,
      })
      .from(academicYear)
      .orderBy(desc(academicYear.createdAt));

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

    const [record] = await context.db
      .insert(academicYear)
      .values({
        id,
        year: input.year,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        structureVersionKey,
        structureSubversionKey: structureSubversionKey ?? null,
        // The very first academic year ever created has nothing to be
        // "current" relative to — without this the whole app stays locked
        // behind "select an academic year" forever, since nothing is ever
        // marked current. Every subsequent year is created inactive and
        // switched to explicitly.
        isCurrent: !mostRecent,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    // One-time materialization: copy the version's entries into this year's
    // own gradeSubjectConfig rows. Later additions to the registry, or to
    // other years using the same key, can never retroactively change these.
    const offeredEntries = entries.filter((entry) =>
      isStructureEntryOfferedBySchool(
        entry.gradeLevel,
        entry.basketCategory,
        COMPULSORY_BASKET_CATEGORY
      )
    );
    if (offeredEntries.length > 0) {
      await context.db.insert(gradeSubjectConfig).values(
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
  });
