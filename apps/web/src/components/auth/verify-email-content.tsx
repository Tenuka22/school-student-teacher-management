import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { useOtpCooldown } from "@/lib/otp-cooldown";
import type { OtpCooldown } from "@/lib/otp-cooldown";

const inputClass =
  "w-full border border-[#013405]/22 bg-white px-3 py-2.5 text-sm text-[#013405] outline-none focus:border-[#013405]";

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
          <h1 className="font-heading m-0 text-[38px] leading-[1.05] font-semibold text-[#013405]">
            Email verified
          </h1>
          <p className="mt-1.5 text-[13.5px] text-[#013405]/65">
            {email} is confirmed. Continue to your workspace.
          </p>
        </div>
        <a
          href="/"
          className="self-start bg-[#013405] px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] text-[#FFF8E7] transition-colors hover:bg-[#064A12]"
        >
          CONTINUE
        </a>
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-[18px]">
      <div>
        <h1 className="font-heading m-0 text-[38px] leading-[1.05] font-semibold text-[#013405]">
          Verify your email
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#013405]/65">
          Your account exists, but the address on it has not been confirmed.
          Enter the code we send to <strong>{email}</strong> to unlock the rest
          of the system.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#013405]/55">
          Verifying confirms the address is yours. If you asked to join as
          College staff, an administrator still has to approve you before you
          become a teacher.
        </p>
      </div>

      <div className="border border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            verifyMutation.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold tracking-[0.12em] text-[#013405]/70">
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
                className="shrink-0 border border-[#013405]/30 px-3 py-2 text-xs font-bold text-[#013405] transition-colors hover:border-[#013405] disabled:opacity-50"
              >
                {getSendLabel(cooldown)}
              </button>
            </div>
            {sent && (
              <span className="text-xs text-[#013405]/55">
                Code sent — it expires in 10 minutes. Only three guesses are
                allowed before a new code is needed.
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={verifyMutation.isPending}
            className="self-start bg-[#013405] px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] text-[#FFF8E7] transition-colors hover:bg-[#064A12] disabled:opacity-60"
          >
            {verifyMutation.isPending ? "VERIFYING…" : "VERIFY EMAIL"}
          </button>
        </form>
      </div>

      <p className="text-xs text-[#013405]/50">
        In development the code is printed in the server console — there is no
        mail provider wired up yet. Repeated requests are held back: each resend
        waits twice as long as the last, up to five minutes.
      </p>
    </div>
  );
};
