import type { SessionUser } from "@school-student-teacher-management/api/context";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useRouteContext } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { AcademicYearBootstrap } from "./academic-year-bootstrap";

interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

const NoYearYet = () => (
  <div className="flex min-h-[70vh] items-center justify-center p-4">
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>No academic year is open yet</CardTitle>
        <CardDescription>
          Classes, timetables and attendance all belong to an academic year, and
          the College has not opened one. The administrator opens it; you will
          be able to reach your workspace as soon as they do.
        </CardDescription>
      </CardHeader>
    </Card>
  </div>
);

/**
 * Gates the year-scoped workspace routes behind having a current academic year.
 *
 * Staff management is meaningless without one — classes, subjects, and periods
 * all filter by it — so instead of letting each page render a confusing empty
 * state, the year-scoped area is blocked with a clear next step.
 *
 * This is mounted by each `…/$year` route rather than by the authed shell,
 * because the shell also renders `/account`. The gate used to wrap the whole
 * outlet, which meant a College with no open year locked *every* signed-in
 * person out of the one page they can always use, and showed a teacher the
 * "Create your first academic year" form — a form whose procedure is
 * administrator-only.
 */
export const AcademicYearGate = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const queryClient = useQueryClient();
  const { session } = useRouteContext({ from: "/_auth" });
  const role = (session?.user as SessionUser | undefined)?.role;
  const canOpenAYear = role === "admin";

  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const setCurrentMutation = useMutation(
    orpc.staff.setCurrentYear.mutationOptions()
  );

  const years = useMemo(
    () => (yearsQuery.data || []) as unknown as AcademicYear[],
    [yearsQuery.data]
  );

  const hasCurrent = years.some((year) => year.isCurrent);

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

  // A skeleton, not a blank page: the shell is already on screen, so an empty
  // frame reads as a broken route rather than a loading one.
  if (yearsQuery.isPending) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        Loading academic years…
      </p>
    );
  }

  if (years.length === 0) {
    return canOpenAYear ? <AcademicYearBootstrap /> : <NoYearYet />;
  }

  if (!hasCurrent) {
    if (!canOpenAYear) {
      return <NoYearYet />;
    }

    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Select an academic year</CardTitle>
            <CardDescription>
              No academic year is currently active. Choose one to continue.
              Selecting a year makes it the active year for the whole College.
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

/**
 * The `Outlet` wrapper each `…/$year` layout renders, so the gate applies to
 * year-scoped pages and nothing else.
 */
export const YearScopedOutlet = () => (
  <AcademicYearGate>
    <Outlet />
  </AcademicYearGate>
);
