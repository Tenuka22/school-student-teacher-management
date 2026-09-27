import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { formatApiErrorMessage } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import {
  describeAgent,
  formatWhen,
  toDeviceSessions,
} from "@/lib/auth-sessions";

/**
 * The session list could not be read.
 *
 * This one is deliberately not the generic panel. Everywhere else a failed
 * read is a missing convenience; here it is a missing fact about the security
 * of the reader's own account, and the sentence it replaces — "No other active
 * sessions." — is a claim that their account is not open anywhere else. So the
 * copy says the list is unknown, refuses to imply that the account is either
 * safe or compromised, and says what to do instead: the sessions are not
 * absent, they are unreadable, and a password change ends all of them.
 */
const SessionsUnreadable = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) => (
  <div
    className="border-destructive/30 bg-destructive/5 mt-4 border p-4"
    role="alert"
  >
    <p className="text-destructive text-sm font-bold">
      The list of active sessions could not be read
    </p>
    <p className="text-muted-foreground mt-1 text-[13px]">
      {message} That is a failure to read, not a result: this screen cannot tell
      you that your account is open elsewhere, and it cannot tell you that it
      isn&apos;t. The sessions are unknown, not absent — so there is nothing
      here to revoke. Nothing has been changed.
    </p>
    <p className="text-muted-foreground mt-1 text-[13px]">
      Try again in a moment. If it keeps failing, change your password: that
      ends every session on this account, including this one.
    </p>
    <Button className="mt-3" onClick={onRetry} size="sm" variant="outline">
      Try again
    </Button>
  </div>
);

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
      const { data, error } =
        await authClient.multiSession.listDeviceSessions();
      // A returned `{ error }` is a failure, not an empty list. Swallowing it
      // here produced `[]`, which the empty state then reported as "No other
      // active sessions" — the exact claim this screen must never make on the
      // strength of a request that did not succeed.
      if (error) {
        throw new Error(
          error.message ?? "The server did not return the session list."
        );
      }
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

  /**
   * Three states, told apart before anything is drawn.
   *
   * The empty sentence "No other active sessions." is a statement about the
   * security of this account, and it is only true on a request that succeeded.
   * It is therefore written as `isSuccess && length === 0`, so a failure can
   * never reach it — a screen that cannot tell "no other sessions" from "the
   * list could not be read" will confidently tell a reader their account is
   * closed when in fact nobody has checked.
   */
  const isListFailed = sessionsQuery.isError;
  const isListLoadedAndEmpty = sessionsQuery.isSuccess && sessions.length === 0;
  const listErrorMessage = formatApiErrorMessage(
    sessionsQuery.error,
    "The server did not return the session list."
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>
          Every browser currently signed in as this account. Revoke anything you
          do not recognise.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sessionsQuery.isPending && (
          <p className="text-muted-foreground text-sm">Loading sessions…</p>
        )}

        {isListFailed && (
          <SessionsUnreadable
            message={listErrorMessage}
            onRetry={() => {
              void sessionsQuery.refetch();
            }}
          />
        )}

        {isListLoadedAndEmpty && (
          <p className="text-muted-foreground text-sm">
            No other active sessions.
          </p>
        )}

        {sessionsQuery.isSuccess && sessions.length > 0 && (
          <ul className="flex flex-col">
            {sessions.map((entry, index) => {
              const { session, user } = entry;
              return (
                <li
                  key={session.token}
                  className="border-border flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">
                      {describeAgent(session.userAgent)}
                      {index === 0 && (
                        <span className="text-muted-foreground ml-2 text-xs font-semibold">
                          most recent
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {user.name} · {user.email}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {session.ipAddress ?? "unknown IP"} · signed in{" "}
                      {formatWhen(session.createdAt)} · expires{" "}
                      {formatWhen(session.expiresAt)}
                    </span>
                  </span>

                  <Button
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(session.token)}
                    size="sm"
                    variant="destructive"
                  >
                    Revoke
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
