import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

const CHECKLIST = [
  { label: "Academic year opened", value: "2027" },
  { label: "Teachers ported forward", value: "82" },
  { label: "Classes seeded", value: "70" },
  { label: "Homeroom teachers assigned", value: "63 / 70" },
  { label: "Timetable filled", value: "62%" },
];

const METRICS = [
  { label: "TEACHERS ACTIVE", value: "74", sub: "8 on leave or retired" },
  { label: "CLASSES", value: "70", sub: "7 without a homeroom" },
  { label: "SLOTS FILLED", value: "1,736", sub: "of 2,800 this year" },
  { label: "UNASSIGNED STAFF", value: "9", sub: "No periods yet" },
];

const NEEDS_ATTENTION = [
  {
    title: "7 classes have no homeroom teacher",
    detail: "6-C, 8-B, 9-A, 10-D and 3 more",
    action: "Assign",
  },
  {
    title: "9 teachers have no periods assigned",
    detail: "Newly ported from 2026",
    action: "Timetable",
  },
  {
    title: "Grade 12 A-Level classes not created",
    detail: "Streams vary yearly — always manual",
    action: "Create",
  },
];

const QUICK_ACTIONS = [
  "Add teacher",
  "Seed default classes",
  "Assign homerooms",
  "Fill timetable",
  "CSV import",
  "Export workbook",
];

const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
const RING_PROGRESS = 0.62;

const RouteComponent = () => {
  const { session } = Route.useRouteContext();
  const privateData = useQuery(orpc.privateData.queryOptions());

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-heading m-0 text-[38px] leading-[1.05] font-semibold text-[#013405]">
            Welcome back, {session?.user.name ?? "there"}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-[#013405]/65">
            {privateData.data?.message ??
              "Four things stand between you and a running timetable."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            className="border border-[#013405]/25 px-[18px] py-2.5 text-xs font-bold text-[#013405] transition-colors hover:border-[#013405]"
          >
            Import from 2026
          </button>
          <button
            type="button"
            className="bg-[#013405] px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] text-[#FFF8E7] transition-colors hover:bg-[#064A12]"
          >
            CONTINUE SETUP
          </button>
        </div>
      </div>

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(300px,340px)_minmax(360px,1fr)]">
        {/* Progress card */}
        <div className="border border-[#013405]/14 bg-[#fffdf6] p-6">
          <div className="text-xs font-extrabold tracking-[0.2em] text-[#A97400]">
            TERM-START PROGRESS
          </div>
          <div className="mt-[18px] flex items-center gap-5">
            <svg
              viewBox="0 0 120 120"
              className="h-[118px] w-[118px] flex-none -rotate-90"
            >
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="rgba(1,52,5,0.12)"
                strokeWidth="11"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#013405"
                strokeWidth="11"
                strokeDasharray={`${RING_CIRCUMFERENCE * RING_PROGRESS} ${RING_CIRCUMFERENCE}`}
              />
            </svg>
            <div>
              <div className="font-heading text-[46px] leading-none font-semibold text-[#013405]">
                62<span className="text-2xl">%</span>
              </div>
              <div className="mt-1.5 text-xs leading-relaxed text-[#013405]/65">
                1,736 of 2,800
                <br />
                timetable slots filled
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-col">
            {CHECKLIST.map((c) => (
              <div
                key={c.label}
                className="flex items-center gap-[11px] border-t border-[#013405]/10 py-2.5"
              >
                <span className="flex size-[17px] flex-none items-center justify-center border border-[#013405] bg-[#013405] text-xs font-extrabold text-[#FFF8E7]">
                  ✓
                </span>
                <span className="min-w-0 flex-1 text-[13px] text-[#013405]/80">
                  {c.label}
                </span>
                <span className="font-mono text-xs text-[#013405]/55">
                  {c.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-[18px]">
          {/* Metrics */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5">
            {METRICS.map((m) => (
              <div
                key={m.label}
                className="border border-t-2 border-[#013405]/14 border-t-[#013405] bg-[#fffdf6] px-[18px] py-4"
              >
                <div className="text-xs font-extrabold tracking-[0.16em] text-[#013405]/55">
                  {m.label}
                </div>
                <div className="font-heading mt-2 text-[34px] leading-none font-semibold text-[#013405]">
                  {m.value}
                </div>
                <div className="mt-1.5 text-xs text-[#013405]/58">{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Needs attention */}
          <div className="border border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
            <div className="mb-1.5 flex items-baseline justify-between gap-3.5">
              <div className="font-heading text-[23px] font-semibold text-[#013405]">
                Needs attention
              </div>
              <span className="cursor-pointer border-b border-[#A51919]/40 text-xs font-bold tracking-[0.06em] text-[#A51919]">
                VIEW ALL
              </span>
            </div>
            {NEEDS_ATTENTION.map((g) => (
              <div
                key={g.title}
                className="flex items-center gap-3.5 border-b border-[#013405]/10 py-3.5"
              >
                <span className="size-2 flex-none rotate-45 bg-[#A51919]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold text-[#013405]">
                    {g.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#013405]/55">
                    {g.detail}
                  </span>
                </span>
                <button
                  type="button"
                  className="border border-[#013405]/25 px-[15px] py-2 text-xs font-bold whitespace-nowrap text-[#013405] transition-colors hover:border-[#013405]"
                >
                  {g.action}
                </button>
              </div>
            ))}
          </div>

          <div className="grid items-start gap-[18px] sm:grid-cols-[minmax(320px,1fr)_minmax(200px,236px)]">
            {/* Quick actions */}
            <div className="border border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
              <div className="font-heading mb-3.5 text-[23px] font-semibold text-[#013405]">
                Quick actions
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2.5">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="border border-[#013405]/22 px-3.5 py-3 text-left text-[12.5px] font-bold text-[#013405] transition-colors hover:border-[#013405] hover:bg-[#F3F1E9]"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* System status */}
            <div className="border border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
              <div className="mb-3.5 text-xs font-extrabold tracking-[0.2em] text-[#013405]/55">
                SYSTEM STATUS
              </div>
              <div className="flex items-center gap-2.5">
                <span className="size-2.5 flex-none rounded-full bg-[#2E7D32]" />
                <span className="text-sm font-bold text-[#013405]">
                  All systems operational
                </span>
              </div>
              <div className="mt-2.5 text-xs leading-relaxed text-[#013405]/60">
                Last sync <span className="font-mono">2 min ago</span>
                <br />
                API &bull; database &bull; exports
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/$year/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(orpc.privateData.queryOptions());
  },
});
