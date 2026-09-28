import { CLASS_CATEGORIES } from "@/components/staff/class-assignment/class-categories";
import type { ClassCategoryKey } from "@/components/staff/class-assignment/class-categories";
import {
  omitEmptyParams,
  readOneOf,
  readString,
} from "@/components/ui-patterns/data-table/list-search";
import type { RouteSearch } from "@/components/ui-patterns/data-table/list-search";

/**
 * The period-assignment page's URL contract: `?section=`, `?grade=`, `?class=`.
 *
 * The three picks are not a view preference, they are **which timetable is on
 * screen**. A weekly timetable belongs to a class, and a class belongs to a grade
 * and a section, so a link that says "Secondary, grade 7, 7-A" is a link to a real
 * timetable somebody can be looking at — and without it in the URL, refreshing
 * loses the class and lands on an empty grid with three dropdowns and no answer to
 * "which one did I mean?".
 *
 * ## What is checked here, and what is not
 *
 * The *shape* of each value is checked here, with the same three readers every
 * other list in the app uses: the section must be one of the three the app has, the
 * grade a whole number in 1–13, the class a non-empty id.
 *
 * The *relationships* are not, and deliberately so: whether grade 7 belongs to the
 * section, and whether a class is in that grade, are questions about the College's
 * classes, and a URL parser has never heard of them. They are settled in
 * `usePeriodsPage`, against the class list it has already loaded, and a pair that
 * does not line up is treated as "not chosen" rather than corrected. A hand-edited
 * `?section=primary&grade=7&class=<a grade 7 class>` therefore shows Primary with
 * no grade chosen — which is true, and better than a grade dropdown displaying a
 * grade the section above it does not offer.
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
export interface PeriodsSearch {
  section: ClassCategoryKey | "";
  grade: string;
  /** The class whose timetable this is. `class` reads better in a URL than `classId`. */
  class: string;
}

export const validatePeriodsSearch = (
  search: Record<string, unknown>
): PeriodsSearch => ({
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
export const validatePeriodsRouteSearch = (
  search: Record<string, unknown>
): RouteSearch<PeriodsSearch> => validatePeriodsSearch(search);

/** A `PeriodsSearch` back into query-string values, with every default left off. */
export const toPeriodsSearchParams = (
  search: PeriodsSearch
): Record<string, string | undefined> =>
  omitEmptyParams({
    section: search.section || undefined,
    grade: search.grade || undefined,
    class: search.class || undefined,
  });

/**
 * What changing one of the three picks does to the other two.
 *
 * One place, because the cascade is a rule and not two implementations of it: a
 * grade belongs to a section, so choosing a section invalidates the grade and the
 * class; a class belongs to a grade, so choosing a grade invalidates the class.
 * Getting either wrong leaves a dropdown showing a value the one above it has
 * stopped offering — the same defect as an id in a select trigger, one level up.
 */
export const sectionChangedTo = (
  section: ClassCategoryKey | ""
): Partial<PeriodsSearch> => ({ section, grade: "", class: "" });

export const gradeChangedTo = (grade: string): Partial<PeriodsSearch> => ({
  grade,
  class: "",
});
