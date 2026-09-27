import { ALL_ROLES } from "@school-student-teacher-management/auth/roles";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

/**
 * The columns a column header may sort by, and nothing else.
 *
 * A picklist rather than a free string because the value is interpolated into
 * an `ORDER BY`: a `sortBy` of `"(select password from account)"` must not
 * reach the query builder at all. The four are the columns the table shows —
 * `username` is deliberately absent, so a row cannot be ordered by a column that
 * is hidden by default and would appear to have no effect.
 */
const accountSortKey = v.picklist(["name", "email", "role", "createdAt"]);

/**
 * The three account states an administrator filters by.
 *
 * `active` means "not banned" and nothing more — an account whose address was
 * never confirmed is active, it simply has not confirmed yet, and folding
 * verification into this term would quietly hide the accounts the cleanup above
 * exists to find.
 */
const accountStatus = v.picklist(["active", "banned", "unverified"]);

/** Bounded so a client cannot ask for the whole table in one page. */
const MAX_PAGE_SIZE = 200;

const pageSizeSchema = v.optional(
  v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(MAX_PAGE_SIZE)),
  50
);

/**
 * The accounts page: one slice of the sign-in list, already searched, sorted,
 * filtered and counted.
 *
 * ## Why this exists beside the admin plugin's own `listUsers`
 *
 * The users table needs a search across a name, an address and a login at once,
 * and it needs the role and the ban state to be filterable **together**. The
 * admin plugin's `listUsers` can do neither: its `searchValue` matches one field
 * (`searchField` is a two-value picklist, `email` or `name`, defaulting to
 * `email`), and it takes a single `filterField`/`filterValue` pair, so "every
 * Principal who is not banned" is two requests or no request. It also swallows
 * its own failures — an unknown field comes back as a well-formed
 * `{ users: [], total: 0 }` — which on a screen whose job is to describe the
 * College's accounts is indistinguishable from "there are none".
 *
 * The audience is deliberately unchanged: `adminProcedure` is
 * `admin | principal | vicePrincipal`, and those three already hold
 * `adminAc.statements`, which is what the plugin's `user: ["list"]` check reads.
 * Nothing that could read the list before can be stopped, and nothing that was
 * stopped can now read it. The *writes* stay on the plugin, because that is where
 * the rules about the seeded institutional logins live.
 */
export const listAccounts = adminProcedure
  .input(
    v.optional(
      v.object({
        /** Matched against name, email and username at once. */
        search: v.optional(v.string()),
        role: v.optional(v.picklist(ALL_ROLES)),
        status: v.optional(accountStatus),
        sortBy: v.optional(accountSortKey, "createdAt"),
        sortDirection: v.optional(v.picklist(["asc", "desc"]), "asc"),
        /** Zero-based, as TanStack Table counts pages. */
        page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
        pageSize: pageSizeSchema,
      })
    )
  )
  .handler(async ({ input, context }) => {
    const {
      search,
      role,
      status,
      sortBy = "createdAt",
      sortDirection = "asc",
      page = 0,
      pageSize = 50,
    } = input ?? {};

    const term = search?.trim();
    const conditions: SQL[] = [];

    if (term) {
      /*
       * `\` `%` `_` escaped, so a search for `50_office` is a literal search and
       * not a single-character wildcard that matches every account in the
       * College. The escape character is doubled first, so a backslash typed
       * into the box does not turn the following `%` back into a live wildcard.
       * Postgres' default `LIKE` escape is the backslash, so no `ESCAPE` clause
       * is needed for these to be read as literals.
       */
      const pattern = `%${term.replaceAll(/[\\%_]/gu, (character) => `\\${character}`)}%`;

      // `or()` is typed as possibly-undefined because it is undefined for an
      // empty list of conditions; three conditions is never empty, so the check
      // is a narrowing rather than a `!` on a value that might really be absent.
      const matchesTerm = or(
        ilike(user.name, pattern),
        ilike(user.email, pattern),
        // `username` is nullable, and `ILIKE` on NULL is NULL, not false — which
        // is correct here: an account with no login cannot match a search for one.
        ilike(user.username, pattern)
      );

      if (matchesTerm) {
        conditions.push(matchesTerm);
      }
    }

    if (role) {
      conditions.push(eq(user.role, role));
    }

    if (status === "banned") {
      conditions.push(eq(user.banned, true));
    } else if (status === "active") {
      conditions.push(eq(user.banned, false));
    } else if (status === "unverified") {
      conditions.push(eq(user.emailVerified, false));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    /*
     * The total is counted by the same `where` as the page, so the number in the
     * footer and the rows above it cannot disagree. Counting the whole table and
     * filtering the page would report a list of a hundred accounts when eleven
     * matched.
     */
    const [counted] = await context.db
      .select({ total: count() })
      .from(user)
      .where(where);
    const total = counted?.total ?? 0;

    const sortColumn = {
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }[sortBy];
    const bySortKey =
      sortDirection === "desc" ? desc(sortColumn) : asc(sortColumn);

    /*
     * `id` breaks ties, so a page boundary cannot land between two accounts that
     * share a name and reorder them between requests. Without it, page 2 of a
     * list of duplicate names may repeat an account from page 1 and drop
     * another — a page that never holds the same rows twice.
     */
    const rows = await context.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(where)
      .orderBy(bySortKey, asc(user.id))
      .limit(pageSize)
      .offset(page * pageSize);

    return {
      accounts: rows.map((row) => ({
        ...row,
        // An ISO string, so the table sorts and formats what it is given and
        // never has to know whether it crossed a wire.
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  });
