import { isSeededAccount } from "@school-student-teacher-management/auth/roles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { useOtpCooldown } from "@/lib/otp-cooldown";
import type { OtpCooldown } from "@/lib/otp-cooldown";

type Mode = "current-password" | "email-code";

const inputClass =
  "w-full border border-[#013405]/22 bg-white px-3 py-2 text-sm text-[#013405] outline-none focus:border-[#013405]";
const labelClass = "text-xs font-bold tracking-[0.12em] text-[#013405]/70";

const getSendCodeLabel = (cooldown: OtpCooldown, codeSent: boolean): string => {
  if (cooldown.isSending) {
    return "SENDING…";
  }

  if (cooldown.isCoolingDown) {
    return `RESEND IN ${cooldown.secondsLeft}s`;
  }

  return codeSent || cooldown.hasSent ? "RESEND" : "SEND CODE";
};

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  username?: string | null;
}

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <label className="flex flex-col gap-1.5">
    <span className={labelClass}>{label}</span>
    {children}
    {error && <span className="text-xs text-[#A51919]">{error}</span>}
  </label>
);

/**
 * Change-password dialog with two routes to the same outcome:
 *
 * 1. **Current password** — the ordinary case, proves possession of the
 *    account without leaving the browser.
 * 2. **Email code** — the forgot-password route, for someone who cannot
 *    remember it. Better Auth issues a short-lived OTP against the account's
 *    own address, which is then exchanged for permission to set a new
 *    password.
 *
 * The email route is deliberately only offered to a signed-in member: it
 * changes *this* account, and the code proves control of the address on file.
 */
export const PasswordDialog = ({
  open,
  onOpenChange,
  email,
  username,
}: PasswordDialogProps) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("current-password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The server reseeds the institutional accounts' passwords from env on every
  // boot, so a change made here would silently revert at the next restart.
  // Env stays the single source of truth for those three logins.
  const isEnvManaged = isSeededAccount(username);

  const reset = () => {
    setMode("current-password");
    setCurrentPassword("");
    setOtp("");
    setCodeSent(false);
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const sendCodeMutation = useMutation({
    mutationFn: async () => {
      if (isEnvManaged) {
        throw new Error(
          "This account's password is managed by the College environment"
        );
      }

      const { error: sendError } =
        await authClient.emailOtp.sendVerificationOtp({
          email,
          type: "forget-password",
        });

      if (sendError) {
        throw new Error(sendError.message ?? "Could not send the code");
      }
    },
    onSuccess: async () => {
      setCodeSent(true);
      // Issuing a new code supersedes any earlier one, so drop cached auth
      // state rather than leave a stale verification result around.
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      toast.success(`Code sent to ${email}`);
    },
    onError: (sendError: Error) => {
      setError(sendError.message);
    },
  });

  // Same exponential backoff as the verification page: each resend waits
  // twice as long as the last, so the button stops offering what the server
  // would refuse.
  const codeCooldown = useOtpCooldown({
    email,
    purpose: "forget-password",
    isPending: sendCodeMutation.isPending,
  });

  const changeMutation = useMutation({
    mutationFn: async () => {
      if (isEnvManaged) {
        throw new Error(
          "This account's password is managed by the College environment"
        );
      }

      if (newPassword !== confirmPassword) {
        throw new Error("New passwords do not match");
      }

      if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters");
      }

      if (mode === "current-password") {
        const { error: changeError } = await authClient.changePassword({
          currentPassword,
          newPassword,
        });

        if (changeError) {
          throw new Error(changeError.message ?? "Could not change password");
        }
        return;
      }

      // Prove the code, then set the new password as this signed-in user.
      const { error: otpError } =
        await authClient.emailOtp.checkVerificationOtp({
          email,
          otp,
          type: "forget-password",
        });

      if (otpError) {
        throw new Error(otpError.message ?? "That code is not valid");
      }

      const { error: changeError } = await authClient.changePassword({
        newPassword,
        // Better Auth allows omitting the current password when the caller
        // has just proved control of the address.
        currentPassword: "",
      });

      if (changeError) {
        throw new Error(changeError.message ?? "Could not change password");
      }
    },
    onSuccess: () => {
      codeCooldown.clear();
      toast.success("Password changed");
      reset();
      onOpenChange(false);
    },
    onError: (changeError: Error) => {
      setError(changeError.message);
    },
  });

  const selectMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setCodeSent(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Confirm with your current password, or use a one-time code sent to{" "}
            {email}.
          </DialogDescription>
        </DialogHeader>

        <div
          role="tablist"
          aria-label="Confirmation method"
          className="grid grid-cols-2 gap-2"
        >
          {(
            [
              { value: "current-password", label: "CURRENT PASSWORD" },
              { value: "email-code", label: "EMAIL CODE" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={mode === option.value}
              onClick={() => selectMode(option.value)}
              className={`px-3 py-2.5 text-xs font-extrabold tracking-[0.1em] transition-colors ${
                mode === option.value
                  ? "bg-[#013405] text-[#FFF8E7]"
                  : "border border-[#013405]/20 text-[#013405]/70 hover:bg-[#013405]/5"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isEnvManaged ? (
          <p className="border border-[#013405]/20 bg-[#013405]/5 px-4 py-3 text-[13px] leading-relaxed text-[#013405]/75">
            This is an institutional login. Its password is set by the
            College&rsquo;s server configuration and re-applied on every start,
            so it cannot be changed from here. Ask an administrator to update
            the environment if it needs to rotate.
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              changeMutation.mutate();
            }}
          >
            {mode === "current-password" ? (
              <Field label="CURRENT PASSWORD">
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className={inputClass}
                />
              </Field>
            ) : (
              <Field label="ONE-TIME CODE">
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    disabled={
                      sendCodeMutation.isPending || codeCooldown.isCoolingDown
                    }
                    onClick={() => {
                      sendCodeMutation.mutate(undefined, {
                        onSuccess: () => codeCooldown.registerSend(),
                      });
                    }}
                    className="shrink-0 border border-[#013405]/30 px-3 py-2 text-xs font-bold text-[#013405] transition-colors hover:border-[#013405] disabled:opacity-50"
                  >
                    {getSendCodeLabel(codeCooldown, codeSent)}
                  </button>
                </div>
                {codeSent && (
                  <span className="text-xs text-[#013405]/55">
                    Check {email} — the code expires in 10 minutes, and only
                    three guesses are allowed.
                  </span>
                )}
              </Field>
            )}

            <Field label="NEW PASSWORD">
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="CONFIRM NEW PASSWORD">
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={inputClass}
              />
            </Field>

            {error && <p className="text-sm text-[#A51919]">{error}</p>}

            <button
              type="submit"
              disabled={changeMutation.isPending}
              className="self-start bg-[#013405] px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] text-[#FFF8E7] transition-colors hover:bg-[#064A12] disabled:opacity-60"
            >
              {changeMutation.isPending ? "SAVING…" : "UPDATE PASSWORD"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
