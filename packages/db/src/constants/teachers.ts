/**
 * Teacher-related constants for Sri Lankan education system.
 * All enums and constants are defined here for type safety and consistency.
 */

// ─── Employment/Appointment Types ─────────────────────────────────────────────

/**
 * Sri Lankan MOE teacher appointment types.
 */
export const APPOINTMENT_TYPES = {
  permanent: {
    label: "Permanent",
    description: "Permanent appointment by Ministry of Education",
    requiresDocument: "appointmentLetter",
  },
  temporary: {
    label: "Temporary",
    description: "Temporary appointment for specified period",
    requiresDocument: "temporaryAppointmentLetter",
  },
  specifiedPeriod: {
    label: "Specified Period",
    description: "Appointment for a fixed duration (e.g., 1 year)",
    requiresDocument: "specifiedPeriodLetter",
  },
  directRecruitment: {
    label: "Direct Recruitment",
    description: "Directly recruited by school board/MOE",
    requiresDocument: "recruitmentLetter",
  },
  promoted: {
    label: "Promoted",
    description: "Promoted from lower grade (e.g., Grade 2 to Grade 1)",
    requiresDocument: "promotionLetter",
  },
  transferred: {
    label: "Transferred",
    description: "Transferred from another school",
    requiresDocument: "transferLetter",
  },
  acting: {
    label: "Acting",
    description: "Acting appointment (temporary cover)",
    requiresDocument: "actingAppointmentLetter",
  },
  contract: {
    label: "Contract",
    description: "Fixed-term contract",
    requiresDocument: "contractAgreement",
  },
} as const;

export type AppointmentType = keyof typeof APPOINTMENT_TYPES;

/**
 * Documents required for each appointment type.
 */
export const APPOINTMENT_DOCUMENT_REQUIREMENTS: Record<
  AppointmentType,
  string[]
> = {
  permanent: ["appointmentLetter"],
  temporary: ["temporaryAppointmentLetter"],
  specifiedPeriod: ["specifiedPeriodLetter"],
  directRecruitment: ["recruitmentLetter"],
  promoted: ["promotionLetter", "previousAppointmentLetter"],
  transferred: ["transferLetter", "previousAppointmentLetter"],
  acting: ["actingAppointmentLetter"],
  contract: ["contractAgreement"],
};

// ─── Employment Status ────────────────────────────────────────────────────────

export const EMPLOYMENT_STATUSES = {
  active: { label: "Active", description: "Currently employed" },
  onLeave: {
    label: "On Leave",
    description: "On leave (maternity, sickness, etc.)",
  },
  suspended: { label: "Suspended", description: "Suspended from duties" },
  retired: { label: "Retired", description: "Retired from service" },
  terminated: { label: "Terminated", description: "Employment terminated" },
} as const;

export type EmploymentStatus = keyof typeof EMPLOYMENT_STATUSES;

// ─── Class Teacher Reassignment Reasons ───────────────────────────────────────

/**
 * Why a class's homeroom teacher was replaced or cleared mid-year. Required
 * whenever an existing assignment changes (replacement or clearing), never
 * required for a brand-new assignment onto an empty slot.
 */
export const TEACHER_REASSIGNMENT_REASONS = {
  resigned: { label: "Resigned" },
  transferred: { label: "Transferred to another school" },
  retired: { label: "Retired" },
  extendedLeave: { label: "Extended leave" },
  restructuring: { label: "Class/section restructuring" },
  performance: { label: "Performance-related reassignment" },
  other: { label: "Other" },
} as const;

export type TeacherReassignmentReason =
  keyof typeof TEACHER_REASSIGNMENT_REASONS;

// ─── Qualification Levels (Ordered Hierarchy) ─────────────────────────────────

/**
 * Sri Lankan teacher qualification levels in ascending order.
 * Level number indicates relative seniority for comparison.
 */
export const QUALIFICATION_LEVELS = {
  // Secondary education qualifications
  gceOl: {
    level: 1,
    label: "GCE O/L",
    description: "Ordinary Level - Minimum for primary assistant",
  },
  gceAl: {
    level: 2,
    label: "GCE A/L",
    description: "Advanced Level - Minimum for primary teacher",
  },

  // Diplomas & Certificates
  teacherTrainingCertificate: {
    level: 3,
    label: "Teacher Training Certificate",
    description: "Short-term teaching certification",
  },
  nationalDiplomaTeaching: {
    level: 3,
    label: "National Diploma in Teaching (NDT)",
    description: "2-year diploma after A/L - qualifies for primary/secondary",
  },
  diplomaInEducation: {
    level: 4,
    label: "Diploma in Education",
    description: "Post-A/L teaching diploma",
  },

  // Degrees
  bachelorArts: {
    level: 5,
    label: "Bachelor of Arts (BA)",
    description: "3-year degree",
  },
  bachelorScience: {
    level: 5,
    label: "Bachelor of Science (BSc)",
    description: "3-year degree",
  },
  bachelorTechnology: {
    level: 5,
    label: "Bachelor of Technology (BTech)",
    description: "3-year technology degree",
  },
  bachelorEducation: {
    level: 6,
    label: "Bachelor of Education (BEd)",
    description: "4-year education degree - qualifies for all levels",
  },

  // Post-graduate
  postGraduateDiploma: {
    level: 7,
    label: "Post Graduate Diploma in Education (PGDipEd)",
    description: "After degree - converts to teaching credential",
  },
  subjectCertification: {
    level: 7,
    label: "Subject-Specific Certification",
    description: "Specialized subject teaching certification",
  },
  masters: {
    level: 8,
    label: "Master's Degree (MA/MSc/MEd)",
    description: "Postgraduate degree",
  },
  phD: {
    level: 9,
    label: "Doctorate (PhD)",
    description: "Highest academic qualification",
  },
} as const;

export type QualificationLevel = keyof typeof QUALIFICATION_LEVELS;

/**
 * Ordered list of qualification keys for comparison purposes.
 * Higher index = higher qualification level.
 */
export const QUALIFICATION_ORDER = [
  "gceOl",
  "gceAl",
  "teacherTrainingCertificate",
  "nationalDiplomaTeaching",
  "diplomaInEducation",
  "bachelorArts",
  "bachelorScience",
  "bachelorTechnology",
  "bachelorEducation",
  "postGraduateDiploma",
  "subjectCertification",
  "masters",
  "phD",
] as const;

/**
 * Get the numeric level for a qualification.
 */
export const getQualificationLevel = (
  qualification: QualificationLevel
): number => QUALIFICATION_LEVELS[qualification].level;

/**
 * Compare two qualifications - returns positive if q1 > q2, negative if q1 < q2, 0 if equal.
 */
export const compareQualifications = (
  q1: QualificationLevel,
  q2: QualificationLevel
): number => {
  const level1 = QUALIFICATION_LEVELS[q1].level;
  const level2 = QUALIFICATION_LEVELS[q2].level;
  return level1 - level2;
};

/**
 * Get the highest qualification from an array.
 */
export const getHighestQualification = (
  qualifications: QualificationLevel[]
): QualificationLevel | null => {
  let highest: QualificationLevel | null = null;
  for (const candidate of qualifications) {
    if (highest === null || compareQualifications(candidate, highest) > 0) {
      highest = candidate;
    }
  }
  return highest;
};

// ─── Document Types for Approval ─────

/**
 * Types of documents that require admin approval.
 */
export const DOCUMENT_TYPES = {
  nationalIdentityCard: {
    label: "National Identity Card (NIC)",
    description: "Scan of NIC front and back",
    requiredFor: ["employmentVerification"],
  },
  passport: {
    label: "Passport",
    description: "Scan of passport (for foreign nationals without NIC)",
    requiredFor: ["employmentVerification"],
  },
  appointmentLetter: {
    label: "Appointment Letter",
    description: "Official appointment letter from Ministry of Education",
    requiredFor: ["employmentVerification"],
  },
  degreeCertificate: {
    label: "Degree Certificate",
    description: "University degree certificate",
    requiredFor: ["qualificationVerification"],
  },
  teachingLicense: {
    label: "Teaching License/Certificate",
    description: "Official teaching license or certification",
    requiredFor: ["qualificationVerification"],
  },
  marriageCertificate: {
    label: "Marriage Certificate",
    description: "For spouse information verification",
    requiredFor: ["spouseVerification"],
  },
  birthCertificate: {
    label: "Birth Certificate",
    description: "For age verification (if NIC not available)",
    requiredFor: ["ageVerification"],
  },
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;

/**
 * Documents required for employment verification.
 */
export const EMPLOYMENT_VERIFICATION_DOCUMENTS: DocumentType[] = [
  "nationalIdentityCard",
  "appointmentLetter",
];

/**
 * Documents required for qualification verification.
 */
export const QUALIFICATION_VERIFICATION_DOCUMENTS: DocumentType[] = [
  "degreeCertificate",
  "teachingLicense",
];

// ─── Subject Specialization Categories ────────────────────────────────────────

/**
 * Categories for teacher subject specializations.
 */
export const SUBJECT_SPECIALIZATION_CATEGORIES = {
  primary: "primary",
  languages: "languages",
  mathematics: "mathematics",
  science: "science",
  humanities: "humanities",
  commerce: "commerce",
  artsAesthetics: "artsAesthetics",
  physicalEducation: "physicalEducation",
  technology: "technology",
  vocational: "vocational",
} as const;

export type SubjectSpecializationCategory =
  keyof typeof SUBJECT_SPECIALIZATION_CATEGORIES;
