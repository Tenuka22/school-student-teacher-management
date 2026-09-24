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
 */
export const SavedAccounts = ({
  title = "Continue as",
  description = "Accounts already signed in on this browser. Pick one to switch to it.",
}: {
  title?: string;
  description?: string;
}) => {
  const [switchingToken, setSwitchingToken] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["auth", "saved-accounts"],
    queryFn: async () => {
      const { data } = await authClient.multiSession.listDeviceSessions();
      return toDeviceSessions(data);
    },
  });

  const handleSwitch = async (sessionToken: string) => {
    setSwitchingToken(sessionToken);

    const { error } = await authClient.multiSession.setActive({ sessionToken });

    if (error) {
      toast.error(error.message ?? "Could not switch account");
      setSwitchingToken(null);
      return;
    }

    toast.success("Signed in — reloading");
    window.location.assign("/");
  };

  const accounts = accountsQuery.data ?? [];

  if (accountsQuery.isPending || accounts.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-[#013405]/12 pt-[clamp(12px,2vh,20px)]">
      <h2 className="text-xs font-bold tracking-[0.16em] text-[#013405]">
        {title.toUpperCase()}
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[#013405]/55">
        {description}
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {accounts.map((account) => {
          const hint = ROLE_HINTS.find(
            (candidate) =>
              candidate.match.test(account.user.email) ||
              candidate.match.test(account.user.name)
          );

          return (
            <li key={account.session.token}>
              <button
                type="button"
                disabled={switchingToken !== null}
                onClick={() => handleSwitch(account.session.token)}
                className="flex w-full items-center gap-3 border border-[#013405]/20 bg-[#fffdf6] px-4 py-3 text-left transition-colors hover:border-[#013405] hover:bg-white disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[#013405]">
                    {account.user.name}
                  </span>
                  <span className="block truncate text-xs text-[#013405]/55">
                    {account.user.email}
                  </span>
                </span>
                {hint && (
                  <span className="shrink-0 text-xs font-extrabold tracking-[0.12em] text-[#013405]/45">
                    {hint.label.toUpperCase()}
                  </span>
                )}
                <span className="shrink-0 text-xs font-extrabold tracking-[0.08em] text-[#013405]">
                  {switchingToken === account.session.token
                    ? "SWITCHING…"
                    : "CONTINUE"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
