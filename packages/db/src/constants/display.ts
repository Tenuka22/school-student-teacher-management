/**
 * Display names for the keys the database stores.
 *
 * The database keeps curriculum subjects, employment states and leave types as
 * stable machine keys (`environmentRelatedActivities`, `onLeave`,
 * `musicCarnatic`) because those keys are referenced by structure versions,
 * timetables and exports. Every one of them used to reach the screen as-is, so
 * a timetable cell, an Excel export and a teacher's own profile could each
 * render the same appointment three different ways — and often as raw camelCase.
 *
 * This module is the single place a stored key becomes a word. It lives in
 * `packages/db` rather than in the web app because the server generates the
 * Excel and PDF exports too: an export that says `musicCarnatic` while the
 * timetable says "Music (Carnatic)" is the same bug in a different file.
 *
 * Every lookup has a fallback that turns an unknown key into readable words, so
 * a subject added to a future curriculum version degrades to
 * "Environment Related Activities" instead of leaking `environmentRelatedActivities`.
 */
import { APPOINTMENT_TYPES, EMPLOYMENT_STATUSES } from "./teachers";

/** Employment statuses, read from the constants rather than restated. */
export const EMPLOYMENT_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(
    Object.entries(EMPLOYMENT_STATUSES).map(([key, value]) => [
      key,
      value.label,
    ])
  );

/** Appointment types, read from the constants rather than restated. */
export const APPOINTMENT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(APPOINTMENT_TYPES).map(([key, value]) => [key, value.label])
);

/** Curriculum subject keys, as written in the v1.1 structure version. */
export const SUBJECT_LABELS: Record<string, string> = {
  // ─── Compulsory and languages ───
  motherTongue: "Mother Tongue",
  secondNationalLanguage: "Second National Language",
  english: "English",
  englishLanguage: "English Language",
  generalEnglish: "General English",
  sinhala: "Sinhala",
  tamil: "Tamil",
  french: "French",
  german: "German",
  spanish: "Spanish",
  arabic: "Arabic",
  hindi: "Hindi",
  japanese: "Japanese",
  korean: "Korean",
  chinese: "Chinese",
  russian: "Russian",
  malay: "Malay",
  pali: "Pali",
  sanskrit: "Sanskrit",
  saivanery: "Saiva Neri",
  secondLanguageSinhala: "Sinhala (Second Language)",
  secondLanguageTamil: "Tamil (Second Language)",
  sinhalaLanguageAndLiterature: "Sinhala Language & Literature",
  tamilLanguageAndLiterature: "Tamil Language & Literature",
  languagesHumanities: "Languages & Humanities",
  appreciationSinhalaLiteraryTexts: "Appreciation of Sinhala Literary Texts",
  appreciationTamilLiteraryTexts: "Appreciation of Tamil Literary Texts",
  appreciationEnglishLiteraryTexts: "Appreciation of English Literary Texts",
  appreciationArabicLiteraryTexts: "Appreciation of Arabic Literary Texts",

  // ─── Mathematics and science ───
  mathematics: "Mathematics",
  combinedMathematics: "Combined Mathematics",
  science: "Science",
  biology: "Biology",
  chemistry: "Chemistry",
  physics: "Physics",
  scienceForTechnology: "Science for Technology",
  agriculturalScience: "Agricultural Science",
  aquaticBioresourcesTechnology: "Aquatic Bioresources Technology",
  bioSystemsTechnology: "Bio Systems Technology",
  businessStatistics: "Business Statistics",
  logicAndScientificMethod: "Logic & Scientific Method",
  lifeCompetencies: "Life Competencies",
  environmentRelatedActivities: "Environmental-Related Activities",
  healthAndPhysicalEducation: "Health & Physical Education",
  healthPhysicalEducation: "Health & Physical Education",
  homeEconomics: "Home Economics",
  ict: "Information & Communication Technology",
  communicationMediaStudies: "Communication & Media Studies",
  technicalVocational: "Technical & Vocational",
  practicalTechnicalSkills: "Practical & Technical Skills",
  engineeringTechnology: "Engineering Technology",
  designConstructionTechnology: "Design & Construction Technology",
  designElectricalElectronicTechnology: "Design & Electronic Technology",
  designMechanicalTechnology: "Design & Mechanical Technology",
  electronicWritingShorthandEnglish: "Electronic Writing & Shorthand (English)",
  electronicWritingShorthandSinhala: "Electronic Writing & Shorthand (Sinhala)",
  electronicWritingShorthandTamil: "Electronic Writing & Shorthand (Tamil)",

  // ─── Commerce, business, economics ───
  accounting: "Accounting",
  businessStudies: "Business Studies",
  businessAccountingStudies: "Business & Accounting Studies",
  entrepreneurshipStudies: "Entrepreneurship Studies",
  economics: "Economics",

  // ─── Social studies ───
  geography: "Geography",
  history: "History",
  politicalScience: "Political Science",
  civicEducation: "Civic Education",
  greekAndRomanCivilization: "Greek & Roman Civilization",

  // ─── Religion ───
  religion: "Religion",
  buddhism: "Buddhism",
  hinduism: "Hinduism",
  christianity: "Christianity",
  islam: "Islam",
  catholicism: "Catholicism",
  buddhistCivilization: "Buddhist Civilization",
  hinduCivilization: "Hindu Civilization",
  christianCivilization: "Christian Civilization",
  islamicCivilization: "Islamic Civilization",

  // ─── Arts, music, drama, dance ───
  art: "Art",
  aesthetic: "Aesthetic Studies",
  artsCrafts: "Arts & Crafts",
  aestheticArts: "Arts & Aesthetics",
  musicCarnatic: "Music (Carnatic)",
  musicOriental: "Music (Oriental)",
  musicWestern: "Music (Western)",
  dancingBharatha: "Dancing (Bharatha)",
  dancingIndigenous: "Dancing (Indigenous)",
  dramaTheatreEnglish: "Drama & Theatre (English)",
  dramaTheatreSinhala: "Drama & Theatre (Sinhala)",
  dramaTheatreTamil: "Drama & Theatre (Tamil)",

  // ─── Examinations ───
  commonGeneralTest: "Common General Test",
};

/**
 * Splits a camelCase key into words, so an unrecognised key still reads as a
 * phrase rather than as code.
 */
export const humanizeKey = (key: string): string => {
  const spaced = key
    .replaceAll(/(?<lower>[a-z\d])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
    .replaceAll(/(?<acronym>[A-Z]+)(?<word>[A-Z][a-z])/gu, "$<acronym> $<word>")
    .trim();

  if (spaced.length === 0) {
    return key;
  }

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** The words to show for a curriculum subject key. */
export const subjectLabel = (subjectKey: string | null | undefined): string => {
  if (!subjectKey) {
    return "—";
  }

  return SUBJECT_LABELS[subjectKey] ?? humanizeKey(subjectKey);
};

/**
 * A stored employment status as a word.
 *
 * The teacher dashboard used to print the raw value — a teacher's own record
 * reading `onLeave` — and carried its own appointment map listing `probation`,
 * `substitute` and `visiting`, none of which are appointment types this College
 * uses. Both now read the constants they are describing.
 */
export const employmentStatusLabel = (
  status: string | null | undefined
): string => {
  if (!status) {
    return "Not set";
  }

  return EMPLOYMENT_STATUS_LABELS[status] ?? humanizeKey(status);
};

/** A stored appointment type as a word. */
export const appointmentTypeLabel = (
  appointmentType: string | null | undefined
): string => {
  if (!appointmentType) {
    return "Not set";
  }

  return APPOINTMENT_LABELS[appointmentType] ?? humanizeKey(appointmentType);
};
