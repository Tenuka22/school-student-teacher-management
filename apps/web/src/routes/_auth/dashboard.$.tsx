import { createFileRoute } from "@tanstack/react-router";

import { redirectAwayFromSelf } from "@/lib/away-from-self";

/**
 * Legacy `/dashboard/*` URLs (staff management, teacher portal, academic
 * years) from before the role-scoped move. Each is forwarded to the home
 * path for the visitor's role and leadership authority.
 */
export const Route = createFileRoute("/_auth/dashboard/$")({
  beforeLoad: async ({ location }) => {
    await redirectAwayFromSelf(location.pathname);
  },
});
