"use client";

/**
 * The two controls that make a quantity unambiguous, and the read that tells the
 * clerk what the number they are typing will actually do.
 *
 * ## Why this is its own module
 *
 * Because the feature had two opposite habits on the same screen. The register table
 * states a count as a bare figure (`40`) with the unit living in a column header six
 * columns away, and the movement dialogs asked for a count in a bare `type="number"`
 * box with nothing on the form saying whether "2" meant two chairs, two boxes or two
 * metres — and then silently rounded a `2.7` down to `2` before the server could
 * refuse it. This module is where the unit and the resulting figure live, so the two
 * cannot disagree.
 *
 * ## The one rule that is not negotiable
 *
 * **A quantity is a whole number, and a whole number is the only thing a counted line
 * can hold.** `inventory_item.qty` is `integer`, every one of the four movement
 * procedures declares `v.integer()`, and `parseQuantity` refuses a decimal out loud
 * rather than rounding it. The unit suffix on the control is there so a clerk who
 * means *two and a half chairs* finds out at the keystroke rather than at the audit.
 */
/* oxlint-disable react-doctor/only-export-components -- a read hook and its two controls share this module because the unit word is the contract between them, and the copy for that sits with the thing it describes */
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@school-student-teacher-management/ui/components/input-group";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type * as React from "react";
import { useCallback, useMemo } from "react";

import { counted, projected } from "@/components/staff/inventory/quantity";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * The counters a movement form needs, read from the item it is about.
 *
 * `adminProcedure` (`get-item.ts` states why at length), which is correct for every
 * screen this is used on: the register, the write-off queue and the issue history are
 * all leadership surfaces. It is deliberately *not* used on the teacher portal, where
 * a teacher's scoped read is `custody.myItems` and a school-wide register read is the
 * thing a teacher's grant must not reach.
 */
export interface StockSnapshot {
  itemName: string;
  sku: string;
  unit: string;
  qty: number;
  availableQty: number;
  minQty: number;
}

/**
 * Four states, not three nullable fields.
 *
 * **A failed read must never render as zero stock, and this type is how that is
 * enforced.** `item?.qty ?? 0` renders a request that timed out as *the store is
 * empty* — and zero stock is a fact a clerk acts on. They receive into a store that
 * is not empty, or they conclude a projector has gone missing and raise a write-off
 * against it. So there is no representation in which "not known" and "zero" are the
 * same value: `data === undefined` becomes an `error` state with the server's absence
 * as its message, and only `ready` renders a figure.
 */
export type StockReadState =
  | { status: "no-item" }
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; item: StockSnapshot };

export const useStockSnapshot = (itemId: string | null): StockReadState => {
  const query = useQuery(
    orpc.inventory.items.get.queryOptions({
      input: { itemId: itemId ?? "" },
      enabled: itemId !== null,
    })
  );

  /**
   * Destructured rather than read off `query` in each branch.
   *
   * `UseQueryResult` is a discriminated union, and testing `data === undefined` narrows
   * it to the success member whose `data` is defined — which collapses the whole object
   * to `never` and takes `refetch` with it. Splitting the fields out loses the
   * correlation between "is an error" and "there is an error", which is why the checks
   * below are still written against the destructured flags.
   */
  const { data, error, isError, isPending, refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return useMemo<StockReadState>(() => {
    if (itemId === null) {
      return { status: "no-item" };
    }

    if (isPending) {
      return { status: "loading" };
    }

    if (isError) {
      return {
        status: "error",
        message: formatApiErrorMessage(
          error,
          "Could not read this item's quantity on hand"
        ),
        retry,
      };
    }

    /**
     * Not an error state and not loading, yet no row. This is the branch that keeps
     * "we could not reach the register" from rendering as a count, so it is an error
     * with the server's own absence as its message — not `data?.qty ?? 0`.
     */
    if (data === undefined) {
      return {
        status: "error",
        message:
          "The register did not return this item, so the resulting quantity cannot be shown. Nothing has been changed.",
        retry,
      };
    }

    return {
      status: "ready",
      item: {
        itemName: data.name,
        sku: data.sku,
        unit: data.unit,
        qty: data.qty,
        availableQty: data.availableQty,
        minQty: data.minQty,
      },
    };
  }, [data, error, isError, isPending, itemId, retry]);
};

/**
 * The quantity input, with the item's own unit printed inside the control and the five
 * parse failures spelled out underneath it.
 *
 * **`InputGroup` and a suffix rather than a `<select>` of units, and rather than
 * nothing at all.** The unit is a property of the *item*, not of this movement, so the
 * clerk chooses it once when they create the line and every movement after that reads
 * it. Putting it inside the control means the number and its unit are never on screen
 * apart — the exact failure the bare `type="number"` had, where the only unit in the
 * form was "Quantity received *" in a label above.
 *
 * `type="text"` with `inputMode="numeric"` rather than `type="number"`, and the same
 * argument `MoneyField` makes about `1,250.00`: a number input silently discards
 * characters it dislikes, so the user gets a control that refuses to hold the comma
 * they typed instead of a message explaining why it is wrong. Here it is worse than
 * cosmetic — a number input also *silently rounds* a decimal, which is the defect this
 * whole module exists to remove.
 */
export const QuantityField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** The item's unit word, or `null` while no item is chosen. */
  unit: string | null;
  /** The server-side ceiling, so the limit is visible before the round trip. */
  max?: number;
  /** A live parse complaint, e.g. a fractional entry. */
  parseError?: string;
  /** A server-side field error, which outranks the local parse complaint. */
  error?: string | undefined;
  /** The caller&rsquo;s own sentence about what this number is for. */
  note?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  controlRef?: React.Ref<HTMLInputElement>;
}> = ({
  value,
  onChange,
  label,
  unit,
  max,
  parseError,
  error,
  note,
  description,
  disabled = false,
  controlRef,
}) => {
  const shownError = error ?? parseError;

  return (
    <Field data-invalid={Boolean(shownError)} required>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          ref={controlRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          placeholder="0"
          disabled={disabled}
          aria-invalid={shownError ? true : undefined}
          data-invalid={shownError ? true : undefined}
        />
        {/*
          `align="inline-end"` so the unit sits where a suffix belongs, and
          `aria-hidden` because it is decoration *for a sighted reader of the control* —
          a screen-reader user gets the same word from the field&rsquo;s description and
          from the resulting-quantity table below, and a hidden region is not the place
          to put the only copy of it.
        */}
        <InputGroupAddon align="inline-end">
          <InputGroupText aria-hidden="true">
            {unit && unit.trim().length > 0 ? unit : "unit"}
          </InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {note ? <FieldDescription>{note}</FieldDescription> : null}
      {max === undefined ? null : (
        <FieldDescription>
          Whole numbers only, and at most {max} in one movement. A delivery
          larger than that is several deliveries, and a counted line never holds
          a fraction.
        </FieldDescription>
      )}
      {description}
      {shownError ? <FieldError>{shownError}</FieldError> : null}
    </Field>
  );
};

/**
 * "What will this do to the register?", as a real two-row table.
 *
 * ## The reason this is a `<table>` and not a row of big numbers
 *
 * It is a pair of labelled facts — a before and an after — and the craft floor bans the
 * hero-metric template: a large "40" with a tiny label above it. A `<table>` with a
 * `<caption>`, `<th scope="row">` on each label and `tabular-nums` on each figure is
 * what a records tool uses, it is announced correctly, and it cannot grow into a card. It
 * is also the only version of this that can say *which* number is which without a
 * reader inferring it from position.
 *
 * ## Four states, and the error state shows no figures at all
 *
 * - **No item chosen** — an instruction, no numbers. Rendering a dash here would be a
 *   number-shaped nothing.
 * - **Loading** — a skeleton *and* `aria-busy` *and* visually-hidden text. A bare
 *   skeleton with nothing in the accessibility tree is a silent wait, and a skeleton
 *   that looks like `40` is a lie.
 * - **Error** — the server's own sentence, a retry, and **zero numbers**. The form stays
 *   submittable in this state, because the server is the authority on availability and a
 *   client-side guess must not stand between a clerk and a legitimate movement — but the
 *   dialog says in words that the check could not be made.
 * - **Ready** — the two figures, and a refusal when the movement would go below zero.
 */
export const ProjectedQuantity: React.FC<{
  read: StockReadState;
  /**
   * The signed effect of this movement on `qty`. Positive for a delivery, negative for
   * a removal. A zero delta renders nothing rather than a row that says the same number
   * twice.
   */
  delta: number;
  /** What to call the second row, so it is not always "after this". */
  afterLabel: string;
}> = ({ read, delta, afterLabel }) => {
  if (delta === 0) {
    return null;
  }

  if (read.status === "no-item") {
    return (
      <p className="text-muted-foreground border border-dashed p-3 text-xs">
        Choose an item and the register&rsquo;s current quantity is shown here,
        beside what this form will make it.
      </p>
    );
  }

  if (read.status === "loading") {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">
          Reading this item&rsquo;s quantity on hand&hellip;
        </span>
        <div className="grid grid-cols-2 gap-2" aria-hidden="true">
          <Skeleton className="h-3" />
          <Skeleton className="h-3" />
        </div>
      </div>
    );
  }

  if (read.status === "error") {
    const handleRetry = () => {
      read.retry();
    };
    return (
      <div role="alert" className="border-destructive/30 bg-destructive/5 p-3">
        <p className="text-destructive text-xs font-medium">{read.message}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          The resulting quantity is unknown rather than zero, so nothing on this
          form is blocked by it &mdash; the server re-checks availability when
          the movement is saved, and will refuse it with the real number if
          there is not enough on the shelf.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={handleRetry}
          data-icon="inline-start"
        >
          <IconRefresh aria-hidden="true" data-icon="inline-start" />
          Read the quantity again
        </Button>
      </div>
    );
  }

  const { unit, qty, availableQty, itemName } = read.item;
  const after = qty + delta;
  /**
   * A movement that would take the count below zero is refused *here*, with the real
   * number, rather than at the server. `stock-out.ts` and `create-issue.ts` both call
   * `assertSufficientAvailableQuantity` and it will say the same thing — but it says it
   * after a round trip, and a clerk who has typed a twelve-character reason should not
   * have to wait for a refusal to learn that there is nothing to take.
   */
  const isShort = delta < 0 && Math.abs(delta) > availableQty;

  return (
    <table className="w-full border text-xs">
      <caption className="sr-only">
        {itemName}: the quantity on hand now, and what this form will make it.
        Counted in {unit}.
      </caption>
      <tbody>
        <tr className="border-b">
          <th
            scope="row"
            className="text-muted-foreground px-2 py-1.5 text-left font-normal"
          >
            On hand now
          </th>
          <td className="px-2 py-1.5 text-right font-medium tabular-nums">
            {counted(qty, unit)}
          </td>
        </tr>
        <tr>
          <th
            scope="row"
            className="text-muted-foreground px-2 py-1.5 text-left font-normal"
          >
            {afterLabel}
          </th>
          <td
            className={`px-2 py-1.5 text-right font-medium tabular-nums ${
              isShort ? "text-destructive" : ""
            }`}
          >
            {projected(after, unit)}
            {isShort ? (
              <span className="text-destructive block text-left font-normal">
                The school holds {counted(availableQty, unit)} available, so
                this cannot be saved. Reduce the quantity to{" "}
                {availableQty === 0
                  ? "nothing — there is none on the shelf"
                  : counted(availableQty, unit)}
                .
              </span>
            ) : null}
          </td>
        </tr>
      </tbody>
    </table>
  );
};
