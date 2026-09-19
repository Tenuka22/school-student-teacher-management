import type { MarkingGuide, StructureVersion } from "../../types";
import {
  alCommonScale,
  alScale,
  olScale,
  scholarshipScale,
  termScalePrimaryJunior,
  termScaleSenior,
} from "./marking-guide";
import { v1_1 } from "./v1.1";

/**
 * v1 — first shipped Sri Lankan curriculum structure version.
 *
 * Subversion 1 is the baseline curriculum snapshot. Future term-level changes
 * should be added as new subversions (for example, v1.2) with an explicit
 * delta; year-level curriculum overhauls should use a new major version.
 *
 * Marking guides shipped alongside the entries:
 * - termPrimary: school scale with the D band, grades 1-9 term tests.
 * - termSenior: school scale on the national pass/fail layout (S instead
 *   of D), grades 10-13 term tests.
 * - scholarship: Grade 5 Scholarship exam, out of 200.
 * - ol: GCE O/L national scale (A/B/C/S, F for the national W).
 * - al: GCE A/L national scale for the three stream subjects.
 * - alCommon: A/L General English / Common General Test (internal scale).
 */
export const v1MarkingGuides: Record<string, MarkingGuide> = {
  termPrimary: {
    description:
      "Term tests, grades 1-9 (school scale: A+ 90-100, A 75-89, B 65-74, C 50-64, D 35-49, F 0-34)",
    maxMark: 100,
    bands: termScalePrimaryJunior,
  },
  termSenior: {
    description:
      "Term tests, grades 10-13 (school scale with S: A+ 90-100, A 75-89, B 65-74, C 50-64, S 35-49, F 0-34)",
    maxMark: 100,
    bands: termScaleSenior,
  },
  scholarship: {
    description:
      "Grade 5 Scholarship Examination (2 papers, 200 marks total; A+ 180-200, A 150-179, B 130-149, C 100-129, D 70-99, F 0-69)",
    maxMark: 200,
    bands: scholarshipScale,
  },
  ol: {
    description:
      "GCE O/L national scale per subject: A 75-100, B 65-74, C 50-64, S 35-49, F 0-34 (national W normalized to F)",
    maxMark: 100,
    bands: olScale,
  },
  al: {
    description:
      "GCE A/L national scale per stream subject: A 75-100, B 65-74, C 50-64, S 35-49, F 0-34",
    maxMark: 100,
    bands: alScale,
  },
  alCommon: {
    description:
      "A/L General English / Common General Test (A+ 90-100, A 75-89, B 65-74, C 50-64, S 35-49, F 0-34)",
    maxMark: 100,
    bands: alCommonScale,
  },
};

export const v1Version: StructureVersion = {
  key: "v1",
  description:
    "Sri Lankan primary, junior secondary, O/L, and A/L curriculum structure. Subversion 1: baseline.",
  subversions: {
    1: v1_1,
  },
  entries: v1_1.entries,
  markingGuides: v1MarkingGuides,
};
