"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Card } from "@school-student-teacher-management/ui/components/card";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconCalendarPlus,
  IconClockCheck,
  IconMessage2,
  IconX,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import type {
  AttendancePageApi,
  AttendanceTeacher,
  PendingPastEdit,
  RowStatus,
} from "@/components/staff/attendance/use-attendance-page";
import { CLASS_CATEGORIES } from "@/components/staff/class-assignment/class-categories";

interface AttendanceGridProps {
  page: AttendancePageApi;
  /** The register filter, matched against teacher names only. */
  filter: string;
  /** Empties that filter. The grid owns the empty state, so it offers the way out. */
  onClearFilters: () => void;
}

type ReasonTarget =
  | { kind: "day"; staffId: string; teacherName: string }
  | {
      kind: "period";
      staffId: string;
      teacherName: string;
      periodNumber: number;
    };

const UNASSIGNED_LABEL = "Not yet assigned to classes";

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

const ROW_STATUS_BADGE: Record<
  RowStatus,
  { label: string; variant: "outline" | "destructive" | "secondary" }
> = {
  present: { label: "Present", variant: "outline" },
  partial: { label: "Partial", variant: "secondary" },
  absent: { label: "Absent", variant: "destructive" },
  lateShortLeave: { label: "Late (SL)", variant: "secondary" },
  halfDay: { label: "Half Day", variant: "destructive" },
  /**
   * "Not marked", in the muted outline rather than the absence colours.
   *
   * `unmarked` was added to `RowStatus` with a comment explaining that a missing
   * row is a different fact from a stored `present`, and this map was not given
   * the entry — so every lookup returned `undefined` and the badge read
   * `badge.variant` off it, which is the "Cannot read properties of undefined"
   * that took the page down.
   *
   * It is `outline` on purpose. A day nobody marked is not an absence and must not
   * wear the absence colour: the tint is how somebody spots a day that needs
   * chasing, and a day that needs chasing is a day somebody *wrote down* as absent.
   */
  unmarked: { label: "Not marked", variant: "outline" },
};

const ReasonButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    onClick={onClick}
    aria-label={label}
    title={label}
  >
    <IconMessage2 aria-hidden="true" className="size-4" />
  </Button>
);

const SchoolCell = ({
  page,
  teacher,
  onOpenReason,
}: {
  page: AttendancePageApi;
  teacher: AttendanceTeacher;
  onOpenReason: (target: ReasonTarget) => void;
}) => {
  const status = page.rowStatus(teacher.id);
  const isPresent =
    status === "present" || status === "lateShortLeave" || status === "halfDay";
  /**
   * "Nobody has written this day down" is not an absence, so it is neither
   * tinted as one nor offered a reason to explain. The checkbox still works and
   * still records presence — what a blank day must not do is claim somebody was
   * away, which is what the destructive tint and the reason button both said.
   */
  const isUnmarked = status === "unmarked";
  const isMarkedAbsence = !isPresent && !isUnmarked;
  const isSaving = page.pendingCells.has(`${teacher.id}:school`);

  return (
    <TableCell
      className={`w-20 p-1.5 text-center ${isMarkedAbsence ? "bg-destructive/5" : ""}`}
    >
      <div className="flex items-center justify-center gap-1">
        <Checkbox
          checked={isPresent}
          disabled={isSaving}
          aria-label={`${teacher.name} at school`}
          onCheckedChange={() => page.toggleSchool(teacher.id)}
        />
        {isMarkedAbsence && (
          <ReasonButton
            label={`Absence reason for ${teacher.name}, whole day`}
            onClick={() =>
              onOpenReason({
                kind: "day",
                staffId: teacher.id,
                teacherName: teacher.name,
              })
            }
          />
        )}
      </div>
    </TableCell>
  );
};

const AttendanceCell = ({
  page,
  teacher,
  periodNumber,
  onOpenReason,
}: {
  page: AttendancePageApi;
  teacher: AttendanceTeacher;
  periodNumber: number;
  onOpenReason: (target: ReasonTarget) => void;
}) => {
  const scheduled = page.scheduleByStaff.get(teacher.id)?.get(periodNumber);
  if (!scheduled || scheduled.length === 0) {
    return (
      <TableCell className="bg-muted/25 text-muted-foreground w-16 text-center text-xs">
        <span aria-hidden="true">·</span>
        <span className="sr-only">Not scheduled</span>
      </TableCell>
    );
  }

  const isAbsent = page.isPeriodAbsent(teacher.id, periodNumber);
  const isSaving = page.pendingCells.has(`${teacher.id}:${periodNumber}`);
  const title = scheduled
    .map((c) => `${c.className} (${c.subjectKey})`)
    .join(", ");

  return (
    <TableCell
      className={`w-16 p-1.5 text-center ${isAbsent ? "bg-destructive/5" : ""}`}
      title={title}
    >
      <div className="flex items-center justify-center gap-1">
        <Checkbox
          checked={!isAbsent}
          disabled={isSaving}
          aria-label={`${teacher.name} present, period ${periodNumber} (${title})`}
          onCheckedChange={() => page.togglePeriod(teacher.id, periodNumber)}
        />
        {isAbsent && (
          <ReasonButton
            label={`Absence reason for ${teacher.name}, period ${periodNumber}`}
            onClick={() =>
              onOpenReason({
                kind: "period",
                staffId: teacher.id,
                teacherName: teacher.name,
                periodNumber,
              })
            }
          />
        )}
      </div>
    </TableCell>
  );
};

const TeacherRow = ({
  page,
  teacher,
  onOpenReason,
}: {
  page: AttendancePageApi;
  teacher: AttendanceTeacher;
  onOpenReason: (target: ReasonTarget) => void;
}) => {
  const status = page.rowStatus(teacher.id);
  const badge = ROW_STATUS_BADGE[status];
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [arrivalTime, setArrivalTime] = useState("07:30");

  const submitArrival = () => {
    setArrivalOpen(false);
    page.recordArrival?.(teacher.id, arrivalTime);
  };

  return (
    <TableRow>
      <TableCell className="bg-card sticky left-0 font-semibold whitespace-nowrap">
        <div className="flex items-center gap-2">
          {teacher.name}
          {status !== "present" && (
            <Badge variant={badge.variant}>{badge.label}</Badge>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Record arrival time (auto short-leave / half-day policy)"
            aria-label={`Record arrival time for ${teacher.name}`}
            onClick={() => setArrivalOpen(true)}
          >
            <IconClockCheck aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </TableCell>
      <SchoolCell page={page} teacher={teacher} onOpenReason={onOpenReason} />
      {page.periods.map((period) => (
        <AttendanceCell
          key={period.periodNumber}
          page={page}
          teacher={teacher}
          periodNumber={period.periodNumber}
          onOpenReason={onOpenReason}
        />
      ))}
      <Dialog open={arrivalOpen} onOpenChange={setArrivalOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Record arrival — {teacher.name}</DialogTitle>
            <DialogDescription>
              Compared against the 07:30 cut-off. After it, a short leave is
              used (2/month) or a half day is recorded.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="time"
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            aria-label="Arrival time"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setArrivalOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={submitArrival}>
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TableRow>
  );
};

const initialReasonFor = (
  page: AttendancePageApi,
  target: ReasonTarget | null
) => {
  if (target?.kind === "day") {
    return page.dayReason(target.staffId);
  }
  if (target?.kind === "period") {
    return page.periodReason(target.staffId, target.periodNumber);
  }
  return "";
};

const ReasonDialog = ({
  page,
  target,
  onOpenChange,
}: {
  page: AttendancePageApi;
  target: ReasonTarget | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const [reason, setReason] = useState(() => initialReasonFor(page, target));

  const handleSave = () => {
    if (!target) {
      return;
    }
    if (target.kind === "day") {
      page.saveReason(target.staffId, null, reason);
    } else {
      page.saveReason(target.staffId, target.periodNumber, reason);
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reason for absence</DialogTitle>
          <DialogDescription>
            {target?.teacherName}
            {target?.kind === "period"
              ? ` - Period ${target.periodNumber}`
              : " - whole day"}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason for absence"
          placeholder="e.g. Sick leave"
          autoFocus
        />
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const pastEditLabel = (
  teacher: AttendanceTeacher | undefined,
  pending: PendingPastEdit
) => {
  const name = teacher?.name ?? "this teacher";
  if (pending.kind === "school") {
    return `${name} - whole day`;
  }
  if (pending.kind === "period") {
    return `${name} - Period ${pending.periodNumber}`;
  }
  return pending.periodNumber === null
    ? `${name} - whole day reason`
    : `${name} - Period ${pending.periodNumber} reason`;
};

const PastEditConfirmDialog = ({ page }: { page: AttendancePageApi }) => {
  const pending = page.pendingPastEdit;
  const teacher = pending
    ? page.teachers.find((t) => t.id === pending.staffId)
    : undefined;

  return (
    <AlertDialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) {
          page.cancelPastEdit();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle>Editing past attendance</AlertDialogTitle>
        <AlertDialogDescription>
          {page.date} has already passed.{" "}
          {pending && pastEditLabel(teacher, pending)}
          {" - changing attendance for a past date can affect records that " +
            "may already be reported on. Continue?"}
        </AlertDialogDescription>
        <div className="flex justify-end gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => page.confirmPastEdit()}>
            Continue
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const AttendanceGrid = ({
  page,
  filter,
  onClearFilters,
}: AttendanceGridProps) => {
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return page.teachers;
    }
    return page.teachers.filter((t) => t.name.toLowerCase().includes(q));
  }, [page.teachers, filter]);

  const groups = useMemo(() => groupTeachers(filtered), [filtered]);

  if (page.dayOfWeek === null) {
    return (
      <Empty className="border-primary/22 border border-dashed">
        <EmptyHeader>
          <EmptyTitle>No periods on a weekend</EmptyTitle>
          <EmptyDescription>
            {page.date} is a weekend, and periods are only defined Monday to
            Friday — so there is nothing to mark for this date.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/*
            The recovery, not an explanation. This used to be one sentence with no
            way out of it, on a screen whose whole job is marking a day: the reader
            had worked out that the date was wrong and had to go and find the date
            control to fix it. `nextWeekday` already exists on the page API for
            exactly this, so the button and the answer are the same value.
          */}
          <Button
            variant="outline"
            onClick={() => page.setDate(page.nextWeekday)}
          >
            <IconCalendarPlus aria-hidden="true" />
            Go to {page.nextWeekday}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(
        (group) =>
          group.teachers.length > 0 && (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="type-card-title m-0">{group.label}</h2>
                <Badge variant="secondary">{group.teachers.length}</Badge>
              </div>
              <Card className="w-fit max-w-full overflow-x-auto">
                <Table className="w-auto">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="bg-card sticky left-0 min-w-48">
                        Teacher
                      </TableHead>
                      <TableHead className="w-20 text-center">School</TableHead>
                      {page.periods.map((period) => (
                        <TableHead
                          key={period.periodNumber}
                          className="h-auto w-16 py-1.5 text-center whitespace-nowrap"
                        >
                          <abbr
                            title={`Period ${period.periodNumber}`}
                            className="no-underline"
                          >
                            P{period.periodNumber}
                          </abbr>
                          <span className="text-muted-foreground block text-xs font-medium tracking-normal tabular-nums">
                            {period.startTime}
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.teachers.map((teacher) => (
                      <TeacherRow
                        key={teacher.id}
                        page={page}
                        teacher={teacher}
                        onOpenReason={setReasonTarget}
                      />
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )
      )}
      {/*
        Two different sentences, because these are two different situations and
        the old one sentence covered both. "No teachers found." after somebody
        typed three letters into the filter box is a claim about the College's
        staff, printed by a filter, and the reader's only way out of it was to
        guess which box to clear.
      */}
      {groups.every((group) => group.teachers.length === 0) &&
        (filter.trim() ? (
          <Empty className="border-primary/22 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No teacher matches that filter</EmptyTitle>
              <EmptyDescription>
                Nobody on the register is called that. The filter looks at
                teacher names only, so an email address or a service number will
                not match.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={onClearFilters}>
                <IconX aria-hidden="true" />
                Clear the filter
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="border-primary/22 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Nobody is on the register</EmptyTitle>
              <EmptyDescription>
                There are no teachers to mark for this date. Teachers appear
                here once they hold a position in the selected academic year.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ))}

      <ReasonDialog
        key={
          reasonTarget
            ? `${reasonTarget.kind}-${reasonTarget.staffId}-${reasonTarget.kind === "period" ? reasonTarget.periodNumber : ""}`
            : "closed"
        }
        page={page}
        target={reasonTarget}
        onOpenChange={(open) => {
          if (!open) {
            setReasonTarget(null);
          }
        }}
      />
      <PastEditConfirmDialog page={page} />
    </div>
  );
};
