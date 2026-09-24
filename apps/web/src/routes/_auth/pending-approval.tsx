import type { SessionUser } from "@school-student-teacher-management/api/context";
import { createFileRoute } from "@tanstack/react-router";

import { PendingApprovalContent } from "@/components/auth/pending-approval-content";

const PendingApprovalRoute = () => {
  // From the authed shell's context, not a second lookup — see `verify.tsx`.
  const { session } = Route.useRouteContext();
  const user = session?.user as SessionUser | undefined;

  return (
    <PendingApprovalContent email={user?.email ?? ""} name={user?.name ?? ""} />
  );
};

/**
 * Where a verified `teacher-requester` lands. The authed shell keeps every
 * other route away from it (see `_auth/route.tsx`) and sends it back to its
 * real home once the role is no longer `teacher-requester`.
 */
export const Route = createFileRoute("/_auth/pending-approval")({
  component: PendingApprovalRoute,
});
