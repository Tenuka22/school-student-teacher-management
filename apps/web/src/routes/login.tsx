import { createFileRoute } from "@tanstack/react-router";

import Loader from "@/components/loader";
import { LoginForm } from "@/components/login-form";
import { getUser } from "@/functions/get-user";
import { redirectAwayFromSelf } from "@/lib/away-from-self";
import { pageHead } from "@/lib/page-title";

/**
 * `?switch=1` is how a signed-in member reaches this page on purpose: to add
 * another account or hop back to one already in the multi-session cookie.
 * Without it, being signed in means redirecting straight to the workspace.
 */
const validateSearch = (search: Record<string, unknown>) =>
  search.switch === "1" || search.switch === 1 ? { switch: 1 } : {};

export const Route = createFileRoute("/login")({
  component: LoginForm,
  pendingComponent: () => <Loader label="the sign-in page" />,
  validateSearch,
  beforeLoad: async ({ location, search }) => {
    const session = await getUser();

    if (session && !search.switch) {
      await redirectAwayFromSelf(location.pathname);
    }
  },
  head: () => pageHead("Sign in"),
});
