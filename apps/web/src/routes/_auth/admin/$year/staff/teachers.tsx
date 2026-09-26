import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconUsersPlus } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";

import { NewTeacherNextStepsDialog } from "@/components/staff/teacher-management/new-teacher-next-steps-dialog";
import { PortTeachersDialog } from "@/components/staff/teacher-management/port-teachers-dialog";
import { TeacherCsvImport } from "@/components/staff/teacher-management/teacher-csv-import";
import { TeacherDialogs } from "@/components/staff/teacher-management/teacher-dialogs";
import { TeachersList } from "@/components/staff/teacher-management/teachers-list";
import { useTeachersPage } from "@/components/staff/teacher-management/use-teachers-page";
import { orpc } from "@/utils/orpc";

const RouteComponent = () => {
  const { year } = Route.useParams();
  const page = useTeachersPage(year);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-heading text-4xl font-semibold">Teachers</h1>
          <p className="text-muted-foreground mt-2">
            Manage teacher records, qualifications, and assignments
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => page.handlePortDialogOpenChange(true)}
            disabled={!page.selectedAcademicYear}
          >
            <IconUsersPlus data-icon="inline-start" />
            Import from Previous Year
          </Button>
          <TeacherCsvImport
            teachers={page.teachers}
            onCreate={page.handleImportCreate}
            onUpdate={page.handleImportUpdate}
          />
        </div>
      </div>

      <TeachersList
        teachers={page.listQuery.data}
        isLoading={page.listQuery.isLoading}
        isError={page.isListError}
        errorMessage={page.listErrorMessage}
        onRetry={page.handleRetryList}
        onCreateClick={page.handleCreateClick}
        onEditClick={page.handleEditClick}
        onViewClick={page.handleViewClick}
        onDeleteClick={page.handleDeleteClick}
        onManageTimetableClick={page.handleManageTimetableClick}
        onExportClick={page.handleExportClick}
        onExportSelectedClick={page.handleExportSelectedClick}
        onDeleteSelectedClick={page.handleDeleteSelected}
        isExportPending={page.isExportPending}
        isBulkDeletePending={page.isDeletePending}
      />

      <TeacherDialogs
        selectedTeacher={page.selectedTeacher}
        academicYearId={page.selectedAcademicYear?.id}
        isCreateOpen={page.isCreateDialogOpen}
        onCreateOpenChange={page.handleCreateDialogOpenChange}
        isCreatePending={page.isCreatePending}
        onCreateSubmit={page.handleCreateSubmit}
        isEditOpen={page.isEditDialogOpen}
        onEditOpenChange={page.handleEditDialogOpenChange}
        isEditPending={page.isEditPending}
        onEditSubmit={page.handleEditSubmit}
        isViewOpen={page.isViewDialogOpen}
        onViewOpenChange={page.handleViewDialogOpenChange}
        isExportProfilePending={page.isExportProfilePending}
        onExportProfileClick={page.handleExportProfileClick}
        isDeleteOpen={page.isDeleteDialogOpen}
        onDeleteOpenChange={page.handleDeleteDialogOpenChange}
        isDeletePending={page.isDeletePending}
        onConfirmDelete={page.handleConfirmDelete}
      />

      <PortTeachersDialog
        isOpen={page.isPortDialogOpen}
        onOpenChange={page.handlePortDialogOpenChange}
        academicYearId={page.selectedAcademicYear?.id}
      />

      <NewTeacherNextStepsDialog
        teacher={page.newTeacher}
        loginUsername={page.newTeacherCredentials.username}
        initialPassword={page.newTeacherCredentials.password}
        onOpenChange={(open) => {
          if (!open) {
            page.setNewTeacher(null);
            page.setNewTeacherCredentials({ username: null, password: null });
          }
        }}
        onManageTimetableClick={page.handleManageTimetableClick}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/$year/staff/teachers")({
  component: RouteComponent,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
});
