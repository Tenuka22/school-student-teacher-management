import { isSeededAccount } from "@school-student-teacher-management/auth/roles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { getAuthEmailAvailability } from "@/functions/get-auth-email-availability";
import { authClient } from "@/lib/auth-client";
import { useOtpCooldown } from "@/lib/otp-cooldown";
import type { OtpCooldown } from "@/lib/otp-cooldown";

type Mode = "current-password" | "email-code";

const PASSWORD_MIN_LENGTH = 8;

const inputClass =
  "w-full border border-primary/25 bg-white px-3 py-2 text-sm text-primary outline-none placeholder:text-primary/70 focus:border-primary focus:shadow-[0_0_0_2px_var(--primary)]";
const labelClass = "text-primary/75 text-xs font-bold tracking-[0.12em]";
const errorClass =
  "border-destructive/40 bg-destructive/5 text-destructive m-0 border p-3 text-[13px] leading-relaxed";

const getSendCodeLabel = (cooldown: OtpCooldown, codeSent: boolean): string => {
  if (cooldown.isSending) {
    return "SENDING…";
  }

  if (cooldown.isCoolingDown) {
    return `RESEND IN ${cooldown.secondsLeft}s`;
  }

  return codeSent || cooldown.hasSent ? "RESEND" : "SEND CODE";
};

/**
 * What the code field is currently offering. Three states rather than a
 * nested ternary, because the middle one — a disabled button mid-countdown —
 * is the one that has to read as an explanation rather than as a fault.
 */
const getCodeHint = (
  cooldown: OtpCooldown,
  codeSent: boolean,
  email: string
): React.ReactNode => {
  if (cooldown.isCoolingDown) {
    return (
      <>
        Held back for another {cooldown.secondsLeft} seconds. A code already
        sent is still valid, and you can still enter it.
      </>
    );
  }

  if (codeSent) {
    return (
      <>
        Check {email}. The code expires in 10 minutes; only three guesses are
        allowed.
      </>
    );
  }

  return <>A one-time code will be sent to {email}.</>;
};

/**
 * Every failure says what did not happen and what to do instead.
 *
 * A better-auth message on its own ("Invalid password") names a verdict and no
 * way forward, and in the email-code branch it names the wrong half: the code
 * was wrong, not the password. The branches below keep the two apart.
 */
const describeChangeFailure = (error: Error, mode: Mode): string => {
  const detail = error.message.trim();

  if (/rate|limit|too many|throttle/iu.test(detail)) {
    return "The College server is holding back further requests. Wait for the countdown in the code panel, then send a new code — nothing about your password has changed.";
  }

  if (mode === "email-code" && /expired/iu.test(detail)) {
    return "That code expired before it was used. Send a new one and enter it straight away; your current password is untouched until a change succeeds.";
  }

  if (mode === "email-code") {
    return `${detail || "That code was not accepted."} Check the digits in the email sent to your address, or send a fresh code. If the code keeps failing, switch to “Current password” and use that instead.`;
  }

  return `${detail || "The current password was not accepted."} Check it and try again, or switch to “Email code” to confirm with a one-time code sent to your address instead.`;
};

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  username?: string | null;
  /**
   * The control that opened the dialog. Focused again when it closes, because
   * the dialog is opened by a plain button rather than by `Dialog.Trigger`
   * and so has no trigger of its own to return to.
   */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}

const Field = ({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <label className={labelClass} htmlFor={id}>
      {label}
    </label>
    {children}
    {hint ? (
      <span
        className="text-primary/65 text-xs leading-relaxed"
        id={`${id}-hint`}
      >
        {hint}
      </span>
    ) : null}
  </div>
);

interface ChangePasswordFormProps {
  mode: Mode;
  email: string;
  currentPassword: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
  codeSent: boolean;
  error: string | null;
  fieldError: string | null;
  isSaving: boolean;
  isSendingCode: boolean;
  canSendCode: boolean;
  isInternalLogin: boolean;
  cooldown: OtpCooldown;
  currentRef: React.RefObject<HTMLInputElement | null>;
  otpRef: React.RefObject<HTMLInputElement | null>;
  newRef: React.RefObject<HTMLInputElement | null>;
  confirmRef: React.RefObject<HTMLInputElement | null>;
  onCurrentPasswordChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onClearFieldError: () => void;
  onSendCode: () => void;
  onSubmit: () => void;
}

const ChangePasswordForm = ({
  mode,
  email,
  currentPassword,
  otp,
  newPassword,
  confirmPassword,
  codeSent,
  error,
  fieldError,
  isSaving,
  isSendingCode,
  canSendCode,
  isInternalLogin,
  cooldown,
  currentRef,
  otpRef,
  newRef,
  confirmRef,
  onCurrentPasswordChange,
  onOtpChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onClearFieldError,
  onSendCode,
  onSubmit,
}: ChangePasswordFormProps) => (
  <form
    className="flex flex-col gap-4"
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    {mode === "current-password" ? (
      <Field id="password-current" label="CURRENT PASSWORD">
        <input
          aria-describedby={
            fieldError ? "password-field-error" : "password-current-hint"
          }
          aria-invalid={fieldError ? true : undefined}
          autoComplete="current-password"
          className={inputClass}
          id="password-current"
          onChange={(event) => {
            onCurrentPasswordChange(event.target.value);
            onClearFieldError();
          }}
          ref={currentRef}
          type="password"
          value={currentPassword}
        />
        <span className="sr-only" id="password-current-hint">
          Proves you hold this account. Leave it empty and use the email code
          option instead if you cannot remember it.
        </span>
      </Field>
    ) : (
      <Field
        hint={getCodeHint(cooldown, codeSent, email)}
        id="password-otp"
        label="ONE-TIME CODE"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-describedby={
              fieldError
                ? "password-otp-hint password-field-error"
                : "password-otp-hint"
            }
            aria-invalid={fieldError ? true : undefined}
            autoComplete="one-time-code"
            className={inputClass}
            id="password-otp"
            inputMode="numeric"
            onChange={(event) => {
              onOtpChange(event.target.value);
              onClearFieldError();
            }}
            placeholder="123456"
            ref={otpRef}
            type="text"
            value={otp}
          />
          <button
            className="border-primary/35 text-primary hover:bg-primary/5 shrink-0 border px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSendingCode || cooldown.isCoolingDown}
            onClick={onSendCode}
            type="button"
          >
            {getSendCodeLabel(cooldown, codeSent)}
          </button>
        </div>
      </Field>
    )}

    <Field
      hint={`At least ${PASSWORD_MIN_LENGTH} characters. Choosing a new one signs every other session out.`}
      id="password-new"
      label="NEW PASSWORD"
    >
      <input
        aria-describedby="password-new-hint"
        autoComplete="new-password"
        className={inputClass}
        id="password-new"
        onChange={(event) => {
          onNewPasswordChange(event.target.value);
          onClearFieldError();
        }}
        ref={newRef}
        type="password"
        value={newPassword}
      />
    </Field>

    <Field id="password-confirm" label="CONFIRM NEW PASSWORD">
      <input
        autoComplete="new-password"
        className={inputClass}
        id="password-confirm"
        onChange={(event) => {
          onConfirmPasswordChange(event.target.value);
          onClearFieldError();
        }}
        ref={confirmRef}
        type="password"
        value={confirmPassword}
      />
    </Field>

    {error ? (
      <p className={errorClass} id="password-form-error" role="alert">
        {error}
      </p>
    ) : null}

    {fieldError ? (
      <p className={errorClass} id="password-field-error" role="alert">
        {fieldError}
      </p>
    ) : null}

    {!canSendCode && isInternalLogin ? (
      <p className="text-primary/65 m-0 text-xs leading-relaxed">
        This login has no mailbox of its own, so a recovery code cannot be sent
        to it. Use your current password, or ask an administrator to issue a new
        one.
      </p>
    ) : null}

    <button
      className="bg-primary text-primary-foreground hover:bg-primary-hover min-w-[11rem] self-start px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isSaving}
      type="submit"
    >
      {isSaving ? "SAVING…" : "UPDATE PASSWORD"}
    </button>
  </form>
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
  returnFocusTo,
}: PasswordDialogProps) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("current-password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const currentRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

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
    setFieldError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
    returnFocusTo?.current?.focus();
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
      otpRef.current?.focus();
    },
    onError: (sendError: Error) => {
      setError(
        `${describeChangeFailure(sendError, "email-code")} Your password has not changed.`
      );
    },
  });

  // Same exponential backoff as the verification page: each resend waits
  // twice as long as the last, so the button stops offering what the server
  // would refuse. The interval behind the countdown is cleared by the hook.
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

      if (newPassword.length < PASSWORD_MIN_LENGTH) {
        throw new Error(
          `New password must be at least ${PASSWORD_MIN_LENGTH} characters`
        );
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
      toast.success(
        "Password changed — every other session on this account has been signed out"
      );
      close();
    },
    onError: (changeError: Error) => {
      setError(
        `${describeChangeFailure(changeError, mode)} Nothing was changed.`
      );
      (mode === "email-code" ? otpRef : currentRef).current?.focus();
    },
  });

  const selectMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setFieldError(null);
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

  /** Client-side checks first, so focus lands on the field that needs work. */
  const validate = (): boolean => {
    if (mode === "current-password" && !currentPassword) {
      setFieldError(
        "Enter your current password to confirm the change, or switch to “Email code” above."
      );
      currentRef.current?.focus();
      return false;
    }

    if (mode === "email-code" && !otp.trim()) {
      setFieldError(
        "Enter the one-time code from the email, or send a new one with the button beside the field."
      );
      otpRef.current?.focus();
      return false;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setFieldError(
        `The new password needs at least ${PASSWORD_MIN_LENGTH} characters. What you typed is still in the box.`
      );
      newRef.current?.focus();
      return false;
    }

    if (newPassword !== confirmPassword) {
      setFieldError(
        "The two new passwords are different. Retype the confirmation so it matches."
      );
      confirmRef.current?.focus();
      return false;
    }

    return true;
  };

  return (
    <Dialog
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      open={open}
    >
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
                  : "border-primary/25 text-primary/75 hover:bg-primary/5 border"
              }`}
            >
              {option === "current-password"
                ? "CURRENT PASSWORD"
                : "EMAIL CODE"}
            </button>
          ))}
        </fieldset>

        {isEnvManaged ? (
          <p className="border-primary/25 bg-primary/5 text-primary/80 m-0 border px-4 py-3 text-[13px] leading-relaxed">
            This is an institutional login. Its password is set by the
            College&rsquo;s server configuration and re-applied on every start,
            so it cannot be changed from here. Ask an administrator to update
            the environment if it needs to rotate.
          </p>
        ) : (
          <ChangePasswordForm
            canSendCode={canSendCode}
            codeSent={codeSent}
            confirmPassword={confirmPassword}
            confirmRef={confirmRef}
            cooldown={codeCooldown}
            currentPassword={currentPassword}
            currentRef={currentRef}
            email={email}
            error={error}
            fieldError={fieldError}
            isInternalLogin={isInternalLogin}
            isSaving={changeMutation.isPending}
            isSendingCode={sendCodeMutation.isPending}
            mode={mode}
            newPassword={newPassword}
            newRef={newRef}
            otp={otp}
            otpRef={otpRef}
            onClearFieldError={() => setFieldError(null)}
            onConfirmPasswordChange={setConfirmPassword}
            onCurrentPasswordChange={setCurrentPassword}
            onNewPasswordChange={setNewPassword}
            onOtpChange={setOtp}
            onSendCode={() => {
              sendCodeMutation.mutate(undefined, {
                onSuccess: () => codeCooldown.registerSend(),
              });
            }}
            onSubmit={() => {
              if (changeMutation.isPending) {
                return;
              }

              setError(null);

              if (validate()) {
                setFieldError(null);
                changeMutation.mutate();
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
