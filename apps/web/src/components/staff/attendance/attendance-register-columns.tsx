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
  IconClock,
  IconDotsVertical,
  IconListCheck,
  IconMessage2,
  IconUserOff,
} from "@tabler/icons-react";
import { createColumnHelper } from "@tanstack/react-table";

import type { AttendancePageApi } from "@/components/staff/attendance/use-attendance-page";
import { DataTableColumnHeader } from "@/components/ui-patterns/data-table/data-table-column-header";
import type { ListTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";
import { sortColumn } from "@/components/ui-patterns/data-table/sort-column";

import type { RegisterRow } from "./attendance-register-rows";

/** The human name of a credential. A missing one is said, not shown as a dash. */
export const qualificationLabel = (level: QualificationLevel | null): string =>
  level === null
    ? "No qualification on file"
    : QUALIFICATION_LEVELS[level].label;

/**
 * The callbacks a row's mark cell can raise, kept beside the columns that use
 * them rather than spread over three prop bags.
 *
 * They open a dialog; they do not write. A cell that writes has to know which
 * dialog to re-open when the server refuses, and there is nowhere on a row to
 * show that, so the dialog stays open and the table owns that state.
 */
export interface RegisterMarkHandlers {
  onArrival: (row: RegisterRow) => void;
  onPeriods: (row: RegisterRow) => void;
  onRemark: (row: RegisterRow) => void;
}

/**
 * What the day currently reads as, and whether that is a recorded absence.
 *
 * `unmarked` and `present` are different answers and are kept different: the
 * first says the database holds no row for this person on this date, which is a
 * fact about *nobody having said*, not a fact about them being here.
 */
const isAbsentStatus = (status: RegisterRow["status"]): boolean =>
  status === "absent" || status === "partial" || status === "halfDay";

const StatusBadge = ({ status }: { status: RegisterRow["status"] }) => {
  if (status === "unmarked") {
    return <Badge variant="outline">Not marked</Badge>;
  }
  if (status === "present") {
    return <Badge variant="secondary">Present</Badge>;
  }
  if (status === "absent") {
    return <Badge variant="destructive">Absent</Badge>;
  }
  if (status === "partial") {
    return <Badge variant="outline">Part absent</Badge>;
  }
  if (status === "halfDay") {
    return <Badge variant="outline">Half day</Badge>;
  }
  return <Badge variant="outline">Late / short leave</Badge>;
};

const columnHelper = createColumnHelper<ListTableFeatures, RegisterRow>();

/**
 * The register's columns: who this is, and how to mark them.
 *
 * ## Why there is one mark column and not four
 *
 * This used to carry Qualification, Teaches, Status and Remark as four separate
 * columns, which meant the thing the register is *for* — deciding whether this
 * person is here — sat at the far right of a row whose left half was describing
 * them. Every one of those columns is still reachable and none is lost:
 * qualification is the **group header** the row is filed under and the filter,
 * Teaches is the filter, Status and Remark are in the mark cell beside the
 * buttons they belong next to. A reader now scans identity on the left and acts
 * on the right of the same row, instead of scanning identity, then three columns
 * of description, then finding the action.
 *
 * ## Re-marking is a normal action, not an escape hatch
 *
 * `teacher_attendance` is unique on (staff, year, date) and `markAttendance`
 * upserts it, so overwriting a mark is safe — and overwriting a *wrong* mark is
 * the thing somebody has to be able to do, because registers get read wrong. The
 * two buttons therefore say what the row *will become* rather than repeating
 * what it already is.
 *
 * The leave lock is the one thing that disables them, and it says why in the
 * menu rather than greying the buttons out with no explanation.
 */
export const buildRegisterColumns = (
  handlers: RegisterMarkHandlers & {
    page: AttendancePageApi;
  }
) => {
  const { onArrival, onPeriods, onRemark, page } = handlers;

  return columnHelper.columns([
    columnHelper.accessor("name", {
      meta: { label: "Teacher" },
      header: ({ column }) => (
        <DataTableColumnHeader
          label={column.columnDef.meta?.label ?? column.id}
          onSort={(direction) => sortColumn(column, direction)}
          sorted={column.getIsSorted()}
        />
      ),
      /**
       * Name, then the NIC, then a contact.
       *
       * **The NIC sits under the name because it is what separates two people.**
       * `staff.nic` is unique in the database; an email can be a personal address
       * two teachers sign up with, and a name can repeat outright. It is shown and
       * not hidden behind a tooltip, because an identifier you have to go looking
       * for does not help when the row above looks identical. A teacher with no NIC
       * says so in the same place rather than leaving a gap — a blank would read as
       * "no identifier needed", which is the opposite of what it means.
       */
      cell: ({ getValue, row }) => (
        <div className="min-w-56">
          <p className="font-medium">{getValue()}</p>
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            {row.original.nic ?? "No NIC on file"}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {row.original.email ?? row.original.phone ?? "No contact on file"}
          </p>
        </div>
      ),
    }),

    /**
     * The mark: what the day reads as, the note on it, and the controls.
     *
     * The absent periods travel with the status because "Absent" alone does not
     * say *which* periods, and this cell is the only place they are shown now
     * that the matrix is gone. The remark only takes a line when there is one —
     * a note is worth seeing where the mark is made, and it is not worth a column
     * of mostly empty rows to get there.
     */
    columnHelper.display({
      id: "mark",
      meta: { label: "Mark" },
      header: "Mark",
      cell: ({ row }) => {
        const record = row.original;
        const absent = isAbsentStatus(record.status);
        const present = record.status === "present";
        const locked = record.isLeaveLocked;
        const unmarked = record.status === "unmarked";

        return (
          <div className="min-w-96 space-y-1.5 py-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge status={record.status} />
              {record.absentPeriods.length > 0 ? (
                <span className="text-muted-foreground text-xs tabular-nums">
                  P{record.absentPeriods.join(", P")}
                </span>
              ) : null}
              {record.leaveLabel ? (
                <span className="text-muted-foreground text-xs">
                  {record.leaveLabel}
                </span>
              ) : null}

              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {/* Nobody has said anything about this day yet: the three ways
                    to say it are the row's whole reason for existing, so they
                    stay in view. Once a day is marked, repeating the same three
                    buttons next to the badge that already answers the question
                    is noise — the kebab below takes over as the one place to
                    change a mark, exactly the way "undo" replaces a toolbar
                    button once the action it undoes has happened. */}
                {unmarked ? (
                  <>
                    <Button
                      aria-label={`Mark ${record.name} present`}
                      disabled={locked}
                      onClick={() => {
                        // The reason goes with the status: `markAttendance` nulls
                        // the column on a write that omits it, so a re-mark would
                        // silently drop the note this row is carrying.
                        void page.saveTeacherDay(
                          record.staffId,
                          new Map(),
                          page.dayReason(record.staffId)
                        );
                      }}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      <IconCheck data-icon="inline-start" />
                      Present
                    </Button>
                    <Button
                      aria-label={`Mark ${record.name} absent for the day`}
                      disabled={locked}
                      onClick={() => {
                        void page.toggleSchool(record.staffId);
                      }}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      <IconUserOff data-icon="inline-start" />
                      Absent
                    </Button>
                    {/* Arrival is a quick button, not buried in the kebab: it is
                      the one action that can turn a day into a half day or a
                      short leave (see `use-attendance-page.ts`'s cut-off and
                      period-range rules), and that outcome deserves to be one
                      click away, not two. */}
                    <Button
                      aria-label={`Record ${record.name}'s arrival time`}
                      disabled={locked}
                      onClick={() => {
                        onArrival(record);
                      }}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      <IconClock data-icon="inline-start" />
                      Arrival
                    </Button>
                  </>
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        aria-label={`More ways to mark ${record.name}`}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <IconDotsVertical />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="start">
                    {/* A `DropdownMenuLabel` outside a `DropdownMenuGroup` throws
                      "MenuGroupContext is missing" — the group is what gives the
                      label a menu to sit in. */}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{record.name}</DropdownMenuLabel>
                    </DropdownMenuGroup>
                    {unmarked ? null : (
                      <>
                        <DropdownMenuItem
                          disabled={locked}
                          onClick={() => {
                            void page.saveTeacherDay(
                              record.staffId,
                              new Map(),
                              page.dayReason(record.staffId)
                            );
                          }}
                        >
                          <IconCheck />
                          {present ? "Already present" : "Mark present"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={locked}
                          onClick={() => {
                            void page.toggleSchool(record.staffId);
                          }}
                        >
                          <IconUserOff />
                          {absent ? "Clear the absence" : "Mark absent"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={locked}
                          onClick={() => {
                            onArrival(record);
                          }}
                        >
                          <IconClock />
                          Record arrival…
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      disabled={locked}
                      onClick={() => {
                        onPeriods(record);
                      }}
                    >
                      <IconListCheck />
                      Pick the periods…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        onRemark(record);
                      }}
                    >
                      <IconMessage2 />
                      {record.remark === ""
                        ? "Add a remark"
                        : "Edit the remark"}
                    </DropdownMenuItem>
                    {locked ? (
                      <>
                        <DropdownMenuSeparator />
                        <p className="text-muted-foreground flex items-start gap-2 px-2 py-1.5 text-xs">
                          <IconAlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 size-3.5 shrink-0"
                          />
                          {record.leaveLabel} is approved for this date, so the
                          marks are locked.
                        </p>
                      </>
                    ) : null}
                    {record.status === "unmarked" ? null : (
                      <p className="text-muted-foreground px-2 py-1.5 text-xs">
                        This day is already marked — marking again replaces it.
                      </p>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {record.remark === "" ? null : (
              <p className="text-muted-foreground max-w-96 text-xs">
                <IconMessage2
                  aria-hidden="true"
                  className="mr-1 inline size-3.5"
                />
                {record.remark}
              </p>
            )}
          </div>
        );
      },
    }),
  ]);
};
