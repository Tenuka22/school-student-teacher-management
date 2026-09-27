import { createServerFn } from "@tanstack/react-start";

import { ENV } from "@/env.server";

/**
 * The one place the app decides what its own public origin is.
 *
 * Open Graph `og:url`, `og:image` and `<link rel="canonical">` are only honoured
 * by crawlers when they are **absolute**. A relative one is silently dropped, so
 * "just use the path" is not a fallback — it is a card that renders with no
 * image and a canonical that points nowhere.
 *
 * ## Where the origin comes from
 *
 * `BETTER_AUTH_URL` is the deployment's own configured base URL
 * (`apps/web/.env`, `apps/web/.env.example`, `docker-compose.yml`), and it is
 * the same value Better Auth itself uses for `baseURL` and `trustedOrigins`
 * (`packages/auth/src/index.ts`). It is deliberately **not** in
 * `PublicCoercedEnvSchema`, so it is a server-only value and this module
 * reaches it through the `.server` boundary.
 *
 * If it is ever blank, the origin falls back to the incoming request URL, which
 * is correct behind a reverse proxy that sets `x-forwarded-host` and wrong
 * behind one that does not. That is why the configured value is preferred: a
 * site URL should be a fact about the deployment, not about one request.
 */

const stripTrailingSlash = (value: string): string =>
  value.replace(/\/+$/u, "");

/** Reads `BETTER_AUTH_URL` without letting a missing variable break the page. */
const readConfiguredOrigin = (): string => {
  try {
    return ENV.BETTER_AUTH_URL.trim();
  } catch {
    // varlock's env proxy throws on a genuinely absent variable. An absent
    // site URL is a deployment mistake, not a reason to fail a page render.
    return "";
  }
};

const resolveSiteOrigin = async (): Promise<string> => {
  const configured = readConfiguredOrigin();

  if (configured) {
    return stripTrailingSlash(configured);
  }

  // Imported lazily so the client bundle never pulls in the server-only
  // request helpers: `createServerFn` strips the handler body, but a top-level
  // import of `@tanstack/react-start/server` would survive into the browser.
  const { getRequestUrl } = await import("@tanstack/react-start/server");
  return stripTrailingSlash(getRequestUrl().origin);
};

export interface SiteOrigin {
  /**
   * Absolute origin with no trailing slash, e.g. `https://sac.example.lk`.
   * Empty only when neither the configuration nor the request could supply one.
   */
  origin: string;
}

/**
 * Resolved once in the root route's loader and read back by every route's
 * `head()`, so absolute URLs are available during SSR *and* on the client's
 * first client-side navigation without a second round trip.
 */
export const getSiteOrigin = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteOrigin> => ({ origin: await resolveSiteOrigin() })
);

/** The root route's id, the one match guaranteed to carry `siteOrigin`. */
export const ROOT_ROUTE_ID = "__root__";

/**
 * Every route id under this prefix sits behind the authed shell
 * (`routes/_auth/**`), which requires a session before it renders.
 */
export const AUTHED_ROUTE_PREFIX = "/_auth";

export const SITE_NAME = "St. Aloysius' College, Galle";
export const SITE_SHORT_NAME = "St. Aloysius' College";
export const SITE_TAGLINE = "School Management System";
export const SITE_MOTTO = "CERTA VIRILITER";

/**
 * The only URLs a crawler is allowed to see.
 *
 * Everything under `/_auth` needs a session, so it is excluded here *and*
 * carries `noindex` in the document head — the two are not redundant, because
 * a `Disallow` stops a crawl and a `noindex` stops an index, and only the
 * second one helps when a URL is discovered through a link.
 */
export const PUBLIC_INDEXABLE_PATHS = ["/", "/login", "/signup"] as const;

/** Minimal shape of the match fields the SEO helpers read. */
export interface SeoMatch {
  routeId?: string;
  loaderData?: unknown;
}

/**
 * Pull the origin out of the root match's loader data.
 *
 * A route's own `head()` only receives *its own* loader data, so a child route
 * cannot read the root's directly; `matches` is the one place every match in
 * the stack is visible from any depth.
 */
export const readSiteOrigin = (matches: readonly SeoMatch[]): string => {
  for (const match of matches) {
    if (match.routeId !== ROOT_ROUTE_ID) {
      continue;
    }

    const data = match.loaderData as SiteOrigin | undefined;

    if (typeof data?.origin === "string" && data.origin.length > 0) {
      return data.origin;
    }
  }

  return "";
};

/** True when any match in the stack is an authenticated route. */
export const isAuthedStack = (matches: readonly SeoMatch[]): boolean =>
  matches.some(
    (match) =>
      typeof match.routeId === "string" &&
      match.routeId.startsWith(AUTHED_ROUTE_PREFIX)
  );

/**
 * Join an origin and a path into an absolute URL.
 *
 * Falls back to the bare path when no origin could be resolved, which is
 * useless to a crawler but is the honest thing to render next to a
 * configuration mistake: a visibly relative URL is debuggable, a silently
 * dropped one is not.
 */
export const absoluteUrl = (origin: string, path: string): string => {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${stripTrailingSlash(origin)}${suffix}` : suffix;
};

/**
 * The two members of `SeoMeta` that are **not** `<meta>` attributes.
 *
 * `head()` declares `meta` as `Array<JSX.IntrinsicElements["meta"]>`, which
 * cannot express them, but `headContentUtils.js` handles both explicitly
 * (`node_modules/@tanstack/react-router/dist/esm/headContentUtils.js`):
 *
 * - `if (m.title) title = { tag: "title", children: m.title }` — the first
 *   title walking leaf-to-root wins, so a child route replaces the root's.
 * - `else if ("script:ld+json" in m)` — serialised to
 *   `<script type="application/ld+json">`.
 *
 * So the runtime contract is real and `SeoMeta` is the honest description of
 * it. Only the declaration lags, which is what {@link asHeadMeta} bridges.
 */
export type SeoMeta =
  | { charSet: "utf-8" }
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { httpEquiv: string; content: string }
  | { "script:ld+json": Record<string, unknown> };

/** The element type `head({ meta })` declares. */
export type HeadMeta = React.JSX.IntrinsicElements["meta"];

/** The element type `head({ links })` declares. */
export type HeadLink = React.JSX.IntrinsicElements["link"];

/**
 * The single narrowing point between the runtime meta union and the type
 * `head()` declares.
 *
 * It is one function, in one file, rather than a cast at each of the ~40 route
 * call sites, so the two members the declaration cannot model are asserted
 * once and every `head()` stays a plain function call.
 */
export const asHeadMeta = (meta: SeoMeta[]): HeadMeta[] => meta as HeadMeta[];

export interface PageSeoInput {
  /** The match stack from this route's `head()` callback. */
  matches: readonly SeoMatch[];
  /** Absolute path of this page, e.g. `/login`. Used for canonical + og:url. */
  path: string;
  /** Full document title, already including the site name. */
  title: string;
  /** Sentence describing *this* page, not the product in general. */
  description: string;
  /** Adds `noindex, nofollow`. Implied for anything under `/_auth`. */
  noindex?: boolean;
  /** Extra structured data for this page, if it has any. */
  jsonLd?: Record<string, unknown>;
}

export interface PageSeo {
  meta: HeadMeta[];
  links: HeadLink[];
}

/**
 * The head block every indexable page shares: description, canonical, the full
 * Open Graph and Twitter card set, and — when the page is private — the
 * `noindex` that keeps staff records out of an index.
 *
 * `og:url`, `og:title`, `og:description` and the canonical are all emitted
 * **here** and not by the root route, because links are not de-duplicated the
 * way meta tags are: a root-level canonical would sit in the document beside
 * the page's own and a crawler would have to guess which one is meant.
 */
export const pageSeo = ({
  matches,
  path,
  title,
  description,
  noindex = false,
  jsonLd,
}: PageSeoInput): PageSeo => {
  const origin = readSiteOrigin(matches);
  const url = absoluteUrl(origin, path);
  const image = absoluteUrl(origin, "/og-image.png");
  const isPrivate = noindex || isAuthedStack(matches);

  const meta: SeoMeta[] = [
    { title },
    { name: "description", content: description },
    {
      name: "robots",
      content: isPrivate ? "noindex, nofollow" : "index, follow",
    },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: `${SITE_NAME} — ${SITE_TAGLINE}` },
    { property: "og:locale", content: "en_GB" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: `${SITE_NAME} — ${SITE_TAGLINE}` },
  ];

  if (jsonLd) {
    meta.push({ "script:ld+json": jsonLd });
  }

  // A private page gets no canonical: pointing a `noindex` URL at itself is a
  // contradiction, and there is nothing for a canonical to disambiguate.
  const links: HeadLink[] = isPrivate ? [] : [{ rel: "canonical", href: url }];

  return { meta: asHeadMeta(meta), links };
};
