/**
 * Religion options for personal/demographic records (staff profile fields,
 * and any future student-facing demographic field). Distinct from the O/L
 * examination "religion" subject choice, which is curriculum data and lives
 * in `constants/structureVersions` as a per-version entry, not here.
 */

export const RELIGION_OPTIONS = [
  "buddhism",
  "hinduism",
  "catholicism",
  "christianity",
  "islam",
  "saivanery",
] as const;
export type ReligionOption = (typeof RELIGION_OPTIONS)[number];
