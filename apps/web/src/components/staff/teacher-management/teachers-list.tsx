import { EMPLOYMENT_STATUSES } from "@school-student-teacher-management/db/constants/teachers";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
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
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  IconDotsVertical,
  IconSearch,
  IconFileExport,
  IconPlus,
  IconAlertCircle,
  IconBook,
  IconCalendarTime,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type Staff = typeof staff.$inferSelect;

interface TeachersListProps {
  teachers: Staff[] | undefined;
  isLoading: boolean;
  onCreateClick: () => void;
  onEditClick: (teacher: Staff) => void;
  onViewClick: (teacher: Staff) => void;
  onDeleteClick: (teacher: Staff) => void;
  onAssignSubjectsClick: (teacher: Staff) => void;
  onManageTimetableClick: (teacher: Staff) => void;
  onExportClick: () => void;
}

const getPluralSuffix = (count: number) => (count === 1 ? "" : "s");

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
  isSelected,
  onSelect,
  onEditClick,
  onViewClick,
  onDeleteClick,
  onAssignSubjectsClick,
  onManageTimetableClick,
}: {
  teacher: Staff;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onEditClick: () => void;
  onViewClick: () => void;
  onDeleteClick: () => void;
  onAssignSubjectsClick: () => void;
  onManageTimetableClick: () => void;
}) => (
  <TableRow>
    <TableCell>
      <Checkbox checked={isSelected} onCheckedChange={onSelect} />
    </TableCell>
    <TableCell className="font-medium">
      <button
        type="button"
        className="text-left hover:underline"
        onClick={onViewClick}
      >
        {teacher.name}
      </button>
    </TableCell>
    <TableCell>{teacher.email}</TableCell>
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
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="ghost" size="sm">
            <IconDotsVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onViewClick}>
            View Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEditClick}>
            Edit Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onAssignSubjectsClick}>
            <IconBook className="mr-2 size-4" />
            Assign Subjects
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onManageTimetableClick}>
            <IconCalendarTime className="mr-2 size-4" />
            Manage Timetable
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDeleteClick}
            className="text-destructive"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
  onAssignSubjectsClick,
  onManageTimetableClick,
  onExportClick,
}: TeachersListProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

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

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(filteredTeachers.map((t) => t.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [filteredTeachers]
  );

  const handleSelectRow = useCallback((teacherId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(teacherId);
      } else {
        next.delete(teacherId);
      }

      return next;
    });
  }, []);

  const handleDeleteClick = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }

    setShowDeleteWarning(true);
  }, [selectedIds.size]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`skeleton-${i}`} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!filteredTeachers || filteredTeachers.length === 0) {
    return (
      <Empty className="min-h-[60vh] border-none">
        <EmptyTitle>
          {searchQuery ? "No teachers found" : "No teachers yet"}
        </EmptyTitle>
        <EmptyDescription>
          {searchQuery
            ? "Try adjusting your search"
            : "Create your first teacher record to get started"}
        </EmptyDescription>
        <EmptyContent>
          <Button onClick={onCreateClick} className="mt-4">
            <IconPlus className="mr-2 h-4 w-4" />
            Create Teacher
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <IconSearch className="text-muted-foreground h-4 w-4 flex-shrink-0" />
          <Input
            placeholder="Search teachers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onExportClick}>
            <IconFileExport className="mr-2 h-4 w-4" />
            Export as Excel
          </Button>
          <Button onClick={onCreateClick} size="sm">
            <IconPlus className="mr-2 h-4 w-4" />
            Add Teacher
          </Button>
        </div>
      </div>

      {/* Bulk selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-muted flex items-center justify-between gap-2 rounded-lg p-3">
          <span className="text-muted-foreground text-sm">
            {selectedIds.size} item{getPluralSuffix(selectedIds.size)} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onExportClick}>
              Export Selected
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteClick}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Delete warning dialog */}
      {showDeleteWarning && (
        <div className="border-destructive/30 bg-destructive/10 flex items-center gap-3 rounded-lg border p-3">
          <IconAlertCircle className="text-destructive h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Delete {selectedIds.size} teacher
              {getPluralSuffix(selectedIds.size)}?
            </p>
            <p className="text-muted-foreground text-xs">
              This action cannot be undone.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteWarning(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                toast("Deletion initiated for selected teachers");
                setShowDeleteWarning(false);
                setSelectedIds(new Set());
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell className="w-8">
              <Checkbox
                checked={
                  selectedIds.size > 0 &&
                  selectedIds.size === filteredTeachers.length
                }
                onCheckedChange={handleSelectAll}
              />
            </TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
            <TableCell className="hidden sm:table-cell">Phone</TableCell>
            <TableCell>Status</TableCell>
            <TableCell className="w-10" />
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredTeachers.map((teacher) => (
            <TeacherRow
              key={teacher.id}
              teacher={teacher}
              isSelected={selectedIds.has(teacher.id)}
              onSelect={(checked) =>
                handleSelectRow(teacher.id, checked as boolean)
              }
              onEditClick={() => onEditClick(teacher)}
              onViewClick={() => onViewClick(teacher)}
              onDeleteClick={() => onDeleteClick(teacher)}
              onAssignSubjectsClick={() => onAssignSubjectsClick(teacher)}
              onManageTimetableClick={() => onManageTimetableClick(teacher)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
