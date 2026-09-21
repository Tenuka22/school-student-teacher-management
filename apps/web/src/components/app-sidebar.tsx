"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
} from "@school-student-teacher-management/ui/components/sidebar";
import {
  IconCalendarStats,
  IconChalkboard,
  IconClockHour4,
  IconLayoutDashboard,
  IconReportAnalytics,
  IconSchool,
  IconUsers,
} from "@tabler/icons-react";
import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { AcademicYearSwitcher } from "@/components/staff/academic-year-switcher/academic-year-switcher";

const platformNav = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: <IconLayoutDashboard />,
    isActive: true,
  },
];

const staffNav = [
  {
    title: "Teachers",
    url: "/dashboard/staff/teachers",
    icon: <IconUsers />,
  },
  {
    title: "Class Assignment",
    url: "/dashboard/staff/classes",
    icon: <IconChalkboard />,
  },
  {
    title: "Period Assignment",
    url: "/dashboard/staff/periods",
    icon: <IconCalendarStats />,
  },
  {
    title: "Teacher Timetable",
    url: "/dashboard/staff/teacher-timetable",
    icon: <IconClockHour4 />,
  },
];

const academicNav = [
  {
    title: "Students",
    url: "#",
    icon: <IconSchool />,
    disabled: true,
    tag: "SOON",
  },
  {
    title: "Marks & Exams",
    url: "#",
    icon: <IconReportAnalytics />,
    disabled: true,
    tag: "SOON",
  },
];

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
}

export const AppSidebar = ({ user, ...props }: AppSidebarProps) => (
  <Sidebar variant="inset" {...props}>
    <SidebarHeader className="gap-3">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <img
          src="/uploads/college-crest.png"
          alt="St. Aloysius' College crest"
          className="h-9 w-auto"
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
      <AcademicYearSwitcher />
    </SidebarHeader>
    <SidebarContent>
      <NavMain label="Platform" items={platformNav} />
      <SidebarSeparator />
      <NavMain label="Staff Management" items={staffNav} />
      <SidebarSeparator />
      <NavMain label="Academic" items={academicNav} />
    </SidebarContent>
    <SidebarFooter>
      <NavUser user={user} />
    </SidebarFooter>
  </Sidebar>
);
