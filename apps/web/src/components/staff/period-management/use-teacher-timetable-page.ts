import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  categoryForGrade,
  CLASS_CATEGORIES,
} from "@/components/staff/class-assignment/class-categories";
import type { ClassCategoryKey } from "@/components/staff/class-assignment/class-categories";
import {
  gradeChangedTo,
  sectionChangedTo,
  toTeacherTimetableSearchParams,
  validateTeacherTimetableSearch,
} from "@/components/staff/period-management/teacher-timetable-search";
import type { TeacherTimetableSearch } from "@/components/staff/period-management/teacher-timetable-search";
import { useListSearchWriter } from "@/components/ui-patterns/data-table/use-list-search-writer";
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

export const useTeacherTimetablePage = (
  search: TeacherTimetableSearch,
  fixedStaffId?: string
) => {
  const writeSearch = useListSearchWriter<TeacherTimetableSearch>(
    validateTeacherTimetableSearch,
    toTeacherTimetableSearchParams
  );

  /**
   * The teacher on screen, and where it lives.
   *
   * The route's id always wins when there is one: `/teacher-timetable/A` fixes A
   * and the picker is hidden, so nothing on that route can disagree. Otherwise the
   * pick is **in the URL**, which is the whole point of moving it out of
   * `useState` — a refresh, a shared link and the Back button all used to lose the
   * teacher and land on forty free slots with no answer to "whose week was I
   * looking at?".
   *
   * Derived, not stored, so a new param or a new search takes effect on the very
   * render that carries it: `/teacher-timetable/A` to `/teacher-timetable/B`
   * re-renders this component, it does not remount it.
   */
  const staffId = fixedStaffId ?? search.teacher;

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

  const categoryOptions = useMemo(
    () => CLASS_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
    []
  );

  /**
   * What the three narrowing picks offer, derived from **this teacher's week**.
   *
   * Not from the year's class list, which is what the period-assignment page uses
   * because there the picks choose which class's timetable to fetch. Here the
   * timetable is already fetched and the picks only narrow it, so the honest
   * options are the grades and classes this teacher actually teaches: a grade
   * select offering every grade in the school would be a list of mostly empty
   * grids.
   *
   * Consequence worth stating: with no teacher chosen there is nothing to derive
   * from, so grade and class are disabled until one is. That is the cascade doing
   * its job, not a bug — the teacher is the first pick.
   */
  const gradeOptions = useMemo(() => {
    const activeCategory = CLASS_CATEGORIES.find(
      (c) => c.key === search.section
    );
    if (!activeCategory) {
      return [];
    }
    const taught = new Set(entries.map((entry) => entry.gradeLevel));
    const options: { value: string; label: string }[] = [];
    for (const grade of activeCategory.grades) {
      if (taught.has(grade)) {
        options.push({ value: String(grade), label: `Grade ${grade}` });
      }
    }
    return options;
  }, [entries, search.section]);

  const classOptions = useMemo(() => {
    if (!search.grade) {
      return [];
    }
    const gradeNumber = Number(search.grade);
    const seen = new Map<string, string>();
    for (const entry of entries) {
      if (entry.gradeLevel === gradeNumber && !seen.has(entry.classId)) {
        seen.set(entry.classId, entry.className);
      }
    }
    return [...seen]
      .map(([value, label]) => ({ value, label }))
      .toSorted((a, b) => a.label.localeCompare(b.label));
  }, [entries, search.grade]);

  /**
   * The picks, after checking them against the week actually on screen.
   *
   * **Derived, not stored, and not written back.** The URL is the only copy;
   * these are what the page works with once a link that does not line up has been
   * made to line up. Nothing is written back on the way, because a URL that
   * disagrees with the data would otherwise be "fixed" by a navigation nobody
   * asked for.
   *
   * A grade the section does not contain, and a class outside the chosen grade,
   * each fall back to "not chosen" — which is what the dropdown would have shown
   * anyway. A grade this teacher does not teach is *not* one of those cases: it
   * stays chosen and shows an honest empty grid, because "teaches nothing in
   * grade 9" is an answer and "the filter silently vanished" is not.
   */
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

  /**
   * The week, narrowed.
   *
   * Client-side over rows already fetched: none of the three picks changes what
   * the server was asked, only which of the answers are shown. `entries` stays
   * unfiltered and feeds the summary strip, so the header keeps describing the
   * teacher's whole week while the grid below shows the slice.
   */
  const filteredEntries = useMemo(() => {
    const gradeNumber = Number(gradeValue);
    return entries.filter((entry) => {
      if (selectedClassId && entry.classId !== selectedClassId) {
        return false;
      }
      if (gradeValue && entry.gradeLevel !== gradeNumber) {
        return false;
      }
      if (
        search.section &&
        categoryForGrade(entry.gradeLevel) !== search.section
      ) {
        return false;
      }
      return true;
    });
  }, [entries, gradeValue, search.section, selectedClassId]);

  const hasFilters = Boolean(search.section || gradeValue || selectedClassId);

  const setStaffId = useCallback(
    (next: string) => {
      // The grade and class options are derived from the timetable being
      // replaced, so carrying them over would leave the URL naming a grade the
      // next teacher may not teach — dropped by reconciliation a moment later,
      // without a word. Section is a band of the school, not a fact about the
      // teacher, so it survives.
      writeSearch({ teacher: next, grade: "", class: "" });
    },
    [writeSearch]
  );

  const setSection = useCallback(
    (value: string) => {
      writeSearch(sectionChangedTo(value as ClassCategoryKey | ""));
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

  const handleClearFilters = useCallback(() => {
    writeSearch({ section: "", grade: "", class: "" });
  }, [writeSearch]);

  /**
   * Distinct day-and-period slots the teacher occupies.
   *
   * `entries` is one row per class taught, so a combined session covering
   * three classes in one period counts as three. The header figures are about
   * periods, not classes: three classes taught at once is one period taught
   * and one slot fewer free.
   */
  const occupiedSlotCount = useMemo(
    () =>
      new Set(
        entries.map((entry) => `${entry.dayOfWeek}-${entry.periodNumber}`)
      ).size,
    [entries]
  );

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
    periodConfig: CODE_DEFINED_PERIODS,
    entries,
    filteredEntries,
    hasFilters,
    handleClearFilters,
    categoryOptions,
    section: search.section,
    setSection,
    grade: gradeValue,
    setGrade,
    gradeOptions,
    classOptions,
    selectedClassId,
    setSelectedClassId,
    occupiedSlotCount,
    entriesRead,
    entriesMessage: formatApiErrorMessage(
      timetableQuery.error,
      "This teacher's timetable could not be read."
    ),
    handleRetryEntries,
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
