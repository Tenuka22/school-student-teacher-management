import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";

import { TeacherForm } from "@/components/staff/teacher-management/teacher-form";
import { ConfirmDialog } from "@/components/ui-patterns/confirm-dialog";

type Staff = typeof staff.$inferSelect;

/** Display labels for the stored enum values (as the form shows them). */
const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
};

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
  isDeletePending: boolean;
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
  isDeletePending,
  onConfirmDelete,
}: TeacherDialogsProps) => (
  <>
    {/* Create Dialog */}
    <Dialog open={isCreateOpen} onOpenChange={onCreateOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Add teacher</DialogTitle>
          <DialogDescription>Add a new teacher to the system</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
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
            {isCreatePending ? "Saving…" : "Add teacher"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Edit Dialog */}
    <Dialog open={isEditOpen} onOpenChange={onEditOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Edit teacher</DialogTitle>
          <DialogDescription>Update teacher information</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
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
            {isEditPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* View Dialog */}
    <Dialog open={isViewOpen} onOpenChange={onViewOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Teacher profile</DialogTitle>
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
              value={GENDER_LABELS[selectedTeacher.gender ?? ""]}
            />
            <Button
              variant="outline"
              onClick={onExportProfileClick}
              disabled={isExportProfilePending}
            >
              {isExportProfilePending ? "Exporting…" : "Export profile as PDF"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={isDeleteOpen}
      onOpenChange={onDeleteOpenChange}
      title="Delete teacher?"
      description={`${selectedTeacher?.name ?? "This teacher"} will be removed permanently. This cannot be undone.`}
      confirmLabel="Delete teacher"
      pendingLabel="Deleting…"
      isPending={isDeletePending}
      tone="destructive"
      onConfirm={onConfirmDelete}
    />
  </>
);
