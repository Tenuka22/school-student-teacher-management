export const SITE_NAME = "St. Aloysius' College";

/** The document title for the root, used when no route sets its own. */
export const DEFAULT_TITLE = `${SITE_NAME} — School Management`;

/**
 * Route `head()` result that titles the browser tab "{Page} · St. Aloysius'
 * College" (WCAG 2.4.2). TanStack Router lets the deepest matched route's
 * `title` win, so each page only has to name itself.
 */
export const pageHead = (page: string) => ({
  meta: [{ title: `${page} · ${SITE_NAME}` }],
});
