"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  IconAlertTriangle,
  IconCategory,
  IconPackageExport,
  IconQrcode,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";

import {
  EMPTY_FILTERED_COPY,
  EMPTY_REGISTER_COPY,
  InventoryEmptyState,
} from "@/components/staff/inventory/shared";
import { formatApiErrorMessage } from "@/lib/api-error";

/**
 * The register's states that are not the table: the two empty states, the notice
 * that appears when the rows on screen are older than the newest request, and the
 * selection bar.
 *
 * They are one file because they are one decision — *what the register is
 * currently asserting* — and each of the three exists because a screen that
 * answers the wrong question here is worse than a screen that answers nothing.
 * They are not the table: none of them draws a row, and the table itself is
 * reachable from `inventory-table.tsx`.
 */

/** The plural of a count, and nothing cleverer than that. */
const plural = (count: number, one: string, many: string): string =>
  count === 1 ? one : many;

/** The same, for a noun — a second helper rather than a pair of arguments at each of the four call sites. */
const countOf = (count: number, noun: string): string =>
  `${count} ${plural(count, noun, `${noun}s`)}`;

export interface RegisterEmptyStateProps {
  /**
   * Whether anything at all is narrowing the list — the *view* is filtered, not
   * the store.
   */
  isFiltered: boolean;
  /**
   * Whether to print the list of filters in force beneath the filtered copy.
   *
   * It is separate from `isFiltered` because the table can reach a filtered view
   * without a filter being set: `listItems` counts `total` against the filter set
   * before the limit, so a non-zero count beside an empty page is reported as
   * filtered — because "Clear filters" is the right recovery — but printing "no
   * filters are applied" under a heading that says nothing matched would be a
   * sentence contradicting the one above it.
   */
  showsFilterSummary: boolean;
  hasCategories: boolean;
  isSeedPending: boolean;
  onSeedCategories: () => void;
  onCreateItem: () => void;
  onClearFilters: () => void;
  /**
   * The filters actually in force, as a sentence from the page
   * ("Filtered by search “projector”, status Borrowed, …").
   *
   * It is printed beneath the filtered empty state's copy because
   * `EMPTY_FILTERED_COPY` names the *kinds* of filter that can empty a register
   * and the list of what is actually set is the part that lets a reader undo the
   * right one. It is passed rather than rebuilt here so the caption above the
   * table and the sentence in this state cannot disagree about what is in force.
   */
  filterSummary: string;
}

/**
 * The two empty states, and the choice between them.
 *
 * **Which one is shown is the difference between helpful and insulting.** A store
 * with no items at all cannot create one until a category exists — `createItem`
 * requires a `categoryId` behind a `restrict` foreign key — so the first action named
 * on that state is the one that actually unblocks the form, and `categories.seed` is
 * the procedure that exists to do it. "No data" would be true and useless. The
 * filtered state is a different sentence about a store that is *full* and whose
 * filters happen to match nothing, so its action is "clear filters" and its copy
 * says so.
 */
export const RegisterEmptyState = ({
  isFiltered,
  showsFilterSummary,
  hasCategories,
  isSeedPending,
  onSeedCategories,
  onCreateItem,
  onClearFilters,
  filterSummary,
}: RegisterEmptyStateProps) => {
  if (isFiltered) {
    return (
      <>
        <InventoryEmptyState
          title={EMPTY_FILTERED_COPY.title}
          description={EMPTY_FILTERED_COPY.description}
          action={
            <Button type="button" variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          }
        />
        {/*
          What is in force, in the reader's own words. The copy above names the
          four filters that can empty a register; this names the ones that *are*
          empty, which is the only list that can be undone.
        */}
        {showsFilterSummary ? (
          <p className="text-muted-foreground mt-2 text-center text-xs">
            {filterSummary}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <InventoryEmptyState
      title={EMPTY_REGISTER_COPY.title}
      description={EMPTY_REGISTER_COPY.description}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {hasCategories ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={onSeedCategories}
              disabled={isSeedPending}
              data-icon="inline-start"
            >
              <IconCategory data-icon="inline-start" />
              {isSeedPending ? "Seeding..." : "Seed categories"}
            </Button>
          )}
          <Button type="button" onClick={onCreateItem} data-icon="inline-start">
            <IconPackageExport data-icon="inline-start" />
            Register the first item
          </Button>
        </div>
      }
    />
  );
};

export interface RegisterStaleNoticeProps {
  /** The failure that stopped the newest request from landing. */
  error: unknown;
  /** A real refetch, not a re-render of the same cached failure. */
  onRetry: () => void;
  isRetrying: boolean;
}

/**
 * The rows on screen are older than the newest request, and the newest request
 * failed. **This is the dangerous one.**
 *
 * Every other state in this file is a claim about the school that happens to be
 * true. This one is a table that is *rendering correctly* and is *wrong*: a
 * storekeeper reads "4 projectors available", moves a trolley, and only then
 * learns that the figure was from a load taken before somebody else registered
 * two of them. An inventory register that silently shows fewer rows than exist is
 * a data-integrity defect, not a cosmetic one, and it is why the register keeps
 * its rows here instead of replacing them with an error panel: throwing the
 * rows away would be a *bigger* lie, because "the register is empty" is a
 * sentence about the whole school.
 *
 * So the rows stay, the notice is above them rather than in place of them, and it
 * says three things: that the rows are the last ones that loaded, that they may
 * have moved on, and how to try again.
 *
 * **`aria-live="polite"` with no `role`, which is the same choice
 * `InventorySkeleton` makes in `shared/inventory-states.tsx`.** `role="status"` is a
 * shorthand for a polite live region, `jsx-a11y/prefer-tag-over-role` wants it
 * spelled as `<output>`, and `output`'s content model is phrasing content — so the
 * tag cannot hold a heading, two paragraphs and a button. The attribute pair
 * `aria-busy` + `aria-live` is what the feature's own loading region uses, and
 * being consistent with it is worth more than matching a lint rule's preferred
 * spelling of the same semantics.
 *
 * **It is written out rather than composed from `InventoryInlineNotice`, and the
 * reason is the retry button.** That component's `description` is a string and it
 * has no action slot, so a retry beside it would be a second box — a bordered
 * notice with a loose button floating next to it, which is the nested-box shape
 * this app is trying to stop printing. `QueryErrorPanel` is deliberately *not*
 * used either: it opens with `role="alert"` and closes with "Nothing has been
 * changed", and both are wrong here — the failure is not new, and a register
 * whose newest request failed is the one thing on this screen that has most
 * certainly changed. The tone classes are the same destructive border and fill as
 * that component's `danger`, so the two read as one family.
 */
export const RegisterStaleNotice = ({
  error,
  onRetry,
  isRetrying,
}: RegisterStaleNoticeProps) => (
  <div
    aria-busy={isRetrying}
    aria-live="polite"
    className="border-destructive/30 bg-destructive/5 border p-3"
  >
    <div className="flex items-start gap-2">
      <IconAlertTriangle
        aria-hidden="true"
        className="text-destructive mt-px size-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-destructive text-sm font-bold">
          These rows are the last ones that loaded, and the newest request
          failed
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {formatApiErrorMessage(error, "The register could not be refreshed")}{" "}
          Anything that has changed since then — a new item, a retirement, a
          unit handed out — is not shown here yet.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={onRetry}
          loading={isRetrying}
          data-icon="inline-start"
        >
          <IconRefresh data-icon="inline-start" />
          Try again
        </Button>
      </div>
    </div>
  </div>
);

export interface RegisterSelectionBarProps {
  /** Every tick the reader holds, on rows and off rows alike. */
  selectedCount: number;
  /** Of those, the ones a QR label can actually be built for. */
  labelableCount: number;
  /** Ticks on retired rows: nothing is left to scan into them. */
  retiredCount: number;
  /** Ticks whose rows are not in the loaded results at all. */
  missingCount: number;
  isPending: boolean;
  onDownload: () => void;
  onClear: () => void;
}

/**
 * The selection bar, and the reconciliation it exists to perform.
 *
 * **The number on a button is the number of rows the action will touch.** A bar
 * that said "5 selected" beside a button that said "Download QR sheet" and
 * quietly printed 2 labels is a false report about a document, and a QR sheet
 * that comes back short is a physical job someone has to notice and finish by
 * hand. The count lives *in the button label*, so it cannot be read past.
 *
 * ## Why the blocked counts are broken out rather than summed
 *
 * "3 of 5" is true and actionable and does not tell a reader which three. They are
 * blocked for two unrelated reasons that need two different fixes: a retired row is
 * never labelable again (it is off the register — turn "Show retired" off, or
 * restore the row), and a row that is not in the loaded results at all belongs to
 * neither conversation. The sentence is assembled from the non-zero buckets so it
 * **always adds up to the count in the button** — a reconciliation that does not
 * add up is worse than none, because it is the one number on the screen a reader is
 * most likely to check.
 *
 * **There was a third bucket — "hidden by the current filters" — and it was
 * always zero.** The only filter that moved a row off the page without un-ticking
 * it was the browser-side "no manager" predicate, which went with the owner
 * column's `NOT NULL`; a bucket that can only ever report 0 is a control narrating
 * a state that cannot exist, and a sentence that spends half its length on
 * "widen the filter" for a filter the register no longer has is a smaller lie but
 * still a lie about what the feature does.
 *
 * **Selection survives a refetch because it is keyed by id**, so a refetch that
 * replaces the array does not un-tick anything — and a row that has genuinely
 * left the register stops being counted rather than being exported, which is
 * what keeps the button's number and the sheet's contents the same figure.
 *
 * `<output>` rather than `<p role="status">`: the rule reads as a live region
 * either way, but `output` is the element that means it, so the semantics do not
 * depend on a role attribute somebody can delete.
 */
export const RegisterSelectionBar = ({
  selectedCount,
  labelableCount,
  retiredCount,
  missingCount,
  isPending,
  onDownload,
  onClear,
}: RegisterSelectionBarProps) => {
  const blocked = selectedCount - labelableCount;
  const canDownload = labelableCount > 0;

  const reasons: string[] = [];
  if (retiredCount > 0) {
    reasons.push(
      `${retiredCount} ${plural(retiredCount, "is", "are")} retired, so there is nothing left to scan into ${retiredCount === 1 ? "it" : "them"}`
    );
  }
  if (missingCount > 0) {
    reasons.push(
      `${missingCount} ${plural(missingCount, "is", "are")} not in the results this page loaded`
    );
  }

  return (
    <div className="bg-muted/60 border-primary/20 flex flex-wrap items-center gap-x-3 gap-y-2 border p-3">
      <output className="text-sm font-medium">
        {countOf(selectedCount, "item")} selected
      </output>

      {/*
        The reconciliation. Rendered whether or not anything is blocked, because
        the blocked case is the one that needs an explanation and an explained
        bar is not noise: it is the difference between "5 selected" and "5
        selected, 3 of which will be on the sheet".
      */}
      <p className="text-muted-foreground min-w-0 flex-1 text-xs">
        {blocked === 0
          ? `All ${countOf(labelableCount, "item")} can be labelled.`
          : `${labelableCount} of ${selectedCount} can be labelled: ${reasons.join("; ")}.`}
      </p>

      <Button
        type="button"
        size="sm"
        onClick={onDownload}
        disabled={!canDownload}
        loading={isPending}
        data-icon="inline-start"
      >
        <IconQrcode data-icon="inline-start" />
        {canDownload
          ? `Download ${labelableCount} QR ${plural(labelableCount, "label", "labels")}`
          : "Nothing to label"}
      </Button>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onClear}
        disabled={isPending}
        data-icon="inline-start"
      >
        <IconX data-icon="inline-start" />
        Clear selection
      </Button>
    </div>
  );
};
