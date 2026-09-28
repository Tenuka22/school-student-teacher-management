import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

type Class = typeof classTable.$inferSelect;
type Staff = typeof staffTable.$inferSelect;

interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

interface TeacherTimetableEntry {
  id: string;
  classId: string;
  className: string;
  gradeLevel: number;
  dayOfWeek: number;
  periodNumber: number;
  subjectKey: string;
  /**
   * Whether the server's conflict scan reported this row. The teacher-timetable
   * read does not carry the stored `isCombinedSession` flag, so the scan is the
   * only honest source for "was this overlap declared?" on this page.
   */
  isClash?: boolean;
}

type ReadState = "unread" | "pending" | "known" | "failed";

/**
 * The error a form should show.
 *
 * Kept as an `Error` and rethrown so the form can print it inline next to the
 * control that caused it, instead of only in a toast that has gone by the time
 * the dialog is read again.
 */
const rethrow = (error: unknown, fallback: string): never => {
  throw error instanceof Error
    ? error
    : new Error(formatApiErrorMessage(error, fallback));
};

const readStateOf = (query: {
  isError: boolean;
  isPending: boolean;
}): ReadState => {
  if (query.isError) {
    return "failed";
  }
  return query.isPending ? "pending" : "known";
};

export const useTeacherTimetablePage = (initialStaffId: string | undefined) => {
  const [staffId, setStaffId] = useState(initialStaffId ?? "");

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

  const classesQuery = useQuery(
    orpc.staff.listClasses.queryOptions({
      input: { academicYearId: currentYear?.id ?? "", gradeLevel: undefined },
      enabled: !!currentYear?.id,
    })
  );

  const timetableQuery = useQuery(
    orpc.staff.periods.listTeacherTimetable.queryOptions({
      input: { academicYearId: currentYear?.id ?? "", staffId: staffId || "" },
      enabled: !!(currentYear?.id && staffId),
    })
  );

  const staffQuery = useQuery(orpc.staff.listStaff.queryOptions());

  /**
   * The conflict scan for the year, so a shared slot can be labelled honestly.
   *
   * The teacher-timetable read does not return `isCombinedSession`, so without
   * this a slot holding two classes could only be called a combined session or
   * a mistake — and the first would be a claim the data does not support. The
   * scan leaves declared overlaps out of its report, so a multi-class slot the
   * scan did not report is a declared combined session, and one it did report
   * is not. Nothing here claims the timetable has been checked and found clean:
   * a failed scan marks no slot, and says so.
   */
  const conflictsQuery = useQuery({
    ...orpc.staff.periods.listPeriodConflicts.queryOptions({
      input: { academicYearId: currentYear?.id ?? "" },
    }),
    enabled: !!currentYear?.id,
  });

  const conflictingAssignmentIds = useMemo(() => {
    if (conflictsQuery.isError || conflictsQuery.isPending) {
      return new Set<string>();
    }
    return new Set(conflictsQuery.data?.conflictingAssignmentIds);
  }, [conflictsQuery.data, conflictsQuery.isError, conflictsQuery.isPending]);

  const conflictsRead: ReadState = readStateOf(conflictsQuery);

  const currentStaff = useMemo(() => {
    const staffList = staffQuery.data as unknown as Staff[] | undefined;
    return staffList?.find((s) => s.id === staffId);
  }, [staffQuery.data, staffId]);

  const assignMutation = useMutation(
    orpc.staff.periods.createClassPeriodSubject.mutationOptions()
  );
  const assignTeacherMutation = useMutation(
    orpc.staff.periods.assignTeacherToPeriodSubject.mutationOptions()
  );
  const updateMutation = useMutation(
    orpc.staff.periods.assignTeacherToPeriodSubject.mutationOptions()
  );
  const deleteMutation = useMutation(
    orpc.staff.periods.removeTeacherFromPeriodSubject.mutationOptions()
  );

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] =
    useState<TeacherTimetableEntry | null>(null);
  const [addSlot, setAddSlot] = useState<{
    dayOfWeek: number;
    periodNumber: number;
  } | null>(null);

  const handleAssignClick = useCallback(
    (dayOfWeek: number, periodNumber: number) => {
      setAddSlot({ dayOfWeek, periodNumber });
      setIsAddDialogOpen(true);
    },
    []
  );

  const handleAddOpenChange = useCallback((open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      setAddSlot(null);
    }
  }, []);

  const handleEditClick = useCallback((entry: TeacherTimetableEntry) => {
    setSelectedEntry(entry);
    setIsEditDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((entry: TeacherTimetableEntry) => {
    setSelectedEntry(entry);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleAddSubmit = useCallback(
    async (data: unknown) => {
      if (!(currentYear?.id && staffId) || assignMutation.isPending) {
        return;
      }
      try {
        const {
          classId,
          dayOfWeek,
          periodNumber,
          subjectKey,
          isCombinedSession,
        } = data as {
          classId: string;
          dayOfWeek: number;
          periodNumber: number;
          subjectKey: string;
          isCombinedSession?: boolean;
        };
        const subject = await assignMutation.mutateAsync({
          academicYearId: currentYear.id,
          classId,
          dayOfWeek,
          periodNumber,
          subjectKey,
        } as never);
        await assignTeacherMutation.mutateAsync({
          classPeriodSubjectId: subject.id,
          staffId,
          ...(isCombinedSession === undefined ? {} : { isCombinedSession }),
        } as never);
        setIsAddDialogOpen(false);
        setAddSlot(null);
        await Promise.all([timetableQuery.refetch(), conflictsQuery.refetch()]);
        toast.success("Assignment added successfully");
      } catch (error) {
        rethrow(error, "Failed to add the assignment");
      }
    },
    [
      assignMutation,
      assignTeacherMutation,
      conflictsQuery,
      currentYear,
      staffId,
      timetableQuery,
    ]
  );

  const handleEditSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedEntry || updateMutation.isPending) {
        return;
      }
      try {
        const {
          classId,
          dayOfWeek,
          periodNumber,
          subjectKey,
          isCombinedSession,
        } = data as {
          classId: string;
          dayOfWeek: number;
          periodNumber: number;
          subjectKey: string;
          isCombinedSession?: boolean;
        };
        await deleteMutation.mutateAsync({ id: selectedEntry.id } as never);
        const subject = await assignMutation.mutateAsync({
          academicYearId: currentYear?.id ?? "",
          classId,
          dayOfWeek,
          periodNumber,
          subjectKey,
        } as never);
        await updateMutation.mutateAsync({
          classPeriodSubjectId: subject.id,
          staffId,
          ...(isCombinedSession === undefined ? {} : { isCombinedSession }),
        } as never);
        setIsEditDialogOpen(false);
        await Promise.all([timetableQuery.refetch(), conflictsQuery.refetch()]);
        toast.success("Assignment updated successfully");
      } catch (error) {
        rethrow(error, "Failed to update the assignment");
      }
    },
    [
      assignMutation,
      conflictsQuery,
      currentYear,
      deleteMutation,
      selectedEntry,
      staffId,
      timetableQuery,
      updateMutation,
    ]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedEntry || deleteMutation.isPending) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({ id: selectedEntry.id } as never);
      setIsDeleteDialogOpen(false);
      setSelectedEntry(null);
      await Promise.all([timetableQuery.refetch(), conflictsQuery.refetch()]);
      toast.success("Assignment removed successfully");
    } catch (error) {
      toast.error(
        formatApiErrorMessage(error, "Failed to remove the assignment")
      );
    }
  }, [conflictsQuery, deleteMutation, selectedEntry, timetableQuery]);

  const classes = useMemo(
    () => (classesQuery.data || []) as unknown as Class[],
    [classesQuery.data]
  );

  /**
   * The teacher's rows, each carrying the scan's verdict.
   *
   * `timetableQuery.data` is `[]` before a teacher is chosen, while the read is
   * in flight and after a failure, so the grid cannot be handed that directly:
   * it would render forty free slots and call it a timetable. `entriesRead`
   * travels beside it and the page shows a skeleton, a taught empty state or a
   * named error instead.
   */
  const entries = useMemo(
    () =>
      ((timetableQuery.data || []) as unknown as TeacherTimetableEntry[]).map(
        (entry) => ({
          ...entry,
          isClash: conflictingAssignmentIds.has(entry.id),
        })
      ),
    [conflictingAssignmentIds, timetableQuery.data]
  );

  const entriesRead: ReadState = staffId
    ? readStateOf(timetableQuery)
    : "unread";

  const handleRetryEntries = useCallback(() => {
    void timetableQuery.refetch();
  }, [timetableQuery]);

  const handleRetryStaff = useCallback(() => {
    void staffQuery.refetch();
  }, [staffQuery]);

  const handleRetryClasses = useCallback(() => {
    void classesQuery.refetch();
  }, [classesQuery]);

  const handleRetryConflicts = useCallback(() => {
    void conflictsQuery.refetch();
  }, [conflictsQuery]);

  const handleRetryYears = useCallback(() => {
    void currentYearQuery.refetch();
  }, [currentYearQuery]);

  return {
    staffId,
    setStaffId,
    currentYear,
    currentYearRead: readStateOf(currentYearQuery),
    currentYearMessage: formatApiErrorMessage(
      currentYearQuery.error,
      "The academic year list could not be read."
    ),
    handleRetryYears,
    currentStaff,
    staffRead: readStateOf(staffQuery),
    staffMessage: formatApiErrorMessage(
      staffQuery.error,
      "The staff list could not be read."
    ),
    handleRetryStaff,
    classes,
    classesRead: readStateOf(classesQuery),
    classesMessage: formatApiErrorMessage(
      classesQuery.error,
      "The class list could not be read."
    ),
    handleRetryClasses,
    periods: CODE_DEFINED_PERIODS,
    periodConfig: CODE_DEFINED_PERIODS,
    entries,
    entriesRead,
    entriesMessage: formatApiErrorMessage(
      timetableQuery.error,
      "This teacher's timetable could not be read."
    ),
    handleRetryEntries,
    isLoadingEntries: timetableQuery.isPending,
    conflictsRead,
    conflictsMessage: formatApiErrorMessage(
      conflictsQuery.error,
      "The server did not run the conflict scan."
    ),
    handleRetryConflicts,
    isAddDialogOpen,
    handleAddOpenChange,
    isEditDialogOpen,
    setIsEditDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    selectedEntry,
    addSlot,
    assignMutation,
    updateMutation,
    deleteMutation,
    handleAssignClick,
    handleEditClick,
    handleDeleteClick,
    handleAddSubmit,
    handleEditSubmit,
    handleConfirmDelete,
  };
};
