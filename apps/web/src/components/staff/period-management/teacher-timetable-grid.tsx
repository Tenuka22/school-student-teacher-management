/*
 * `<section>` is used for the scrollable grid rather than `role="region"`, and
 * the one suppression below is for the `tabIndex` that makes a scroll container
 * reachable: a region that scrolls but cannot be focused cannot be scrolled with
 * the keyboard, which WCAG 2.1.1 requires.
 */
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable so it can be scrolled from the keyboard */
"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Card } from "@school-student-teacher-management/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
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
  IconAlertTriangle,
  IconDotsVertical,
  IconPlus,
  IconRepeat,
} from "@tabler/icons-react";
import { useCallback, useMemo } from "react";

import { useSlotNavigation } from "@/components/staff/period-management/timetable-grid";
import type {
  SlotNavigation,
  SlotPosition,
} from "@/components/staff/period-management/timetable-grid";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

const PERIOD_TIMES = new Map<number, string>(
  CODE_DEFINED_PERIODS.map((period) => [
    period.periodNumber,
    `${period.startTime}–${period.endTime}`,
  ])
);

interface TeacherTimetableEntry {
  id: string;
  classId: string;
  className: string;
  gradeLevel: number;
  dayOfWeek: number;
  periodNumber: number;
  subjectKey: string;
  /**
   * Set by the page hook from the server's conflict scan, because the
   * teacher-timetable read does not carry the stored `isCombinedSession` flag.
   * `true` here means the scan reported this row.
   */
  isClash?: boolean;
}

interface TeacherTimetableGridProps {
  entries: TeacherTimetableEntry[];
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onEditClick: (entry: TeacherTimetableEntry) => void;
  onDeleteClick: (entry: TeacherTimetableEntry) => void;
  /** Names the teacher in the caption; the page heading already says it. */
  teacherName?: string;
}

const describeSlot = (dayOfWeek: number, periodNumber: number): string => {
  const day = DAYS_OF_WEEK[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;
  const times = PERIOD_TIMES.get(periodNumber);
  return times
    ? `${day}, Period ${periodNumber} (${times})`
    : `${day}, Period ${periodNumber}`;
};

type SharedSlotKind = "combined" | "clash";

/**
 * What a slot holding more than one class means.
 *
 * The database allows a teacher to be in two classes at once precisely so a
 * Dance or Music teacher can run one session across several classes, and the
 * server's scan leaves an overlap out of its report when every row in it is
 * marked as a combined session. So a multi-class slot is either a declared
 * combined session or something the scan reported — and this grid can tell which,
 * because the page passes the scan's answer in. It says which, either way; it
 * never implies the timetable has been checked and found clean.
 */
const sharedSlotKind = (
  slotEntries: TeacherTimetableEntry[]
): SharedSlotKind | null => {
  if (slotEntries.length < 2) {
    return null;
  }
  return slotEntries.some((entry) => entry.isClash) ? "clash" : "combined";
};

const SHARED_SLOT_MEANING: Record<SharedSlotKind, string> = {
  combined:
    "every class in this slot is marked as an intentional combined session, so the conflict scan does not report it",
  clash:
    "the conflict scan found an overlap here that is not marked as intentional, so at least one of these classes is unexpected",
};

const SlotMark = ({ kind }: { kind: SharedSlotKind }) => {
  if (kind === "clash") {
    return (
      <Badge className="gap-1" variant="destructive">
        <IconAlertTriangle aria-hidden="true" />
        Clash
      </Badge>
    );
  }
  return (
    <Badge
      className="border-warning-ink/40 text-warning-ink gap-1"
      variant="outline"
    >
      <IconRepeat aria-hidden="true" />
      Combined
    </Badge>
  );
};

const MarkLegend = ({ kind }: { kind: SharedSlotKind }) => (
  <span className="flex items-center gap-1.5">
    <SlotMark kind={kind} />
    <span>
      <span className="font-bold">
        {kind === "clash" ? "Clash" : "Combined session"}
      </span>{" "}
      — {SHARED_SLOT_MEANING[kind]}.
    </span>
  </span>
);

/** One class in a slot, and the actions behind the row-actions key. */
const ClassEntryCard = ({
  entry,
  navigation,
  onDelete,
  onEdit,
  position,
  sharedKind,
  slot,
}: {
  entry: TeacherTimetableEntry;
  navigation: SlotNavigation;
  onDelete: () => void;
  onEdit: () => void;
  position: SlotPosition;
  sharedKind: SharedSlotKind | null;
  slot: string;
}) => (
  <div className="group bg-card relative border p-2 text-left text-xs">
    <button
      aria-label={`Edit ${entry.className}, ${subjectLabel(entry.subjectKey)}, in ${slot}${sharedKind === "clash" ? ". The conflict scan reported an unmarked overlap in this slot." : ""}`}
      className="block w-full cursor-pointer pr-6 text-left"
      onClick={onEdit}
      onKeyDown={(event) => navigation.handleSlotKeyDown(event, position)}
      ref={(node) =>
        navigation.registerSlotButton(
          `${position.dayIndex}:${position.periodIndex}:${position.itemIndex}`,
          node
        )
      }
      tabIndex={navigation.isActive(position) ? 0 : -1}
      type="button"
    >
      <div className="font-bold">{entry.className}</div>
      <div className="text-muted-foreground text-xs">
        {subjectLabel(entry.subjectKey)}
      </div>
    </button>
    {/* Sibling of the cell button, not a child, and reachable from the focused
        cell with Shift+F10 rather than a second tab stop. */}
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${entry.className}, ${subjectLabel(entry.subjectKey)}, in ${slot}`}
            className="absolute top-0 right-0 size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
            ref={(node: HTMLButtonElement | null) =>
              navigation.registerSlotMenu(
                `${position.dayIndex}:${position.periodIndex}:${position.itemIndex}`,
                node
              )
            }
            tabIndex={-1}
            size="icon"
            variant="ghost"
          >
            <IconDotsVertical aria-hidden="true" className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

/**
 * The tone of a slot.
 *
 * Destructive-tinted for a slot the scan reported, the quiet green wash for one
 * holding a class, and the muted panel for a free slot — so "no class here" and
 * "a class is here" are never the same picture.
 */
const slotCellTone = (
  sharedKind: SharedSlotKind | null,
  isEmpty: boolean
): string => {
  if (sharedKind === "clash") {
    return "bg-destructive/6";
  }
  return isEmpty ? "bg-muted/30" : "bg-primary/5";
};

/** One slot: the classes in it, what the scan says, and the add button. */
const TeacherSlotCell = ({
  dayOfWeek,
  navigation,
  onAssign,
  onDelete,
  onEdit,
  period,
  slotEntries,
}: {
  dayOfWeek: number;
  navigation: SlotNavigation;
  onAssign: () => void;
  onDelete: (entry: TeacherTimetableEntry) => void;
  onEdit: (entry: TeacherTimetableEntry) => void;
  period: (typeof CODE_DEFINED_PERIODS)[number];
  slotEntries: TeacherTimetableEntry[];
}) => {
  const periodIndex = period.periodNumber - 1;
  const slot = describeSlot(dayOfWeek, period.periodNumber);
  const sharedKind = sharedSlotKind(slotEntries);
  const addPosition = {
    dayIndex: dayOfWeek - 1,
    periodIndex,
    itemIndex: slotEntries.length,
  };

  return (
    <TableCell
      className={`min-h-[66px] p-1 align-top ${slotCellTone(
        sharedKind,
        slotEntries.length === 0
      )}`}
    >
      <div className="flex flex-col gap-1">
        {sharedKind && <SlotMark kind={sharedKind} />}
        {slotEntries.map((entry, itemIndex) => (
          <ClassEntryCard
            key={entry.id}
            entry={entry}
            navigation={navigation}
            onDelete={() => onDelete(entry)}
            onEdit={() => onEdit(entry)}
            position={{
              dayIndex: dayOfWeek - 1,
              itemIndex,
              periodIndex,
            }}
            sharedKind={sharedKind}
            slot={slot}
          />
        ))}
        {sharedKind && (
          <p className="text-muted-foreground text-[10px] leading-snug">
            {`${slotEntries.length} classes in this slot: ${SHARED_SLOT_MEANING[sharedKind]}.`}
          </p>
        )}
        <Button
          aria-label={`${
            slotEntries.length > 0
              ? "Add another class to"
              : "Assign a class to"
          } ${slot}`}
          className="border-border w-full justify-start border border-dashed px-2 text-xs"
          onClick={onAssign}
          onKeyDown={(event) =>
            navigation.handleSlotKeyDown(event, addPosition)
          }
          ref={(node) =>
            navigation.registerSlotButton(
              `${addPosition.dayIndex}:${addPosition.periodIndex}:${addPosition.itemIndex}`,
              node
            )
          }
          tabIndex={navigation.isActive(addPosition) ? 0 : -1}
          type="button"
          variant="ghost"
        >
          <IconPlus aria-hidden="true" className="mr-1 size-3" />
          {slotEntries.length > 0 ? "Add class" : "Assign"}
        </Button>
      </div>
    </TableCell>
  );
};

const PeriodRow = ({
  entriesFor,
  navigation,
  onAssignClick,
  onDeleteClick,
  onEditClick,
  period,
}: {
  entriesFor: (
    dayOfWeek: number,
    periodNumber: number
  ) => TeacherTimetableEntry[];
  navigation: SlotNavigation;
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onDeleteClick: (entry: TeacherTimetableEntry) => void;
  onEditClick: (entry: TeacherTimetableEntry) => void;
  period: (typeof CODE_DEFINED_PERIODS)[number];
}) => (
  <TableRow>
    <TableHead
      className="bg-card text-foreground sticky left-0 z-10 w-36 border-r font-medium"
      scope="row"
    >
      <div className="text-sm font-bold">{`Period ${period.periodNumber}`}</div>
      <div className="text-muted-foreground font-mono text-xs tabular-nums">
        {period.startTime}–{period.endTime}
      </div>
    </TableHead>
    {DAYS_OF_WEEK.map((_, dayIndex) => {
      const dayOfWeek = dayIndex + 1;
      return (
        <TeacherSlotCell
          key={`${dayOfWeek}-${period.periodNumber}`}
          dayOfWeek={dayOfWeek}
          navigation={navigation}
          onAssign={() => onAssignClick(dayOfWeek, period.periodNumber)}
          onDelete={onDeleteClick}
          onEdit={onEditClick}
          period={period}
          slotEntries={entriesFor(dayOfWeek, period.periodNumber)}
        />
      );
    })}
  </TableRow>
);

/**
 * Day × Period grid for one teacher.
 *
 * A cell can hold more than one class — a combined session runs across several
 * classes at once — so entries are grouped by slot rather than assuming a 1:1
 * slot-to-class mapping, and a slot with several classes says in words what it
 * is rather than looking like a mistake. The period times come from the shared
 * `CODE_DEFINED_PERIODS` list, the same one the attendance grid and the class
 * timetable read, so the three can never disagree about what "Period 3" is.
 *
 * Semantics and keyboard behaviour match the class grid: a real table with a
 * caption and `scope` on every header, pinned day and period headers, one tab
 * stop with arrow keys walking the slots, and the row's actions one key away.
 */
export const TeacherTimetableGrid = ({
  entries,
  onAssignClick,
  onEditClick,
  onDeleteClick,
  teacherName,
}: TeacherTimetableGridProps) => {
  const entriesBySlot = useMemo(() => {
    const map = new Map<string, TeacherTimetableEntry[]>();
    for (const entry of entries) {
      const key = `${entry.dayOfWeek}-${entry.periodNumber}`;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [entries]);

  const entriesFor = useCallback(
    (dayOfWeek: number, periodNumber: number) =>
      entriesBySlot.get(`${dayOfWeek}-${periodNumber}`) ?? [],
    [entriesBySlot]
  );

  // A slot holds one control per class, then the button that adds another.
  const controlCountFor = useCallback(
    (dayIndex: number, periodIndex: number) => {
      const period = CODE_DEFINED_PERIODS[periodIndex];
      return period
        ? entriesFor(dayIndex + 1, period.periodNumber).length + 1
        : 1;
    },
    [entriesFor]
  );
  const navigation = useSlotNavigation(controlCountFor);

  const sharedKinds = useMemo(() => {
    const kinds = new Set<SharedSlotKind>();
    for (const slotEntries of entriesBySlot.values()) {
      const kind = sharedSlotKind(slotEntries);
      if (kind) {
        kinds.add(kind);
      }
    }
    return kinds;
  }, [entriesBySlot]);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        Arrow keys move between slots, Enter edits the focused class, and
        Shift+F10 opens its actions. The day and period headers stay in place
        while the grid scrolls.
      </p>

      <Card className="max-h-[min(72vh,42rem)] overflow-hidden p-0 py-0">
        <section
          aria-label="Teacher timetable grid, scrollable"
          className="min-h-0 flex-1 overflow-auto [&>[data-slot=table-container]]:h-full"
          tabIndex={0}
        >
          <Table className="w-max min-w-full">
            <TableCaption className="sr-only">
              {`Timetable for ${teacherName ?? "the selected teacher"}: eight periods by five days, Monday to Friday. Column headers are days, row headers are periods with their start and end times. Each cell lists the classes and subjects in that slot, or offers to assign one.`}
            </TableCaption>
            <TableHeader className="bg-primary [&_tr]:border-none">
              <TableRow className="hover:bg-primary">
                <TableHead
                  className="text-accent bg-primary sticky left-0 z-30 h-11 w-36 text-xs font-extrabold tracking-[0.16em] uppercase"
                  scope="col"
                >
                  Period
                </TableHead>
                {DAYS_OF_WEEK.map((day) => (
                  <TableHead
                    className="text-accent bg-primary sticky top-0 z-20 h-11 text-center text-xs font-extrabold tracking-[0.16em] uppercase"
                    key={day}
                    scope="col"
                  >
                    {day}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {CODE_DEFINED_PERIODS.map((period) => (
                <PeriodRow
                  key={period.periodNumber}
                  entriesFor={entriesFor}
                  navigation={navigation}
                  onAssignClick={onAssignClick}
                  onDeleteClick={onDeleteClick}
                  onEditClick={onEditClick}
                  period={period}
                />
              ))}
            </TableBody>
          </Table>
        </section>
      </Card>

      {sharedKinds.size > 0 && (
        <div className="text-muted-foreground flex flex-wrap items-start gap-x-5 gap-y-2 text-xs">
          <span className="font-extrabold tracking-[0.18em] uppercase">
            Reading this grid
          </span>
          {sharedKinds.has("combined") && <MarkLegend kind="combined" />}
          {sharedKinds.has("clash") && <MarkLegend kind="clash" />}
          <span className="basis-full">
            A clash is a report, not a guarantee: nothing in the timetable
            prevents a double-booking from being saved, and this grid shows what
            the conflict scan found for this teacher.
          </span>
        </div>
      )}
    </div>
  );
};
