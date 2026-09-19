import { COMPULSORY_BASKET_CATEGORY } from "../../../constants";
import type { StructureVersionEntry } from "../../../types";

/**
 * v1.1 — baseline curriculum entries (Primary through A/L).
 *
 * IMMUTABLE. This file must never be edited once any academic year
 * references it — see the versioning README.
 *
 * Deliberately self-contained: every subject key, compulsory or optional,
 * is written out literally right here instead of imported from a shared
 * curriculum constants file. A shared file is allowed to grow or be
 * corrected over time, and if this file read from it directly, an academic
 * year's materialized `gradeSubjectConfig` would silently change shape
 * whenever someone edited the shared list — exactly the drift versioning
 * exists to prevent.
 *
 * Sources (re-verified against Sri Lankan Department of Examinations /
 * NIE material, 2026-09):
 * - Primary: four subject fields in grades 1-2 (first language, mathematics
 *   , environmental-related activities, religion); English and the second
 *   national language are added from grade 3.
 * - Junior secondary (6-9): the grade 6-9 core, with Civic Education
 *   introduced at grade 8 (grades 6-7 cover civics inside Geography and
 *   Life Competencies instead), and Practical & Technical Skills
 *   (implemented 2015) plus a pick-one aesthetic elective.
 * - O/L (10-11): the 9-subject layout — six compulsory subjects (first
 *   language, religion, English, mathematics, science, history) plus one
 *   subject from each of the three option baskets, per the Department of
 *   Examinations O/L subject timetable.
 * - A/L (12-13): stream subject pools (candidates take exactly three
 *   stream subjects) plus the compulsory common components — General
 *   English and the Common General Test.
 */

const buildEntries = (
  gradeLevel: number,
  basketCategory: string,
  subjectKeys: readonly string[]
): StructureVersionEntry[] =>
  subjectKeys.map((subjectKey, sortOrder) => ({
    gradeLevel,
    basketCategory,
    subjectKey,
    sortOrder,
  }));

// ─── Primary (Grades 1-5), no electives ────────────────────────────────────

const PRIMARY_GRADE_1_2_SUBJECTS = [
  "motherTongue",
  "mathematics",
  "environmentRelatedActivities",
  "religion",
] as const;

/** Grade 3 adds English and the second national language to the roster. */
const PRIMARY_GRADE_3_5_SUBJECTS = [
  "motherTongue",
  "mathematics",
  "environmentRelatedActivities",
  "religion",
  "englishLanguage",
  "secondNationalLanguage",
] as const;

const primaryEntries: StructureVersionEntry[] = [
  ...[1, 2].flatMap((gradeLevel) =>
    buildEntries(
      gradeLevel,
      COMPULSORY_BASKET_CATEGORY,
      PRIMARY_GRADE_1_2_SUBJECTS
    )
  ),
  ...[3, 4, 5].flatMap((gradeLevel) =>
    buildEntries(
      gradeLevel,
      COMPULSORY_BASKET_CATEGORY,
      PRIMARY_GRADE_3_5_SUBJECTS
    )
  ),
];

// ─── Junior Secondary (Grades 6-9) ──────────────────────────────────────────

/**
 * Grades 6-7 core. Civic Education as a standalone subject begins at
 * grade 8; in grades 6-7 its content sits inside Geography and Life
 * Competencies and Civic Education (grade 8 onward).
 */
const JUNIOR_SECONDARY_CORE_SUBJECTS_6_7 = [
  "religion",
  "motherTongue",
  "englishLanguage",
  "secondNationalLanguage",
  "mathematics",
  "science",
  "history",
  "geography",
  "healthAndPhysicalEducation",
  "lifeCompetencies",
  "practicalTechnicalSkills",
] as const;

const JUNIOR_SECONDARY_CORE_SUBJECTS_8_9 = [
  ...JUNIOR_SECONDARY_CORE_SUBJECTS_6_7,
  "civicEducation",
] as const;

/** Pick-one aesthetic elective — same subject keys as the O/L Basket II. */
const JUNIOR_SECONDARY_AESTHETIC_OPTIONS = [
  "art",
  "musicOriental",
  "musicWestern",
  "musicCarnatic",
  "dancingIndigenous",
  "dancingBharatha",
  "dramaTheatreSinhala",
  "dramaTheatreTamil",
  "dramaTheatreEnglish",
] as const;

const juniorSecondaryEntries: StructureVersionEntry[] = [
  ...[6, 7].flatMap((gradeLevel) => [
    ...buildEntries(
      gradeLevel,
      COMPULSORY_BASKET_CATEGORY,
      JUNIOR_SECONDARY_CORE_SUBJECTS_6_7
    ),
    ...buildEntries(
      gradeLevel,
      "aesthetic",
      JUNIOR_SECONDARY_AESTHETIC_OPTIONS
    ),
  ]),
  ...[8, 9].flatMap((gradeLevel) => [
    ...buildEntries(
      gradeLevel,
      COMPULSORY_BASKET_CATEGORY,
      JUNIOR_SECONDARY_CORE_SUBJECTS_8_9
    ),
    ...buildEntries(
      gradeLevel,
      "aesthetic",
      JUNIOR_SECONDARY_AESTHETIC_OPTIONS
    ),
  ]),
];

// ─── O/L (Grades 10-11) — 9 subjects: 6 compulsory + 3 basket picks ────────

const OL_FIXED_COMPULSORY = [
  "englishLanguage",
  "mathematics",
  "science",
  "history",
] as const;

/** Compulsory choice: every student sits exactly one religion paper. */
const OL_RELIGION_OPTIONS = [
  "buddhism",
  "saivanery",
  "catholicism",
  "christianity",
  "islam",
] as const;

/** Compulsory choice: every student sits exactly one first-language paper. */
const OL_MOTHER_TONGUE_OPTIONS = [
  "sinhalaLanguageAndLiterature",
  "tamilLanguageAndLiterature",
] as const;

/** Basket I — languages & humanities (one subject picked). */
const OL_BASKET_LANGUAGES_HUMANITIES = [
  "businessAccountingStudies",
  "geography",
  "civicEducation",
  "entrepreneurshipStudies",
  "secondLanguageSinhala",
  "secondLanguageTamil",
  "pali",
  "sanskrit",
  "french",
  "german",
  "hindi",
  "japanese",
  "arabic",
  "korean",
  "chinese",
  "russian",
] as const;

/** Basket II — aesthetics & arts (one subject picked). */
const OL_BASKET_AESTHETICS_ARTS = [
  "musicOriental",
  "musicWestern",
  "musicCarnatic",
  "art",
  "dancingIndigenous",
  "dancingBharatha",
  "appreciationEnglishLiteraryTexts",
  "appreciationSinhalaLiteraryTexts",
  "appreciationTamilLiteraryTexts",
  "appreciationArabicLiteraryTexts",
  "dramaTheatreSinhala",
  "dramaTheatreTamil",
  "dramaTheatreEnglish",
] as const;

/** Basket III — technical & vocational (one subject picked). */
const OL_BASKET_TECHNICAL_VOCATIONAL = [
  "ict",
  "agricultureFoodTechnology",
  "aquaticBioresourcesTechnology",
  "artsCrafts",
  "homeEconomics",
  "healthPhysicalEducation",
  "communicationMediaStudies",
  "designConstructionTechnology",
  "designMechanicalTechnology",
  "designElectricalElectronicTechnology",
  "electronicWritingShorthandSinhala",
  "electronicWritingShorthandTamil",
  "electronicWritingShorthandEnglish",
] as const;

const OL_GRADES = [10, 11] as const;

const olEntries: StructureVersionEntry[] = OL_GRADES.flatMap((gradeLevel) => [
  ...buildEntries(gradeLevel, COMPULSORY_BASKET_CATEGORY, OL_FIXED_COMPULSORY),
  ...buildEntries(gradeLevel, "religion", OL_RELIGION_OPTIONS),
  ...buildEntries(gradeLevel, "motherTongue", OL_MOTHER_TONGUE_OPTIONS),
  ...buildEntries(
    gradeLevel,
    "languagesHumanities",
    OL_BASKET_LANGUAGES_HUMANITIES
  ),
  ...buildEntries(gradeLevel, "aestheticsArts", OL_BASKET_AESTHETICS_ARTS),
  ...buildEntries(
    gradeLevel,
    "technicalVocational",
    OL_BASKET_TECHNICAL_VOCATIONAL
  ),
]);

// ─── A/L (Grades 12-13) — 3 stream subjects per candidate ──────────────────

/**
 * A/L stream subject pools. A candidate takes exactly three subjects from
 * one stream (or two from their stream plus one from another), so every
 * subject below is an option within its stream — none is implicitly
 * compulsory across the whole stream.
 *
 * Department of Examinations stream compositions:
 * - Bio Science: Biology + Chemistry are the fixed pair; the third subject
 *   is Physics OR Agricultural Science (Higher Mathematics is not a Bio
 *   Science option).
 * - Physical Science: Combined Mathematics + Physics are the fixed pair;
 *   the third subject is Chemistry OR ICT.
 * - Commerce: Accounting + Business Studies + Economics is the standard
 *   trio; Business Statistics, ICT or Geography may substitute the third.
 * - Technology: Engineering Technology (or Bio Systems Technology) +
 *   Science for Technology + ICT is the only allowed combination; the
 *   standalone civil/mechanical/electrical lists are selection
 *   *categories* within Engineering Technology papers, not subjects.
 */
const AL_STREAM_SUBJECTS: Record<string, readonly string[]> = {
  bioScience: ["biology", "chemistry", "physics", "agriculturalScience"],
  physicalScience: ["combinedMathematics", "physics", "chemistry", "ict"],
  commerce: [
    "accounting",
    "businessStudies",
    "economics",
    "businessStatistics",
    "ict",
    "geography",
  ],
  arts: [
    "buddhism",
    "hinduism",
    "christianity",
    "islam",
    "buddhistCivilization",
    "hinduCivilization",
    "christianCivilization",
    "islamicCivilization",
    "greekAndRomanCivilization",
    "politicalScience",
    "history",
    "geography",
    "logicAndScientificMethod",
    "economics",
    "agriculturalScience",
    "sinhala",
    "tamil",
    "english",
    "pali",
    "sanskrit",
    "arabic",
    "hindi",
    "french",
    "german",
    "russian",
    "chinese",
    "japanese",
    "korean",
    "malay",
    "homeEconomics",
    "dancingIndigenous",
    "dancingBharatha",
    "musicOriental",
    "musicCarnatic",
    "musicWestern",
    "art",
    "dramaTheatreSinhala",
    "dramaTheatreTamil",
    "dramaTheatreEnglish",
    "communicationMediaStudies",
  ],
  engineeringTechnology: [
    "engineeringTechnology",
    "scienceForTechnology",
    "ict",
  ],
  bioSystemsTechnology: ["bioSystemsTechnology", "scienceForTechnology", "ict"],
};

/** Compulsory for every A/L student regardless of stream. */
const AL_COMMON_COMPONENTS = ["commonGeneralTest", "generalEnglish"] as const;

const AL_GRADES = [12, 13] as const;

const alEntries: StructureVersionEntry[] = AL_GRADES.flatMap((gradeLevel) => [
  ...buildEntries(gradeLevel, COMPULSORY_BASKET_CATEGORY, AL_COMMON_COMPONENTS),
  ...Object.entries(AL_STREAM_SUBJECTS).flatMap(([stream, subjectKeys]) =>
    buildEntries(gradeLevel, stream, subjectKeys)
  ),
]);

export const v1_1_Entries: StructureVersionEntry[] = [
  ...primaryEntries,
  ...juniorSecondaryEntries,
  ...olEntries,
  ...alEntries,
];
