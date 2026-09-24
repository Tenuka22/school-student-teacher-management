import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import {
  describeAgent,
  formatWhen,
  toDeviceSessions,
} from "@/lib/auth-sessions";

/**
 * Device sessions for the account that is currently active.
 *
 * Better Auth's `listDeviceSessions` is scoped to the signed-in user, so this
 * lists every browser signed in as *this* account — not the other accounts
 * kept in the multi-session cookie. Revoking here ends one device without
 * touching the others, which is the case that matters for a shared office PC.
 */
export const AccountSessions = () => {
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: ["auth", "device-sessions"],
    queryFn: async () => {
      const { data } = await authClient.multiSession.listDeviceSessions();
      return toDeviceSessions(data);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (sessionToken: string) => {
      const { error } = await authClient.multiSession.revoke({ sessionToken });
      if (error) {
        throw new Error(error.message ?? "Failed to revoke session");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["auth", "device-sessions"],
      });
      toast.success("Session revoked");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const sessions = sessionsQuery.data ?? [];

  return (
    <section className="border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
      <h2 className="font-heading text-[23px] font-semibold text-[#013405]">
        Active sessions
      </h2>
      <p className="mt-1.5 text-[13px] text-[#013405]/60">
        Every browser currently signed in as this account. Revoke anything you
        do not recognise.
      </p>

      {sessionsQuery.isPending && (
        <p className="mt-4 text-sm text-[#013405]/60">Loading sessions…</p>
      )}

      {!sessionsQuery.isPending && sessions.length === 0 && (
        <p className="mt-4 text-sm text-[#013405]/60">
          No other active sessions.
        </p>
      )}

      <ul className="mt-4 flex flex-col">
        {sessions.map((entry, index) => {
          const { session, user } = entry;
          return (
            <li
              key={session.token}
              className="flex flex-wrap items-center gap-3 border-b border-[#013405]/10 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[#013405]">
                  {describeAgent(session.userAgent)}
                  {index === 0 && (
                    <span className="ml-2 text-xs font-semibold text-[#013405]/55">
                      most recent
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-[#013405]/55">
                  {user.name} · {user.email}
                </span>
                <span className="mt-0.5 block text-xs text-[#013405]/55">
                  {session.ipAddress ?? "unknown IP"} · signed in{" "}
                  {formatWhen(session.createdAt)} · expires{" "}
                  {formatWhen(session.expiresAt)}
                </span>
              </span>

              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="border border-[#A51919]/40 px-3 py-1.5 text-xs font-bold text-[#A51919] transition-colors hover:border-[#A51919] disabled:opacity-50"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(session.token)}
                >
                  Revoke
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
