import type { SessionUser } from "@school-student-teacher-management/api/context";
import { Separator } from "@school-student-teacher-management/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@school-student-teacher-management/ui/components/sidebar";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { AcademicYearGate } from "@/components/staff/academic-year-switcher/academic-year-gate";
import { getUser } from "@/functions/get-user";

const AuthLayout = () => {
  const { session } = Route.useRouteContext();

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
          <AcademicYearGate>
            <Outlet />
          </AcademicYearGate>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({
        to: "/login",
      });
    }
    return { session };
  },
  // Teachers land on their own workspace; admins keep the main dashboard.
  loader: ({ context }) => {
    if (!context.session) {
      throw redirect({
        to: "/login",
      });
    }
  },
});
