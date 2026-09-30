/**
 * The two dashboards' shared presentation primitives.
 *
 * **They are in their own file because of a Fast Refresh rule, and the reason is
 * worth stating because it looks like tidiness.** `admin-dashboard.tsx` and
 * `inventory-dashboard.tsx` are the same page dressed for different work: the
 * administrator's reads classes and leave queues, the store's reads loans and
 * write-offs, and both need the same tile that says "n/a" when its read fails,
 * the same focus ring and the same plural. A second copy of the tile would be a
 * second place to keep honest when that behaviour changes.
 *
 * But a module that exports components *and* plain values cannot preserve
 * component state when it is edited — React Fast Refresh has to reload the whole
 * module, losing the state of anything on screen. So the values live here (this
 * module exports no components at all) and the tile stays beside the
 * administrator's dashboard, which is the copy that reads it. The inventory
 * dashboard imports both, and each rule in this folder can be satisfied without
 * a disable comment.
 */

/**
 * The focus ring every link and control in both dashboards wears, written out
 * once because a focus ring is an accessibility promise and a promise kept in two
 * places is a promise kept in one of them.
 */
export const FOCUS_RING =
  "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

/** The secondary action: a bordered link rather than a filled one. */
export const OUTLINE_LINK = `border-input text-foreground hover:border-primary hover:bg-muted border font-semibold transition-colors ${FOCUS_RING}`;

/** `1 class has` / `3 classes have` — the tile counts need both forms. */
export const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

/**
 * A count and whether it could be read.
 *
 * The pair is a type rather than two props because a number with no error flag is
 * the shape that produced "Borrowed: 0" on a screen whose request had timed out:
 * `0` and *unknown* both arrive as `0`, so they have to travel together for
 * anything to be able to tell them apart.
 */
export interface Figure {
  value: number | undefined;
  isError: boolean;
}

/**
 * A count as a string, or an honest placeholder.
 *
 * Three states, because there are three things that can be true: the read
 * failed (`n/a` — never a `0`, which is the reading a storekeeper would act on),
 * it has not answered yet (`—`), or it has a number. A tile that printed `0`
 * while loading would be claiming the store is empty for as long as the store
 * takes to answer.
 */
export const showFigure = ({ value, isError }: Figure): string => {
  if (isError) {
    return "n/a";
  }

  return value === undefined ? "—" : value.toLocaleString("en-US");
};
