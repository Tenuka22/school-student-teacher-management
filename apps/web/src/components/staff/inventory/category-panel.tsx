"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@school-student-teacher-management/ui/components/sheet";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconSeedling } from "@tabler/icons-react";

import { QueryErrorPanel } from "@/components/query-error-panel";
import type { CategoryOption } from "@/components/staff/inventory/inventory-types";
import { InventoryEmptyState } from "@/components/staff/inventory/shared";
import { formatApiErrorMessage } from "@/lib/api-error";

/**
 * The seeder's label, in one place, because there were two.
 *
 * `categories.seed` upserts with `onConflictDoNothing`, so it *adds* the eight
 * `DEFAULT_INVENTORY_CATEGORIES` and leaves everything already there untouched — it
 * does not "set up" a store, it does not "reset" one, and it does not "discover"
 * what is missing. So the verb is **seed**: the procedure's own name, and the word
 * the empty-register copy in `shared/inventory-states.tsx` can safely quote, because
 * this string is what the button is labelled.
 */
const SEED_CATEGORIES_LABEL = "Seed the eight starter categories";
const SEEDING_LABEL = "Seeding...";

/**
 * The category's colour, as a dot.
 *
 * `aria-hidden`, always, because the category's **name** is always beside it. A
 * colour that was the only channel would leave a reader who cannot tell two of them
 * apart with no way to tell the categories apart at all — and the whole reason a
 * category carries a colour is to be recognised at a glance in a 200-row register.
 */
const CategorySwatch: React.FC<{ color: string }> = ({ color }) => (
  <span
    aria-hidden="true"
    className="ring-foreground/10 size-3 shrink-0 rounded-full ring-1"
    style={{ backgroundColor: color }}
  />
);

interface CategoryListProps {
  categories: CategoryOption[];
}

/**
 * The list, one row per category, read-only.
 *
 * Categories are a closed set now — the eight `DEFAULT_INVENTORY_CATEGORIES`,
 * each with a fixed name, colour and icon, seeded once and never created or
 * removed through the API. There is nothing here for a clerk to add or take
 * away, so this list has no per-row action any more: see `inventoryCategory`'s
 * schema doc comment in `packages/db/src/schema/inventory.ts` for why the
 * taxonomy was closed.
 */
const CategoryList = ({ categories }: CategoryListProps) => (
  <ul className="flex flex-col">
    {categories.map((category) => (
      <li
        key={category.id}
        className="flex items-center gap-2 border-b py-2 last:border-b-0"
      >
        <CategorySwatch color={category.color} />
        <span className="min-w-0 flex-1 truncate font-medium">
          {category.name}
        </span>
      </li>
    ))}
  </ul>
);

interface CategoryPanelBodyProps {
  categories: CategoryOption[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onSeed: () => void;
  isSeedPending: boolean;
}

/**
 * The scroll area's four states, as early returns.
 *
 * The empty state is the interesting one: it is the fresh-install screen, and the
 * thing blocking a first-time user is not the item form but the fact that
 * `createItem` requires a `categoryId` behind a `restrict` foreign key. So the
 * action it offers is the seeder, which exists precisely to close that gap — and,
 * now that categories are a closed set, the seeder is the *only* way a fresh
 * install ever gets one.
 *
 * The failure state is `QueryErrorPanel` and not `InventoryErrorState`, and the
 * reason is the subject. That component's fallback sentence is "Could not load the
 * inventory register" — which is this panel's *sibling* read, not this one. A
 * storekeeper whose category read failed was told the register had failed to load,
 * on a screen showing a perfectly good register. `QueryErrorPanel` takes the
 * subject as a prop, so the panel names the thing that actually failed.
 */
const CategoryPanelBody = ({
  categories,
  isLoading,
  error,
  onRetry,
  onSeed,
  isSeedPending,
}: CategoryPanelBodyProps) => {
  if (error) {
    return (
      <QueryErrorPanel
        message={formatApiErrorMessage(
          error,
          "The store's categories could not be read"
        )}
        onRetry={onRetry}
        title="The store's categories could not be loaded"
        note="No categories are listed. The items in the register are unaffected — this is only the category list, and it can be retried."
      />
    );
  }

  if (isLoading) {
    return (
      /*
       * A skeleton that reserves the list's own row rhythm, and a region that says
       * so. The bars are `aria-hidden` and the region is not: `aria-busy` on a
       * region with no text is a flag nothing can read, so the sentence is here,
       * visually hidden, to be announced.
       */
      <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the store&rsquo;s categories…</span>
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2, 3].map((row) => (
            // Static placeholder rows, never reordered.
            // oxlint-disable-next-line react/no-array-index-key -- static placeholder rows, never reordered
            <Skeleton key={`category-skeleton-${row}`} className="h-8 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <InventoryEmptyState
        title="No categories yet"
        description="Nothing can be added to the register until at least one category exists, because every item has to belong to one. Seed the eight starters to get going."
        action={
          <Button
            type="button"
            onClick={onSeed}
            disabled={isSeedPending}
            data-icon="inline-start"
          >
            <IconSeedling data-icon="inline-start" />
            {isSeedPending ? SEEDING_LABEL : SEED_CATEGORIES_LABEL}
          </Button>
        }
      />
    );
  }

  return <CategoryList categories={categories} />;
};

export interface CategoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  /**
   * The seeder, owned by the page rather than by this panel.
   *
   * One mutation observer per procedure is the point: the page's fresh-install empty
   * state and this panel's footer both offer the action, and two observers with two
   * `onSuccess` toasts and two invalidation sets is one of them going stale the
   * first time either is edited. So the write lives in the hook and both places call
   * it.
   */
  onSeed: () => void;
  isSeedPending: boolean;
}

/**
 * The store's taxonomy, in a side panel — read-only.
 *
 * Categories are hardcoded now: the eight `DEFAULT_INVENTORY_CATEGORIES`,
 * each with a fixed Tabler icon and colour, seeded once by `categories.seed`
 * and never created or removed through this panel. There used to be an
 * "Add a category" form and a per-row remove button here, backed by
 * `categories.create` / `categories.remove`; both procedures were removed
 * (see `inventoryCategory`'s schema doc comment), and this panel is what is
 * left once the two mutations it existed to drive are gone — a list, and the
 * one write that is still real.
 */
export const CategoryPanel = ({
  open,
  onOpenChange,
  categories,
  isLoading,
  error,
  onRetry,
  onSeed,
  isSeedPending,
}: CategoryPanelProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full sm:max-w-md">
      <SheetHeader className="border-b">
        <SheetTitle className="font-heading text-base">
          Store categories
        </SheetTitle>
        <SheetDescription>
          The school&rsquo;s fixed taxonomy. Every item belongs to exactly one
          of these, and the register&rsquo;s category filter reads this same
          list.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-4">
        <CategoryPanelBody
          categories={categories}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
          onSeed={onSeed}
          isSeedPending={isSeedPending}
        />
      </div>

      {categories.length === 0 ? null : (
        <SheetFooter className="border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={onSeed}
            disabled={isSeedPending}
            data-icon="inline-start"
          >
            <IconSeedling data-icon="inline-start" />
            {isSeedPending ? SEEDING_LABEL : SEED_CATEGORIES_LABEL}
          </Button>
        </SheetFooter>
      )}
    </SheetContent>
  </Sheet>
);
