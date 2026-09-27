import type { SessionUser } from "@school-student-teacher-management/api/context";
import { needsVerification } from "@school-student-teacher-management/auth/roles";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@school-student-teacher-management/ui/components/sidebar";
import { useIsMobile } from "@school-student-teacher-management/ui/hooks/use-mobile";
import type { ErrorComponentProps } from "@tanstack/react-router";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
} from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { TeacherWorkspaceShell } from "@/components/staff/teacher-portal/teacher-workspace-shell";
import { getUser } from "@/functions/get-user";

/**
 * The one target the skip link jumps to.
 *
 * `SidebarInset` is the `<main>` landmark, and a fragment target only moves the
 * viewport — it does not move the keyboard, which is the whole point of the
 * link. `tabIndex={-1}` (set on the element below) makes the region
 * programmatically focusable so the next Tab continues from the content rather
 * than wrapping back to the sidebar.
 */
const MAIN_CONTENT_ID = "main-content";

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

/**
 * What a failed session guard resolves to.
 *
 * `beforeLoad` awaits `getUser()`. When that call throws — the API is
 * unreachable, the server is restarting, the session cookie cannot be read —
 * the router hands the error to the nearest `errorComponent`, and with none
 * declared anywhere it renders TanStack's default: a raw message with no way
 * forward and no product vocabulary in it. Every authenticated page in the app
 * sits under this route, so declaring it here is what turns "the guard failed"
 * from a dead end into a named failure with two real recoveries.
 *
 * The message does not claim to know *why*. The one thing a thrown guard
 * cannot tell us is whether the account is signed out or the request failed,
 * and guessing at either would be a lie told to a member of staff mid-task.
 * "Try again" re-runs the guard on the address they were already on; "Sign in"
 * is the recovery when the session really is gone.
 */
/**
 * The one line of an `unknown` thrown value worth showing a person.
 *
 * The router hands the failure over as `unknown`. An `Error` is the usual case
 * and a thrown string happens; reading `.message` off the second is what makes
 * a message render as `undefined`, which is a worse thing to show than nothing.
 */
const errorDetail = (error: unknown): string | undefined => {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : undefined;
};

const ShellError = ({ error, reset }: ErrorComponentProps) => {
  const detail = errorDetail(error);

  return (
    <div className="bg-sidebar text-primary-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-accent text-xs font-extrabold tracking-[0.46em]">
        SESSION CHECK FAILED
      </p>
      <h1 className="font-heading m-0 text-[clamp(30px,5vh,46px)] leading-tight font-semibold">
        This page could not load
      </h1>
      <p className="text-primary-foreground/80 m-0 max-w-[52ch] text-sm leading-relaxed">
        The College system could not confirm your session. That is usually a
        dropped connection or a server restart rather than anything done at this
        end. Nothing you were working on has been sent anywhere.
      </p>
      {detail ? (
        <p className="text-primary-foreground/55 m-0 max-w-[60ch] font-mono text-xs">
          {detail}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          className="bg-accent text-primary hover:bg-accent-hover px-7 py-3 text-[13px] font-extrabold tracking-[0.06em] transition-colors"
          onClick={() => {
            reset();
          }}
          type="button"
        >
          Try again
        </button>
        <Link
          className="border-accent text-accent hover:bg-accent/10 px-7 py-3 text-[13px] font-extrabold tracking-[0.06em] transition-colors"
          to="/login"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
};

const AuthLayout = () => {
  const { session, isStandalone } = Route.useRouteContext();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();

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

  // The teacher workspace gets an app-like mobile shell — a bottom tab bar
  // instead of the sidebar's collapsible drawer — on a narrow viewport only.
  // Every other workspace, and the teacher workspace at `md` and above, keeps
  // the sidebar shell below unchanged.
  if (user && isMobile && pathname.startsWith("/teacher")) {
    return (
      <TeacherWorkspaceShell user={user}>
        <Outlet />
      </TeacherWorkspaceShell>
    );
  }

  return (
    <SidebarProvider>
      {/*
        The first focusable element in the document, and the single highest-value
        accessibility change on this page. Without it, reaching the content means
        tabbing through the crest, the academic-year switcher and up to
        twenty navigation links on *every* page change — on a records tool used
        all day, that is the difference between the app being operable and not.

        It is invisible until focused, sits above the sidebar and the content
        both (`z-[60]` clears the sidebar's `z-10` and any overlay's `z-50`), and
        it is inside the provider so it is the first child of the same wrapper
        the sidebar lives in — first in DOM order, which is what decides the tab
        order.
      */}
      <a
        className="bg-primary text-primary-foreground focus:ring-ring sr-only rounded-none px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:ring-2"
        href={`#${MAIN_CONTENT_ID}`}
      >
        Skip to main content
      </a>
      <AppSidebar user={user} />
      <SidebarInset id={MAIN_CONTENT_ID} tabIndex={-1}>
        {/*
          The sidebar toggle is the only way back to a collapsed navigation, so
          it needs a bar of its own that does not scroll away. Nothing else
          belongs in it: the pages own their own `<h1>`, and a second
          breadcrumb or title here would compete with theirs.
        */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
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
  errorComponent: ShellError,
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
