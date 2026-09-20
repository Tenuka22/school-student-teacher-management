import type {
  classPeriodAssignment as periodAssignmentTable,
  periodConfig as periodConfigTable,
} from "@school-student-teacher-management/db/schema/periods";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";

import { PeriodAssignmentForm } from "@/components/staff/period-management/period-assignment-form";

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
  isLoading,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: unknown) => Promise<void>;
  staff: Staff[];
  selectedClass: PeriodClass | undefined;
  selectedSlot: { dayOfWeek: number; periodNumber: number } | null;
  isLoading: boolean;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>Assign Period</DialogTitle>
        <DialogDescription>
          Assign a staff member to this time slot
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4 [color-scheme:dark]">
        {selectedClass && selectedSlot && (
          <PeriodAssignmentForm
            formId="assign-period-form"
            gradeLevel={selectedClass.gradeLevel}
            dayOfWeek={selectedSlot.dayOfWeek}
            periodNumber={selectedSlot.periodNumber}
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
          {isLoading ? "Saving..." : "Assign"}
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
  isLoading,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: unknown) => Promise<void>;
  selectedAssignment: PeriodAssignment | null;
  staff: Staff[];
  selectedClass: PeriodClass | undefined;
  isLoading: boolean;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>Edit Assignment</DialogTitle>
        <DialogDescription>Update the assignment details</DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4 [color-scheme:dark]">
        {selectedClass && selectedAssignment && (
          <PeriodAssignmentForm
            formId="edit-period-form"
            gradeLevel={selectedClass.gradeLevel}
            dayOfWeek={selectedAssignment.dayOfWeek}
            periodNumber={selectedAssignment.periodNumber}
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
          {isLoading ? "Saving..." : "Save"}
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
  <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogTitle>Delete Assignment</AlertDialogTitle>
      <AlertDialogDescription>
        Are you sure you want to delete this assignment? This action cannot be
        undone.
      </AlertDialogDescription>
      <div className="flex justify-end gap-2">
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isLoading}
          className="bg-destructive"
        >
          {isLoading ? "Deleting..." : "Delete"}
        </AlertDialogAction>
      </div>
    </AlertDialogContent>
  </AlertDialog>
);
