import { createFileRoute } from "@tanstack/react-router";

import Loader from "@/components/loader";
import { SignupForm } from "@/components/signup/signup-form";
import { getUser } from "@/functions/get-user";
import { redirectAwayFromSelf } from "@/lib/away-from-self";

/** See `/login` — `?switch=1` lets a signed-in member add or switch accounts. */
const validateSearch = (search: Record<string, unknown>) =>
  search.switch === "1" || search.switch === 1 ? { switch: 1 } : {};

export const Route = createFileRoute("/signup")({
  component: SignupForm,
  pendingComponent: Loader,
  validateSearch,
  beforeLoad: async ({ location, search }) => {
    const session = await getUser();

    if (session && !search.switch) {
      await redirectAwayFromSelf(location.pathname);
    }
  },
});
