import { CLASS_CATEGORIES } from "@/components/staff/class-assignment/class-categories";
import type { ClassCategoryKey } from "@/components/staff/class-assignment/class-categories";
import {
  omitEmptyParams,
  readOneOf,
  readString,
} from "@/components/ui-patterns/data-table/list-search";
import type { RouteSearch } from "@/components/ui-patterns/data-table/list-search";

/**
 * The teacher-timetable page's URL contract:
 * `?teacher=&section=&grade=&class=`.
 *
 * Two different jobs sit in one object, and they must not be confused:
 *
 * - **`teacher` says which timetable is on screen** — the same job the
 *   accounts list's `?q=` does, and the reason it is in the URL at all: the
 *   picker used to live in `useState`, so a refresh, a shared link and the Back
 *   button all lost the teacher and landed on forty free slots with no answer
 *   to "whose week was I looking at?".
 * - **`section`, `grade` and `class` narrow what is shown**, and are the same
 *   three the period-assignment page carries, in the same order, with the same
 *   cascade. They are read-only over the timetable already fetched: choosing a
 *   grade never re-requests anything, it filters rows the page already has.
 *
 * ## What is checked here, and what is not
 *
 * The *shape* of each value is checked here, with the readers every other list
 * in the app uses: the section must be one of the three the app has, the grade
 * a whole number in 1–13, the teacher and the class non-empty ids.
 *
 * The *relationships* are not, and deliberately so: whether grade 7 belongs to
 * the section, and whether a class is taught by this teacher, are questions
 * about the College's timetable, and a URL parser has never heard of them. They
 * are settled in `useTeacherTimetablePage` against the timetable it has loaded,
 * and a pair that does not line up is treated as "not chosen" rather than
 * corrected — the same rule the period-assignment page follows, and for the
 * same reason: a hand-edited link that is half valid should keep the half that
 * is.
 */
const CATEGORY_KEYS: readonly ClassCategoryKey[] = CLASS_CATEGORIES.map(
  (category) => category.key
);

/**
 * A grade as the string the dropdowns compare with, or nothing.
 *
 * `Number` alone would accept `"7abc"` and `""` alike and `parseInt` would accept
 * `"7abc"` as 7. A grade is a whole number between 1 and 13 here, and the upper
 * bound is not arbitrary: it is the widest range `CLASS_CATEGORIES` covers, and a
 * number outside every section's range has no section to belong to.
 */
const readGrade = (raw: unknown): string => {
  const value = readString(raw, 8);
  if (!/^\d{1,2}$/u.test(value)) {
    return "";
  }

  const grade = Number(value);

  return grade >= 1 && grade <= 13 ? value : "";
};

/** What the page is showing, as the URL says. Every field is already valid. */
export interface TeacherTimetableSearch {
  /** The teacher whose week this is. Empty until one is chosen. */
  teacher: string;
  section: ClassCategoryKey | "";
  grade: string;
  /** The class to narrow to. `class` reads better in a URL than `classId`. */
  class: string;
}

export const validateTeacherTimetableSearch = (
  search: Record<string, unknown>
): TeacherTimetableSearch => ({
  teacher: readString(search.teacher, 64),
  section: readOneOf(search.section, CATEGORY_KEYS) ?? "",
  grade: readGrade(search.grade),
  class: readString(search.class, 64),
});

/**
 * What the route declares: the same object, every field optional.
 *
 * See `RouteSearch` for why a route may not declare its own defaults as required —
 * it would make every `<Link>` to this page carry a copy of them.
 */
export const validateTeacherTimetableRouteSearch = (
  search: Record<string, unknown>
): RouteSearch<TeacherTimetableSearch> =>
  validateTeacherTimetableSearch(search);

/** A `TeacherTimetableSearch` back into query-string values, defaults left off. */
export const toTeacherTimetableSearchParams = (
  search: TeacherTimetableSearch
): Record<string, string | undefined> =>
  omitEmptyParams({
    teacher: search.teacher || undefined,
    section: search.section || undefined,
    grade: search.grade || undefined,
    class: search.class || undefined,
  });

/**
 * What changing one of the three picks does to the two beneath it.
 *
 * One place, because the cascade is a rule and not two implementations of it: a
 * grade belongs to a section, so choosing a section invalidates the grade and the
 * class; a class belongs to a grade, so choosing a grade invalidates the class.
 * Getting either wrong leaves a dropdown showing a value the one above it has
 * stopped offering.
 *
 * The teacher is deliberately *not* part of this chain. Changing teacher clears
 * the grade and the class for a different reason: the options beneath are derived
 * from the timetable being replaced, so a grade the previous teacher taught would
 * otherwise be dropped by reconciliation once the new one lands — silently, with
 * the URL still naming it.
 */
export const sectionChangedTo = (
  section: ClassCategoryKey | ""
): Partial<TeacherTimetableSearch> => ({ section, grade: "", class: "" });

export const gradeChangedTo = (
  grade: string
): Partial<TeacherTimetableSearch> => ({
  grade,
  class: "",
});
