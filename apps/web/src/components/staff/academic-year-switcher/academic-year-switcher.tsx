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
import { IconCalendar, IconChevronDown, IconPlus } from "@tabler/icons-react";
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

  const label = currentYear
    ? `Academic Year ${currentYear.year}`
    : "No Academic Year";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <IconCalendar className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{label}</span>
                  <span className="truncate text-xs">
                    {currentYear?.startDate && currentYear?.endDate
                      ? `${currentYear.startDate} – ${currentYear.endDate}`
                      : "Select an academic year"}
                  </span>
                </div>
                <IconChevronDown className="ml-auto size-4" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent className="w-64" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Academic Years
              </DropdownMenuLabel>
              {windowedYears.map((year) => (
                <DropdownMenuItem
                  key={year.id}
                  onClick={() => handleSwitchYear(year.id)}
                  className="justify-between"
                >
                  <span>{year.year}</span>
                  <span className="text-muted-foreground text-xs">
                    {year.isCurrent ? "Active" : ""}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsAddDialogOpen(true)}>
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
