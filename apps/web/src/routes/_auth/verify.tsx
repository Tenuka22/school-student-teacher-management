import type { SessionUser } from "@school-student-teacher-management/api/context";
import { createFileRoute } from "@tanstack/react-router";

import { VerifyEmailContent } from "@/components/auth/verify-email-content";

const VerifyRoute = () => {
  // The session is resolved once by the authed shell's guard and handed down
  // as route context. Re-fetching it here would give the page a second source
  // of truth that can disagree with the guard on a later navigation.
  const { session } = Route.useRouteContext();
  const user = session?.user as SessionUser | undefined;

  return (
    <VerifyEmailContent
      email={user?.email ?? ""}
      isVerified={user?.emailVerified === true}
    />
  );
};

/**
 * The one page an unverified account may reach. Everything else under the
 * authed shell bounces here (see `_auth/route.tsx`), because an address that
 * has never been confirmed cannot be trusted with staff tooling.
 */
export const Route = createFileRoute("/_auth/verify")({
  component: VerifyRoute,
});
