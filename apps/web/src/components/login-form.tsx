import { useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SavedAccounts } from "@/components/auth/saved-accounts";
import { CollegeCrest } from "@/components/ui-patterns/college-crest";
import { getMyHomePath } from "@/functions/get-home-path";
import { authClient } from "@/lib/auth-client";

export const LoginForm = () => {
  const { switch: isSwitching } = useSearch({ from: "/login" });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await authClient.signIn.username(
      { username, password },
      {
        onSuccess: async () => {
          toast.success("Signed in successfully");
          // Land on the workspace for this member's role and leadership
          // authority instead of a shared dashboard.
          window.location.assign(await getMyHomePath());
        },
        onError: (context: {
          error: { message?: string; statusText?: string };
        }) => {
          toast.error(
            context.error.message ||
              context.error.statusText ||
              "Sign-in failed"
          );
        },
      }
    );
    setIsSubmitting(false);
  };

  return (
    <div className="bg-primary text-primary-foreground flex h-dvh max-h-dvh overflow-hidden">
      {/* Brand panel */}
      <div className="bg-primary relative hidden min-w-0 flex-[1.15_1_420px] flex-col justify-between overflow-hidden p-[clamp(28px,4vh,52px)_clamp(32px,4vw,58px)] md:flex">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(1,52,5,0.84)_0%,rgba(1,52,5,0.91)_55%,rgba(6,43,10,0.97)_100%)]" />
        <div className="pointer-events-none absolute -top-[150px] -right-[190px] size-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,178,3,0.22),transparent_65%)] motion-safe:animate-[om-pulse_9s_ease-in-out_infinite]" />
        <CollegeCrest
          size="large"
          className="pointer-events-none absolute -right-[110px] -bottom-[150px] h-[min(520px,72vh)] w-auto opacity-[0.07] motion-safe:animate-[om-drift_16s_ease-in-out_infinite]"
        />

        <div className="relative flex items-center gap-3.5">
          <CollegeCrest
            alt="St. Aloysius' College crest"
            size="small"
            className="block h-[clamp(44px,6.4vh,58px)] w-auto"
          />
          <div className="leading-[1.15]">
            <div className="text-[0.9375rem] font-bold tracking-[-0.005em] whitespace-nowrap">
              St. Aloysius&rsquo; College
            </div>
            <div className="text-accent type-eyebrow mt-0.75 font-semibold whitespace-nowrap">
              Galle &bull; Sri Lanka
            </div>
          </div>
        </div>

        <div className="relative max-w-[26ch]">
          <div className="text-accent mb-[clamp(12px,2vh,20px)] text-xs font-bold tracking-[0.24em]">
            CERTA VIRILITER
          </div>
          <div className="font-heading text-[clamp(2.25rem,1.4rem+2.2vw,3.5rem)] leading-[1.04] font-semibold tracking-[-0.01em]">
            School Management System
          </div>
          <div className="bg-accent my-[clamp(16px,2.6vh,26px)] h-0.5 w-13" />
          <p className="font-heading text-primary-foreground/82 m-0 text-[clamp(1.125rem,1rem+0.4vw,1.3125rem)] leading-[1.5] italic">
            Attendance, results, timetables and College communications in one
            place.
          </p>
        </div>

        <div className="text-primary-foreground/75 relative text-sm">
          For College staff, students and parents.
        </div>
      </div>

      {/* Sign-in form panel */}
      <div className="bg-primary-foreground text-foreground flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-[clamp(24px,4vh,56px)_clamp(20px,4vw,52px)]">
        <div className="w-full max-w-[420px]">
          <div className="text-destructive type-eyebrow mb-3">Sign in</div>
          <h1 className="type-page-title m-0 mb-2.5">Welcome back</h1>
          <p className="text-muted-foreground type-body m-0 mb-[clamp(14px,2.4vh,22px)]">
            Enter your username and password to access your account.
          </p>
          <p className="text-muted-foreground m-0 mb-[clamp(16px,2.6vh,24px)] text-sm">
            Teachers and office staff: use your <strong>NIC number</strong> as
            the username. Principal and Deputy Principal: use your assigned
            username.
          </p>

          {isSwitching && (
            <p className="border-accent bg-primary/5 text-muted-foreground m-0 mb-[clamp(12px,2vh,20px)] border-l-[3px] py-2 pl-3 text-sm">
              You are already signed in. Adding or switching accounts here keeps
              your current session active.
            </p>
          )}

          <form onSubmit={handleSignIn}>
            <div className="mb-[clamp(12px,2vh,18px)]">
              <label
                htmlFor="login-username"
                className="mb-2 block text-sm font-semibold"
              >
                Username
              </label>
              <input
                id="login-username"
                name="username"
                type="text"
                placeholder="e.g. 199912345678"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                disabled={isSubmitting}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring w-full border px-[15px] py-[13px] text-base outline-none focus:bg-white focus-visible:ring-1 sm:text-[0.9375rem]"
              />
            </div>

            <div className="mb-[clamp(16px,2.6vh,26px)]">
              <label
                htmlFor="login-password"
                className="mb-2 block text-sm font-semibold"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={isSubmitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-input bg-card text-foreground focus-visible:border-ring focus-visible:ring-ring w-full border py-[13px] pr-[76px] pl-[15px] text-base outline-none focus:bg-white focus-visible:ring-1 sm:text-[0.9375rem]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-controls="login-password"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="text-foreground/75 decoration-foreground/40 hover:text-foreground absolute top-1/2 right-1.5 flex min-h-9 min-w-14 -translate-y-1/2 items-center justify-center px-2 text-sm font-semibold underline underline-offset-4"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary text-accent hover:bg-surface-deep block w-full py-3.5 text-center text-[0.9375rem] font-bold tracking-[0.01em] transition-colors disabled:opacity-60"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-[clamp(16px,2.8vh,28px)]">
            <SavedAccounts />
          </div>

          <div className="border-border text-muted-foreground mt-[clamp(16px,2.8vh,28px)] flex flex-wrap justify-between gap-3.5 border-t pt-[clamp(12px,2vh,20px)] text-sm">
            <span>
              No account?{" "}
              <a
                href={isSwitching ? "/signup?switch=1" : "/signup"}
                className="text-foreground hover:text-destructive font-bold underline underline-offset-2"
              >
                Staff sign-up
              </a>
            </span>
            {isSwitching ? (
              <span>
                Changed your mind?{" "}
                <a
                  href="/account"
                  className="text-foreground hover:text-destructive font-bold underline underline-offset-2"
                >
                  Back to my account
                </a>
              </span>
            ) : (
              <span className="text-muted-foreground text-xs font-bold tracking-[0.2em]">
                CERTA VIRILITER
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
