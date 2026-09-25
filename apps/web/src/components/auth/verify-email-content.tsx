import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getAuthEmailAvailability } from "@/functions/get-auth-email-availability";
import { authClient } from "@/lib/auth-client";
import { useOtpCooldown } from "@/lib/otp-cooldown";
import type { OtpCooldown } from "@/lib/otp-cooldown";

const inputClass =
  "w-full border border-primary/22 bg-white px-3 py-2.5 text-sm text-primary outline-none focus:border-primary";

const getSendLabel = (cooldown: OtpCooldown): string => {
  if (cooldown.isSending) {
    return "SENDING…";
  }

  if (cooldown.isCoolingDown) {
    return `RESEND IN ${cooldown.secondsLeft}s`;
  }

  return cooldown.hasSent ? "SEND AGAIN" : "SEND CODE";
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

  // Whether a code can actually be delivered. When it cannot, the page says so
  // instead of promising a message that will never arrive.
  const availabilityQuery = useQuery({
    queryKey: ["auth", "email-availability"],
    queryFn: ({ signal }) => getAuthEmailAvailability({ signal }),
  });
  const canDeliver = availabilityQuery.data?.canDeliver ?? true;

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
          <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
            Email verified
          </h1>
          <p className="text-primary/65 mt-1.5 text-[13.5px]">
            {email} is confirmed. Continue to your workspace.
          </p>
        </div>
        <a
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary-hover self-start px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
        >
          CONTINUE
        </a>
      </div>
    );
  }

  if (availabilityQuery.isSuccess && !canDeliver) {
    return (
      <div className="flex max-w-lg flex-col gap-[18px]">
        <div>
          <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
            Address not confirmed yet
          </h1>
          <p className="text-primary/65 mt-1.5 text-[13.5px] leading-relaxed">
            Your account exists for <strong>{email}</strong>, but this server
            cannot send a confirmation code, so the address cannot be confirmed
            from here.
          </p>
        </div>
        <div className="border-destructive/30 bg-card border px-[22px] py-5">
          <p className="text-primary/80 text-[13.5px] leading-relaxed">
            {availabilityQuery.data.guidance}
          </p>
        </div>
        <a
          href="/account"
          className="border-primary/30 text-primary hover:border-primary self-start border px-4 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
        >
          GO TO ACCOUNT
        </a>
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-[18px]">
      <div>
        <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
          Verify your email
        </h1>
        <p className="text-primary/65 mt-1.5 text-[13.5px] leading-relaxed">
          Your account exists, but the address on it has not been confirmed.
          Enter the code sent to <strong>{email}</strong> to unlock the rest of
          the system.
        </p>
        <p className="text-primary/55 mt-2 text-[13px] leading-relaxed">
          Verifying confirms the address is yours. If you asked to join as
          College staff, an administrator still has to approve you before you
          become a teacher.
        </p>
      </div>

      <div className="border-primary/14 bg-card border px-[22px] py-5">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            verifyMutation.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-primary/70 text-xs font-bold tracking-[0.12em]">
              ONE-TIME CODE
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
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
                className="border-primary/30 text-primary hover:border-primary shrink-0 border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50"
              >
                {getSendLabel(cooldown)}
              </button>
            </div>
            {sent && (
              <span className="text-primary/55 text-xs">
                Code sent — it expires in 10 minutes. Only three guesses are
                allowed before a new code is needed.
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={verifyMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary-hover self-start px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors disabled:opacity-60"
          >
            {verifyMutation.isPending ? "VERIFYING…" : "VERIFY EMAIL"}
          </button>
        </form>
      </div>

      <p className="text-primary/50 text-xs">
        Repeated requests are held back: each resend waits twice as long as the
        last, up to five minutes.
      </p>
    </div>
  );
};
