import { Link, useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { SavedAccounts } from "@/components/auth/saved-accounts";
import { getMyHomePath } from "@/functions/get-home-path";
import { SITE_MOTTO, SITE_SHORT_NAME } from "@/functions/get-site-origin";
import { authClient } from "@/lib/auth-client";

type FieldName = "username" | "password";

type FieldErrors = Partial<Record<FieldName, string>>;

/**
 * Which problem the sign-in actually hit, and what to do about it.
 *
 * A better-auth error message on its own is a status string written for a log,
 * not for the person staring at a form at 8am: "Unauthorized" names nothing
 * and recovers nothing. Each branch below says what failed and what the next
 * move is, and deliberately does **not** reveal whether the username or the
 * password was the wrong half.
 */
const describeSignInFailure = (error: {
  message?: string;
  status?: number;
  statusText?: string;
}): string => {
  const detail = error.message?.trim() || error.statusText?.trim() || "";
  const status = error.status ?? 0;

  if (status === 429) {
    return "Too many sign-in attempts from this browser. Wait a minute, then try again. Nothing is wrong with your account.";
  }

  if (status === 0 || status >= 500) {
    return detail
      ? `The College server could not be reached: ${detail}. Try again in a moment; if it keeps failing, tell an administrator.`
      : "The College server could not be reached. Check your connection and try again; if it keeps failing, tell an administrator.";
  }

  return `${detail || "The username and password did not match."} Check both and try again, or use “Staff sign-up” below if you have not registered yet.`;
};

export const LoginForm = () => {
  const { switch: isSwitching } = useSearch({ from: "/login" });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    // Belt and braces against a double submit: the button is disabled, but a
    // second submit can also arrive from the Enter key in the password field
    // before React has re-rendered.
    if (isSubmitting) {
      return;
    }

    const nextErrors: FieldErrors = {};
    if (!username.trim()) {
      nextErrors.username =
        "Enter the username issued with your account — your NIC number if you are a teacher.";
    }
    if (!password) {
      nextErrors.password = "Enter your password to finish signing in.";
    }

    setErrors(nextErrors);
    setFormError(null);

    if (Object.keys(nextErrors).length > 0) {
      // Focus the first thing that needs fixing, in reading order.
      if (nextErrors.username) {
        usernameRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    setIsSubmitting(true);

    let failure: {
      message?: string;
      status?: number;
      statusText?: string;
    } | null = null;

    try {
      const { error } = await authClient.signIn.username({
        username: username.trim(),
        password,
      });
      failure = error;
    } catch (error) {
      // A transport failure never reaches the `{ error }` branch; it rejects.
      failure = {
        message: error instanceof Error ? error.message : String(error),
        status: 0,
      };
    }

    if (failure) {
      const message = describeSignInFailure(failure);
      setFormError(message);
      setErrors({
        username: "Check this is the username issued with your account.",
        password: "Check this is the password you chose.",
      });
      setIsSubmitting(false);
      toast.error(message);
      passwordRef.current?.focus();
      return;
    }

    toast.success("Signed in successfully");
    // Land on the workspace for this member's role and leadership authority
    // instead of a shared dashboard.
    window.location.assign(await getMyHomePath());
  };

  return (
    <div className="bg-primary text-primary-foreground flex min-h-dvh flex-col">
      {/* Brand panel */}
      <div className="bg-primary relative hidden min-w-0 flex-[1.15_1_420px] flex-col justify-between overflow-hidden p-[clamp(28px,4vh,52px)_clamp(32px,4vw,58px)] lg:flex">
        <div className="bg-primary pointer-events-none absolute inset-0" />
        <div className="bg-primary pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(4,34,10,0.94)_0%,rgba(1,52,5,0.96)_55%,rgba(6,43,10,0.98)_100%)]" />

        <div className="relative flex items-center gap-3.5">
          <img
            alt="St. Aloysius' College crest"
            className="block h-14 w-auto"
            height={56}
            src="/uploads/college-crest.png"
            width={56}
          />
          <div className="leading-[1.15]">
            <p className="m-0 text-[14px] font-extrabold tracking-[0.06em]">
              {SITE_SHORT_NAME.toUpperCase()}
            </p>
            <p className="text-accent mt-1 mb-0 text-xs tracking-[0.28em]">
              GALLE &middot; SRI LANKA
            </p>
          </div>
        </div>

        <div className="relative max-w-[30ch]">
          <p className="font-heading m-0 text-[clamp(30px,4.6vw,52px)] leading-[1.06] font-semibold">
            Staff records, timetables, attendance and leave in one place.
          </p>
          <div className="bg-accent my-[clamp(16px,2.6vh,26px)] h-0.5 w-13" />
          <p className="text-primary-foreground/75 m-0 text-sm leading-[1.55]">
            One account per member of staff, scoped to the academic year you are
            working in. The year is part of the address, so a link or a
            screenshot is never ambiguous.
          </p>
        </div>

        <p className="text-primary-foreground/60 relative m-0 text-xs leading-relaxed">
          For College teaching staff and office staff. This is the internal
          system, not the public website.
        </p>
      </div>

      {/* Sign-in form panel */}
      <main className="bg-primary-foreground text-primary flex min-w-0 flex-1 items-center justify-center overflow-y-auto px-[clamp(20px,4vw,52px)] py-[clamp(28px,5vh,56px)]">
        <div className="w-full max-w-[26rem]">
          <h1 className="font-heading m-0 text-[clamp(30px,4.6vh,44px)] leading-[1.05] font-semibold">
            Sign in
          </h1>
          <p className="text-primary/70 mt-2 mb-0 text-[14px] leading-[1.55]">
            Enter the username issued with your account and your password.
          </p>
          <p className="text-primary/60 mt-3 mb-0 text-[12.5px] leading-[1.55]">
            Teachers: use your <strong>NIC number</strong> as the username.
            Office staff, Principal and Deputy Principal: use the username
            issued with your account. General accounts sign in with the email
            address they registered.
          </p>

          {isSwitching ? (
            <p className="border-primary/30 text-primary/75 mt-5 mb-0 border p-3 text-[12.5px] leading-[1.5]">
              You are already signed in. Adding or switching accounts here keeps
              your current session active.
            </p>
          ) : null}

          {formError ? (
            <p
              className="border-destructive bg-destructive/5 text-destructive mt-5 mb-0 border p-3 text-[13px] leading-[1.5]"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <form className="mt-5" noValidate onSubmit={handleSignIn}>
            <div className="mb-[clamp(12px,2vh,18px)]">
              <label
                className="mb-2 block text-xs font-bold tracking-[0.16em]"
                htmlFor="login-username"
              >
                USERNAME
              </label>
              <input
                aria-describedby={
                  errors.username ? "login-username-error" : undefined
                }
                aria-invalid={errors.username ? true : undefined}
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                className="border-primary/25 bg-card text-primary placeholder:text-primary/70 focus:border-primary w-full border px-[15px] py-[13px] text-sm outline-none focus:bg-white"
                disabled={isSubmitting}
                id="login-username"
                name="username"
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors((prev) => ({ ...prev, username: undefined }));
                }}
                placeholder="NIC number, or the username you were given"
                ref={usernameRef}
                spellCheck={false}
                type="text"
                value={username}
              />
              {errors.username ? (
                <span
                  className="text-destructive mt-1.5 block text-xs leading-relaxed"
                  id="login-username-error"
                >
                  {errors.username}
                </span>
              ) : null}
            </div>

            <div className="mb-[clamp(16px,2.6vh,26px)]">
              <label
                className="mb-2 block text-xs font-bold tracking-[0.16em]"
                htmlFor="login-password"
              >
                PASSWORD
              </label>
              <span className="relative block">
                <input
                  aria-describedby={
                    errors.password ? "login-password-error" : undefined
                  }
                  aria-invalid={errors.password ? true : undefined}
                  autoComplete="current-password"
                  className="border-primary/25 bg-card text-primary focus:border-primary w-full border py-[13px] pr-[76px] pl-[15px] text-sm outline-none focus:bg-white"
                  disabled={isSubmitting}
                  id="login-password"
                  name="password"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-pressed={showPassword}
                  className="text-primary/65 hover:text-primary focus-visible:ring-primary absolute top-1/2 right-[13px] -translate-y-1/2 border-b border-current text-xs font-extrabold tracking-[0.1em] outline-none focus-visible:ring-2"
                  onClick={() => {
                    setShowPassword((s) => !s);
                  }}
                  type="button"
                >
                  {showPassword ? "HIDE" : "SHOW"}
                  <span className="sr-only"> password</span>
                </button>
              </span>
              {errors.password ? (
                <span
                  className="text-destructive mt-1.5 block text-xs leading-relaxed"
                  id="login-password-error"
                >
                  {errors.password}
                </span>
              ) : null}
            </div>

            <button
              className="bg-primary text-accent hover:bg-primary-hover block w-full min-w-[12rem] py-[15px] text-center text-[13.5px] font-extrabold tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "SIGNING IN…" : "SIGN IN"}
            </button>
          </form>

          <div className="mt-[clamp(16px,2.8vh,28px)]">
            <SavedAccounts />
          </div>

          <div className="border-primary/15 text-primary/70 mt-[clamp(16px,2.8vh,28px)] flex flex-wrap justify-between gap-x-4 gap-y-2 border-t pt-[clamp(12px,2vh,20px)] text-[12.5px]">
            <span>
              No account?{" "}
              <Link
                className="text-primary hover:text-destructive font-bold underline underline-offset-2"
                search={isSwitching ? { switch: 1 } : undefined}
                to="/signup"
              >
                Staff sign-up
              </Link>
            </span>
            {isSwitching ? (
              <span>
                Changed your mind?{" "}
                <Link
                  className="text-primary hover:text-destructive font-bold underline underline-offset-2"
                  to="/account"
                >
                  Back to my account
                </Link>
              </span>
            ) : (
              <span className="text-primary/50 font-bold tracking-[0.18em]">
                {SITE_MOTTO}
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

/**
 * Shown while the route's `beforeLoad` resolves the session. A skeleton shaped
 * like the form, so the panel does not resize when the fields arrive.
 */
export const LoginSkeleton = () => (
  <div
    aria-busy="true"
    aria-live="polite"
    className="bg-primary-foreground text-primary flex min-h-dvh items-center justify-center px-[clamp(20px,4vw,52px)] py-10"
  >
    <span className="sr-only">Checking your session…</span>
    <div className="w-full max-w-[26rem]">
      <div className="bg-primary/20 h-10 w-40" />
      <div className="bg-primary/10 mt-4 h-3 w-64" />
      <div className="mt-8 flex flex-col gap-5">
        <div className="bg-primary/10 h-3 w-24" />
        <div className="bg-primary/12 h-11 w-full" />
        <div className="bg-primary/10 h-3 w-24" />
        <div className="bg-primary/12 h-11 w-full" />
        <div className="bg-primary/20 mt-2 h-12 w-full" />
      </div>
    </div>
  </div>
);
