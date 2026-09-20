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

export const categoryForGrade = (gradeLevel: number): ClassCategoryKey => {
  const category = CLASS_CATEGORIES.find((c) =>
    (c.grades as readonly number[]).includes(gradeLevel)
  );
  return category?.key ?? "collegiate";
};

/**
 * Mirrors the backend `seedDefaultClasses` plan so the UI can tell, without
 * a round trip, whether seeding would create anything new.
 */
const PRIMARY_LETTERS = ["A", "B", "C", "D", "E"] as const;
const SECONDARY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

const plannedSeedNames = () => {
  const planned = new Set<string>();
  for (const gradeLevel of CLASS_CATEGORIES[0].grades) {
    for (const letter of PRIMARY_LETTERS) {
      planned.add(`${gradeLevel}:${gradeLevel}-${letter}`);
    }
  }
  for (const gradeLevel of CLASS_CATEGORIES[1].grades) {
    for (const letter of SECONDARY_LETTERS) {
      planned.add(`${gradeLevel}:${gradeLevel}-${letter}`);
    }
  }
  return planned;
};

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
