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

interface StaffComboboxProps {
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  value: string;
  onValueChange: (staffId: string) => void;
  disabled?: boolean;
  /** Staff ids to leave out of the list — the seat's current holders. */
  excludeIds?: readonly string[];
}

const DEBOUNCE_MS = 250;

/**
 * Searchable staff picker for assigning a leadership position.
 *
 * A self-contained copy of `class-assignment/teacher-combobox.tsx` rather
 * than a shared import — feature folders in this tree do not reach into one
 * another (see AGENTS.md). Unlike that picker, this one is not limited to
 * `staffCategory: "teacher"`: a Deputy or Assistant Principal appointment is
 * not restricted to the teaching roster.
 */
export const StaffCombobox = ({
  id,
  describedBy,
  invalid,
  value,
  onValueChange,
  disabled = false,
  excludeIds,
}: StaffComboboxProps) => {
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

  const excludeSet = useMemo(
    () => (excludeIds ? new Set(excludeIds) : undefined),
    [excludeIds]
  );

  const staffList = useMemo(() => {
    const all = (staffQuery.data || []) as unknown as Staff[];
    return excludeSet
      ? all.filter((member) => !excludeSet.has(member.id))
      : all;
  }, [staffQuery.data, excludeSet]);

  const selected = useMemo(
    () => staffList.find((s) => s.id === value) ?? null,
    [staffList, value]
  );

  return (
    <Combobox<Staff>
      items={staffList}
      value={selected}
      onValueChange={(item) => onValueChange(item?.id ?? "")}
      onInputValueChange={setQuery}
      itemToStringLabel={(item) => item?.name ?? ""}
      isItemEqualToValue={(a, b) => a?.id === b?.id}
      filter={null}
    >
      <ComboboxInput
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        placeholder="Search by staff name"
        showClear={!!value}
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {staffQuery.isLoading ? "Searching…" : "No staff found"}
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
