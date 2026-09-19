import { buildMarkBands } from "../../marking-guide";
import type { Base100GradeBounds, MarkBand } from "../../marking-guide";

/**
 * v1 marking guide — the school's letter-grade scales, versioned alongside
 * the curriculum entries so the gradeScale rows materialized for an
 * academic year never silently shift under it.
 *
 * Sources (checked 2026-09):
 * - GCE O/L: Department of Examinations national grading bands — A 75-100,
 *   B 65-74, C 50-64, S 35-49, W <35 (fail). The national fail grade "W"
 *   ("withheld/unqualified") is normalized to "F" in this guide so the app
 *   has a single fail letter; the pass/fail boundary (35) is identical.
 * - GCE A/L: same national bands as O/L (A/B/C/S, F below 40%), applied to
 *   the candidate's three stream subjects.
 * - Grade 5 Scholarship: two papers totalling 200 marks (2023 island-best
 *   was 198/200), scaled onto the school band set below.
 * - Primary/junior term tests and A/L Common General Test / General
 *   English: internal school assessments, out of 100.
 *
 * `A+` exists only on the school scale — the national O/L and A/L scales
 * top out at `A`. `D` is a junior/primary pass band that the senior scales
 * skip entirely (a mark in the D range on a senior scale is a fail).
 */

/** School scale (out of 100): A+ at 90, D band 30-39, pass at 35. */
const SCHOOL_TERM_BOUNDS: Base100GradeBounds = [
  ["A+", 90],
  ["A", 75],
  ["B", 65],
  ["C", 50],
  ["D", 35],
  ["F", 0],
];

/** Term tests with the D band: primary (1-5) and junior secondary (6-9). */
export const termScalePrimaryJunior: MarkBand[] = buildMarkBands(
  100,
  SCHOOL_TERM_BOUNDS
);

/**
 * Term tests without the D band: O/L (10-11) and A/L (12-13) students are
 * graded on their national scale even for internal exams, where a mark in
 * the 35-49 range is an S (or a fail below 35), not a D.
 */
const SENIOR_TERM_BOUNDS: Base100GradeBounds = [
  ["A+", 90],
  ["A", 75],
  ["B", 65],
  ["C", 50],
  ["S", 35],
  ["F", 0],
];

export const termScaleSenior: MarkBand[] = buildMarkBands(
  100,
  SENIOR_TERM_BOUNDS
);

/**
 * Grade 5 Scholarship (exam category "scholarship", maxMark 200): the
 * school's scholarship scale applied to the 200-mark total.
 */
export const scholarshipScale: MarkBand[] = buildMarkBands(
  200,
  SCHOOL_TERM_BOUNDS
);

/**
 * GCE O/L national scale (exam category "levelTest", grades 10-11): A
 * 75-100, B 65-74, C 50-64, S 35-49, W(<35) normalized to F. Applied per
 * subject; there is no A+ on the national certificate.
 */
const OL_BOUNDS: Base100GradeBounds = [
  ["A", 75],
  ["B", 65],
  ["C", 50],
  ["S", 35],
  ["F", 0],
];

export const olScale: MarkBand[] = buildMarkBands(100, OL_BOUNDS);

/**
 * GCE A/L national scale (exam category "levelTest", grades 12-13): same
 * bands as O/L, applied to each of the candidate's three stream subjects.
 * A/L S sits at 40-54% on some Department of Examinations statistical
 * tables; 35 is the conventional school-side pass floor used here.
 */
export const alScale: MarkBand[] = buildMarkBands(100, OL_BOUNDS);

/**
 * A/L General English and Common General Test: compulsory common
 * components reported on a pass/fail basis nationally; graded internally
 * on the senior school scale.
 */
export const alCommonScale: MarkBand[] = buildMarkBands(
  100,
  SENIOR_TERM_BOUNDS
);

/**
 * The one guide to use for a grade level during term tests, and the scale
 * keyed by exam category for national assessments. Keyed by grade level so
 * the primary/junior D band never leaks into the senior school.
 */
export const V1_TERM_SCALES: Record<number, MarkBand[]> = Object.fromEntries([
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((gradeLevel) => [
    gradeLevel,
    termScalePrimaryJunior,
  ]),
  ...[10, 11, 12, 13].map((gradeLevel) => [gradeLevel, termScaleSenior]),
]) as Record<number, MarkBand[]>;

export const V1_EXAM_CATEGORY_SCALES = {
  firstTerm: termScaleSenior,
  secondTerm: termScaleSenior,
  thirdTerm: termScaleSenior,
  scholarship: scholarshipScale,
  levelTest: termScaleSenior,
} as const;
