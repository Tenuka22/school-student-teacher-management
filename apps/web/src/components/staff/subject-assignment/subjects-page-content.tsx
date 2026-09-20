"use client";

import type { subjectAssignment as subjectAssignmentTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { SubjectAssignmentDialogs } from "@/components/staff/subject-assignment/subject-assignment-dialogs";
import { SubjectAssignmentsList } from "@/components/staff/subject-assignment/subject-assignments-list";
import { downloadExportFile } from "@/lib/download-export";
import { orpc } from "@/utils/orpc";

type SubjectAssignment = typeof subjectAssignmentTable.$inferSelect;
type Staff = typeof staff.$inferSelect;
interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

interface SubjectsPageContentProps {
  /** When set, scopes the page to one teacher: hides the general-browsing
   * empty/create-less state, allows creating assignments for just this
   * teacher, and locks the teacher field so it's never asked for twice. */
  staffId?: string;
}

export const SubjectsPageContent = ({ staffId }: SubjectsPageContentProps) => {
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
    orpc.staff.listSubjectAssignments.queryOptions({
      input: {
        academicYearId: currentYear?.id ?? "",
        staffId: staffId as never,
        gradeLevel: undefined,
        subjectKey: undefined,
      },
      enabled: !!currentYear?.id,
    })
  );

  const staffQuery = useQuery(orpc.staff.listStaff.queryOptions());

  const createMutation = useMutation(
    orpc.staff.assignSubject.mutationOptions()
  );
  const updateMutation = useMutation(
    orpc.staff.updateSubjectAssignment.mutationOptions()
  );
  const deleteMutation = useMutation(
    orpc.staff.deleteSubjectAssignment.mutationOptions()
  );
  const exportMutation = useMutation(
    orpc.staff.exports.subjectAssignmentsExcel.mutationOptions()
  );

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [selectedAssignment, setSelectedAssignment] =
    useState<SubjectAssignment | null>(null);

  const handleCreateClick = useCallback(() => setIsCreateDialogOpen(true), []);

  const handleEditClick = useCallback((assignment: SubjectAssignment) => {
    setSelectedAssignment(assignment);
    setIsEditDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((assignment: SubjectAssignment) => {
    setSelectedAssignment(assignment);
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
        error instanceof Error ? error.message : "Failed to export assignments"
      );
    }
  }, [currentYear, exportMutation]);

  const handleCreateSubmit = useCallback(
    async (data: unknown) => {
      try {
        await createMutation.mutateAsync(data as never);
        setIsCreateDialogOpen(false);
        await listQuery.refetch();
        toast.success("Assignment created successfully");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to create assignment"
        );
      }
    },
    [createMutation, listQuery]
  );

  const handleEditSubmit = useCallback(
    async (data: unknown) => {
      try {
        if (!selectedAssignment) {
          return;
        }
        await updateMutation.mutateAsync({
          id: selectedAssignment.id,
          ...(data as Record<string, unknown>),
        } as never);
        setIsEditDialogOpen(false);
        await listQuery.refetch();
        toast.success("Assignment updated successfully");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update assignment"
        );
      }
    },
    [selectedAssignment, updateMutation, listQuery]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedAssignment) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id: selectedAssignment.id } as never);
      setIsDeleteDialogOpen(false);
      setSelectedAssignment(null);
      await listQuery.refetch();
      toast.success("Assignment deleted successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete assignment"
      );
    }
  }, [selectedAssignment, deleteMutation, listQuery]);

  const assignmentList = useMemo(() => {
    const data = listQuery.data as unknown[] | undefined;
    return (data || []) as SubjectAssignment[];
  }, [listQuery.data]);

  const staffList = useMemo(() => {
    const data = staffQuery.data as unknown[] | undefined;
    return (data || []) as Staff[];
  }, [staffQuery.data]);

  const scopedTeacher = staffId
    ? staffList.find((s) => s.id === staffId)
    : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Subject Assignments</h1>
        <p className="text-muted-foreground text-sm">
          {scopedTeacher
            ? `Subjects assigned to ${scopedTeacher.name} this academic year - these are their preferred / most valued subjects.`
            : "View this academic year's subject assignments. New assignments are created as part of setting up a teacher."}
        </p>
      </div>

      <SubjectAssignmentsList
        assignments={assignmentList}
        staff={staffList}
        isLoading={listQuery.isLoading || staffQuery.isLoading}
        onCreateClick={staffId ? handleCreateClick : undefined}
        onEditClick={handleEditClick}
        onDeleteClick={handleDeleteClick}
        onExportClick={handleExportClick}
      />

      <SubjectAssignmentDialogs
        academicYearId={currentYear?.id}
        staff={staffId ? staffList.filter((s) => s.id === staffId) : staffList}
        lockedStaffId={staffId}
        selectedAssignment={selectedAssignment}
        isCreateOpen={isCreateDialogOpen}
        onCreateOpenChange={setIsCreateDialogOpen}
        isCreatePending={createMutation.isPending}
        onCreateSubmit={handleCreateSubmit}
        isEditOpen={isEditDialogOpen}
        onEditOpenChange={setIsEditDialogOpen}
        isEditPending={updateMutation.isPending}
        onEditSubmit={handleEditSubmit}
        isDeleteOpen={isDeleteDialogOpen}
        onDeleteOpenChange={setIsDeleteDialogOpen}
        isDeletePending={deleteMutation.isPending}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
};
