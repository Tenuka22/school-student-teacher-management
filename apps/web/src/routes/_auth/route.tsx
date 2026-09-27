import type { SessionUser } from "@school-student-teacher-management/api/context";
import { needsVerification } from "@school-student-teacher-management/auth/roles";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@school-student-teacher-management/ui/components/breadcrumb";
import { Separator } from "@school-student-teacher-management/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@school-student-teacher-management/ui/components/sidebar";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { Fragment } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { AcademicYearGate } from "@/components/staff/academic-year-switcher/academic-year-gate";
import { getUser } from "@/functions/get-user";
import type { Crumb } from "@/lib/breadcrumbs";
import { getBreadcrumbs } from "@/lib/breadcrumbs";
import { useActiveYear } from "@/lib/paths";

/**
 * The two whole-page states an account can be in without a workspace. They
 * render outside the sidebar shell: neither the navigation nor the academic
 * year gate means anything to an account that cannot use them yet.
 */
const STANDALONE_PATHS = new Set(["/verify", "/pending-approval"]);

/**
 * The one page an account has to be on instead of wherever it is, or null when
 * it is already where it belongs.
 *
 * The order matters: an unconfirmed address blocks staff access outright, and
 * a confirmed requester has no workspace until approval. Both are decided from
 * the session the layout has already resolved, so this never disagrees with
 * the guard that calls it.
 */
const getRequiredPath = (
  user: SessionUser
): "/verify" | "/pending-approval" | null => {
  if (needsVerification(user)) {
    return "/verify";
  }

  if (user.role === "teacher-requester") {
    return "/pending-approval";
  }

  return null;
};

const CrumbLabel = ({ crumb, isLast }: { crumb: Crumb; isLast: boolean }) => {
  if (isLast) {
    return (
      <BreadcrumbPage className="truncate font-semibold">
        {crumb.label}
      </BreadcrumbPage>
    );
  }
  if (!crumb.href) {
    return <span>{crumb.label}</span>;
  }
  return (
    <BreadcrumbLink
      className="focus-visible:ring-ring underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
      render={<Link to={crumb.href as never} />}
    >
      {crumb.label}
    </BreadcrumbLink>
  );
};

/**
 * Where am I: sidebar toggle, the breadcrumb for the current URL and the
 * academic year the URL is scoped to (only when the URL carries one).
 */
const ShellHeader = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const year = useActiveYear();
  const crumbs = getBreadcrumbs(pathname);

  return (
    <header className="bg-background flex min-h-14 shrink-0 items-center gap-2 border-b px-4 py-2">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap text-sm">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <Fragment key={crumb.key}>
                {index > 0 && (
                  <BreadcrumbSeparator className="hidden sm:list-item" />
                )}
                <BreadcrumbItem
                  className={isLast ? "min-w-0" : "hidden sm:inline-flex"}
                >
                  <CrumbLabel crumb={crumb} isLast={isLast} />
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {year ? (
        <span className="border-input text-foreground shrink-0 border px-2 py-1 text-sm font-semibold tabular-nums">
          <span className="sr-only">Academic year </span>
          {year}
        </span>
      ) : null}
    </header>
  );
};

const AuthLayout = () => {
  const { session, isStandalone } = Route.useRouteContext();

  if (isStandalone) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-4 py-10 md:px-8">
        <Outlet />
      </main>
    );
  }

  const user =
    session && "user" in session
      ? {
          name: session.user.name || "User",
          email: session.user.email || "",
          avatar: session.user.image || undefined,
          // The client's better-auth type is missing the plugin additional
          // field; the role genuinely exists on the wire (admin plugin).
          role: (session.user as SessionUser).role || "user",
        }
      : undefined;

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground focus-visible:ring-accent sr-only z-(--z-toast) px-4 py-2.5 text-sm font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        Skip to main content
      </a>
      <AppSidebar user={user} />
      <SidebarInset>
        <ShellHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="max-w-content mx-auto flex w-full flex-1 flex-col gap-4 p-4 focus:outline-none md:p-6"
        >
          <AcademicYearGate>
            <Outlet />
          </AcademicYearGate>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  beforeLoad: async ({ location }) => {
    const session = await getUser();

    if (!session) {
      throw redirect({ to: "/login" });
    }

    const user = session.user as SessionUser;
    const path = location.pathname;
    const isStandalone = STANDALONE_PATHS.has(path);

    // Where this account has to be instead of wherever it is, if anywhere.
    const requiredPath = getRequiredPath(user);

    // Never redirect to the address already being viewed. A guard that does
    // that is an infinite redirect, which the browser reports as
    // ERR_TOO_MANY_REDIRECTS and a user experiences as a broken page.
    if (requiredPath && requiredPath !== path) {
      throw redirect({ to: requiredPath });
    }

    // The mirror image: once approved, the waiting page has nothing left to
    // say, and `/` resolves the real home path.
    if (path === "/pending-approval" && user.role !== "teacher-requester") {
      throw redirect({ to: "/" });
    }

    return { session, isStandalone };
  },
  loader: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});
