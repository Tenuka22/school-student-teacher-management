import { Button } from "@school-student-teacher-management/ui/components/button";
import { useRouter } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

interface ApprovalStep {
  label: string;
  detail: string;
  state: "done" | "current" | "upcoming";
}

const getMarkerClass = (state: ApprovalStep["state"]): string => {
  if (state === "done") {
    return "border-primary bg-primary text-primary-foreground";
  }

  if (state === "current") {
    // Amber as a *ground* with the deep green on top: white on `--gold` is
    // 1.9:1, and the primary ink on the accent is 9.6:1.
    return "border-accent bg-accent text-primary";
  }

  return "border-primary/30 bg-transparent text-primary/50";
};

const getLabelClass = (state: ApprovalStep["state"]): string =>
  state === "upcoming"
    ? "text-[14.5px] font-bold text-primary/55"
    : "text-[14.5px] font-bold text-primary";

const getSteps = (name: string, email: string): ApprovalStep[] => [
  {
    label: "Account created",
    detail: `${name || "Your account"} · ${email || "your address"}`,
    state: "done",
  },
  {
    label: "Email address confirmed",
    detail: "We verified that the address above belongs to you.",
    state: "done",
  },
  {
    label: "Staff access under review",
    detail:
      "An administrator or the Principal is checking that you are on the College establishment. Nothing is needed from you while this runs.",
    state: "current",
  },
  {
    label: "Teacher account activated",
    detail:
      "Once approved you become a teacher, and the teacher workspace opens the next time you check.",
    state: "upcoming",
  },
];

/**
 * The waiting room for a verified `teacher-requester`.
 *
 * The shell routes every requester here (see `_auth/route.tsx`) because the
 * role carries no workspace: until an administrator or the Principal approves
 * it, the teacher portal has nothing legitimate to show.
 *
 * This is a **waiting state, not an error**, and it is written as one: the
 * heading says what is happening, the steps say how far it has got, the
 * paragraph says who decides and who to ask, and the only button is one that
 * checks for a decision. Nothing here is styled as a failure, and every
 * action reports what happened — including when it fails, which used to leave
 * the button stuck on "CHECKING…" forever.
 */
export const PendingApprovalContent = ({
  name,
  email,
}: {
  name: string;
  email: string;
}) => {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const steps = getSteps(name, email);

  const recheck = async () => {
    if (isChecking) {
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      // The role lives in the session, so the guard has to re-run: invalidate
      // revalidates loaders, and `/` resolves the home path for the role as it
      // stands now. An approved requester lands in the teacher workspace; a
      // requester still pending is redirected straight back here.
      await router.invalidate();
      await router.navigate({ to: "/" });
      setIsChecking(false);
    } catch {
      setIsChecking(false);
      setError(
        "The College server could not be reached, so the approval status is still unknown. This page is not showing a failure — nothing has been lost. Try again in a moment."
      );
    }
  };

  const signOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setError(null);

    const { error: signOutError } = await authClient.signOut();

    if (signOutError) {
      setError(
        `Signing out did not complete: ${signOutError.message ?? "the server did not answer"}. Nothing was changed. Try again, or close this browser window to end the session on this device.`
      );
      setIsSigningOut(false);
      return;
    }

    window.location.assign("/login");
  };

  return (
    <main className="mx-auto w-full max-w-[40rem]">
      <header className="mb-8 flex items-center gap-3.5">
        <img
          alt="St. Aloysius' College crest"
          className="block h-[52px] w-auto"
          height={52}
          src="/uploads/college-crest.png"
          width={52}
        />
        <div className="leading-[1.15]">
          <p className="text-primary m-0 text-[14px] font-extrabold tracking-[0.06em]">
            ST. ALOYSIUS&rsquo; COLLEGE
          </p>
          <p className="text-gold m-0 text-xs tracking-[0.28em]">
            GALLE &middot; SRI LANKA
          </p>
        </div>
      </header>

      <h1 className="font-heading text-primary m-0 text-[clamp(28px,5vw,40px)] leading-[1.06] font-semibold">
        Waiting for staff approval
      </h1>
      <p className="text-primary/70 m-0 mt-3 mb-3 text-[14px] leading-[1.6]">
        Your request to join the College as a teacher has been received and your
        email address is confirmed. An administrator or the Principal now has to
        check that you are on the College establishment before the teacher role
        is granted. You do not need to do anything else, and you can close this
        page &mdash; the workspace opens by itself once that decision is made.
      </p>
      <p className="text-primary/70 m-0 mb-8 text-[14px] leading-[1.6]">
        If nobody has contacted you within a couple of school days, speak to the
        College administrator or the Principal directly and give them the
        address <strong>{email}</strong>. That is the only thing that can move
        this forward.
      </p>

      <ol className="border-primary/15 bg-card m-0 flex list-none flex-col gap-0 border px-[22px] py-5">
        {steps.map((step, index) => (
          <li
            className={`flex gap-4 ${index === steps.length - 1 ? "" : "border-primary/12 border-b pb-4"} ${index > 0 ? "pt-4" : ""}`}
            key={step.label}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border ${getMarkerClass(step.state)}`}
            >
              {step.state === "done" ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : (
                <span className="text-[11px] font-extrabold">{index + 1}</span>
              )}
            </span>
            <div>
              <p className={`m-0 ${getLabelClass(step.state)}`}>
                {step.label}
                {step.state === "current" ? (
                  <span className="text-gold ml-2 align-middle text-[10px] font-extrabold tracking-[0.18em]">
                    IN PROGRESS
                  </span>
                ) : null}
              </p>
              <p className="text-primary/65 mt-1 mb-0 text-[13px] leading-relaxed">
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {error ? (
        <p
          className="border-destructive/40 bg-destructive/5 text-destructive mt-6 mb-0 border p-3 text-[13px] leading-relaxed"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          aria-busy={isChecking}
          className="bg-primary text-primary-foreground hover:bg-primary-hover min-w-[9rem] px-5 py-2.5 text-xs font-extrabold tracking-[0.04em]"
          disabled={isChecking}
          onClick={recheck}
        >
          {isChecking ? "CHECKING…" : "CHECK AGAIN"}
        </Button>
        <Button
          aria-busy={isSigningOut}
          className="border-primary/35 text-primary hover:bg-primary/5 border px-5 py-2.5 text-xs font-extrabold tracking-[0.04em]"
          disabled={isSigningOut}
          onClick={signOut}
          variant="outline"
        >
          {isSigningOut ? "SIGNING OUT…" : "SIGN OUT"}
        </Button>
      </div>

      <p className="text-primary/55 mt-6 mb-0 max-w-prose text-xs leading-relaxed">
        Verification and approval are separate. Confirming your address only
        proved that the email is yours; staff access is granted by a person. If
        this request was not yours, sign out and tell an administrator.
      </p>
    </main>
  );
};
