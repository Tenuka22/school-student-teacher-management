import { GRADE_LEVELS } from "../grades";
import type {
  MarkingGuide,
  StructureSubversionModule,
  StructureVersion,
  StructureVersionEntry,
} from "./types";
import { v1Version } from "./versions/v1";

export type {
  MarkingGuide,
  StructureDelta,
  StructureSubversionModule,
  StructureVersion,
  StructureVersionEntry,
} from "./types";
export { COMPULSORY_BASKET_CATEGORY } from "./constants";

/**
 * Every structure version the school has ever shipped, keyed by its
 * immutable `key`. Append new versions here — never edit an existing
 * version's subversion files or registry entry.
 *
 * - Year-level curriculum change → new major version (e.g. `v2/`)
 * - Term-level change → new subversion within the version (e.g. `v1/v1.2/`)
 */
export const STRUCTURE_VERSIONS: Record<string, StructureVersion> = {
  v1: v1Version,
};

/**
 * The version new academic years should default to when the admin hasn't
 * explicitly picked a different one (typically overridden per-request with
 * the most recently created academic year's own version instead).
 */
export const LATEST_STRUCTURE_VERSION_KEY = "v1";

const isKnownGradeLevel = (gradeLevel: number): boolean =>
  (GRADE_LEVELS as readonly number[]).includes(gradeLevel);

/**
 * Basket category is intentionally open-ended (covers `COMPULSORY_BASKET_CATEGORY`,
 * O/L optional baskets, A/L streams, and elective slots like "op1") — there
 * is no single global enum to check membership against, so this only rules
 * out empty/malformed values.
 */
const isKnownBasketCategory = (basketCategory: string): boolean =>
  basketCategory.trim().length > 0;

/**
 * Subject keys are defined entirely within each version file — there is
 * no shared global subject registry to check membership against (each
 * version is deliberately self-contained). This only rules out
 * empty/malformed values.
 */
const isKnownSubjectKey = (subjectKey: string): boolean =>
  subjectKey.trim().length > 0;

const validateEntries = (
  entries: StructureVersionEntry[],
  context: string
): void => {
  for (const entry of entries) {
    if (!isKnownGradeLevel(entry.gradeLevel)) {
      throw new Error(
        `${context} references unknown grade level ${entry.gradeLevel}`
      );
    }
    if (!isKnownBasketCategory(entry.basketCategory)) {
      throw new Error(`${context} has an empty basket category`);
    }
    if (!isKnownSubjectKey(entry.subjectKey)) {
      throw new Error(`${context} has an empty subject key`);
    }
  }
};

const validateMarkingGuideBands = (
  guideKey: string,
  guide: MarkingGuide,
  context: string
): void => {
  if (guide.bands.length === 0) {
    throw new Error(`${context}: marking guide "${guideKey}" has no bands`);
  }

  // Bands are ordered from the highest grade down: each band's top mark
  // must be exactly one below the band above its minimum.
  const isDescending = guide.bands.every(
    (band, index) =>
      index === 0 ||
      (guide.bands[index - 1]?.minMark ?? Number.NaN) - 1 === band.maxMark
  );
  if (!isDescending) {
    throw new Error(
      `${context}: marking guide "${guideKey}" bands must be contiguous and ordered from the highest grade down`
    );
  }

  for (const band of guide.bands) {
    if (band.minMark < 0 || band.maxMark > guide.maxMark) {
      throw new Error(
        `${context}: marking guide "${guideKey}" band ${band.grade} exceeds the 0-${guide.maxMark} mark range`
      );
    }
    if (band.minMark > band.maxMark) {
      throw new Error(
        `${context}: marking guide "${guideKey}" band ${band.grade} has minMark above its maxMark`
      );
    }
  }
};

const validateStructureVersion = (version: StructureVersion): void => {
  const subversionKeys = Object.keys(version.subversions)
    .map(Number)
    .toSorted((a, b) => a - b);

  if (subversionKeys.length === 0) {
    throw new Error(`Structure version "${version.key}" has no subversions`);
  }

  if (subversionKeys[0] !== 1) {
    throw new Error(
      `Structure version "${version.key}" must start with subversion 1`
    );
  }

  for (let i = 0; i < subversionKeys.length; i += 1) {
    const expected = i + 1;
    if (subversionKeys.at(i) !== expected) {
      throw new Error(
        `Structure version "${version.key}" has gap in subversion numbering: expected ${expected}, got ${subversionKeys.at(i)}`
      );
    }
  }

  for (const [num, sub] of Object.entries(version.subversions)) {
    const ctx = `Structure version "${version.key}" subversion ${num}`;
    if (sub.subversion !== Number(num)) {
      throw new Error(
        `${ctx}: subversion number ${sub.subversion} does not match registry key ${num}`
      );
    }
    validateEntries(sub.entries, ctx);
  }

  for (const [guideKey, guide] of Object.entries(version.markingGuides)) {
    validateMarkingGuideBands(
      guideKey,
      guide,
      `Structure version "${version.key}"`
    );
  }

  if (subversionKeys.length > 1) {
    const lastKey = subversionKeys.at(-1);
    if (lastKey === undefined) {
      throw new Error(`Structure version "${version.key}" has no subversions`);
    }
    const lastSub = version.subversions[lastKey];
    if (!lastSub) {
      throw new Error(
        `Structure version "${version.key}" has no latest subversion`
      );
    }
    if (version.entries !== lastSub.entries) {
      throw new Error(
        `Structure version "${version.key}": top-level entries must reference the latest subversion's entries (got a different array reference)`
      );
    }
  }
};

// Fail fast at module load if a shipped version is malformed, rather than at
// the moment an admin tries to create an academic year with it.
for (const version of Object.values(STRUCTURE_VERSIONS)) {
  validateStructureVersion(version);
}

/**
 * Look up a structure version by key, throwing if it isn't registered.
 * Returns the version with entries resolved to the latest subversion.
 */
export const getStructureVersion = (key: string): StructureVersion => {
  const version = STRUCTURE_VERSIONS[key];
  if (!version) {
    throw new Error(`Unknown structure version key: "${key}"`);
  }
  return version;
};

/**
 * Look up a specific subversion within a structure version.
 * Returns the subversion module, or undefined if that subversion doesn't exist.
 */
export const getStructureSubversion = (
  versionKey: string,
  subversionNumber: number
): StructureSubversionModule | undefined => {
  const version = STRUCTURE_VERSIONS[versionKey];
  if (!version) {
    throw new Error(`Unknown structure version key: "${versionKey}"`);
  }
  return version.subversions[subversionNumber];
};

/**
 * Get the latest subversion number for a structure version.
 */
export const getLatestSubversionNumber = (versionKey: string): number => {
  const version = STRUCTURE_VERSIONS[versionKey];
  if (!version) {
    throw new Error(`Unknown structure version key: "${versionKey}"`);
  }
  return Math.max(...Object.keys(version.subversions).map(Number));
};

/**
 * Resolve entries for a specific version + subversion combination.
 * If subversionNumber is omitted, returns the latest subversion's entries.
 */
export const resolveEntries = (
  versionKey: string,
  subversionNumber?: number
): StructureVersionEntry[] => {
  const version = getStructureVersion(versionKey);
  if (subversionNumber === undefined) {
    return version.entries;
  }
  const sub = version.subversions[subversionNumber];
  if (!sub) {
    throw new Error(
      `Structure version "${versionKey}" has no subversion ${subversionNumber}`
    );
  }
  return sub.entries;
};

/**
 * Every subject key used by any registered version, deduplicated. Used as
 * the closed set `gradeSubjectConfig`/`subjectAssignment` subject keys are
 * validated against, since there's no standalone curriculum constants file
 * — the versions themselves are the source of truth.
 */
const seenSubjectKeys: Record<string, true> = {};
for (const version of Object.values(STRUCTURE_VERSIONS)) {
  for (const entry of version.entries) {
    seenSubjectKeys[entry.subjectKey] = true;
  }
}

export const ALL_KNOWN_SUBJECT_KEYS = Object.keys(seenSubjectKeys) as [
  string,
  ...string[],
];

/**
 * Look up a marking guide from a structure version by its scope key
 * (e.g. "scholarship", "ol"). Throws if the version or guide doesn't exist.
 */
export const getMarkingGuide = (
  versionKey: string,
  guideKey: string
): MarkingGuide => {
  const version = getStructureVersion(versionKey);
  const guide = version.markingGuides[guideKey];
  if (!guide) {
    throw new Error(
      `Structure version "${versionKey}" has no marking guide "${guideKey}"`
    );
  }
  return guide;
};

/**
 * Letter grade for a raw mark against a marking guide's bands.
 * Returns undefined when the mark falls outside the guide's total range
 * (e.g. a negative mark), rather than guessing.
 */
export const gradeForMark = (
  guide: MarkingGuide,
  mark: number
): string | undefined =>
  guide.bands.find((band) => mark >= band.minMark && mark <= band.maxMark)
    ?.grade;
