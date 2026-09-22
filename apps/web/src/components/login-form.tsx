import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export const LoginForm = () => {
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
        onSuccess: () => {
          window.location.assign("/dashboard");
          toast.success("Signed in successfully");
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
      className="flex h-dvh max-h-dvh overflow-hidden bg-[#013405] text-[#FFF8E7]"
      style={{ fontFamily: "Manrope, sans-serif" }}
    >
      {/* Brand panel */}
      <div className="relative hidden min-w-0 flex-[1.15_1_420px] flex-col justify-between overflow-hidden bg-[#013405] p-[clamp(28px,4vh,52px)_clamp(32px,4vw,58px)] md:flex">
        <div className="absolute inset-0 bg-[url('/uploads/campus-photo.jpg')] bg-cover bg-center" />
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
            <div className="text-xs tracking-[0.28em] whitespace-nowrap text-[#FFB203]">
              GALLE &bull; SRI LANKA
            </div>
          </div>
        </div>

        <div className="relative max-w-[26ch]">
          <div className="mb-[clamp(12px,2vh,20px)] text-xs font-bold tracking-[0.44em] text-[#FFB203]">
            CERTA VIRILITER
          </div>
          <div
            className="text-[clamp(34px,5.2vh,56px)] leading-[1.04] font-semibold"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            School Management System
          </div>
          <div className="my-[clamp(16px,2.6vh,26px)] h-0.5 w-13 bg-[#FFB203]" />
          <p
            className="m-0 text-[clamp(16px,2.2vh,21px)] leading-[1.5] text-[#FFF8E7]/82 italic"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Attendance, results, timetables and College communications in one
            place.
          </p>
        </div>

        <div className="relative text-xs tracking-[0.16em] text-[#FFF8E7]/65">
          For College staff, students and parents.
        </div>
      </div>

      {/* Sign-in form panel */}
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto bg-[#FFF8E7] p-[clamp(24px,4vh,56px)_clamp(20px,4vw,52px)] text-[#013405]">
        <div className="w-full max-w-[420px]">
          <div className="mb-3 text-xs font-bold tracking-[0.32em] text-[#A51919]">
            SIGN IN
          </div>
          <h1
            className="m-0 mb-2 text-[clamp(30px,4.6vh,44px)] leading-[1.05] font-semibold"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Welcome back
          </h1>
          <p className="m-0 mb-[clamp(18px,3vh,30px)] text-[13.5px] leading-[1.55] text-[#013405]/65">
            Enter your username and password to access your account.
          </p>

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
                className="w-full border border-[#013405]/22 bg-[#fffdf6] px-[15px] py-[13px] text-sm text-[#013405] outline-none placeholder:text-[#013405]/38 focus:border-[#013405] focus:bg-white"
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
                  className="w-full border border-[#013405]/22 bg-[#fffdf6] py-[13px] pr-[70px] pl-[15px] text-sm text-[#013405] outline-none focus:border-[#013405] focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-[13px] -translate-y-1/2 border-b border-[#013405]/30 text-xs font-extrabold tracking-[0.1em] text-[#013405]/55"
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="block w-full bg-[#013405] py-[15px] text-center text-[13.5px] font-extrabold tracking-[0.08em] text-[#FFB203] transition-colors hover:bg-[#062B0A] disabled:opacity-60"
            >
              {isSubmitting ? "SIGNING IN..." : "SIGN IN"}
            </button>
          </form>

          <div className="mt-[clamp(16px,2.8vh,28px)] flex flex-wrap justify-between gap-3.5 border-t border-[#013405]/12 pt-[clamp(12px,2vh,20px)] text-[12.5px] text-[#013405]/65">
            <span>Forgot your credentials? Contact the College office.</span>
            <span className="font-bold tracking-[0.18em] text-[#013405]/45">
              CERTA VIRILITER
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
