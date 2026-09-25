import { createFileRoute } from "@tanstack/react-router";

import { TeacherRequestsContent } from "@/components/admin/teacher-requests-content";

/**
 * The administrator's copy of the staffing queue.
 *
 * The page copy says the Principal and the administrator both approve, so the
 * administrator needs a way to reach it — the Principal's route sits behind a
 * `principal`-only guard, and the admin was bounced out of `/principal` with
 * no alternative.
 */
export const Route = createFileRoute("/_auth/admin/$year/teacher-requests")({
  component: TeacherRequestsContent,
});
