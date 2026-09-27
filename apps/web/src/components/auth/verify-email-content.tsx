import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { useOtpCooldown } from "@/lib/otp-cooldown";
import type { OtpCooldown } from "@/lib/otp-cooldown";

const inputClass =
  "w-full border border-input bg-white px-3 py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring sm:text-[0.9375rem]";

const getSendLabel = (cooldown: OtpCooldown): string => {
  if (cooldown.isSending) {
    return "Sending…";
  }

  if (cooldown.isCoolingDown) {
    return `Resend in ${cooldown.secondsLeft}s`;
  }

  return cooldown.hasSent ? "Send again" : "Send code";
};

/**
 * Email verification — the only page an unverified account can reach.
 *
 * Entering the code is what sets `emailVerified`, and that flag is the gate
 * on every other route (see `_auth/route.tsx`). It is deliberately separate
 * from being granted the `teacher` role: verifying proves the address is
 * yours, while an administrator or the Principal decides whether you are on
 * the College's establishment.
 *
 * The call is `emailOtp.verifyEmail`, not `checkVerificationOtp`: the latter
 * only checks a code and reports success, leaving `emailVerified` false, so
 * the account would be bounced straight back to this page.
 */
export const VerifyEmailContent = ({
  email,
  isVerified,
}: {
  email: string;
  isVerified: boolean;
}) => {
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });

      if (error) {
        throw new Error(error.message ?? "Could not send the code");
      }
    },
    onSuccess: () => {
      setSent(true);
      toast.success(`Code sent to ${email}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const cooldown = useOtpCooldown({
    email,
    purpose: "email-verification",
    isPending: sendMutation.isPending,
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.emailOtp.verifyEmail({
        email,
        otp: otp.trim(),
      });

      if (error) {
        throw new Error(error.message ?? "That code is not valid");
      }
    },
    onSuccess: () => {
      cooldown.clear();
      toast.success("Email verified");
      // The session payload is cached, so a plain reload would still show
      // the unverified user; a hard navigation makes the guard re-evaluate.
      window.location.assign("/");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (isVerified) {
    return (
      <div className="flex flex-col gap-[18px]">
        <div>
          <h1 className="text-foreground type-page-title m-0">
            Email verified
          </h1>
          <p className="text-muted-foreground type-body mt-2">
            {email} is confirmed. Continue to your workspace.
          </p>
        </div>
        <a
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary-hover self-start px-5 py-2.5 text-sm font-semibold transition-colors"
        >
          Continue
        </a>
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-[18px]">
      <div>
        <h1 className="text-foreground type-page-title m-0">
          Verify your email
        </h1>
        <p className="text-muted-foreground type-body mt-2">
          Your account exists, but the address on it has not been confirmed.
          Enter the code we send to <strong>{email}</strong> to unlock the rest
          of the system.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Verifying confirms the address is yours. If you asked to join as
          College staff, an administrator still has to approve you before you
          become a teacher.
        </p>
      </div>

      <div className="border-border bg-card border px-[22px] py-5">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            verifyMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="verify-otp"
              className="text-foreground text-sm font-semibold"
            >
              One-time code
            </label>
            <div className="flex gap-2">
              <input
                id="verify-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                aria-describedby={sent ? "verify-otp-hint" : undefined}
                required
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                className={inputClass}
              />
              <button
                type="button"
                disabled={sendMutation.isPending || cooldown.isCoolingDown}
                onClick={() => {
                  sendMutation.mutate(undefined, {
                    onSuccess: () => cooldown.registerSend(),
                  });
                }}
                className="border-input text-foreground hover:border-primary shrink-0 border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {getSendLabel(cooldown)}
              </button>
            </div>
            {sent && (
              <output
                id="verify-otp-hint"
                className="text-muted-foreground block text-sm"
              >
                Code sent — it expires in 10 minutes. Only three guesses are
                allowed before a new code is needed.
              </output>
            )}
          </div>

          <button
            type="submit"
            disabled={verifyMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary-hover self-start px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {verifyMutation.isPending ? "Verifying…" : "Verify email"}
          </button>
        </form>
      </div>

      <p className="text-muted-foreground text-sm">
        In development the code is printed in the server console — there is no
        mail provider wired up yet. Repeated requests are held back: each resend
        waits twice as long as the last, up to five minutes.
      </p>
    </div>
  );
};
