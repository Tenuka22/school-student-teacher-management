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
  "w-full border border-input bg-white px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring sm:text-[0.9375rem]";
const labelClass = "text-sm font-semibold text-foreground";

const getSendCodeLabel = (cooldown: OtpCooldown, codeSent: boolean): string => {
  if (cooldown.isSending) {
    return "Sending…";
  }

  if (cooldown.isCoolingDown) {
    return `Resend in ${cooldown.secondsLeft}s`;
  }

  return codeSent || cooldown.hasSent ? "Resend" : "Send code";
};

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  username?: string | null;
}

/** Label + control. The control must carry `id={id}`. */
const Field = ({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className={labelClass}>
      {label}
    </label>
    {children}
    {error && (
      <span role="alert" className="text-destructive text-sm font-medium">
        {error}
      </span>
    )}
  </div>
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
              { value: "current-password", label: "Current password" },
              { value: "email-code", label: "Email code" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={mode === option.value}
              onClick={() => selectMode(option.value)}
              className={`px-3 py-2.5 text-sm font-semibold transition-colors ${
                mode === option.value
                  ? "bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-primary/5 border"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isEnvManaged ? (
          <p className="border-border bg-primary/5 text-foreground/75 border px-4 py-3 text-sm leading-relaxed">
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
              <Field id="current-password" label="Current password">
                <input
                  id="current-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className={inputClass}
                />
              </Field>
            ) : (
              <Field id="password-otp" label="One-time code">
                <div className="flex gap-2">
                  <input
                    id="password-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-describedby={
                      codeSent ? "password-otp-hint" : undefined
                    }
                    placeholder="6-digit code"
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
                    className="border-input text-foreground hover:border-primary shrink-0 border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {getSendCodeLabel(codeCooldown, codeSent)}
                  </button>
                </div>
                {codeSent && (
                  <span
                    id="password-otp-hint"
                    className="text-muted-foreground text-sm"
                  >
                    Check {email} — the code expires in 10 minutes, and only
                    three guesses are allowed.
                  </span>
                )}
              </Field>
            )}

            <Field id="new-password" label="New password">
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field id="confirm-new-password" label="Confirm new password">
              <input
                id="confirm-new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={inputClass}
              />
            </Field>

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={changeMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary-hover self-start px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {changeMutation.isPending ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
