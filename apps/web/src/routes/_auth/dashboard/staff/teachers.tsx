import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { TeacherCsvImport } from "@/components/staff/teacher-management/teacher-csv-import";
import { TeacherDialogs } from "@/components/staff/teacher-management/teacher-dialogs";
import { TeachersList } from "@/components/staff/teacher-management/teachers-list";
import { downloadExportFile } from "@/lib/download-export";
import { orpc } from "@/utils/orpc";

type Staff = typeof staff.$inferSelect;

const RouteComponent = () => {
  const listQuery = useQuery(orpc.staff.listStaff.queryOptions());
  const createMutation = useMutation(orpc.staff.createStaff.mutationOptions());
  const updateMutation = useMutation(orpc.staff.updateStaff.mutationOptions());
  const deleteMutation = useMutation(orpc.staff.deleteStaff.mutationOptions());
  const exportTeachersMutation = useMutation(
    orpc.staff.exports.teachersExcel.mutationOptions()
  );
  const exportProfileMutation = useMutation(
    orpc.staff.exports.teacherProfilePdf.mutationOptions()
  );

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [selectedTeacher, setSelectedTeacher] = useState<Staff | null>(null);

  const teachers = (listQuery.data as Staff[] | undefined) ?? [];

  const handleCreateClick = useCallback(() => {
    setSelectedTeacher(null);
    setIsCreateDialogOpen(true);
  }, []);

  const handleEditClick = useCallback((teacher: Staff) => {
    setSelectedTeacher(teacher);
    setIsEditDialogOpen(true);
  }, []);

  const handleViewClick = useCallback((teacher: Staff) => {
    setSelectedTeacher(teacher);
    setIsViewDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((teacher: Staff) => {
    setSelectedTeacher(teacher);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleCreateSubmit = useCallback(
    async (data: unknown) => {
      await createMutation.mutateAsync(data as never);
      await listQuery.refetch();
      setIsCreateDialogOpen(false);
    },
    [createMutation, listQuery]
  );

  const handleEditSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedTeacher) {
        return;
      }

      const updateData = data as Record<string, unknown>;
      await updateMutation.mutateAsync({
        id: selectedTeacher.id,
        ...updateData,
      } as never);
      await listQuery.refetch();
      setIsEditDialogOpen(false);
      setSelectedTeacher(null);
    },
    [selectedTeacher, updateMutation, listQuery]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedTeacher) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({
        id: selectedTeacher.id,
      } as never);
      await listQuery.refetch();
      setIsDeleteDialogOpen(false);
      setSelectedTeacher(null);
      toast.success("Teacher deleted successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete teacher"
      );
    }
  }, [selectedTeacher, deleteMutation, listQuery]);

  const handleExportClick = useCallback(async () => {
    try {
      const file = await exportTeachersMutation.mutateAsync();
      downloadExportFile(file);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export teachers"
      );
    }
  }, [exportTeachersMutation]);

  const handleExportProfileClick = useCallback(async () => {
    if (!selectedTeacher) {
      return;
    }
    try {
      const file = await exportProfileMutation.mutateAsync({
        id: selectedTeacher.id,
      } as never);
      downloadExportFile(file);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export profile"
      );
    }
  }, [selectedTeacher, exportProfileMutation]);

  const handleImportCreate = useCallback(
    async (data: Record<string, unknown>) => {
      await createMutation.mutateAsync(data as never);
      await listQuery.refetch();
    },
    [createMutation, listQuery]
  );

  const handleImportUpdate = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      await updateMutation.mutateAsync({ id, ...data } as never);
      await listQuery.refetch();
    },
    [updateMutation, listQuery]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teachers</h1>
          <p className="text-muted-foreground mt-2">
            Manage teacher records, qualifications, and assignments
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TeacherCsvImport
            teachers={teachers}
            onCreate={handleImportCreate}
            onUpdate={handleImportUpdate}
          />
        </div>
      </div>

      <TeachersList
        teachers={listQuery.data as Staff[] | undefined}
        isLoading={listQuery.isLoading}
        onCreateClick={handleCreateClick}
        onEditClick={handleEditClick}
        onViewClick={handleViewClick}
        onDeleteClick={handleDeleteClick}
        onExportClick={handleExportClick}
      />

      <TeacherDialogs
        selectedTeacher={selectedTeacher}
        isCreateOpen={isCreateDialogOpen}
        onCreateOpenChange={setIsCreateDialogOpen}
        isCreatePending={createMutation.isPending}
        onCreateSubmit={handleCreateSubmit}
        isEditOpen={isEditDialogOpen}
        onEditOpenChange={setIsEditDialogOpen}
        isEditPending={updateMutation.isPending}
        onEditSubmit={handleEditSubmit}
        isViewOpen={isViewDialogOpen}
        onViewOpenChange={setIsViewDialogOpen}
        isExportProfilePending={exportProfileMutation.isPending}
        onExportProfileClick={handleExportProfileClick}
        isDeleteOpen={isDeleteDialogOpen}
        onDeleteOpenChange={setIsDeleteDialogOpen}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/dashboard/staff/teachers")({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.listStaff.queryOptions()
    );
  },
});
