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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@school-student-teacher-management/ui/components/input-group";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
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
  IconUsers,
  IconX,
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

/** The columns' header band: deep green ground, amber caps. One definition. */
const COLUMN_HEADING =
  "text-accent h-11 text-xs font-extrabold tracking-[0.16em]";

const SKELETON_ROW_COUNT = 6;

/**
 * An avatar that can never be blank.
 *
 * `getInitials` maps each part of the name to its first character, which is
 * empty for a name that is a single space or a run of punctuation — a real
 * possibility on a staff record an office clerk typed quickly. The circle then
 * rendered nothing at all, which reads as a rendering fault rather than as "we
 * have nothing to show", so the dash is the honest fallback and it is the same
 * dash the rest of the table uses for a missing value.
 */
const getInitials = (name: string) => {
  const initials = name
    .replace(/^(?<prefix>Mr\.|Mrs\.|Ms\.|Dr\.)\s*/iu, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "—";
};

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
        className="group flex items-center gap-3 text-left"
        onClick={onViewClick}
      >
        <span
          aria-hidden="true"
          className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center text-xs font-bold"
        >
          {getInitials(teacher.name)}
        </span>
        <span className="min-w-0">
          {/*
            The name is the row's only click target, and the underline is
            permanent rather than hover-only. It was `hover:underline`, which is
            invisible until a mouse arrives: a keyboard user tabbing the roster
            had no way to tell the name from the service number beneath it.
          */}
          <span className="text-primary decoration-primary/40 group-hover:decoration-primary underline underline-offset-4">
            {teacher.name}
          </span>
          <span className="text-muted-foreground block text-xs font-normal tabular-nums">
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
      {teacher.appointmentDate ? (
        <span className="text-muted-foreground block text-xs tabular-nums">
          {teacher.appointmentDate}
        </span>
      ) : null}
    </TableCell>
    {/*
      The account column is the one that goes below `md`.

      Desktop is the design target and 1280px has room for it; below that the
      roster would scroll horizontally for a fact that is a cross-check on the
      other columns rather than one of them. The `<th>` carries the same
      `hidden md:table-cell` — a column whose header stays on screen while its
      cells disappear is a header pointing at nothing.
    */}
    <TableCell className="hidden md:table-cell">
      <div className="flex flex-col items-start gap-1">
        <Badge variant={teacher.linkedUser ? "default" : "outline"}>
          {teacher.linkedUser ? "Linked" : "No account"}
        </Badge>
        {teacher.linkedUser?.banned ? (
          <Badge variant="destructive">Banned</Badge>
        ) : null}
        {teacher.linkedUser && !teacher.linkedUser.emailVerified ? (
          <Badge variant="secondary">Unverified email</Badge>
        ) : null}
      </div>
    </TableCell>
    <TableCell>
      <div className="flex items-center justify-end gap-4 text-xs font-bold">
        {/*
          Both row verbs are persistent-underline links in `--primary`
          (13.2:1 on cream), not `text-foreground/70`.

          `text-foreground/70` composites the deep green at 70% over cream, which
          measures **4.30:1** — below the 4.5:1 AA threshold for 12px bold body
          text, and the only ink in the table that was not a token value. The
          two verbs are told apart by their label, not by two shades of one hue,
          so a colour difference was never carrying anything.
        */}
        <button
          type="button"
          className="text-primary decoration-primary/40 hover:decoration-primary underline underline-offset-4"
          onClick={onViewClick}
        >
          View
        </button>
        <button
          type="button"
          className="text-primary decoration-primary/40 hover:decoration-primary underline underline-offset-4"
          onClick={onEditClick}
        >
          Edit
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Actions for ${teacher.name}`}
              />
            }
          >
            <IconDotsVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              {/*
                The teacher's own name at the head of the menu, so a menu that
                outlives its row — on a scrolled roster, or one the reader has
                lost track of — still says what it is about.
              */}
              <DropdownMenuLabel className="truncate">
                {teacher.name}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={onManageTimetableClick}>
                <IconCalendarTime />
                Manage timetable
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

/**
 * The header band, shared by the roster and its placeholder.
 *
 * One definition rather than two copies, because the two drifting apart is how a
 * column ends up hidden on screen but not in the header, and how the loading
 * state ends up promising a table it does not have.
 */
const RosterHead = ({ selectAll }: { selectAll?: React.ReactNode }) => (
  <TableHeader>
    <TableRow className="bg-primary hover:bg-primary border-none">
      <TableHead scope="col" className="w-8">
        {selectAll}
      </TableHead>
      <TableHead scope="col" className={COLUMN_HEADING}>
        TEACHER
      </TableHead>
      <TableHead scope="col" className={COLUMN_HEADING}>
        CONTACT
      </TableHead>
      <TableHead scope="col" className={COLUMN_HEADING}>
        EMPLOYMENT
      </TableHead>
      <TableHead
        scope="col"
        className={`${COLUMN_HEADING} hidden md:table-cell`}
      >
        ACCOUNT
      </TableHead>
      <TableHead scope="col" className="w-40">
        <span className="sr-only">Actions</span>
      </TableHead>
    </TableRow>
  </TableHeader>
);

/**
 * The roster while it is being read.
 *
 * **A real table, not a stack of bars.** The loading state used to be five
 * identical `h-12` skeletons in a plain column, and it replaced the whole region
 * — toolbar, search and table all — so the page visibly collapsed and
 * re-expanded under the reader. Now the header band, the column widths and the
 * row rhythm are the real ones and only the cells are placeholders, so the data
 * lands into space that was already reserved. The toolbar is outside this branch
 * entirely, which is the other half of that fix.
 *
 * The bars are `aria-hidden` and the region is not, so a screen reader is told
 * the region is in flux and is given a sentence to be busy *about*; see
 * `InventorySkeleton` for the same argument at length.
 */
const RosterSkeleton = () => (
  <div className="border-primary/14 border" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading the teacher roster…</span>
    <Table>
      <TableCaption className="sr-only">Teacher roster, loading</TableCaption>
      <RosterHead
        selectAll={
          <Skeleton
            aria-hidden="true"
            className="bg-primary-foreground/30 size-4"
          />
        }
      />
      <TableBody aria-hidden="true">
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
          <TableRow key={`teacher-skeleton-${index}`}>
            <TableCell>
              <Skeleton className="size-4" />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 shrink-0" />
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-44" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-2.5 w-28" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-4">
                <Skeleton className="h-2.5 w-8" />
                <Skeleton className="h-2.5 w-8" />
                <Skeleton className="size-4" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const RosterTable = ({
  rows,
  caption,
  selectAll,
  renderRow,
}: {
  rows: StaffListItem[];
  caption: string;
  selectAll: React.ReactNode;
  renderRow: (teacher: StaffListItem) => React.ReactNode;
}) => (
  <div className="border-primary/14 border">
    <Table>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <RosterHead selectAll={selectAll} />
      <TableBody>{rows.map(renderRow)}</TableBody>
    </Table>
  </div>
);

/**
 * The search box and the two page actions, in one row.
 *
 * This used to live inside the "the roster has rows" branch of the list, below
 * the table, in a strip of its own. Two things were wrong with that and both are
 * about reflow: the page's primary controls disappeared while the list was
 * loading and came back with the data, and the search sat somewhere a reader
 * finishing a task on the table had to look downwards to find. It is a toolbar
 * now, above the table, in the position the rest of the app puts its filters.
 */
const RosterToolbar = ({
  searchQuery,
  onSearchChange,
  isSearchEnabled,
  onExportClick,
  onCreateClick,
  isExportPending,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** Off until a roster has actually arrived, so a search cannot filter nothing. */
  isSearchEnabled: boolean;
  onExportClick: () => void;
  onCreateClick: () => void;
  isExportPending: boolean;
}) => (
  <div className="flex flex-wrap items-end justify-between gap-2">
    <Field className="min-w-[18rem] flex-1">
      <FieldLabel htmlFor="teacher-search">Search the roster</FieldLabel>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <IconSearch
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
        </InputGroupAddon>
        <InputGroupInput
          id="teacher-search"
          type="search"
          autoComplete="off"
          placeholder="Name, email, phone, NIC or service number"
          value={searchQuery}
          disabled={!isSearchEnabled}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {searchQuery ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              onClick={() => onSearchChange("")}
              aria-label="Clear the roster search"
            >
              <IconX />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </Field>

    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onExportClick}
        disabled={isExportPending}
        className="min-w-36"
      >
        <IconFileExport data-icon="inline-start" />
        {isExportPending ? "Exporting…" : "Export as Excel"}
      </Button>
      <Button onClick={onCreateClick} size="sm">
        <IconPlus data-icon="inline-start" />
        Add teacher
      </Button>
    </div>
  </div>
);

/**
 * The selection bar, and the count in it.
 *
 * `<output>` rather than `<p role="status">`: the rule reads as a live region
 * either way, but `output` is the element that means it, so the semantics do not
 * depend on a role attribute somebody can delete.
 */
const BulkActionsBar = ({
  selectedCount,
  onExportSelected,
  onDeleteSelected,
  onClear,
  isExportPending,
  isBulkDeleting,
}: {
  selectedCount: number;
  onExportSelected: () => void;
  onDeleteSelected: () => void;
  onClear: () => void;
  isExportPending: boolean;
  isBulkDeleting: boolean;
}) => (
  <div className="bg-muted flex flex-wrap items-center justify-between gap-2 rounded-lg p-3">
    <span className="text-muted-foreground text-sm">
      <output>
        {selectedCount} teacher{getPluralSuffix(selectedCount)} selected
      </output>
    </span>
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onExportSelected}
        disabled={isExportPending}
      >
        Export selected
      </Button>
      {/*
        "Delete selected", not "Delete". A destructive verb with no object in a
        bar that also holds a harmless "Clear" is how a clerk deletes a roster
        they meant to export.
      */}
      <Button
        variant="destructive"
        size="sm"
        onClick={onDeleteSelected}
        disabled={isBulkDeleting}
      >
        Delete selected
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={isBulkDeleting}
      >
        Clear
      </Button>
    </div>
  </div>
);

const BulkDeleteDialog = ({
  isOpen,
  onOpenChange,
  selectedCount,
  error,
  onConfirm,
  isPending,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  error: string | null;
  onConfirm: () => void;
  isPending: boolean;
}) => (
  <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
    <AlertDialogContent className="sm:max-w-md">
      <AlertDialogTitle>Delete selected teachers</AlertDialogTitle>
      <AlertDialogDescription>
        Delete {selectedCount} selected teacher{getPluralSuffix(selectedCount)}?
        The server deletes only records without history or current assignments.
        Protected records remain and should be marked terminated instead.
      </AlertDialogDescription>
      {error ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive border px-3 py-2 text-xs"
        >
          {error}
        </p>
      ) : null}
      <AlertDialogFooter>
        {/*
          Cancel is disabled while the batch runs: closing the dialog mid-flight
          would unmount the control that started it, and the selection behind it
          would go with it.
        */}
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isPending ? "Deleting…" : "Delete selected"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * The roster, in whichever state it is actually in.
 *
 * Four states here are claims about the College, and they are told apart before
 * any of them is drawn:
 *
 * - **Failed**: answered first and in the server's own words.
 * - **Unresolved** (`teachers === undefined`): the request has not answered.
 *   `listStaff` is `enabled` only once the academic year has resolved, so for a
 *   moment after a year switch — and for a year that never arrives — `data` is
 *   `undefined` while `isLoading` is `false`. That window used to fall through
 *   to "No teachers yet", a sentence about the whole school printed by a request
 *   that had learned nothing. It draws the loading shape, which is what it is.
 * - **Genuinely empty** (`[]`): a request that succeeded and found nobody. Only
 *   here is "No teachers yet" true, and only here is the create button offered.
 * - **No results for this search**: a different sentence with a different
 *   recovery, because the roster is not empty and the fix is to widen the search
 *   rather than to add a teacher.
 */
const RosterRegion = ({
  teachers,
  filteredTeachers,
  searchQuery,
  isUnresolved,
  isError,
  errorMessage,
  onRetry,
  onCreateClick,
  onClearSearch,
  renderRow,
  selectAllCheckbox,
}: {
  teachers: StaffListItem[] | undefined;
  filteredTeachers: StaffListItem[];
  searchQuery: string;
  isUnresolved: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
  onCreateClick: () => void;
  onClearSearch: () => void;
  renderRow: (teacher: StaffListItem) => React.ReactNode;
  selectAllCheckbox: React.ReactNode;
}) => {
  if (isError) {
    return (
      <QueryErrorPanel
        message={errorMessage}
        onRetry={onRetry}
        title="The teacher roster could not be loaded"
      />
    );
  }

  if (isUnresolved) {
    return <RosterSkeleton />;
  }

  const hasRoster = Boolean(teachers?.length);

  if (!hasRoster) {
    return (
      <Empty className="border-primary/22 min-h-[50vh] border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconUsers aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="font-heading text-2xl">
            No teachers yet
          </EmptyTitle>
          <EmptyDescription>
            This year&rsquo;s roster is empty. Create the first teacher record
            to get started.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onCreateClick}>
            <IconPlus data-icon="inline-start" />
            Add teacher
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (filteredTeachers.length === 0) {
    return (
      <Empty className="border-primary/14 min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconSearch aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No teacher matches that search</EmptyTitle>
          <EmptyDescription>
            This year&rsquo;s roster is not empty — none of its{" "}
            {teachers?.length}
            record{getPluralSuffix(teachers?.length ?? 0)} matches &ldquo;
            {searchQuery.trim()}&rdquo;. Clear the search to see the whole
            roster.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onClearSearch}>
            <IconX data-icon="inline-start" />
            Clear search
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <RosterTable
      rows={filteredTeachers}
      caption={
        searchQuery.trim()
          ? `Teacher roster for this year, narrowed to ${filteredTeachers.length} of ${teachers?.length} records by the search for “${searchQuery.trim()}”`
          : `Teacher roster for this year, ${filteredTeachers.length} records`
      }
      selectAll={selectAllCheckbox}
      renderRow={renderRow}
    />
  );
};

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
  /**
   * The bulk delete's own in-flight flag, alongside the `isBulkDeletePending`
   * prop rather than instead of it.
   *
   * The prop is one shared `deleteMutation`'s `isPending`, and the bulk action
   * fires that mutation once per id through `Promise.allSettled` — so it
   * describes whichever call happened to be in flight last, not whether the
   * batch is running. On a fast LAN the whole batch can be in its second await
   * while the prop has already gone false, and a second click on "Delete
   * selected" re-fires deletes for rows that are already gone. The local flag is
   * set once for the batch and cleared once when every promise has settled; the
   * prop still contributes, so a single delete elsewhere in the app disables
   * this too.
   */
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  const filteredTeachers = useMemo(() => {
    if (!teachers) {
      return [];
    }
    if (!searchQuery.trim()) {
      return teachers;
    }

    const query = searchQuery.trim().toLowerCase();
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

  /**
   * Bulk delete, and what the dialog does about a partial success.
   *
   * The dialog stays open unless at least one record was actually deleted: the
   * server protects a teacher who has history or a live assignment, so a batch
   * can partly fail by design, and a dialog that closed on the failure would take
   * the selection with it and tell the reader nothing about which rows survived.
   * The error line inside the dialog is the recovery path — the reader can retry
   * the remainder with the selection intact.
   */
  const handleConfirmSelectedDelete = async () => {
    if (isBulkDeleting) {
      return;
    }

    setIsBulkDeleting(true);
    setBulkDeleteError(null);

    try {
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
        return;
      }
      setBulkDeleteError(
        "The server refused every record in this selection. A teacher with history or a current assignment is protected — mark them terminated instead."
      );
    } catch (error) {
      setBulkDeleteError(
        error instanceof Error
          ? error.message
          : "The bulk delete could not be completed. Try again."
      );
    }

    setIsBulkDeleting(false);
  };

  const isUnresolved = isLoading || teachers === undefined;
  const hasRoster = Boolean(teachers?.length);
  const isFiltering = searchQuery.trim().length > 0;
  const isBulkBusy = isBulkDeleting || isBulkDeletePending;

  return (
    <div className="flex flex-col gap-4">
      <RosterToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isSearchEnabled={hasRoster}
        onExportClick={onExportClick}
        onCreateClick={onCreateClick}
        isExportPending={isExportPending}
      />

      {/*
        The count line, and the only thing on the page that speaks as the search
        changes. It is visible text rather than a `title`, because a reader who
        cannot see the row count is the reader who cannot tell "your search
        narrowed the roster to two" from "the roster is two" — and `output` is
        the element that means a live region.
      */}
      {hasRoster && !isUnresolved ? (
        <output className="text-muted-foreground block text-xs">
          Showing {filteredTeachers.length} of {teachers?.length} teacher
          {getPluralSuffix(teachers?.length ?? 0)}
          {isFiltering ? ` matching “${searchQuery.trim()}”` : ""}
        </output>
      ) : null}

      {selectedIds.size > 0 ? (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onExportSelected={() => onExportSelectedClick([...selectedIds])}
          onDeleteSelected={() => {
            setBulkDeleteError(null);
            setIsDeleteDialogOpen(true);
          }}
          onClear={() => setSelectedIds(new Set())}
          isExportPending={isExportPending}
          isBulkDeleting={isBulkBusy}
        />
      ) : null}

      <RosterRegion
        teachers={teachers}
        filteredTeachers={filteredTeachers}
        searchQuery={searchQuery}
        isUnresolved={isUnresolved}
        isError={isError}
        errorMessage={errorMessage}
        onRetry={onRetry}
        onCreateClick={onCreateClick}
        onClearSearch={() => setSearchQuery("")}
        selectAllCheckbox={
          <Checkbox
            checked={
              filteredTeachers.length > 0 &&
              selectedFilteredCount === filteredTeachers.length
            }
            onCheckedChange={(checked) => handleSelectAll(checked === true)}
            aria-label="Select visible teachers"
          />
        }
        renderRow={(teacher) => (
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
        )}
      />

      <BulkDeleteDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        selectedCount={selectedIds.size}
        error={bulkDeleteError}
        onConfirm={handleConfirmSelectedDelete}
        isPending={isBulkBusy}
      />
    </div>
  );
};
