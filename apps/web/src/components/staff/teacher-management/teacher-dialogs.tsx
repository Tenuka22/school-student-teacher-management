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

import { TeacherForm } from "@/components/staff/teacher-management/teacher-form";

type Staff = typeof staff.$inferSelect;

interface TeacherDialogsProps {
  selectedTeacher: Staff | null;
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  isCreatePending: boolean;
  onCreateSubmit: (data: unknown) => Promise<void>;
  isEditOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  isEditPending: boolean;
  onEditSubmit: (data: unknown) => Promise<void>;
  isViewOpen: boolean;
  onViewOpenChange: (open: boolean) => void;
  isExportProfilePending: boolean;
  onExportProfileClick: () => void;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}

const TeacherProfileField = ({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) => (
  <div>
    <p className="text-muted-foreground text-sm font-medium">{label}</p>
    <p className="text-base">{value || "—"}</p>
  </div>
);

export const TeacherDialogs = ({
  selectedTeacher,
  isCreateOpen,
  onCreateOpenChange,
  isCreatePending,
  onCreateSubmit,
  isEditOpen,
  onEditOpenChange,
  isEditPending,
  onEditSubmit,
  isViewOpen,
  onViewOpenChange,
  isExportProfilePending,
  onExportProfileClick,
  isDeleteOpen,
  onDeleteOpenChange,
  onConfirmDelete,
}: TeacherDialogsProps) => (
  <>
    {/* Create Dialog */}
    <Dialog open={isCreateOpen} onOpenChange={onCreateOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Create New Teacher</DialogTitle>
          <DialogDescription>Add a new teacher to the system</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 [color-scheme:dark]">
          <TeacherForm
            formId="create-teacher-form"
            onSubmit={onCreateSubmit}
            isLoading={isCreatePending}
            isEdit={false}
          />
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
            form="create-teacher-form"
            disabled={isCreatePending}
          >
            {isCreatePending ? "Saving..." : "Create Teacher"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Edit Dialog */}
    <Dialog open={isEditOpen} onOpenChange={onEditOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Edit Teacher</DialogTitle>
          <DialogDescription>Update teacher information</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 [color-scheme:dark]">
          {selectedTeacher && (
            <TeacherForm
              formId="edit-teacher-form"
              initialData={selectedTeacher}
              onSubmit={onEditSubmit}
              isLoading={isEditPending}
              isEdit
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
            form="edit-teacher-form"
            disabled={isEditPending}
          >
            {isEditPending ? "Saving..." : "Update Teacher"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* View Dialog */}
    <Dialog open={isViewOpen} onOpenChange={onViewOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Teacher Profile</DialogTitle>
          <DialogDescription>View teacher details</DialogDescription>
        </DialogHeader>
        {selectedTeacher && (
          <div className="space-y-4">
            <TeacherProfileField label="Name" value={selectedTeacher.name} />
            <TeacherProfileField label="Email" value={selectedTeacher.email} />
            <TeacherProfileField label="Phone" value={selectedTeacher.phone} />
            <TeacherProfileField label="NIC" value={selectedTeacher.nic} />
            <TeacherProfileField
              label="Birth Date"
              value={selectedTeacher.birthDate}
            />
            <TeacherProfileField
              label="Gender"
              value={selectedTeacher.gender}
            />
            <Button
              variant="outline"
              onClick={onExportProfileClick}
              disabled={isExportProfilePending}
            >
              {isExportProfilePending
                ? "Exporting..."
                : "Export Profile as PDF"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete Teacher</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete {selectedTeacher?.name}? This action
          cannot be undone.
        </AlertDialogDescription>
        <div className="flex justify-end gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
