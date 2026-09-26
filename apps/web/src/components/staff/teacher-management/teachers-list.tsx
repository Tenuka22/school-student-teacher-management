import type { StaffListItem } from "@school-student-teacher-management/api/routers/staff/list-staff";
import {
  APPOINTMENT_TYPES,
  EMPLOYMENT_STATUSES,
} from "@school-student-teacher-management/db/constants/teachers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
  IconCalendarTime,
  IconDotsVertical,
  IconFileExport,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";

import { QueryErrorPanel } from "@/components/query-error-panel";

interface TeachersListProps {
  teachers: StaffListItem[] | undefined;
  isLoading: boolean;
  /** The roster request failed. Kept separate from `isLoading` on purpose. */
  isError: boolean;
  /** The server's own words about the failure, for the error panel. */
  errorMessage: string;
  /** Must genuinely re-request the roster. */
  onRetry: () => void;
  onCreateClick: () => void;
  onEditClick: (teacher: StaffListItem) => void;
  onViewClick: (teacher: StaffListItem) => void;
  onDeleteClick: (teacher: StaffListItem) => void;
  onManageTimetableClick: (teacher: StaffListItem) => void;
  onExportClick: () => void;
  onExportSelectedClick: (staffIds: string[]) => void;
  onDeleteSelectedClick: (staffIds: string[]) => Promise<string[]>;
  isExportPending: boolean;
  isBulkDeletePending: boolean;
}

const getInitials = (name: string) =>
  name
    .replace(/^(?<prefix>Mr\.|Mrs\.|Ms\.|Dr\.)\s*/iu, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const getPluralSuffix = (count: number) => (count === 1 ? "" : "s");

const getStatusColor = (
  status: string | null
): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "active") {
    return "default";
  }
  if (status === "onLeave" || status === "retired") {
    return "secondary";
  }
  if (status === "suspended" || status === "terminated") {
    return "destructive";
  }
  return "outline";
};

const TeacherRow = ({
  teacher,
  isSelected,
  onSelect,
  onEditClick,
  onViewClick,
  onDeleteClick,
  onManageTimetableClick,
}: {
  teacher: StaffListItem;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onEditClick: () => void;
  onViewClick: () => void;
  onDeleteClick: () => void;
  onManageTimetableClick: () => void;
}) => (
  <TableRow>
    <TableCell>
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => onSelect(checked === true)}
        aria-label={`Select ${teacher.name}`}
      />
    </TableCell>
    <TableCell className="font-medium">
      <button
        type="button"
        className="flex items-center gap-3 text-left"
        onClick={onViewClick}
      >
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center text-xs font-bold">
          {getInitials(teacher.name)}
        </span>
        <span className="min-w-0">
          <span className="hover:underline">{teacher.name}</span>
          <span className="text-muted-foreground block text-xs font-normal">
            {teacher.teacherServiceNo ?? "No service number"}
          </span>
        </span>
      </button>
    </TableCell>
    <TableCell>
      <span className="block">{teacher.email ?? "—"}</span>
      <span className="text-muted-foreground hidden text-xs sm:block">
        {teacher.phone ?? "No phone"}
      </span>
    </TableCell>
    <TableCell>
      {teacher.employmentStatus ? (
        <Badge variant={getStatusColor(teacher.employmentStatus)}>
          {EMPLOYMENT_STATUSES[teacher.employmentStatus]?.label ??
            teacher.employmentStatus}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      )}
      <span className="text-muted-foreground mt-1 block text-xs">
        {teacher.appointmentType
          ? (APPOINTMENT_TYPES[teacher.appointmentType]?.label ??
            teacher.appointmentType)
          : "Appointment not set"}
      </span>
      {teacher.appointmentDate && (
        <span className="text-muted-foreground block text-xs">
          {teacher.appointmentDate}
        </span>
      )}
    </TableCell>
    <TableCell>
      <div className="flex flex-col items-start gap-1">
        <Badge variant={teacher.linkedUser ? "default" : "outline"}>
          {teacher.linkedUser ? "Linked" : "No account"}
        </Badge>
        {teacher.linkedUser?.banned && (
          <Badge variant="destructive">Banned</Badge>
        )}
        {teacher.linkedUser && !teacher.linkedUser.emailVerified && (
          <Badge variant="secondary">Unverified email</Badge>
        )}
      </div>
    </TableCell>
    <TableCell>
      <div className="flex items-center justify-end gap-4 text-xs font-bold">
        <button
          type="button"
          className="text-accent-foreground decoration-accent underline-offset-4 hover:underline"
          onClick={onViewClick}
        >
          View
        </button>
        <button
          type="button"
          className="text-foreground/70 hover:text-foreground hover:underline"
          onClick={onEditClick}
        >
          Edit
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Actions for ${teacher.name}`}
              />
            }
          >
            <IconDotsVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onManageTimetableClick}>
                <IconCalendarTime />
                Manage Timetable
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDeleteClick} variant="destructive">
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TableCell>
  </TableRow>
);

export const TeachersList = ({
  teachers,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onCreateClick,
  onEditClick,
  onViewClick,
  onDeleteClick,
  onManageTimetableClick,
  onExportClick,
  onExportSelectedClick,
  onDeleteSelectedClick,
  isExportPending,
  isBulkDeletePending,
}: TeachersListProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const filteredTeachers = useMemo(() => {
    if (!teachers) {
      return [];
    }
    if (!searchQuery) {
      return teachers;
    }

    const query = searchQuery.toLowerCase();
    return teachers.filter((teacher) =>
      [
        teacher.name,
        teacher.email,
        teacher.phone,
        teacher.nic,
        teacher.teacherServiceNo,
        teacher.linkedUser?.email,
      ].some((value) => value?.toLowerCase().includes(query))
    );
  }, [searchQuery, teachers]);

  const selectedFilteredCount = filteredTeachers.filter((teacher) =>
    selectedIds.has(teacher.id)
  ).length;

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(filteredTeachers.map((teacher) => teacher.id)));
        return;
      }
      setSelectedIds(new Set());
    },
    [filteredTeachers]
  );

  const handleSelectRow = useCallback((staffId: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(staffId);
      } else {
        next.delete(staffId);
      }
      return next;
    });
  }, []);

  const handleConfirmSelectedDelete = async () => {
    const deletedIds = await onDeleteSelectedClick([...selectedIds]);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const staffId of deletedIds) {
        next.delete(staffId);
      }
      return next;
    });
    if (deletedIds.length > 0) {
      setIsDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={`teacher-skeleton-${index}`} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const hasResults = filteredTeachers.length > 0;
  const hasAnyTeachers = Boolean(teachers?.length);

  /**
   * The roster, in whichever state it is actually in.
   *
   * "No teachers yet — create the first teacher record to get started" is a
   * claim about the College, and a request that 500s, times out or is refused
   * also yields no rows. A screen that only asks "is the list empty?" prints
   * that sentence on a failure: it cannot tell a school with no teachers from
   * a request that learned nothing, so it confidently misinforms whoever reads
   * it. So the failed read is answered first and in its own words, and the
   * empty state is reachable only from a request that succeeded.
   */
  const renderRoster = () => {
    if (isError) {
      return (
        <QueryErrorPanel
          message={errorMessage}
          onRetry={onRetry}
          title="The teacher roster could not be loaded"
        />
      );
    }

    if (!hasAnyTeachers) {
      return (
        <Empty className="border-primary/22 min-h-[50vh] border border-dashed">
          <EmptyTitle className="font-heading text-2xl">
            No teachers yet
          </EmptyTitle>
          <EmptyDescription>
            Create the first teacher record to get started
          </EmptyDescription>
          <EmptyContent>
            <Button onClick={onCreateClick} className="mt-4">
              <IconPlus data-icon="inline-start" />
              Create Teacher
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    return (
      <div className="border-primary/14 overflow-x-auto border">
        <div className="border-primary/12 flex items-center gap-2 border-b p-3">
          <IconSearch className="text-muted-foreground size-4 shrink-0" />
          <label htmlFor="teacher-search" className="sr-only">
            Search teachers
          </label>
          <Input
            id="teacher-search"
            placeholder="Search by name, email, phone, NIC or service number…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>
        {hasResults ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary border-none">
                <TableHead className="w-8">
                  <Checkbox
                    checked={
                      filteredTeachers.length > 0 &&
                      selectedFilteredCount === filteredTeachers.length
                    }
                    onCheckedChange={(checked) =>
                      handleSelectAll(checked === true)
                    }
                    aria-label="Select visible teachers"
                  />
                </TableHead>
                <TableHead className="text-accent h-11 text-xs font-extrabold tracking-[0.16em]">
                  TEACHER
                </TableHead>
                <TableHead className="text-accent h-11 text-xs font-extrabold tracking-[0.16em]">
                  CONTACT
                </TableHead>
                <TableHead className="text-accent h-11 text-xs font-extrabold tracking-[0.16em]">
                  EMPLOYMENT
                </TableHead>
                <TableHead className="text-accent h-11 text-xs font-extrabold tracking-[0.16em]">
                  ACCOUNT
                </TableHead>
                <TableHead className="text-accent h-11 w-40 text-xs font-extrabold tracking-[0.16em]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeachers.map((teacher) => (
                <TeacherRow
                  key={teacher.id}
                  teacher={teacher}
                  isSelected={selectedIds.has(teacher.id)}
                  onSelect={(checked) => handleSelectRow(teacher.id, checked)}
                  onEditClick={() => onEditClick(teacher)}
                  onViewClick={() => onViewClick(teacher)}
                  onDeleteClick={() => onDeleteClick(teacher)}
                  onManageTimetableClick={() => onManageTimetableClick(teacher)}
                />
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="min-h-72 border-none">
            <EmptyTitle>No teachers found</EmptyTitle>
            <EmptyDescription>
              No teacher on this year&rsquo;s roster matches that search. Clear
              the search, or add a teacher to this year.
            </EmptyDescription>
          </Empty>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onExportClick}
          disabled={isExportPending}
        >
          <IconFileExport data-icon="inline-start" />
          {isExportPending ? "Exporting..." : "Export as Excel"}
        </Button>
        <Button onClick={onCreateClick} size="sm">
          <IconPlus data-icon="inline-start" />
          Add Teacher
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-muted flex flex-wrap items-center justify-between gap-2 rounded-lg p-3">
          <span className="text-muted-foreground text-sm">
            {selectedIds.size} teacher{getPluralSuffix(selectedIds.size)}{" "}
            selected
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportSelectedClick([...selectedIds])}
              disabled={isExportPending}
            >
              Export Selected
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isBulkDeletePending}
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={isBulkDeletePending}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {renderRoster()}

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogTitle>Delete Selected Teachers</AlertDialogTitle>
          <AlertDialogDescription>
            Delete {selectedIds.size} selected teacher
            {getPluralSuffix(selectedIds.size)}? The server deletes only records
            without history or current assignments. Protected records remain and
            should be marked terminated instead.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeletePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSelectedDelete}
              disabled={isBulkDeletePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeletePending ? "Deleting..." : "Delete Selected"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
