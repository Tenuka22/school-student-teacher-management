import { EMPLOYMENT_STATUSES } from "@school-student-teacher-management/db/constants/teachers";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  IconDotsVertical,
  IconSearch,
  IconFileExport,
  IconPlus,
  IconCalendarTime,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

type Staff = typeof staff.$inferSelect;

const getInitials = (name: string) =>
  name
    .replace(/^(?<prefix>Mr\.|Mrs\.|Ms\.|Dr\.)\s*/iu, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

interface TeachersListProps {
  teachers: Staff[] | undefined;
  isLoading: boolean;
  onCreateClick: () => void;
  onEditClick: (teacher: Staff) => void;
  onViewClick: (teacher: Staff) => void;
  onDeleteClick: (teacher: Staff) => void;
  onManageTimetableClick: (teacher: Staff) => void;
  onExportClick: () => void;
}

const getStatusColor = (
  status: string | null
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "active": {
      return "default";
    }

    case "onLeave": {
      return "secondary";
    }

    case "suspended":
    case "terminated": {
      return "destructive";
    }

    case "retired": {
      return "secondary";
    }

    default: {
      return "outline";
    }
  }
};

const TeacherRow = ({
  teacher,
  onEditClick,
  onViewClick,
  onDeleteClick,
  onManageTimetableClick,
}: {
  teacher: Staff;
  onEditClick: () => void;
  onViewClick: () => void;
  onDeleteClick: () => void;
  onManageTimetableClick: () => void;
}) => (
  <TableRow>
    <TableCell className="font-semibold">
      <button
        type="button"
        className="focus-visible:ring-ring flex items-center gap-3 text-left focus-visible:ring-2 focus-visible:outline-none"
        onClick={onViewClick}
      >
        <span
          aria-hidden="true"
          className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center text-xs font-semibold"
        >
          {getInitials(teacher.name)}
        </span>
        <span className="min-w-0">
          <span className="block hover:underline">{teacher.name}</span>
          {/* Below md the Email column is hidden; show it here instead. */}
          <span className="text-muted-foreground type-caption block max-w-[28ch] truncate font-normal md:hidden">
            {teacher.email}
          </span>
        </span>
      </button>
    </TableCell>
    <TableCell className="text-foreground/80 hidden md:table-cell">
      {teacher.email}
    </TableCell>
    <TableCell className="hidden sm:table-cell">{teacher.phone}</TableCell>
    <TableCell>
      {teacher.employmentStatus ? (
        <Badge variant={getStatusColor(teacher.employmentStatus)}>
          {EMPLOYMENT_STATUSES[
            teacher.employmentStatus as keyof typeof EMPLOYMENT_STATUSES
          ]?.label || teacher.employmentStatus}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      )}
    </TableCell>
    <TableCell>
      <div className="flex items-center justify-end gap-1 text-sm font-semibold">
        <button
          type="button"
          className="text-foreground decoration-accent focus-visible:ring-ring min-h-8 px-2 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          onClick={onViewClick}
        >
          View<span className="sr-only"> {teacher.name}</span>
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring min-h-8 px-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          onClick={onEditClick}
        >
          Edit<span className="sr-only"> {teacher.name}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`More actions for ${teacher.name}`}
              />
            }
          >
            <IconDotsVertical aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onManageTimetableClick}>
              <IconCalendarTime aria-hidden="true" className="mr-2 size-4" />
              Manage timetable
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDeleteClick}
              className="text-destructive"
            >
              Delete teacher
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TableCell>
  </TableRow>
);

export const TeachersList = ({
  teachers,
  isLoading,
  onCreateClick,
  onEditClick,
  onViewClick,
  onDeleteClick,
  onManageTimetableClick,
  onExportClick,
}: TeachersListProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTeachers = useMemo(() => {
    if (!teachers) {
      return [];
    }

    if (!searchQuery) {
      return teachers;
    }

    const query = searchQuery.toLowerCase();
    return teachers.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.email?.toLowerCase().includes(query) ||
        t.phone?.includes(query) ||
        t.nic?.includes(query)
    );
  }, [teachers, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`skeleton-${i}`} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const hasResults = !!filteredTeachers && filteredTeachers.length > 0;
  const hasAnyTeachers = !!teachers && teachers.length > 0;

  return (
    <div className="space-y-4">
      {/* Page-level actions */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onExportClick}>
          <IconFileExport className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>
        <Button onClick={onCreateClick} size="sm">
          <IconPlus className="mr-2 h-4 w-4" />
          Add teacher
        </Button>
      </div>

      {/* Table */}
      {hasAnyTeachers ? (
        <div className="border-border overflow-hidden border">
          <div className="border-border focus-within:ring-ring flex items-center gap-2 border-b p-3 focus-within:ring-2 focus-within:ring-inset">
            <IconSearch
              aria-hidden="true"
              className="text-muted-foreground h-4 w-4 shrink-0"
            />
            <Input
              type="search"
              aria-label="Search teachers"
              placeholder="Search by name, email, phone or NIC…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
          {hasResults ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary border-none">
                  <TableHead className="text-accent h-11 text-xs font-bold tracking-[0.08em]">
                    Name
                  </TableHead>
                  <TableHead className="text-accent hidden h-11 text-xs font-bold tracking-[0.08em] md:table-cell">
                    Email
                  </TableHead>
                  <TableHead className="text-accent hidden h-11 text-xs font-bold tracking-[0.08em] sm:table-cell">
                    Phone
                  </TableHead>
                  <TableHead className="text-accent h-11 text-xs font-bold tracking-[0.08em]">
                    Status
                  </TableHead>
                  <TableHead className="text-accent h-11 w-10 text-xs font-bold tracking-[0.08em]">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeachers.map((teacher) => (
                  <TeacherRow
                    key={teacher.id}
                    teacher={teacher}
                    onEditClick={() => onEditClick(teacher)}
                    onViewClick={() => onViewClick(teacher)}
                    onDeleteClick={() => onDeleteClick(teacher)}
                    onManageTimetableClick={() =>
                      onManageTimetableClick(teacher)
                    }
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground p-10 text-center text-sm">
              No teachers found. Try adjusting your search.
            </div>
          )}
        </div>
      ) : (
        <Empty className="border-primary/22 min-h-[50vh] border border-dashed">
          <EmptyTitle className="text-lg">No teachers yet</EmptyTitle>
          <EmptyDescription>
            Create your first teacher record to get started
          </EmptyDescription>
          <EmptyContent>
            <Button onClick={onCreateClick} className="mt-4">
              <IconPlus className="mr-2 h-4 w-4" />
              Add teacher
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
};
