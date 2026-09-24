import { Button } from "@school-student-teacher-management/ui/components/button";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

interface ApprovalStep {
  label: string;
  detail: string;
  state: "done" | "current" | "upcoming";
}

const getMarkerClass = (state: ApprovalStep["state"]): string => {
  if (state === "done") {
    return "border-[#013405] bg-[#013405] text-[#FFF8E7]";
  }

  if (state === "current") {
    return "border-[#A8730B] bg-[#A8730B] text-white";
  }

  return "border-[#013405]/25 bg-transparent text-[#013405]/40";
};

const getLabelClass = (state: ApprovalStep["state"]): string =>
  state === "upcoming"
    ? "text-[14.5px] font-bold text-[#013405]/45"
    : "text-[14.5px] font-bold text-[#013405]";

const getSteps = (name: string, email: string): ApprovalStep[] => [
  {
    label: "Account created",
    detail: `${name} · ${email}`,
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
      "An administrator or the Principal is checking that you are on the College establishment.",
    state: "current",
  },
  {
    label: "Teacher account activated",
    detail:
      "Once approved you become a teacher and the teacher workspace opens automatically.",
    state: "upcoming",
  },
];

/**
 * The waiting room for a verified `teacher-requester`.
 *
 * The shell routes every requester here (see `_auth/route.tsx`) because the
 * role carries no workspace: until an administrator or the Principal approves
 * it, the teacher portal has nothing legitimate to show. The page says so
 * plainly, states what has already happened, and gives one useful action —
 * re-check once someone has approved.
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
  const steps = getSteps(name, email);

  const recheck = async () => {
    setIsChecking(true);

    // The role lives in the session, so the guard has to re-run: invalidate
    // revalidates loaders, and `/` resolves the home path for the role as it
    // stands now. An approved requester lands in the teacher workspace; a
    // requester still pending is redirected straight back here.
    await router.invalidate();
    await router.navigate({ to: "/" });
    setIsChecking(false);
  };

  return (
    <div className="mx-auto w-full max-w-[620px]">
      <div className="mb-8 flex items-center gap-3.5">
        <img
          src="/uploads/college-crest.png"
          alt="St. Aloysius' College crest"
          className="block h-[52px] w-auto"
        />
        <div className="leading-[1.15]">
          <div className="text-[14px] font-extrabold tracking-[0.06em] text-[#013405]">
            ST. ALOYSIUS&rsquo; COLLEGE
          </div>
          <div className="text-xs tracking-[0.28em] text-[#A8730B]">
            GALLE &bull; SRI LANKA
          </div>
        </div>
      </div>

      <div className="mb-2 text-xs font-bold tracking-[0.32em] text-[#A51919]">
        TEACHER REGISTRATION
      </div>
      <h1 className="font-heading m-0 mb-3 text-[clamp(30px,5vw,42px)] leading-[1.05] font-semibold text-[#013405]">
        Waiting for approval
      </h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.6] text-[#013405]/65">
        Your request to join the College as a teacher has been received. An
        administrator or the Principal has to confirm that you are on the
        College establishment before the teacher role is granted. You do not
        need to do anything else &mdash; this page will open your workspace as
        soon as that happens.
      </p>

      <ol className="m-0 flex list-none flex-col gap-0 border border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
        {steps.map((step, index) => (
          <li
            className={`flex gap-4 ${index === steps.length - 1 ? "" : "border-b border-[#013405]/10 pb-4"} ${index > 0 ? "pt-4" : ""}`}
            key={step.label}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border text-[11px] font-extrabold ${getMarkerClass(step.state)}`}
            >
              {step.state === "done" ? "✓" : index + 1}
            </span>
            <div>
              <div className={getLabelClass(step.state)}>
                {step.label}
                {step.state === "current" && (
                  <span className="ml-2 align-middle text-[10px] font-extrabold tracking-[0.18em] text-[#A8730B]">
                    IN PROGRESS
                  </span>
                )}
              </div>
              <div className="mt-1 text-[13px] leading-relaxed text-[#013405]/60">
                {step.detail}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          className="bg-[#013405] px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] text-[#FFF8E7] hover:bg-[#064A12]"
          disabled={isChecking}
          onClick={recheck}
        >
          {isChecking ? "CHECKING…" : "CHECK AGAIN"}
        </Button>
        <Button
          className="border border-[#013405]/30 px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] text-[#013405] hover:bg-[#013405]/5"
          onClick={async () => {
            await authClient.signOut();
            window.location.assign("/login");
          }}
          variant="outline"
        >
          SIGN OUT
        </Button>
      </div>

      <p className="mt-6 max-w-prose text-xs leading-relaxed text-[#013405]/50">
        Verification and approval are separate. Confirming your address only
        proved that the email is yours; staff access is granted by a person. If
        the request was not yours, sign out and tell an administrator.
      </p>
    </div>
  );
};
