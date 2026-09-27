"use client";

import {
  Avatar,
  AvatarFallback,
} from "@school-student-teacher-management/ui/components/avatar";
import {
  IconBriefcase,
  IconCalendarTime,
  IconClock,
  IconLayoutDashboard,
  IconUserCircle,
} from "@tabler/icons-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { ComponentType } from "react";

import { getAvatarFallback, UserAccountMenu } from "@/components/nav-user";
import type { AccountMenuUser } from "@/components/nav-user";
import { useActiveYear, yearPath } from "@/lib/paths";

/**
 * The five destinations of the teacher's mobile bottom tab bar, in the order
 * they appear. `exact` is only true for the dashboard — every other tab owns
 * a whole subtree of routes (`/leave`, `/equipment/in-charge`, …) and should
 * stay lit for all of them, the same prefix rule `NavMain` uses for the
 * desktop sidebar.
 */
const TABS: {
  title: string;
  segment: string | undefined;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
}[] = [
  {
    title: "Dashboard",
    segment: undefined,
    icon: IconLayoutDashboard,
    exact: true,
  },
  { title: "Leave", segment: "leave", icon: IconCalendarTime },
  { title: "Timetable", segment: "timetable", icon: IconClock },
  { title: "Equipment", segment: "equipment", icon: IconBriefcase },
  { title: "Profile", segment: "profile", icon: IconUserCircle },
];

/** The page title the mobile app bar shows, resolved from the current path. */
const TITLE_BY_SEGMENT: { segment: string; title: string }[] = [
  { segment: "/leave", title: "My Leave" },
  { segment: "/timetable", title: "My Timetable" },
  { segment: "/equipment", title: "My Equipment" },
  { segment: "/profile", title: "My Profile" },
  { segment: "/account", title: "Account" },
];

const resolvePageTitle = (pathname: string): string => {
  const match = TITLE_BY_SEGMENT.find(({ segment }) =>
    pathname.includes(segment)
  );
  return match?.title ?? "My Dashboard";
};

/**
 * The teacher workspace's mobile app bar: the current page's name on the
 * left, the academic year (read-only — a teacher cannot switch years, so an
 * interactive control here would offer a write the server refuses) and the
 * account menu on the right.
 */
const TeacherMobileTopBar = ({
  title,
  year,
  user,
}: {
  title: string;
  year: string | undefined;
  user: AccountMenuUser;
}) => (
  <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur">
    <div className="min-w-0">
      <h1 className="truncate text-base font-semibold">{title}</h1>
    </div>
    <div className="flex shrink-0 items-center gap-3">
      {year && (
        <span className="border-primary/20 bg-primary/8 text-primary rounded-none border px-2 py-1 text-xs font-bold tabular-nums">
          {year}
        </span>
      )}
      <UserAccountMenu
        user={user}
        side="bottom"
        trigger={
          <button
            aria-label={`Account menu for ${user.name}`}
            className="focus-visible:ring-ring rounded-none focus-visible:ring-2 focus-visible:outline-hidden"
            type="button"
          >
            <Avatar className="bg-primary/10 text-primary size-9 rounded-none font-bold">
              <AvatarFallback className="bg-primary/10 text-primary rounded-none font-bold">
                {getAvatarFallback(user.name)}
              </AvatarFallback>
            </Avatar>
          </button>
        }
      />
    </div>
  </header>
);

/**
 * One destination in the bottom tab bar, active for its whole subtree.
 *
 * A plain button with `navigate()` rather than `Link`'s own `to` — the same
 * choice `NavMain` makes on the desktop sidebar, and for the identical
 * reason: `Link` decides `aria-current` from its own prefix-matching
 * `activeOptions`, which would mark the dashboard tab "current" on every
 * other tab's page too (`/teacher/2026` is a prefix of `/teacher/2026/leave`).
 * A button sidesteps that and leaves `isActive` — computed once, the same
 * way, for both the label colour and `aria-current`, as the only answer.
 */
const TeacherTabLink = ({
  tab,
  href,
  isActive,
}: {
  tab: (typeof TABS)[number];
  href: string;
  isActive: boolean;
}) => {
  const Icon = tab.icon;
  const navigate = useNavigate();
  return (
    <button
      aria-current={isActive ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium ${
        isActive ? "text-primary" : "text-muted-foreground"
      }`}
      onClick={() => navigate({ to: href as never })}
      type="button"
    >
      <Icon className="size-5" />
      {tab.title}
    </button>
  );
};

const TeacherBottomNav = ({
  year,
  pathname,
}: {
  year: string | undefined;
  pathname: string;
}) => (
  <nav
    aria-label="Teacher workspace"
    className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t backdrop-blur"
    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
  >
    {TABS.map((tab) => {
      const href = yearPath(
        "/teacher",
        year,
        ...(tab.segment ? [tab.segment] : [])
      );
      const isActive = tab.exact
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);
      return (
        <TeacherTabLink
          href={href}
          isActive={isActive}
          key={tab.title}
          tab={tab}
        />
      );
    })}
  </nav>
);

/**
 * The teacher workspace's mobile chrome: an app bar and a bottom tab bar
 * instead of the desktop sidebar's collapsible-drawer pattern.
 *
 * `_auth/route.tsx` renders this in place of `SidebarProvider` only for the
 * `/teacher` workspace on a narrow viewport — every other workspace, and the
 * teacher workspace at `md` and above, keeps the sidebar shell unchanged.
 */
export const TeacherWorkspaceShell = ({
  user,
  children,
}: {
  user: AccountMenuUser;
  children: React.ReactNode;
}) => {
  const { pathname } = useLocation();
  const year = useActiveYear();
  const title = resolvePageTitle(pathname);

  return (
    <div className="flex min-h-dvh flex-col">
      <TeacherMobileTopBar title={title} user={user} year={year} />
      <main className="flex-1 p-4 pb-24">{children}</main>
      <TeacherBottomNav pathname={pathname} year={year} />
    </div>
  );
};
