"use client";

import {
  ITEM_CONDITIONS,
  itemConditionLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@school-student-teacher-management/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import {
  IconAlertTriangle,
  IconArchive,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import type * as React from "react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";

import type {
  AssignableStaffOption,
  CategoryOption,
  InventoryFilters,
  InventoryItemStatus,
} from "@/components/staff/inventory/inventory-types";
import { hasActiveInventoryFilters } from "@/components/staff/inventory/inventory-types";
import { itemStatusLabel } from "@/components/staff/inventory/shared/inventory-status-badge";
import { useAssignableStaffOptions } from "@/components/staff/inventory/shared/teacher-combobox";

/**
 * Long enough that a fast typist is not firing a request per character, short
 * enough that the list feels like it answered. See the note at the debounce
 * below for why this is not cosmetic.
 */
const SEARCH_DEBOUNCE_MS = 300;

const ALL = "all";

/** Constrains a type to `never`, which is only satisfiable when it *is* `never`. */
type AssertNever<T extends never> = T;

/**
 * The four derived statuses, in the order a storekeeper triages them.
 *
 * **Two checks, because one is not enough, and the one that looks sufficient is
 * not.** Both are verified against the repo's own TypeScript:
 *
 * 1. `as const satisfies readonly InventoryItemStatus[]` — the pattern
 *    `packages/api/src/routers/inventory/list-items.ts:44-49` uses for its status
 *    picklist. This catches a *bad or retired* entry: a typo, or a status removed
 *    from `calculateItemStatus` while still listed here.
 * 2. `StatusOrderIsComplete` below — this catches a **missing** entry, which check
 *    one provably does not. A 4-element tuple stays assignable to
 *    `readonly Union[]` when the union has five members; assignability asks "are
 *    these all statuses?", never "are all the statuses here?". Verified: with
 *    `type U = Status | "in_transit"`, `["a","b","c","d"] as const satisfies
 *    readonly U[]` compiles clean.
 *
 * Check two is the one that matters, because the failure it prevents is silent and
 * one-sided: `itemStatusLabel` falls through to `humanizeKey` and
 * `ITEM_STATUS_TREATMENTS` falls through to a neutral treatment, so a new status
 * would **render** on the register while being **unfilterable** on this bar. A
 * register that can show a state you cannot filter to is a state nobody will ever
 * find again.
 *
 * The comment in `inventory-status-badge.tsx` used to claim a fifth status was "a
 * type error here". It was not, and it is not — it is a type error in *this* file,
 * which is the right place for it, because the badge is a renderer that should
 * degrade and the filter is a closed set that must not.
 */
const STATUS_ORDER = [
  "out_of_stock",
  "borrowed",
  "damaged",
  "available",
] as const satisfies readonly InventoryItemStatus[];

/**
 * Compile error the moment `InventoryItemStatus` gains a member this bar does not
 * offer.
 *
 * Derived from `STATUS_ORDER` itself, so it cannot drift from it: there is no
 * second list to keep in step, and deleting an entry here breaks the build with
 * `Type '"<new_status>"' does not satisfy the constraint 'never'` rather than
 * quietly shipping an unfilterable status. Exported only so it counts as used under
 * `noUnusedLocals` — it is a statement about the type system, not a runtime value.
 */
export type StatusOrderIsComplete = AssertNever<
  Exclude<InventoryItemStatus, (typeof STATUS_ORDER)[number]>
>;

/**
 * What the custodian trigger says, in one place so the three cases are read
 * together rather than as a nested expression in the middle of JSX.
 */
const custodianFilterLabel = (
  resolved: AssignableStaffOption | null,
  value: string
): string => {
  if (resolved) {
    return resolved.serviceNo
      ? `${resolved.name} · ${resolved.serviceNo}`
      : resolved.name;
  }

  if (value) {
    return "Current custodian";
  }

  return "Anyone";
};

/**
 * A stand-in row for a filter value whose person is not on the loaded page.
 * Built as a whole `AssignableStaffOption` so it cannot drift from the router's
 * projection the way a partial object with a cast would. The row prints the
 * filter's own words — "Current custodian" — because that is the claim the
 * control is making; `staffCategory` is a placeholder nothing here reads, the
 * column being `notNull` and typed as the closed `StaffCategory` pair.
 */
const unlistedCustodian = (id: string): AssignableStaffOption => ({
  id,
  name: "Current custodian",
  serviceNo: null,
  staffCategory: "teacher",
  employmentStatus: null,
  currentRole: null,
});

/**
 * What the count line says, given three facts rather than one.
 *
 * `resultCount` is the **page** — `listItems` caps it at `REGISTER_PAGE_SIZE` (200)
 * — and `totalCount` is the count against the same filter set *before* the limit.
 * So `resultCount < totalCount` is true in two completely different situations,
 * and the old code treated them as one:
 *
 * - a filter is active and 40 of 400 rows match → the honest advice is to widen it.
 * - **no filter is active** and the school simply owns 312 lines → there is nothing
 *   to clear, and "clear a filter to widen the list" tells a storekeeper to go and
 *   do something impossible. On a 312-line register that sentence appears on the
 *   very first screen they see.
 *
 * The filter state therefore decides the advice, and `isFiltered` is the only
 * honest source of that — not `resultCount`, which knows nothing about filters.
 *
 * **The honest sentence is worth more than the short one.** A truncated list
 * without an active filter is a *paging* fact, and the remedy is narrowing the
 * search, not clearing anything. Telling a clerk to clear a filter that is not
 * there teaches them that this bar's numbers are decorative, and the next number
 * they trust — the low-stock count, the out-of-stock count — is one they should
 * trust less. The two halves of the screen then agree: the table's accessible name
 * already says "showing 200 of 312 items", which is correct, while this line
 * contradicted it.
 */
const resultCountSentence = (
  resultCount: number,
  totalCount: number,
  isFiltered: boolean
): string => {
  if (resultCount >= totalCount) {
    return `Showing ${resultCount} of ${totalCount} items`;
  }

  if (isFiltered) {
    return `Showing ${resultCount} of ${totalCount} — clear a filter to widen the list`;
  }

  return `Showing the first ${resultCount} of ${totalCount} — narrow the search to reach the rest`;
};

/**
 * A `Select` that always has a readable value.
 *
 * The custodian filter is a pointer at a person who may not be in the loaded
 * page of fifty names. Rendering the raw id in the trigger would be honest and
 * useless, so an unresolvable active value gets a placeholder row instead — the
 * filter stays legible, and the user can still widen it.
 */
const CustodianSelect: React.FC<{
  id: string;
  value: string;
  onChange: (staffId: string) => void;
  options: AssignableStaffOption[];
  isLoading: boolean;
}> = ({ id, value, onChange, options, isLoading }) => {
  const resolved = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value]
  );

  const items = useMemo(
    () =>
      value && !resolved ? [unlistedCustodian(value), ...options] : options,
    [options, resolved, value]
  );

  const label = custodianFilterLabel(resolved, value);

  return (
    <Select
      value={value || ALL}
      onValueChange={(next) => onChange(next === ALL ? "" : (next ?? ""))}
    >
      <SelectTrigger id={id} className="w-[15rem]">
        <SelectValue placeholder="Anyone">{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Anyone</SelectItem>
        {isLoading ? (
          <SelectItem disabled value="__loading">
            Loading staff...
          </SelectItem>
        ) : null}
        {items.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
            {option.serviceNo ? ` · ${option.serviceNo}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/**
 * The row under the filters: the count line and the two standing notes.
 *
 * **"Showing N of M" rather than "N items", because `listItems` counts against
 * the same filter set *before* the limit**, so the two numbers can genuinely
 * differ. A header that reported only the page size would be telling a storekeeper
 * with 312 items that they have 50. Which *advice* goes with the pair is decided by
 * `isFiltered`, not by the pair itself — see `resultCountSentence`.
 *
 * The retired note is **conditional**, because a sentence that is always on is a
 * sentence nobody reads — and this one matters more than usual when it does appear.
 * The count line above is honest either way, so a reader who turns the filter on and
 * sees 340 where there were 312 has to be told *why*, or the two numbers look like a
 * bug. Retired rows keep their counters, so the stat cards above are summing rows the
 * school does not hold any more, and the table's own marker on each of them is the
 * second half of the answer.
 */
const FilterBarSummary: React.FC<{
  resultCount: number | undefined;
  totalCount: number | undefined;
  isFiltered: boolean;
  includeDeleted: boolean;
}> = ({ resultCount, totalCount, isFiltered, includeDeleted }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
    {resultCount !== undefined && totalCount !== undefined ? (
      <p className="text-muted-foreground text-sm tabular-nums">
        {resultCountSentence(resultCount, totalCount, isFiltered)}
      </p>
    ) : null}
    <p className="text-muted-foreground text-xs">
      Low stock means an item is at or below its reorder threshold — a warning
      to reorder, not a hard floor the store is forbidden from dropping below.
    </p>
    {includeDeleted ? (
      <p className="text-muted-foreground text-xs">
        Showing retired items too. They are marked on every row, they cannot be
        lent, issued, written off or edited until they are restored, and their
        ledger and custody history is still on file.
      </p>
    ) : null}
  </div>
);

export interface InventoryFilterBarProps {
  search: string;
  status: InventoryItemStatus | "all";
  categoryId: string;
  condition: string;
  custodianStaffId: string;
  lowStockOnly: boolean;
  includeDeleted: boolean;
  onChange: (
    patch: Partial<Omit<InventoryFilterBarProps, "onChange" | "categories">>
  ) => void;
  onReset: () => void;
  categories: CategoryOption[];
  resultCount?: number;
  totalCount?: number;
}

export const InventoryFilterBar: React.FC<InventoryFilterBarProps> = ({
  search,
  status,
  categoryId,
  condition,
  custodianStaffId,
  lowStockOnly,
  includeDeleted,
  onChange,
  onReset,
  categories,
  resultCount,
  totalCount,
}) => {
  const [searchDraft, setSearchDraft] = useState(search);
  const [emittedSearch, setEmittedSearch] = useState(search);

  /*
   * Keep the box in step when the page changes the value from outside — a reset,
   * or a navigation that restored a different query string. Done as a
   * render-time adjustment against the last value seen rather than in an effect,
   * because an effect would paint one frame with the old term in the box and the
   * list already filtered by the new one: a search box showing something the list
   * is not filtered by looks exactly like a search that failed.
   */
  if (search !== emittedSearch) {
    setEmittedSearch(search);
    setSearchDraft(search);
  }

  /**
   * `onChange` is read through an effect event so the debounce timer is not torn
   * down and restarted every time the page re-renders with a new callback
   * identity. Restarting on every render would mean the timer never fires on a
   * busy page — the search would simply stop working, intermittently.
   */
  const emitSearch = useEffectEvent((next: string) => {
    onChange({ search: next });
  });

  /**
   * **The debounce is load-bearing, not polish — and the reason is the network.**
   *
   * These filters are **component `useState` in `useInventoryPage`, not URL
   * state.** Only the pane (`?tab=`) is in the URL, and it always has been; the
   * search, status, category, condition, custodian, low-stock and no-manager
   * filters have never been anything else. A comment here used to say the
   * opposite — that every change is a router navigation, so a navigation per
   * keystroke would put "a history entry per character, re-run the loader" — and
   * every clause of that was wrong: no navigation happens, no history entry is
   * written, and no loader re-runs. `UI.md` has already recorded the same
   * correction under "Filters are not URL state"; this is the same fact at the
   * place the debounce is actually written.
   *
   * What *is* true, and what makes the 300 ms necessary: `onChange` replaces the
   * search term in state, the page's query key changes, and `listItems` re-runs —
   * a four-table join on the school's LAN, once per character if nothing holds it
   * back. Nothing here sequences those requests, so an earlier response can land
   * after a later one and repaint the list with the rows for a term the user has
   * already finished typing. Holding the term for 300 ms collapses a typed word
   * into one request and removes the race with it.
   */
  useEffect(() => {
    if (searchDraft === search) {
      return;
    }

    const timeout = setTimeout(
      () => emitSearch(searchDraft),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timeout);
  }, [search, searchDraft]);

  const { options: assignableStaff, isLoading: isLoadingAssignableStaff } =
    useAssignableStaffOptions();

  const filters: InventoryFilters = {
    search,
    status,
    categoryId,
    condition,
    custodianStaffId,
    lowStockOnly,
    includeDeleted,
  };

  const isFiltered = hasActiveInventoryFilters(filters);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-[16rem] flex-1">
          <FieldLabel htmlFor="inventory-search">Search</FieldLabel>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <IconSearch className="text-muted-foreground size-4" />
            </InputGroupAddon>
            <InputGroupInput
              id="inventory-search"
              placeholder="Search name, SKU or description"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </InputGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="inventory-status">Status</FieldLabel>
          <Select
            value={status}
            onValueChange={(next) =>
              onChange({
                // Resolved against the four known statuses rather than cast:
                // the sentinel `"all"` is not an `InventoryItemStatus`, and an
                // unknown string handed to the router would fail its picklist
                // and blank the list with a validation toast.
                status:
                  STATUS_ORDER.find((candidate) => candidate === next) ?? ALL,
              })
            }
          >
            <SelectTrigger id="inventory-status" className="w-[10rem]">
              <SelectValue placeholder="Any status">
                {status === ALL ? "Any status" : itemStatusLabel(status)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              {STATUS_ORDER.map((option) => (
                <SelectItem key={option} value={option}>
                  {itemStatusLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="inventory-category">Category</FieldLabel>
          <Select
            value={categoryId || ALL}
            onValueChange={(next) => onChange({ categoryId: next ?? "" })}
          >
            <SelectTrigger id="inventory-category" className="w-[12rem]">
              <SelectValue placeholder="All categories">
                {categoryId
                  ? (categories.find((c) => c.id === categoryId)?.name ??
                    "Current category")
                  : "All categories"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="inventory-condition">Condition</FieldLabel>
          <Select
            value={condition || ALL}
            onValueChange={(next) => onChange({ condition: next ?? "" })}
          >
            <SelectTrigger id="inventory-condition" className="w-[10rem]">
              <SelectValue placeholder="Any condition">
                {condition ? itemConditionLabel(condition) : "Any condition"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any condition</SelectItem>
              {ITEM_CONDITIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {itemConditionLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="inventory-custodian">Custodian</FieldLabel>
          <CustodianSelect
            id="inventory-custodian"
            value={custodianStaffId}
            onChange={(next) => onChange({ custodianStaffId: next })}
            options={assignableStaff}
            isLoading={isLoadingAssignableStaff}
          />
        </Field>

        {/*
          A toggle button rather than a checkbox: the label has to read as the
          filter it switches, and `aria-pressed` states it as on without
          borrowing a second control for the state.
        */}
        <Field>
          <FieldLabel htmlFor="inventory-low-stock">Stock</FieldLabel>
          <Button
            id="inventory-low-stock"
            type="button"
            variant={lowStockOnly ? "default" : "outline"}
            aria-pressed={lowStockOnly}
            onClick={() => onChange({ lowStockOnly: !lowStockOnly })}
            data-icon="inline-start"
          >
            <IconAlertTriangle data-icon="inline-start" />
            Low stock only
          </Button>
        </Field>

        {/*
          "Show retired", the seventh control, and the only one that adds rows to
          the register rather than removing them.

          **It is a filter and not a mode, and it is wired to the `includeDeleted`
          input `listItems` has always accepted** — there is no client-side
          equivalent because retired rows are not in the response unless the request
          asks for them. Before this existed, `includeDeleted` was a gate on an input
          no screen ever sent: a real filter with no control, which is the same
          defect as a control that does nothing, pointed the other way.

          **It cannot be refused for the audience that can see it.** `listItems`
          gates the flag on `admin` / `principal` / `vicePrincipal` and throws
          `FORBIDDEN` for anybody else, and this page is `adminProcedure`, which
          admits those three seats and nobody else — `requirePermission`
          short-circuits all three. So the one thing AGENTS.md warns about, a
          control the server will always refuse, does not arise here: if this bar
          is rendering, the caller can use the filter. The gate still matters, and
          it is still the server's — it is what stops the flag being honoured for a
          teacher who reaches the procedure some other way.

          It sits last among the filters and before "Clear filters" because it
          changes what the *rows* are rather than which of the live rows are
          listed, and a reader scanning the bar left to right should meet it after
          the narrowings rather than before them.
        */}
        <Field>
          <FieldLabel htmlFor="inventory-include-deleted">Retired</FieldLabel>
          <Button
            id="inventory-include-deleted"
            type="button"
            variant={includeDeleted ? "default" : "outline"}
            aria-pressed={includeDeleted}
            onClick={() => onChange({ includeDeleted: !includeDeleted })}
            data-icon="inline-start"
          >
            <IconArchive data-icon="inline-start" />
            Show retired
          </Button>
        </Field>

        {isFiltered ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onReset}
            data-icon="inline-start"
          >
            <IconX data-icon="inline-start" />
            Clear filters
          </Button>
        ) : null}
      </div>

      {/*
        The count line and the two standing notes, as one component. Extracted
        because the bar itself was at the top of the `no-giant-component` limit
        and this block is three `<p>`s that share a row — and because the reason
        the retired note is conditional belongs with the note rather than in the
        middle of the filter markup.
      */}
      <FilterBarSummary
        resultCount={resultCount}
        totalCount={totalCount}
        isFiltered={isFiltered}
        includeDeleted={includeDeleted}
      />
    </div>
  );
};
