import { Link, createFileRoute } from "@tanstack/react-router";

import type { LandingModule } from "@/functions/get-landing-stats";
import { getLandingStats } from "@/functions/get-landing-stats";
import { getUser } from "@/functions/get-user";
import { redirectAwayFromSelf } from "@/lib/away-from-self";

const formatDate = (iso: string | null): string => {
  if (!iso) {
    return "";
  }

  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatClock = (iso: string): string => {
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  return parsed.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatFigure = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString("en-US");

const ModuleTile = ({ module }: { module: LandingModule }) => (
  <div className="border border-[#FFB203]/28 bg-[#013405]/50 p-[clamp(9px,1.7vh,18px)_clamp(12px,1.4vw,17px)]">
    <div className="flex items-start justify-between gap-2">
      <div
        className="text-[clamp(17px,2.6vh,26px)] leading-none font-semibold text-[#FFB203]"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        {module.num}
      </div>
      <div
        className="text-[clamp(15px,2.2vh,22px)] leading-none font-semibold text-[#FFF8E7] tabular-nums"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        {formatFigure(module.value)}
      </div>
    </div>
    <div className="mt-[clamp(4px,0.8vh,8px)] text-[clamp(11.5px,1.6vh,13.5px)] font-bold">
      {module.name}
    </div>
    <div className="mt-[3px] text-[clamp(11.5px,1.35vh,12.5px)] leading-[1.45] text-[#FFF8E7]/60">
      {module.desc}
    </div>
    <div className="mt-[3px] text-[10px] font-bold tracking-[0.16em] text-[#FFB203]/70 uppercase">
      {module.unit}
    </div>
  </div>
);

const LandingPage = () => {
  const { stats } = Route.useLoaderData();
  const online = stats.databaseUp;
  const yearRange =
    stats.yearStart || stats.yearEnd
      ? `${formatDate(stats.yearStart)} – ${formatDate(stats.yearEnd)}`
      : "Dates not yet recorded";

  return (
    <div
      className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#04220A] text-[#FFF8E7]"
      style={{ fontFamily: "Manrope, sans-serif" }}
    >
      {/* Background photo + gradient + glow */}
      <div className="absolute inset-0 bg-[url('/uploads/campus-photo.jpg')] bg-cover bg-center" />
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(4,34,10,0.9)_0%,rgba(1,52,5,0.92)_48%,rgba(4,34,10,0.97)_100%)]" />
      <div className="pointer-events-none absolute -top-[30%] -right-[16%] size-[min(720px,80vw)] rounded-full bg-[radial-gradient(circle,rgba(255,178,3,0.2),transparent_62%)] motion-safe:animate-[om-glow_11s_ease-in-out_infinite]" />
      <img
        src="/uploads/college-crest.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-[6%] -bottom-[24%] h-[min(620px,84vh)] w-auto opacity-[0.06]"
      />

      <div className="relative flex h-full flex-col gap-[clamp(10px,1.6vh,18px)] p-[clamp(22px,3.4vh,40px)_clamp(20px,4vw,62px)]">
        {/* Header */}
        <header className="flex flex-none flex-wrap items-center gap-3.5">
          <img
            src="/uploads/college-crest.png"
            alt="St. Aloysius' College crest"
            className="block h-[clamp(38px,6vh,56px)] w-auto"
          />
          <div className="leading-[1.18]">
            <div className="text-[13px] font-extrabold tracking-[0.06em] whitespace-nowrap">
              ST. ALOYSIUS&rsquo; COLLEGE &mdash; GALLE
            </div>
            <div className="mt-[3px] text-xs tracking-[0.26em] whitespace-nowrap text-[#FFB203]">
              INTERNAL SYSTEM &bull; NOT THE PUBLIC WEBSITE
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2.5 border border-[#FFF8E7]/20 px-3.5 py-2">
            <span
              className={`size-1.5 rounded-full motion-safe:animate-[om-blink_2.4s_ease-in-out_infinite] ${online ? "bg-[#7BC67B]" : "bg-[#FF6B6B]"}`}
            />
            <span className="text-xs font-bold tracking-[0.1em] text-[#FFF8E7]/70">
              {online ? "SYSTEM ONLINE" : "DATABASE UNREACHABLE"}
            </span>
            <span className="font-mono text-xs text-[#FFB203] tabular-nums">
              {formatClock(stats.serverTime)}
            </span>
          </div>
        </header>
        {/* Hero + modules */}
        <main className="flex min-h-0 flex-1 flex-wrap content-center items-center gap-[clamp(20px,4vw,72px)] overflow-hidden">
          <div className="min-w-0 flex-1 basis-[340px]">
            <div className="mb-[clamp(8px,1.8vh,22px)] text-xs font-bold tracking-[0.46em] text-[#FFB203]">
              CERTA VIRILITER
            </div>
            <h1
              className="m-0 text-[clamp(34px,7.2vh,88px)] leading-[0.98] font-semibold"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              School
              <br />
              Management
              <br />
              System
            </h1>
            <div className="my-[clamp(10px,2.2vh,30px)] h-0.5 w-16 bg-[#FFB203]" />
            <p className="m-0 mb-[clamp(12px,2.6vh,34px)] max-w-[46ch] text-[clamp(12.5px,1.9vh,17.5px)] leading-[1.55] text-pretty text-[#FFF8E7]/78">
              {stats.currentYear === null
                ? "Attendance, examinations, results, timetables and fees — one internal platform for College staff, students and parents."
                : `Academic year ${stats.currentYear} is open. These figures are read from the College database on every page load — ${yearRange}.`}
            </p>
            <div className="flex flex-wrap gap-[13px]">
              <Link
                to="/login"
                className="bg-[#FFB203] px-8 py-[clamp(11px,1.9vh,15px)] text-[13px] font-extrabold tracking-[0.06em] whitespace-nowrap text-[#013405] transition-colors hover:bg-[#FFD45A]"
              >
                SIGN IN WITH YOUR USERNAME
              </Link>
              <Link
                to="/signup"
                className="border border-[#FFF8E7]/50 px-7 py-[clamp(11px,1.9vh,15px)] text-[13px] font-bold tracking-[0.06em] whitespace-nowrap transition-colors hover:border-[#FFB203] hover:text-[#FFB203]"
              >
                REGISTER &middot; REQUEST STAFF ACCESS
              </Link>
            </div>
            <p className="mt-[10px] max-w-[52ch] text-[12px] leading-relaxed text-[#FFF8E7]/50">
              Registration creates an account and verifies your email address.
              Staff roles are granted afterwards by an administrator or the
              Principal, who check that you are on the College establishment.
            </p>

            {/* Live figures, read from the database on each load. */}
            <dl className="mt-[clamp(12px,2.4vh,28px)] flex flex-wrap gap-x-[clamp(18px,3vw,40px)] gap-y-[8px]">
              {[
                {
                  label: "CURRENT YEAR",
                  value: stats.currentYear ?? "—",
                },
                {
                  label: "DAYS LEFT",
                  value:
                    stats.daysRemaining === null
                      ? "—"
                      : stats.daysRemaining.toLocaleString("en-US"),
                },
                {
                  label: "STAFF",
                  value: online ? stats.staffCount.toLocaleString() : "—",
                },
                {
                  label: "STUDENTS",
                  value: online ? stats.studentCount.toLocaleString() : "—",
                },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[12px] font-bold tracking-[0.24em] text-[#FFB203]">
                    {stat.label}
                  </dt>
                  <dd
                    className="mt-1 text-[clamp(18px,2.8vh,28px)] leading-none font-semibold text-[#FFF8E7] tabular-nums"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  >
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="grid max-h-full min-w-0 flex-1 basis-[300px] grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-[clamp(7px,1.2vh,12px)] overflow-hidden">
            {online
              ? stats.modules.map((module) => (
                  <ModuleTile key={module.num} module={module} />
                ))
              : Array.from({ length: 6 }, (_, index) => (
                  <div
                    className="animate-pulse border border-[#FFB203]/15 bg-[#013405]/30 p-[clamp(9px,1.7vh,18px)_clamp(12px,1.4vw,17px)]"
                    // eslint-disable-next-line react/no-array-index-key -- static placeholders have no stable id
                    key={index}
                  >
                    <div className="h-3 w-6 bg-[#FFF8E7]/10" />
                    <div className="mt-3 h-3 w-16 bg-[#FFF8E7]/10" />
                    <div className="mt-2 h-2 w-24 bg-[#FFF8E7]/5" />
                  </div>
                ))}
          </div>
        </main>
        {/* Footer */}
        <footer className="flex flex-none flex-wrap items-center justify-between gap-4 border-t border-[#FFF8E7]/14 pt-[clamp(12px,2vh,20px)] text-xs text-[#FFF8E7]/50">
          <span>
            Authorised users only. All activity is logged.{" "}
            <span className="font-mono">v{stats.version}</span>
          </span>
          <span className="font-bold tracking-[0.22em] text-[#FFB203]">
            ST. ALOYSIUS&rsquo; COLLEGE, GALLE
          </span>
        </footer>{" "}
      </div>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: LandingPage,
  // Signed-in visitors skip the splash and go straight to their workspace.
  beforeLoad: async ({ location }) => {
    const session = await getUser();

    if (session) {
      await redirectAwayFromSelf(location.pathname);
    }
  },
  loader: async () => ({ stats: await getLandingStats() }),
});
