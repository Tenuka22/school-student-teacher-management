import { Link, createFileRoute } from "@tanstack/react-router";

import { CollegeCrest } from "@/components/ui-patterns/college-crest";
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
  <div className="border-accent/28 bg-primary/50 border p-[clamp(12px,1.9vh,18px)_clamp(14px,1.4vw,18px)]">
    <div className="flex items-start justify-between gap-2">
      <div className="text-accent text-sm leading-none font-bold tracking-[0.08em] tabular-nums">
        {module.num}
      </div>
      <div className="text-primary-foreground text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums">
        {formatFigure(module.value)}
      </div>
    </div>
    <div className="mt-[clamp(6px,1vh,10px)] text-[0.9375rem] leading-snug font-semibold">
      {module.name}
    </div>
    <div className="text-primary-foreground/75 mt-1 text-sm">{module.desc}</div>
    <div className="text-accent mt-1.5 text-xs font-bold tracking-[0.08em] uppercase">
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
    <div className="surface-deep bg-surface-deep text-primary-foreground relative flex min-h-dvh flex-col overflow-hidden">
      {/* Gradient + glow. The wrapper clips these decorative layers and
          grows with its content, so large text or zoom scrolls the page
          instead of cutting anything off. */}
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(4,34,10,0.9)_0%,rgba(1,52,5,0.92)_48%,rgba(4,34,10,0.97)_100%)]" />
      <div className="pointer-events-none absolute -top-[30%] -right-[16%] size-[min(720px,80vw)] rounded-full bg-[radial-gradient(circle,rgba(255,178,3,0.2),transparent_62%)] motion-safe:animate-[om-glow_11s_ease-in-out_infinite]" />
      <CollegeCrest
        size="large"
        className="pointer-events-none absolute -right-[6%] -bottom-[24%] h-[min(620px,84vh)] w-auto opacity-[0.06]"
      />

      <div className="relative mx-auto flex w-full max-w-[100rem] flex-1 flex-col gap-[clamp(10px,1.6vh,18px)] p-[clamp(22px,3.4vh,40px)_clamp(20px,4vw,62px)]">
        {/* Header */}
        <header className="flex flex-none flex-wrap items-center gap-3.5">
          <CollegeCrest
            alt="St. Aloysius' College crest"
            size="small"
            className="block h-[clamp(38px,6vh,56px)] w-auto"
          />
          <div className="leading-[1.18]">
            <div className="text-[0.9375rem] font-bold tracking-[-0.005em] whitespace-nowrap">
              St. Aloysius&rsquo; College &mdash; Galle
            </div>
            <div className="text-accent type-eyebrow mt-0.75 font-semibold sm:whitespace-nowrap">
              Internal system &bull; not the public website
            </div>
          </div>
          <div className="border-primary-foreground/20 ml-auto flex items-center gap-2.5 border px-3.5 py-2">
            <span
              className={`size-1.5 rounded-full motion-safe:animate-[om-blink_2.4s_ease-in-out_infinite] ${online ? "bg-chart-4" : "bg-[#FF6B6B]"}`}
            />
            <span className="text-primary-foreground/80 text-xs font-bold tracking-[0.08em] uppercase">
              {online ? "System online" : "Database unreachable"}
            </span>
            <span className="text-accent text-sm font-semibold tabular-nums">
              {formatClock(stats.serverTime)}
            </span>
          </div>
        </header>
        {/* Hero + modules */}
        <main className="flex flex-1 flex-wrap content-center items-center gap-[clamp(24px,4vw,72px)]">
          <div className="min-w-0 flex-1 basis-[340px]">
            <div className="text-accent mb-[clamp(10px,1.8vh,22px)] text-xs font-bold tracking-[0.24em]">
              CERTA VIRILITER
            </div>
            <h1 className="type-display m-0">
              School
              <br />
              Management
              <br />
              System
            </h1>
            <div className="bg-accent my-[clamp(10px,2.2vh,30px)] h-0.5 w-16" />
            <p className="text-primary-foreground/80 m-0 mb-[clamp(16px,2.6vh,34px)] max-w-[46ch] text-base leading-[1.6] text-pretty lg:text-lg">
              {stats.currentYear === null
                ? "Attendance, examinations, results, timetables and fees — one internal platform for College staff, students and parents."
                : `Academic year ${stats.currentYear} is open. These figures are read from the College database on every page load — ${yearRange}.`}
            </p>
            <div className="flex flex-wrap gap-[13px]">
              <Link
                to="/login"
                className="bg-accent text-foreground hover:bg-accent-hover px-7 py-3.5 text-center text-[0.9375rem] font-bold transition-colors sm:whitespace-nowrap"
              >
                Sign in with your username
              </Link>
              <Link
                to="/signup"
                className="border-primary-foreground/50 hover:border-accent hover:text-accent border px-7 py-3.5 text-center text-[0.9375rem] font-semibold transition-colors sm:whitespace-nowrap"
              >
                Register &middot; request staff access
              </Link>
            </div>
            <p className="text-primary-foreground/75 mt-3 max-w-[52ch] text-sm">
              Registration creates an account and verifies your email address.
              Staff roles are granted afterwards by an administrator or the
              Principal, who check that you are on the College establishment.
            </p>

            {/* Live figures, read from the database on each load. */}
            <dl className="mt-[clamp(14px,2.4vh,28px)] grid grid-cols-2 gap-x-[clamp(18px,3vw,40px)] gap-y-4 sm:flex sm:flex-wrap">
              {[
                {
                  label: "Current year",
                  value: stats.currentYear ?? "—",
                },
                {
                  label: "Days left",
                  value:
                    stats.daysRemaining === null
                      ? "—"
                      : stats.daysRemaining.toLocaleString("en-US"),
                },
                {
                  label: "Staff",
                  value: online ? stats.staffCount.toLocaleString() : "—",
                },
                {
                  label: "Students",
                  value: online ? stats.studentCount.toLocaleString() : "—",
                },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-accent type-eyebrow">{stat.label}</dt>
                  <dd className="text-primary-foreground mt-1.5 text-[1.75rem] leading-none font-bold tracking-[-0.02em] tabular-nums">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="grid min-w-0 flex-1 basis-[300px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[clamp(8px,1.2vh,12px)]">
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
        <footer className="border-primary-foreground/14 text-primary-foreground/70 flex flex-none flex-wrap items-center justify-between gap-4 border-t pt-[clamp(12px,2vh,20px)] text-sm">
          <span>
            Authorised users only. All activity is logged.{" "}
            <span className="tabular-nums">v{stats.version}</span>
          </span>
          <span className="text-accent type-eyebrow">
            St. Aloysius&rsquo; College, Galle
          </span>
        </footer>
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
