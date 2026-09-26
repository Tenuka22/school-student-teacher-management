"use client";

import { normalizeInventoryKey } from "@school-student-teacher-management/db/constants/inventory";
import { inventoryCategoryIdSchema } from "@school-student-teacher-management/db/schema/inventory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@school-student-teacher-management/ui/components/sheet";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  IconCategoryPlus,
  IconPalette,
  IconPlus,
  IconSeedling,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { CategoryOption } from "@/components/staff/inventory/inventory-types";
import {
  InventoryEmptyState,
  InventoryErrorState,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * The seeder's label, in one place, because there were two.
 *
 * `categories.seed` upserts with `onConflictDoNothing`, so it *adds* the eight
 * `DEFAULT_INVENTORY_CATEGORIES` and leaves everything already there untouched — it
 * does not "set up" a store, it does not "reset" one, and it does not "discover"
 * what is missing. So the verb is **seed**: the procedure's own name, and the word
 * the empty-register copy in `shared/inventory-states.tsx` can safely quote, because
 * this string is what the button is labelled.
 *
 * **One label, not two, and the object clause is why it can be one.** The button
 * appears in two states — the empty panel, and the footer of a panel that already
 * has categories — and it used to read "Seed the eight starter categories" in one
 * and "Seed any missing starter categories" in the other. Same action, same
 * procedure, same result, two names for it: a user who had seen the first would
 * not recognise the second, and a support conversation about "seeding" would have
 * two strings to match. "The eight starter categories" is true in both states,
 * because a store that already has five of them ends up with eight either way — the
 * procedure skips the five rather than overwriting them, which is the property that
 * makes the second state safe to press at all, and which the description on the
 * panel says in words.
 */
const SEED_CATEGORIES_LABEL = "Seed the eight starter categories";
const SEEDING_LABEL = "Seeding...";

/**
 * The colour a category gets when the clerk does not choose one.
 *
 * It is `createCategory`'s own `DEFAULT_CATEGORY_COLOR`, restated rather than
 * imported because that constant is module-private inside its procedure. It is the
 * same `#6366F1` the `inventory_category.color` column defaults to and the same
 * one the seeded `Other` category carries, so a category added without a deliberate
 * colour is indistinguishable from the seeded one — which is the point, and which
 * is why the swatch starts there rather than on white.
 */
const DEFAULT_CATEGORY_COLOR = "#6366F1";

/** `createCategory`'s own two rules, restated so the form can state them. */
const CATEGORY_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/u;
const MAX_CATEGORY_NAME_LENGTH = 80;

const categorySchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter a name for the category"),
    v.maxLength(
      MAX_CATEGORY_NAME_LENGTH,
      `Keep the name under ${MAX_CATEGORY_NAME_LENGTH} characters`
    )
  ),
  color: v.pipe(
    v.string(),
    v.regex(
      CATEGORY_COLOR_PATTERN,
      "The colour must be a hex value like #0EA5E9"
    )
  ),
});

interface CategoryFormErrors {
  name?: string;
  color?: string;
}

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
  isRemovePending: boolean;
  onRemove: (category: CategoryOption) => void;
}

/**
 * The list, one row per category.
 *
 * The remove button is present on every row rather than revealed on hover. It is a
 * two-step action behind an `AlertDialog`, so it is not dangerous to leave visible —
 * and a control that only exists on hover is a control a keyboard user cannot reach
 * at all.
 */
const CategoryList = ({
  categories,
  isRemovePending,
  onRemove,
}: CategoryListProps) => (
  <ul className="flex flex-col">
    {categories.map((category) => (
      <li
        key={category.id}
        className="hover:bg-muted/50 flex items-center gap-2 border-b py-2 last:border-b-0"
      >
        <CategorySwatch color={category.color} />
        <span className="min-w-0 flex-1 truncate font-medium">
          {category.name}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove the ${category.name} category`}
          disabled={isRemovePending}
          onClick={() => onRemove(category)}
        >
          <IconTrash />
        </Button>
      </li>
    ))}
  </ul>
);

interface CategoryCreateFormProps {
  name: string;
  color: string;
  errors: CategoryFormErrors;
  isPending: boolean;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
}

/**
 * The create form, in the panel's footer.
 *
 * The footer rather than the top of the scroll area, so it is reachable without
 * scrolling past a long list and a long list cannot push it off screen.
 */
const CategoryCreateForm = ({
  name,
  color,
  errors,
  isPending,
  onNameChange,
  onColorChange,
  onSubmit,
}: CategoryCreateFormProps) => (
  <form
    id="create-category-form"
    onSubmit={(event) => {
      void onSubmit(event);
    }}
    className="w-full"
  >
    <FieldGroup>
      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="new-category-name">Add a category</FieldLabel>
        <Input
          id="new-category-name"
          value={name}
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          autoComplete="off"
          placeholder="e.g. Music Equipment"
          disabled={isPending}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "new-category-name-error" : undefined}
          onChange={(event) => onNameChange(event.target.value)}
        />
        <FieldError id="new-category-name-error">{errors.name}</FieldError>
      </Field>

      <Field data-invalid={Boolean(errors.color)}>
        <FieldLabel htmlFor="new-category-color">Colour</FieldLabel>
        <div className="flex items-center gap-2">
          {/*
            A native colour swatch rather than a hand-rolled palette: it is a real
            control, it is keyboard-operable, and it is the one thing every browser
            already does correctly. The hex is shown beside it in a monospace face
            so the value is readable and copyable, because a school with a colour
            standard has a hex code for it — and a `type="number"`-style control
            would have silently discarded the `#`.
          */}
          <Input
            id="new-category-color"
            type="color"
            value={color}
            className="h-8 w-12 p-1"
            disabled={isPending}
            aria-invalid={errors.color ? true : undefined}
            aria-describedby={
              errors.color ? "new-category-color-error" : undefined
            }
            onChange={(event) => onColorChange(event.target.value)}
          />
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {color}
          </span>
          <IconPalette
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
        </div>
        <FieldDescription>
          The dot beside the name in the register. It is never the only signal —
          the name is always there too.
        </FieldDescription>
        <FieldError id="new-category-color-error">{errors.color}</FieldError>
      </Field>

      <Button
        type="submit"
        variant="outline"
        disabled={isPending || name.trim().length === 0}
        data-icon="inline-start"
      >
        <IconCategoryPlus data-icon="inline-start" />
        {isPending ? "Adding..." : "Add category"}
      </Button>
    </FieldGroup>
  </form>
);

interface RemoveCategoryDialogProps {
  target: CategoryOption | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * What removal actually blocks, stated before it is clicked.
 *
 * The rule is not "a category with items cannot be deleted" in the abstract — it is
 * that `inventory_item.categoryId` is `restrict`, so a category still in use cannot
 * go, **and the fix is to move or retire those items first**. Naming both routes is
 * the difference between a wall and an instruction. One thing the dialog does *not*
 * claim: soft-deleted items do not block removal, because they are invisible to
 * every other read in the feature, and letting one keep a category alive would make
 * retiring the last item of a kind permanently freeze its category.
 */
const RemoveCategoryDialog = ({
  target,
  isPending,
  onCancel,
  onConfirm,
}: RemoveCategoryDialogProps) => (
  <AlertDialog
    open={target !== null}
    onOpenChange={(next) => {
      if (!next) {
        onCancel();
      }
    }}
  >
    <AlertDialogContent className="sm:max-w-md">
      <AlertDialogTitle>
        Remove {target?.name ?? "this category"}?
      </AlertDialogTitle>
      <AlertDialogDescription>
        {target ? (
          <>
            An item in the store cannot be moved by removing its category, so
            removal only succeeds while nothing points at {target.name}. If
            items still use it, move each one to another category or retire it
            first — the server will refuse otherwise, and it names the category
            again when it does. Retired items do not block removal.
          </>
        ) : null}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isPending ? "Removing..." : "Remove category"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

interface CategoryPanelBodyProps {
  categories: CategoryOption[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onSeed: () => void;
  isSeedPending: boolean;
  isRemovePending: boolean;
  onRemove: (category: CategoryOption) => void;
}

/**
 * The scroll area's four states, as early returns.
 *
 * The empty state is the interesting one: it is the fresh-install screen, and the
 * thing blocking a first-time user is not the item form but the fact that
 * `createItem` requires a `categoryId` behind a `restrict` foreign key. So the
 * action it offers is the seeder, which exists precisely to close that gap.
 */
const CategoryPanelBody = ({
  categories,
  isLoading,
  error,
  onRetry,
  onSeed,
  isSeedPending,
  isRemovePending,
  onRemove,
}: CategoryPanelBodyProps) => {
  if (error) {
    return <InventoryErrorState error={error} onRetry={onRetry} />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <InventoryEmptyState
        title="No categories yet"
        description="Nothing can be added to the register until at least one category exists, because every item has to belong to one. Seeding the eight starters is the quickest way there, or add your own."
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

  return (
    <CategoryList
      categories={categories}
      isRemovePending={isRemovePending}
      onRemove={onRemove}
    />
  );
};

export interface CategoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  /**
   * Kept because the page passes it, and no longer read by the copy.
   *
   * The panel's description used to branch on this and the two branches said the
   * same thing in a different clause order, over a filter that cannot affect which
   * categories exist. One string is better than two identical ones, and a prop that
   * is required and unread is worse than either — so this is marked for removal
   * from both the page's call and this interface rather than left to rot here.
   */
  isFiltered: boolean;
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
 * The store's taxonomy, in a side panel.
 *
 * A `Sheet` rather than a tab, for the same reason the custody history is one:
 * categories are *maintained* while the register stays on screen, and a tab would
 * replace the table the whole point is to categorise. Nothing here is destructive by
 * accident — adding a category is two fields, removing one is an `AlertDialog` that
 * says plainly what it blocks, and the seeder is safe to run again by construction.
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
}: CategoryPanelProps) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [errors, setErrors] = useState<CategoryFormErrors>({});
  const [removalTarget, setRemovalTarget] = useState<CategoryOption | null>(
    null
  );

  /**
   * The `category` scope, not a hand-written key.
   *
   * Both mutations below append an `inventory_audit_log` row — `createCategory` and
   * `removeCategory` each call `insertInventoryAuditLog` — and the old local
   * `invalidateCategories` listed only the category list, so a clerk who added or
   * removed one and then opened the Change log found no row for a write they had
   * just watched succeed. `invalidateInventory` exists because eleven handlers
   * across this feature had the same gap; the scope is the shared one so the next
   * handler added here inherits the fix instead of re-deriving a key list.
   */
  const invalidateCategories = async () => {
    await invalidateInventory(queryClient, "category");
  };

  /**
   * Adding a category.
   *
   * `createCategory` answers a duplicate with `CONFLICT` and the offending name,
   * and the client's own check is a *softer* duplicate check against the loaded
   * list: the server's index is on `normalizedName`, so "IT Equipment" and "it
   * equipment" are one category, and the same `normalizeInventoryKey` that
   * maintains that column is what compares here. A school typing a category that
   * already exists should be told before the round trip, with the existing name to
   * merge into — and one that is not in the list still goes to the server, which is
   * the authority.
   */
  const createMutation = useMutation(
    orpc.inventory.categories.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success(`Category "${created.name}" added`);
        setName("");
        setColor(DEFAULT_CATEGORY_COLOR);
        setErrors({});
        await invalidateCategories();
      },
      onError: (submitError) => {
        toast.error(
          formatApiErrorMessage(submitError, "Could not add that category")
        );
      },
    })
  );

  const removeMutation = useMutation(
    orpc.inventory.categories.remove.mutationOptions({
      onSuccess: async () => {
        toast.success(`Category "${removalTarget?.name ?? ""}" removed`);
        setRemovalTarget(null);
        await invalidateCategories();
      },
      onError: (submitError) => {
        /*
         * The refusal here is not an edge case: it is the common case, and the
         * server's sentence names the category and both ways out. The dialog stays
         * open on failure, so the user is not left guessing whether the click did
         * anything.
         */
        toast.error(
          formatApiErrorMessage(submitError, "Could not remove that category")
        );
      },
    })
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});

    const result = v.safeParse(categorySchema, { name, color });
    if (!result.success) {
      const next: CategoryFormErrors = {};
      for (const issue of result.issues) {
        const key = issue.path?.[0]?.key;
        if (key === "name" && !next.name) {
          next.name = issue.message;
        }
        if (key === "color" && !next.color) {
          next.color = issue.message;
        }
      }
      setErrors(next);
      return;
    }

    const normalized = normalizeInventoryKey(result.output.name);
    const existing = categories.find(
      (option) => option.normalizedName === normalized
    );
    if (existing) {
      setErrors({
        name: `There is already a category called "${existing.name}". Categories are matched without regard to case, so this is the same one.`,
      });
      return;
    }

    try {
      await createMutation.mutateAsync(result.output);
    } catch {
      // The mutation's own `onError` has already toasted the server's sentence,
      // which names a duplicate if that is what it was.
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle className="font-heading text-base">
              Store categories
            </SheetTitle>
            {/*
              One string, and it no longer branches on `isFiltered`. The two
              versions differed only in the order of a clause — "whether or not
              anything uses it" against "whether or not anything uses it yet" — over
              a flag that has nothing to do with categories: a filter on the
              register cannot change which categories exist, and the list below has
              always been the whole store. The panel says so once, and says the one
              thing that is genuinely surprising in it: a category nobody uses is
              still listed, because the register can point at it tomorrow and
              deleting it is a separate, confirmed act.
            */}
            <SheetDescription>
              Every category in the store is listed, whether or not anything
              uses it yet. They classify the register and drive its category
              filter.
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
              isRemovePending={removeMutation.isPending}
              onRemove={setRemovalTarget}
            />
          </div>

          <SheetFooter className="border-t">
            <CategoryCreateForm
              name={name}
              color={color}
              errors={errors}
              isPending={createMutation.isPending}
              onNameChange={setName}
              onColorChange={setColor}
              onSubmit={handleCreate}
            />

            {/*
              Offered whether or not the list is empty, because the seeder is also
              the fastest way to get the eight standard ones *back* after somebody
              has been tidying up. `categories.seed` upserts with
              `onConflictDoNothing`, so it skips rather than overwrites — which is
              the only question a school has about this button, and the reason the
              label is the same one the empty state uses rather than a second,
              reassuring-sounding string. A different label for "the same action, on
              a store that is not empty" is how two names for one button start.
            */}
            {categories.length === 0 ? null : (
              <Button
                type="button"
                variant="ghost"
                onClick={onSeed}
                disabled={isSeedPending}
                data-icon="inline-start"
              >
                <IconPlus data-icon="inline-start" />
                {isSeedPending ? SEEDING_LABEL : SEED_CATEGORIES_LABEL}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <RemoveCategoryDialog
        target={removalTarget}
        isPending={removeMutation.isPending}
        onCancel={() => setRemovalTarget(null)}
        onConfirm={() => {
          if (removalTarget) {
            /*
             * Parsed through the repository's own id schema, like every other write
             * in this feature, and for the same reason: the wire type is a plain
             * `string` where `removeCategory`'s input is the branded
             * `InventoryCategoryId`, and this was the one call in the file that sent
             * the raw value and let the two meet inside the client. It cannot throw
             * for a string input, and `removalTarget` came off the list query, so
             * the only thing it buys is that the branded type is a *validation*
             * rather than an assertion — which is the whole point of having a schema
             * for it.
             */
            removeMutation.mutate({
              categoryId: v.parse(inventoryCategoryIdSchema, removalTarget.id),
            });
          }
        }}
      />
    </>
  );
};
