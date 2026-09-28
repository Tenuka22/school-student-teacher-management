/**
 * The five readers every list's search params are parsed with.
 *
 * A surface that has a list in its URL writes its own contract file — the keys, the
 * defaults, the picklists, the mapping to the server input — because those are
 * facts about *that* list and a shared factory would have to be told all of it
 * anyway. What is genuinely the same in every list is how a value off a query
 * string is turned into something a server will accept, and that is this file.
 *
 * The rule all five follow: **an unrecognised or hostile value becomes the
 * default, never an error and never a pass-through.** A hand-edited or stale link
 * must not be able to send the server something it does not accept, because the
 * two failure modes are a 500 nobody can explain, and an empty table that reads
 * as a statement about the school. The server still validates; this is the first
 * gate, not the only one.
 */

/** A trimmed string, capped so a pasted novel cannot become a query parameter. */
export const readString = (raw: unknown, maxLength = 200): string => {
  if (typeof raw !== "string") {
    return "";
  }

  return raw.trim().slice(0, maxLength);
};

/** The one member of `allowed` that `raw` is, or nothing. */
export const readOneOf = <TValue extends string>(
  raw: unknown,
  allowed: readonly TValue[]
): TValue | undefined => allowed.find((option) => option === raw);

/** A one-based page, because a URL is read by people. Anything else is page one. */
export const readPage = (raw: unknown): number => {
  const parsed = Number(typeof raw === "string" ? raw : "");

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
};

/** One of the page sizes on offer, or the default. */
export const readPageSize = <TValue extends number>(
  raw: unknown,
  sizes: readonly TValue[],
  fallback: TValue
): TValue => {
  const parsed = Number(typeof raw === "string" ? raw : "");

  return sizes.find((size) => size === parsed) ?? fallback;
};

/** `desc`, or `asc`. An unknown direction is ascending, not an error. */
export const readDirection = (raw: unknown): "asc" | "desc" =>
  raw === "desc" ? "desc" : "asc";

/**
 * Drops the keys whose value is `undefined`, which is how a list leaves its
 * defaults off the URL.
 *
 * `?page=1&size=25&sort=name&dir=asc` on every unfiltered list is a URL nobody can
 * read and nobody can edit, and a "clear filters" that leaves four params behind is
 * not a clear. TanStack Router drops an `undefined` search value, so the absence
 * and the default are the same thing on the wire — which is what makes a shared
 * link from a filtered list and one from an unfiltered list both honest.
 */
export const omitEmptyParams = (
  params: Record<string, string | undefined>
): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  );
