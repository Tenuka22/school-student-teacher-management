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

import { DEFAULT_TITLE, SITE_NAME } from "@/lib/page-title";
import type { orpc } from "@/utils/orpc";

import appCss from "../index.css?url";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

const NotFound = () => (
  <main className="surface-deep bg-surface-deep text-primary-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
    <p className="text-accent text-xs font-bold tracking-[0.24em]">
      CERTA VIRILITER
    </p>
    <h1 className="type-display m-0">Page not found</h1>
    <p className="text-primary-foreground/80 type-body m-0 max-w-[46ch]">
      That address does not match anything in the College system. It may have
      moved, or the link may be out of date.
    </p>
    <Link
      to="/"
      className="bg-accent text-foreground hover:bg-accent-hover mt-2 px-7 py-3 text-[0.9375rem] font-bold transition-colors"
    >
      Go to the home page
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
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRouteWithContext<RouterAppContext>()({
  // `_notFound` marks the match that renders `notFoundComponent`; for an
  // unmatched URL that is this root route, so the tab says so (WCAG 2.4.2).
  head: ({ match }) => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: match._notFound
          ? `Page not found · ${SITE_NAME}`
          : DEFAULT_TITLE,
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      // The font files themselves are served from gstatic.
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,400&display=swap",
      },
    ],
  }),

  component: RootDocument,
  // Stops the generic "<p>Not Found</p>" and the console warning when a URL
  // matches no route (stale bookmarks, a bad deep link).
  notFoundComponent: NotFound,
});
