import { createFileRoute } from "@tanstack/react-router";

import { AdminUsersContent } from "@/components/admin/admin-users-content";
import {
  toListAccountsInput,
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
 * `validateUsersSearch` — the same function the page's hook writes through, so
 * what the route accepts and what the table shows are one list of what is
 * allowed — and read by the `loader` into `listAccounts`' input.
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
  <AdminUsersContent search={Route.useSearch()} />
);

export const Route = createFileRoute("/_auth/admin/$year/users")({
  component: AdminUsersRoute,
  validateSearch: validateUsersSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      orpc.staff.listAccounts.queryOptions({ input: toListAccountsInput(deps) })
    ),
  head: () => pageHead("Users"),
});
