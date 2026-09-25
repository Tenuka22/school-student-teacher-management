import { useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SavedAccounts } from "@/components/auth/saved-accounts";
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
    <div
      className="bg-primary text-primary-foreground flex h-dvh max-h-dvh overflow-hidden"
      style={{ fontFamily: "Manrope, sans-serif" }}
    >
      {/* Brand panel */}
      <div className="bg-primary relative hidden min-w-0 flex-[1.15_1_420px] flex-col justify-between overflow-hidden p-[clamp(28px,4vh,52px)_clamp(32px,4vw,58px)] md:flex">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(1,52,5,0.84)_0%,rgba(1,52,5,0.91)_55%,rgba(6,43,10,0.97)_100%)]" />
        <div className="pointer-events-none absolute -top-[150px] -right-[190px] size-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,178,3,0.22),transparent_65%)] motion-safe:animate-[om-pulse_9s_ease-in-out_infinite]" />
        <img
          src="/uploads/college-crest.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-[110px] -bottom-[150px] h-[min(520px,72vh)] w-auto opacity-[0.07] motion-safe:animate-[om-drift_16s_ease-in-out_infinite]"
        />

        <div className="relative flex items-center gap-3.5">
          <img
            src="/uploads/college-crest.png"
            alt="St. Aloysius' College crest"
            className="block h-[clamp(44px,6.4vh,58px)] w-auto"
          />
          <div className="leading-[1.15]">
            <div className="text-[14px] font-extrabold tracking-[0.06em] whitespace-nowrap">
              ST. ALOYSIUS&rsquo; COLLEGE
            </div>
            <div className="text-accent text-xs tracking-[0.28em] whitespace-nowrap">
              GALLE &bull; SRI LANKA
            </div>
          </div>
        </div>

        <div className="relative max-w-[26ch]">
          <div className="text-accent mb-[clamp(12px,2vh,20px)] text-xs font-bold tracking-[0.44em]">
            CERTA VIRILITER
          </div>
          <div
            className="text-[clamp(34px,5.2vh,56px)] leading-[1.04] font-semibold"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            School Management System
          </div>
          <div className="bg-accent my-[clamp(16px,2.6vh,26px)] h-0.5 w-13" />
          <p
            className="text-primary-foreground/82 m-0 text-[clamp(16px,2.2vh,21px)] leading-[1.5] italic"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Staff records, timetables, attendance and leave in one place.
          </p>
        </div>

        <div className="text-primary-foreground/65 relative text-xs tracking-[0.16em]">
          For College teaching staff and office staff.
        </div>
      </div>

      {/* Sign-in form panel */}
      <div className="bg-primary-foreground text-primary flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-[clamp(24px,4vh,56px)_clamp(20px,4vw,52px)]">
        <div className="w-full max-w-[420px]">
          <div className="text-destructive mb-3 text-xs font-bold tracking-[0.32em]">
            SIGN IN
          </div>
          <h1
            className="m-0 mb-2 text-[clamp(30px,4.6vh,44px)] leading-[1.05] font-semibold"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Welcome back
          </h1>
          <p className="text-primary/65 m-0 mb-[clamp(18px,3vh,30px)] text-[13.5px] leading-[1.55]">
            Enter your username and password to access your account.
          </p>
          <p className="text-primary/55 m-0 mb-[clamp(12px,2vh,20px)] text-[12.5px] leading-[1.5]">
            Teachers: use your <strong>NIC number</strong> as the username.
            Office staff, Principal and Deputy Principal: use the username
            issued with your account. General accounts sign in with the email
            address they registered.
          </p>

          {isSwitching && (
            <p className="border-accent bg-primary/5 text-primary/70 m-0 mb-[clamp(12px,2vh,20px)] border-l-[3px] py-2 pl-3 text-[12.5px] leading-[1.5]">
              You are already signed in. Adding or switching accounts here keeps
              your current session active.
            </p>
          )}

          <form onSubmit={handleSignIn}>
            <label className="mb-[clamp(12px,2vh,18px)] block">
              <span className="mb-2 block text-xs font-bold tracking-[0.16em]">
                USERNAME
              </span>
              <input
                type="text"
                placeholder="johndoe"
                required
                disabled={isSubmitting}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-primary/22 bg-card text-primary placeholder:text-primary/38 focus:border-primary w-full border px-[15px] py-[13px] text-sm outline-none focus:bg-white"
              />
            </label>

            <label className="mb-[clamp(16px,2.6vh,26px)] block">
              <span className="mb-2 block text-xs font-bold tracking-[0.16em]">
                PASSWORD
              </span>
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  disabled={isSubmitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-primary/22 bg-card text-primary focus:border-primary w-full border py-[13px] pr-[70px] pl-[15px] text-sm outline-none focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="border-primary/30 text-primary/55 absolute top-1/2 right-[13px] -translate-y-1/2 border-b text-xs font-extrabold tracking-[0.1em]"
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary text-accent block w-full py-[15px] text-center text-[13.5px] font-extrabold tracking-[0.08em] transition-colors hover:bg-[#062B0A] disabled:opacity-60"
            >
              {isSubmitting ? "SIGNING IN..." : "SIGN IN"}
            </button>
          </form>

          <div className="mt-[clamp(16px,2.8vh,28px)]">
            <SavedAccounts />
          </div>

          <div className="border-primary/12 text-primary/65 mt-[clamp(16px,2.8vh,28px)] flex flex-wrap justify-between gap-3.5 border-t pt-[clamp(12px,2vh,20px)] text-[12.5px]">
            <span>
              No account?{" "}
              <a
                href={isSwitching ? "/signup?switch=1" : "/signup"}
                className="text-primary hover:text-destructive font-bold underline underline-offset-2"
              >
                Staff sign-up
              </a>
            </span>
            {isSwitching ? (
              <span>
                Changed your mind?{" "}
                <a
                  href="/account"
                  className="text-primary hover:text-destructive font-bold underline underline-offset-2"
                >
                  Back to my account
                </a>
              </span>
            ) : (
              <span className="text-primary/45 font-bold tracking-[0.18em]">
                CERTA VIRILITER
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
