"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@school-student-teacher-management/ui/components/sidebar";
import { IconLayoutDashboard, IconUsers } from "@tabler/icons-react";
import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { AcademicYearSwitcher } from "@/components/staff/academic-year-switcher/academic-year-switcher";

const navMain = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: <IconLayoutDashboard />,
    isActive: true,
  },
  {
    title: "Staff Management",
    url: "#",
    icon: <IconUsers />,
    items: [
      {
        title: "Teachers",
        url: "/dashboard/staff/teachers",
      },
      {
        title: "Class Assignment",
        url: "/dashboard/staff/classes",
      },
      {
        title: "Period Assignment",
        url: "/dashboard/staff/periods",
      },
      {
        title: "Teacher Timetable",
        url: "/dashboard/staff/teacher-timetable",
      },
      {
        title: "Historical Data",
        url: "/dashboard/staff/history",
      },
    ],
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
    <SidebarHeader>
      <AcademicYearSwitcher />
    </SidebarHeader>
    <SidebarContent>
      <NavMain items={navMain} />
    </SidebarContent>
    <SidebarFooter>
      <NavUser user={user} />
    </SidebarFooter>
  </Sidebar>
);
