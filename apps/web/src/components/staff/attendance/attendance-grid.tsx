"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
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
import { IconClockCheck, IconMessage2 } from "@tabler/icons-react";
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
  filter: string;
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
  lateShortLeave: { label: "Late — short leave", variant: "secondary" },
  halfDay: { label: "Half day", variant: "destructive" },
  unmarked: { label: "Not marked", variant: "secondary" },
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
    size="icon"
    className="size-5"
    onClick={onClick}
    title={label}
    aria-label={label}
  >
    <IconMessage2 className="size-3.5" />
  </Button>
);

/**
 * The box a marker clicks.
 *
 * A tick means present and an empty box means absent, so the two must never be
 * confused with "nobody has recorded this yet". An unmarked cell therefore gets
 * its own name and its own muted treatment, and a cell whose save was refused
 * says so.
 */
const MarkCell = ({
  ariaLabel,
  isFailing,
  isLocked,
  isPresent,
  isSaving,
  onToggle,
  reasonButton,
  title,
}: {
  ariaLabel: string;
  isFailing?: boolean;
  isLocked?: boolean;
  isPresent: boolean;
  isSaving: boolean;
  onToggle: () => void;
  reasonButton?: React.ReactNode;
  title?: string;
}) => (
  <div className="flex items-center justify-center gap-1">
    <Checkbox
      aria-label={ariaLabel}
      checked={isPresent}
      className={isFailing ? "border-destructive" : undefined}
      data-unrecorded={isPresent ? undefined : true}
      disabled={isSaving || isLocked}
      title={title}
      onCheckedChange={onToggle}
    />
    {reasonButton}
  </div>
);

/**
 * The hover text for a mark cell, if it needs any.
 *
 * Two states are worth spelling out and neither can be inferred from the box:
 * that nothing has been recorded yet, and that approved leave is holding the
 * cell.
 */
const describeCellState = (
  isUnmarked: boolean,
  isLocked: boolean
): string | undefined => {
  if (isUnmarked) {
    return "No attendance has been recorded for this teacher on this date";
  }

  if (isLocked) {
    return "Approved leave locks attendance";
  }

  return undefined;
};

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
  const isUnmarked = status === "unmarked";
  const isPresent = status !== "absent";
  const isLocked = page.isLeaveLocked(teacher.id);
  const isSaving = page.pendingCells.has(`${teacher.id}:school`);

  return (
    <TableCell
      className={`w-20 p-1.5 text-center ${isPresent ? "" : "bg-destructive/5"} ${isUnmarked ? "bg-muted/40" : ""}`}
    >
      <MarkCell
        ariaLabel={
          isUnmarked
            ? `${teacher.name}: not marked yet. Tick to record present.`
            : `${teacher.name}: ${isPresent ? "present" : "absent"} for the school day. Toggle.`
        }
        isFailing={page.failedCells.has(`${teacher.id}:school`)}
        isLocked={isLocked && !page.isPrincipal}
        isPresent={isPresent}
        isSaving={isSaving}
        onToggle={() => page.toggleSchool(teacher.id)}
        reasonButton={
          !isPresent && !isUnmarked ? (
            <ReasonButton
              label={`Add a reason for ${teacher.name}'s whole-day absence`}
              onClick={() =>
                onOpenReason({
                  kind: "day",
                  staffId: teacher.id,
                  teacherName: teacher.name,
                })
              }
            />
          ) : null
        }
        title={describeCellState(isUnmarked, isLocked)}
      />
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
  const isAbsent = page.isPeriodAbsent(teacher.id, periodNumber);
  const isUnmarked = page.rowStatus(teacher.id) === "unmarked";
  const isLocked = page.isLeaveLocked(teacher.id);
  const isSaving = page.pendingCells.has(`${teacher.id}:${periodNumber}`);
  const title = scheduled
    ?.map((cell) => `${cell.className} (${subjectLabel(cell.subjectKey)})`)
    .join(", ");
  const periodLabel = `Period ${periodNumber}`;

  return (
    <TableCell
      className={`w-16 p-1.5 text-center ${isAbsent ? "bg-destructive/5" : ""} ${isUnmarked ? "bg-muted/40" : ""}`}
      title={title ?? "No class assigned — mark school presence by period"}
    >
      <MarkCell
        ariaLabel={
          isUnmarked
            ? `${teacher.name}, ${periodLabel}: not marked yet. Tick to record present.`
            : `${teacher.name}, ${periodLabel}: ${isAbsent ? "absent" : "present"}. Toggle.`
        }
        isFailing={page.failedCells.has(`${teacher.id}:${periodNumber}`)}
        isLocked={isLocked && !page.isPrincipal}
        isPresent={!isAbsent && !isUnmarked}
        isSaving={isSaving}
        onToggle={() => page.togglePeriod(teacher.id, periodNumber)}
        reasonButton={
          isAbsent ? (
            <ReasonButton
              label={`Add a reason for ${teacher.name}'s absence in ${periodLabel}`}
              onClick={() =>
                onOpenReason({
                  kind: "period",
                  staffId: teacher.id,
                  teacherName: teacher.name,
                  periodNumber,
                })
              }
            />
          ) : null
        }
        title={isLocked ? "Approved leave locks attendance" : undefined}
      />
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
      <TableCell className="bg-card sticky left-0 font-medium whitespace-nowrap">
        <div className="flex items-center gap-2">
          {teacher.name}
          {status !== "present" && (
            <Badge variant={badge.variant}>{badge.label}</Badge>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5"
            title="Record arrival time (auto short-leave / half-day policy)"
            aria-label={`Record arrival time for ${teacher.name}`}
            onClick={() => setArrivalOpen(true)}
          >
            <IconClockCheck className="size-3.5" />
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
              Compared against this academic year&apos;s cut-off. After it, an
              available short leave is used first; otherwise a half day is
              recorded.
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
              ? ` — Period ${target.periodNumber}`
              : " — whole day"}
          </DialogDescription>
        </DialogHeader>
        <label className="text-sm font-medium" htmlFor="absence-reason">
          Reason
        </label>
        <Textarea
          id="absence-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Sick leave"
          autoFocus
        />
        <p className="text-muted-foreground text-xs">
          Recorded against this absence. A reason helps the Principal decide on
          leave; it is not required.
        </p>
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
    return `${name} — whole day`;
  }
  if (pending.kind === "period") {
    return `${name} — Period ${pending.periodNumber}`;
  }
  return pending.periodNumber === null
    ? `${name} — whole day reason`
    : `${name} — Period ${pending.periodNumber} reason`;
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
        <AlertDialogTitle>
          {pending?.overrideLeave
            ? "Override approved leave attendance"
            : "Editing past attendance"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {pending?.overrideLeave
            ? `This teacher has approved leave on ${page.date}. The Principal override will change the attendance exception. Continue?`
            : `${page.date} has already passed. ${
                pending && pastEditLabel(teacher, pending)
              } - changing attendance for a past date can affect records that may already be reported on. Continue?`}
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

export const AttendanceGrid = ({ page, filter }: AttendanceGridProps) => {
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return page.teachers;
    }
    return page.teachers.filter((t) => t.name.toLowerCase().includes(q));
  }, [page.teachers, filter]);

  const groups = useMemo(() => groupTeachers(filtered), [filtered]);

  /**
   * A failed register read must not render as a register.
   *
   * With no rows loaded, every teacher would fall through to "unmarked" — a
   * plausible-looking grid that is a fiction. The page shows the failure and a
   * retry instead, because the difference between "nobody is absent" and "we
   * could not ask" is the whole point of this screen.
   */
  if (page.isErrorAttendance) {
    return (
      <div className="border-destructive/30 bg-card px-[22px] py-4">
        <p className="text-destructive text-sm font-bold">
          This date&rsquo;s attendance could not be loaded
        </p>
        <p className="text-muted-foreground mt-1 text-[13px]">
          {page.errorAttendance?.message ?? "The register request failed."}{" "}
          Nobody has been marked absent and nothing has been saved — the screen
          below is not the register.
        </p>
        <button
          type="button"
          className="border-primary/30 text-primary hover:border-primary mt-3 border px-3 py-1.5 text-xs font-bold transition-colors"
          onClick={() => {
            page.refetchAttendance();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (page.dayOfWeek === null) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        No periods are scheduled at the weekend, so there is nothing to mark for
        this date.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-[13px]">
        A tick means present; an empty box means absent. A shaded row has not
        been recorded yet — tick it to record the teacher present, or leave it
        unmarked if the day is still being taken.
      </p>
      {groups.map(
        (group) =>
          group.teachers.length > 0 && (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-wide uppercase">
                  {group.label}
                </h2>
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
                          className="w-16 text-center whitespace-nowrap"
                          title={`${period.startTime}-${period.endTime}`}
                        >
                          P{period.periodNumber}
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
      {groups.every((g) => g.teachers.length === 0) && (
        <p className="text-muted-foreground text-center text-sm">
          {page.teachers.length === 0
            ? "No teachers are on the establishment for this year yet."
            : "No teacher matches this filter."}
        </p>
      )}

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
