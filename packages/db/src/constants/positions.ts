/**
 * Staff position types for Sri Lankan school hierarchy.
 * Based on real school structures (Royal College Horana, SLS Muscat, IIGH Colombo).
 */

export const POSITION_CATEGORIES = {
  leadership: "leadership",
  sectional: "sectional",
  teaching: "teaching",
} as const;

export type PositionCategory =
  (typeof POSITION_CATEGORIES)[keyof typeof POSITION_CATEGORIES];

/** Predefined position types */
export const POSITION_TYPES = {
  principal: { name: "Principal", category: "leadership" as const },
  vicePrincipal: { name: "Vice Principal", category: "leadership" as const },
  assistantPrincipal: {
    name: "Assistant Principal",
    category: "leadership" as const,
  },
  sectionalHead: {
    name: "Sectional Head",
    category: "sectional" as const,
  },
  headOfDepartment: {
    name: "Head of Department",
    category: "sectional" as const,
  },
  teacher: { name: "Teacher", category: "teaching" as const },
} as const;

export type PositionType = keyof typeof POSITION_TYPES;

/**
 * Positions that carry leave-review authority (and auth role `admin`).
 * A staff member holding any of these gets promoted to `role: "admin"`
 * on assignment and demoted back to `teacher` when the last one is removed.
 */
export const LEADERSHIP_POSITION_KEYS: ReadonlySet<string> = new Set([
  "principal",
  "vicePrincipal",
  "assistantPrincipal",
]);

/**
 * Sectional head scopes — the grade range a sectional head is responsible for.
 * Only applies when position = "sectionalHead".
 */
export const SECTIONAL_SCOPES = [
  "prePrimary",
  "primary",
  "grade6_7",
  "grade8_9",
  "grade10_11",
  "grade12_13",
  "grade12_13_science",
  "grade12_13_commerce",
  "grade12_13_arts",
] as const;

export type SectionalScope = (typeof SECTIONAL_SCOPES)[number];
