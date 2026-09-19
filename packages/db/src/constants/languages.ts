/**
 * Language-related constants shared across staff and class records.
 * Not curriculum data — these are stable, non-version-scoped operational
 * options (which language a class is taught in, a staff member's native
 * language), unlike subject/curriculum structure which now lives entirely
 * in `constants/structureVersions/*`.
 */

export const MOTHER_TONGUE_OPTIONS = ["sinhala", "tamil"] as const;
export type MotherTongue = (typeof MOTHER_TONGUE_OPTIONS)[number];
