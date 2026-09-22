import { createFileRoute, redirect } from "@tanstack/react-router";

import Loader from "@/components/loader";
import { LeadershipSignupForm } from "@/components/signup/leadership-signup-form";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/signup/admin")({
  component: LeadershipSignupForm,
  pendingComponent: Loader,
  beforeLoad: async () => {
    const session = await getUser();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
});
