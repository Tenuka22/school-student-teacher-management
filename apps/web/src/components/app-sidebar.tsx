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

/**
 * Which audience this sidebar is for, and the year it is scoped to.
 *
 * Read out of `AppSidebar` so the nav-building function does not also decide who
 * is looking at it — the two used to live together, and the role branching is
 * what made the component hard to follow.
 */
const useSidebarRole = (user: AppSidebarProps["user"]) => {
  const role = user?.role;
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const currentYear = (
    (yearsQuery.data || []) as unknown as AcademicYear[]
  ).find((year) => year.isCurrent);

  return {
    isAdmin: role === "admin",
    isDeputy: role === "vicePrincipal",
    isPrincipal: role === "principal",
    isLeader: role === "principal" || role === "vicePrincipal",
    currentYear,
  };
};

interface SidebarGroupsProps {
  isAdmin: boolean;
  isLeader: boolean;
  usersUrl: string;
  staffRequestsUrl: string;
  staffRequestsCount?: string;
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
  staffRequestsUrl,
  staffRequestsCount,
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
        <NavMain
          label="Admin"
          items={[
            { title: "Users", url: usersUrl },
            {
              title: "Staff Requests",
              url: staffRequestsUrl,
              count: staffRequestsCount,
            },
          ]}
        />
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
  const { isAdmin, isDeputy, isLeader, isPrincipal, currentYear } =
    useSidebarRole(user);

  // The academic year is a path segment on every workspace link, so a
  // bookmarked page keeps its year across a refresh. Read it from the URL
  // so the switcher and the nav never disagree mid-navigation.
  const year =
    useActiveYear() ?? (currentYear ? String(currentYear.year) : undefined);
  const selectedYear = year === undefined ? currentYear?.year : Number(year);

  // The sidebar badge and the Teachers page must count the same people, so the
  // sidebar asks for the same year roster rather than the unscoped establishment.
  const staffQuery = useQuery({
    ...orpc.staff.listStaff.queryOptions({
      input: { academicYearId: currentYear?.id ?? "" },
    }),
    enabled: isAdmin && Boolean(currentYear),
  });
  const classesQuery = useQuery({
    ...orpc.staff.listClasses.queryOptions({
      input: { academicYearId: currentYear?.id ?? "" },
    }),
    enabled: isAdmin && Boolean(currentYear),
  });
  // An administrator reads the whole leave ledger rather than one reviewer's
  // queue, so the badge counts every request still waiting on a decision.
  const openLeavesQuery = useQuery({
    ...orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { year: selectedYear ?? 0, queue: "all" },
    }),
    enabled: isAdmin && selectedYear !== undefined,
  });
  const staffRequestsQuery = useQuery({
    ...orpc.staff.listTeacherRequests.queryOptions(),
    enabled: isAdmin,
  });
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
  const leadershipQueue = isPrincipal
    ? {
        leave: principal("leaves"),
        attendance: principal("staff", "attendance"),
      }
    : { leave: deputy("leaves"), attendance: deputy("staff", "attendance") };

  const leadershipNav: NavItem[] = [
    {
      title: isPrincipal ? "Finalise Leave" : "Recommend Leave",
      url: leadershipQueue.leave,
    },
    // Only the Principal approves staffing; the Deputy has no say here, and
    // the server rejects the call regardless.
    ...(isPrincipal
      ? [{ title: "Teacher Requests", url: principal("teacher-requests") }]
      : []),
    { title: "Attendance", url: leadershipQueue.attendance },
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
    { title: "Historical Data", url: admin("staff", "historical-data") },
    { title: "Attendance", url: admin("staff", "attendance") },
    {
      title: "Leave Requests",
      url: admin("staff", "leaves"),
      count: openLeavesQuery.data
        ? String(
            openLeavesQuery.data.requests.filter(
              (request) => !request.finalizedAt
            ).length
          )
        : undefined,
    },
  ];

  const teacherNav: NavItem[] = [
    { title: "My Leave", url: teacher("leave") },
    { title: "My Timetable", url: teacher("timetable") },
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
          staffRequestsUrl={admin("teacher-requests")}
          staffRequestsCount={
            staffRequestsQuery.data
              ? String(
                  staffRequestsQuery.data.filter(
                    (request) => request.emailVerified
                  ).length
                )
              : undefined
          }
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
