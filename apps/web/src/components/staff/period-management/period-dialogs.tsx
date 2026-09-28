import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import type {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";

import { SubjectAssignmentForm } from "@/components/staff/period-management/subject-assignment-form";
import { TeacherAssignmentForm } from "@/components/staff/period-management/teacher-assignment-form";
import { ConfirmDialog } from "@/components/ui-patterns/confirm-dialog";

type Staff = typeof staff.$inferSelect;
type PeriodSubject = typeof classPeriodSubject.$inferSelect & {
  teachers: (typeof classPeriodTeacher.$inferSelect)[];
};

export interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}
export interface PeriodClass {
  id: string;
  name: string;
  gradeLevel: number;
}

export const AddSubjectDialog = ({
  isOpen,
  onOpenChange,
  onSubmit,
  selectedClass,
  selectedSlot,
  academicYearId,
  isLoading,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: unknown) => Promise<void>;
  selectedClass: PeriodClass | undefined;
  selectedSlot: { dayOfWeek: number; periodNumber: number } | null;
  academicYearId: string | undefined;
  isLoading: boolean;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>Add subject to period</DialogTitle>
        <DialogDescription>
          Select a subject for this time slot
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {selectedClass && selectedSlot && (
          <SubjectAssignmentForm
            formId="add-subject-form"
            gradeLevel={selectedClass.gradeLevel}
            dayOfWeek={selectedSlot.dayOfWeek}
            periodNumber={selectedSlot.periodNumber}
            academicYearId={academicYearId}
            onSubmit={onSubmit}
            isLoading={isLoading}
          />
        )}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" form="add-subject-form" disabled={isLoading}>
          {isLoading ? "Adding…" : "Add subject"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export const AddTeacherDialog = ({
  isOpen,
  onOpenChange,
  onSubmit,
  subject,
  staff,
  academicYearId,
  isLoading,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: unknown) => Promise<void>;
  subject: PeriodSubject | null;
  staff: Staff[];
  academicYearId: string | undefined;
  isLoading: boolean;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>Assign teacher</DialogTitle>
        <DialogDescription>Add a teacher to this subject</DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {subject && (
          <TeacherAssignmentForm
            formId="add-teacher-form"
            staff={staff}
            subject={subject}
            academicYearId={academicYearId}
            onSubmit={onSubmit}
            isLoading={isLoading}
          />
        )}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" form="add-teacher-form" disabled={isLoading}>
          {isLoading ? "Assigning…" : "Assign"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export const DeleteSubjectConfirmDialog = ({
  isOpen,
  onOpenChange,
  onConfirm,
  isLoading,
  subjectKey,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
  subjectKey?: string;
}) => (
  <ConfirmDialog
    open={isOpen}
    onOpenChange={onOpenChange}
    title="Remove this subject?"
    description={`${subjectLabel(subjectKey)} and all its teachers will be removed from the timetable slot. This cannot be undone.`}
    confirmLabel="Remove subject"
    pendingLabel="Removing…"
    isPending={isLoading}
    tone="destructive"
    onConfirm={onConfirm}
  />
);

export const DeleteTeacherConfirmDialog = ({
  isOpen,
  onOpenChange,
  onConfirm,
  isLoading,
  teacherName,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
  teacherName?: string;
}) => (
  <ConfirmDialog
    open={isOpen}
    onOpenChange={onOpenChange}
    title="Unassign this teacher?"
    description={`${teacherName} will be removed from this subject. The subject remains on the timetable.`}
    confirmLabel="Remove teacher"
    pendingLabel="Removing…"
    isPending={isLoading}
    tone="destructive"
    onConfirm={onConfirm}
  />
);
