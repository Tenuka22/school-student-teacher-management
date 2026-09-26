import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@school-student-teacher-management/ui/components/card";
import {
  IconCalendarPlus,
  IconCheck,
  IconRestore,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { AcademicYearFormSubmitData } from "@/components/staff/academic-year-switcher/academic-year-form";
import { AddAcademicYearDialog } from "@/components/staff/academic-year-switcher/add-academic-year-dialog";
import { orpc } from "@/utils/orpc";

interface AcademicYear {
  id: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  deletedAt: string | null;
}

const RouteComponent = () => {
  const queryClient = useQueryClient();
  // `includeDeleted: true` so this page — the one place `restoreAcademicYear`
  // is offered — can show the deleted years too. Every other reader
  // (the sidebar switcher, the academic-year gate) calls this with no input
  // and never sees them, which is the whole point of the flag.
  const yearsQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions({
      input: { includeDeleted: true },
    })
  );
  const setCurrentMutation = useMutation(
    orpc.staff.setCurrentYear.mutationOptions()
  );
  const createMutation = useMutation(
    orpc.staff.createAcademicYear.mutationOptions()
  );
  const deleteMutation = useMutation(
    orpc.staff.deleteAcademicYear.mutationOptions()
  );
  const restoreMutation = useMutation(
    orpc.staff.restoreAcademicYear.mutationOptions()
  );

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AcademicYear | null>(null);

  const allYears = useMemo(
    () =>
      ((yearsQuery.data || []) as unknown as AcademicYear[]).toSorted(
        (a, b) => b.year - a.year
      ),
    [yearsQuery.data]
  );
  const years = useMemo(
    () => allYears.filter((year) => !year.deletedAt),
    [allYears]
  );
  const deletedYears = useMemo(
    () => allYears.filter((year) => year.deletedAt),
    [allYears]
  );

  const handleSwitchYear = async (id: string) => {
    try {
      await setCurrentMutation.mutateAsync({ id } as never);
      await queryClient.invalidateQueries();
      toast.success("Switched academic year");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to switch year"
      );
    }
  };

  const handleCreateYear = async (data: AcademicYearFormSubmitData) => {
    await createMutation.mutateAsync(data as never);
    await queryClient.invalidateQueries();
    setIsAddDialogOpen(false);
    toast.success(`Academic year ${data.year} created`);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    const target = deleteTarget;
    try {
      await deleteMutation.mutateAsync({ id: target.id } as never);
      await queryClient.invalidateQueries();
      setDeleteTarget(null);
      toast.success(`Academic year ${target.year} deleted`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete year"
      );
    }
  };

  const handleRestoreYear = async (target: AcademicYear) => {
    try {
      await restoreMutation.mutateAsync({ id: target.id } as never);
      await queryClient.invalidateQueries();
      toast.success(`Academic year ${target.year} restored`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to restore year"
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">Academic Years</h1>
          <p className="text-muted-foreground mt-2">
            Every class, subject and timetable slot is scoped to one of these
            years.
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <IconCalendarPlus className="size-4" />
          Add Academic Year
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {years.map((year) => (
          <Card
            key={year.id}
            className={
              year.isCurrent
                ? "bg-primary text-primary-foreground border-t-accent gap-3.5 border-t-4 py-5"
                : "border-t-primary gap-3.5 border-t-4 py-5"
            }
          >
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <div
                  className={
                    year.isCurrent
                      ? "font-heading text-accent text-5xl leading-none font-semibold"
                      : "font-heading text-primary text-5xl leading-none font-semibold"
                  }
                >
                  {year.year}
                </div>
                <div
                  className={
                    year.isCurrent
                      ? "text-primary-foreground/65 mt-2 text-xs"
                      : "text-muted-foreground mt-2 text-xs"
                  }
                >
                  {year.startDate && year.endDate
                    ? `${year.startDate} – ${year.endDate}`
                    : "No dates set"}
                </div>
              </div>
              {year.isCurrent ? (
                <span className="bg-accent text-accent-foreground flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold tracking-wider whitespace-nowrap uppercase">
                  <IconCheck className="size-3.5" />
                  Active
                </span>
              ) : (
                <span className="bg-primary/8 text-muted-foreground px-2.5 py-1 text-[10px] font-bold tracking-wider whitespace-nowrap uppercase">
                  Past year
                </span>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3.5">
              <div
                className={
                  year.isCurrent
                    ? "border-primary-foreground/15 border-t"
                    : "border-t"
                }
              />
              <div className="flex items-center gap-2">
                {year.isCurrent ? (
                  <Button
                    disabled
                    className="disabled:text-primary-foreground/55 disabled:bg-primary-foreground/10 flex-1 text-xs font-bold tracking-wide uppercase"
                  >
                    Current year
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled={setCurrentMutation.isPending}
                    onClick={() => handleSwitchYear(year.id)}
                    className="flex-1 text-xs font-bold tracking-wide uppercase"
                  >
                    Switch to this year
                  </Button>
                )}
                {!year.isCurrent && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget(year)}
                    aria-label={`Delete academic year ${year.year}`}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        <button
          type="button"
          onClick={() => setIsAddDialogOpen(true)}
          className="border-primary/30 text-muted-foreground hover:border-primary hover:text-primary hover:bg-card flex min-h-[220px] flex-col items-center justify-center gap-2 border border-dashed p-6 text-center transition-colors"
        >
          <span className="font-heading text-4xl leading-none">+</span>
          <span className="text-sm font-bold tracking-wide">
            Add academic year
          </span>
          <span className="max-w-[24ch] text-xs leading-relaxed">
            Opens a fresh year — classes and staff can be ported forward.
          </span>
        </button>
      </div>

      {/*
        Deleted years, in a section of their own rather than mixed into the
        grid above with a muted style — a year an administrator is scanning
        for "which years are live" should not have to read a badge on every
        card to find out. Only rendered at all once there is something to
        show, for the same reason `NeedsAttention` on the dashboard hides its
        own empty state rather than printing "nothing here".
      */}
      {deletedYears.length > 0 ? (
        <div className="border-primary/14 bg-card space-y-3 border p-4">
          <h2 className="font-heading text-lg font-semibold">Deleted years</h2>
          <p className="text-muted-foreground text-sm">
            Deleting a year here only hides it — nothing was removed, because a
            year can only be deleted while it is already empty. Restore one to
            bring it back into the switcher and the grid above.
          </p>
          <div className="flex flex-col gap-2">
            {deletedYears.map((year) => (
              <div
                key={year.id}
                className="border-primary/10 flex items-center justify-between gap-3 border-t pt-2 first:border-t-0 first:pt-0"
              >
                <span className="text-sm font-medium">{year.year}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restoreMutation.isPending}
                  onClick={() => handleRestoreYear(year)}
                >
                  <IconRestore className="size-4" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <AddAcademicYearDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        existingYears={years.map((y) => y.year)}
        referenceYear={
          years.find((y) => y.isCurrent)?.year ?? new Date().getFullYear()
        }
        isLoading={createMutation.isPending}
        onSubmit={handleCreateYear}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete Academic Year</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete {deleteTarget?.year}? A year can
            only be deleted while nothing is attached to it — no classes,
            position assignments, subject assignments, leave requests, leave
            entitlements, attendance records, attendance policy, attendance
            usage, period assignments or homeroom history. Every year created
            here is seeded with leave entitlements and an attendance policy, so
            in practice a year must be emptied first. The active year cannot be
            deleted at all; switch to another year first. This only hides the
            year — nothing is removed, and it can be restored from the
            &ldquo;Deleted years&rdquo; list below.
          </AlertDialogDescription>
          <div className="flex justify-end gap-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/$year/academic-years")({
  component: RouteComponent,
});
