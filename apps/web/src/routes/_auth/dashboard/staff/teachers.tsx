import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconUsersPlus } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { NewTeacherNextStepsDialog } from "@/components/staff/teacher-management/new-teacher-next-steps-dialog";
import { PortTeachersDialog } from "@/components/staff/teacher-management/port-teachers-dialog";
import { TeacherCsvImport } from "@/components/staff/teacher-management/teacher-csv-import";
import { TeacherDialogs } from "@/components/staff/teacher-management/teacher-dialogs";
import { TeachersList } from "@/components/staff/teacher-management/teachers-list";
import { downloadExportFile } from "@/lib/download-export";
import { orpc } from "@/utils/orpc";

type Staff = typeof staff.$inferSelect;
interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

const RouteComponent = () => {
  const navigate = useNavigate();
  const listQuery = useQuery(orpc.staff.listStaff.queryOptions());
  const currentYearQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const currentYear = useMemo(() => {
    const years = currentYearQuery.data as unknown[] | undefined;
    return (
      (years?.find(
        (y) => (y as Record<string, unknown>).isCurrent === true
      ) as AcademicYear) || undefined
    );
  }, [currentYearQuery.data]);
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
  const [isPortDialogOpen, setIsPortDialogOpen] = useState(false);
  const [newTeacher, setNewTeacher] = useState<Staff | null>(null);

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

  const handleAssignSubjectsClick = useCallback(
    (teacher: Staff) => {
      navigate({
        to: "/dashboard/staff/subjects",
        search: { staffId: teacher.id },
      });
    },
    [navigate]
  );

  const handleManageTimetableClick = useCallback(
    (teacher: Staff) => {
      navigate({
        to: "/dashboard/staff/teacher-timetable",
        search: { staffId: teacher.id },
      });
    },
    [navigate]
  );

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
      const created = (await createMutation.mutateAsync(
        data as never
      )) as unknown as Staff;
      await listQuery.refetch();
      setIsCreateDialogOpen(false);
      setNewTeacher(created);
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
          <Button variant="outline" onClick={() => setIsPortDialogOpen(true)}>
            <IconUsersPlus className="mr-2 size-4" />
            Import from Previous Year
          </Button>
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
        onAssignSubjectsClick={handleAssignSubjectsClick}
        onManageTimetableClick={handleManageTimetableClick}
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

      <PortTeachersDialog
        isOpen={isPortDialogOpen}
        onOpenChange={setIsPortDialogOpen}
        academicYearId={currentYear?.id}
      />

      <NewTeacherNextStepsDialog
        teacher={newTeacher}
        onOpenChange={(open) => {
          if (!open) {
            setNewTeacher(null);
          }
        }}
        onAssignSubjectsClick={(teacher) => {
          setNewTeacher(null);
          handleAssignSubjectsClick(teacher);
        }}
        onManageTimetableClick={(teacher) => {
          setNewTeacher(null);
          handleManageTimetableClick(teacher);
        }}
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
