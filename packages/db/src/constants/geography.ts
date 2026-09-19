/**
 * Geographic constants for Sri Lanka. Not teacher-specific — usable for any
 * address field (staff, students, schools).
 */

/** All 25 Sri Lankan districts for address validation. */
export const SRI_LANKA_DISTRICTS = [
  "amlapura",
  "anuradhapura",
  "badulla",
  "batticaloa",
  "colombo",
  "galle",
  "garuwa",
  "hambantota",
  "jaffna",
  "kalutara",
  "kandy",
  "kegalle",
  "kilinochchi",
  "mannar",
  "matale",
  "mathugama",
  "monaragala",
  "mullaitivu",
  "negombo",
  "puttalam",
  "ratnapura",
  "tirikovil",
  "trincomalee",
  "vavuniya",
  "kurunegala",
] as const;

export type SriLankaDistrict = (typeof SRI_LANKA_DISTRICTS)[number];
