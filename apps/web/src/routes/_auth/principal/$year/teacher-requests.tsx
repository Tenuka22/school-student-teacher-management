import { createFileRoute } from "@tanstack/react-router";

import { TeacherRequestsContent } from "@/components/admin/teacher-requests-content";

/**
 * The Principal's copy of the staffing queue. It lives in the Principal's own
 * workspace rather than under `/admin`, which is reserved for the
 * non-leadership administrator.
 */
export const Route = createFileRoute("/_auth/principal/$year/teacher-requests")(
  {
    component: TeacherRequestsContent,
  }
);
