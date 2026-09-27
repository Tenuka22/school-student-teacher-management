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
} from "@school-student-teacher-management/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { IconFileExport } from "@tabler/icons-react";

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
    <p className="text-base break-words">{value || "—"}</p>
  </div>
);

/**
 * `null` is "not recorded", and it says so.
 *
 * This used to fall through to `"Teacher"`, so an office clerk who had never
 * touched the field saw a staff *category* asserted on a record that has none —
 * and a category is exactly the field that decides whether a person appears on
 * a teaching roster. The dash is the same one the rest of the dialog uses for a
 * value the server did not send.
 */
const getCategoryLabel = (category: StaffListItem["staffCategory"]) => {
  if (category === "teacher") {
    return "Teacher";
  }
  if (category === "officeStaff") {
    return "Office Staff";
  }
  return null;
};

const getAppointmentLabel = (
  appointmentType: StaffListItem["appointmentType"]
) => (appointmentType ? APPOINTMENT_TYPES[appointmentType]?.label : null);

const getEmploymentStatusLabel = (
  employmentStatus: StaffListItem["employmentStatus"]
) => (employmentStatus ? EMPLOYMENT_STATUSES[employmentStatus]?.label : null);

/**
 * The two document attachments the `staff` row really carries.
 *
 * `portraitFileId` and `nationalIdentityCardFileId` are columns on the same row
 * this dialog is already reading, so whether a teacher's NIC document has been
 * filed is a fact the server can answer — and it is the one part of "employment
 * verification" that is actually a property of the record. It is deliberately
 * the same two words the qualifications list uses for its attachment, so the
 * same question gets the same answer everywhere in this feature.
 *
 * It is not the same thing as the *appointment* document. `APPOINTMENT_TYPES`
 * carries a `requiresDocument` key naming one, but nothing in the schema stores
 * it, so this dialog does not claim anything about it.
 */
const TeacherDocuments = ({ teacher }: { teacher: StaffListItem }) => (
  <>
    <TeacherProfileField
      label="NIC document"
      value={teacher.nationalIdentityCardFileId ? "Attached" : "Not attached"}
    />
    <TeacherProfileField
      label="Portrait"
      value={teacher.portraitFileId ? "Attached" : "Not attached"}
    />
  </>
);

const TeacherFormDialog = ({
  mode,
  open,
  onOpenChange,
  isPending,
  selectedTeacher,
  onSubmit,
}: TeacherFormDialogProps) => {
  const isEdit = mode === "edit";
  const title = isEdit ? "Edit teacher" : "Create new teacher";
  const description = isEdit
    ? "Update personal and employment information"
    : "Add employment and account information";
  const formId = `${mode}-teacher-form`;
  const submitLabel = mode === "create" ? "Create teacher" : "Update teacher";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {/*
          `aria-busy` on the scrolling body rather than on the whole popup: the
          header and the footer stay interactive (Cancel is disabled, but the
          close button is not) and a busy popup tells a screen reader the title
          is unstable too. What is genuinely in flux is the form.
        */}
        <div className="flex-1 overflow-y-auto px-6 py-4" aria-busy={isPending}>
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
          {/*
            `min-w-32` and not a width swap. "Create teacher" is the longest
            label this button ever shows and "Saving…" is the shortest, so
            without a floor the footer reflows sideways at the exact moment the
            reader is watching to see whether their click registered.
          */}
          <Button
            type="submit"
            form={formId}
            disabled={isPending}
            className="min-w-32"
          >
            {isPending ? "Saving…" : submitLabel}
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
    <p className="text-muted-foreground text-sm font-medium">Account state</p>
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
        <DialogTitle>{teacher?.name ?? "Teacher profile"}</DialogTitle>
        <DialogDescription>
          Employment, account, qualification, and position summary
        </DialogDescription>
      </DialogHeader>
      {teacher && (
        <div className="flex flex-col gap-4">
          {/*
            Every section below is a real `<h3>`, and so is every section in the
            three child components this dialog hosts.

            `CardTitle` is a `div`, so the profile was a dialog title followed by
            sixteen untitled cards: a screen-reader user had one heading to jump
            to and no way to tell "Personal information" from "Linked account"
            without reading all of it. The dialog's own title is the second-level
            heading, so its sections are third-level ones and the outline has no
            skipped level. The same classes `CardTitle` applies are kept, so the
            page looks exactly as it did.
          */}
          <Card size="sm">
            <CardHeader>
              <h3 className="font-heading text-sm font-medium">
                Personal information
              </h3>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <TeacherProfileField label="Email" value={teacher.email} />
              <TeacherProfileField label="Phone" value={teacher.phone} />
              <TeacherProfileField label="NIC" value={teacher.nic} />
              <TeacherProfileField
                label="Birth date"
                value={teacher.birthDate}
              />
              <TeacherProfileField label="Gender" value={teacher.gender} />
              <TeacherProfileField
                label="Staff category"
                value={getCategoryLabel(teacher.staffCategory)}
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <h3 className="font-heading text-sm font-medium">Employment</h3>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <TeacherProfileField
                label="Appointment type"
                value={getAppointmentLabel(teacher.appointmentType)}
              />
              <TeacherProfileField
                label="Appointment date"
                value={teacher.appointmentDate}
              />
              <TeacherProfileField
                label="Employment status"
                value={getEmploymentStatusLabel(teacher.employmentStatus)}
              />
              <TeacherProfileField
                label="Teacher service number"
                value={teacher.teacherServiceNo}
              />
              <TeacherDocuments teacher={teacher} />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <h3 className="font-heading text-sm font-medium">
                Linked account
              </h3>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/*
                The role/position distinction, stated on the screen that shows
                both.

                A staff record's **role** is what the sign-in is allowed to do —
                `teacher`, `admin`, `principal`, `vicePrincipal` — and it is set
                by the linked account. A **position** is this year's appointment
                (Sectional Head, and so on) and lives in the Positions section
                below, scoped to one academic year. They are different facts
                about a different pair of tables, and a reader who saw only
                "vicePrincipal" under a heading called "Position" would conclude
                the teacher is a deputy principal for 2026 and every year after.
              */}
              <p className="text-muted-foreground text-xs">
                The account role below is what this sign-in is allowed to do.
                Positions further down are this year&rsquo;s appointments and
                change with the year; the two are recorded separately.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <TeacherProfileField
                  label="Username"
                  value={
                    teacher.linkedUser?.displayUsername ??
                    teacher.linkedUser?.username
                  }
                />
                <TeacherProfileField
                  label="Account role"
                  value={teacher.linkedUser?.role}
                />
              </div>
              {teacher.linkedUser ? (
                <TeacherAccountState
                  user={teacher.linkedUser}
                  accounts={teacher.linkedAccounts}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  This staff record has no login account. Office staff accounts
                  are issued by an administrator, who creates the record and
                  hands the login over.
                </p>
              )}
            </CardContent>
          </Card>

          <TeacherQualifications staffId={teacher.id} headingLevel={3} />

          {academicYearId && (
            <TeacherPositions
              staffId={teacher.id}
              academicYearId={academicYearId}
              headingLevel={3}
            />
          )}

          {academicYearId && (
            <TeacherSubjectAssignments
              staffId={teacher.id}
              academicYearId={academicYearId}
              headingLevel={3}
            />
          )}

          <Button
            variant="outline"
            onClick={onExportProfileClick}
            disabled={isExportPending}
            className="self-start"
          >
            <IconFileExport data-icon="inline-start" />
            {isExportPending ? "Exporting…" : "Export profile as PDF"}
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
      <AlertDialogTitle>
        Delete {teacher?.name ?? "this teacher"}
      </AlertDialogTitle>
      <AlertDialogDescription>
        Teachers with history or current assignments are protected by the server
        and must be marked terminated instead. If the delete is refused, this
        dialog stays open and the reason is shown as a toast.
      </AlertDialogDescription>
      {/*
        Cancel is disabled while the write is in flight. It used to stay live,
        so `Esc` or a click dismissed the popup with the request still running
        and the reader's only record of the outcome was a toast over a list that
        had moved underneath them.
      */}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isPending ? "Deleting…" : "Delete teacher"}
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
