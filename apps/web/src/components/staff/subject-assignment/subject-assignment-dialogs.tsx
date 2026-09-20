import type { subjectAssignment as subjectAssignmentTable } from "@school-student-teacher-management/db/schema/academics";
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

import { SubjectAssignmentForm } from "@/components/staff/subject-assignment/subject-assignment-form";

type SubjectAssignment = typeof subjectAssignmentTable.$inferSelect;
type Staff = typeof staff.$inferSelect;

interface SubjectAssignmentDialogsProps {
  academicYearId: string | undefined;
  staff: Staff[];
  selectedAssignment: SubjectAssignment | null;
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  isCreatePending: boolean;
  onCreateSubmit: (data: unknown) => Promise<void>;
  isEditOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  isEditPending: boolean;
  onEditSubmit: (data: unknown) => Promise<void>;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  isDeletePending: boolean;
  onConfirmDelete: () => void;
}

export const SubjectAssignmentDialogs = ({
  academicYearId,
  staff,
  selectedAssignment,
  isCreateOpen,
  onCreateOpenChange,
  isCreatePending,
  onCreateSubmit,
  isEditOpen,
  onEditOpenChange,
  isEditPending,
  onEditSubmit,
  isDeleteOpen,
  onDeleteOpenChange,
  isDeletePending,
  onConfirmDelete,
}: SubjectAssignmentDialogsProps) => (
  <>
    {/* Create Dialog */}
    <Dialog open={isCreateOpen} onOpenChange={onCreateOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Create Subject Assignment</DialogTitle>
          <DialogDescription>
            Assign a subject to a teacher for this academic year
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 [color-scheme:dark]">
          {academicYearId && (
            <SubjectAssignmentForm
              formId="create-subject-assignment-form"
              academicYearId={academicYearId}
              staff={staff}
              onSubmit={onCreateSubmit}
              isLoading={isCreatePending}
            />
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onCreateOpenChange(false)}
            disabled={isCreatePending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-subject-assignment-form"
            disabled={isCreatePending}
          >
            {isCreatePending ? "Saving..." : "Save Assignment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Edit Dialog */}
    <Dialog open={isEditOpen} onOpenChange={onEditOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Edit Subject Assignment</DialogTitle>
          <DialogDescription>Update assignment details</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 [color-scheme:dark]">
          {academicYearId && selectedAssignment && (
            <SubjectAssignmentForm
              formId="edit-subject-assignment-form"
              academicYearId={academicYearId}
              staff={staff}
              onSubmit={onEditSubmit}
              isLoading={isEditPending}
              initialData={selectedAssignment}
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
            form="edit-subject-assignment-form"
            disabled={isEditPending}
          >
            {isEditPending ? "Saving..." : "Save Assignment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete Assignment</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to remove this subject assignment? This action
          cannot be undone.
        </AlertDialogDescription>
        <div className="flex justify-end gap-3">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmDelete}
            disabled={isDeletePending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeletePending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
