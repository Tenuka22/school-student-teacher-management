import type { StaffListItem } from "@school-student-teacher-management/api/routers/staff/list-staff";
import {
  APPOINTMENT_TYPES,
  EMPLOYMENT_STATUSES,
} from "@school-student-teacher-management/db/constants/teachers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";

import { TeacherForm } from "@/components/staff/teacher-management/teacher-form";
import { TeacherPositions } from "@/components/staff/teacher-management/teacher-positions";
import { TeacherQualifications } from "@/components/staff/teacher-management/teacher-qualifications";
import { TeacherSubjectAssignments } from "@/components/staff/teacher-management/teacher-subject-assignments";

interface TeacherDialogsProps {
  selectedTeacher: StaffListItem | null;
  academicYearId?: string;
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  isCreatePending: boolean;
  onCreateSubmit: (data: Record<string, unknown>) => Promise<void>;
  isEditOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  isEditPending: boolean;
  onEditSubmit: (data: Record<string, unknown>) => Promise<void>;
  isViewOpen: boolean;
  onViewOpenChange: (open: boolean) => void;
  isExportProfilePending: boolean;
  onExportProfileClick: () => void;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  isDeletePending: boolean;
  onConfirmDelete: () => void;
}

interface TeacherFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  selectedTeacher: StaffListItem | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
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

const getCategoryLabel = (category: StaffListItem["staffCategory"]) =>
  category === "officeStaff" ? "Office Staff" : "Teacher";

const getAppointmentLabel = (
  appointmentType: StaffListItem["appointmentType"]
) => (appointmentType ? APPOINTMENT_TYPES[appointmentType]?.label : null);

const getEmploymentStatusLabel = (
  employmentStatus: StaffListItem["employmentStatus"]
) => (employmentStatus ? EMPLOYMENT_STATUSES[employmentStatus]?.label : null);

const TeacherFormDialog = ({
  mode,
  open,
  onOpenChange,
  isPending,
  selectedTeacher,
  onSubmit,
}: TeacherFormDialogProps) => {
  const isEdit = mode === "edit";
  const title = isEdit ? "Edit Teacher" : "Create New Teacher";
  const description = isEdit
    ? "Update personal and employment information"
    : "Add employment and account information";
  const formId = `${mode}-teacher-form`;
  const submitLabel = mode === "create" ? "Create Teacher" : "Update Teacher";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isEdit && selectedTeacher ? (
            <TeacherForm
              key={selectedTeacher.id}
              formId={formId}
              initialData={selectedTeacher}
              onSubmit={onSubmit}
              isLoading={isPending}
              isEdit
            />
          ) : (
            !isEdit && (
              <TeacherForm
                formId={formId}
                onSubmit={onSubmit}
                isLoading={isPending}
              />
            )
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TeacherAccountState = ({
  user,
  accounts,
}: {
  user: StaffListItem["linkedUser"];
  accounts: StaffListItem["linkedAccounts"];
}) => (
  <div>
    <p className="text-muted-foreground text-sm font-medium">Account State</p>
    <div className="mt-1 flex flex-wrap gap-2">
      <Badge variant={user ? "default" : "outline"}>
        {user ? "Linked" : "Not linked"}
      </Badge>
      {user && (
        <Badge variant={user.emailVerified ? "default" : "secondary"}>
          {user.emailVerified ? "Email verified" : "Email unverified"}
        </Badge>
      )}
      {user && (
        <Badge variant={user.banned ? "destructive" : "outline"}>
          {user.banned ? "Banned" : "Active"}
        </Badge>
      )}
      {user && (
        <Badge variant="outline">
          {accounts.some((linkedAccount) => linkedAccount.hasPasswordCredential)
            ? "Password enabled"
            : "No password credential"}
        </Badge>
      )}
    </div>
  </div>
);

const TeacherProfileDialog = ({
  teacher,
  academicYearId,
  isOpen,
  onOpenChange,
  isExportPending,
  onExportProfileClick,
}: {
  teacher: StaffListItem | null;
  academicYearId?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isExportPending: boolean;
  onExportProfileClick: () => void;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{teacher?.name ?? "Teacher Profile"}</DialogTitle>
        <DialogDescription>
          Employment, account, qualification, and position summary
        </DialogDescription>
      </DialogHeader>
      {teacher && (
        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <TeacherProfileField label="Email" value={teacher.email} />
              <TeacherProfileField label="Phone" value={teacher.phone} />
              <TeacherProfileField label="NIC" value={teacher.nic} />
              <TeacherProfileField
                label="Birth Date"
                value={teacher.birthDate}
              />
              <TeacherProfileField label="Gender" value={teacher.gender} />
              <TeacherProfileField
                label="Staff Category"
                value={getCategoryLabel(teacher.staffCategory)}
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Employment</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <TeacherProfileField
                label="Appointment Type"
                value={getAppointmentLabel(teacher.appointmentType)}
              />
              <TeacherProfileField
                label="Appointment Date"
                value={teacher.appointmentDate}
              />
              <TeacherProfileField
                label="Employment Status"
                value={getEmploymentStatusLabel(teacher.employmentStatus)}
              />
              <TeacherProfileField
                label="Teacher Service Number"
                value={teacher.teacherServiceNo}
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Linked Account</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <TeacherProfileField
                label="Username"
                value={
                  teacher.linkedUser?.displayUsername ??
                  teacher.linkedUser?.username
                }
              />
              <TeacherProfileField
                label="Role"
                value={teacher.linkedUser?.role}
              />
              <TeacherAccountState
                user={teacher.linkedUser}
                accounts={teacher.linkedAccounts}
              />
            </CardContent>
          </Card>

          <TeacherQualifications staffId={teacher.id} />

          {academicYearId && (
            <TeacherPositions
              staffId={teacher.id}
              academicYearId={academicYearId}
            />
          )}

          {academicYearId && (
            <TeacherSubjectAssignments
              staffId={teacher.id}
              academicYearId={academicYearId}
            />
          )}

          <Button
            variant="outline"
            onClick={onExportProfileClick}
            disabled={isExportPending}
          >
            {isExportPending ? "Exporting..." : "Export Profile as PDF"}
          </Button>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

const TeacherDeleteDialog = ({
  teacher,
  isOpen,
  onOpenChange,
  isPending,
  onConfirm,
}: {
  teacher: StaffListItem | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onConfirm: () => void;
}) => (
  <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogTitle>Delete Teacher</AlertDialogTitle>
      <AlertDialogDescription>
        Delete {teacher?.name}? Teachers with history or current assignments are
        protected by the server and must be marked terminated instead.
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isPending ? "Deleting..." : "Delete"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const TeacherDialogs = ({
  selectedTeacher,
  academicYearId,
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
    <TeacherFormDialog
      mode="create"
      open={isCreateOpen}
      onOpenChange={onCreateOpenChange}
      isPending={isCreatePending}
      selectedTeacher={selectedTeacher}
      onSubmit={onCreateSubmit}
    />
    <TeacherFormDialog
      mode="edit"
      open={isEditOpen}
      onOpenChange={onEditOpenChange}
      isPending={isEditPending}
      selectedTeacher={selectedTeacher}
      onSubmit={onEditSubmit}
    />
    <TeacherProfileDialog
      teacher={selectedTeacher}
      academicYearId={academicYearId}
      isOpen={isViewOpen}
      onOpenChange={onViewOpenChange}
      isExportPending={isExportProfilePending}
      onExportProfileClick={onExportProfileClick}
    />
    <TeacherDeleteDialog
      teacher={selectedTeacher}
      isOpen={isDeleteOpen}
      onOpenChange={onDeleteOpenChange}
      isPending={isDeletePending}
      onConfirm={onConfirmDelete}
    />
  </>
);
