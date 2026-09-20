import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ClassCsvImport } from "@/components/staff/class-assignment/class-csv-import";
import { ClassDialogs } from "@/components/staff/class-assignment/class-dialogs";
import { ClassesList } from "@/components/staff/class-assignment/classes-list";
import { downloadExportFile } from "@/lib/download-export";
import { orpc } from "@/utils/orpc";

type Class = typeof classTable.$inferSelect;
type Staff = typeof staff.$inferSelect;

interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

const RouteComponent = () => {
  const currentYearQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );

  const currentYear = useMemo(() => {
    const years = currentYearQuery.data as unknown[] | undefined;
    if (!years) {
      return;
    }
    return (
      (years.find(
        (y) => (y as Record<string, unknown>).isCurrent === true
      ) as AcademicYear) || undefined
    );
  }, [currentYearQuery.data]);

  const listQuery = useQuery(
    orpc.staff.listClasses.queryOptions({
      input: { academicYearId: currentYear?.id ?? "", gradeLevel: undefined },
      enabled: !!currentYear?.id,
    })
  );

  const staffQuery = useQuery(orpc.staff.listStaff.queryOptions());

  const createMutation = useMutation(orpc.staff.createClass.mutationOptions());
  const updateMutation = useMutation(orpc.staff.updateClass.mutationOptions());
  const assignTeacherMutation = useMutation(
    orpc.staff.assignClassTeacher.mutationOptions()
  );
  const deleteMutation = useMutation(orpc.staff.deleteClass.mutationOptions());
  const exportMutation = useMutation(
    orpc.staff.exports.classesExcel.mutationOptions()
  );

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAssignTeacherDialogOpen, setIsAssignTeacherDialogOpen] =
    useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [selectedClass, setSelectedClass] = useState<Class | null>(null);

  const handleCreateClick = useCallback(() => {
    setSelectedClass(null);
    setIsCreateDialogOpen(true);
  }, []);

  const handleEditClick = useCallback((cls: Class) => {
    setSelectedClass(cls);
    setIsEditDialogOpen(true);
  }, []);

  const handleAssignTeacherClick = useCallback((cls: Class) => {
    setSelectedClass(cls);
    setIsAssignTeacherDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((cls: Class) => {
    setSelectedClass(cls);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleExportClick = useCallback(async () => {
    if (!currentYear?.id) {
      return;
    }
    try {
      const file = await exportMutation.mutateAsync({
        academicYearId: currentYear.id,
      } as never);
      downloadExportFile(file);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export classes"
      );
    }
  }, [currentYear, exportMutation]);

  const handleCreateSubmit = useCallback(
    async (data: unknown) => {
      try {
        await createMutation.mutateAsync(data as never);
        setIsCreateDialogOpen(false);
        await listQuery.refetch();
        toast.success("Class created successfully");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to create class"
        );
      }
    },
    [createMutation, listQuery]
  );

  const handleEditSubmit = useCallback(
    async (data: unknown) => {
      try {
        if (!selectedClass) {
          return;
        }
        await updateMutation.mutateAsync({
          id: selectedClass.id,
          ...(data as Record<string, unknown>),
        } as never);
        setIsEditDialogOpen(false);
        await listQuery.refetch();
        toast.success("Class updated successfully");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update class"
        );
      }
    },
    [selectedClass, updateMutation, listQuery]
  );

  const handleAssignTeacherSubmit = useCallback(
    async (data: unknown) => {
      try {
        if (!selectedClass) {
          return;
        }
        await assignTeacherMutation.mutateAsync({
          classId: selectedClass.id,
          ...(data as Record<string, unknown>),
        } as never);
        setIsAssignTeacherDialogOpen(false);
        await listQuery.refetch();
        toast.success("Teacher assigned successfully");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to assign teacher"
        );
      }
    },
    [selectedClass, assignTeacherMutation, listQuery]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedClass) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id: selectedClass.id } as never);
      setIsDeleteDialogOpen(false);
      setSelectedClass(null);
      await listQuery.refetch();
      toast.success("Class deleted successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete class"
      );
    }
  }, [selectedClass, deleteMutation, listQuery]);

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

  const classes = useMemo(() => {
    const data = listQuery.data as unknown[] | undefined;
    if (!data) {
      return [];
    }
    return data as Class[];
  }, [listQuery.data]);

  const staffList = useMemo(
    () => (staffQuery.data || []) as unknown as Staff[],
    [staffQuery.data]
  );

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
            academicYearId={currentYear?.id}
            classes={classes}
            onCreate={handleImportCreate}
            onUpdate={handleImportUpdate}
          />
        </div>
      </div>

      <ClassesList
        classes={classes}
        staff={staffList}
        isLoading={listQuery.isLoading}
        onCreateClick={handleCreateClick}
        onEditClick={handleEditClick}
        onAssignTeacherClick={handleAssignTeacherClick}
        onDeleteClick={handleDeleteClick}
        onExportClick={handleExportClick}
      />

      <ClassDialogs
        academicYearId={currentYear?.id}
        staff={staffList}
        selectedClass={selectedClass}
        isCreateOpen={isCreateDialogOpen}
        onCreateOpenChange={setIsCreateDialogOpen}
        isCreatePending={createMutation.isPending}
        onCreateSubmit={handleCreateSubmit}
        isEditOpen={isEditDialogOpen}
        onEditOpenChange={setIsEditDialogOpen}
        isEditPending={updateMutation.isPending}
        onEditSubmit={handleEditSubmit}
        isAssignTeacherOpen={isAssignTeacherDialogOpen}
        onAssignTeacherOpenChange={setIsAssignTeacherDialogOpen}
        isAssignTeacherPending={assignTeacherMutation.isPending}
        onAssignTeacherSubmit={handleAssignTeacherSubmit}
        isDeleteOpen={isDeleteDialogOpen}
        onDeleteOpenChange={setIsDeleteDialogOpen}
        isDeletePending={deleteMutation.isPending}
        onConfirmDelete={handleConfirmDelete}
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
