"use client";

import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@school-student-teacher-management/ui/components/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  IconAlertTriangle,
  IconIdBadge,
  IconRefresh,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type * as React from "react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import type { AssignableStaffOption } from "@/components/staff/inventory/inventory-types";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/*
 * Three of this file's exports are not components: `useAssignableStaffOptions` is
 * a hook (Fast Refresh tolerates those), and `nameCollisions` and
 * `PickerListStatus`'s supporting vocabulary are pure functions. The rule exists
 * to stop a module holding component state *and* a changing export, because
 * editing the second then throws the first away. `nameCollisions` is a pure
 * function over a list — there is no state in this module to lose — and it is
 * exported rather than inlined because three surfaces in this folder have to
 * count duplicate names the same way. See the note above `nameCollisions`.
 */
/* oxlint-disable react-doctor/only-export-components -- pure name-counting vocabulary shared with the filter bar and the borrower picker; no module state */

const DEBOUNCE_MS = 250;

/**
 * A stand-in row for a selected member of staff who is not on the loaded page.
 *
 * Built as a **whole** `AssignableStaffOption` — no cast, no partial — so it
 * cannot drift away from the router's projection the way a partial object with an
 * `as` would. That projection is five fields off the `staff` table (`id`, `name`,
 * `staffCategory`, `employmentStatus`, `serviceNo`, `currentRole`), and the three
 * the stand-in cannot know are filled with the values that mean exactly "not
 * loaded": an employment status of `null` is the same "nobody has confirmed it"
 * the picker's own predicate treats as assignable, and the badge number and role
 * are simply absent rather than invented.
 *
 * The name says the two true things and neither of the untrue ones: the id is
 * real, and the name is not loaded. It does not print a plausible colleague's
 * name, and it does not print an empty field.
 */
const STAND_IN_NAME = "Chosen — not on this page of names";

const unlistedStaff = (id: string): AssignableStaffOption => ({
  id,
  name: STAND_IN_NAME,
  staffCategory: "teacher",
  employmentStatus: null,
  serviceNo: null,
  currentRole: null,
});

/** Whether a name is the stand-in's, which the row styles differently. */
const isStandInName = (name: string): boolean => name === STAND_IN_NAME;

/**
 * How many of the loaded people answer to one name, for the names more than one
 * answers to.
 *
 * ## Why this exists even though the badge number is back on the wire
 *
 * `orpc.inventory.options.assignableStaff` projects `serviceNo` — the badge
 * number off `staff.teacherServiceNo` — again: the projection is the `staff`
 * table, which is where identity for custody and management lives. A school
 * reliably has several staff with similar names: "Mrs. Perera" is not a
 * disambiguator when there are three of them, and `EMP-0417` is.
 *
 * The badge is on the response rather than on the row: the second line printed
 * here is the count, which covers the case the badge cannot — **a person with no
 * badge number on record**, or a list where some of the namesakes have one and
 * some do not. It is a fact about the response in front of the user — "three
 * people on this list answer to this name" — rather than a guess about a column,
 * and unlike a hardcoded placeholder it cannot print a number the row does not
 * have.
 *
 * Normalized on `trim().toLowerCase()` because the same person is written
 * "Perera" and "perera" in two places in a school's data, and a collision count
 * that misses those is a count that is wrong in the safe-looking direction.
 *
 * Exported because three surfaces in this folder have to answer the same
 * question — the combobox row, the filter bar's custodian select and the
 * borrower's staff mode — and three copies of the grouping is three places for
 * them to disagree about how a name is normalized.
 */
export const nameCollisions = (
  options: readonly AssignableStaffOption[]
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();

  for (const option of options) {
    const key = option.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Map(
    [...counts].filter(([, count]) => count > 1) as [string, number][]
  );
};

/**
 * The sentence under a name that is not unique, and nothing at all for one that
 * is.
 *
 * A row with no second line is a normal row; a row that always carries one would
 * be a form to fill in, and "no service number on record" on all forty rows was
 * noise that said nothing about any of them. The second line appears exactly when
 * it has something to say, which is when the name alone is not enough to pick
 * somebody out.
 */
const collisionNote = (count: number): string =>
  `${count} people on this list share this name`;

/**
 * The second line under a row, and nothing at all when there is nothing to say.
 *
 * Its own function rather than a nested ternary at the call site, because the
 * three cases are genuinely three and reading them inline is how the stand-in
 * row ends up wearing a collision count it did not earn.
 */
const staffRowNote = (isStandIn: boolean, shared: number): string | null => {
  if (isStandIn) {
    return "Kept from an earlier edit — its name is not on this page";
  }

  return shared > 1 ? collisionNote(shared) : null;
};

/**
 * What a picker's list says when it has nothing to list.
 *
 * ## The three states, and why they cannot be collapsed into two
 *
 * A combobox whose popup reads "No members of staff found" is making a claim
 * about the College's staff roll. **A request that timed out, was refused or hit
 * a dropped LAN connection produces the same empty list**, so the two are
 * indistinguishable at the point of use, and the empty branch is the one that
 * gets believed: a clerk who cannot load the custodian list concludes that no
 * member of staff can be a custodian, and either picks a wrong name or gives up.
 *
 * So this component names all three:
 *
 * - **loading** — a sentence, not a spinner and not the empty claim;
 * - **failed** — what could not be read, through `formatApiErrorMessage` rather
 *   than `error.message`, plus a real retry. A failed read is the one case where
 *   a button is genuinely the right control: the overwhelmingly common cause is
 *   a dropped connection on a school LAN and the correct response is to try again;
 * - **genuinely empty** — only reached on a request that succeeded and returned
 *   nothing, which is the one time "no … found" is a fact.
 *
 * `subject` is what the read was *of*, so the failure sentence names the thing
 * rather than the symptom: "Could not load the list of staff who may hold school
 * property" tells a clerk which of four identical-looking pickers on the dialog
 * is broken.
 */
export const PickerListStatus: React.FC<{
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
  /** The genuinely-empty sentence, which is only ever true on a resolved read. */
  empty: string;
  /** What the list is of, for the failure sentence. */
  subject: string;
  loading?: string;
}> = ({ isFetching, error, onRetry, empty, subject, loading = "Loading…" }) => {
  if (error) {
    return (
      <div
        className="text-destructive flex flex-col items-start gap-2 px-3 py-4 text-xs"
        role="alert"
      >
        <span className="flex items-start gap-1.5">
          <IconAlertTriangle
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0"
          />
          {formatApiErrorMessage(error, `Could not load ${subject}`)}
        </span>
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
      </div>
    );
  }

  if (isFetching) {
    /*
     * `<output>`, not `<p role="status">`. `output` is the semantic element for a
     * region of a form that is a *result*, which is exactly what "still searching"
     * is, and it carries the live-region behaviour without the role — so the
     * announcement is the element's rather than an attribute bolted onto a
     * paragraph that means something else.
     */
    return (
      <output
        className="text-muted-foreground block px-3 py-4 text-xs"
        aria-live="polite"
      >
        {loading}
      </output>
    );
  }

  return <p className="text-muted-foreground px-3 py-4 text-xs">{empty}</p>;
};

/**
 * The people a school property may be given to.
 *
 * `orpc.inventory.options.assignableStaff` is a **security surface, not a display
 * filter** — it is the source for every manager, custodian and borrower field in
 * the feature, so its rows are exactly the staff a procedure would accept. The
 * gate is `inventoryOverseerProcedure` (the register's read tier) and the
 * predicate is the one `assertStaffIsAssignable` enforces on the write path, so
 * the two cannot offer and accept different sets.
 *
 * ## It is a staff list, and the row is five fields
 *
 * Identity for custody and management is the `staff` row — the four `*_staff_id`
 * columns on the inventory tables hold a `staff.id`, the procedures take a
 * `staffRefSchema` value, and the write guard reads `staff` too — so the
 * projection is the `staff` table: `id`, `name`, `staffCategory`,
 * `employmentStatus`, `serviceNo` and the login's `currentRole` (joined only to
 * say whether the person behind a staff row is the admin seat, which the
 * predicate excludes). Employment `active` or unconfirmed is the predicate,
 * matching the write path; a departure therefore drops off this list as soon as
 * their status says so.
 *
 * The consequence a reader of this folder should hold onto: **`name` plus the
 * badge number is what distinguishes two people on this list**, and the badge is
 * on the response — `nameCollisions` above covers the names where it is not
 * enough or not present.
 *
 * ## `isLoading` versus `isFetching`, and both against `error`
 *
 * All three are handed back because the three states are not the same state:
 * `isLoading` is the first page, `isFetching` is *any* request including the one
 * behind the next keystroke, and `error` is the one that must never be allowed to
 * render as "no members of staff found". `error` is truthy only until a
 * successful refetch replaces it, which is what `refetch` is for.
 *
 * The query is left enabled for an empty search so the combobox opens with the
 * first page rather than an empty box that looks broken.
 */
export const useAssignableStaffOptions = (
  search?: string
): {
  options: AssignableStaffOption[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const query = useQuery(
    orpc.inventory.options.assignableStaff.queryOptions({
      input: { search: search || undefined },
    })
  );

  const options = useMemo(() => query.data ?? [], [query.data]);

  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    options,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch,
  };
};

export const StaffComboboxField: React.FC<{
  value: string | null;
  onChange: (staffId: string | null) => void;
  label: string;
  description?: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
}> = ({
  value,
  onChange,
  label,
  description,
  error,
  disabled = false,
  placeholder = "Search for a member of staff...",
  allowClear = false,
}) => {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // `useId` rather than a fixed string: three of these can be open on one page
  // (manager, custodian, borrower) and a shared id would make every label point
  // at the last one rendered.
  const inputId = useId();

  /**
   * The error and the description are *referenced by* the control, not merely
   * rendered next to it.
   *
   * This is a reused field — it is the manager, the custodian and the borrower
   * picker, and the actor filter on both ledger tabs — so it is the field a
   * screen-reader user meets most often, and an orphaned `FieldError` means the
   * reason the server refused the write is announced to nobody at all. The
   * `allowClear` copy above and the "None selected" badge are visual; the error
   * is the one that has to reach the control.
   *
   * Derived from `useId` so two instances in one form (the item form renders the
   * manager and the custodian pickers together) cannot mint the same
   * `-description` id twice.
   */
  const errorId = `${inputId}-error`;
  const descriptionId = `${inputId}-description`;
  const describedBy = [
    error ? errorId : null,
    description ? descriptionId : null,
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const {
    options,
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useAssignableStaffOptions(debouncedQuery);

  /**
   * Names more than one loaded person answers to, and nothing for a name that is
   * unique. Built over `options` rather than over `items` so the stand-in row
   * below is never counted as a colleague.
   */
  const collisions = useMemo(() => nameCollisions(options), [options]);

  const selected = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value]
  );

  /**
   * The selected member of staff can be outside the current page — the search box
   * holds a term, the page holds fifty names, and an item edited months later
   * still has its manager. Injecting a stand-in row is what keeps the field from
   * rendering as *empty* while a value is set, which reads as "nobody is assigned"
   * and is the single most damaging thing this component could do.
   */
  const items = useMemo(
    () => (value && !selected ? [unlistedStaff(value), ...options] : options),
    [options, selected, value]
  );

  const chosen = useMemo(
    () => items.find((option) => option.id === value) ?? null,
    [items, value]
  );

  /**
   * Placeholder shown in the box while a search is in flight, so the settled name
   * does not vanish the moment a keystroke lands.
   */
  const searching = isLoading || isFetching;

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Combobox<AssignableStaffOption>
        items={items}
        value={chosen}
        onValueChange={(item) => onChange(item?.id ?? null)}
        onInputValueChange={setQuery}
        itemToStringLabel={(item) => item?.name ?? ""}
        isItemEqualToValue={(a, b) => a?.id === b?.id}
        /*
         * Filtering is the server's job, and the reason it matters is the LIKE
         * escape: `options.assignableStaff` matches the `staff` name
         * case-insensitively with `%` and `_` escaped, so a storekeeper typing an
         * underscore into a name is not shown the whole establishment. A
         * client-side filter over the current page would not do that.
         */
        filter={null}
      >
        <ComboboxInput
          id={inputId}
          placeholder={placeholder}
          showClear={allowClear && Boolean(value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          aria-busy={searching || undefined}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            <PickerListStatus
              isFetching={isFetching}
              error={loadError}
              onRetry={handleRetry}
              empty="No members of staff found"
              subject="the list of staff who may hold school property"
              loading="Searching the staff list…"
            />
          </ComboboxEmpty>
          <ComboboxList>
            {items.map((option) => {
              const standIn = isStandInName(option.name);
              const shared =
                collisions.get(option.name.trim().toLowerCase()) ?? 0;
              const note = staffRowNote(standIn, shared);

              return (
                <ComboboxItem key={option.id} value={option}>
                  <div className="flex min-w-0 flex-col">
                    <span
                      className={`truncate font-medium${
                        standIn ? " text-muted-foreground italic" : ""
                      }`}
                    >
                      {option.name}
                    </span>
                    {note ? (
                      <span className="text-muted-foreground truncate text-xs">
                        {note}
                      </span>
                    ) : null}
                  </div>
                </ComboboxItem>
              );
            })}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {/*
        "None selected" states the cleared state on the face of the field
        rather than leaving the control silently blank. The write that used to
        make this badge an audited decision — `assignManager` taking
        `newManagerStaffId: null` — went with the owner column's NOT NULL, so
        what remains under `allowClear` is a filter going back to "anybody" or
        a form field going back to unchosen, and neither is visible once the
        trigger's own text is gone. It stays a live region because clearing is
        a change the user made with the mouse and is otherwise the one edit on
        this control that is never spoken.
      */}
      {allowClear && !value ? (
        <Badge
          variant="outline"
          className="text-muted-foreground w-fit border-dashed"
          aria-live="polite"
        >
          <IconIdBadge aria-hidden="true" />
          None selected
        </Badge>
      ) : null}
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
};
