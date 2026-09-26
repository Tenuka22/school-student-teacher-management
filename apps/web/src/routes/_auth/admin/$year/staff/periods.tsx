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

/**
 * The double-booking scan, reported honestly.
 *
 * A count of 0 is a finding: it says the server checked and found nothing. This
 * used to render 0 whenever the scan had not answered, because
 * `new Set(undefined)` is an empty set — so a network blip showed an
 * administrator a clean timetable. A failed check therefore prints no number at
 * all, says in words that it could not be checked, and drops the
 * `text-destructive` weight that belongs to a real finding, so nothing about it
 * can be misread as "checked, all clear".
 */
const ConflictsCheck = ({
  conflictCount,
  message,
  onRetry,
  state,
}: {
  conflictCount: number;
  message: string;
  onRetry: () => void;
  state: "pending" | "failed" | "known";
}) => {
  if (state === "failed") {
    return (
      <div
        className="border-destructive/40 bg-card max-w-[16rem] border border-dashed px-2.5 py-2"
        role="alert"
      >
        <div className="text-muted-foreground text-xs font-extrabold tracking-[0.16em]">
          CONFLICT CHECK
        </div>
        <div className="text-muted-foreground mt-1 text-xs leading-snug font-semibold">
          Could not be checked — this timetable may or may not have
          double-bookings.
        </div>
        {message && (
          <div className="text-muted-foreground/80 mt-1 text-xs">{message}</div>
        )}
        <button
          type="button"
          className="border-primary/30 text-primary hover:border-primary mt-2 border px-2 py-1 text-xs font-bold transition-colors"
          onClick={onRetry}
        >
          Re-check
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-destructive text-xs font-extrabold tracking-[0.16em]">
        CONFLICTS
      </div>
      <div className="font-heading text-destructive mt-1 text-2xl leading-none font-semibold">
        {state === "pending" ? "—" : conflictCount}
      </div>
    </div>
  );
};

const RouteComponent = () => {
  const page = usePeriodsPage();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-heading text-4xl font-semibold">
            Period Assignment
          </h1>
          <p className="text-muted-foreground mt-2">
            Weekly timetable for one class. Click any empty slot to fill it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      <div className="border-primary/14 bg-card flex flex-wrap items-end gap-3 border p-4">
        <div className="block min-w-0 flex-1 basis-44">
          <span className="text-muted-foreground mb-1.5 block text-xs font-extrabold tracking-[0.16em]">
            SECTION
          </span>
          <Select
            value={page.category}
            onValueChange={(value: string | null) => {
              if (value) {
                page.setCategory(value);
              }
            }}
          >
            <SelectTrigger className="w-full">
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
          <span className="text-muted-foreground mb-1.5 block text-xs font-extrabold tracking-[0.16em]">
            GRADE
          </span>
          <Select
            value={page.grade}
            onValueChange={(value: string | null) => {
              if (value) {
                page.setGrade(value);
              }
            }}
          >
            <SelectTrigger className="w-full" disabled={!page.category}>
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
          <span className="text-muted-foreground mb-1.5 block text-xs font-extrabold tracking-[0.16em]">
            CLASS
          </span>
          <Select
            value={page.selectedClassId}
            onValueChange={(value: string | null) => {
              if (value) {
                page.setSelectedClassId(value);
              }
            }}
          >
            <SelectTrigger className="w-full" disabled={!page.grade}>
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

        <div className="ml-auto flex flex-wrap items-center gap-4">
          <div>
            <div className="text-muted-foreground text-xs font-extrabold tracking-[0.16em]">
              SLOTS FILLED
            </div>
            <div className="font-heading mt-1 text-2xl leading-none font-semibold">
              {page.timetableRead === "known" ? page.timetableData.length : "—"}{" "}
              <span className="text-muted-foreground text-sm">
                / {page.periods.length * 5}
              </span>
            </div>
            {page.timetableRead === "failed" && (
              <button
                type="button"
                className="text-muted-foreground hover:text-primary mt-1 text-xs font-bold underline disabled:opacity-50"
                onClick={page.handleRetryTimetable}
              >
                This class&rsquo;s grid could not be read — try again
              </button>
            )}
          </div>
          <div className="bg-primary/14 h-9 w-px" />
          <ConflictsCheck
            conflictCount={
              page.timetableData.filter((assignment) =>
                page.conflictingAssignmentIds.has(assignment.id)
              ).length
            }
            message={page.conflictsMessage}
            onRetry={page.handleRetryConflicts}
            state={page.conflictsState}
          />
        </div>
      </div>

      {page.selectedClass ? (
        <TimetableGrid
          assignments={page.timetableData}
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
});
