import { createFileRoute } from "@tanstack/react-router";

import {
  PUBLIC_INDEXABLE_PATHS,
  absoluteUrl,
  getSiteOrigin,
} from "@/functions/get-site-origin";

/**
 * The sitemap, generated rather than checked in.
 *
 * A sitemap's `<loc>` values must be absolute, and this repository does not
 * contain a production hostname — `BETTER_AUTH_URL` is the only configured
 * origin and it is per-deployment. A checked-in `public/sitemap.xml` could
 * therefore only carry a host that is wrong somewhere, and a sitemap full of
 * wrong absolute URLs is worse than no sitemap at all. Generating it here
 * means the same origin that drives the canonicals and the Open Graph URLs
 * drives the sitemap, and the two cannot disagree.
 *
 * Only the three public routes are listed. Everything under `/_auth` needs a
 * session; a sitemap entry for it would be an invitation, not a document.
 */
const buildSitemap = (origin: string): string => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = PUBLIC_INDEXABLE_PATHS.map(
    (path) => `  <url>
    <loc>${absoluteUrl(origin, path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${path === "/" ? "1.0" : "0.5"}</priority>
  </url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
};

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { origin } = await getSiteOrigin();

        return new Response(buildSitemap(origin), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
