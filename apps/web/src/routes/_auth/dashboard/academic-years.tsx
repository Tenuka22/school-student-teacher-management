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
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import { IconCalendarPlus, IconCheck, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { AcademicYearFormSubmitData } from "@/components/staff/academic-year-switcher/academic-year-form";
import { AddAcademicYearDialog } from "@/components/staff/academic-year-switcher/add-academic-year-dialog";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard/academic-years")({
  component: RouteComponent,
});

interface AcademicYear {
  id: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

const RouteComponent = () => {
  const queryClient = useQueryClient();
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const setCurrentMutation = useMutation(
    orpc.staff.setCurrentYear.mutationOptions()
  );
  const createMutation = useMutation(
    orpc.staff.createAcademicYear.mutationOptions()
  );
  const deleteMutation = useMutation(
    orpc.staff.deleteAcademicYear.mutationOptions()
  );

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AcademicYear | null>(null);

  const years = useMemo(
    () =>
      ((yearsQuery.data || []) as unknown as AcademicYear[]).toSorted(
        (a, b) => b.year - a.year
      ),
    [yearsQuery.data]
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
    const queryKey = orpc.staff.listAcademicYears.queryKey();
    try {
      await deleteMutation.mutateAsync({ id: target.id } as never);
      queryClient.setQueryData(queryKey, (data: unknown) =>
        Array.isArray(data)
          ? data.filter((y: AcademicYear) => y.id !== target.id)
          : data
      );
      setDeleteTarget(null);
      toast.success(`Academic year ${target.year} deleted`);
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete year"
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
            className={year.isCurrent ? "border-primary" : ""}
          >
            <CardHeader>
              <CardTitle className="font-heading flex items-center justify-between text-2xl">
                {year.year}
                {year.isCurrent && (
                  <span className="bg-primary/10 text-primary flex items-center gap-1 px-2 py-0.5 text-xs font-bold">
                    <IconCheck className="size-3.5" />
                    ACTIVE
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm">
                {year.startDate && year.endDate
                  ? `${year.startDate} – ${year.endDate}`
                  : "No dates set"}
              </span>
              <div className="flex items-center gap-2">
                {!year.isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setCurrentMutation.isPending}
                    onClick={() => handleSwitchYear(year.id)}
                  >
                    Switch
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
      </div>

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
            Are you sure you want to delete {deleteTarget?.year}? This only
            works if the year has no classes, position assignments, periods, or
            homeroom history attached — otherwise it will be rejected. This
            action cannot be undone.
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
