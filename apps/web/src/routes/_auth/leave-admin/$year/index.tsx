import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * This seat's whole job is the leave queue — there is no dashboard of its
 * own yet, so the workspace root forwards straight to it, mirroring how
 * `/inventory-admin/$year` used to forward to the register before it grew a
 * dashboard.
 */
export const Route = createFileRoute("/_auth/leave-admin/$year/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      href: `/leave-admin/${params.year}/staff/leaves` as never,
    });
  },
});
