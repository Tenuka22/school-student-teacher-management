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
  ConflictCheckDialog,
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
          value={page.selectedClassId}
          onValueChange={(value: string | null) => {
            if (value) {
              page.setSelectedClassId(value);
            }
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select a class" />
          </SelectTrigger>
          <SelectContent>
            {page.classesData.map((cls) => (
              <SelectItem key={cls.id} value={cls.id}>
                {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => page.handleCheckConflict()}>
          Check Conflicts
        </Button>
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

      <ConflictCheckDialog
        isOpen={page.isConflictCheckDialogOpen}
        onOpenChange={(open) => page.setIsConflictCheckDialogOpen(open)}
        conflicts={page.conflictCheckResults}
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
