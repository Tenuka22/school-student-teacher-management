/**
 * Reserved `gradeSubjectConfig`/`StructureVersionEntry` basket category for a
 * grade's compulsory (non-elective) subjects, as opposed to an O/L optional
 * basket, an A/L stream, or a junior-secondary elective slot (e.g. "op1").
 * Every student at a grade takes every subject filed under this category —
 * there is no `studentSubjectSelection` for it.
 *
 * This is a schema-level convention, not curriculum data, so unlike the
 * subject lists in `v1.ts` it's safe to share as a single constant: every
 * version must agree on the same sentinel value for the app's "is this
 * category selectable" check to work.
 */
export const COMPULSORY_BASKET_CATEGORY = "compulsory";
