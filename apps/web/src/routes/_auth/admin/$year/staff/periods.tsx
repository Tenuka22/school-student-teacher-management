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
import { PageHeader } from "@/components/ui-patterns/page-header";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

const RouteComponent = () => {
  const page = usePeriodsPage();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Staff management"
        title="Period assignment"
        description={
          <>Weekly timetable for one class. Click any empty slot to fill it.</>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={page.handleExportAllTimetables}
              disabled={
                !page.currentYear?.id ||
                page.exportAllTimetablesMutation.isPending
              }
            >
              Export all (Excel)
            </Button>
            <Button
              variant="outline"
              onClick={page.handleExportTimetablePdf}
              disabled={
                !(page.currentYear?.id && page.selectedClass?.id) ||
                page.exportTimetablePdfMutation.isPending
              }
            >
              This class (PDF)
            </Button>
          </>
        }
      />

      <div className="border-primary/14 bg-card flex flex-wrap items-end gap-3 border p-4">
        <div className="block min-w-0 flex-1 basis-44">
          <label
            htmlFor="periods-section"
            className="text-foreground mb-1.5 block text-sm font-semibold"
          >
            Section
          </label>
          <Select
            value={page.category}
            onValueChange={(value: string | null) => {
              if (value) {
                page.setCategory(value);
              }
            }}
          >
            <SelectTrigger id="periods-section" className="w-full">
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
        </div>
        <div className="block min-w-0 flex-1 basis-36">
          <label
            htmlFor="periods-grade"
            className="text-foreground mb-1.5 block text-sm font-semibold"
          >
            Grade
          </label>
          <Select
            value={page.grade}
            onValueChange={(value: string | null) => {
              if (value) {
                page.setGrade(value);
              }
            }}
          >
            <SelectTrigger
              id="periods-grade"
              className="w-full"
              disabled={!page.category}
            >
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
        </div>
        <div className="block min-w-0 flex-1 basis-36">
          <label
            htmlFor="periods-class"
            className="text-foreground mb-1.5 block text-sm font-semibold"
          >
            Class
          </label>
          <Select
            value={page.selectedClassId}
            onValueChange={(value: string | null) => {
              if (value) {
                page.setSelectedClassId(value);
              }
            }}
          >
            <SelectTrigger
              id="periods-class"
              className="w-full"
              disabled={!page.grade}
            >
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
        </div>

        {page.periodConfig.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-4">
            <div>
              <div className="text-muted-foreground type-eyebrow">
                Slots filled
              </div>
              <div className="mt-1.5 text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums">
                {page.timetableData.length}{" "}
                <span className="text-muted-foreground text-sm font-medium">
                  / {page.periodConfig.length * 5}
                </span>
              </div>
            </div>
            <div className="bg-primary/14 h-9 w-px" />
            <div>
              <div className="text-destructive type-eyebrow">Conflicts</div>
              <div className="text-destructive mt-1.5 text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums">
                {
                  page.timetableData.filter((a) =>
                    page.conflictingAssignmentIds.has(a.id)
                  ).length
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {page.selectedClass && page.periodConfig && page.timetableData ? (
        <TimetableGrid
          assignments={page.timetableData}
          periodConfig={page.periodConfig}
          staff={page.staffMap}
          conflictingAssignmentIds={page.conflictingAssignmentIds}
          onAssignClick={page.handleAssignClick}
          onEditClick={page.handleEditClick}
          onDeleteClick={page.handleDeleteClick}
        />
      ) : (
        <div className="border-primary/22 text-muted-foreground flex min-h-[40vh] items-center justify-center border border-dashed text-sm">
          Select a section, grade and class above to view its timetable.
        </div>
      )}

      <AssignPeriodDialog
        isOpen={page.isAssignDialogOpen}
        onOpenChange={(open) => page.setIsAssignDialogOpen(open)}
        onSubmit={page.handleAssignSubmit}
        staff={[...page.staffMap.values()]}
        selectedClass={page.selectedClass ?? undefined}
        selectedSlot={page.selectedSlot}
        academicYearId={page.currentYear?.id}
        isLoading={page.assignMutation.isPending}
      />

      <EditPeriodDialog
        isOpen={page.isEditDialogOpen}
        onOpenChange={(open) => page.setIsEditDialogOpen(open)}
        onSubmit={page.handleEditSubmit}
        selectedAssignment={page.selectedAssignment}
        staff={[...page.staffMap.values()]}
        selectedClass={page.selectedClass ?? undefined}
        academicYearId={page.currentYear?.id}
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

export const Route = createFileRoute("/_auth/admin/$year/staff/periods")({
  component: RouteComponent,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
  head: () => pageHead("Period assignment"),
});
