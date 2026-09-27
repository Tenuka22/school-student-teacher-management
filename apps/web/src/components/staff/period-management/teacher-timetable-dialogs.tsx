import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
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

import { TeacherPeriodAssignmentForm } from "@/components/staff/period-management/teacher-period-assignment-form";

interface Class {
  id: string;
  name: string;
  gradeLevel: number;
}

interface TeacherTimetableEntry {
  id: string;
  classId: string;
  className: string;
  gradeLevel: number;
  dayOfWeek: number;
  periodNumber: number;
  subjectKey: string;
}

interface TeacherTimetableDialogsProps {
  classes: Class[];
  academicYearId?: string;
  selectedEntry: TeacherTimetableEntry | null;
  addSlot: { dayOfWeek: number; periodNumber: number } | null;
  isAddOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  isAddPending: boolean;
  onAddSubmit: (data: unknown) => Promise<void>;
  isEditOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  isEditPending: boolean;
  onEditSubmit: (data: unknown) => Promise<void>;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  isDeletePending: boolean;
  onConfirmDelete: () => void;
  /**
   * The teacher whose week this is. The assign form needs it to tell an
   * intentional second class in one slot from a double-booking: without it the
   * form could only invite a combined session and leave the row unmarked, which
   * the conflict scan then reports as a clash.
   */
  staffId?: string;
}

/**
 * Fixed width on the submit button.
 *
 * "Assign" becoming "Saving…" and back changes the button's width, which moves
 * the Cancel button under the pointer mid-save. The width is held so the row of
 * buttons does not shift while a write is in flight.
 */
const SUBMIT_WIDTH = "min-w-32";

const NoSelection = ({ children }: { children: string }) => (
  <div className="text-muted-foreground border-border border border-dashed px-3 py-6 text-center text-xs">
    {children}
  </div>
);

const DAYS_OF_WEEK = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

/**
 * A confirmation that names the row it is about to remove.
 *
 * "This assignment" tells an administrator nothing at the moment they are being
 * asked to confirm a delete; the class, the subject and the slot do.
 */
const describeEntry = (entry: TeacherTimetableEntry): string => {
  const day = DAYS_OF_WEEK[entry.dayOfWeek] ?? `Day ${entry.dayOfWeek}`;
  return `${entry.className}, ${subjectLabel(entry.subjectKey)}, ${day}, Period ${entry.periodNumber}`;
};

export const TeacherTimetableDialogs = ({
  classes,
  academicYearId,
  selectedEntry,
  addSlot,
  isAddOpen,
  onAddOpenChange,
  isAddPending,
  onAddSubmit,
  isEditOpen,
  onEditOpenChange,
  isEditPending,
  onEditSubmit,
  isDeleteOpen,
  onDeleteOpenChange,
  isDeletePending,
  onConfirmDelete,
  staffId,
}: TeacherTimetableDialogsProps) => (
  <>
    <Dialog open={isAddOpen} onOpenChange={onAddOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Add Timetable Assignment</DialogTitle>
          <DialogDescription>
            Assign this teacher to a class and subject. One teacher can hold
            more than one class in the same slot for a combined session — mark
            it as intentional below when it applies, so the conflict scan does
            not report it.
          </DialogDescription>
        </DialogHeader>
        <div
          aria-busy={isAddPending ? "true" : undefined}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          <TeacherPeriodAssignmentForm
            academicYearId={academicYearId}
            classes={classes}
            formId="add-teacher-period-form"
            isLoading={isAddPending}
            onSubmit={onAddSubmit}
            prefillSlot={addSlot ?? undefined}
            staffId={staffId}
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            disabled={isAddPending}
            onClick={() => onAddOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className={SUBMIT_WIDTH}
            disabled={isAddPending}
            form="add-teacher-period-form"
            type="submit"
          >
            {isAddPending ? "Saving…" : "Add assignment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={isEditOpen} onOpenChange={onEditOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Edit Timetable Assignment</DialogTitle>
          <DialogDescription>
            Update the subject for this slot. The class, day and period are the
            row&apos;s identity and cannot be changed here.
          </DialogDescription>
        </DialogHeader>
        <div
          aria-busy={isEditPending ? "true" : undefined}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          {selectedEntry ? (
            <TeacherPeriodAssignmentForm
              academicYearId={academicYearId}
              classes={classes}
              formId="edit-teacher-period-form"
              initialData={{
                classId: selectedEntry.classId,
                dayOfWeek: selectedEntry.dayOfWeek,
                periodNumber: selectedEntry.periodNumber,
                subjectKey: selectedEntry.subjectKey,
              }}
              isLoading={isEditPending}
              onSubmit={onEditSubmit}
              staffId={staffId}
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
            disabled={isEditPending}
            onClick={() => onEditOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className={SUBMIT_WIDTH}
            disabled={isEditPending || !selectedEntry}
            form="edit-teacher-period-form"
            type="submit"
          >
            {isEditPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Remove Assignment</AlertDialogTitle>
        <AlertDialogDescription>
          {selectedEntry
            ? `${describeEntry(selectedEntry)} is removed and the slot becomes free to assign again. It cannot be undone.`
            : "This removes the class from this period. It cannot be undone."}
        </AlertDialogDescription>
        <div className="flex justify-end gap-3">
          <AlertDialogCancel disabled={isDeletePending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 min-w-32"
            disabled={isDeletePending}
            onClick={onConfirmDelete}
          >
            {isDeletePending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
