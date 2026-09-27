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

import type { SeoMeta } from "@/functions/get-site-origin";
import {
  SITE_MOTTO,
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_TAGLINE,
  absoluteUrl,
  asHeadMeta,
  getSiteOrigin,
  isAuthedStack,
  readSiteOrigin,
} from "@/functions/get-site-origin";
import type { orpc } from "@/utils/orpc";

import appCss from "../index.css?url";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

const DEFAULT_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;
const DEFAULT_DESCRIPTION =
  "The College's internal staff system: staff records, classes, timetables, attendance, leave and the equipment register for St. Aloysius' College, Galle.";

const NotFound = () => (
  <main className="bg-sidebar text-primary-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
    <p className="text-accent text-xs font-extrabold tracking-[0.46em]">
      {SITE_MOTTO}
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

/**
 * The College as a searchable entity.
 *
 * Deliberately short. There is no logo file, no published telephone number, no
 * contact address and no founding date anywhere in the repository, and
 * `sameAs` would mean inventing social profiles that may not exist. A
 * `EducationalOrganization` with four verified facts is worth more to a
 * consumer than one padded with placeholders it can be caught lying about.
 */
const organizationJsonLd = (origin: string) => ({
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: SITE_SHORT_NAME,
  alternateName: SITE_NAME,
  slogan: SITE_MOTTO,
  inLanguage: "en-GB",
  ...(origin ? { url: absoluteUrl(origin, "/") } : {}),
  address: {
    "@type": "PostalAddress",
    addressLocality: "Galle",
    addressCountry: "LK",
  },
});

export const Route = createRootRouteWithContext<RouterAppContext>()({
  // Resolved once per page load and read back by every route's `head()`, so
  // canonical and Open Graph URLs are absolute during SSR and stay absolute
  // through the first client-side navigation.
  loader: () => getSiteOrigin(),

  /**
   * Document defaults. Every page overrides the title and the description
   * through `pageSeo()`; the meta de-duplication in TanStack Router resolves
   * those leaf-first, so a page always wins over what is set here.
   *
   * `title` belongs in the `meta` array as `{ title }` and **not** as a
   * top-level key of this object. Read from the installed
   * `@tanstack/router-core` types, `head()` returns exactly
   * `{ links, scripts, meta, styles }` — there is no `title` key
   * (`node_modules/@tanstack/router-core/dist/esm/route.d.ts`). It is read out
   * of the meta array at render time:
   * `headContentUtils.js` does `if (m.title) title = { tag: "title",
   * children: m.title }`, taking the first title walking leaf-to-root, so a
   * child route replaces this one.
   *
   * `script:ld+json` is read by the same function, via
   * `else if ("script:ld+json" in m)`. Neither of those two is expressible in
   * the declared `meta` type, which is why the array goes through
   * `asHeadMeta()` on the way out.
   */
  head: ({ matches }) => {
    const origin = readSiteOrigin(matches);
    const image = absoluteUrl(origin, "/og-image.png");
    // The inherited default for the whole authenticated app.
    //
    // Every route under `routes/_auth/**` requires a session before it renders
    // anything, and its route id starts with `/_auth`. Emitting this from the
    // **root** means all of them are covered by one line instead of ~40
    // hand-edited route files, and a route filed under `_auth` tomorrow is
    // covered the moment it lands. A leaf route may still declare its own
    // `robots` meta — meta tags de-duplicate by name leaf-first, so the
    // leaf's value is the one that reaches the document.
    const noindex: SeoMeta[] = isAuthedStack(matches)
      ? [{ name: "robots", content: "noindex, nofollow" }]
      : [];

    return {
      meta: asHeadMeta([
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#013405" },
        { title: DEFAULT_TITLE },
        { name: "description", content: DEFAULT_DESCRIPTION },
        { name: "application-name", content: SITE_TAGLINE },
        { property: "og:title", content: DEFAULT_TITLE },
        { property: "og:description", content: DEFAULT_DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: SITE_NAME },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: `${SITE_NAME} — ${SITE_TAGLINE}` },
        { property: "og:locale", content: "en_GB" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: DEFAULT_TITLE },
        { name: "twitter:description", content: DEFAULT_DESCRIPTION },
        { name: "twitter:image", content: image },
        { "script:ld+json": organizationJsonLd(origin) },
        ...noindex,
      ]),
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ],
    };
  },

  component: RootDocument,
  // Stops the generic "<p>Not Found</p>" and the console warning when a URL
  // matches no route (stale bookmarks, a bad deep link).
  notFoundComponent: NotFound,
});
