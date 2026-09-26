"use client";

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
import { useQuery } from "@tanstack/react-query";
import type * as React from "react";
import { useEffect, useId, useMemo, useState } from "react";

import type { InventoryItemStatus } from "@/components/staff/inventory/inventory-types";
import { orpc } from "@/utils/orpc";

const DEBOUNCE_MS = 250;

/** A school register is read one page at a time; 50 lines is well past a screen. */
const DEFAULT_OPTION_LIMIT = 50;

export interface ItemPickerOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Items a dialog can act on, searched server-side.
 *
 * `status` is the reason this hook takes one: it is how the four callers narrow
 * the same list. Stock-in, issue, borrow and disposal are all movements *out of*
 * or *into* the store on a specific quantity, and the one question they all
 * need answered before the form is even shown is "is there any of it".
 *
 * **An out-of-stock option is `disabled`, never hidden.** Hiding it means a
 * clerk searching for the projector and not finding it concludes the system is
 * broken — which, from where they are sitting, is exactly what a missing
 * projector looks like. A greyed-out row with "0 available" explains itself,
 * tells them the item still exists, and names the number that is stopping them.
 * The same reasoning is why an option's description carries the counters
 * (`availableQty` of `qty`, and the custodian when there is one) rather than
 * just a name.
 */
export const useItemOptions = (input?: {
  search?: string;
  status?: InventoryItemStatus;
  limit?: number;
}): {
  options: ItemPickerOption[];
  isLoading: boolean;
  search: string;
  setSearch: (value: string) => void;
} => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const status = input?.status;
  const limit = input?.limit ?? DEFAULT_OPTION_LIMIT;

  const query = useQuery(
    orpc.inventory.items.list.queryOptions({
      input: {
        search: debouncedSearch || undefined,
        status,
        limit,
      },
    })
  );

  const options = useMemo<ItemPickerOption[]>(
    () =>
      (query.data?.items ?? []).map((item) => ({
        value: item.id,
        label: `${item.name} (${item.sku})`,
        description: [
          `${item.availableQty} of ${item.qty} available`,
          item.custodianName ? `Held by ${item.custodianName}` : "In store",
        ].join(" · "),
        // A borrowed line with nothing left is the case that matters: `qty` is
        // untouched by a borrow, so an item with one projector out on loan still
        // reports `qty: 1` and would otherwise look available.
        disabled: item.availableQty <= 0,
      })),
    [query.data]
  );

  return {
    options,
    isLoading: query.isLoading,
    search,
    setSearch,
  };
};

export const ItemPickerField: React.FC<{
  value: string | null;
  onChange: (itemId: string | null) => void;
  label: string;
  description?: string;
  error?: string;
  disabled?: boolean;
  onlyAvailable?: boolean;
}> = ({
  value,
  onChange,
  label,
  description,
  error,
  disabled = false,
  onlyAvailable = false,
}) => {
  // `useId` rather than a fixed string: a borrow dialog and a disposal dialog
  // can both be mounted in the page shell, and a shared id would leave the
  // second label pointing at the first field.
  const inputId = useId();

  /**
   * The error and the description are *referenced by* the control, not merely
   * rendered next to it.
   *
   * The item picker is the first control in the stock-in, issue, borrow and
   * disposal dialogs — four of the five dialogs in this feature — so it is where
   * a screen-reader user is told "this item is fully out on loan" or why the
   * server refused the movement. An orphaned `FieldError` announces nothing, and
   * the description ("Only items with units on the shelf are offered") is the
   * sentence that explains the disabled options before the error appears.
   */
  const errorId = `${inputId}-error`;
  const descriptionId = `${inputId}-description`;
  const describedBy = [
    error ? errorId : null,
    description ? descriptionId : null,
  ]
    .filter(Boolean)
    .join(" ");

  /**
   * `onlyAvailable` maps to `status: "available"`, which is what the stock-in,
   * issue, borrow and disposal dialogs need. It is a *server* filter rather than
   * a client-side one so the list is not quietly offering items the movement
   * procedures would refuse; the `disabled` flag above then covers the residual
   * case the status filter cannot see (an item whose borrowed units are
   * exhausted but whose `qty` is not zero).
   */
  const { options, isLoading, setSearch } = useItemOptions(
    onlyAvailable ? { status: "available" } : undefined
  );

  /**
   * The chosen item can be off the current page — the box holds a search term,
   * the page holds fifty rows. Without a placeholder row the field would render
   * as empty while a value was set, and a dialog that looks like it has not been
   * filled in is the one thing that must not happen here.
   */
  const items = useMemo(() => {
    if (!value || options.some((option) => option.value === value)) {
      return options;
    }

    return [
      { value, label: "Selected item", description: "Not on this page" },
      ...options,
    ];
  }, [options, value]);

  const selected = useMemo(
    () => items.find((option) => option.value === value) ?? null,
    [items, value]
  );

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Combobox<ItemPickerOption>
        items={items}
        value={selected}
        onValueChange={(item) => onChange(item?.value ?? null)}
        onInputValueChange={setSearch}
        itemToStringLabel={(item) => item?.label ?? ""}
        isItemEqualToValue={(a, b) => a?.value === b?.value}
        // Server-side search, same reason as the teacher combobox: the list is
        // a page of a large register, not the whole register.
        filter={null}
      >
        <ComboboxInput
          id={inputId}
          placeholder="Search for an item..."
          showClear={Boolean(value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {isLoading ? "Searching..." : "No items found"}
          </ComboboxEmpty>
          <ComboboxList>
            {items.map((option) => (
              <ComboboxItem
                key={option.value}
                value={option}
                disabled={option.disabled}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{option.label}</span>
                  {option.description ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {option.description}
                    </span>
                  ) : null}
                </div>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
};
