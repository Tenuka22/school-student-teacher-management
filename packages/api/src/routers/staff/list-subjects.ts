import { isStructureEntryOfferedBySchool } from "@school-student-teacher-management/db/config/school";
import {
  COMPULSORY_BASKET_CATEGORY,
  LATEST_STRUCTURE_VERSION_KEY,
  resolveEntries,
} from "@school-student-teacher-management/db/constants/structureVersions/index";
import * as v from "valibot";

import { adminProcedure } from "../../index";

const listSubjectsSchema = v.optional(
  v.object({
    structureVersionKey: v.optional(v.string()),
    structureSubversionKey: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1))
    ),
  })
);

export interface OfferedSubject {
  subjectKey: string;
  gradeLevel: number;
  basketCategory: string;
  sortOrder: number;
}

/**
 * Lists every subject a structure version defines, filtered to what this
 * school's `SCHOOL` config actually offers — i.e. exactly what creating an
 * academic year with that version would materialize into
 * `gradeSubjectConfig`. Read-only: this reflects the version + school
 * config, not any specific academic year's already-materialized rows.
 */
export const listSubjects = adminProcedure
  .input(listSubjectsSchema)
  .handler(({ input }) => {
    const versionKey =
      input?.structureVersionKey ?? LATEST_STRUCTURE_VERSION_KEY;
    const subversionKey = input?.structureSubversionKey;

    const entries = resolveEntries(versionKey, subversionKey);

    const offered: OfferedSubject[] = [];
    for (const entry of entries) {
      if (
        isStructureEntryOfferedBySchool(
          entry.gradeLevel,
          entry.basketCategory,
          COMPULSORY_BASKET_CATEGORY
        )
      ) {
        offered.push({
          subjectKey: entry.subjectKey,
          gradeLevel: entry.gradeLevel,
          basketCategory: entry.basketCategory,
          sortOrder: entry.sortOrder,
        });
      }
    }
    return offered;
  });
