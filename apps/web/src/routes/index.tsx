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
  <div className="border-accent/28 bg-primary/50 border p-[clamp(9px,1.7vh,18px)_clamp(12px,1.4vw,17px)]">
    <div className="flex items-start justify-between gap-2">
      <div
        className="text-accent text-[clamp(17px,2.6vh,26px)] leading-none font-semibold"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        {module.num}
      </div>
      <div
        className="text-primary-foreground text-[clamp(15px,2.2vh,22px)] leading-none font-semibold tabular-nums"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        {formatFigure(module.value)}
      </div>
    </div>
    <div className="mt-[clamp(4px,0.8vh,8px)] text-[clamp(11.5px,1.6vh,13.5px)] font-bold">
      {module.name}
    </div>
    <div className="text-primary-foreground/60 mt-[3px] text-[clamp(11.5px,1.35vh,12.5px)] leading-[1.45]">
      {module.desc}
    </div>
    <div className="text-accent/70 mt-[3px] text-[10px] font-bold tracking-[0.16em] uppercase">
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
      className="bg-sidebar text-primary-foreground relative flex h-dvh max-h-dvh flex-col overflow-hidden"
      style={{ fontFamily: "Manrope, sans-serif" }}
    >
      {/* Brand background: the gradient carries the panel on its own. The
          previous layer pointed at /uploads/campus-photo.jpg, which is not in
          the repository, so every visit to the landing page logged a 404. */}
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
            <div className="text-accent mt-[3px] text-xs tracking-[0.26em] whitespace-nowrap">
              INTERNAL SYSTEM &bull; NOT THE PUBLIC WEBSITE
            </div>
          </div>
          <div className="border-primary-foreground/20 ml-auto flex items-center gap-2.5 border px-3.5 py-2">
            <span
              className={`size-1.5 rounded-full motion-safe:animate-[om-blink_2.4s_ease-in-out_infinite] ${online ? "bg-[#7BC67B]" : "bg-[#FF6B6B]"}`}
            />
            <span className="text-primary-foreground/70 text-xs font-bold tracking-[0.1em]">
              {online ? "SYSTEM ONLINE" : "DATABASE UNREACHABLE"}
            </span>
            <span className="text-accent font-mono text-xs tabular-nums">
              {formatClock(stats.serverTime)}
            </span>
          </div>
        </header>
        {/* Hero + modules */}
        <main className="flex min-h-0 flex-1 flex-wrap content-center items-center gap-[clamp(20px,4vw,72px)] overflow-hidden">
          <div className="min-w-0 flex-1 basis-[340px]">
            <div className="text-accent mb-[clamp(8px,1.8vh,22px)] text-xs font-bold tracking-[0.46em]">
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
            <div className="bg-accent my-[clamp(10px,2.2vh,30px)] h-0.5 w-16" />
            <p className="text-primary-foreground/78 m-0 mb-[clamp(12px,2.6vh,34px)] max-w-[46ch] text-[clamp(12.5px,1.9vh,17.5px)] leading-[1.55] text-pretty">
              {stats.currentYear === null
                ? "Staff records, classes, timetables, attendance and leave — one internal platform for the College's teaching staff."
                : `Academic year ${stats.currentYear} is open. These figures are read from the College database on every page load — ${yearRange}.`}
            </p>
            <div className="flex flex-wrap gap-[13px]">
              <Link
                to="/login"
                className="bg-accent text-primary hover:bg-accent-hover px-8 py-[clamp(11px,1.9vh,15px)] text-[13px] font-extrabold tracking-[0.06em] whitespace-nowrap transition-colors"
              >
                SIGN IN WITH YOUR USERNAME
              </Link>
              <Link
                to="/signup"
                className="border-primary-foreground/50 hover:border-accent hover:text-accent border px-7 py-[clamp(11px,1.9vh,15px)] text-[13px] font-bold tracking-[0.06em] whitespace-nowrap transition-colors"
              >
                REGISTER &middot; REQUEST STAFF ACCESS
              </Link>
            </div>
            <p className="text-primary-foreground/50 mt-[10px] max-w-[52ch] text-[12px] leading-relaxed">
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
                  <dt className="text-accent text-[12px] font-bold tracking-[0.24em]">
                    {stat.label}
                  </dt>
                  <dd
                    className="text-primary-foreground mt-1 text-[clamp(18px,2.8vh,28px)] leading-none font-semibold tabular-nums"
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
                    className="border-accent/15 bg-primary/30 animate-pulse border p-[clamp(9px,1.7vh,18px)_clamp(12px,1.4vw,17px)]"
                    // eslint-disable-next-line react/no-array-index-key -- static placeholders have no stable id
                    key={index}
                  >
                    <div className="bg-primary-foreground/10 h-3 w-6" />
                    <div className="bg-primary-foreground/10 mt-3 h-3 w-16" />
                    <div className="bg-primary-foreground/5 mt-2 h-2 w-24" />
                  </div>
                ))}
          </div>
        </main>
        {/* Footer */}
        <footer className="border-primary-foreground/14 text-primary-foreground/50 flex flex-none flex-wrap items-center justify-between gap-4 border-t pt-[clamp(12px,2vh,20px)] text-xs">
          <span>
            Sign in to reach College records. The figures on this page are
            public totals. <span className="font-mono">v{stats.version}</span>
          </span>
          <span className="text-accent font-bold tracking-[0.22em]">
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
