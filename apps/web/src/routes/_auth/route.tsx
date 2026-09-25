import type { SessionUser } from "@school-student-teacher-management/api/context";
import { needsVerification } from "@school-student-teacher-management/auth/roles";
import { Separator } from "@school-student-teacher-management/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@school-student-teacher-management/ui/components/sidebar";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { getUser } from "@/functions/get-user";

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

const AuthLayout = () => {
  const { session, isStandalone } = Route.useRouteContext();

  if (isStandalone) {
    return (
      <div className="flex min-h-dvh flex-col justify-center px-4 py-10 md:px-8">
        <Outlet />
      </div>
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
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <Outlet />
        </div>
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
