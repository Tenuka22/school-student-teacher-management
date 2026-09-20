"use client";

import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconMessage2 } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import type {
  AttendancePageApi,
  AttendanceTeacher,
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
};

const ReasonButton = ({ onClick }: { onClick: () => void }) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="size-5"
    onClick={onClick}
    title="Add reason"
  >
    <IconMessage2 className="size-3.5" />
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
  const isPresent = status === "present";
  const isSaving = page.pendingCells.has(`${teacher.id}:school`);

  return (
    <TableCell className="p-1.5 text-center">
      <div className="flex items-center justify-center gap-1">
        <Checkbox
          checked={isPresent}
          disabled={isSaving}
          onCheckedChange={() => page.toggleSchool(teacher.id)}
        />
        {!isPresent && (
          <ReasonButton
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
      <TableCell className="text-muted-foreground text-center text-xs">
        —
      </TableCell>
    );
  }

  const isAbsent = page.isPeriodAbsent(teacher.id, periodNumber);
  const isSaving = page.pendingCells.has(`${teacher.id}:${periodNumber}`);
  const title = scheduled
    .map((c) => `${c.className} (${c.subjectKey})`)
    .join(", ");

  return (
    <TableCell className="p-1.5 text-center" title={title}>
      <div className="flex items-center justify-center gap-1">
        <Checkbox
          checked={!isAbsent}
          disabled={isSaving}
          onCheckedChange={() => page.togglePeriod(teacher.id, periodNumber)}
        />
        {isAbsent && (
          <ReasonButton
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
  return (
    <TableRow>
      <TableCell className="bg-card sticky left-0 font-medium whitespace-nowrap">
        <div className="flex items-center gap-2">
          {teacher.name}
          <Badge variant={badge.variant}>{badge.label}</Badge>
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

  if (page.dayOfWeek === null) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        No periods are scheduled on weekends - nothing to mark for this date.
      </p>
    );
  }

  return (
    <div className="space-y-6">
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
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="bg-card sticky left-0">
                        Teacher
                      </TableHead>
                      <TableHead className="text-center">School</TableHead>
                      {page.periods.map((period) => (
                        <TableHead
                          key={period.periodNumber}
                          className="text-center whitespace-nowrap"
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
              </div>
            </div>
          )
      )}
      {groups.every((g) => g.teachers.length === 0) && (
        <p className="text-muted-foreground text-center text-sm">
          No teachers found.
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
    </div>
  );
};
