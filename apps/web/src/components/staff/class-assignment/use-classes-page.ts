import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** How long to wait for a bulk import to finish before asking for the list. */
const IMPORT_REFRESH_DEBOUNCE_MS = 400;

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

  /**
   * A year in the address bar that no row matches is not an empty year.
   *
   * `listClasses` is disabled until a year resolves, so every reason the year
   * can be missing — the year list is still loading, the year list failed, the
   * year does not exist — arrives at the page as `classes === []` with the
   * query neither loading nor errored. Rendering the taught empty state there
   * tells an administrator to seed a class structure for a year the system
   * never found, which is a wrong instruction about the College, not a missing
   * label. Each of the three is resolved to its own message instead.
   */
  const isYearPending = currentYearQuery.isPending;
  const isYearError = currentYearQuery.isError;
  const isYearMissing = currentYearQuery.isSuccess && !currentYear;

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

  /**
   * The roster behind every class card, and the only thing standing between a
   * card and a made-up teacher name. It has no screen of its own, so a failure
   * here is announced once rather than left to be discovered: without it, every
   * card in the year silently drops its homeroom teacher.
   */
  const hasAnnouncedStaffError = useRef(false);
  useEffect(() => {
    if (staffQuery.isError && !hasAnnouncedStaffError.current) {
      hasAnnouncedStaffError.current = true;
      toast.error(
        formatApiErrorMessage(
          staffQuery.error,
          "The staff list could not be loaded, so homeroom teacher names are unavailable on this screen."
        )
      );
    }
    if (staffQuery.isSuccess) {
      hasAnnouncedStaffError.current = false;
    }
  }, [staffQuery.error, staffQuery.isError, staffQuery.isSuccess]);

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

  /**
   * One list refresh per import, not one per row.
   *
   * A CSV import calls `handleImportCreate` once for every new class. Each of
   * those awaited its own `refetch()`, so a sixty-row import paid sixty extra
   * round trips after the sixty writes — and each refetch re-rendered the grid
   * the user was about to be shown a summary of. The single-row mutations keep
   * their immediate, awaited refetch, because there the wait is the point.
   */
  const importRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleListRefresh = useCallback(() => {
    if (importRefreshTimer.current) {
      clearTimeout(importRefreshTimer.current);
    }
    importRefreshTimer.current = setTimeout(() => {
      importRefreshTimer.current = null;
      void listQuery.refetch();
    }, IMPORT_REFRESH_DEBOUNCE_MS);
  }, [listQuery]);

  useEffect(
    () => () => {
      if (importRefreshTimer.current) {
        clearTimeout(importRefreshTimer.current);
      }
    },
    []
  );

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
      toast.error("Select an academic year before exporting classes");
      return;
    }
    try {
      const file = await exportMutation.mutateAsync({
        academicYearId: currentYear.id,
      } as never);
      downloadExportFile(file);
    } catch (error) {
      toast.error(
        formatApiErrorMessage(error, "The class export could not be built.")
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
        result.created > 0
          ? `Seeded ${result.created} ${result.created === 1 ? "class" : "classes"} (${result.skipped} already existed)`
          : `Nothing to seed — all ${result.skipped} sections already existed`
      );
    } catch (error) {
      toast.error(
        formatApiErrorMessage(error, "The class structure could not be seeded.")
      );
    }
  }, [currentYear, seedMutation, listQuery]);

  /**
   * The three form-driven mutations rethrow instead of toasting.
   *
   * They used to catch, toast and swallow, which meant the form that called
   * them could not tell a success from a refusal: a class name that already
   * exists in the grade produced a toast and a dialog that closed over an
   * unsaved edit, with the reason nowhere near the field. Now the reason is
   * rethrown to the form, which puts it on the field that caused it. The
   * mutations with no form in front of them — seed, export, delete — still
   * toast, because for those the toast *is* the only place the result can go.
   */
  const handleCreateSubmit = useCallback(
    async (data: unknown) => {
      await createMutation.mutateAsync(data as never);
      setIsCreateDialogOpen(false);
      setSelectedClass(null);
      await listQuery.refetch();
      toast.success("Class created");
    },
    [createMutation, listQuery]
  );

  const handleEditSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedClass) {
        return;
      }
      await updateMutation.mutateAsync({
        id: selectedClass.id,
        ...(data as Record<string, unknown>),
      } as never);
      setIsEditDialogOpen(false);
      await listQuery.refetch();
      toast.success(`Class ${selectedClass.name} updated`);
    },
    [selectedClass, updateMutation, listQuery]
  );

  const handleAssignTeacherSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedClass) {
        return;
      }
      await assignTeacherMutation.mutateAsync({
        classId: selectedClass.id,
        ...(data as Record<string, unknown>),
      } as never);
      setIsAssignTeacherDialogOpen(false);
      await listQuery.refetch();
      toast.success(`Homeroom teacher for ${selectedClass.name} updated`);
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
      toast.success(`Class ${selectedClass.name} deleted`);
    } catch (error) {
      toast.error(
        formatApiErrorMessage(
          error,
          `${selectedClass.name} could not be deleted.`
        )
      );
    }
  }, [selectedClass, deleteMutation, listQuery]);

  /**
   * A CSV row that names a homeroom teacher has to be two writes.
   *
   * `createClass` stops at `medium` — its input schema does not carry
   * `homeroomTeacherId` at all — so a homeroom teacher in a new row used to be
   * dropped in silence, and the class arrived with nobody in charge while the
   * file said otherwise. Creating first and then calling `assignClassTeacher`
   * fixes that and takes the eligibility check and the history row with it,
   * which a raw insert would have skipped.
   *
   * If the class lands and the assignment does not, the row is reported as a
   * failure *and says so*, because "3 of 60 refused" would under-report a
   * half-written row as a wholly unwritten one.
   */
  const handleImportCreate = useCallback(
    async (data: Record<string, unknown>) => {
      const { homeroomTeacherId, ...classFields } = data as Record<
        string,
        unknown
      > & { homeroomTeacherId?: string | null };
      const created = (await createMutation.mutateAsync(
        classFields as never
      )) as { id: string; name: string };

      if (!homeroomTeacherId) {
        scheduleListRefresh();
        return;
      }

      try {
        await assignTeacherMutation.mutateAsync({
          classId: created.id,
          homeroomTeacherId,
        } as never);
      } catch (error) {
        scheduleListRefresh();
        throw new Error(
          `${created.name} was created, but its homeroom teacher was not assigned: ${formatApiErrorMessage(error, "the server refused the assignment")}`,
          { cause: error }
        );
      }
      scheduleListRefresh();
    },
    [assignTeacherMutation, createMutation, scheduleListRefresh]
  );

  /**
   * Applying a staged CSV row is two writes, for the same reason as a create.
   *
   * `updateClass` accepts `name` and `medium` and nothing else — its input is
   * an explicit `pick`, so `gradeLevel` and `homeroomTeacherId` sent alongside
   * them are stripped by the schema, not applied. Anything more the row carries
   * has to go through `assignClassTeacher`, which is also the procedure that
   * checks the teacher is eligible for the year and records the change.
   */
  const handleImportUpdate = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      const { homeroomTeacherId, ...rest } = data as Record<string, unknown> & {
        homeroomTeacherId?: string | null;
      };
      await updateMutation.mutateAsync({
        id,
        name: rest.name,
        medium: rest.medium,
      } as never);

      if (homeroomTeacherId) {
        await assignTeacherMutation.mutateAsync({
          classId: id,
          homeroomTeacherId,
        } as never);
      }
      scheduleListRefresh();
    },
    [assignTeacherMutation, scheduleListRefresh, updateMutation]
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

  const listErrorMessage = useMemo(() => {
    if (isYearError) {
      return formatApiErrorMessage(
        currentYearQuery.error,
        "The list of academic years could not be read, so the year in the address bar could not be confirmed."
      );
    }
    if (isYearMissing) {
      return "No academic year on record matches the year in the address bar, or none has been opened yet.";
    }
    return formatApiErrorMessage(
      listQuery.error,
      "The server did not return the class list."
    );
  }, [currentYearQuery.error, isYearError, isYearMissing, listQuery.error]);

  return {
    currentYear,
    classes,
    staffList,
    isListLoading: isYearPending || listQuery.isLoading,
    isListError: isYearError || isYearMissing || listQuery.isError,
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
    isExportPending: exportMutation.isPending,
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
