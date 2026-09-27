import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { getAuthEmailAvailability } from "@/functions/get-auth-email-availability";
import { authClient } from "@/lib/auth-client";
import { useOtpCooldown } from "@/lib/otp-cooldown";
import type { OtpCooldown } from "@/lib/otp-cooldown";

const inputClass =
  "w-full border border-primary/25 bg-white px-3 py-2.5 text-sm text-primary outline-none placeholder:text-primary/70 focus:border-primary focus:shadow-[0_0_0_2px_var(--primary)]";

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
 * Names the problem and the recovery for the three things that can go wrong
 * here, so a bare status string never reaches the page.
 */
/**
 * What the code panel is currently offering, said out loud.
 *
 * The countdown is the important case: a disabled "send" button with no
 * explanation reads as a broken page, and a countdown that is only visible is
 * not announced to a screen reader at all. This states the hold-back *and*
 * reassures that a code already sent still works and can still be entered.
 */
const getSendHelp = (cooldown: OtpCooldown, sent: boolean): string => {
  if (cooldown.isCoolingDown) {
    return `A code was sent recently. Sending another is held back for another ${cooldown.secondsLeft} seconds — a code already sent is still valid, and you can still enter it below.`;
  }

  if (sent) {
    return "Code sent — it expires in 10 minutes. Only three guesses are allowed before a new code is needed.";
  }

  return "No code requested yet. The code expires 10 minutes after it is sent, and three wrong guesses need a new one.";
};

const describeSendFailure = (error: Error, email: string): string => {
  const detail = error.message.trim();

  if (/rate|limit|too many|throttle/iu.test(detail)) {
    return `The College server is holding back further codes for ${email}. Wait for the countdown to finish, then send again — a code already sent is still valid.`;
  }

  if (/not found|no user|does not exist|404/iu.test(detail)) {
    return `No account on this server uses ${email}. Check the address you registered with, or register again from the staff sign-up page.`;
  }

  return `The code could not be sent: ${detail}. Nothing has changed on your account — wait a moment and send it again, or ask an administrator to confirm your address.`;
};

const describeVerifyFailure = (error: Error): string => {
  const detail = error.message.trim();

  if (/expired/iu.test(detail)) {
    return "That code has expired. Send a new one and enter it straight away — the form below will not lock you out.";
  }

  if (/attempts|too many|limit/iu.test(detail)) {
    return "Too many wrong codes have been entered. Send a fresh code and try once more; the countdown below controls how soon you can.";
  }

  return `${detail || "That code was not accepted."} Check the digits in the email, or send a new code and enter that one.`;
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
  const [formError, setFormError] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

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
        throw new Error(error.message ?? "The server did not send the code");
      }
    },
    onSuccess: () => {
      setSent(true);
      setFormError(null);
      toast.success(`Code sent to ${email}`);
      otpRef.current?.focus();
    },
    onError: (error: Error) => {
      const message = describeSendFailure(error, email);
      setFormError(message);
      toast.error(message);
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
      const message = describeVerifyFailure(error);
      setFormError(message);
      toast.error(message);
      otpRef.current?.focus();
    },
  });

  if (isVerified) {
    return (
      <div className="flex flex-col gap-[18px]">
        <div>
          <h1 className="font-heading text-primary m-0 text-[34px] leading-[1.05] font-semibold">
            Email verified
          </h1>
          <p className="text-primary/70 mt-2 mb-0 text-[13.5px] leading-relaxed">
            {email} is confirmed. Continue to your workspace.
          </p>
        </div>
        <a
          className="bg-primary text-primary-foreground hover:bg-primary-hover self-start px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
          href="/"
        >
          CONTINUE
        </a>
      </div>
    );
  }

  if (availabilityQuery.isError) {
    return (
      <div className="flex max-w-lg flex-col gap-[18px]">
        <div>
          <h1 className="font-heading text-primary m-0 text-[34px] leading-[1.05] font-semibold">
            Cannot check whether a code can be sent
          </h1>
          <p className="text-primary/70 mt-2 mb-0 text-[13.5px] leading-relaxed">
            Whether this server can deliver mail to {email || "your address"}{" "}
            could not be read, so the page will not promise a message it cannot
            confirm. Nothing about your account has changed.
          </p>
        </div>
        <button
          className="border-primary/35 text-primary hover:bg-primary/5 self-start border px-4 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
          onClick={() => {
            void availabilityQuery.refetch();
          }}
          type="button"
        >
          CHECK AGAIN
        </button>
      </div>
    );
  }

  if (availabilityQuery.isSuccess && !canDeliver) {
    return (
      <div className="flex max-w-lg flex-col gap-[18px]">
        <div>
          <h1 className="font-heading text-primary m-0 text-[34px] leading-[1.05] font-semibold">
            This server cannot send the code
          </h1>
          <p className="text-primary/70 mt-2 mb-0 text-[13.5px] leading-relaxed">
            Your account exists for <strong>{email}</strong>, but this server
            has no mail provider configured, so the address cannot be confirmed
            from here. You are not locked out of signing in; the rest of the
            system stays closed until the address is confirmed.
          </p>
        </div>
        <p className="border-primary/20 bg-card text-primary/80 m-0 border p-4 text-[13.5px] leading-relaxed">
          {availabilityQuery.data.guidance}
        </p>
        <a
          className="border-primary/35 text-primary hover:bg-primary/5 self-start border px-4 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
          href="/account"
        >
          GO TO ACCOUNT
        </a>
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-[18px]">
      <div>
        <h1 className="font-heading text-primary m-0 text-[34px] leading-[1.05] font-semibold">
          Verify your email
        </h1>
        <p className="text-primary/70 mt-2 mb-0 text-[13.5px] leading-relaxed">
          Your account exists, but the address on it has not been confirmed.
          Enter the code sent to <strong>{email}</strong> to unlock the rest of
          the system.
        </p>
        <p className="text-primary/60 mt-2 mb-0 text-[13px] leading-relaxed">
          Verifying confirms the address is yours. If you asked to join as
          College staff, an administrator still has to approve you before you
          become a teacher.
        </p>
      </div>

      <div
        aria-busy={verifyMutation.isPending}
        className="border-primary/15 bg-card border p-[22px]"
      >
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();

            if (verifyMutation.isPending) {
              return;
            }

            if (!otp.trim()) {
              setFormError(
                "Enter the code from the email first. If it has not arrived, use “Send code” below — nothing has been sent or checked yet."
              );
              otpRef.current?.focus();
              return;
            }

            setFormError(null);
            verifyMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label
              className="text-primary/75 text-xs font-bold tracking-[0.12em]"
              htmlFor="verify-otp"
            >
              ONE-TIME CODE
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                aria-describedby="verify-otp-help"
                aria-invalid={formError ? true : undefined}
                autoComplete="one-time-code"
                className={inputClass}
                id="verify-otp"
                inputMode="numeric"
                onChange={(event) => {
                  setOtp(event.target.value);
                  setFormError(null);
                }}
                placeholder="123456"
                ref={otpRef}
                type="text"
                value={otp}
              />
              <button
                aria-describedby="verify-otp-help"
                className="border-primary/35 text-primary hover:bg-primary/5 shrink-0 border px-3 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                disabled={sendMutation.isPending || cooldown.isCoolingDown}
                onClick={() => {
                  sendMutation.mutate(undefined, {
                    onSuccess: () => cooldown.registerSend(),
                  });
                }}
                type="button"
              >
                {getSendLabel(cooldown)}
              </button>
            </div>
            {/* The countdown and the send confirmation both change on their
                own, so they are announced rather than merely displayed. */}
            <p
              aria-live="polite"
              className="text-primary/65 m-0 text-xs leading-relaxed"
              id="verify-otp-help"
            >
              {getSendHelp(cooldown, sent)}
            </p>
          </div>

          {formError ? (
            <p
              className="border-destructive/40 bg-destructive/5 text-destructive m-0 border p-3 text-[13px] leading-relaxed"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <button
            className="bg-primary text-primary-foreground hover:bg-primary-hover min-w-[9.5rem] self-start px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            disabled={verifyMutation.isPending}
            type="submit"
          >
            {verifyMutation.isPending ? "VERIFYING…" : "VERIFY EMAIL"}
          </button>
        </form>
      </div>
    </div>
  );
};
