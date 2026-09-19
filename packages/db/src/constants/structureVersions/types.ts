/**
 * A single `gradeSubjectConfig` row template: which subject belongs to which
 * basket category for a given grade level, in a given structure version.
 */
export interface StructureVersionEntry {
  gradeLevel: number;
  /**
   * `COMPULSORY_BASKET_CATEGORY` for a grade's non-elective subjects, an
   * O/L optional basket name, an A/L stream key, or any other
   * version-defined elective slot (e.g. "op1"). Every category and its
   * members are defined entirely within the version file that uses them.
   */
  basketCategory: string;
  /** A subject key literal, defined within this version file. */
  subjectKey: string;
  sortOrder: number;
}

/**
 * Describes what changed between one subversion and the next.
 * Entries are identified by the triple (gradeLevel, basketCategory, subjectKey).
 */
export interface StructureDelta {
  added?: StructureVersionEntry[];
  removed?: {
    gradeLevel: number;
    basketCategory: string;
    subjectKey: string;
  }[];
  patched?: {
    gradeLevel: number;
    basketCategory: string;
    subjectKey: string;
    patch: Partial<Pick<StructureVersionEntry, "sortOrder">>;
    reason?: string;
  }[];
}

/**
 * A single subversion within a structure version. Each subversion is an
 * immutable snapshot of the curriculum entries at a point in time (typically
 * aligned to an academic term). Subversions are numbered sequentially
 * starting from 1; once shipped, a subversion file must never be edited.
 */
export interface StructureSubversionModule {
  subversion: number;
  description: string;
  createdAt: string;
  entries: StructureVersionEntry[];
  /** What changed from the previous subversion (absent for the baseline). */
  delta?: StructureDelta;
}

/**
 * Letter-grade mark bands for one assessment context (a stage's term tests
 * or a national exam category), shipped as part of a structure version so
 * the `gradeScale` rows materialized for an academic year never silently
 * shift under it.
 */
export interface MarkingGuide {
  /** Shown in the admin marking-guide picker. */
  description: string;
  /** The mark this scale is out of (100 for most, 200 for the Scholarship paper). */
  maxMark: number;
  /** Inclusive, contiguous mark bands ordered from the highest grade down. */
  bands: {
    grade: string;
    minMark: number;
    maxMark: number;
  }[];
}

/**
 * A named, immutable snapshot of the school's subject/curriculum structure,
 * composed of sequential subversions. Each academic year references a
 * version key; the materialized `gradeSubjectConfig` rows come from a
 * specific subversion's entries.
 *
 * - Year-level changes (new curriculum) → new major version (v2)
 * - Term-level changes (add/remove a subject) → new subversion (v1.2)
 */
export interface StructureVersion {
  /** Matches the registry key in `index.ts`; immutable once shipped. */
  key: string;
  /** Shown in the admin structure-version picker. */
  description: string;
  /** Subversions keyed by sequential number (1 = baseline). */
  subversions: Record<number, StructureSubversionModule>;
  /**
   * Convenience: the latest subversion's entries. Computed at registration
   * time so existing consumers don't need to change.
   */
  entries: StructureVersionEntry[];
  /**
   * Letter-grade marking guides shipped with this version, keyed by an
   * arbitrary scope literal defined by the version (e.g. "termPrimary",
   * "scholarship", "ol", "al").
   */
  markingGuides: Record<string, MarkingGuide>;
}
