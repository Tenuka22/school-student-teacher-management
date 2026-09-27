import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { toDeviceSessions } from "@/lib/auth-sessions";

const ROLE_HINTS: { match: RegExp; label: string }[] = [
  { match: /^principal$/u, label: "Principal" },
  { match: /^deputy-principal$/u, label: "Deputy Principal" },
  { match: /^admin$/u, label: "Admin" },
];

/**
 * Accounts this browser still has a session for, via Better Auth's
 * multi-session cookie.
 *
 * `listDeviceSessions` and `setActiveSession` only need that cookie — not an
 * active session — so this works on the signed-out login and sign-up pages:
 * a member can hop back into an account they are still signed in to, or add
 * another one, without signing anything out.
 *
 * Three states, told apart before anything is drawn. A **failed** read is not
 * an empty list: returning `null` for both meant a network blip silently
 * removed the "continue as" list without a word, and a switch that failed left
 * the row disabled until a reload. Both now say what happened and offer the
 * way out.
 */
export const SavedAccounts = ({
  title = "Continue as",
  description = "Accounts already signed in on this browser. Pick one to switch to it.",
}: {
  title?: string;
  description?: string;
}) => {
  const [switchingToken, setSwitchingToken] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["auth", "saved-accounts"],
    queryFn: async () => {
      const { data, error } =
        await authClient.multiSession.listDeviceSessions();

      // A returned `{ error }` is a failure, not an empty list.
      if (error) {
        throw new Error(
          error.message ?? "The server did not return the account list."
        );
      }

      return toDeviceSessions(data);
    },
    retry: 1,
  });

  const handleSwitch = async (sessionToken: string) => {
    if (switchingToken !== null) {
      return;
    }

    setSwitchingToken(sessionToken);
    setSwitchError(null);

    try {
      const { error } = await authClient.multiSession.setActive({
        sessionToken,
      });

      if (error) {
        setSwitchError(
          `Could not switch to that account: ${error.message ?? "the server did not answer"}. Nothing was signed out — pick it again, or use the form above to sign in normally.`
        );
        setSwitchingToken(null);
        toast.error("Could not switch account — nothing was signed out");
        return;
      }

      toast.success("Switched account — reloading");
      window.location.assign("/");
    } catch {
      setSwitchError(
        "The College server could not be reached, so the account was not switched. Nothing was signed out — try again in a moment."
      );
      setSwitchingToken(null);
      toast.error("Could not reach the College server");
    }
  };

  const accounts = accountsQuery.data ?? [];
  const hasFailed = accountsQuery.isError;

  // Nothing to continue into, and nothing broken to report: render nothing.
  if (!hasFailed && accounts.length === 0) {
    return null;
  }

  return (
    <section
      aria-busy={accountsQuery.isPending}
      className="border-primary/15 border-t pt-[clamp(12px,2vh,20px)]"
    >
      <h2 className="text-primary m-0 text-xs font-bold tracking-[0.16em]">
        {title.toUpperCase()}
      </h2>
      <p className="text-primary/60 mt-1.5 mb-0 text-[12.5px] leading-[1.5]">
        {description}
      </p>

      {hasFailed ? (
        <div className="border-primary/25 mt-3 border p-3" role="alert">
          <p className="text-primary m-0 text-[12.5px] leading-relaxed">
            The list of accounts this browser holds could not be read, so it is
            unknown whether there are any — not empty, unreadable. Signing in
            with the form above is unaffected.
          </p>
          <button
            className="border-primary/35 text-primary hover:bg-primary/5 mt-2.5 border px-3 py-1.5 text-[12px] font-extrabold tracking-[0.1em]"
            onClick={() => {
              void accountsQuery.refetch();
            }}
            type="button"
          >
            TRY AGAIN
          </button>
        </div>
      ) : null}

      {switchError ? (
        <p
          className="border-destructive/40 bg-destructive/5 text-destructive mt-3 mb-0 border p-3 text-[12.5px] leading-relaxed"
          role="alert"
        >
          {switchError}
        </p>
      ) : null}

      {accountsQuery.isPending ? (
        <ul className="mt-3 flex list-none flex-col gap-2 p-0">
          {[0, 1].map((row) => (
            <li
              className="border-primary/20 flex items-center gap-3 border px-4 py-3"
              // eslint-disable-next-line react/no-array-index-key -- static placeholders have no stable id
              key={row}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="bg-primary/12 block h-3 w-40" />
                <span className="bg-primary/10 block h-2.5 w-56" />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="mt-3 flex list-none flex-col gap-2 p-0">
          {accounts.map((account) => {
            const hint = ROLE_HINTS.find(
              (candidate) =>
                candidate.match.test(account.user.email) ||
                candidate.match.test(account.user.name)
            );
            const isSwitching = switchingToken === account.session.token;

            return (
              <li key={account.session.token}>
                <button
                  type="button"
                  aria-busy={isSwitching}
                  disabled={switchingToken !== null}
                  onClick={() => {
                    void handleSwitch(account.session.token);
                  }}
                  className="border-primary/25 bg-card hover:border-primary flex w-full items-center gap-3 border px-4 py-3 text-left transition-colors hover:bg-white disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-primary block truncate text-sm font-bold">
                      {account.user.name}
                    </span>
                    <span className="text-primary/60 block truncate text-xs">
                      {account.user.email}
                    </span>
                  </span>
                  {hint ? (
                    <span className="text-primary/50 shrink-0 text-xs font-extrabold tracking-[0.12em]">
                      {hint.label.toUpperCase()}
                    </span>
                  ) : null}
                  <span className="text-primary min-w-[6.5rem] shrink-0 text-right text-xs font-extrabold tracking-[0.08em]">
                    {isSwitching ? "SWITCHING…" : "CONTINUE AS"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};
