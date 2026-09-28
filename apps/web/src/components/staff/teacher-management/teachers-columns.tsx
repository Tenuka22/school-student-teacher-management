import { EMPLOYMENT_STATUSES } from "@school-student-teacher-management/db/constants/teachers";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  IconCalendarTime,
  IconDotsVertical,
  IconTrash,
} from "@tabler/icons-react";
import { createColumnHelper } from "@tanstack/react-table";

import { DataTableColumnHeader } from "@/components/ui-patterns/data-table/data-table-column-header";
import type { ListTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";

import type { TeacherRow } from "./teachers-search";

/**
 * The teachers register's columns.
 *
 * The same five columns the register has always had, in the same order, with the
 * same cells — what changed is where the order and the page come from, not what a
 * reader sees. That is deliberate: a migration that also redesigned the table
 * would make it impossible to tell whether the new plumbing is correct.
 *
 * Two columns are **not sortable** and say so in their own definitions:
 * `phone`, because a phone number has no meaningful order in a register read by
 * name, and the action menu, which is not data. Both are plain header labels
 * rather than a button that does nothing.
 */
const columnHelper = createColumnHelper<ListTableFeatures, TeacherRow>();

const getInitials = (name: string) =>
  name
    .replace(/^(?<prefix>Mr\.|Mrs\.|Ms\.|Dr\.)\s*/iu, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/**
 * The employment status as a word, and the badge that says it.
 *
 * A record with no status is shown as "Unknown" rather than as a dash: `employmentStatus`
 * is nullable, and a dash in a status column is a value that could be mistaken for
 * a status nobody has heard of.
 */
const getStatusBadge = (status: string | null) => {
  switch (status) {
    case "active": {
      return <Badge variant="success">Active</Badge>;
    }

    case "onLeave": {
      return <Badge variant="secondary">On leave</Badge>;
    }

    case "suspended":
    case "terminated": {
      return (
        <Badge variant="destructive">
          {EMPLOYMENT_STATUSES[status as "suspended" | "terminated"]?.label ??
            status}
        </Badge>
      );
    }

    case "retired": {
      return <Badge variant="secondary">Retired</Badge>;
    }

    default: {
      return <Badge variant="outline">Unknown</Badge>;
    }
  }
};

export interface TeacherColumnOptions {
  onViewClick: (teacher: TeacherRow) => void;
  onEditClick: (teacher: TeacherRow) => void;
  onDeleteClick: (teacher: TeacherRow) => void;
  onManageTimetableClick: (teacher: TeacherRow) => void;
}

/**
 * A function rather than a module constant, because every cell closes over a
 * callback: a constant would either capture the first render's callbacks for ever or
 * need a React context to stay correct. The result is a plain object graph, so
 * rebuilding it when a callback changes costs nothing.
 */
export const buildTeacherColumns = ({
  onViewClick,
  onEditClick,
  onDeleteClick,
  onManageTimetableClick,
}: TeacherColumnOptions) =>
  columnHelper.columns([
    columnHelper.accessor("name", {
      meta: { label: "Name" },
      header: ({ column }) => (
        <DataTableColumnHeader
          label={column.columnDef.meta?.label ?? column.id}
          onSort={(direction) => column.toggleSorting(direction === "desc")}
          sorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => {
        const teacher = row.original;

        return (
          <button
            type="button"
            className="focus-visible:ring-ring flex min-w-0 items-center gap-3 text-left focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => onViewClick(teacher)}
          >
            <span
              aria-hidden="true"
              className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center text-xs font-semibold"
            >
              {getInitials(teacher.name)}
            </span>
            <span className="min-w-0">
              <span className="block max-w-[32ch] truncate font-semibold">
                {teacher.name}
              </span>
              {/* Below md the Email column is hidden; show it here instead. */}
              <span className="text-muted-foreground type-caption block max-w-[32ch] truncate font-normal md:hidden">
                {teacher.email}
              </span>
            </span>
          </button>
        );
      },
    }),

    columnHelper.accessor("email", {
      meta: { label: "Email" },
      header: ({ column }) => (
        <DataTableColumnHeader
          label={column.columnDef.meta?.label ?? column.id}
          onSort={(direction) => column.toggleSorting(direction === "desc")}
          sorted={column.getIsSorted()}
        />
      ),
      cell: ({ getValue }) => (
        <span className="text-foreground/80 hidden md:table-cell">
          {getValue()}
        </span>
      ),
    }),

    columnHelper.accessor("phone", {
      meta: { label: "Phone" },
      // A label, not a sort control: see the note at the top of this file.
      enableSorting: false,
      cell: ({ getValue }) => (
        <span className="hidden sm:table-cell">{getValue()}</span>
      ),
    }),

    columnHelper.accessor("employmentStatus", {
      meta: { label: "Status" },
      header: ({ column }) => (
        <DataTableColumnHeader
          label={column.columnDef.meta?.label ?? column.id}
          onSort={(direction) => column.toggleSorting(direction === "desc")}
          sorted={column.getIsSorted()}
        />
      ),
      cell: ({ getValue }) => getStatusBadge(getValue()),
    }),

    columnHelper.display({
      id: "actions",
      meta: { label: "Actions" },
      cell: ({ row }) => {
        const teacher = row.original;

        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground decoration-accent hover:underline"
              onClick={() => onViewClick(teacher)}
            >
              View
              <span className="sr-only"> {teacher.name}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onEditClick(teacher)}
            >
              Edit
              <span className="sr-only"> {teacher.name}</span>
            </Button>
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
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => onManageTimetableClick(teacher)}
                  >
                    <IconCalendarTime aria-hidden="true" />
                    Manage timetable
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeleteClick(teacher)}
                  >
                    <IconTrash aria-hidden="true" />
                    Delete teacher
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableSorting: false,
    }),
  ]);
