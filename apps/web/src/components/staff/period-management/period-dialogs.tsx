import type { classPeriodAssignment as periodAssignmentTable } from "@school-student-teacher-management/db/schema/periods";
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

const DAYS_OF_WEEK = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

/**
 * A held width on the submit button.
 *
 * "Assign" becoming "Saving…" changes the button's width, which shifts Cancel
 * out from under the pointer in the middle of a save.
 */
const SUBMIT_WIDTH = "min-w-28";

/**
 * Shown when a dialog is open with nothing to edit.
 *
 * The body used to render nothing at all, leaving a Save button wired to a form
 * that was not on the page: a submit into a void. The button is disabled and the
 * body says what happened.
 */
const NoSelection = ({ children }: { children: string }) => (
  <div className="text-muted-foreground border-border border border-dashed px-3 py-6 text-center text-xs">
    {children}
  </div>
);

const describeAssignment = (assignment: PeriodAssignment): string => {
  const day =
    DAYS_OF_WEEK[assignment.dayOfWeek] ?? `Day ${assignment.dayOfWeek}`;
  return `${day}, Period ${assignment.periodNumber}`;
};

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
}) => {
  const hasSlot = Boolean(selectedClass && selectedSlot);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Assign Period</DialogTitle>
          <DialogDescription>
            {selectedClass && selectedSlot
              ? `${selectedClass.name}, ${DAYS_OF_WEEK[selectedSlot.dayOfWeek] ?? `Day ${selectedSlot.dayOfWeek}`}, Period ${selectedSlot.periodNumber}.`
              : "Assign a staff member to this time slot."}
          </DialogDescription>
        </DialogHeader>
        <div
          aria-busy={isLoading ? "true" : undefined}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          {selectedClass && selectedSlot ? (
            <PeriodAssignmentForm
              academicYearId={academicYearId}
              dayOfWeek={selectedSlot.dayOfWeek}
              formId="assign-period-form"
              gradeLevel={selectedClass.gradeLevel}
              isLoading={isLoading}
              onSubmit={onSubmit}
              periodNumber={selectedSlot.periodNumber}
              staff={staff}
            />
          ) : (
            <NoSelection>
              No slot is selected. Close this and choose a day and period in the
              grid.
            </NoSelection>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className={SUBMIT_WIDTH}
            disabled={isLoading || !hasSlot}
            form="assign-period-form"
            type="submit"
          >
            {isLoading ? "Saving…" : "Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

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
        <DialogTitle>Edit Assignment</DialogTitle>
        <DialogDescription>
          {selectedAssignment
            ? `${describeAssignment(selectedAssignment)}. Change the subject or the teacher; the slot itself cannot move.`
            : "Update the assignment details."}
        </DialogDescription>
      </DialogHeader>
      <div
        aria-busy={isLoading ? "true" : undefined}
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        {selectedClass && selectedAssignment ? (
          <PeriodAssignmentForm
            academicYearId={academicYearId}
            currentAssignmentId={selectedAssignment.id}
            dayOfWeek={selectedAssignment.dayOfWeek}
            formId="edit-period-form"
            gradeLevel={selectedClass.gradeLevel}
            initialData={{
              isCombinedSession: selectedAssignment.isCombinedSession,
              staffId: selectedAssignment.staffId,
              subjectKey: selectedAssignment.subjectKey,
            }}
            isLoading={isLoading}
            onSubmit={onSubmit}
            periodNumber={selectedAssignment.periodNumber}
            staff={staff}
          />
        ) : (
          <NoSelection>
            The assignment to edit is no longer selected. Close this and pick
            the slot again.
          </NoSelection>
        )}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
        <Button
          disabled={isLoading}
          onClick={() => onOpenChange(false)}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          className={SUBMIT_WIDTH}
          disabled={isLoading || !selectedAssignment || !selectedClass}
          form="edit-period-form"
          type="submit"
        >
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
  <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogTitle>Unassign this period</AlertDialogTitle>
      <AlertDialogDescription>
        The subject and teacher are removed from this slot, which then becomes
        free to assign again. This cannot be undone.
      </AlertDialogDescription>
      <div className="flex justify-end gap-2">
        <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 min-w-28"
          disabled={isLoading}
          onClick={onConfirm}
        >
          {isLoading ? "Removing…" : "Unassign"}
        </AlertDialogAction>
      </div>
    </AlertDialogContent>
  </AlertDialog>
);
