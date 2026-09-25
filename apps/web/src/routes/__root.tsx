import { Toaster } from "@school-student-teacher-management/ui/components/sonner";
import { TooltipProvider } from "@school-student-teacher-management/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import type { orpc } from "@/utils/orpc";

import appCss from "../index.css?url";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

const NotFound = () => (
  <main className="bg-sidebar text-primary-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
    <p className="text-accent text-xs font-extrabold tracking-[0.46em]">
      CERTA VIRILITER
    </p>
    <h1 className="font-heading m-0 text-[clamp(38px,7vh,72px)] leading-none font-semibold">
      Page not found
    </h1>
    <p className="text-primary-foreground/70 m-0 max-w-[46ch] text-sm leading-relaxed">
      That address does not match anything in the College system. It may have
      moved, or the link may be out of date.
    </p>
    <Link
      to="/"
      className="bg-accent text-primary hover:bg-accent-hover mt-2 px-7 py-3 text-[13px] font-extrabold tracking-[0.06em] transition-colors"
    >
      GO HOME
    </Link>
  </main>
);

const RootDocument = () => (
  <html lang="en">
    <head>
      <HeadContent />
    </head>
    <body>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
      <Toaster richColors />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools position="bottom-left" />
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        </>
      )}
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "St. Aloysius' College — School Management System",
      },
      {
        name: "description",
        content:
          "Staff records, classes, timetables, attendance and leave for St. Aloysius' College, Galle.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
  // Stops the generic "<p>Not Found</p>" and the console warning when a URL
  // matches no route (stale bookmarks, a bad deep link).
  notFoundComponent: NotFound,
});
