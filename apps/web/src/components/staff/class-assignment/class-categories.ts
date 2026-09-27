/**
 * Grade bands for the Classes page tabs, matching Sri Lankan school
 * structure and the `seedDefaultClasses` grouping on the backend:
 * - Primary (1-5): fixed A-E sections
 * - Secondary (6-11): fixed A-F sections (junior secondary + O/L combined)
 * - Collegiate (12-13): customizable — A/L stream counts vary by year and
 *   are never auto-seeded, always created manually.
 */
export const CLASS_CATEGORIES = [
  { key: "primary", label: "Primary", grades: [1, 2, 3, 4, 5] },
  { key: "secondary", label: "Secondary", grades: [6, 7, 8, 9, 10, 11] },
  { key: "collegiate", label: "Collegiate (A/L)", grades: [12, 13] },
] as const;

export type ClassCategoryKey = (typeof CLASS_CATEGORIES)[number]["key"];

export const DEFAULT_CATEGORY_KEY: ClassCategoryKey = CLASS_CATEGORIES[0].key;

export const categoryForGrade = (gradeLevel: number): ClassCategoryKey => {
  const category = CLASS_CATEGORIES.find((c) =>
    (c.grades as readonly number[]).includes(gradeLevel)
  );
  return category?.key ?? "collegiate";
};

/**
 * What an empty band means, in the words of whoever has to act on it.
 *
 * "No classes in this category" is the same sentence for all three bands and
 * answers nothing: for Collegiate it is the normal state of a year nobody has
 * built yet, and for Primary it means the one button that would fix it has not
 * been pressed. Each band therefore says which of the two it is.
 */
export const CATEGORY_EMPTY_COPY: Record<
  ClassCategoryKey,
  { title: string; description: string; canSeed: boolean }
> = {
  primary: {
    title: "No Primary classes yet",
    description:
      "Grades 1–5 take five fixed sections each. Seeding creates 1-A through 1-E, 2-A through 2-E and so on in one call, and skips any that already exist.",
    canSeed: true,
  },
  secondary: {
    title: "No Secondary classes yet",
    description:
      "Grades 6–11 take six fixed sections each. Seeding creates 6-A through 6-F, 7-A through 7-F and so on in one call, and skips any that already exist.",
    canSeed: true,
  },
  collegiate: {
    title: "No A/L classes yet",
    description:
      "A/L stream sizes change every year, so grades 12 and 13 are never seeded. Create each class by hand.",
    canSeed: false,
  },
};

/**
 * Mirrors the backend `seedDefaultClasses` plan so the UI can tell, without
 * a round trip, whether seeding would create anything new.
 */
const PRIMARY_LETTERS = ["A", "B", "C", "D", "E"] as const;
const SECONDARY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

/** The two bands the seeder owns. Collegiate is deliberately absent. */
const SEEDABLE_CATEGORIES = [CLASS_CATEGORIES[0], CLASS_CATEGORIES[1]] as const;

const plannedSeedNames = () => {
  const planned = new Set<string>();
  for (const category of SEEDABLE_CATEGORIES) {
    const letters =
      category.key === "primary" ? PRIMARY_LETTERS : SECONDARY_LETTERS;
    for (const gradeLevel of category.grades) {
      for (const letter of letters) {
        planned.add(`${gradeLevel}:${gradeLevel}-${letter}`);
      }
    }
  }
  return planned;
};

/** How many sections a full seed would create, for the "nothing to do" copy. */
export const PLANNED_SEED_TOTAL = plannedSeedNames().size;

/** True once every Primary/Secondary section this year would seed already exists. */
export const isFullySeeded = (
  classes: { gradeLevel: number; name: string }[]
): boolean => {
  const existing = new Set(
    classes.map((cls) => `${cls.gradeLevel}:${cls.name}`)
  );
  for (const key of plannedSeedNames()) {
    if (!existing.has(key)) {
      return false;
    }
  }
  return true;
};
