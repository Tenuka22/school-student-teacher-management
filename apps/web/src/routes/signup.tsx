import { createFileRoute, redirect } from "@tanstack/react-router";

import Loader from "@/components/loader";
import { SignupForm } from "@/components/signup/signup-form";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/signup")({
  component: SignupForm,
  pendingComponent: Loader,
  beforeLoad: async () => {
    const session = await getUser();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
});
