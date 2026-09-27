import type {
  classPeriodAssignment as periodAssignmentTable,
  periodConfig as periodConfigTable,
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

import { PeriodAssignmentForm } from "@/components/staff/period-management/period-assignment-form";
import { ConfirmDialog } from "@/components/ui-patterns/confirm-dialog";

type Staff = typeof staff.$inferSelect;
type PeriodAssignment = typeof periodAssignmentTable.$inferSelect;
export type PeriodConfig = typeof periodConfigTable.$inferSelect;
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

export const AssignPeriodDialog = ({
  isOpen,
  onOpenChange,
  onSubmit,
  staff,
  selectedClass,
  selectedSlot,
  academicYearId,
  isLoading,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: unknown) => Promise<void>;
  staff: Staff[];
  selectedClass: PeriodClass | undefined;
  selectedSlot: { dayOfWeek: number; periodNumber: number } | null;
  academicYearId: string | undefined;
  isLoading: boolean;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>Assign period</DialogTitle>
        <DialogDescription>
          Assign a staff member to this time slot
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {selectedClass && selectedSlot && (
          <PeriodAssignmentForm
            formId="assign-period-form"
            gradeLevel={selectedClass.gradeLevel}
            dayOfWeek={selectedSlot.dayOfWeek}
            periodNumber={selectedSlot.periodNumber}
            academicYearId={academicYearId}
            staff={staff}
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
        <Button type="submit" form="assign-period-form" disabled={isLoading}>
          {isLoading ? "Saving…" : "Assign"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export const EditPeriodDialog = ({
  isOpen,
  onOpenChange,
  onSubmit,
  selectedAssignment,
  staff,
  selectedClass,
  academicYearId,
  isLoading,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: unknown) => Promise<void>;
  selectedAssignment: PeriodAssignment | null;
  staff: Staff[];
  selectedClass: PeriodClass | undefined;
  academicYearId: string | undefined;
  isLoading: boolean;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>Edit period</DialogTitle>
        <DialogDescription>Update the assignment details</DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {selectedClass && selectedAssignment && (
          <PeriodAssignmentForm
            formId="edit-period-form"
            gradeLevel={selectedClass.gradeLevel}
            dayOfWeek={selectedAssignment.dayOfWeek}
            periodNumber={selectedAssignment.periodNumber}
            academicYearId={academicYearId}
            currentAssignmentId={selectedAssignment.id}
            staff={staff}
            initialData={selectedAssignment}
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
        <Button type="submit" form="edit-period-form" disabled={isLoading}>
          {isLoading ? "Saving…" : "Save"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export const DeleteConfirmDialog = ({
  isOpen,
  onOpenChange,
  onConfirm,
  isLoading,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
}) => (
  <ConfirmDialog
    open={isOpen}
    onOpenChange={onOpenChange}
    title="Unassign this period?"
    description="The teacher and subject will be removed from this timetable slot. This cannot be undone."
    confirmLabel="Unassign"
    pendingLabel="Unassigning…"
    isPending={isLoading}
    tone="destructive"
    onConfirm={onConfirm}
  />
);
