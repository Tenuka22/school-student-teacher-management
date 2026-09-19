/**
 * School-specific configuration.
 * This file is hardcoded — not stored in the database.
 * Edit this to match your school's profile.
 */

export interface SchoolConfig {
  name: string;
  type: "1AB" | "1C" | "type2" | "type3";
  gradeRange: { min: number; max: number };
  mediums: readonly ("sinhala" | "tamil" | "english")[];
  religions: readonly (
    | "buddhism"
    | "hinduism"
    | "catholicism"
    | "christianity"
    | "islam"
  )[];
  motherTongues: readonly ("sinhala" | "tamil")[];
  offeredOLBasketCategories: readonly (
    | "languagesHumanities"
    | "aestheticsArts"
    | "technicalVocational"
  )[];
  offeredALStreams: readonly (
    | "bioScience"
    | "physicalScience"
    | "commerce"
    | "arts"
    | "engineeringTechnology"
    | "bioSystemsTechnology"
  )[];
  offeredGrade9Optionals: boolean;
}

export const SCHOOL: SchoolConfig = {
  name: "Aloysius College",
  type: "1AB",
  gradeRange: { min: 1, max: 13 },
  mediums: ["sinhala", "tamil", "english"],
  religions: ["buddhism", "catholicism", "islam"],
  motherTongues: ["sinhala", "tamil"],
  offeredOLBasketCategories: [
    "languagesHumanities",
    "aestheticsArts",
    "technicalVocational",
  ],
  offeredALStreams: ["bioScience", "physicalScience", "commerce", "arts"],
  offeredGrade9Optionals: true,
} as const;

const OFFERED_OL_BASKETS = new Set<string>(SCHOOL.offeredOLBasketCategories);
const OFFERED_AL_STREAMS = new Set<string>(SCHOOL.offeredALStreams);

/**
 * Whether a `StructureVersionEntry` (gradeLevel + basketCategory) is one
 * this school actually offers, per the config above: grade range always
 * applies; O/L optional baskets and A/L streams are further filtered to the
 * categories/streams this school runs. Compulsory subjects and the O/L
 * religion/mother-tongue choice categories are never filtered — every
 * school offers those. `compulsoryBasketCategory` is passed in rather than
 * imported to avoid a dependency from `config/` on `constants/structureVersions/`.
 */
export const isStructureEntryOfferedBySchool = (
  gradeLevel: number,
  basketCategory: string,
  compulsoryBasketCategory: string
): boolean => {
  if (
    gradeLevel < SCHOOL.gradeRange.min ||
    gradeLevel > SCHOOL.gradeRange.max
  ) {
    return false;
  }
  if (basketCategory === compulsoryBasketCategory) {
    return true;
  }
  if (gradeLevel >= 10 && gradeLevel <= 11) {
    if (basketCategory === "religion" || basketCategory === "motherTongue") {
      return true;
    }
    return OFFERED_OL_BASKETS.has(basketCategory);
  }
  if (gradeLevel >= 12) {
    return OFFERED_AL_STREAMS.has(basketCategory);
  }
  return true;
};
