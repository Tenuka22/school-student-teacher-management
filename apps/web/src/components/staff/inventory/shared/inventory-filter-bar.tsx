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
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import type * as React from "react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useState,
} from "react";

import type {
  AssignableStaffOption,
  CategoryOption,
  InventoryFilters,
  InventoryItemStatus,
} from "@/components/staff/inventory/inventory-types";
import { hasActiveInventoryFilters } from "@/components/staff/inventory/inventory-types";
import { itemStatusLabel } from "@/components/staff/inventory/shared/inventory-status-badge";
import {
  nameCollisions,
  useAssignableStaffOptions,
} from "@/components/staff/inventory/shared/teacher-combobox";
import { formatApiErrorMessage } from "@/lib/api-error";

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
 *
 * The second case is the interesting one. A filter value is a `user.id` and the
 * list it is resolved against is a page of fifty names, so the person the filter
 * is actually narrowing to is routinely not on the page. Printing the raw id
 * would be honest and useless; printing a *guessed* name would be a lie that gets
 * submitted. "Current custodian" is the one sentence that is true in all three
 * readings — the filter is on, it is about the current holder, and the browser is
 * telling the user it cannot name them.
 *
 * When the person *is* loaded and their name is not unique on the list, the
 * collision count comes with it. `options.assignableStaff` no longer projects the
 * badge number (`serviceNo`), so the name is the only thing on the wire that
 * distinguishes two people, and "R. Perera" is not a disambiguator in a school
 * that has three of them.
 */
const custodianFilterLabel = (
  resolved: AssignableStaffOption | null,
  value: string,
  shared: number
): string => {
  if (resolved) {
    return shared > 1
      ? `${resolved.name} · ${shared} with this name`
      : resolved.name;
  }

  if (value) {
    return "Current custodian";
  }

  return "Anyone";
};

/**
 * A stand-in row for a filter value whose person is not on the loaded page.
 *
 * Built as a **whole** `AssignableStaffOption` — no cast, no partial — so it
 * cannot drift from the router's projection. That is now a two-field object: the
 * procedure selects `id` and `name` off `user` and returns.
 *
 * The row prints the filter's own words, "Current custodian", because that is the
 * claim the control is making. It is left pickable — re-picking it is a no-op that
 * hands back the id already in state, and disabling a *selected* listbox item
 * would make the one row standing for the current filter unreachable by keyboard.
 */
const unlistedCustodian = (id: string): AssignableStaffOption => ({
  id,
  name: "Current custodian",
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
    /*
     * Names the button, in the button's own words, and the same words
     * `EMPTY_FILTERED_COPY` uses. The two sentences appear on one screen — this
     * line above the table, that one in place of the table when nothing matches —
     * and a reader who has to work out that "a filter" and "Clear filters" are the
     * same object is being asked for two pieces of work to understand one screen.
     */
    return `Showing ${resultCount} of ${totalCount} — press Clear filters to widen the list`;
  }

  return `Showing the first ${resultCount} of ${totalCount} — narrow the search to reach the rest`;
};

/**
 * A `Select` that always has a readable value, and never renders a failure as an
 * absence of people.
 *
 * This is the one filter on the bar whose source can fail while the rest of the
 * bar renders perfectly, and the failure mode is the worst in the feature: a
 * dropped request for `options.assignableStaff` leaves this select holding
 * **"Anyone"** as its only option, which is a `custodianStaffId: null` — *every*
 * item, unfiltered, and indistinguishable from the truth. A storekeeper narrows
 * to "the projector is in R. Perera's care", the select silently offers nobody,
 * the row list stays at 312, and the filter looks like it was never set. It is
 * therefore the one filter on this bar that states its own failure, with a retry
 * that really refetches.
 */
const CustodianSelect: React.FC<{
  id: string;
  value: string;
  onChange: (staffId: string) => void;
  options: AssignableStaffOption[];
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
}> = ({ id, value, onChange, options, isFetching, error, onRetry }) => {
  const resolved = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value]
  );

  const collisions = useMemo(() => nameCollisions(options), [options]);

  const shared = useMemo(
    () =>
      resolved ? (collisions.get(resolved.name.trim().toLowerCase()) ?? 0) : 0,
    [collisions, resolved]
  );

  const items = useMemo(
    () =>
      value && !resolved ? [unlistedCustodian(value), ...options] : options,
    [options, resolved, value]
  );

  const label = custodianFilterLabel(resolved, value, shared);

  const trigger = (
    <Select
      value={value || ALL}
      onValueChange={(next) => onChange(next === ALL ? "" : (next ?? ""))}
    >
      <SelectTrigger id={id} className="w-[15rem]">
        <SelectValue placeholder="Anyone">{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Anyone</SelectItem>
        {/*
          Loading and failed are separate rows, and both are inert: neither is
          pickable, so a click during a request cannot set the filter to a
          sentinel the server would reject.
        */}
        {isFetching && !error ? (
          <SelectItem disabled value="__loading">
            Loading staff…
          </SelectItem>
        ) : null}
        {error ? (
          <SelectItem disabled value="__error">
            Could not load the staff list
          </SelectItem>
        ) : null}
        {items.map((option) => {
          const count = collisions.get(option.name.trim().toLowerCase()) ?? 0;

          return (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
              {count > 1 ? ` · ${count} with this name` : ""}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  /**
   * The retry lives **outside** the popup, not inside it, and the reason is
   * structural: `SelectContent` is a listbox, and a `<button>` inside a listbox
   * is both invalid ARIA and unreachable — `Esc` and the outside-press handler
   * close the popup over it. A failure that can only be recovered from inside the
   * thing that failed is a failure with no recovery.
   */
  return (
    <div className="flex flex-col items-start gap-1.5">
      {trigger}
      {error ? (
        <p
          className="text-destructive flex items-start gap-1.5 text-xs"
          role="alert"
        >
          <IconAlertTriangle
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0"
          />
          <span>
            {formatApiErrorMessage(
              error,
              "Could not load the list of staff who may hold school property"
            )}{" "}
            — the custodian filter is showing everyone until it loads.
          </span>
        </p>
      ) : null}
      {error ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          data-icon="inline-start"
        >
          <IconRefresh aria-hidden="true" data-icon="inline-start" />
          Try again
        </Button>
      ) : null}
    </div>
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

/**
 * The search box, on its own so the bar's component is about arrangement rather
 * than about an `InputGroup`.
 *
 * It takes the *draft* and reports keystrokes, not the committed `search` prop,
 * because the debounce lives in the bar: the box must not repaint from the
 * committed value while the user is still typing, or the term they are halfway
 * through replacing disappears under the caret.
 */
const SearchFilterField: React.FC<{
  id: string;
  draft: string;
  onDraftChange: (value: string) => void;
}> = ({ id, draft, onDraftChange }) => (
  <Field className="min-w-[16rem] flex-1">
    <FieldLabel htmlFor={id}>Search</FieldLabel>
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <IconSearch
          aria-hidden="true"
          className="text-muted-foreground size-4"
        />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        placeholder="Search name, SKU or description"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
      />
    </InputGroup>
  </Field>
);

/**
 * A filter that is a **toggle** rather than a value: "low stock only" and "show
 * retired".
 *
 * A toggle button rather than a checkbox, and `aria-pressed` rather than a
 * second control for the state: the label has to read as the filter it switches,
 * and a pressed button says "on" without borrowing a second box to say it in.
 *
 * One component for both, because the two are the same control with different
 * copy — and because the *label* must not be a category heading. This one's read
 * "Stock", which names a kind of thing rather than the narrowing being applied: a
 * storekeeper scanning the bar saw seven controls and had to work out which of
 * them "Stock" belonged to. Every control on this bar is now labelled for the
 * filter it performs.
 */
const FilterToggle: React.FC<{
  id: string;
  label: string;
  text: string;
  Icon: typeof IconArchive;
  pressed: boolean;
  onToggle: () => void;
}> = ({ id, label, text, Icon, pressed, onToggle }) => (
  <Field className="w-auto">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Button
      id={id}
      type="button"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      onClick={onToggle}
      data-icon="inline-start"
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      {text}
    </Button>
  </Field>
);

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

  /**
   * The control ids, namespaced per instance by one `useId`.
   *
   * Seven literal ids (`inventory-search`, `inventory-status`, …) were here, and
   * they were a hazard rather than a convenience: a form that renders this bar
   * twice — the register and the asset-tag register share the pattern — puts
   * `inventory-status` in the document twice, and the second `<FieldLabel
   * htmlFor>` then activates the first control while the second one has no
   * accessible name at all. `MoneyField` had exactly that bug. One `useId` and
   * seven suffixes cannot collide, and the ids stay readable in the inspector.
   */
  const idBase = useId();
  const searchId = `${idBase}-search`;
  const statusId = `${idBase}-status`;
  const categoryId_ = `${idBase}-category`;
  const conditionId = `${idBase}-condition`;
  const custodianId = `${idBase}-custodian`;
  const lowStockId = `${idBase}-low-stock`;
  const retiredId = `${idBase}-include-deleted`;

  const {
    options: assignableStaff,
    isFetching: isFetchingAssignableStaff,
    error: assignableStaffError,
    refetch: refetchAssignableStaff,
  } = useAssignableStaffOptions();

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

  const handleRetryAssignableStaff = useCallback(() => {
    refetchAssignableStaff();
  }, [refetchAssignableStaff]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <SearchFilterField
          id={searchId}
          draft={searchDraft}
          onDraftChange={setSearchDraft}
        />

        <Field className="w-auto">
          <FieldLabel htmlFor={statusId}>Status</FieldLabel>
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
            <SelectTrigger id={statusId} className="w-[10rem]">
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

        <Field className="w-auto">
          <FieldLabel htmlFor={categoryId_}>Category</FieldLabel>
          <Select
            value={categoryId || ALL}
            onValueChange={(next) => onChange({ categoryId: next ?? "" })}
          >
            <SelectTrigger id={categoryId_} className="w-[12rem]">
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

        <Field className="w-auto">
          <FieldLabel htmlFor={conditionId}>Condition</FieldLabel>
          <Select
            value={condition || ALL}
            onValueChange={(next) => onChange({ condition: next ?? "" })}
          >
            <SelectTrigger id={conditionId} className="w-[10rem]">
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

        <Field className="w-auto">
          <FieldLabel htmlFor={custodianId}>Custodian</FieldLabel>
          <CustodianSelect
            id={custodianId}
            value={custodianStaffId}
            onChange={(next) => onChange({ custodianStaffId: next })}
            options={assignableStaff}
            isFetching={isFetchingAssignableStaff}
            error={assignableStaffError}
            onRetry={handleRetryAssignableStaff}
          />
        </Field>

        <FilterToggle
          id={lowStockId}
          label="Low stock"
          text="Low stock only"
          Icon={IconAlertTriangle}
          pressed={lowStockOnly}
          onToggle={() => onChange({ lowStockOnly: !lowStockOnly })}
        />

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
        <FilterToggle
          id={retiredId}
          label="Retired"
          text="Show retired"
          Icon={IconArchive}
          pressed={includeDeleted}
          onToggle={() => onChange({ includeDeleted: !includeDeleted })}
        />

        {isFiltered ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onReset}
            data-icon="inline-start"
          >
            <IconX aria-hidden="true" data-icon="inline-start" />
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
