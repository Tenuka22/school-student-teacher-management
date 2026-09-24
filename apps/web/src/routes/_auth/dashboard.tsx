import { createFileRoute } from "@tanstack/react-router";

import { redirectAwayFromSelf } from "@/lib/away-from-self";

/**
 * Legacy `/dashboard` entry point. Kept so saved links keep working after
 * the move to role-scoped workspaces — every visitor is forwarded to the
 * home path for their role and leadership authority.
 */
export const Route = createFileRoute("/_auth/dashboard")({
  beforeLoad: async ({ location }) => {
    await redirectAwayFromSelf(location.pathname);
  },
});
