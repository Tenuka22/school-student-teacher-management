/**
 * Letter grades used by the v1 marking guides.
 *
 * `A+` honours school-level term-test distinction (absent from the national
 * O/L & A/L scales). `S` is the lowest pass on the O/L & A/L scales, `D` the
 * junior/primary pass band, and `F` the only fail grade (the national O/L
 * fail grade is called `W`, which v1 intentionally normalizes to `F`).
 */
export const V1_MARKING_GUIDE_GRADES = [
  "A+",
  "A",
  "B",
  "C",
  "D",
  "S",
  "F",
] as const;

export type V1MarkingGuideGrade = (typeof V1_MARKING_GUIDE_GRADES)[number];

export interface MarkBand {
  /** Letter grade recorded on the mark. */
  grade: V1MarkingGuideGrade;
  /** Lowest mark (inclusive) earning this grade. */
  minMark: number;
  /** Highest mark (inclusive) earning this grade. */
  maxMark: number;
}

/**
 * A base-100 table of grade lower bounds, ordered from the highest grade
 * down. Expressed as percentages so one table can be scaled onto any
 * `maxMark` (100 for term tests and national exams, 200 for the Grade 5
 * Scholarship paper).
 */
export type Base100GradeBounds = readonly (readonly [
  V1MarkingGuideGrade,
  number,
])[];

/**
 * Expand a base-100 lower-bound table into inclusive, contiguous mark
 * bands for a specific `maxMark`.
 *
 * Each band's minimum is `ceil(percentage × maxMark)` and its maximum is
 * one mark below the band above it, so the bands tile `0..maxMark` exactly
 * with no gaps or overlaps regardless of how the percentages round. The
 * top band absorbs the remainder up to `maxMark`, so a "90+" A+ band on a
 * 200-mark exam becomes 180–200 rather than 180–270.
 */
export const buildMarkBands = (
  maxMark: number,
  base100Bounds: Base100GradeBounds
): MarkBand[] =>
  base100Bounds.map(([grade, minPercent], index) => {
    const minMark = Math.ceil((minPercent / 100) * maxMark);
    const bandAbove = base100Bounds[index - 1];
    const maxMarkForGrade =
      bandAbove === undefined
        ? maxMark
        : Math.ceil((bandAbove[1] / 100) * maxMark) - 1;
    return {
      grade,
      minMark,
      maxMark: maxMarkForGrade,
    };
  });
