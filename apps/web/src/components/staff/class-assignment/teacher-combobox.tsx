"use client";

import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@school-student-teacher-management/ui/components/combobox";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { orpc } from "@/utils/orpc";

type Staff = typeof staffTable.$inferSelect;

interface TeacherComboboxProps {
  id?: string;
  /** Ids of the help text and/or error message describing this field. */
  describedBy?: string;
  invalid?: boolean;
  value: string;
  onValueChange: (staffId: string) => void;
  disabled?: boolean;
}

const DEBOUNCE_MS = 250;

/**
 * Searchable teacher picker: query is sent server-side (fuzzy, debounced),
 * each option shows name plus contact info so admins can disambiguate
 * same-name teachers, and the selection can be cleared entirely.
 */
export const TeacherCombobox = ({
  id,
  describedBy,
  invalid,
  value,
  onValueChange,
  disabled = false,
}: TeacherComboboxProps) => {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const staffQuery = useQuery(
    orpc.staff.listStaff.queryOptions({
      input: { search: debouncedQuery || undefined },
    })
  );

  const staffList = useMemo(
    () => (staffQuery.data || []) as unknown as Staff[],
    [staffQuery.data]
  );

  const selected = useMemo(
    () => staffList.find((s) => s.id === value) ?? null,
    [staffList, value]
  );

  /**
   * Only a keystroke re-queries the server. Picking a name also fires
   * `onInputValueChange` \u2014 Base UI fills the box with the selected name on
   * selection, same as typing a character would \u2014 and forwarding that
   * straight to `setQuery` restarted the 250 ms debounce. For the gap between
   * the restart and the new response, `staffList` had no previous-data
   * fallback, so it went briefly empty and the row just clicked dropped out
   * of `selected`, flashing the box back to blank before the fresh response
   * (matching the same name) put it back. `reason` is Base UI's own record of
   * *why* the box changed; `"item-press"` is the one value that means a row
   * was picked rather than typed, so it is the one excluded from re-querying.
   */
  const handleInputValueChange = (
    next: string,
    eventDetails: { reason: string }
  ) => {
    if (eventDetails.reason !== "item-press") {
      setQuery(next);
    }
  };

  return (
    <Combobox<Staff>
      items={staffList}
      value={selected}
      onValueChange={(item) => onValueChange(item?.id ?? "")}
      onInputValueChange={handleInputValueChange}
      itemToStringLabel={(item) => item?.name ?? ""}
      isItemEqualToValue={(a, b) => a?.id === b?.id}
      filter={null}
    >
      <ComboboxInput
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        placeholder="Search by teacher name"
        showClear={!!value}
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {staffQuery.isLoading ? "Searching…" : "No teachers found"}
        </ComboboxEmpty>
        <ComboboxList>
          {staffList.map((member) => (
            <ComboboxItem key={member.id} value={member}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{member.name}</span>
                <span className="text-muted-foreground type-caption truncate">
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
