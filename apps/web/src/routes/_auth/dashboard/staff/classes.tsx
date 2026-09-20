import { createFileRoute } from "@tanstack/react-router";

import { ClassCsvImport } from "@/components/staff/class-assignment/class-csv-import";
import { ClassDialogs } from "@/components/staff/class-assignment/class-dialogs";
import { ClassesTabs } from "@/components/staff/class-assignment/classes-tabs";
import { useClassesPage } from "@/components/staff/class-assignment/use-classes-page";
import { orpc } from "@/utils/orpc";

const RouteComponent = () => {
  const page = useClassesPage();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">Classes</h1>
          <p className="text-muted-foreground mt-2">
            Create classes and assign homeroom teachers for the academic year
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ClassCsvImport
            academicYearId={page.currentYear?.id}
            classes={page.classes}
            onCreate={page.handleImportCreate}
            onUpdate={page.handleImportUpdate}
          />
        </div>
      </div>

      <ClassesTabs
        classes={page.classes}
        staff={page.staffList}
        isLoading={page.isListLoading}
        onCreateClick={page.handleCreateClick}
        onEditClick={page.handleEditClick}
        onAssignTeacherClick={page.handleAssignTeacherClick}
        onDeleteClick={page.handleDeleteClick}
        onExportClick={page.handleExportClick}
        onSeedClick={page.handleSeedClick}
        isSeedPending={page.seedMutation.isPending}
      />

      <ClassDialogs
        academicYearId={page.currentYear?.id}
        selectedClass={page.selectedClass}
        isCreateOpen={page.isCreateDialogOpen}
        onCreateOpenChange={(open) => page.setIsCreateDialogOpen(open)}
        isCreatePending={page.createMutation.isPending}
        onCreateSubmit={page.handleCreateSubmit}
        isEditOpen={page.isEditDialogOpen}
        onEditOpenChange={(open) => page.setIsEditDialogOpen(open)}
        isEditPending={page.updateMutation.isPending}
        onEditSubmit={page.handleEditSubmit}
        isAssignTeacherOpen={page.isAssignTeacherDialogOpen}
        onAssignTeacherOpenChange={(open) =>
          page.setIsAssignTeacherDialogOpen(open)
        }
        isAssignTeacherPending={page.assignTeacherMutation.isPending}
        onAssignTeacherSubmit={page.handleAssignTeacherSubmit}
        isDeleteOpen={page.isDeleteDialogOpen}
        onDeleteOpenChange={(open) => page.setIsDeleteDialogOpen(open)}
        isDeletePending={page.deleteMutation.isPending}
        onConfirmDelete={page.handleConfirmDelete}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/dashboard/staff/classes")({
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
