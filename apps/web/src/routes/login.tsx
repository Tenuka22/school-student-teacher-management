import { createFileRoute } from "@tanstack/react-router";

import { LoginForm, LoginSkeleton } from "@/components/login-form";
import { SITE_NAME, SITE_TAGLINE, pageSeo } from "@/functions/get-site-origin";
import { getUser } from "@/functions/get-user";
import { redirectAwayFromSelf } from "@/lib/away-from-self";

/**
 * `?switch=1` is how a signed-in member reaches this page on purpose: to add
 * another account or hop back to one already in the multi-session cookie.
 * Without it, being signed in means redirecting straight to the workspace.
 */
const validateSearch = (search: Record<string, unknown>) =>
  search.switch === "1" || search.switch === 1 ? { switch: 1 } : {};

export const Route = createFileRoute("/login")({
  component: LoginForm,
  pendingComponent: LoginSkeleton,
  validateSearch,
  beforeLoad: async ({ location, search }) => {
    const session = await getUser();

    if (session && !search.switch) {
      await redirectAwayFromSelf(location.pathname);
    }
  },
  head: ({ matches }) =>
    pageSeo({
      matches,
      path: "/login",
      title: `Sign in — ${SITE_NAME}`,
      description: `Sign in to the ${SITE_TAGLINE} for ${SITE_NAME}, Galle. Teachers use their NIC number as the username; office staff use the username issued with their account.`,
    }),
});
