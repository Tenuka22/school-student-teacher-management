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
  <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#04220A] px-6 text-center text-[#FFF8E7]">
    <p className="text-xs font-extrabold tracking-[0.46em] text-[#FFB203]">
      CERTA VIRILITER
    </p>
    <h1 className="font-heading m-0 text-[clamp(38px,7vh,72px)] leading-none font-semibold">
      Page not found
    </h1>
    <p className="m-0 max-w-[46ch] text-sm leading-relaxed text-[#FFF8E7]/70">
      That address does not match anything in the College system. It may have
      moved, or the link may be out of date.
    </p>
    <Link
      to="/"
      className="mt-2 bg-[#FFB203] px-7 py-3 text-[13px] font-extrabold tracking-[0.06em] text-[#013405] transition-colors hover:bg-[#FFD45A]"
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
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
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
        title: "My App",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
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
