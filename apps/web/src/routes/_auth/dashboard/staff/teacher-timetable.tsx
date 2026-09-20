import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { TeacherCombobox } from "@/components/staff/class-assignment/teacher-combobox";
import { TeacherTimetableDialogs } from "@/components/staff/period-management/teacher-timetable-dialogs";
import { TeacherTimetableGrid } from "@/components/staff/period-management/teacher-timetable-grid";
import { useTeacherTimetablePage } from "@/components/staff/period-management/use-teacher-timetable-page";
import { orpc } from "@/utils/orpc";

const searchSchema = v.object({
  staffId: v.optional(v.string()),
});

const RouteComponent = () => {
  const { staffId: initialStaffId } = Route.useSearch();
  const page = useTeacherTimetablePage(initialStaffId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Teacher Timetable</h1>
        <p className="text-muted-foreground mt-2">
          View and manage a single teacher&apos;s periods across every class
          they teach this academic year.
        </p>
      </div>

      {!initialStaffId && (
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

export const Route = createFileRoute(
  "/_auth/dashboard/staff/teacher-timetable"
)({
  component: RouteComponent,
  validateSearch: searchSchema,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
});
