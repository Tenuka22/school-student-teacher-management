import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

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
      <div>
        <h1 className="font-heading m-0 text-[38px] leading-[1.05] font-semibold text-[#013405]">
          Teacher requests
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[#013405]/65">
          Accounts that asked for staff access. Check the person is on the
          College establishment, then approve — that grants the{" "}
          <strong>teacher</strong> role.
        </p>
      </div>

      {requestsQuery.isPending && (
        <p className="text-sm text-[#013405]/60">Loading requests…</p>
      )}

      {!requestsQuery.isPending && requests.length === 0 && (
        <p className="text-sm text-[#013405]/60">
          Nobody is waiting to be approved.
        </p>
      )}

      {waiting.length > 0 && (
        <section className="border-[#013405]/14 bg-[#fffdf6]">
          <h2 className="border-b border-[#013405]/10 px-[22px] py-3 text-xs font-extrabold tracking-[0.16em] text-[#013405]/55">
            READY TO REVIEW
          </h2>
          <ul>
            {waiting.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center gap-3 border-b border-[#013405]/8 px-[22px] py-4 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-[#013405]">
                    {request.name}
                  </span>
                  <span className="block text-xs text-[#013405]/60">
                    {request.email} · username{" "}
                    <span className="font-mono">{request.username ?? "—"}</span>
                  </span>
                  <span className="mt-1 block text-xs text-[#0B5E1A]">
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
                  className="shrink-0 border border-[#013405] bg-[#013405] px-4 py-2 text-xs font-extrabold tracking-[0.04em] text-[#FFF8E7] transition-colors hover:bg-[#064A12] disabled:opacity-50"
                >
                  REVIEW &amp; APPROVE
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked.length > 0 && (
        <section className="border-[#013405]/14 bg-[#fffdf6]">
          <h2 className="border-b border-[#013405]/10 px-[22px] py-3 text-xs font-extrabold tracking-[0.16em] text-[#013405]/55">
            AWAITING EMAIL VERIFICATION
          </h2>
          <ul>
            {blocked.map((request) => (
              <li
                key={request.id}
                className="border-b border-[#013405]/8 px-[22px] py-4 last:border-b-0"
              >
                <span className="block font-bold text-[#013405]">
                  {request.name}
                </span>
                <span className="block text-xs text-[#013405]/60">
                  {request.email}
                </span>
                <span className="mt-1 block text-xs text-[#A51919]">
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
