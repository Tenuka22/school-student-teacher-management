"use client";

import { UNIT_STATUSES } from "@school-student-teacher-management/db/constants/inventory";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { IconSortAscending } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type * as React from "react";
import { useMemo } from "react";

import type { UnitOption } from "@/components/staff/inventory/inventory-types";
import { orpc } from "@/utils/orpc";

/** A school's asset drawer for one item line is comfortably under this. */
const DEFAULT_UNIT_LIMIT = 200;

/** Skeleton rows while the tag list loads. Static, so the identity is the index. */
const LOADING_PLACEHOLDER_ROWS = [0, 1, 2];

/**
 * The tagged units of one item.
 *
 * `status` is passed straight through to `orpc.inventory.units.list`, so the
 * lifecycle dialogs can ask for exactly the units they may touch: stock-out and
 * disposal want `"available"`, the tag register wants no filter.
 */
export const useItemUnits = (
  itemId: string | null,
  status?: string
): { units: UnitOption[]; isLoading: boolean } => {
  /**
   * `status` is typed as a plain `string` here so a caller can hand over a value
   * straight from a form, but `orpc.inventory.units.list` takes a picklist. An
   * unrecognised status is therefore dropped rather than sent — the server
   * would answer `BAD_REQUEST` and the whole tag list would fail to load over a
   * filter the user could not see.
   */
  const typedStatus = UNIT_STATUSES.find((candidate) => candidate === status);

  const query = useQuery(
    orpc.inventory.units.list.queryOptions({
      input: {
        itemId: itemId ?? undefined,
        status: typedStatus,
        limit: DEFAULT_UNIT_LIMIT,
      },
      // A null item is the "pick an item first" state, not an error, and
      // querying every unit in the school to render nothing is not free.
      enabled: Boolean(itemId),
    })
  );

  const units = useMemo(() => query.data?.units ?? [], [query.data]);

  return { units, isLoading: query.isLoading };
};

/**
 * The order a unit is *claimed* in, which is not the order they are *listed* in.
 *
 * `orpc.inventory.units.list` sorts by `uniqueNo ASC` because a clerk scans a
 * column of tags. `getAvailableUnits` — the server-side claim that actually
 * decides which projectors leave the cupboard — sorts by `createdAt ASC, id ASC`,
 * because FIFO is what a school counts on. Those are two different orders, so
 * "Select the oldest N" re-sorts here rather than trusting the array it was
 * handed. **The two have to agree**: a button that offered the oldest units and
 * a server that handed out the newest would have the user watching the
 * selection they just made be silently replaced.
 */
const byClaimOrder = (units: UnitOption[]): UnitOption[] =>
  units.toSorted((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }

    return a.id < b.id ? -1 : 1;
  });

/**
 * The live count, in words: how many are ticked against how many the quantity says.
 *
 * A module function rather than three lines of JSX in the component, because it is
 * the same arithmetic in both mismatch directions and the component should be
 * reading it, not computing it.
 */
const countLabel = (selected: number, qty: number): string => {
  if (selected > qty) {
    return `${selected} of ${qty} selected — too many`;
  }

  const remaining = Math.max(0, qty - selected);

  return `${selected} of ${qty} selected${
    remaining > 0 ? ` — ${remaining} still to choose` : ""
  }`;
};

/**
 * Too many units ticked: the sentence says how many to take back.
 *
 * Never truncated silently: a dialog that quietly drops the extra units a user
 * ticked is worse than one that refuses, because the movement that reaches the
 * ledger would not be the one on the screen.
 */
const overQtyMessage = (selected: number, qty: number): string =>
  `${selected} units are selected but the quantity is ${qty}. Remove ${selected - qty}.`;

/**
 * **The refusal this field now makes itself**, and it is the same sentence the four
 * dialogs say on submit — moved here, not rewritten.
 *
 * All four call sites — `stock-dialogs.tsx`, `issue-dialogs.tsx`,
 * `borrow-dialogs.tsx` and `disposal-dialogs.tsx` — block a part-named list with
 * this shape, each ending in its own verb ("taken" / "issued" / "lent" / "chosen at
 * sign-off") because each owns a different movement. This shared field does not
 * know which of the four it is in, so it says the neutral one: **name exactly
 * `qty`, or clear the field and the oldest `qty` are chosen for you.** The empty
 * field stays the recommended answer, which is why the second half of the sentence
 * exists at all — a bare refusal would push a user towards ticking boxes they did
 * not need to tick.
 *
 * The server's wording is what is being avoided on purpose: *"Only 1 unit(s) are
 * available"* is **false** — the item has three and the clerk named one — and
 * repeating it here would put a lie in front of the user at the moment they are
 * deciding what to do about it. A storebook that says a projector is unavailable
 * when two are on the shelf is a storebook nobody trusts.
 */
const underQtyMessage = (selected: number, qty: number): string =>
  `You named ${selected} tag${selected === 1 ? "" : "s"} but the quantity is ${qty}. Name ${qty} tag${qty === 1 ? "" : "s"}, or clear this field and the oldest ${qty} will be chosen for you.`;

export const UnitPickerField: React.FC<{
  itemId: string | null;
  value: string[];
  onChange: (unitIds: string[]) => void;
  qty: number;
  label: string;
  description?: string;
  error?: string;
  disabled?: boolean;
}> = ({
  itemId,
  value,
  onChange,
  qty,
  label,
  description,
  error,
  disabled = false,
}) => {
  const { units, isLoading } = useItemUnits(itemId, "available");

  const claimOrder = useMemo(() => byClaimOrder(units), [units]);

  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (unit: UnitOption) => {
    const key = unit.uniqueNo;
    const next = new Set(selected);

    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }

    onChange([...next]);
  };

  /**
   * Fill the selection with the oldest `qty` available units.
   *
   * This is the single most useful affordance in the feature. A bulk item has no
   * tags at all and a bulk movement is a count, and even a tagged one is
   * normally "the next two, please" — which is exactly what the server does by
   * itself when `uniqueItemIds` is omitted. The button exists so the *displayed*
   * selection agrees with the *effective* one instead of the form showing
   * nothing and the server quietly choosing.
   *
   * It replaces rather than appends: "the oldest N" is a complete instruction,
   * and appending to a hand-picked selection would hand back something the
   * user did not ask for.
   */
  const selectOldest = () => {
    onChange(
      claimOrder.slice(0, Math.max(0, qty)).map((unit) => unit.uniqueNo)
    );
  };

  /**
   * **The one number that decides whether this field is in a state the server
   * accepts.** `getAvailableUnits` requires a supplied `uniqueItemIds` to cover
   * `qty` exactly: a short list is refused with `CONFLICT` *"Only 1 unit(s) are
   * available"*, which is a **false** sentence — the item has three, the clerk
   * named one. So the two mismatches are treated as one kind of problem here even
   * though the count line words them differently: too many is a mistake to undo,
   * and too few is a decision to finish or withdraw.
   *
   * A **short** selection is the case worth stopping on, because an empty field is
   * a legitimate answer on all four call sites — the server then takes the oldest
   * `qty` by its own record — so "1 of 3 selected — 2 still to choose" used to read
   * as a state in progress rather than as one the form will refuse. Refusing it
   * here, before submit, is what turns an invitation into a rule, and the message
   * (`underQtyMessage`) names both ways out for the reason the empty field is still
   * the recommended answer.
   */
  const isOverQty = value.length > qty;
  const isUnderQty = value.length > 0 && value.length < qty;
  const mismatchedToQty = isOverQty || isUnderQty;
  const canSelectOldest =
    !disabled && qty > 0 && claimOrder.length > 0 && value.length !== qty;

  // One `if` per state rather than a chain of ternaries: these are four
  // genuinely different situations (nothing chosen yet, still loading, a bulk
  // item with no tags, a tagged item) and reading them as a nested expression
  // is how one of them ends up rendering inside the wrong branch.
  let body: React.ReactNode;

  if (!itemId) {
    body = (
      <p className="text-muted-foreground border border-dashed p-3 text-sm">
        Choose an item first — its asset tags are listed here.
      </p>
    );
  } else if (isLoading) {
    /*
     * The same shape as `InventorySkeleton`, for the same reason: an
     * `aria-hidden` region with nothing in the accessibility tree is a silent
     * wait. `aria-busy` plus a visually-hidden line announces the transition
     * without exposing the placeholder bars, which carry no information a screen
     * reader could use.
     */
    body = (
      <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading this item&apos;s asset tags…</span>
        <div className="flex flex-col gap-2" aria-hidden="true">
          {LOADING_PLACEHOLDER_ROWS.map((row) => (
            <div key={row} className="bg-muted h-6 animate-pulse" />
          ))}
        </div>
      </div>
    );
  } else if (claimOrder.length === 0) {
    body = (
      <p className="text-muted-foreground border border-dashed p-3 text-sm">
        This item is counted in bulk — it has no tagged units, so the server
        will take {qty} off the shelf oldest-first by its own record.
      </p>
    );
  } else {
    const countCopy = countLabel(value.length, qty);

    body = (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/*
            The live count, because "did my click register" is the question a
            multi-select cannot answer on its own, and because a silent mismatch
            between this and `qty` is what the error below exists to catch. It is
            styled as a problem in **both** mismatch directions now, because both
            are refused below — the two are not "one fine and one broken", they
            are one rule with two sides.
          */}
          <p
            className={`text-sm tabular-nums ${
              mismatchedToQty
                ? "text-destructive font-medium"
                : "text-muted-foreground"
            }`}
          >
            {countCopy}
          </p>
          {canSelectOldest ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectOldest}
              disabled={disabled}
              data-icon="inline-start"
            >
              <IconSortAscending data-icon="inline-start" />
              Select the oldest {qty}
            </Button>
          ) : null}
        </div>

        <div className="max-h-56 overflow-y-auto border">
          {claimOrder.map((unit) => {
            // An explicit `id` / `htmlFor` pair rather than wrapping the
            // checkbox in a `<label>`: Base UI's `Checkbox` is a `<button>`, and
            // a label wrapping a button forwards its own activation to that
            // button — so the row would toggle twice on some paths and once on
            // others. The label is the accessible name, which is also why the
            // checkbox needs no `aria-label` of its own.
            const controlId = `inventory-unit-${unit.id}`;

            return (
              <div
                key={unit.id}
                className="hover:bg-muted/50 flex items-center gap-2 border-b px-2 py-1.5 last:border-b-0"
              >
                <Checkbox
                  id={controlId}
                  checked={selected.has(unit.uniqueNo)}
                  onCheckedChange={() => toggle(unit)}
                  disabled={disabled}
                />
                <label
                  htmlFor={controlId}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                >
                  <span className="font-medium tabular-nums">
                    {unit.uniqueNo}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {[unit.condition, unit.location]
                      .filter(Boolean)
                      .join(" · ")}
                    {unit.createdAt
                      ? ` · added ${unit.createdAt.slice(0, 10)}`
                      : ""}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /*
   * Values are the **asset tags as typed** (`uniqueNo`), not the unit ids.
   * `getAvailableUnits` matches a supplied entry against either the row `id` or
   * the normalized tag, so both work — and the tag is the one a teacher reads
   * off the device in their hand, which is why sending it means the person at
   * the counter never has to resolve a tag to an id in a round trip the server
   * is already doing. Sending `uniqueNo` verbatim is deliberate:
   * `normalizeInventoryKey` runs server-side, so a tag typed `lt-0042` still
   * finds `LT-0042`.
   */
  let shownError: string | null = error ?? null;

  if (isOverQty) {
    shownError = overQtyMessage(value.length, qty);
  } else if (isUnderQty) {
    shownError = underQtyMessage(value.length, qty);
  }

  return (
    <Field data-invalid={Boolean(shownError)}>
      <FieldLabel>{label}</FieldLabel>
      {body}
      {shownError ? <FieldError>{shownError}</FieldError> : null}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
};
