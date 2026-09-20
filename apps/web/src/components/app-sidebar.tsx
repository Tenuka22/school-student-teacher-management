"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@school-student-teacher-management/ui/components/sidebar";
import {
  IconCommand,
  IconLayoutDashboard,
  IconUsers,
} from "@tabler/icons-react";
import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";

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
        title: "Subject Assignment",
        url: "/dashboard/staff/subjects",
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
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            render={<a href="/dashboard" aria-label="School Management" />}
          >
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <IconCommand className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">School</span>
              <span className="truncate text-xs">Management</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavMain items={navMain} />
    </SidebarContent>
    <SidebarFooter>
      <NavUser user={user} />
    </SidebarFooter>
  </Sidebar>
);
