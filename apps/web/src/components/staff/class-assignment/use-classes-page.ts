import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatApiErrorMessage } from "@/lib/api-error";
import { downloadExportFile } from "@/lib/download-export";
import { useActiveYear } from "@/lib/paths";
import { orpc } from "@/utils/orpc";

type Class = typeof classTable.$inferSelect;
type Staff = typeof staff.$inferSelect;

interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

export const useClassesPage = () => {
  const activeYear = useActiveYear();
  const currentYearQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );

  const currentYear = useMemo(() => {
    const years = currentYearQuery.data as unknown[] | undefined;
    if (!years) {
      return;
    }
    const typedYears = years as AcademicYear[];
    return (
      typedYears.find((item) => item.year === Number(activeYear)) ??
      typedYears.find((item) => item.isCurrent)
    );
  }, [activeYear, currentYearQuery.data]);

  const listQuery = useQuery(
    orpc.staff.listClasses.queryOptions({
      input: { academicYearId: currentYear?.id ?? "", gradeLevel: undefined },
      enabled: !!currentYear?.id,
    })
  );

  const staffQuery = useQuery(
    orpc.staff.listStaff.queryOptions({
      input: { academicYearId: currentYear?.id },
      enabled: Boolean(currentYear?.id),
    })
  );

  const createMutation = useMutation(orpc.staff.createClass.mutationOptions());
  const updateMutation = useMutation(orpc.staff.updateClass.mutationOptions());
  const assignTeacherMutation = useMutation(
    orpc.staff.assignClassTeacher.mutationOptions()
  );
  const deleteMutation = useMutation(orpc.staff.deleteClass.mutationOptions());
  const exportMutation = useMutation(
    orpc.staff.exports.classesExcel.mutationOptions()
  );
  const seedMutation = useMutation(
    orpc.staff.seedDefaultClasses.mutationOptions()
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

  const handleSeedClick = useCallback(async () => {
    if (!currentYear?.id) {
      toast.error("Select an academic year first");
      return;
    }
    try {
      const result = (await seedMutation.mutateAsync({
        academicYearId: currentYear.id,
      } as never)) as { created: number; skipped: number };
      await listQuery.refetch();
      toast.success(
        `Seeded ${result.created} classes (${result.skipped} already existed)`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to seed classes"
      );
    }
  }, [currentYear, seedMutation, listQuery]);

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

  /**
   * The failure state of the class list, and the retry that resolves it.
   *
   * `classes` defaults to `[]` for every reason a request can come back
   * without rows, so the page cannot tell "this year has no classes" from "the
   * request failed" by looking at the array. `refetch` asks the server again
   * rather than re-rendering the cached failure.
   */
  const handleRetryList = useCallback(() => {
    void listQuery.refetch();
  }, [listQuery]);

  const listErrorMessage = useMemo(
    () =>
      formatApiErrorMessage(
        listQuery.error,
        "The server did not return the class list."
      ),
    [listQuery.error]
  );

  return {
    currentYear,
    classes,
    staffList,
    isListLoading: listQuery.isLoading,
    isListError: listQuery.isError,
    listErrorMessage,
    handleRetryList,
    isCreateDialogOpen,
    setIsCreateDialogOpen,
    isEditDialogOpen,
    setIsEditDialogOpen,
    isAssignTeacherDialogOpen,
    setIsAssignTeacherDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    selectedClass,
    createMutation,
    updateMutation,
    assignTeacherMutation,
    deleteMutation,
    seedMutation,
    handleCreateClick,
    handleEditClick,
    handleAssignTeacherClick,
    handleDeleteClick,
    handleExportClick,
    handleSeedClick,
    handleCreateSubmit,
    handleEditSubmit,
    handleAssignTeacherSubmit,
    handleConfirmDelete,
    handleImportCreate,
    handleImportUpdate,
  };
};
