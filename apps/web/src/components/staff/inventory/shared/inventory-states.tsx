import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  IconAlertTriangle,
  IconCircleX,
  IconInfoCircle,
  IconPackage,
  IconRefresh,
} from "@tabler/icons-react";
import type * as React from "react";

import { formatApiErrorMessage } from "@/lib/api-error";

/*
 * The empty-state copy is exported from beside the empty state on purpose: it
 * names `categories.seed`, and copy that lives in the component that renders it
 * is the copy a caller will actually reach for instead of rewriting. Fast Refresh
 * degrades to a full reload of this module when a string changes, which costs
 * nothing — none of these exports hold state.
 */
/* oxlint-disable react-doctor/only-export-components -- empty-state copy lives with the states it feeds */

/**
 * The copy for the two empty states a new install actually hits, kept here
 * rather than inline at each call site.
 *
 * **A new install's first screen is an empty item list, and the thing that
 * blocks a first-time user is not the item form — it is the category picker.**
 * `createItem` requires a `categoryId` with a `restrict` foreign key, and
 * `categories.seed` (`orpc.inventory.categories.seed`) is the procedure that
 * exists precisely to close that gap: it upserts the eight
 * `DEFAULT_INVENTORY_CATEGORIES` and skips rather than overwrites, so a school
 * that has already renamed or recoloured one of them keeps its choice. So the
 * empty register names the path to that action instead of saying "no items yet"
 * and leaving the user to guess what fills the store.
 *
 * ## Every name in this string is a control that exists, in both of its states
 *
 * This copy used to tell the reader to act "using **Seed categories**" and to
 * trust that "**Seed categories** is safe to run again". It is the first-run
 * surface, and a first-time user who cannot find a button under the name the
 * empty state used is left with a store they cannot fill — so the name has to be
 * checkable against the markup, and it was not:
 *
 * - The header button in the register pane is **"Categories"**
 *   (`inventory-page.tsx`). It was briefly "Store categories", and the page's own
 *   comment records the shortening; quoting the long name would have quoted a
 *   string that no longer exists anywhere.
 * - The action inside that panel is **"Seed the eight starter categories"**
 *   (`category-panel.tsx`, one label for both of its appearances).
 *
 * **The one path named here is the one that is always available.** The empty
 * state also renders a direct "Seed categories" button *beside itself*
 * (`inventory-table.tsx`) — but only when the store has no categories at all, so
 * quoting it would make this sentence describe a control that is not on the
 * screen in the other case, which is the same defect one indirection further
 * away. The header route works in every state, so it is the one this string
 * names, and the button that skips it is right under the words for the user who
 * has it.
 */
export const EMPTY_REGISTER_COPY = {
  title: "No items in the register yet",
  description:
    "Start with the eight starter store categories — IT Equipment, Lab Equipment, Sports Equipment and the rest. An item cannot be created until its category exists, so this is the step that unblocks the item form. Open Categories at the top of this pane, then press Seed the eight starter categories. Running it again is safe: it skips anything already there rather than overwriting it.",
} as const;

/** The same guidance for a store that has categories but where a filter found nothing. */
export const EMPTY_FILTERED_COPY = {
  title: "Nothing matches these filters",
  description:
    "The register is not empty — this search, category, condition or custodian filter matched no rows. Clear one of them to widen the list.",
} as const;

export const InventoryEmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <IconPackage />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    {action ? <EmptyContent>{action}</EmptyContent> : null}
  </Empty>
);

/**
 * A failed read, in place of the list.
 *
 * The message runs through `formatApiErrorMessage` so a server-side valibot
 * failure arrives as `Qty: Value does not match the required format` rather than
 * as the generic `Input validation failed` the client would otherwise show, and
 * an `ORPCError` with a real sentence shows that sentence. The retry is a real
 * button rather than a link, because the overwhelmingly common cause is a
 * dropped connection on a school LAN and the correct response is to try again.
 */
export const InventoryErrorState: React.FC<{
  error: unknown;
  onRetry: () => void;
}> = ({ error, onRetry }) => (
  <div
    role="alert"
    className="border-destructive/30 bg-destructive/5 flex flex-col items-start gap-3 border p-6"
  >
    <div className="text-destructive flex items-center gap-2">
      <IconCircleX className="size-4 shrink-0" />
      <p className="font-heading text-sm font-medium">
        {formatApiErrorMessage(error, "Could not load the inventory register")}
      </p>
    </div>
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRetry}
      data-icon="inline-start"
    >
      <IconRefresh data-icon="inline-start" />
      Try again
    </Button>
  </div>
);

/**
 * Placeholder rows for a list read in flight.
 *
 * Shaped like the register (a label column, a name, numbers, a status, a
 * custody pair) rather than as a stack of identical bars, so the page does not
 * visibly reflow when the data lands. The default of six matches a first screen
 * of the register at this app's `text-xs` row height without pushing the fold.
 *
 * **The skeleton is hidden from the accessibility tree, and the region around it
 * is not.** The bars themselves were already `aria-hidden`, and that was half the
 * job: a screen reader had nothing to say at all, so the table silently swapped
 * itself for a mystery and came back with no announcement that a load had even
 * happened. `aria-busy` states that this region is in flux, and a visually-hidden
 * "Loading…" gives the announcement something to be made *about* — without it,
 * `aria-busy` on a region with no text is a flag nothing can read.
 *
 * `aria-live="polite"` rather than `role="status"`: the state that matters is the
 * *arrival* of the rows, and this component does not know when that happens, so
 * it can only mark the transition. The region is polite, never assertive — a
 * refetch triggered by a keystroke must not interrupt what the user is doing.
 */
export const InventorySkeleton: React.FC<{ rows?: number }> = ({
  rows = 6,
}) => (
  <div
    className="flex w-full flex-col gap-2"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="sr-only">Loading the register…</span>
    <div className="flex w-full flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        // The row index is the identity here on purpose: these are placeholders
        // that are never reordered, keyed or diffed, and a generated id would be
        // a value with no meaning carried through every render of a loading state.
        // oxlint-disable-next-line react/no-array-index-key -- static placeholder rows, never reordered
        <div
          key={index}
          className="flex items-center gap-3 border-b px-2 py-2 last:border-b-0"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  </div>
);

const NOTICE_TONES = {
  info: {
    className: "border-border bg-muted/50 text-muted-foreground",
    Icon: IconInfoCircle,
  },
  /**
   * `text-warning-ink` and not `text-gold`: this notice's body copy is `text-sm`
   * and sits on `bg-accent/10`, where `--gold` is 3.65:1 — below AA for body text.
   * The border and the fill stay on `accent`, because those are surfaces rather
   * than ink and `--gold` was never the problem. Arithmetic in
   * `packages/ui/src/styles/globals.css`; the same token carries the register's
   * `Borrowed` badge and its warning figures.
   */
  warning: {
    className: "border-accent/50 bg-accent/10 text-warning-ink",
    Icon: IconAlertTriangle,
  },
  danger: {
    className: "border-destructive/30 bg-destructive/5 text-destructive",
    Icon: IconCircleX,
  },
} as const;

/**
 * A persistent in-page note, for a fact the user must not scroll past.
 *
 * Distinct from a toast on purpose. A toast is for the outcome of something the
 * user just did and disappears; this is for standing conditions the next
 * operation will hit — a store with no categories, a disposal awaiting a
 * signature, an item whose tags are all out on loan. It stays until the state
 * that caused it changes, which is what makes it safe to state a rule in.
 */
export const InventoryInlineNotice: React.FC<{
  tone: "info" | "warning" | "danger";
  title: string;
  description?: string;
}> = ({ tone, title, description }) => {
  const { className, Icon } = NOTICE_TONES[tone];

  return (
    <div className={className}>
      <div className="flex items-start gap-2 p-3">
        <Icon className="mt-px size-4 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium">{title}</p>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
