import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@school-student-teacher-management/ui/components/sidebar";
import { IconChevronDown, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { replaceYearInPath } from "@/lib/paths";
import { orpc } from "@/utils/orpc";

import type { AcademicYearFormSubmitData } from "./academic-year-form";
import { AddAcademicYearDialog } from "./add-academic-year-dialog";

interface AcademicYear {
  id: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

/** How many years back/forward of the current year to surface in the switcher. */
const YEAR_WINDOW = { before: 2, after: 1 } as const;

/**
 * The line under the year in the trigger: the date range where the active year
 * has one, otherwise whatever the caller is actually able to do with the
 * control. A prompt to "Select an academic year" is only honest for an account
 * that can promote one, so the fallback follows the gate rather than the other
 * way round.
 */
const yearSubtitleFor = (
  year: AcademicYear | undefined,
  canManage: boolean
): string => {
  if (year?.startDate && year?.endDate) {
    return `${year.startDate} – ${year.endDate}`;
  }

  if (canManage) {
    return "Select an academic year";
  }

  return "Academic year";
};

interface AcademicYearSwitcherProps {
  /**
   * Whether this account may change what the school believes: promoting a year
   * to current (`setCurrentYear`) and opening a new one (`createAcademicYear`).
   * Both are `adminOnlyProcedure`. The switcher sits above the sidebar's role
   * branching, so without it every account was offered both writes and was
   * refused both — a red toast and, for the year switch, a number that did not
   * change. The decision is made once, by the shell that already knows the
   * role, and handed down.
   */
  canManageAcademicYears: boolean;
}

export const AcademicYearSwitcher = ({
  canManageAcademicYears,
}: AcademicYearSwitcherProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const setCurrentMutation = useMutation(
    orpc.staff.setCurrentYear.mutationOptions()
  );
  const createMutation = useMutation(
    orpc.staff.createAcademicYear.mutationOptions()
  );

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const years = useMemo(
    () => (yearsQuery.data || []) as unknown as AcademicYear[],
    [yearsQuery.data]
  );

  const currentYear = useMemo(() => years.find((y) => y.isCurrent), [years]);

  const windowedYears = useMemo(() => {
    if (!currentYear) {
      return years;
    }
    const allowed = new Set<number>();
    for (
      let offset = -YEAR_WINDOW.before;
      offset <= YEAR_WINDOW.after;
      offset += 1
    ) {
      allowed.add(currentYear.year + offset);
    }
    return years
      .filter((y) => allowed.has(y.year))
      .toSorted((a, b) => b.year - a.year);
  }, [years, currentYear]);

  /**
   * Switching a year does two things, in order: promote it to the school's
   * active year in the database, then rewrite the `:year` segment in the
   * current URL. The URL is what makes the choice survive a refresh or a
   * shared link, and the `$year` route guard keeps the URL and the database
   * in agreement.
   *
   * Both halves belong to the administrator. The promotion is
   * `setCurrentYear` (`adminOnlyProcedure`), and the navigation half only
   * means something *after* the promotion: `loadAcademicYearRoute` forwards any
   * year that is not the school's active year back to the active one, so for
   * everyone else a click would be undone by the guard before the page settled —
   * and would cost them the page they were on besides. That is why the years
   * below are inert for a non-administrator rather than a second, quieter
   * "switch" that quietly does not switch.
   */
  const handleSwitchYear = async (year: AcademicYear) => {
    if (year.isCurrent) {
      return;
    }
    try {
      await setCurrentMutation.mutateAsync({ id: year.id } as never);
      await queryClient.invalidateQueries();

      const next = replaceYearInPath(pathname, year.year);
      if (next) {
        navigate({ to: next as never });
      }

      toast.success(`Switched to academic year ${year.year}`);
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

  /**
   * What the trigger says under the year: the date range where there is one,
   * otherwise a prompt to act — which is only true for the administrator, since
   * promoting a year is the write this control is gated on. Everyone else is
   * told what the control is rather than invited to click it.
   */
  const yearSubtitle = yearSubtitleFor(currentYear, canManageAcademicYears);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="border-sidebar-primary/45 bg-sidebar-primary/10 hover:bg-sidebar-primary/15 data-[state=open]:bg-sidebar-primary/15 h-auto border py-2.5"
              >
                <div className="grid flex-1 text-left leading-tight">
                  <span className="font-heading text-sidebar-primary truncate text-xl leading-none font-semibold">
                    {currentYear?.year ?? "—"}
                  </span>
                  <span className="text-sidebar-foreground/70 mt-1 truncate text-xs">
                    {yearSubtitle}
                  </span>
                </div>
                <IconChevronDown className="text-sidebar-primary ml-auto size-4" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            className="border-primary/15 w-64 rounded-none border p-1.5 shadow-none"
            align="start"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground px-2 pt-1 pb-2 text-xs font-extrabold tracking-[0.18em]">
                ACADEMIC YEARS
              </DropdownMenuLabel>
              {windowedYears.map((year) => {
                // The active year stays legible for everyone: it is the year
                // they are in, and this is where they read it. A year that is
                // not active is shown but not offered — `listAcademicYears` is
                // a `protectedProcedure`, so seeing the list is free, while the
                // only way to act on it is the administrator's write.
                const isOffered = canManageAcademicYears || year.isCurrent;

                return (
                  <DropdownMenuItem
                    key={year.id}
                    disabled={!isOffered}
                    onClick={
                      isOffered ? () => handleSwitchYear(year) : undefined
                    }
                    className={
                      year.isCurrent
                        ? "bg-primary/8 text-primary justify-between rounded-none py-2 font-semibold"
                        : "justify-between rounded-none py-2"
                    }
                  >
                    <span className="font-heading text-base">{year.year}</span>
                    {year.isCurrent && (
                      <span className="text-xs font-bold tracking-wider">
                        ACTIVE
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-primary/10" />
            {canManageAcademicYears ? (
              <DropdownMenuItem
                onClick={() => setIsAddDialogOpen(true)}
                className="text-primary rounded-none py-2 font-semibold"
              >
                <IconPlus className="mr-2 size-4" />
                Add Academic Year
              </DropdownMenuItem>
            ) : (
              <DropdownMenuLabel className="text-muted-foreground px-2 py-2 text-xs leading-relaxed font-normal">
                The administrator opens, switches and closes the school&rsquo;s
                year.
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {canManageAcademicYears ? (
        <AddAcademicYearDialog
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          existingYears={years.map((y) => y.year)}
          referenceYear={currentYear?.year ?? new Date().getFullYear()}
          isLoading={createMutation.isPending}
          onSubmit={handleCreateYear}
        />
      ) : null}
    </SidebarMenu>
  );
};
