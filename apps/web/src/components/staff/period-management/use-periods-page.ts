import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type { classPeriodAssignment as periodAssignmentTable } from "@school-student-teacher-management/db/schema/periods";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { CLASS_CATEGORIES } from "@/components/staff/class-assignment/class-categories";
import type {
  AcademicYear,
  PeriodClass,
} from "@/components/staff/period-management/period-dialogs";
import { formatApiErrorMessage } from "@/lib/api-error";
import { downloadExportFile } from "@/lib/download-export";
import { orpc } from "@/utils/orpc";

type Staff = typeof staff.$inferSelect;
type PeriodAssignment = typeof periodAssignmentTable.$inferSelect;

const handleMutationError = (error: unknown, defaultMsg: string) => {
  toast.error(error instanceof Error ? error.message : defaultMsg);
};

export const usePeriodsPage = () => {
  const currentYearQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const currentYear = useMemo(() => {
    const years = currentYearQuery.data as unknown[] | undefined;
    if (!years) {
      return null;
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

  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const classesData = useMemo(() => {
    const data = classesQuery.data as unknown[] | undefined;
    return (data || []) as PeriodClass[];
  }, [classesQuery.data]);

  const [categoryValue, setCategoryValue] = useState<string>("");
  const [gradeValue, setGradeValue] = useState<string>("");

  const setCategory = useCallback((value: string) => {
    setCategoryValue(value);
    setGradeValue("");
    setSelectedClassId("");
  }, []);

  const setGrade = useCallback((value: string) => {
    setGradeValue(value);
    setSelectedClassId("");
  }, []);

  const categoryOptions = useMemo(
    () => CLASS_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
    []
  );

  const gradeOptions = useMemo(() => {
    const activeCategory = CLASS_CATEGORIES.find(
      (c) => c.key === categoryValue
    );
    if (!activeCategory) {
      return [];
    }
    const gradesWithClasses = new Set(classesData.map((cls) => cls.gradeLevel));
    const options: { value: string; label: string }[] = [];
    for (const g of activeCategory.grades) {
      if (gradesWithClasses.has(g)) {
        options.push({ value: String(g), label: `Grade ${g}` });
      }
    }
    return options;
  }, [classesData, categoryValue]);

  const classOptions = useMemo(() => {
    const gradeNumber = Number(gradeValue);
    if (!gradeValue) {
      return [];
    }
    const options: { value: string; label: string }[] = [];
    for (const cls of classesData) {
      if (cls.gradeLevel === gradeNumber) {
        options.push({ value: cls.id, label: cls.name });
      }
    }
    return options;
  }, [classesData, gradeValue]);

  const selectedClass = useMemo(() => {
    if (!selectedClassId) {
      return null;
    }
    return classesData.find((c) => c.id === selectedClassId) || undefined;
  }, [classesData, selectedClassId]);

  const timetableQuery = useQuery(
    orpc.staff.periods.listClassTimetable.queryOptions({
      input: {
        academicYearId: currentYear?.id ?? "",
        classId: selectedClassId ?? "",
      },
      enabled: !!currentYear?.id && !!selectedClassId,
    })
  );

  const conflictsQuery = useQuery({
    ...orpc.staff.periods.listPeriodConflicts.queryOptions({
      input: { academicYearId: currentYear?.id ?? "" },
    }),
    enabled: !!currentYear?.id,
  });

  /**
   * The conflict scan's state, not just its ids.
   *
   * This used to be `new Set(conflictsQuery.data?.conflictingAssignmentIds)`,
   * and `new Set(undefined)` is an empty set — so a network blip reached the
   * page as a conflict count of 0 and told an administrator a timetable
   * nobody had checked was clean. A count of 0 is a finding, so the scan now
   * carries its own state: `known` only when the server answered.
   */
  const conflicts = useMemo(() => {
    if (conflictsQuery.isError) {
      return {
        state: "failed" as const,
        ids: new Set<string>(),
        message: formatApiErrorMessage(
          conflictsQuery.error,
          "The server did not run the conflict scan."
        ),
      };
    }
    if (conflictsQuery.isPending) {
      return { state: "pending" as const, ids: new Set<string>(), message: "" };
    }
    return {
      state: "known" as const,
      ids: new Set(conflictsQuery.data?.conflictingAssignmentIds),
      message: "",
    };
  }, [
    conflictsQuery.data,
    conflictsQuery.error,
    conflictsQuery.isError,
    conflictsQuery.isPending,
  ]);

  const conflictingAssignmentIds = conflicts.ids;

  const handleRetryConflicts = useCallback(() => {
    void conflictsQuery.refetch();
  }, [conflictsQuery]);

  const staffQuery = useQuery(orpc.staff.listStaff.queryOptions());

  const staffMap = useMemo(() => {
    const map = new Map<string, Staff>();
    const staffList = staffQuery.data as unknown[] | undefined;
    if (staffList) {
      for (const s of staffList) {
        const staffMember = s as Staff;
        map.set(staffMember.id, staffMember);
      }
    }
    return map;
  }, [staffQuery.data]);

  const assignMutation = useMutation(
    orpc.staff.periods.assignClassPeriod.mutationOptions()
  );
  const updateMutation = useMutation(
    orpc.staff.periods.updateClassPeriodAssignment.mutationOptions()
  );
  const deleteMutation = useMutation(
    orpc.staff.periods.deleteClassPeriodAssignment.mutationOptions()
  );
  const exportTimetablePdfMutation = useMutation(
    orpc.staff.exports.classTimetablePdf.mutationOptions()
  );
  const exportAllTimetablesMutation = useMutation(
    orpc.staff.exports.allTimetablesExcel.mutationOptions()
  );

  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<{
    dayOfWeek: number;
    periodNumber: number;
  } | null>(null);
  const [selectedAssignment, setSelectedAssignment] =
    useState<PeriodAssignment | null>(null);

  const handleExportTimetablePdf = useCallback(async () => {
    if (!(currentYear?.id && selectedClass?.id)) {
      return;
    }
    try {
      const file = await exportTimetablePdfMutation.mutateAsync({
        academicYearId: currentYear.id,
        classId: selectedClass.id,
      } as never);
      downloadExportFile(file);
    } catch (error) {
      handleMutationError(error, "Failed to export timetable");
    }
  }, [currentYear, selectedClass, exportTimetablePdfMutation]);

  const handleExportAllTimetables = useCallback(async () => {
    if (!currentYear?.id) {
      return;
    }
    try {
      const file = await exportAllTimetablesMutation.mutateAsync({
        academicYearId: currentYear.id,
      } as never);
      downloadExportFile(file);
    } catch (error) {
      handleMutationError(error, "Failed to export timetables");
    }
  }, [currentYear, exportAllTimetablesMutation]);

  const handleAssignClick = useCallback(
    (dayOfWeek: number, periodNumber: number) => {
      setSelectedSlot({ dayOfWeek, periodNumber });
      setSelectedAssignment(null);
      setIsAssignDialogOpen(true);
    },
    []
  );

  const handleEditClick = useCallback((assignment: PeriodAssignment) => {
    setSelectedAssignment(assignment);
    setSelectedSlot(null);
    setIsEditDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((assignment: PeriodAssignment) => {
    setSelectedAssignment(assignment);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleAssignSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedSlot || !selectedClass || !currentYear) {
        return;
      }
      try {
        await assignMutation.mutateAsync({
          academicYearId: currentYear.id,
          classId: selectedClass.id,
          dayOfWeek: selectedSlot.dayOfWeek,
          periodNumber: selectedSlot.periodNumber,
          ...(data as Record<string, unknown>),
        } as never);
        setIsAssignDialogOpen(false);
        await timetableQuery.refetch();
        await conflictsQuery.refetch();
        toast.success("Period assigned successfully");
      } catch (error) {
        handleMutationError(error, "Failed to assign period");
      }
    },
    [
      selectedSlot,
      selectedClass,
      currentYear,
      assignMutation,
      timetableQuery,
      conflictsQuery,
    ]
  );

  const handleEditSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedAssignment) {
        return;
      }
      try {
        await updateMutation.mutateAsync({
          id: selectedAssignment.id,
          ...(data as Record<string, unknown>),
        } as never);
        setIsEditDialogOpen(false);
        await timetableQuery.refetch();
        await conflictsQuery.refetch();
        toast.success("Assignment updated successfully");
      } catch (error) {
        handleMutationError(error, "Failed to update assignment");
      }
    },
    [selectedAssignment, updateMutation, timetableQuery, conflictsQuery]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedAssignment) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({ id: selectedAssignment.id } as never);
      setIsDeleteDialogOpen(false);
      await timetableQuery.refetch();
      await conflictsQuery.refetch();
      toast.success("Assignment deleted successfully");
    } catch (error) {
      handleMutationError(error, "Failed to delete assignment");
    }
  }, [selectedAssignment, deleteMutation, timetableQuery, conflictsQuery]);

  const timetableData = useMemo(() => {
    const data = timetableQuery.data as unknown[] | undefined;
    return (data || []) as PeriodAssignment[];
  }, [timetableQuery.data]);

  /**
   * The same rule as the conflict scan, for the slots-filled figure.
   *
   * `timetableData` is `[]` before a class is chosen, while the read is in
   * flight, and after a failure — so its length was printed as `0 / 40` in all
   * three cases, telling an administrator a timetable is empty when in truth
   * nothing had been read. A count is a finding; it is printed only from a
   * response that arrived.
   */
  const timetableRead = useMemo(() => {
    if (!selectedClassId) {
      return "unread" as const;
    }
    if (timetableQuery.isError) {
      return "failed" as const;
    }
    if (timetableQuery.isPending) {
      return "pending" as const;
    }
    return "known" as const;
  }, [selectedClassId, timetableQuery.isError, timetableQuery.isPending]);

  const handleRetryTimetable = useCallback(() => {
    void timetableQuery.refetch();
  }, [timetableQuery]);

  return {
    currentYear,
    category: categoryValue,
    setCategory,
    grade: gradeValue,
    setGrade,
    categoryOptions,
    gradeOptions,
    classOptions,
    selectedClassId,
    setSelectedClassId,
    selectedClass,
    periods: CODE_DEFINED_PERIODS,
    timetableData,
    timetableRead,
    handleRetryTimetable,
    conflictingAssignmentIds,
    conflictsState: conflicts.state,
    conflictsMessage: conflicts.message,
    handleRetryConflicts,
    staffMap,
    isAssignDialogOpen,
    setIsAssignDialogOpen,
    isEditDialogOpen,
    setIsEditDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    selectedSlot,
    selectedAssignment,
    assignMutation,
    updateMutation,
    deleteMutation,
    exportAllTimetablesMutation,
    exportTimetablePdfMutation,
    handleExportTimetablePdf,
    handleExportAllTimetables,
    handleAssignClick,
    handleEditClick,
    handleDeleteClick,
    handleAssignSubmit,
    handleEditSubmit,
    handleConfirmDelete,
  };
};
