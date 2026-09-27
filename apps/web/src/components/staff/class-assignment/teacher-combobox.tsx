"use client";

import type { StaffListItem } from "@school-student-teacher-management/api/routers/staff/list-staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@school-student-teacher-management/ui/components/combobox";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";

import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

type Staff = StaffListItem;

/**
 * The only four fields this picker reads.
 *
 * `listStaff` returns the whole staff record with its linked user and account
 * rows, which is more than a name in a dropdown needs. Narrowing at the
 * boundary means the stand-in row for an off-list teacher is four honest fields
 * rather than thirty nulls, and it cannot fall behind the router's projection.
 */
type TeacherOption = Pick<Staff, "id" | "name" | "email" | "phone">;

interface TeacherComboboxProps {
  id?: string;
  value: string;
  onValueChange: (staffId: string) => void;
  disabled?: boolean;
  academicYearId?: string;
  /** Ids of the description and error nodes that describe this control. */
  ariaDescribedBy?: string;
  invalid?: boolean;
  placeholder?: string;
}

const DEBOUNCE_MS = 250;

/**
 * A row for a homeroom teacher who is not on the eligible list.
 *
 * `onlyPositioned` narrows the roster to staff who can actually hold a
 * homeroom post this year, so a class whose teacher left the College — or whose
 * teacher simply is not on the page the server returned — has a `value` that no
 * loaded item matches. Without a stand-in the field renders *empty* while
 * holding a value, which reads as "nobody is assigned" and invites an
 * accidental unassignment. This says what is true: someone is assigned, and
 * they are not on this list.
 */
const unlistedTeacher = (id: string): TeacherOption => ({
  id,
  name: "Assigned teacher — not on this year's list",
  email: null,
  phone: null,
});

/**
 * Searchable teacher picker: query is sent server-side (fuzzy, debounced),
 * each option shows name plus contact info so admins can disambiguate
 * same-name teachers, and the selection can be cleared entirely.
 */
export const TeacherCombobox = ({
  id,
  value,
  onValueChange,
  disabled = false,
  academicYearId,
  ariaDescribedBy,
  invalid = false,
  placeholder = "Search for a teacher…",
}: TeacherComboboxProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const staffQuery = useQuery(
    orpc.staff.listStaff.queryOptions({
      input: {
        search: debouncedQuery || undefined,
        academicYearId,
        onlyPositioned: true,
      },
      enabled: Boolean(academicYearId),
    })
  );

  const staffList = useMemo<TeacherOption[]>(
    () => staffQuery.data ?? [],
    [staffQuery.data]
  );

  const selected = useMemo(
    () => staffList.find((s) => s.id === value) ?? null,
    [staffList, value]
  );

  const items = useMemo<TeacherOption[]>(
    () =>
      value && !selected ? [unlistedTeacher(value), ...staffList] : staffList,
    [staffList, selected, value]
  );

  const chosen = useMemo(
    () => items.find((member) => member.id === value) ?? null,
    [items, value]
  );

  /**
   * Three outcomes, and the middle one used to wear the third one's clothes.
   *
   * A failed request returns no rows, exactly as a search that matched nothing
   * does, so the box said "No teachers found" over a 500 — a confident claim
   * about the College's staff drawn from a request that never arrived. The
   * failure now names itself and offers the only thing that helps, which is
   * asking again.
   */
  const emptyMessage = () => {
    if (staffQuery.isLoading) {
      return "Searching…";
    }
    if (staffQuery.isError) {
      return formatApiErrorMessage(
        staffQuery.error,
        "The teacher list could not be loaded."
      );
    }
    if (!academicYearId) {
      return "No academic year is selected, so there is no teacher roster to search.";
    }
    return "No teachers found";
  };

  return (
    <Combobox<TeacherOption>
      items={items}
      value={chosen}
      onValueChange={(item) => onValueChange(item?.id ?? "")}
      onInputValueChange={setQuery}
      itemToStringLabel={(item) => item?.name ?? ""}
      isItemEqualToValue={(a, b) => a?.id === b?.id}
      // Filtering is the server's job, so the box cannot disagree with what
      // the assignment procedure will accept.
      filter={null}
    >
      <ComboboxInput
        id={inputId}
        placeholder={placeholder}
        showClear={Boolean(value)}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          <span className="block">{emptyMessage()}</span>
          {staffQuery.isError && (
            <Button
              variant="outline"
              size="xs"
              className="mt-2"
              onClick={() => {
                void staffQuery.refetch();
              }}
            >
              Try again
            </Button>
          )}
        </ComboboxEmpty>
        <ComboboxList>
          {items.map((member) => (
            <ComboboxItem key={member.id} value={member}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{member.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {[member.email, member.phone].filter(Boolean).join(" · ") ||
                    "No contact info"}
                </span>
              </div>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
};
