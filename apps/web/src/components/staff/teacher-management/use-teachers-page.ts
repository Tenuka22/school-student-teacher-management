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

  /**
   * Create, and get out of the way.
   *
   * **The roster refetch is no longer awaited between the write and the
   * dialog.** It used to be: `mutateAsync` → `await listQuery.refetch()` →
   * `setIsCreateDialogOpen(false)` → `setNewTeacher(created)`. So the "Saving…"
   * button stayed up for the length of a second round trip *after* the record
   * existed, and — the real defect — a refetch that failed took the whole
   * handler down, so a successful create was reported to the reader as
   * "Failed to create teacher" by the form's own `catch`, with a real teacher
   * now on the server and an issued password nobody was ever shown.
   *
   * The order is now write → close → show the credentials → refetch in the
   * background. The list has its own error state with its own retry, so a
   * failed refetch is visible there instead of being laundered into a toast
   * about the create.
   */
  const handleCreateSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      const created = await createMutation.mutateAsync(data as never);
      setIsCreateDialogOpen(false);
      setNewTeacher(created);
      setNewTeacherCredentials({
        username: created.loginUsername,
        password: created.initialPassword,
      });
      void listQuery.refetch();
    },
    [createMutation, listQuery]
  );

  /** The same ordering as the create: the write decides, the refetch follows. */
  const handleEditSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      if (!selectedTeacher) {
        return;
      }

      await updateMutation.mutateAsync({
        id: selectedTeacher.id,
        ...data,
      } as never);
      setIsEditDialogOpen(false);
      setSelectedTeacher(null);
      void listQuery.refetch();
    },
    [listQuery, selectedTeacher, updateMutation]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedTeacher) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id: selectedTeacher.id } as never);
      setIsDeleteDialogOpen(false);
      setSelectedTeacher(null);
      toast.success("Teacher deleted successfully");
      void listQuery.refetch();
    } catch (error) {
      /*
       * The dialog is closed *after* the write succeeds, not after the refetch,
       * and for the same reason the create is: a refusal leaves the dialog open
       * over the roster so the reader can mark the teacher terminated instead,
       * and a failed refetch never becomes a toast about the delete.
       */
      toast.error(formatApiErrorMessage(error, "Failed to delete teacher"));
    }
  }, [deleteMutation, listQuery, selectedTeacher]);

  /**
   * Bulk delete reports both outcomes.
   *
   * The server protects a teacher who has history or a live assignment, so a
   * bulk action partly succeeds by design. Saying only "Deleted 3" would leave
   * the rest unexplained; saying only "failed" would hide what happened. The
   * caller's own dialog stays open unless at least one record was deleted, so
   * the selection behind this is still there for a retry.
   *
   * `Promise.allSettled` over one shared mutation is deliberate — the deletes are
   * independent and one refusal must not cancel the rest — and it is also why
   * `isDeletePending` cannot be trusted as "the batch is running". The list owns
   * its own in-flight flag for that.
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

      void listQuery.refetch();

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

      if (deletedIds.length === 0 && failures.length === 0) {
        toast.error("The bulk delete did nothing. Try again.");
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

  /**
   * One CSV row, written.
   *
   * The importer calls these one row at a time and attributes a refusal to the
   * row in front of it, so both of these must **throw** on a server refusal and
   * must not swallow one. The refetch is fire-and-forget for the same reason as
   * everywhere else on this page: a failed roster read is the list's own error
   * state, and folding it into a row's failure would blame the row for the
   * network.
   */
  const handleImportCreate = useCallback(
    async (data: Record<string, unknown>) => {
      await createMutation.mutateAsync(data as never);
      void listQuery.refetch();
    },
    [createMutation, listQuery]
  );

  const handleImportUpdate = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      await updateMutation.mutateAsync({ id, ...data } as never);
      void listQuery.refetch();
    },
    [updateMutation, listQuery]
  );

  /**
   * Re-read the roster, and the sentence to show when it could not be read.
   *
   * The error state is part of the page's state, not an accident of it: a
   * request that failed knows nothing about the roster, and the empty state's
   * "No teachers yet" is a claim about the College. `refetch` is the honest
   * retry — it asks the server again rather than re-rendering the cached
   * failure.
   */
  const handleRetryList = useCallback(() => {
    void listQuery.refetch();
  }, [listQuery]);

  const listErrorMessage = useMemo(
    () =>
      formatApiErrorMessage(
        listQuery.error,
        "The server did not return the teacher roster."
      ),
    [listQuery.error]
  );

  return {
    teachers,
    listQuery,
    isListError: listQuery.isError,
    listErrorMessage,
    handleRetryList,
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
