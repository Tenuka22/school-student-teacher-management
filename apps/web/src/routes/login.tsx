import { createFileRoute, redirect } from "@tanstack/react-router";

import Loader from "@/components/loader";
import { LoginForm } from "@/components/login-form";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/login")({
  component: LoginForm,
  pendingComponent: Loader,
  beforeLoad: async () => {
    const session = await getUser();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
});
