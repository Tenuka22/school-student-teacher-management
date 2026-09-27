import { createFileRoute } from "@tanstack/react-router";

import { SignupForm, SignupSkeleton } from "@/components/signup/signup-form";
import { SITE_NAME, SITE_TAGLINE, pageSeo } from "@/functions/get-site-origin";
import { getUser } from "@/functions/get-user";
import { redirectAwayFromSelf } from "@/lib/away-from-self";

/** See `/login` — `?switch=1` lets a signed-in member add or switch accounts. */
const validateSearch = (search: Record<string, unknown>) =>
  search.switch === "1" || search.switch === 1 ? { switch: 1 } : {};

export const Route = createFileRoute("/signup")({
  component: SignupForm,
  pendingComponent: SignupSkeleton,
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
      path: "/signup",
      title: `Register for staff access — ${SITE_NAME}`,
      description: `Register for an account on the ${SITE_TAGLINE} for ${SITE_NAME}, Galle. Teachers register with their NIC number; office staff accounts are issued by an administrator. Staff roles are granted after an administrator or the Principal checks the establishment.`,
    }),
});
