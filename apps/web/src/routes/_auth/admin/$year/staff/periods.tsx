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
  AddSubjectDialog,
  AddTeacherDialog,
  DeleteSubjectConfirmDialog,
  DeleteTeacherConfirmDialog,
} from "@/components/staff/period-management/period-dialogs";
import {
  validatePeriodsRouteSearch,
  validatePeriodsSearch,
} from "@/components/staff/period-management/periods-search";
import type { PeriodsSearch } from "@/components/staff/period-management/periods-search";
import { TimetableGrid } from "@/components/staff/period-management/timetable-grid";
import { usePeriodsPage } from "@/components/staff/period-management/use-periods-page";
import { PageHeader } from "@/components/ui-patterns/page-header";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

const RouteComponent = ({ search }: { search: PeriodsSearch }) => {
  const page = usePeriodsPage(search);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Staff management"
        title="Period assignment"
        description={
          <>
            Weekly timetable for one class. Click any slot to add subjects and
            teachers.
          </>
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

        {page.periods.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-4">
            <div>
              <div className="text-muted-foreground type-eyebrow">
                Subjects assigned
              </div>
              <div className="mt-1.5 text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums">
                {page.timetableData.length}{" "}
                <span className="text-muted-foreground text-sm font-medium">
                  / {page.periods.length * 5}
                </span>
              </div>
            </div>
            <div className="bg-primary/14 h-9 w-px" />
            <div>
              <div className="text-destructive type-eyebrow">Conflicts</div>
              <div className="text-destructive mt-1.5 text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums">
                {page.timetableData.reduce(
                  (count, subject) =>
                    count +
                    subject.teachers.filter((t) =>
                      page.conflictingTeacherIds.has(t.id)
                    ).length,
                  0
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {page.selectedClass && page.periods && page.timetableData ? (
        <TimetableGrid
          subjects={page.timetableData}
          staff={page.staffMap}
          conflictingTeacherIds={page.conflictingTeacherIds}
          onAddSubjectClick={page.handleAddSubjectClick}
          onAddTeacherClick={page.handleAddTeacherClick}
          onDeleteSubjectClick={page.handleDeleteSubjectClick}
          onDeleteTeacherClick={page.handleDeleteTeacherClick}
        />
      ) : (
        <div className="border-primary/22 text-muted-foreground flex min-h-[40vh] items-center justify-center border border-dashed text-sm">
          Select a section, grade and class above to view its timetable.
        </div>
      )}

      <AddSubjectDialog
        isOpen={page.isAddSubjectDialogOpen}
        onOpenChange={(open) => page.setIsAddSubjectDialogOpen(open)}
        onSubmit={page.handleAddSubjectSubmit}
        selectedClass={page.selectedClass ?? undefined}
        selectedSlot={page.selectedSlot}
        academicYearId={page.currentYear?.id}
        isLoading={page.createSubjectMutation.isPending}
      />

      <AddTeacherDialog
        isOpen={page.isAddTeacherDialogOpen}
        onOpenChange={(open) => page.setIsAddTeacherDialogOpen(open)}
        onSubmit={page.handleAddTeacherSubmit}
        subject={page.selectedSubject}
        staff={[...page.staffMap.values()]}
        academicYearId={page.currentYear?.id}
        isLoading={page.assignTeacherMutation.isPending}
      />

      <DeleteSubjectConfirmDialog
        isOpen={page.isDeleteSubjectDialogOpen}
        onOpenChange={(open) => page.setIsDeleteSubjectDialogOpen(open)}
        onConfirm={page.handleConfirmDeleteSubject}
        isLoading={page.deleteSubjectMutation.isPending}
        subjectKey={page.selectedSubject?.subjectKey}
      />

      <DeleteTeacherConfirmDialog
        isOpen={page.isDeleteTeacherDialogOpen}
        onOpenChange={(open) => page.setIsDeleteTeacherDialogOpen(open)}
        onConfirm={page.handleConfirmDeleteTeacher}
        isLoading={page.removeTeacherMutation.isPending}
        teacherName={
          page.staffMap.get(page.selectedTeacher?.staffId ?? "")?.name
        }
      />
    </div>
  );
};

/**
 * The picks, re-read for the page.
 *
 * The route declares its search with **every field optional** — see
 * `RouteSearch` — because a route whose validated type has no optional member
 * makes its search params *required*, and then every `<Link>` to this page has to
 * restate all three defaults. The page therefore runs the same parser over what
 * it is handed; the parser clamps and fills, and is idempotent, so this is a
 * second pass over an already-valid object rather than a second opinion.
 */
const PeriodsRoute = () => (
  <RouteComponent search={validatePeriodsSearch(Route.useSearch())} />
);

/**
 * The period-assignment page, and the three query parameters that say **which
 * timetable is on screen**.
 *
 * `?section=&grade=&class=` are validated by `validatePeriodsRouteSearch`, which
 * is the same parser with the defaults *omitted* — the omission is what keeps a
 * default off the URL, and it has to happen after validation, because a validator
 * that returns the filled object is what the router serialises back into the
 * address bar.
 *
 * The page then reconciles the three against the class list it has loaded, so a
 * link whose picks do not line up shows "not chosen" rather than a timetable for a
 * class the section has nothing to do with.
 *
 * `loaderDeps` is deliberately absent: the loader fetches the class list for the
 * whole year and the staff list, neither of which depends on the picks, so making
 * it re-run when a dropdown changes would be a second request for data already in
 * the cache.
 */
export const Route = createFileRoute("/_auth/admin/$year/staff/periods")({
  component: PeriodsRoute,
  validateSearch: validatePeriodsRouteSearch,
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
