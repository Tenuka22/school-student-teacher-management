import { createFileRoute } from "@tanstack/react-router";

import { AdminUsersContent } from "@/components/admin/admin-users-content";
import {
  toListAccountsInput,
  validateUsersRouteSearch,
  validateUsersSearch,
} from "@/components/admin/users-search";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

/**
 * The accounts list, and the seven query parameters that describe it.
 *
 * ## The list is a URL, and the URL is fetched on the server
 *
 * `?q=&role=&status=&sort=&dir=&page=&size=` are validated by
 * `validateUsersRouteSearch`, which is `validateUsersSearch` — the same function
 * the page's hook writes through, so what the route accepts and what the table
 * shows are one list of what is allowed — followed by a strip of every value that
 * is already at its default.
 *
 * **That second step is load-bearing, and it has to come second.** A route's
 * `validateSearch` return value is what the router serialises back into the address
 * bar, so a validator that returns the *filled* object puts the defaults on the URL
 * itself: this page was arriving at
 * `?q=&role=all&status=all&sort=createdAt&dir=asc&page=1&size=50`, seven params of
 * which not one narrowed anything, because omission used to happen *before*
 * validation. Clamp first, then omit, and an unfiltered list is a bare path. The
 * page re-runs the full parser over what it is handed, so both forms of the input
 * — a hand-typed URL and a link written by this page — reach the table as one type.
 *
 * The loader reads the same object into `listAccounts`' input.
 *
 * The loader is the reason the first paint is the answer rather than a spinner:
 * `ensureQueryData` runs this query **on the server**, before the HTML is sent,
 * and puts the result in the same query cache the page's `useQuery` reads. A
 * refresh, a shared link and the Back button therefore all arrive with the right
 * rows already in them, and no client fetch is needed to get started.
 *
 * `loaderDeps` is the search object: the loader must re-run when the params
 * change and must *not* re-run when they do not, or every `size` keystroke in the
 * table would be a server round trip of its own.
 */
const AdminUsersRoute = () => (
  // The validated params, read from the route rather than from `useSearch` in a
  // child: the page must not import this file, so the value is handed down.
  <AdminUsersContent search={validateUsersSearch(Route.useSearch())} />
);

export const Route = createFileRoute("/_auth/admin/$year/users")({
  component: AdminUsersRoute,
  validateSearch: validateUsersRouteSearch,
  loaderDeps: ({ search }) => search,
  // `deps` is the *stripped* search — the route's own validated type, defaults
  // omitted — so it is re-parsed here before it becomes a server input. Same
  // parser, idempotent, and it is the one place that guarantees a bare URL and a
  // hand-typed one cannot ask the server for two different things.
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      orpc.staff.listAccounts.queryOptions({
        input: toListAccountsInput(validateUsersSearch(deps)),
      })
    ),
  head: () => pageHead("Users"),
});
