import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { ApproveTeacherDialog } from "./approve-teacher-dialog";
import type { TeacherRequest } from "./approve-teacher-dialog";
import { describeBlocker } from "./request-blocker";

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
  const reviewable = requests.filter(
    (request) => request.emailVerified && describeBlocker(request) === null
  );
  const blocked = requests.filter(
    (request) => !request.emailVerified || describeBlocker(request) !== null
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
          Staff requests
        </h1>
        <p className="text-primary/65 mt-1.5 text-[13.5px]">
          People who registered asking for teaching access. Check the person is
          on the College establishment, then approve — that grants the{" "}
          <strong>teacher</strong> role and opens the teacher portal.
        </p>
      </div>

      {requestsQuery.isPending && (
        <p className="text-primary/60 text-sm">Loading requests…</p>
      )}

      {requestsQuery.isError && (
        <div className="border-destructive/30 bg-card border px-[22px] py-4">
          <p className="text-destructive text-sm font-bold">
            The request queue could not be loaded
          </p>
          <p className="text-primary/65 mt-1 text-[13px]">
            {requestsQuery.error?.message ??
              "The server did not return the queue."}{" "}
            Nobody is missing from this list as far as this page knows — try
            again.
          </p>
          <button
            type="button"
            className="border-primary/30 text-primary hover:border-primary mt-3 border px-3 py-1.5 text-xs font-bold transition-colors"
            onClick={() => requestsQuery.refetch()}
          >
            Try again
          </button>
        </div>
      )}

      {!requestsQuery.isPending &&
        !requestsQuery.isError &&
        requests.length === 0 && (
          <p className="text-primary/60 text-sm">
            Nobody is waiting to be approved.
          </p>
        )}

      {reviewable.length > 0 && (
        <section className="border-primary/14 bg-card">
          <h2 className="border-primary/10 text-primary/55 border-b px-[22px] py-3 text-xs font-extrabold tracking-[0.16em]">
            READY TO REVIEW
          </h2>
          <ul>
            {reviewable.map((request) => (
              <li
                key={request.id}
                className="border-primary/8 flex flex-wrap items-center gap-3 border-b px-[22px] py-4 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-primary block font-bold">
                    {request.name}
                  </span>
                  <span className="text-primary/60 block text-xs">
                    {request.email} · username{" "}
                    <span className="font-mono">{request.username ?? "—"}</span>
                  </span>
                  <span className="text-success mt-1 block text-xs">
                    Email verified · staff record linked
                    {request.lastSignInAt === null
                      ? " · never signed in"
                      : ` · ${request.signInCount} sign-in${
                          request.signInCount === 1 ? "" : "s"
                        } on record`}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={approveMutation.isPending}
                  onClick={() => setReviewing(request)}
                  className="border-primary bg-primary text-primary-foreground hover:bg-primary-hover shrink-0 border px-4 py-2 text-xs font-extrabold tracking-[0.04em] transition-colors disabled:opacity-50"
                >
                  REVIEW &amp; APPROVE
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked.length > 0 && (
        <section className="border-primary/14 bg-card">
          <h2 className="border-primary/10 text-primary/55 border-b px-[22px] py-3 text-xs font-extrabold tracking-[0.16em]">
            NOT READY YET
          </h2>
          <ul>
            {blocked.map((request) => (
              <li
                key={request.id}
                className="border-primary/8 border-b px-[22px] py-4 last:border-b-0"
              >
                <span className="text-primary block font-bold">
                  {request.name}
                </span>
                <span className="text-primary/60 block text-xs">
                  {request.email}
                </span>
                <span className="text-destructive mt-1 block text-xs">
                  {request.emailVerified
                    ? describeBlocker(request)
                    : "Has not entered the code sent to their address yet — they cannot be approved until they do."}
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
