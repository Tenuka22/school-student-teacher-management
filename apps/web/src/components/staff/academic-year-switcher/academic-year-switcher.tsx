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
import { useMemo, useState } from "react";
import { toast } from "sonner";

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

export const AcademicYearSwitcher = () => {
  const queryClient = useQueryClient();
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

  const handleSwitchYear = async (yearId: string) => {
    if (yearId === currentYear?.id) {
      return;
    }
    try {
      await setCurrentMutation.mutateAsync({ id: yearId } as never);
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
                    {currentYear?.startDate && currentYear?.endDate
                      ? `${currentYear.startDate} – ${currentYear.endDate}`
                      : "Select an academic year"}
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
              {windowedYears.map((year) => (
                <DropdownMenuItem
                  key={year.id}
                  onClick={() => handleSwitchYear(year.id)}
                  className={
                    year.isCurrent
                      ? "bg-primary/8 text-primary justify-between rounded-none py-2 font-semibold"
                      : "justify-between rounded-none py-2"
                  }
                >
                  <span className="font-heading text-base">{year.year}</span>
                  {year.isCurrent && (
                    <span className="text-[10px] font-bold tracking-wider">
                      ACTIVE
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-primary/10" />
            <DropdownMenuItem
              onClick={() => setIsAddDialogOpen(true)}
              className="text-primary rounded-none py-2 font-semibold"
            >
              <IconPlus className="mr-2 size-4" />
              Add Academic Year
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <AddAcademicYearDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        existingYears={years.map((y) => y.year)}
        referenceYear={currentYear?.year ?? new Date().getFullYear()}
        isLoading={createMutation.isPending}
        onSubmit={handleCreateYear}
      />
    </SidebarMenu>
  );
};
