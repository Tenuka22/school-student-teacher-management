"use client";

import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";

import { TeacherCombobox } from "@/components/staff/class-assignment/teacher-combobox";
import { TeacherTimetableDialogs } from "@/components/staff/period-management/teacher-timetable-dialogs";
import { TeacherTimetableGrid } from "@/components/staff/period-management/teacher-timetable-grid";
import { useTeacherTimetablePage } from "@/components/staff/period-management/use-teacher-timetable-page";

interface TeacherTimetablePageContentProps {
  /** When set, the teacher is fixed by the route and never asked for again. */
  staffId?: string;
}

export const TeacherTimetablePageContent = ({
  staffId: fixedStaffId,
}: TeacherTimetablePageContentProps) => {
  const page = useTeacherTimetablePage(fixedStaffId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Teacher Timetable</h1>
        <p className="text-muted-foreground mt-2">
          View and manage a single teacher&apos;s periods across every class
          they teach this academic year.
        </p>
      </div>

      {!fixedStaffId && (
        <Field className="max-w-sm">
          <FieldLabel htmlFor="teacher-timetable-select">Teacher</FieldLabel>
          <TeacherCombobox
            id="teacher-timetable-select"
            value={page.staffId}
            onValueChange={(next) => page.setStaffId(next)}
          />
        </Field>
      )}

      {page.staffId && page.currentYear?.id && (
        <>
          <TeacherTimetableGrid
            entries={page.entries}
            periodConfig={page.periodConfig}
            onAssignClick={page.handleAssignClick}
            onEditClick={page.handleEditClick}
            onDeleteClick={page.handleDeleteClick}
          />

          <TeacherTimetableDialogs
            staffId={page.staffId}
            academicYearId={page.currentYear.id}
            classes={page.classes}
            periodConfig={page.periodConfig}
            selectedEntry={page.selectedEntry}
            addSlot={page.addSlot}
            isAddOpen={page.isAddDialogOpen}
            onAddOpenChange={page.handleAddOpenChange}
            isAddPending={page.assignMutation.isPending}
            onAddSubmit={page.handleAddSubmit}
            isEditOpen={page.isEditDialogOpen}
            onEditOpenChange={(open) => page.setIsEditDialogOpen(open)}
            isEditPending={page.updateMutation.isPending}
            onEditSubmit={page.handleEditSubmit}
            isDeleteOpen={page.isDeleteDialogOpen}
            onDeleteOpenChange={(open) => page.setIsDeleteDialogOpen(open)}
            isDeletePending={page.deleteMutation.isPending}
            onConfirmDelete={page.handleConfirmDelete}
          />
        </>
      )}
    </div>
  );
};
