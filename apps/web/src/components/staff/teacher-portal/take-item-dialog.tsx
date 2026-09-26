"use client";

import type { InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";
import { inventoryCategoryIdSchema } from "@school-student-teacher-management/db/schema/inventory";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { IconPackageExport, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import * as v from "valibot";

import {
  ConditionBadge,
  InventoryEmptyState,
  InventoryErrorState,
  InventoryInlineNotice,
  InventorySkeleton,
  formatCount,
} from "@/components/staff/inventory/shared";
import { ChangePreview } from "@/components/staff/teacher-portal/transfer-ownership-dialog";
import { orpc } from "@/utils/orpc";

/**
 * One row of the shelf.
 *
 * Derived from the router rather than hand-written, for the reason
 * `inventory-types.ts` states at length: a projection of `InferRouterOutputs`
 * means a server-side change to the catalogue surfaces here as a compile error
 * rather than a runtime `undefined` on a screen that has already shipped. It is
 * declared in this file rather than added to that one because the catalogue is
 * **narrower than an item view** — nine fields, and the two that would make it a
 * register (`managerName`, `custodianName`) are absent by design — so putting it
 * beside `InventoryItemView` would invite a caller to treat it as one.
 */
type TakeableItem =
  InferRouterOutputs<AppRouter>["inventory"]["custody"]["takeable"]["listTakeableItems"]["items"][number];

/** The "no category filter" choice. A sentinel rather than `""`, and never sent. */
const ALL_CATEGORIES = "all";

/** Matches the shared staff combobox and the shared item picker. */
const DEBOUNCE_MS = 250;

/**
 * How many are on the shelf, stated **before** the list rather than inferred from
 * it — and it is the number, not the page.
 *
 * The server counts against the same filter set *before* its own page limit, so
 * `total` is how many things are on the shelf and `shown` is how many fitted on
 * this screen. A reader who knows the number is a page of a bigger shelf will
 * narrow the search rather than conclude the store is out, which is the difference
 * between a count and a number that stops growing.
 */
const TakeableCount = ({
  isSuccess,
  total,
  shown,
}: {
  isSuccess: boolean;
  total: number;
  shown: number;
}) => {
  if (!isSuccess) {
    return null;
  }

  if (total === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing on the shelf right now
      </p>
    );
  }

  if (total > shown) {
    return (
      <p className="text-muted-foreground text-sm tabular-nums">
        Showing {formatCount(shown)} of {formatCount(total)} — narrow it down
        with the search box
      </p>
    );
  }

  return (
    <p className="text-muted-foreground text-sm tabular-nums">
      {formatCount(total)} on the shelf you can take
    </p>
  );
};

/**
 * The empty catalogue, which is **not** an error and **not** "you have nothing".
 *
 * ## The first-run surface, where the copy matters more than usual
 *
 * A teacher who has just opened "Take an item" at a school whose store has not
 * been set up yet is looking at the emptiest thing in this feature, and the wrong
 * sentence is actively harmful. "No items available" reads as *the system is
 * broken*; "You own nothing" is a different and false claim, and it is the one the
 * other two sections on this page are about. The true statement is narrow and
 * specific — **nothing on the register is both free right now and one that is
 * handed out to teachers** — and the reader needs to be told what that *means* and
 * what to do about it, because an empty list is not something a teacher can act on
 * by trying harder.
 *
 * So the copy names the four reasons a shelf is empty in this school's own terms
 * (all out on stock, all out on loan, marked Damaged, not handed out to teachers),
 * says plainly that it is not an error, and ends on the two things that do help:
 * ask the store whether one is coming back, or ask the person in charge of the item
 * — who is not the reader, and who can act today.
 *
 * **The filtered variant is a different sentence, not a shorter one.** "Nothing
 * matches that" is the truth, and it is what a teacher who has typed a search they
 * got wrong needs to be told; the first-run copy would be a lie in that state,
 * because the shelf may well have plenty on it.
 */
const TakeableEmptyState = ({ isFiltered }: { isFiltered: boolean }) => {
  if (isFiltered) {
    return (
      <InventoryEmptyState
        title="Nothing on the shelf matches that"
        description="The catalogue is not empty — this search or category filter matched nothing. Clear one of them to widen the list."
      />
    );
  }

  return (
    <InventoryEmptyState
      title="Nothing on the shelf is free to take"
      description="This is not an error, and it does not mean you have nothing — it means no item on the register is both free right now and one that is handed out to teachers. Things that are all out on loan, all given away, marked Damaged, retired, or kept in the store rather than lent out do not appear here, and neither does anything you are already holding. If you need something for a lesson, ask the store whether one is coming back, or ask the person in charge of it — they can hand it to you themselves."
    />
  );
};

/**
 * One row of the shelf, as a button.
 *
 * **Buttons, not a `<Table>` with clickable rows, and the reason is the one
 * `my-equipment.tsx` records for its own rows**: a focusable `<tr>` *and* a control
 * inside it put one action in the tab order twice, and a screen-reader user hears
 * that as two different things to activate. Here there is no row-click shortcut
 * worth having — the row is a single choice, not a link to a detail — so the button
 * is the whole row and there is nothing to double up.
 *
 * `aria-pressed` rather than a radio group, because the selection is a *preference
 * feeding a preview*, not one of a set being submitted here, and a radiogroup would
 * promise mutual exclusivity and a group label this dialog does not have.
 */
const TakeableList = ({
  items,
  selectedId,
  disabled,
  onSelect,
}: {
  items: TakeableItem[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (itemId: string) => void;
}) => (
  <ul className="border-primary/14 divide-primary/10 divide-y border">
    {items.map((item) => {
      const isSelected = item.id === selectedId;

      return (
        <li key={item.id}>
          <button
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => {
              onSelect(item.id);
            }}
            className={`hover:bg-primary/5 flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
              isSelected ? "bg-primary/10" : ""
            }`}
          >
            <span
              aria-hidden="true"
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.categoryColor }}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{item.name}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {item.sku}
              </span>
              {/*
                The per-row line saying what choosing it means, on every row rather
                than only on the chosen one. A teacher scanning a shelf needs to know
                *before* they choose what the act commits them to, and the preview
                only speaks to the row they have already chosen — which is one moment
                too late to be the only place the sentence is.
              */}
              <span className="text-muted-foreground text-xs">
                {item.location || "No location recorded"} · {item.categoryName}{" "}
                ·{" "}
                <span className="tabular-nums">
                  {formatCount(item.availableQty)} free
                </span>{" "}
                · taking it puts it in your hands until you hand it back
              </span>
            </span>
            <ConditionBadge condition={item.condition} />
          </button>
        </li>
      );
    })}
  </ul>
);

/**
 * The list, or the one of the three other states it can be in.
 *
 * A four-way branch in the middle of the dialog's own scroll container reads as
 * four unrelated blocks of markup, and the states are unrelated to each other
 * (a skeleton, a failure, an empty shelf, a list) — so they are decided here, in
 * the order a reader meets them, with early returns.
 */
const TakeableBody = ({
  isLoading,
  isError,
  error,
  items,
  isFiltered,
  selectedId,
  isPending,
  onSelect,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  items: TakeableItem[];
  isFiltered: boolean;
  selectedId: string | null;
  isPending: boolean;
  onSelect: (itemId: string) => void;
  onRetry: () => void;
}) => {
  if (isLoading) {
    return (
      <div className="p-1">
        <InventorySkeleton rows={5} />
      </div>
    );
  }

  if (isError) {
    return <InventoryErrorState error={error} onRetry={onRetry} />;
  }

  if (items.length === 0) {
    return <TakeableEmptyState isFiltered={isFiltered} />;
  }

  return (
    <TakeableList
      items={items}
      selectedId={selectedId}
      disabled={isPending}
      onSelect={onSelect}
    />
  );
};

/**
 * The two filters, and nothing else. **A search term and a category, deliberately
 * not more.** The administrator's register carries seven filters because the person
 * using it is reconciling a school. This person is looking for a projector before
 * Thursday, and every extra control is one more thing to read before the list.
 */
const TakeableFilters = ({
  search,
  onSearchChange,
  categoryChoice,
  onCategoryChange,
  categories,
  isPending,
  searchFieldId,
  categoryFieldId,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  categoryChoice: string;
  onCategoryChange: (value: string | null) => void;
  categories: { id: string; name: string }[];
  isPending: boolean;
  searchFieldId: string;
  categoryFieldId: string;
}) => (
  <FieldSet>
    <FieldGroup>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-56 flex-1">
          <FieldLabel htmlFor={searchFieldId}>Search</FieldLabel>
          <div className="relative">
            <IconSearch className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              id={searchFieldId}
              className="pl-9"
              placeholder="Name or asset tag…"
              value={search}
              disabled={isPending}
              onChange={(event) => {
                onSearchChange(event.target.value);
              }}
            />
          </div>
        </Field>

        <Field className="w-56">
          <FieldLabel htmlFor={categoryFieldId}>Category</FieldLabel>
          <Select value={categoryChoice} onValueChange={onCategoryChange}>
            <SelectTrigger id={categoryFieldId} className="w-full">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </FieldGroup>
  </FieldSet>
);

interface TakeItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (itemId: string) => Promise<void>;
}

/**
 * One item off the shelf, and into your own hands.
 *
 * ## A catalogue, not a register — and the picker it is *not* built on
 *
 * `orpc.inventory.custody.takeable.listTakeableItems` exists because the obvious
 * implementation of this dialog was impossible. Choosing an item to take used to
 * mean browsing `items.list`, which is the school-wide register and is
 * `adminProcedure` — every item in the school with every manager's and custodian's
 * name, valuation, location and condition beside it. A picker built on it would
 * have handed a teacher the whole storebook through a search box, and **no input
 * filter can un-leak that**, because a caller who wants the school simply asks for
 * the unfiltered set.
 *
 * The catalogue answers the only question somebody deciding what to borrow has,
 * which is *is there one of these on the shelf*, and returns nine fields: `id`,
 * `sku`, `name`, `categoryId`, `categoryName`, `categoryColor`, `availableQty`,
 * `condition`, `location`. **No `managerStaffId`, no `managerName`, no
 * `custodianStaffId`, no `custodianName`, no description, no valuation, no
 * `borrowedQty`, no `minQty`** — it discloses no person at all, and that is
 * enforced by the projection rather than by good intentions. So `useItemOptions`
 * and `ItemPickerField` are **not** used here, and neither is `StaffComboboxField`
 * or `useAssignableStaffOptions`: the first pair is built on the admin
 * `items.list` and the second on the admin `options.assignableStaff`
 * (`list-teacher-options.ts:145` — the export; the file kept its old name because
 * two files outside it cite the path — whose own comment records that its gate is
 * `adminProcedure` precisely because the staff directory is not a teacher's read),
 * and all four would be a `FORBIDDEN` on a teacher's own page.
 *
 * The catalogue's filters are also `takeItem`'s **own guards** — not soft-deleted,
 * borrowable, derived status exactly `available`, and not already the caller's — so
 * the list cannot offer something the write would refuse. That is the property that
 * makes a row safe to *be* a button, and it is why there is no disabled row and no
 * "0 available" row in here: both would be a catalogue advertising a refusal. Where
 * a register shows a greyed-out line and says `0 of N available`, this catalogue
 * simply is not asked.
 *
 * ## No confirm, and that will look wrong
 *
 * The instinct to add one is strong and it is wrong here. Taking a thing off a
 * shelf is **reversible**: `custody.release` hands it back, the pointer is cleared,
 * and the item goes onto the store's shelf again with a row on its history saying
 * who had it. The hand-back confirm on this page exists because signing school
 * property away *by accident* is expensive; the call-back confirm in the section
 * below exists because it ends a colleague's possession. Neither of those is true
 * of a teacher picking up a tripod, so a confirm would be ceremony on a restorative
 * action — and ceremony is what teaches people to click through confirms. The
 * dialog's own button label and the preview under the list are the whole
 * instruction needed: they say the item becomes yours to hold, and that you are the
 * person who will be asked where it is.
 */
export const TakeItemDialog = ({
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: TakeItemDialogProps) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryChoice, setCategoryChoice] = useState(ALL_CATEGORIES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchFieldId = useId();
  const categoryFieldId = useId();

  /**
   * The debounce, and the reason it is 250 ms and the same 250 ms as everywhere
   * else in the feature.
   *
   * A request per character on a school's LAN lets an earlier response land after
   * a later one and repaint the list with stale rows — which here is worse than a
   * stale badge, because the row is a *button*: a teacher could press "Take" on an
   * item the server had already filtered out, and `takeItem` would refuse with
   * "There is no stock of this item left to take" for a row that was on screen a
   * moment ago. The stale catalogue arrives through the network and not through a
   * missing filter, which is the same defect `useItemOptions` was written to prevent
   * and the reason this list is not built on it.
   */
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  /**
   * The branded category id, parsed rather than asserted.
   *
   * The wire carries `id` as a plain `string` where the input is the branded
   * `inventoryCategoryIdSchema`, so the two meet here and this is a validation
   * rather than a cast — the same one-line arrangement `CustodyHistorySheet` uses
   * for an item id. It cannot throw for a string that came out of `categories.list`,
   * and the sentinel never reaches it.
   */
  const categoryId =
    categoryChoice === ALL_CATEGORIES
      ? undefined
      : v.parse(inventoryCategoryIdSchema, categoryChoice);

  const takeableInput = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      // Omitted rather than sent as the sentinel, for the same reason: a
      // hand-written "all" would fail the picklist on the way in — the exact class
      // of bug as the `?status=` param that was removed from this page.
      ...(categoryId ? { categoryId } : {}),
    }),
    [categoryId, debouncedSearch]
  );

  /**
   * The catalogue, read **only while the dialog is open.**
   *
   * This is the one read on this page that is not about the caller's own property,
   * so it is also the only one where the absence of a request is a real cost — and
   * it is a cost worth paying before the teacher has expressed any interest in
   * taking anything. `enabled: open` is that decision, and it is why the count line
   * is gated on `isSuccess` as well: a disabled query with no data is `pending` but
   * not `loading`, so nothing is claimed about a shelf nobody has asked about yet.
   */
  const takeableQuery = useQuery({
    ...orpc.inventory.custody.takeable.listTakeableItems.queryOptions({
      input: takeableInput,
    }),
    enabled: open,
  });

  /**
   * The category picker, on `categories.list` — a label vocabulary carrying no
   * item and no person, and one of the five procedures `read` reaches.
   */
  const categoriesQuery = useQuery(
    orpc.inventory.categories.list.queryOptions()
  );

  const items = useMemo(
    () => takeableQuery.data?.items ?? [],
    [takeableQuery.data]
  );
  const total = takeableQuery.data?.total ?? 0;
  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  );

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  const isFiltered =
    debouncedSearch !== "" || categoryChoice !== ALL_CATEGORIES;

  const reset = () => {
    setSearch("");
    setDebouncedSearch("");
    setCategoryChoice(ALL_CATEGORIES);
    setSelectedId(null);
  };

  /**
   * A selection the filter has since removed is not a selection, so a change to
   * either filter clears it. Without this the preview would name an item that is no
   * longer on the shelf — the stale catalogue, arriving from the filter rather than
   * from the network, which is the same defect the debounce above is about and just
   * as capable of putting a guaranteed failure in front of the reader.
   */
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setSelectedId(null);
  };

  const handleCategoryChange = (value: string | null) => {
    setCategoryChoice(value ?? ALL_CATEGORIES);
    setSelectedId(null);
  };

  /**
   * A refused write keeps the dialog, the filters and the row selected.
   *
   * The shelf can genuinely change between the catalogue read and the click —
   * somebody else takes the last tripod, or a unit goes out on loan — and `takeItem`
   * refuses each of those with a sentence that says which. So the rejection is
   * swallowed here and the page's `onError` reports it once; the teacher is left
   * looking at the same list, which is the state they need in order to pick
   * something else.
   */
  const handleTake = async () => {
    if (!selected) {
      return;
    }

    try {
      await onSubmit(selected.id);
    } catch {
      // Refused, or the connection dropped. The selection stays.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Take an item</DialogTitle>
          <DialogDescription>
            What is on the shelf now and free for a teacher to take. Taking it
            makes it yours to hold until you hand it back — it stays the
            school&rsquo;s, and nothing leaves the building.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <TakeableFilters
            search={search}
            onSearchChange={handleSearchChange}
            categoryChoice={categoryChoice}
            onCategoryChange={handleCategoryChange}
            categories={categories}
            isPending={isPending}
            searchFieldId={searchFieldId}
            categoryFieldId={categoryFieldId}
          />

          <TakeableCount
            isSuccess={takeableQuery.isSuccess}
            total={total}
            shown={items.length}
          />

          <TakeableBody
            isLoading={takeableQuery.isLoading}
            isError={takeableQuery.isError}
            error={takeableQuery.error}
            items={items}
            isFiltered={isFiltered}
            selectedId={selectedId}
            isPending={isPending}
            onSelect={setSelectedId}
            onRetry={() => {
              void takeableQuery.refetch();
            }}
          />

          {/*
            The preview, and **not** an `AlertDialog` in front of the button.
            A preview is the honest amount of ceremony for a reversible action: it
            names the item and the obligation, so a teacher who pressed the wrong row
            finds out which row they pressed *before* anything is written, and it sits
            in the dialog rather than over it so the list stays readable while it is
            there. A confirm on top of this would be the same information asked for
            twice, in a second window, for an action `custody.release` undoes in one
            click.
          */}
          {selected ? (
            <ChangePreview
              headline={`${selected.name} will be in your hands`}
              from="the store"
              to="you, until you hand it back"
              footnote="It stays on the register and it stays the school’s. From the moment you press the button this is the one row under “In my hands”, with a Hand back button beside it, and you are the person who will be asked where it is."
            />
          ) : (
            <InventoryInlineNotice
              tone="info"
              title="Pick something to take"
              description="Choose a row and this will say what taking it means before anything is written. Nothing here is a loan and nothing leaves the building — to take an item out of the school is a separate process, and the store handles that one."
            />
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending || !selected}
            onClick={() => {
              void handleTake();
            }}
            data-icon="inline-start"
          >
            <IconPackageExport data-icon="inline-start" />
            {isPending ? "Taking it..." : "Take it"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
