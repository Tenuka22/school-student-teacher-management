import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
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
import { ConfirmDialog } from "@/components/ui-patterns/confirm-dialog";

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
    <Dialog open={isCreateOpen} onOpenChange={onCreateOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Add class</DialogTitle>
          <DialogDescription>
            Add a new class to the academic year
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {academicYearId && (
            <ClassForm
              formId="create-class-form"
              academicYearId={academicYearId}
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
            form="create-class-form"
            disabled={isCreatePending}
          >
            {isCreatePending ? "Saving…" : "Save class"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Edit Dialog */}
    <Dialog open={isEditOpen} onOpenChange={onEditOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Edit class</DialogTitle>
          <DialogDescription>Update class details</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {academicYearId && selectedClass && (
            <ClassForm
              formId="edit-class-form"
              academicYearId={academicYearId}
              initialData={selectedClass}
              onSubmit={onEditSubmit}
              isLoading={isEditPending}
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
          <Button type="submit" form="edit-class-form" disabled={isEditPending}>
            {isEditPending ? "Saving…" : "Save class"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Assign Teacher Dialog */}
    <Dialog open={isAssignTeacherOpen} onOpenChange={onAssignTeacherOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Assign homeroom teacher</DialogTitle>
          <DialogDescription>
            Select a teacher for the homeroom assignment
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {selectedClass && (
            <AssignTeacherForm
              formId="assign-teacher-form"
              currentTeacherId={selectedClass.homeroomTeacherId}
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
            disabled={isAssignTeacherPending}
          >
            {isAssignTeacherPending ? "Saving…" : "Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={isDeleteOpen}
      onOpenChange={onDeleteOpenChange}
      title="Delete class?"
      description="This class will be removed permanently. This cannot be undone."
      confirmLabel="Delete class"
      pendingLabel="Deleting…"
      isPending={isDeletePending}
      tone="destructive"
      onConfirm={onConfirmDelete}
    />
  </>
);
