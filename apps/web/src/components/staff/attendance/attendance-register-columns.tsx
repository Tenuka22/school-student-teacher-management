import { QUALIFICATION_LEVELS } from "@school-student-teacher-management/db/constants/teachers";
import type { QualificationLevel } from "@school-student-teacher-management/db/constants/teachers";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
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
import { cn } from "cn";

import type { AttendancePageApi } from "@/components/staff/attendance/use-attendance-page";
import { DataTableColumnHeader } from "@/components/ui-patterns/data-table/data-table-column-header";
import type { ListTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";
import { sortColumn } from "@/components/ui-patterns/data-table/sort-column";

import type { RegisterRow } from "./attendance-register-rows";
import { describePeriodRecord } from "./period-record";

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

/**
 * The eight periods of the day, as one strip.
 *
 * ## Why this exists
 *
 * The cell used to print `P1, P2, …` **only when there were absences**, so a
 * teacher marked present for the day showed nothing at all about the periods —
 * which reads as *no period information* rather than as *all eight present*, and
 * those are opposite answers. A whole-day absence made it worse: every period
 * ticked means the chip printed `P1, P2, P3, P4, P5, P6, P7, P8`, eight numbers
 * saying "every one", which is what the `Absent` badge beside it already said.
 *
 * The data was always this way. `teacher_attendance` carries the day and
 * `teacher_period_absence` carries only the periods **missed**, so "present" is
 * stored as the absence of absences: the day-level **Present** button writes zero
 * missed periods and the **Absent** button writes all eight
 * (`performToggleSchool`), which is exactly the rule the periods dialog states in
 * its own description. What was missing was the sentence, and a way in.
 *
 * ## It says the same words as the dialog, and the boxes mean the same thing
 *
 * The sentence comes from `describePeriodRecord` in `period-record.ts` — the
 * dialog's own function, imported — and the dialog's checkboxes were inverted to
 * match this strip (a tick means **present**). They first disagreed: the strip
 * said "All 8 periods present" for a teacher whose dialog opened with eight empty
 * boxes, and a reader who went to check the strip could not tell whether
 * "present" or "nothing recorded" was the truth. One function and one meaning for
 * a tick is the whole fix.
 *
 * ## The boxes are decoration; the sentence is the fact
 *
 * Eight small numbered boxes is a *visual* encoding: the numbers are positions,
 * not words, and a screen reader announcing "one two three four five six seven
 * eight" after the badge has already said "Present" is noise. So the boxes are
 * `aria-hidden` and carry the detail in a `title`, and the sentence printed
 * beside them is both what a sighted reader reads and what is announced. There is
 * deliberately no `role="img"` wrapper: the sentence is real text, so the element
 * holding it needs no role to be read correctly.
 */

/**
 * One period's box, and its tooltip — two small functions rather than nested
 * ternaries, because "not recorded / missed / present" is a three-way fact and a
 * nested conditional hides the third case behind the first.
 */
const periodBoxClass = (unrecorded: boolean, isMissed: boolean): string => {
  if (unrecorded) {
    return "text-muted-foreground/50 border border-dashed";
  }

  if (isMissed) {
    return "bg-destructive text-destructive-foreground";
  }

  return "bg-primary/10 text-primary";
};

const periodTitle = (
  period: (typeof CODE_DEFINED_PERIODS)[number],
  unrecorded: boolean,
  isMissed: boolean
): string => {
  if (unrecorded) {
    return `Period ${period.periodNumber}, ${period.startTime}–${period.endTime}: not recorded`;
  }

  if (isMissed) {
    return `Period ${period.periodNumber}, ${period.startTime}–${period.endTime}: missed`;
  }

  return `Period ${period.periodNumber}, ${period.startTime}–${period.endTime}: present`;
};

const PeriodStrip = ({
  absentPeriods,
  status,
}: {
  absentPeriods: number[];
  status: RegisterRow["status"];
}) => {
  const missed = new Set(absentPeriods);
  const summary = describePeriodRecord(absentPeriods, status !== "unmarked");
  const unrecorded = status === "unmarked";

  return (
    <div className="flex items-center gap-2">
      {CODE_DEFINED_PERIODS.map((period) => {
        const isMissed = missed.has(period.periodNumber);

        return (
          <span
            // Decorative: the sentence beside these boxes is the whole fact, and
            // eight numbers announced one after another after a badge that
            // already said "Present" is noise rather than information.
            aria-hidden="true"
            className={cn(
              "grid size-5 place-items-center text-[0.625rem] font-medium tabular-nums",
              periodBoxClass(unrecorded, isMissed)
            )}
            key={period.periodNumber}
            title={periodTitle(period, unrecorded, isMissed)}
          >
            {period.periodNumber}
          </span>
        );
      })}
      <span className="text-muted-foreground text-xs">{summary}</span>
    </div>
  );
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
       * for does not help when the row above looks identical.
       *
       * It is printed bare, and it used to fall back to "No NIC on file" — a
       * sentence that existed because the column was nullable. It is `NOT NULL`
       * now, and the type here is `string` rather than `string | null`, so the
       * fallback could never fire; a `??` in this cell would be a lie told about a
       * state the database refuses to hold. (The contact line below still has a
       * real absence to report, which is why its fallback stays.)
       */
      cell: ({ getValue, row }) => (
        <div className="min-w-56">
          <p className="font-medium">{getValue()}</p>
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            {row.original.nic}
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
                      aria-label={`Mark ${record.name} present for all ${CODE_DEFINED_PERIODS.length} periods`}
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
                      aria-label={`Mark ${record.name} absent for the day — all ${CODE_DEFINED_PERIODS.length} periods`}
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

                {/* The period control is the one entry that stays in view for a
                    marked day, and that is the correction this row needed. It used
                    to live only in the kebab, so the answer to "which periods?" was
                    two clicks away and, once a day was marked, the cell printed
                    nothing about the periods at all — a present day and a day with no
                    period record looked identical. The three day-level buttons move
                    into the kebab once the day is marked because the badge already
                    answers "what is this day?"; the period strip below answers "which
                    periods?", and that question is still open on a marked day. */}
                <Button
                  aria-label={`Pick the periods missed by ${record.name}`}
                  disabled={locked}
                  onClick={() => {
                    onPeriods(record);
                  }}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  <IconListCheck data-icon="inline-start" />
                  Periods
                </Button>

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

            {/*
              The strip sits under the controls rather than beside the badge,
              because it is the widest thing in the cell and the badge line is
              where the three day-level buttons live — putting eight boxes in that
              line would push the buttons off the row on a narrow screen and undo
              the "identity on the left, act on the right" arrangement this file's
              own comment describes.
            */}
            <PeriodStrip
              absentPeriods={record.absentPeriods}
              status={record.status}
            />
          </div>
        );
      },
    }),
  ]);
};
