import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui-patterns/page-header";
import { orpc } from "@/utils/orpc";

import { ApproveTeacherDialog } from "./approve-teacher-dialog";
import type { TeacherRequest } from "./approve-teacher-dialog";

/**
 * People waiting on a staffing decision. The Principal and the administrator
 * approve; the server enforces that (`approveTeacherRequest` rejects anyone
 * else), so this view is only a convenience, never the gate. Approving opens
 * a review dialog first — see `ApproveTeacherDialog`.
 */
export const TeacherRequestsContent = () => {
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState<TeacherRequest | null>(null);

  const requestsQuery = useQuery(orpc.staff.listTeacherRequests.queryOptions());

  const approveMutation = useMutation(
    orpc.staff.approveTeacherRequest.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        setReviewing(null);
        toast.success("Approved — they are now a teacher");
      },
      onError: (error: Error) => {
        toast.error(error.message);
      },
    })
  );

  const requests = requestsQuery.data ?? [];
  const waiting = requests.filter((request) => request.emailVerified);
  const blocked = requests.filter((request) => !request.emailVerified);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        eyebrow="Leadership"
        title="Teacher requests"
        description={
          <>
            Accounts that asked for staff access. Check the person is on the
            College establishment, then approve — that grants the{" "}
            <strong>teacher</strong> role.
          </>
        }
      />

      {requestsQuery.isPending && (
        <p className="text-muted-foreground text-sm">Loading requests…</p>
      )}

      {!requestsQuery.isPending && requests.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nobody is waiting to be approved.
        </p>
      )}

      {waiting.length > 0 && (
        <section className="border-border bg-card">
          <h2 className="border-border text-muted-foreground type-eyebrow border-b px-[22px] py-3">
            Ready to review
          </h2>
          <ul>
            {waiting.map((request) => (
              <li
                key={request.id}
                className="border-border flex flex-wrap items-center gap-3 border-b px-[22px] py-4 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-foreground type-body block font-semibold">
                    {request.name}
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    {request.email} · username{" "}
                    <span className="font-mono">{request.username ?? "—"}</span>
                  </span>
                  <span className="text-success mt-1 block text-sm">
                    Email verified ·{" "}
                    {request.role === "teacher-requester"
                      ? "Asked to join as staff"
                      : "General account"}
                    {request.lastSeenAt === null
                      ? " · never signed in"
                      : ` · ${request.sessionCount} active session${request.sessionCount === 1 ? "" : "s"}`}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={approveMutation.isPending}
                  onClick={() => setReviewing(request)}
                  className="border-primary bg-primary text-primary-foreground hover:bg-primary-hover shrink-0 border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Review &amp; approve
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked.length > 0 && (
        <section className="border-border bg-card">
          <h2 className="border-border text-muted-foreground type-eyebrow border-b px-[22px] py-3">
            Awaiting email verification
          </h2>
          <ul>
            {blocked.map((request) => (
              <li
                key={request.id}
                className="border-border border-b px-[22px] py-4 last:border-b-0"
              >
                <span className="text-foreground type-body block font-semibold">
                  {request.name}
                </span>
                <span className="text-muted-foreground block text-sm">
                  {request.email}
                </span>
                <span className="text-destructive mt-1 block text-sm">
                  Has not entered the code sent to their address yet — they
                  cannot be approved until they do.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ApproveTeacherDialog
        isPending={approveMutation.isPending}
        onApprove={(userId) => approveMutation.mutate({ userId })}
        onOpenChange={(open) => {
          if (!open) {
            setReviewing(null);
          }
        }}
        request={reviewing}
      />
    </div>
  );
};
