import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

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
}

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

  const currentStaff = useMemo(() => {
    const staffList = staffQuery.data as unknown as Staff[] | undefined;
    return staffList?.find((s) => s.id === staffId);
  }, [staffQuery.data, staffId]);

  const assignMutation = useMutation(
    orpc.staff.periods.assignClassPeriod.mutationOptions()
  );
  const updateMutation = useMutation(
    orpc.staff.periods.updateClassPeriodAssignment.mutationOptions()
  );
  const deleteMutation = useMutation(
    orpc.staff.periods.deleteClassPeriodAssignment.mutationOptions()
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
      if (!(currentYear?.id && staffId)) {
        return;
      }
      try {
        await assignMutation.mutateAsync({
          academicYearId: currentYear.id,
          staffId,
          ...(data as Record<string, unknown>),
        } as never);
        setIsAddDialogOpen(false);
        await timetableQuery.refetch();
        toast.success("Assignment added successfully");
        setAddSlot(null);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to add assignment"
        );
      }
    },
    [currentYear, staffId, assignMutation, timetableQuery]
  );

  const handleEditSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedEntry) {
        return;
      }
      try {
        const { subjectKey } = data as { subjectKey: string };
        await updateMutation.mutateAsync({
          id: selectedEntry.id,
          subjectKey,
          staffId,
        } as never);
        setIsEditDialogOpen(false);
        await timetableQuery.refetch();
        toast.success("Assignment updated successfully");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update assignment"
        );
      }
    },
    [selectedEntry, staffId, updateMutation, timetableQuery]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedEntry) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({ id: selectedEntry.id } as never);
      setIsDeleteDialogOpen(false);
      setSelectedEntry(null);
      await timetableQuery.refetch();
      toast.success("Assignment removed successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove assignment"
      );
    }
  }, [selectedEntry, deleteMutation, timetableQuery]);

  const classes = useMemo(
    () => (classesQuery.data || []) as unknown as Class[],
    [classesQuery.data]
  );

  const entries = useMemo(
    () => (timetableQuery.data || []) as unknown as TeacherTimetableEntry[],
    [timetableQuery.data]
  );

  return {
    staffId,
    setStaffId,
    currentYear,
    currentStaff,
    classes,
    periods: CODE_DEFINED_PERIODS,
    entries,
    isLoadingEntries: timetableQuery.isLoading,
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
