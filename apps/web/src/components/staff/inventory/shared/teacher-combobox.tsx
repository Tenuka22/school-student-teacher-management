"use client";

import { Badge } from "@school-student-teacher-management/ui/components/badge";
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
import { IconIdBadge } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type * as React from "react";
import { useEffect, useId, useMemo, useState } from "react";

import type { AssignableStaffOption } from "@/components/staff/inventory/inventory-types";
import { orpc } from "@/utils/orpc";

const DEBOUNCE_MS = 250;

/**
 * A stand-in row for a selected member of staff who is not on the loaded page.
 *
 * Built as a whole `AssignableStaffOption` rather than cast into one, so the
 * fields the option carries and this component does not read — `staffCategory`,
 * `employmentStatus`, `currentRole` — cannot drift away from the router's
 * projection the way a partial object with a cast would.
 *
 * `staffCategory` is a placeholder and nothing here reads it: the column is
 * `notNull` and its type is the closed `StaffCategory` pair, so there is no
 * "unknown" to put in it, and the row is labelled as not-loaded rather than
 * pretending the category is known. `employmentStatus` and `currentRole` *are*
 * nullable, and are null because they are genuinely unknown.
 */
const unlistedStaff = (id: string): AssignableStaffOption => ({
  id,
  name: "Selected member of staff",
  serviceNo: null,
  staffCategory: "teacher",
  employmentStatus: null,
  currentRole: null,
});

/**
 * The people a school property may be given to.
 *
 * `orpc.inventory.options.assignableStaff` is a **security surface, not a display
 * filter** — it is the source for every manager, custodian and borrower field in
 * the feature, so its rows are exactly the staff a procedure would accept
 * (`assertStaffIsAssignable` enforces the same predicate on the write path:
 * employment `active` or unset, with no restriction on `staffCategory`, so the
 * bursar and the lab attendant are in it alongside the teaching staff). Reading
 * it in one place means the pickers cannot drift apart from what the server will
 * allow.
 *
 * The query is left enabled for an empty search so the combobox opens with the
 * alphabetically-first page rather than an empty box that looks broken.
 */
export const useAssignableStaffOptions = (
  search?: string
): { options: AssignableStaffOption[]; isLoading: boolean } => {
  const query = useQuery(
    orpc.inventory.options.assignableStaff.queryOptions({
      input: { search: search || undefined },
    })
  );

  const options = useMemo(() => query.data ?? [], [query.data]);

  return { options, isLoading: query.isLoading };
};

/** The badge number beside the name, or nothing at all when the record has none. */
const ServiceNoLine: React.FC<{ serviceNo: string | null }> = ({
  serviceNo,
}) => (
  <span className="text-muted-foreground truncate text-xs">
    {serviceNo ? `Service no. ${serviceNo}` : "No service number on record"}
  </span>
);

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

  const { options, isLoading } = useAssignableStaffOptions(debouncedQuery);

  const selected = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value]
  );

  /**
   * The selected member of staff can be outside the current page — the search box
   * holds a term, the page holds fifty names, and an item edited months later
   * still has its manager. Injecting a placeholder row is what keeps the field
   * from rendering as *empty* while a value is set, which reads as "nobody is
   * assigned" and is the single most damaging thing this component could do.
   */
  const items = useMemo(
    () => (value && !selected ? [unlistedStaff(value), ...options] : options),
    [options, selected, value]
  );

  const chosen = useMemo(
    () => items.find((option) => option.id === value) ?? null,
    [items, value]
  );

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
        // Filtering is the server's job: it matches name *and* service number
        // and escapes LIKE wildcards, which a client-side filter over the
        // current page would not.
        filter={null}
      >
        <ComboboxInput
          id={inputId}
          placeholder={placeholder}
          showClear={allowClear && Boolean(value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {isLoading ? "Searching..." : "No members of staff found"}
          </ComboboxEmpty>
          <ComboboxList>
            {items.map((option) => (
              <ComboboxItem key={option.id} value={option}>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{option.name}</span>
                  <ServiceNoLine serviceNo={option.serviceNo} />
                </div>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {/*
        "None selected" is a *chosen state*, not an absence of one.
        `assignManager` takes `newManagerStaffId: null` and that clears the
        manager, which is a real and audited change; a field that simply looked
        blank would make the difference between "leave it alone" and "remove the
        current manager" invisible, and the form could not tell which one the
        user meant. So the cleared state is stated on the face of the field.
      */}
      {allowClear && !value ? (
        <Badge
          variant="outline"
          className="text-muted-foreground w-fit border-dashed"
        >
          <IconIdBadge />
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
