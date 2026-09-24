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
import type { HomeBase } from "@/functions/get-home-path";
import { yearPath, useActiveYear } from "@/lib/paths";
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
    role?: string;
  };
}

interface NavItem {
  title: string;
  url: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  disabled?: boolean;
  tag?: string;
  count?: string;
}

const SOON_NAV: NavItem[] = [
  { title: "Students", url: "#", disabled: true, tag: "SOON" },
  { title: "Marks & Exams", url: "#", disabled: true, tag: "SOON" },
  { title: "Reports", url: "#", disabled: true, tag: "SOON" },
];

/** The member's workspace root and label. */
const resolveHome = (
  isAdmin: boolean,
  isPrincipal: boolean,
  isDeputy: boolean
): { base: HomeBase; title: string } => {
  if (isPrincipal) {
    return { base: "/principal", title: "Principal's Desk" };
  }
  if (isDeputy) {
    return { base: "/deputy-principal", title: "Deputy's Desk" };
  }
  if (isAdmin) {
    return { base: "/admin", title: "Admin Dashboard" };
  }
  return { base: "/teacher", title: "My Dashboard" };
};

interface SidebarGroupsProps {
  isAdmin: boolean;
  isLeader: boolean;
  usersUrl: string;
  platformNav: NavItem[];
  leadershipNav: NavItem[];
  staffNav: NavItem[];
  teacherNav: NavItem[];
  academicNav: NavItem[];
}

/**
 * Nav groups per audience. Kept out of `AppSidebar` so neither function
 * accumulates the other's branching, and so no audience ever lists the
 * same destination in two groups.
 */
const SidebarGroups = ({
  isAdmin,
  isLeader,
  usersUrl,
  platformNav,
  leadershipNav,
  staffNav,
  teacherNav,
  academicNav,
}: SidebarGroupsProps) => {
  if (isLeader) {
    return (
      <>
        <NavMain label="Platform" items={platformNav} />
        <NavMain label="Leadership" items={leadershipNav} />
      </>
    );
  }

  if (isAdmin) {
    return (
      <>
        <NavMain label="Platform" items={platformNav} />
        <NavMain label="Admin" items={[{ title: "Users", url: usersUrl }]} />
        <NavMain label="Staff Management" items={staffNav} />
        <NavMain label="Academic" items={academicNav} />
      </>
    );
  }

  return (
    <>
      <NavMain label="Platform" items={platformNav} />
      <NavMain label="My Workspace" items={teacherNav} />
      <NavMain label="Academic" items={SOON_NAV} />
    </>
  );
};

export const AppSidebar = ({ user, ...props }: AppSidebarProps) => {
  // Admins get the full staff-management nav; teachers (and anyone else)
  // get their personal workspace links instead.
  // Leadership carries its own seeded role (`principal` / `vicePrincipal`)
  // and is confined to its own workspace, so `isAdmin` here means strictly
  // the non-leadership admin account.
  const role = user?.role;
  const isPrincipal = role === "principal";
  const isDeputy = role === "vicePrincipal";
  const isLeader = isPrincipal || isDeputy;
  const isAdmin = role === "admin";
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const currentYear = (
    (yearsQuery.data || []) as unknown as AcademicYear[]
  ).find((y) => y.isCurrent);

  const staffQuery = useQuery({
    ...orpc.staff.listStaff.queryOptions(),
    enabled: isAdmin,
  });
  const classesQuery = useQuery({
    ...orpc.staff.listClasses.queryOptions({
      input: { academicYearId: currentYear?.id ?? "" },
    }),
    enabled: isAdmin && Boolean(currentYear),
  });
  const pendingLeavesQuery = useQuery({
    ...orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { queue: "deputy" },
    }),
    enabled: isAdmin,
  });

  // The academic year is a path segment on every workspace link, so a
  // bookmarked page keeps its year across a refresh. Read it from the URL
  // so the switcher and the nav never disagree mid-navigation.
  const year =
    useActiveYear() ?? (currentYear ? String(currentYear.year) : undefined);
  const admin = (...rest: string[]) => yearPath("/admin", year, ...rest);
  const teacher = (...rest: string[]) => yearPath("/teacher", year, ...rest);
  const principal = (...rest: string[]) =>
    yearPath("/principal", year, ...rest);
  const deputy = (...rest: string[]) =>
    yearPath("/deputy-principal", year, ...rest);

  const home = resolveHome(isAdmin, isPrincipal, isDeputy);

  // Platform is identical for everyone, so nobody gets a duplicate link to
  // a workspace that a lower group already lists.
  const platformNav: NavItem[] = [
    { title: home.title, url: yearPath(home.base, year) },
    { title: "Account", url: "/account" },
  ];

  // Leadership gets the review chain first — it is the work that defines
  // these two roles. Their queue lives inside their own workspace, never
  // under `/admin`, so neither can reach the other's area.
  const leadershipNav: NavItem[] = [
    isPrincipal
      ? { title: "Finalise Leave", url: principal("leaves") }
      : { title: "Recommend Leave", url: deputy("leaves") },
    // Only the Principal approves staffing; the Deputy has no say here, and
    // the server rejects the call regardless.
    ...(isPrincipal
      ? [{ title: "Teacher Requests", url: principal("teacher-requests") }]
      : []),
  ];

  const staffNav: NavItem[] = [
    {
      title: "Teachers",
      url: admin("staff", "teachers"),
      count: staffQuery.data ? String(staffQuery.data.length) : undefined,
    },
    {
      title: "Class Assignment",
      url: admin("staff", "classes"),
      count: classesQuery.data ? String(classesQuery.data.length) : undefined,
    },
    { title: "Period Assignment", url: admin("staff", "periods") },
    { title: "Teacher Timetable", url: admin("staff", "teacher-timetable") },
    { title: "Attendance", url: admin("staff", "attendance") },
    {
      title: "Leave Requests",
      url: admin("staff", "leaves"),
      count: pendingLeavesQuery.data
        ? String(pendingLeavesQuery.data.requests.length)
        : undefined,
    },
  ];

  const teacherNav: NavItem[] = [
    { title: "My Leave", url: teacher("leave") },
    { title: "My Profile", url: teacher("profile") },
  ];

  const academicNav: NavItem[] = [
    { title: "Academic Years", url: admin("academic-years") },
    ...SOON_NAV,
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
            <div className="text-sidebar-primary mt-0.5 text-xs tracking-[0.18em]">
              ADMINISTRATION
            </div>
          </div>
        </div>

        <div className="border-sidebar-foreground/10 border-b px-3.5 pt-3.5 pb-3">
          <div className="text-sidebar-foreground/50 mb-2 text-xs font-extrabold tracking-[0.18em]">
            ACADEMIC YEAR
          </div>
          <AcademicYearSwitcher />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-y-auto">
        <SidebarGroups
          isAdmin={isAdmin}
          isLeader={isLeader}
          usersUrl={admin("users")}
          platformNav={platformNav}
          leadershipNav={leadershipNav}
          staffNav={staffNav}
          teacherNav={teacherNav}
          academicNav={academicNav}
        />
      </SidebarContent>

      <SidebarFooter className="border-sidebar-foreground/10 border-t px-3.5 py-3">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
