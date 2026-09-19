/**
 * Generic person-attribute constants for demographic records. Not
 * teacher-specific — used by staff profile fields today, and any future
 * student-facing demographic field.
 */

// ─── Gender ─────────────────────────────────────────────────────────────────

/** Gender options — Male or Female only per requirement. */
export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

// ─── Marital Status ─────────────────────────────────────────────────────────

export const MARITAL_STATUSES = [
  "single",
  "married",
  "divorced",
  "widowed",
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

// ─── Blood Groups ───────────────────────────────────────────────────────────

export const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];
