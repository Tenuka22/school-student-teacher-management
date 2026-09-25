import { isSeededAccount } from "@school-student-teacher-management/auth/roles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getAuthEmailAvailability } from "@/functions/get-auth-email-availability";
import { authClient } from "@/lib/auth-client";
import { useOtpCooldown } from "@/lib/otp-cooldown";
import type { OtpCooldown } from "@/lib/otp-cooldown";

type Mode = "current-password" | "email-code";

const inputClass =
  "w-full border border-primary/22 bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary";
const labelClass = "text-xs font-bold tracking-[0.12em] text-primary/70";

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
    {error && <span className="text-destructive text-xs">{error}</span>}
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

  // A one-time code is only offered when this server can actually send one.
  // The code path used to be presented unconditionally, including for the
  // synthetic `@…internal` addresses that back username logins — an address
  // that cannot receive mail, offered a "we'll email you" recovery.
  const availabilityQuery = useQuery({
    queryKey: ["auth", "email-availability"],
    queryFn: ({ signal }) => getAuthEmailAvailability({ signal }),
  });
  const canSendCode = availabilityQuery.data?.canDeliver ?? true;
  const isInternalLogin = email.endsWith(".internal");

  const modes = canSendCode
    ? (["current-password", "email-code"] as const)
    : (["current-password"] as const);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            {canSendCode
              ? "Confirm with your current password, or use a one-time code sent to your address."
              : "Confirm with your current password to change it."}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Confirmation method</legend>
          {modes.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => selectMode(option)}
              className={`px-3 py-2.5 text-xs font-extrabold tracking-[0.1em] transition-colors ${
                mode === option
                  ? "bg-primary text-primary-foreground"
                  : "border-primary/20 text-primary/70 hover:bg-primary/5 border"
              }`}
            >
              {option === "current-password"
                ? "CURRENT PASSWORD"
                : "EMAIL CODE"}
            </button>
          ))}
        </fieldset>

        {isEnvManaged ? (
          <p className="border-primary/20 bg-primary/5 text-primary/75 border px-4 py-3 text-[13px] leading-relaxed">
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
                    className="border-primary/30 text-primary hover:border-primary shrink-0 border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {getSendCodeLabel(codeCooldown, codeSent)}
                  </button>
                </div>
                {codeSent && (
                  <span className="text-primary/55 text-xs">
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

            {error && <p className="text-destructive text-sm">{error}</p>}

            {!canSendCode && isInternalLogin && (
              <p className="text-primary/60 text-xs leading-relaxed">
                This login has no mailbox of its own, so a recovery code cannot
                be sent to it. Use your current password, or ask an
                administrator to issue a new one.
              </p>
            )}

            <button
              type="submit"
              disabled={changeMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary-hover self-start px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors disabled:opacity-60"
            >
              {changeMutation.isPending ? "SAVING…" : "UPDATE PASSWORD"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
