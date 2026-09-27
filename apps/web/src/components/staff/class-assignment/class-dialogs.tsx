import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
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

import { AssignTeacherForm } from "@/components/staff/class-assignment/assign-teacher-form";
import { ClassForm } from "@/components/staff/class-assignment/class-form";

type Class = typeof classTable.$inferSelect;

interface ClassDialogsProps {
  academicYearId: string | undefined;
  selectedClass: Class | null;
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  isCreatePending: boolean;
  onCreateSubmit: (data: unknown) => Promise<void>;
  isEditOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  isEditPending: boolean;
  onEditSubmit: (data: unknown) => Promise<void>;
  isAssignTeacherOpen: boolean;
  onAssignTeacherOpenChange: (open: boolean) => void;
  isAssignTeacherPending: boolean;
  onAssignTeacherSubmit: (data: unknown) => Promise<void>;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  isDeletePending: boolean;
  onConfirmDelete: () => void;
}

/**
 * Why `Esc` is refused while a write is in flight.
 *
 * Base UI already traps focus, moves focus in on open, and returns it to the
 * trigger on close. What it cannot know is that the dialog holds a write the
 * server has not answered yet: dismissing it then leaves a mutation running
 * with nobody watching, and on failure the reason lands in a toast over a
 * screen that has already forgotten which class it was about.
 */
const guardedOpenChange =
  (isPending: boolean, onChange: (open: boolean) => void) =>
  (open: boolean) => {
    if (isPending && !open) {
      return;
    }
    onChange(open);
  };

/**
 * The form is only mounted once a year is known, so without this sentence a
 * dialog could open with an empty body and a dead Save button and no stated
 * reason for either.
 */
const NoYearNotice = ({ title }: { title: string }) => (
  <p role="alert" className="text-warning-ink text-sm font-semibold">
    {title} needs an academic year, and none is selected on this page. Open the
    Classes screen from a year in the address bar.
  </p>
);

/**
 * `min-w` so the label swap does not reflow the footer mid-submit.
 *
 * "Save Class" and "Saving…" are different lengths, and a button that changes
 * width while it is being pressed is a button the eye is still finding when the
 * press ends.
 */
const SUBMIT_WIDTH = "min-w-28";

export const ClassDialogs = ({
  academicYearId,
  selectedClass,
  isCreateOpen,
  onCreateOpenChange,
  isCreatePending,
  onCreateSubmit,
  isEditOpen,
  onEditOpenChange,
  isEditPending,
  onEditSubmit,
  isAssignTeacherOpen,
  onAssignTeacherOpenChange,
  isAssignTeacherPending,
  onAssignTeacherSubmit,
  isDeleteOpen,
  onDeleteOpenChange,
  isDeletePending,
  onConfirmDelete,
}: ClassDialogsProps) => (
  <>
    {/* Create Dialog */}
    <Dialog
      open={isCreateOpen}
      onOpenChange={guardedOpenChange(isCreatePending, onCreateOpenChange)}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="font-heading text-lg font-semibold">
            Create Class
          </DialogTitle>
          <DialogDescription>
            Add a class to the {academicYearId ? "selected" : "current"}{" "}
            academic year
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {academicYearId ? (
            <ClassForm
              formId="create-class-form"
              academicYearId={academicYearId}
              onSubmit={onCreateSubmit}
              isLoading={isCreatePending}
            />
          ) : (
            <NoYearNotice title="Creating a class" />
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
            form="create-class-form"
            className={SUBMIT_WIDTH}
            // The form only exists once a year is selected; without this the
            // button submits nothing and reads as broken.
            disabled={isCreatePending || !academicYearId}
          >
            {isCreatePending ? "Saving…" : "Save Class"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Edit Dialog */}
    <Dialog
      open={isEditOpen}
      onOpenChange={guardedOpenChange(isEditPending, onEditOpenChange)}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="font-heading text-lg font-semibold">
            Edit {selectedClass?.name ?? "class"}
          </DialogTitle>
          <DialogDescription>
            Update the name and medium of instruction
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {academicYearId && selectedClass ? (
            <ClassForm
              formId="edit-class-form"
              academicYearId={academicYearId}
              initialData={selectedClass}
              onSubmit={onEditSubmit}
              isLoading={isEditPending}
            />
          ) : (
            <NoYearNotice title="Editing a class" />
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
            form="edit-class-form"
            className={SUBMIT_WIDTH}
            disabled={isEditPending}
          >
            {isEditPending ? "Saving…" : "Save Class"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/*
      Assign Teacher Dialog. A dialog rather than an inline row because the
      control is a filtered roster of a year's teaching staff plus a
      conditional reason field, and a combobox popup anchored inside a scrolling
      card grid reflows under the pointer on every card it passes.
    */}
    <Dialog
      open={isAssignTeacherOpen}
      onOpenChange={guardedOpenChange(
        isAssignTeacherPending,
        onAssignTeacherOpenChange
      )}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="font-heading text-lg font-semibold">
            Assign Homeroom Teacher
          </DialogTitle>
          <DialogDescription>
            {selectedClass
              ? `Homeroom teacher for ${selectedClass.name}. The homeroom teacher is the teacher who can enter marks for this class.`
              : "Select a teacher for the homeroom assignment"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {selectedClass && (
            <AssignTeacherForm
              formId="assign-teacher-form"
              currentTeacherId={selectedClass.homeroomTeacherId}
              academicYearId={academicYearId}
              onSubmit={onAssignTeacherSubmit}
              isLoading={isAssignTeacherPending}
            />
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onAssignTeacherOpenChange(false)}
            disabled={isAssignTeacherPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="assign-teacher-form"
            className={SUBMIT_WIDTH}
            disabled={isAssignTeacherPending}
          >
            {isAssignTeacherPending ? "Saving…" : "Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Delete Confirmation Dialog */}
    <AlertDialog
      open={isDeleteOpen}
      onOpenChange={guardedOpenChange(isDeletePending, onDeleteOpenChange)}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogTitle className="text-lg font-semibold">
          Delete {selectedClass?.name ?? "this class"}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Deleting {selectedClass?.name ?? "this class"} also removes everything
          scoped to it: its timetable slots, its students&rsquo; class
          assignments, and its homeroom history. Teachers keep their records.
          This cannot be undone.
        </AlertDialogDescription>
        <div className="flex justify-end gap-4">
          <AlertDialogCancel disabled={isDeletePending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmDelete}
            disabled={isDeletePending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeletePending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
