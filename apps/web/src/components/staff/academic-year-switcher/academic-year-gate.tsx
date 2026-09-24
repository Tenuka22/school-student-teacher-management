import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { AcademicYearBootstrap } from "./academic-year-bootstrap";

interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

/**
 * Gates every role-scoped workspace route behind having a current academic year.
 * Staff management is meaningless without one — classes, subjects, and
 * periods all filter by it — so instead of letting each page render a
 * confusing empty state, block the whole area with a clear next step.
 */
export const AcademicYearGate = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const queryClient = useQueryClient();
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const setCurrentMutation = useMutation(
    orpc.staff.setCurrentYear.mutationOptions()
  );

  const years = useMemo(
    () => (yearsQuery.data || []) as unknown as AcademicYear[],
    [yearsQuery.data]
  );

  const hasCurrent = years.some((y) => y.isCurrent);

  const handleSelectYear = async (id: string) => {
    try {
      await setCurrentMutation.mutateAsync({ id } as never);
      await queryClient.invalidateQueries();
      toast.success("Academic year selected");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to select year"
      );
    }
  };

  if (yearsQuery.isLoading) {
    return null;
  }

  if (years.length === 0) {
    return <AcademicYearBootstrap />;
  }

  if (!hasCurrent) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Select an academic year</CardTitle>
            <CardDescription>
              No academic year is currently active. Choose one to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {years
              .toSorted((a, b) => b.year - a.year)
              .map((year) => (
                <Button
                  key={year.id}
                  variant="outline"
                  onClick={() => handleSelectYear(year.id)}
                  disabled={setCurrentMutation.isPending}
                >
                  {year.year}
                </Button>
              ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
};
