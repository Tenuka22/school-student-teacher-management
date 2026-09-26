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

/**
 * A control is offered only when the procedure behind it will accept the
 * caller's role.
 *
 * The server gate is the authority — `adminProcedure`, `adminOnlyProcedure` and
 * the permission checks in `packages/api/src/index.ts` are the rules, and they
 * are not to be relaxed to make a screen convenient. The UI gate exists for a
 * different reason: so a person is never invited to fail. A teacher who is
 * handed "Add Academic Year" learns nothing from the red toast, and a Deputy
 * who is handed the attendance-policy form has filled in a form the server
 * will refuse every time.
 *
 * This shell renders for every signed-in account, so it is where that goes
 * wrong most often — anything interactive added here is a control offered to
 * all six roles unless it is explicitly withheld. Check the procedure's gate
 * before adding one, and thread the role down rather than re-deriving it.
 */

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
  /**
   * The administrator's *own* equipment, and only that. Deliberately not
   * `teacherNav`: see the note on the array itself.
   */
  adminSelfNav: NavItem[];
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
  adminSelfNav,
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
        {/*
          The administrator's own property, in a group of its own rather than
          inside "Staff Management" above. That group is the school — the roster,
          the register, the whole staff's leave — and a personal page filed under
          it reads as another thing to administer rather than as the
          administrator's own kit, which is the one thing on the sidebar that is
          about them rather than about anyone else. "Platform" is the other place
          it could have gone and is wrong for the opposite reason: those are the
          destinations every signed-in account shares, and this one is reachable
          only by a member of staff who may happen to hold a laptop.
        */}
        <NavMain label="My Workspace" items={adminSelfNav} />
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
  // the non-leadership admin account — which is also exactly the tier the
  // academic-year writes sit on (`adminOnlyProcedure` is `requireRole("admin")`).
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
  // these two roles. Every one of their links, the chain included, is built
  // from the seat's **own** workspace helper and never from `/admin`, so
  // neither seat can reach the other's area. `isPrincipal` is resolved once
  // here, in the one map below, rather than repeated as a ternary per entry.
  const leadershipLinks = isPrincipal
    ? {
        leave: principal("leaves"),
        attendance: principal("staff", "attendance"),
        equipment: principal("equipment"),
      }
    : {
        leave: deputy("leaves"),
        attendance: deputy("staff", "attendance"),
        equipment: deputy("equipment"),
      };

  /**
   * Where the equipment surfaces divide, and it divides on the *question* being
   * asked rather than on the rank of the person asking.
   *
   * - **The register** — the store's stock list, its write-offs, its custody
   *   transfers — is an administrator's tool and stays in `/admin`, deliberately.
   *   It is the one entry in `staffNav` below.
   * - **Self-service** — what *you* are in charge of, holding, or have lent —
   *   is available to every member of staff, and it is a personal page rather
   *   than a management one. So each seat reaches it **in its own workspace**:
   *   the Principal at `principal("equipment")`, the Deputy at
   *   `deputy("equipment")`, and the administrator at `teacher("equipment")`.
   *
   * **Leadership are not pointed at `/teacher/...`, and this is the point of the
   * whole arrangement rather than a detail of it.** `teacher/route.tsx` refuses
   * every role that is not `teacher` or `admin`, so a link there would bounce a
   * Principal back to their own desk — and reaching across a workspace boundary
   * to get at a page the seat's own workspace is allowed to carry is the thing
   * this sidebar's design forbids. The two new route files
   * (`principal/$year/equipment.tsx`, `deputy-principal/$year/equipment.tsx`)
   * exist so that the link below is a same-workspace link.
   *
   * **The administrator's link crossing into `/teacher` is intentional, and is
   * not a leak.** `admin` is the one role the teacher workspace admits
   * (`teacher/route.tsx`: `role !== "teacher" && role !== "admin"`), so that
   * guard already says an administrator may use the teacher's self-service pages.
   * Pointing at them rather than minting a third copy of the same page at
   * `/admin/$year/my-equipment` keeps one self-service surface in the app
   * instead of three that drift. It grants nothing the account did not already
   * hold: `custody.myItems` is scoped to the caller's own `staffId`, and
   * `staffNav` keeps the register directly above it, where it belongs.
   */
  const leadershipNav: NavItem[] = [
    {
      title: isPrincipal ? "Finalise Leave" : "Recommend Leave",
      url: leadershipLinks.leave,
    },
    // Only the Principal approves staffing; the Deputy has no say here, and
    // the server rejects the call regardless.
    ...(isPrincipal
      ? [{ title: "Teacher Requests", url: principal("teacher-requests") }]
      : []),
    { title: "Attendance", url: leadershipLinks.attendance },
    { title: "My Equipment", url: leadershipLinks.equipment },
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
    // The school-wide equipment register is an administrator's tool: it is the
    // store's stock list, its write-offs and its custody transfers, none of
    // which a teacher may read. `custody.myItems` is each member of staff's own
    // version, and it lives in *their* workspace — `teacherNav` below,
    // `leadershipNav` above, `adminSelfNav` beside this group — rather than
    // here, because that is the whole distinction between the two pages. No
    // icon, because no item in this group passes one; no badge, because a count
    // of everything in the store is not a queue — it duplicates what the
    // register page already shows and would be a fifth request on every
    // navigation to say nothing actionable.
    { title: "Equipment", url: admin("staff", "inventory") },
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
    // A teacher's own list, and the only inventory read their role can reach:
    // the two sections are their own holdings and nothing else. The register
    // above is not linked from here, because a teacher cannot open it. The same
    // page is also reached by leadership, in their own workspaces — see
    // `leadershipNav` and `adminSelfNav`.
    { title: "My Equipment", url: teacher("equipment") },
    { title: "My Profile", url: teacher("profile") },
  ];

  /**
   * The administrator's self-service entry, and it is one entry rather than the
   * whole of `teacherNav`.
   *
   * The `admin` role is admitted by `teacher/route.tsx` to the entire teacher
   * workspace, not just to the equipment page, so all four links would open. Only
   * one is offered: "Take an item" needs a `staff` row, and the seeded `admin`
   * account deliberately has none (`packages/auth/src/admin.ts`), so the other
   * three would land a member of staff on a "no staff record" notice with nothing
   * on the page to do about it. The equipment page is offered because an
   * administrator who *has* been linked to a staff record may hold school
   * property, and that page is the one place they could discover they do.
   */
  const adminSelfNav: NavItem[] = [
    { title: "My Equipment", url: teacher("equipment") },
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
          {/* The switcher's "set current" and "add year" are both
              `adminOnlyProcedure`, and this header is above the role branching
              below, so the decision has to travel down to it. `isAdmin` is the
              role this shell already resolved, not a second reading of it. */}
          <AcademicYearSwitcher canManageAcademicYears={isAdmin} />
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
          adminSelfNav={adminSelfNav}
          academicNav={academicNav}
        />
      </SidebarContent>

      <SidebarFooter className="border-sidebar-foreground/10 border-t px-3.5 py-3">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
