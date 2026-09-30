import { createFileRoute } from "@tanstack/react-router";

import { TeachersPage } from "@/components/staff/teacher-management/teachers-page";
import {
  toListTeachersInput,
  validateTeachersRouteSearch,
  validateTeachersSearch,
} from "@/components/staff/teacher-management/teachers-search";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

/**
 * The teaching establishment, and the five query parameters that describe it.
 *
 * The page body lives in `components/staff/teacher-management/teachers-page.tsx`
 * so `/academic-admin/$year/staff/teachers` renders the identical register;
 * this route supplies the route-local facts and its own `base`.
 *
 * `?q=&sort=&dir=&page=&size=` are validated by `validateTeachersRouteSearch`:
 * `validateTeachersSearch` — the same function the page's hook writes through —
 * and then a strip of everything already at its default.
 *
 * **Clamp first, omit second, and the order is the fix.** A route's `validateSearch`
 * return value is what the router serialises into the address bar, so a validator
 * that returns the *filled* object puts the defaults on the URL: the register used
 * to open at `?sort=createdAt&dir=asc&page=1&size=25`, five params of which not one
 * narrowed anything, because the omission ran *before* validation and was
 * therefore thrown away by it. Both the page and the `loader` re-run the full
 * parser, so a bare path and a hand-typed URL cannot ask the server for two
 * different things.
 *
 * The loader is why the first paint is the answer rather than a spinner:
 * `ensureQueryData` runs the paged query **on the server**, before the HTML is sent,
 * into the same cache the page's `useQuery` reads. A refresh, a shared link and the
 * Back button all arrive with the right page of the right search already in them.
 *
 * `loaderDeps` is the search object, so the loader re-runs when the params change
 * and does *not* re-run when they do not.
 */
const TeachersRoute = () => (
  <TeachersPage
    search={validateTeachersSearch(Route.useSearch())}
    year={Route.useParams().year}
    base="/academic-admin"
  />
);

export const Route = createFileRoute(
  "/_auth/academic-admin/$year/staff/teachers"
)({
  component: TeachersRoute,
  validateSearch: validateTeachersRouteSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    // The whole establishment as well as the page of it: `listStaff` is the CSV
    // import's reconciliation input, which has to know every teacher to decide
    // create-or-update for a file's rows. It is a separate read on purpose, and
    // capping it would silently break that dialog.
    // Both reads at once: the whole establishment and the page of it are
    // independent questions, and awaiting them in sequence is a waterfall on
    // every navigation to this page.
    await Promise.all([
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
      context.queryClient.ensureQueryData(
        orpc.staff.listTeachers.queryOptions({
          input: toListTeachersInput(validateTeachersSearch(deps)),
        })
      ),
    ]);
  },
  head: () => pageHead("Teachers"),
});
