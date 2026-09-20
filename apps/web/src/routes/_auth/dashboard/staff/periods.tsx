import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { createFileRoute } from "@tanstack/react-router";

import {
  AssignPeriodDialog,
  DeleteConfirmDialog,
  EditPeriodDialog,
} from "@/components/staff/period-management/period-dialogs";
import { TimetableGrid } from "@/components/staff/period-management/timetable-grid";
import { usePeriodsPage } from "@/components/staff/period-management/use-periods-page";
import { orpc } from "@/utils/orpc";

const RouteComponent = () => {
  const page = usePeriodsPage();

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <Select
          value={page.category}
          onValueChange={(value: string | null) => {
            if (value) {
              page.setCategory(value);
            }
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select section" />
          </SelectTrigger>
          <SelectContent>
            {page.categoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={page.grade}
          onValueChange={(value: string | null) => {
            if (value) {
              page.setGrade(value);
            }
          }}
        >
          <SelectTrigger className="w-36" disabled={!page.category}>
            <SelectValue
              placeholder={
                page.category ? "Select grade" : "Select section first"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {page.gradeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={page.selectedClassId}
          onValueChange={(value: string | null) => {
            if (value) {
              page.setSelectedClassId(value);
            }
          }}
        >
          <SelectTrigger className="w-36" disabled={!page.grade}>
            <SelectValue
              placeholder={page.grade ? "Select class" : "Select grade first"}
            />
          </SelectTrigger>
          <SelectContent>
            {page.classOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={page.handleExportAllTimetables}
          disabled={
            !page.currentYear?.id || page.exportAllTimetablesMutation.isPending
          }
        >
          Export All Timetables (Excel)
        </Button>
        <Button
          onClick={page.handleExportTimetablePdf}
          disabled={
            !(page.currentYear?.id && page.selectedClass?.id) ||
            page.exportTimetablePdfMutation.isPending
          }
        >
          Export This Class Timetable (PDF)
        </Button>
      </div>

      {page.selectedClass && page.periodConfig && page.timetableData && (
        <TimetableGrid
          assignments={page.timetableData}
          periodConfig={page.periodConfig}
          staff={page.staffMap}
          onAssignClick={page.handleAssignClick}
          onEditClick={page.handleEditClick}
          onDeleteClick={page.handleDeleteClick}
        />
      )}

      <AssignPeriodDialog
        isOpen={page.isAssignDialogOpen}
        onOpenChange={(open) => page.setIsAssignDialogOpen(open)}
        onSubmit={page.handleAssignSubmit}
        staff={[...page.staffMap.values()]}
        selectedClass={page.selectedClass ?? undefined}
        selectedSlot={page.selectedSlot}
        isLoading={page.assignMutation.isPending}
      />

      <EditPeriodDialog
        isOpen={page.isEditDialogOpen}
        onOpenChange={(open) => page.setIsEditDialogOpen(open)}
        onSubmit={page.handleEditSubmit}
        selectedAssignment={page.selectedAssignment}
        staff={[...page.staffMap.values()]}
        selectedClass={page.selectedClass ?? undefined}
        isLoading={page.updateMutation.isPending}
      />

      <DeleteConfirmDialog
        isOpen={page.isDeleteDialogOpen}
        onOpenChange={(open) => page.setIsDeleteDialogOpen(open)}
        onConfirm={page.handleConfirmDelete}
        isLoading={page.deleteMutation.isPending}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/dashboard/staff/periods")({
  component: RouteComponent,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
});
