import type { StaffListItem } from "@school-student-teacher-management/api/routers/staff/list-staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatApiErrorMessage } from "@/lib/api-error";
import { downloadExportFile } from "@/lib/download-export";
import { orpc } from "@/utils/orpc";

export type TeacherReference = Pick<
  StaffListItem,
  "id" | "name" | "email" | "phone"
>;

export interface NewTeacherCredentials {
  username: string | null;
  password: string | null;
}

/**
 * Everything the Teachers page does, apart from drawing it.
 *
 * The page used to hold its queries, mutations, dialog state and eleven
 * handlers in one 300-line component, which is what the linter's size rule is
 * complaining about. The behaviour is unchanged; it just lives where it can be
 * read without scrolling past the markup to find out what a button does.
 */
export const useTeachersPage = (year: string) => {
  const navigate = useNavigate();

  const academicYearsQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const selectedAcademicYear = useMemo(
    () =>
      academicYearsQuery.data?.find(
        (academicYear) => academicYear.year === Number(year)
      ),
    [academicYearsQuery.data, year]
  );
  const listQuery = useQuery({
    ...orpc.staff.listStaff.queryOptions({
      input: { academicYearId: selectedAcademicYear?.id ?? "" },
    }),
    enabled: Boolean(selectedAcademicYear?.id),
  });
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
  const [newTeacher, setNewTeacher] = useState<TeacherReference | null>(null);
  const [newTeacherCredentials, setNewTeacherCredentials] =
    useState<NewTeacherCredentials>({ username: null, password: null });
  const [selectedTeacher, setSelectedTeacher] = useState<StaffListItem | null>(
    null
  );

  const teachers = listQuery.data ?? [];

  // Dialog visibility is owned here, so the route reads as markup. These
  // wrappers exist so the route's props read as actions rather than as raw
  // setters.
  const handleCreateDialogOpenChange = setIsCreateDialogOpen;
  const handleEditDialogOpenChange = setIsEditDialogOpen;
  const handleViewDialogOpenChange = setIsViewDialogOpen;
  const handleDeleteDialogOpenChange = setIsDeleteDialogOpen;
  const handlePortDialogOpenChange = setIsPortDialogOpen;

  const handleCreateClick = useCallback(() => {
    setSelectedTeacher(null);
    setIsCreateDialogOpen(true);
  }, []);

  const handleEditClick = useCallback((teacher: StaffListItem) => {
    setSelectedTeacher(teacher);
    setIsEditDialogOpen(true);
  }, []);

  const handleViewClick = useCallback((teacher: StaffListItem) => {
    setSelectedTeacher(teacher);
    setIsViewDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((teacher: StaffListItem) => {
    setSelectedTeacher(teacher);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleManageTimetableClick = useCallback(
    (teacher: Pick<StaffListItem, "id">) => {
      navigate({
        to: "/admin/$year/staff/teacher-timetable/$staffId",
        params: { year, staffId: teacher.id },
      });
    },
    [navigate, year]
  );

  const handleCreateSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      const created = await createMutation.mutateAsync(data as never);
      await listQuery.refetch();
      setIsCreateDialogOpen(false);
      setNewTeacher(created);
      setNewTeacherCredentials({
        username: created.loginUsername,
        password: created.initialPassword,
      });
    },
    [createMutation, listQuery]
  );

  const handleEditSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      if (!selectedTeacher) {
        return;
      }

      await updateMutation.mutateAsync({
        id: selectedTeacher.id,
        ...data,
      } as never);
      await listQuery.refetch();
      setIsEditDialogOpen(false);
      setSelectedTeacher(null);
    },
    [listQuery, selectedTeacher, updateMutation]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedTeacher) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id: selectedTeacher.id } as never);
      await listQuery.refetch();
      setIsDeleteDialogOpen(false);
      setSelectedTeacher(null);
      toast.success("Teacher deleted successfully");
    } catch (error) {
      toast.error(formatApiErrorMessage(error, "Failed to delete teacher"));
    }
  }, [deleteMutation, listQuery, selectedTeacher]);

  /**
   * Bulk delete reports both outcomes.
   *
   * The server protects a teacher who has history or a live assignment, so a
   * bulk action partly succeeds by design. Saying only "Deleted 3" would leave
   * the rest unexplained; saying only "failed" would hide what happened.
   */
  const handleDeleteSelected = useCallback(
    async (staffIds: string[]) => {
      const results = await Promise.allSettled(
        staffIds.map((id) => deleteMutation.mutateAsync({ id } as never))
      );
      const deletedIds = results.flatMap((result, index) =>
        result.status === "fulfilled" && staffIds[index]
          ? [staffIds[index]]
          : []
      );
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : []
      );

      await listQuery.refetch();

      if (deletedIds.length > 0) {
        toast.success(
          `Deleted ${deletedIds.length} teacher${deletedIds.length === 1 ? "" : "s"}`
        );
      }

      if (failures.length > 0) {
        const [firstFailure] = failures;
        const message =
          firstFailure instanceof Error
            ? firstFailure.message
            : "The server rejected a destructive-delete guard";
        toast.error(
          `${failures.length} teacher${failures.length === 1 ? " was" : "s were"} protected: ${message}`
        );
      }

      return deletedIds;
    },
    [deleteMutation, listQuery]
  );

  const handleExportClick = useCallback(async () => {
    try {
      // Scoped to the year whose roster is on screen, so the file and the list
      // describe the same people.
      const file = await exportTeachersMutation.mutateAsync({
        academicYearId: selectedAcademicYear?.id,
      } as never);
      downloadExportFile(file);
    } catch (error) {
      toast.error(formatApiErrorMessage(error, "Failed to export teachers"));
    }
  }, [exportTeachersMutation, selectedAcademicYear]);

  const handleExportSelectedClick = useCallback(
    async (staffIds: string[]) => {
      if (staffIds.length === 0) {
        return;
      }
      try {
        const file = await exportTeachersMutation.mutateAsync({
          ids: staffIds,
        } as never);
        downloadExportFile(file);
      } catch (error) {
        toast.error(
          formatApiErrorMessage(error, "Failed to export selected teachers")
        );
      }
    },
    [exportTeachersMutation]
  );

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
      toast.error(formatApiErrorMessage(error, "Failed to export profile"));
    }
  }, [exportProfileMutation, selectedTeacher]);

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
    [listQuery, updateMutation]
  );

  return {
    teachers,
    listQuery,
    selectedAcademicYear,
    isCreateDialogOpen,
    handleCreateDialogOpenChange,
    isEditDialogOpen,
    handleEditDialogOpenChange,
    isViewDialogOpen,
    handleViewDialogOpenChange,
    isDeleteDialogOpen,
    handleDeleteDialogOpenChange,
    isPortDialogOpen,
    handlePortDialogOpenChange,
    newTeacher,
    newTeacherCredentials,
    setNewTeacher,
    setNewTeacherCredentials,
    selectedTeacher,
    setSelectedTeacher,
    isCreatePending: createMutation.isPending,
    isEditPending: updateMutation.isPending,
    isDeletePending: deleteMutation.isPending,
    isExportPending: exportTeachersMutation.isPending,
    isExportProfilePending: exportProfileMutation.isPending,
    handleCreateClick,
    handleEditClick,
    handleViewClick,
    handleDeleteClick,
    handleManageTimetableClick,
    handleCreateSubmit,
    handleEditSubmit,
    handleConfirmDelete,
    handleDeleteSelected,
    handleExportClick,
    handleExportSelectedClick,
    handleExportProfileClick,
    handleImportCreate,
    handleImportUpdate,
  };
};
