import { QUALIFICATION_LEVELS } from "@school-student-teacher-management/db/constants/teachers";
import type { QualificationLevel } from "@school-student-teacher-management/db/constants/teachers";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  IconAlertTriangle,
  IconCheck,
  IconDotsVertical,
  IconMessage2,
  IconUserOff,
} from "@tabler/icons-react";
import { createColumnHelper } from "@tanstack/react-table";

import type { AttendancePageApi } from "@/components/staff/attendance/use-attendance-page";
import { CLASS_CATEGORIES } from "@/components/staff/class-assignment/class-categories";
import { DataTableColumnHeader } from "@/components/ui-patterns/data-table/data-table-column-header";
import type { ListTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";

import type { RegisterRow } from "./attendance-register-rows";

/** The human name of a credential. A missing one is said, not shown as a dash. */
export const qualificationLabel = (level: QualificationLevel | null): string =>
  level === null
    ? "No qualification on file"
    : QUALIFICATION_LEVELS[level].label;

/**
 * What one row can be marked as, right now.
 *
 * **Re-marking is a normal action, not an escape hatch.** `teacher_attendance` is
 * unique on (staff, year, date) and `markAttendance` upserts it, so overwriting a
 * mark is safe — and overwriting a *wrong* mark is the thing somebody has to be
 * able to do, because registers get read wrong. The menu therefore offers the same
 * statuses whatever the current mark is. What changes is the wording, so the item
 * says what the row *will become* rather than repeating what it already is.
 *
 * The leave lock is the one thing that disables the mark items, and it says why
 * in the same menu rather than greying two items out with no explanation.
 */
const RegisterRowActions = ({
  onRemark,
  page,
  row,
}: {
  onRemark: (row: RegisterRow) => void;
  page: AttendancePageApi;
  row: RegisterRow;
}) => {
  const isMarked = row.status !== "unmarked";
  const isAbsent = row.status === "absent" || row.status === "partial";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${row.name}`}
            size="icon-sm"
            variant="ghost"
          >
            <IconDotsVertical />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {/* A `DropdownMenuLabel` outside a `DropdownMenuGroup` throws
            "MenuGroupContext is missing" — the group is what gives the label a
            menu to sit in. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mark {row.name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuItem
          disabled={row.isLeaveLocked}
          onClick={() => {
            void page.saveTeacherDay(row.staffId, new Map());
          }}
        >
          <IconCheck />
          {isMarked ? "Mark present (re-marks)" : "Mark present"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={row.isLeaveLocked}
          onClick={() => {
            void page.toggleSchool(row.staffId);
          }}
        >
          <IconUserOff />
          {isAbsent ? "Clear the absence" : "Absent all day"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notes</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() => {
            onRemark(row);
          }}
        >
          <IconMessage2 />
          {row.remark === "" ? "Add a remark" : "Edit the remark"}
        </DropdownMenuItem>
        {row.isLeaveLocked ? (
          <>
            <DropdownMenuSeparator />
            <p className="text-muted-foreground flex items-start gap-2 px-2 py-1.5 text-xs">
              <IconAlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              {row.leaveLabel} is approved for this date, so the marks are
              locked.
            </p>
          </>
        ) : null}
        {isMarked ? (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">
            This day is already marked — marking again replaces it.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const columnHelper = createColumnHelper<ListTableFeatures, RegisterRow>();

/**
 * The register's columns.
 *
 * A factory taking its callbacks as arguments rather than reading them from
 * context: a constant would either capture the first render's callbacks for ever
 * or need a context to stay correct. The result is a plain object graph, so
 * rebuilding it when a callback changes costs nothing.
 */
export const buildRegisterColumns = ({
  onRemark,
  page,
}: {
  onRemark: (row: RegisterRow) => void;
  page: AttendancePageApi;
}) =>
  columnHelper.columns([
    columnHelper.accessor("name", {
      meta: { label: "Teacher" },
      header: ({ column }) => (
        <DataTableColumnHeader
          label={column.columnDef.meta?.label ?? column.id}
          onSort={(direction) => column.toggleSorting(direction === "desc")}
          sorted={column.getIsSorted()}
        />
      ),
      cell: ({ getValue, row }) => (
        <div className="min-w-48">
          <p className="font-medium">{getValue()}</p>
          <p className="text-muted-foreground truncate text-xs">
            {row.original.email ?? row.original.phone ?? "No contact on file"}
          </p>
        </div>
      ),
    }),

    /**
     * The grouping column, and the one that discloses the grouping rule.
     *
     * A teacher is filed under the **highest** credential they hold, and when they
     * hold more than one the cell lists the rest. Silently picking one of
     * somebody's credentials is the kind of decision that looks arbitrary and is;
     * a BEd teacher who also holds an NDT is told both, so the rule is visible
     * rather than something a reader has to infer from a sort order.
     */
    columnHelper.accessor("qualification", {
      meta: { label: "Qualification" },
      header: ({ column }) => (
        <DataTableColumnHeader
          label={column.columnDef.meta?.label ?? column.id}
          onSort={(direction) => column.toggleSorting(direction === "desc")}
          sorted={column.getIsSorted()}
        />
      ),
      cell: ({ getValue, row }) => {
        const alsoHeld = row.original.qualifications.filter(
          (level) => level !== getValue()
        );
        return (
          <div className="min-w-40">
            <p className="text-sm font-medium">
              {qualificationLabel(getValue())}
            </p>
            {alsoHeld.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                Also{" "}
                {alsoHeld.map((level) => qualificationLabel(level)).join(", ")}
              </p>
            ) : null}
          </div>
        );
      },
    }),

    columnHelper.accessor("gradeBand", {
      meta: { label: "Teaches" },
      header: "Teaches",
      cell: ({ getValue }) => {
        const category = CLASS_CATEGORIES.find(
          (candidate) => candidate.key === getValue()
        );
        return (
          <Badge variant="outline">
            {category?.label ?? "No classes assigned"}
          </Badge>
        );
      },
    }),

    /**
     * The day's mark, with the period detail beside it.
     *
     * `unmarked` is a real answer, not a fallback — the database holds no row for
     * this person on this date, which is a different fact from present. The
     * period list travels with the status because "Absent" alone does not say
     * *which* periods, and the row has only one line to say it in.
     */
    columnHelper.accessor("status", {
      meta: { label: "Status" },
      header: "Status",
      cell: ({ getValue, row }) => {
        const status = getValue();
        if (status === "unmarked") {
          return <Badge variant="outline">Not marked</Badge>;
        }
        if (status === "present") {
          return <Badge variant="secondary">Present</Badge>;
        }
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={status === "absent" ? "destructive" : "outline"}>
              {status === "absent" ? "Absent" : null}
              {status === "partial" ? "Part absent" : null}
              {status === "halfDay" ? "Half day" : null}
              {status === "lateShortLeave" ? "Late / short leave" : null}
            </Badge>
            {row.original.absentPeriods.length > 0 ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                P{row.original.absentPeriods.join(", P")}
              </span>
            ) : null}
            {row.original.leaveLabel ? (
              <span className="text-muted-foreground text-xs">
                {row.original.leaveLabel}
              </span>
            ) : null}
          </div>
        );
      },
    }),

    columnHelper.accessor("remark", {
      meta: { label: "Remark" },
      header: "Remark",
      cell: ({ getValue }) => {
        const remark = getValue();
        if (remark === "") {
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        return (
          <p className="max-w-64 text-sm">
            <IconMessage2
              aria-hidden="true"
              className="text-muted-foreground mr-1.5 inline size-3.5"
            />
            {remark}
          </p>
        );
      },
    }),

    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RegisterRowActions
          onRemark={onRemark}
          page={page}
          row={row.original}
        />
      ),
    }),
  ]);
