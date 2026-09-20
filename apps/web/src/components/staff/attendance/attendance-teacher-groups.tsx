"use client";

import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { cn } from "@school-student-teacher-management/ui/lib/utils";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { CLASS_CATEGORIES } from "@/components/staff/class-assignment/class-categories";

export interface AttendanceTeacher {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  gradeLevels: number[];
}

interface AttendanceTeacherGroupsProps {
  teachers: AttendanceTeacher[];
  selectedStaffId: string;
  onSelect: (staffId: string) => void;
  isLoading?: boolean;
}

const UNASSIGNED_LABEL = "Not yet assigned to classes";

/** Groups every teacher by the grade band(s) they teach this academic year
 * (Primary/Secondary/Collegiate) - a teacher spanning bands appears in each
 * one, and a teacher with no period assignments yet lands in its own group
 * rather than being hidden. */
const groupTeachers = (teachers: AttendanceTeacher[]) => {
  const groups = CLASS_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    teachers: [] as AttendanceTeacher[],
  }));
  const categoryGradeSets = CLASS_CATEGORIES.map(
    (category) => new Set<number>(category.grades)
  );
  const unassigned: AttendanceTeacher[] = [];

  for (const teacher of teachers) {
    let matched = false;
    for (const [index, grades] of categoryGradeSets.entries()) {
      if (teacher.gradeLevels.some((g) => grades.has(g))) {
        groups[index].teachers.push(teacher);
        matched = true;
      }
    }
    if (!matched) {
      unassigned.push(teacher);
    }
  }

  return unassigned.length > 0
    ? [
        ...groups,
        { key: "unassigned", label: UNASSIGNED_LABEL, teachers: unassigned },
      ]
    : groups;
};

export const AttendanceTeacherGroups = ({
  teachers,
  selectedStaffId,
  onSelect,
  isLoading = false,
}: AttendanceTeacherGroupsProps) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return teachers;
    }
    return teachers.filter((t) => t.name.toLowerCase().includes(q));
  }, [teachers, query]);

  const groups = useMemo(() => groupTeachers(filtered), [filtered]);

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3">
      <div className="relative">
        <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter teachers..."
          className="pl-8"
        />
      </div>

      <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
        {isLoading && (
          <p className="text-muted-foreground text-sm">Loading teachers...</p>
        )}
        {!isLoading && groups.every((g) => g.teachers.length === 0) && (
          <p className="text-muted-foreground text-sm">No teachers found.</p>
        )}
        {groups.map(
          (group) =>
            group.teachers.length > 0 && (
              <div key={group.key} className="space-y-1">
                <div className="text-muted-foreground flex items-center gap-2 px-1 text-xs font-semibold tracking-wide uppercase">
                  {group.label}
                  <Badge variant="secondary">{group.teachers.length}</Badge>
                </div>
                {group.teachers.map((teacher) => (
                  <button
                    key={teacher.id}
                    type="button"
                    onClick={() => onSelect(teacher.id)}
                    className={cn(
                      "hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      selectedStaffId === teacher.id &&
                        "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    {teacher.name}
                  </button>
                ))}
              </div>
            )
        )}
      </div>
    </div>
  );
};
