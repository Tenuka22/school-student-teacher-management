import type { periodConfig as periodConfigTable } from "@school-student-teacher-management/db/schema/periods";
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
type PeriodConfig = typeof periodConfigTable.$inferSelect;

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
  periodConfig: PeriodConfig[];
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
}

export const TeacherTimetableDialogs = ({
  classes,
  periodConfig,
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
}: TeacherTimetableDialogsProps) => (
  <>
    {/* Add Dialog */}
    <Dialog open={isAddOpen} onOpenChange={onAddOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Add Timetable Assignment</DialogTitle>
          <DialogDescription>
            Assign this teacher to a class and subject. A teacher can be
            assigned to more than one class at the same slot for combined
            sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 [color-scheme:dark]">
          <TeacherPeriodAssignmentForm
            formId="add-teacher-period-form"
            classes={classes}
            periodConfig={periodConfig}
            onSubmit={onAddSubmit}
            isLoading={isAddPending}
            prefillSlot={addSlot ?? undefined}
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onAddOpenChange(false)}
            disabled={isAddPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-teacher-period-form"
            disabled={isAddPending}
          >
            {isAddPending ? "Saving..." : "Add Assignment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Edit Dialog */}
    <Dialog open={isEditOpen} onOpenChange={onEditOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Edit Timetable Assignment</DialogTitle>
          <DialogDescription>
            Update the subject for this slot
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 [color-scheme:dark]">
          {selectedEntry && (
            <TeacherPeriodAssignmentForm
              formId="edit-teacher-period-form"
              classes={classes}
              periodConfig={periodConfig}
              onSubmit={onEditSubmit}
              isLoading={isEditPending}
              initialData={{
                classId: selectedEntry.classId,
                dayOfWeek: selectedEntry.dayOfWeek,
                periodNumber: selectedEntry.periodNumber,
                subjectKey: selectedEntry.subjectKey,
              }}
            />
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onEditOpenChange(false)}
            disabled={isEditPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-teacher-period-form"
            disabled={isEditPending}
          >
            {isEditPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Remove Assignment</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to remove this timetable assignment? This action
          cannot be undone.
        </AlertDialogDescription>
        <div className="flex justify-end gap-3">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmDelete}
            disabled={isDeletePending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeletePending ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
