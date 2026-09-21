"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@school-student-teacher-management/ui/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { AcademicYearSwitcher } from "@/components/staff/academic-year-switcher/academic-year-switcher";
import { orpc } from "@/utils/orpc";

interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
}

const PLATFORM_NAV = [
  { title: "Dashboard", url: "/dashboard", isActive: true },
  { title: "Academic Years", url: "/dashboard/academic-years" },
];

const ACADEMIC_NAV = [
  { title: "Students", url: "#", disabled: true, tag: "SOON" },
  { title: "Marks & Exams", url: "#", disabled: true, tag: "SOON" },
  { title: "Reports", url: "#", disabled: true, tag: "SOON" },
];

export const AppSidebar = ({ user, ...props }: AppSidebarProps) => {
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const currentYear = (
    (yearsQuery.data || []) as unknown as AcademicYear[]
  ).find((y) => y.isCurrent);

  const staffQuery = useQuery(orpc.staff.listStaff.queryOptions());
  const classesQuery = useQuery({
    ...orpc.staff.listClasses.queryOptions({
      input: { academicYearId: currentYear?.id ?? "" },
    }),
    enabled: !!currentYear,
  });
  const qualificationsQuery = useQuery({
    ...orpc.staff.listQualifications.queryOptions({
      input: { status: "pending" },
    }),
  });

  const staffNav = [
    {
      title: "Teachers",
      url: "/dashboard/staff/teachers",
      count: staffQuery.data ? String(staffQuery.data.length) : undefined,
    },
    {
      title: "Class Assignment",
      url: "/dashboard/staff/classes",
      count: classesQuery.data ? String(classesQuery.data.length) : undefined,
    },
    { title: "Period Assignment", url: "/dashboard/staff/periods" },
    { title: "Teacher Timetable", url: "/dashboard/staff/teacher-timetable" },
    {
      title: "Qualifications",
      url: "/dashboard/staff/teachers",
      count: qualificationsQuery.data
        ? String(qualificationsQuery.data.length)
        : undefined,
    },
  ];

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="gap-0 p-0">
        <div className="border-sidebar-primary/16 flex items-center gap-3 border-b px-4.5 py-4">
          <img
            src="/uploads/college-crest.png"
            alt="St. Aloysius' College crest"
            className="h-9.5 w-auto"
          />
          <div className="min-w-0 leading-tight">
            <div className="text-sidebar-foreground truncate text-xs font-extrabold tracking-[0.04em]">
              ST. ALOYSIUS&rsquo; COLLEGE
            </div>
            <div className="text-sidebar-primary mt-0.5 text-[9px] tracking-[0.18em]">
              ADMINISTRATION
            </div>
          </div>
        </div>

        <div className="border-sidebar-foreground/10 border-b px-3.5 pt-3.5 pb-3">
          <div className="text-sidebar-foreground/50 mb-2 text-[9.5px] font-extrabold tracking-[0.18em]">
            ACADEMIC YEAR
          </div>
          <AcademicYearSwitcher />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-y-auto">
        <NavMain label="Platform" items={PLATFORM_NAV} />
        <NavMain label="Staff Management" items={staffNav} />
        <NavMain label="Academic" items={ACADEMIC_NAV} />
      </SidebarContent>

      <SidebarFooter className="border-sidebar-foreground/10 border-t px-3.5 py-3">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
