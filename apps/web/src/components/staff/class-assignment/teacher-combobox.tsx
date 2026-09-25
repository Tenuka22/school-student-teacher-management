"use client";

import type { StaffListItem } from "@school-student-teacher-management/api/routers/staff/list-staff";
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

type Staff = StaffListItem;

interface TeacherComboboxProps {
  id?: string;
  value: string;
  onValueChange: (staffId: string) => void;
  disabled?: boolean;
  academicYearId?: string;
}

const DEBOUNCE_MS = 250;

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
}: TeacherComboboxProps) => {
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
    })
  );

  const staffList = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);

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
        placeholder="Search for a teacher..."
        showClear={!!value}
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {staffQuery.isLoading ? "Searching..." : "No teachers found"}
        </ComboboxEmpty>
        <ComboboxList>
          {staffList.map((member) => (
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
