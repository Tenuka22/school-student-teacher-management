import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { CLASS_CATEGORIES } from "@/components/staff/class-assignment/class-categories";
import type { ClassCategoryKey } from "@/components/staff/class-assignment/class-categories";
import type {
  AcademicYear,
  PeriodClass,
} from "@/components/staff/period-management/period-dialogs";
import {
  gradeChangedTo,
  sectionChangedTo,
  toPeriodsSearchParams,
  validatePeriodsSearch,
} from "@/components/staff/period-management/periods-search";
import type { PeriodsSearch } from "@/components/staff/period-management/periods-search";
import { useListSearchWriter } from "@/components/ui-patterns/data-table/use-list-search-writer";
import { formatApiErrorMessage } from "@/lib/api-error";
import { downloadExportFile } from "@/lib/download-export";
import { orpc } from "@/utils/orpc";

type Staff = typeof staff.$inferSelect;
type PeriodSubject = typeof classPeriodSubject.$inferSelect & {
  teachers: (typeof classPeriodTeacher.$inferSelect)[];
};

const handleMutationError = (error: unknown, defaultMsg: string) => {
  toast.error(formatApiErrorMessage(error, defaultMsg));
};

/**
 * The error a form should show, kept as an `Error` so the form can print it
 * inline beside the control that caused it.
 *
 * The assign and edit dialogs stay open on a failed write, so the message has to
 * live where the form is: a toast has usually been dismissed by the time
 * somebody reads the dialog again. Deleting has no form, so that one toasts.
 */
const rethrow = (error: unknown, fallback: string): never => {
  throw error instanceof Error
    ? error
    : new Error(formatApiErrorMessage(error, fallback));
};

export const usePeriodsPage = (search: PeriodsSearch) => {
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

  const classesData = useMemo(() => {
    const data = classesQuery.data as unknown[] | undefined;
    return (data || []) as PeriodClass[];
  }, [classesQuery.data]);

  const categoryOptions = useMemo(
    () => CLASS_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
    []
  );

  const gradeOptions = useMemo(() => {
    const activeCategory = CLASS_CATEGORIES.find(
      (c) => c.key === search.section
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
  }, [classesData, search.section]);

  const classOptions = useMemo(() => {
    const gradeNumber = Number(search.grade);
    if (!search.grade) {
      return [];
    }
    const options: { value: string; label: string }[] = [];
    for (const cls of classesData) {
      if (cls.gradeLevel === gradeNumber) {
        options.push({ value: cls.id, label: cls.name });
      }
    }
    return options;
  }, [classesData, search.grade]);

  /**
   * The picks, after checking them against what the College actually has.
   *
   * **Derived, not stored, and not written back.** The URL is the only copy of
   * them; these three are what the page works with once a link that does not line up
   * has been made to line up. Nothing is written back on the way, because a URL
   * that disagrees with the data would otherwise be "fixed" by a navigation nobody
   * asked for, and a hand-edited link would lose the parts of itself that *were*
   * valid.
   *
   * The three checks are the ones that can be false in a real link: a grade the
   * chosen section does not contain, a class in a different grade, and a grade with
   * no classes at all. Each falls back to "not chosen" — which is what the dropdown
   * would have shown anyway, and which leaves the page asking rather than showing
   * a timetable for a class the section has nothing to do with.
   */
  const categoryValue = search.section;
  const gradeValue = gradeOptions.some(
    (option) => option.value === search.grade
  )
    ? search.grade
    : "";
  const selectedClassId = classOptions.some(
    (option) => option.value === search.class
  )
    ? search.class
    : "";

  const writeSearch = useListSearchWriter<PeriodsSearch>(
    validatePeriodsSearch,
    toPeriodsSearchParams
  );

  const setCategory = useCallback(
    (value: string) => {
      writeSearch(
        sectionChangedTo(
          value as ClassCategoryKey | ""
        ) as Partial<PeriodsSearch>
      );
    },
    [writeSearch]
  );

  const setGrade = useCallback(
    (value: string) => {
      writeSearch(gradeChangedTo(value));
    },
    [writeSearch]
  );

  const setSelectedClassId = useCallback(
    (value: string) => {
      writeSearch({ class: value });
    },
    [writeSearch]
  );

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

  const conflictingTeacherIds = conflicts.ids;

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

  // Mutations for the new subject-first API
  const createSubjectMutation = useMutation(
    orpc.staff.periods.createClassPeriodSubject.mutationOptions()
  );
  const deleteSubjectMutation = useMutation(
    orpc.staff.periods.deleteClassPeriodSubject.mutationOptions()
  );
  const assignTeacherMutation = useMutation(
    orpc.staff.periods.assignTeacherToPeriodSubject.mutationOptions()
  );
  const removeTeacherMutation = useMutation(
    orpc.staff.periods.removeTeacherFromPeriodSubject.mutationOptions()
  );
  const exportTimetablePdfMutation = useMutation(
    orpc.staff.exports.classTimetablePdf.mutationOptions()
  );
  const exportAllTimetablesMutation = useMutation(
    orpc.staff.exports.allTimetablesExcel.mutationOptions()
  );

  const [isAddSubjectDialogOpen, setIsAddSubjectDialogOpen] = useState(false);
  const [isAddTeacherDialogOpen, setIsAddTeacherDialogOpen] = useState(false);
  const [isDeleteSubjectDialogOpen, setIsDeleteSubjectDialogOpen] =
    useState(false);
  const [isDeleteTeacherDialogOpen, setIsDeleteTeacherDialogOpen] =
    useState(false);

  const [selectedSlot, setSelectedSlot] = useState<{
    dayOfWeek: number;
    periodNumber: number;
  } | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<PeriodSubject | null>(
    null
  );
  const [selectedTeacher, setSelectedTeacher] = useState<
    typeof classPeriodTeacher.$inferSelect | null
  >(null);

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
      toast.success(`Timetable PDF downloaded for ${selectedClass.name}`);
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
      toast.success("Timetable workbook downloaded, one sheet per teacher");
    } catch (error) {
      handleMutationError(error, "Failed to export timetables");
    }
  }, [currentYear, exportAllTimetablesMutation]);

  const handleAddSubjectClick = useCallback(
    (dayOfWeek: number, periodNumber: number) => {
      setSelectedSlot({ dayOfWeek, periodNumber });
      setSelectedSubject(null);
      setIsAddSubjectDialogOpen(true);
    },
    []
  );

  const handleAddTeacherClick = useCallback((subject: PeriodSubject) => {
    setSelectedSubject(subject);
    setSelectedSlot(null);
    setIsAddTeacherDialogOpen(true);
  }, []);

  const handleDeleteSubjectClick = useCallback((subject: PeriodSubject) => {
    setSelectedSubject(subject);
    setIsDeleteSubjectDialogOpen(true);
  }, []);

  const handleDeleteTeacherClick = useCallback(
    (teacher: typeof classPeriodTeacher.$inferSelect) => {
      setSelectedTeacher(teacher);
      setIsDeleteTeacherDialogOpen(true);
    },
    []
  );

  const handleAddSubjectSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedSlot || !selectedClass || !currentYear) {
        return;
      }
      if (createSubjectMutation.isPending) {
        return;
      }
      try {
        await createSubjectMutation.mutateAsync({
          academicYearId: currentYear.id,
          classId: selectedClass.id,
          dayOfWeek: selectedSlot.dayOfWeek,
          periodNumber: selectedSlot.periodNumber,
          ...(data as Record<string, unknown>),
        } as never);
        setIsAddSubjectDialogOpen(false);
        await Promise.all([timetableQuery.refetch(), conflictsQuery.refetch()]);
        toast.success("Subject added successfully");
      } catch (error) {
        rethrow(error, "Failed to add subject");
      }
    },
    [
      createSubjectMutation,
      conflictsQuery,
      currentYear,
      selectedClass,
      selectedSlot,
      timetableQuery,
    ]
  );

  const handleAddTeacherSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedSubject || assignTeacherMutation.isPending) {
        return;
      }
      try {
        await assignTeacherMutation.mutateAsync({
          classPeriodSubjectId: selectedSubject.id,
          ...(data as Record<string, unknown>),
        } as never);
        setIsAddTeacherDialogOpen(false);
        await Promise.all([timetableQuery.refetch(), conflictsQuery.refetch()]);
        toast.success("Teacher assigned successfully");
      } catch (error) {
        rethrow(error, "Failed to assign teacher");
      }
    },
    [assignTeacherMutation, conflictsQuery, selectedSubject, timetableQuery]
  );

  const handleConfirmDeleteSubject = useCallback(async () => {
    if (!selectedSubject || deleteSubjectMutation.isPending) {
      return;
    }
    try {
      await deleteSubjectMutation.mutateAsync({
        id: selectedSubject.id,
      } as never);
      setIsDeleteSubjectDialogOpen(false);
      setSelectedSubject(null);
      await Promise.all([timetableQuery.refetch(), conflictsQuery.refetch()]);
      toast.success("Subject removed successfully");
    } catch (error) {
      handleMutationError(error, "Failed to remove subject");
    }
  }, [conflictsQuery, deleteSubjectMutation, selectedSubject, timetableQuery]);

  const handleConfirmDeleteTeacher = useCallback(async () => {
    if (!selectedTeacher || removeTeacherMutation.isPending) {
      return;
    }
    try {
      await removeTeacherMutation.mutateAsync({
        id: selectedTeacher.id,
      } as never);
      setIsDeleteTeacherDialogOpen(false);
      setSelectedTeacher(null);
      await Promise.all([timetableQuery.refetch(), conflictsQuery.refetch()]);
      toast.success("Teacher removed successfully");
    } catch (error) {
      handleMutationError(error, "Failed to remove teacher");
    }
  }, [conflictsQuery, removeTeacherMutation, selectedTeacher, timetableQuery]);

  const timetableData = useMemo(() => {
    const data = timetableQuery.data as unknown[] | undefined;
    return (data || []) as PeriodSubject[];
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
    conflictingTeacherIds,
    conflictsState: conflicts.state,
    conflictsMessage: conflicts.message,
    handleRetryConflicts,
    staffMap,
    isAddSubjectDialogOpen,
    setIsAddSubjectDialogOpen,
    isAddTeacherDialogOpen,
    setIsAddTeacherDialogOpen,
    isDeleteSubjectDialogOpen,
    setIsDeleteSubjectDialogOpen,
    isDeleteTeacherDialogOpen,
    setIsDeleteTeacherDialogOpen,
    selectedSlot,
    selectedSubject,
    selectedTeacher,
    createSubjectMutation,
    deleteSubjectMutation,
    assignTeacherMutation,
    removeTeacherMutation,
    exportAllTimetablesMutation,
    exportTimetablePdfMutation,
    handleExportTimetablePdf,
    handleExportAllTimetables,
    handleAddSubjectClick,
    handleAddTeacherClick,
    handleDeleteSubjectClick,
    handleDeleteTeacherClick,
    handleAddSubjectSubmit,
    handleAddTeacherSubmit,
    handleConfirmDeleteSubject,
    handleConfirmDeleteTeacher,
  };
};
