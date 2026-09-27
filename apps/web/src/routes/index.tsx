import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";

import type {
  LandingModule,
  LandingStats,
} from "@/functions/get-landing-stats";
import { getLandingStats } from "@/functions/get-landing-stats";
import {
  SITE_NAME,
  SITE_TAGLINE,
  absoluteUrl,
  pageSeo,
  readSiteOrigin,
} from "@/functions/get-site-origin";
import { getUser } from "@/functions/get-user";
import { redirectAwayFromSelf } from "@/lib/away-from-self";

const CREST = "/uploads/college-crest.png";

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

/** One line naming the year the figures below belong to. */
const termSummary = (
  stats: LandingStats,
  termRange: string | null,
  daysLabel: string | null
): string => {
  if (stats.currentYear === null) {
    return "No academic year is open yet";
  }

  const parts = [`Academic year ${stats.currentYear}`];

  if (termRange) {
    parts.push(termRange);
  }

  if (daysLabel) {
    parts.push(`${daysLabel} remaining`);
  }

  return parts.join(" · ");
};

/**
 * The live figures, as a table.
 *
 * A table because that is what this data is: six counts of records, each with
 * the unit it is counted in. Tiled as six equal boxes the same numbers read as
 * a dashboard screenshot, and a reader cannot compare a row against another
 * without holding both in their head.
 */
const FiguresTable = ({ modules }: { modules: LandingModule[] }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[34rem] border-collapse text-left">
      <caption className="text-primary-foreground/60 pb-3 text-left text-xs leading-relaxed">
        Read from the College database when this page was served. Aggregate
        counts only — no names, addresses or other personal data.
      </caption>
      <thead>
        <tr className="border-primary-foreground/25 border-b">
          <th
            className="text-accent py-2 pr-4 text-[12px] font-extrabold tracking-[0.18em] uppercase"
            scope="col"
          >
            Record
          </th>
          <th
            className="text-accent py-2 pr-4 text-[12px] font-extrabold tracking-[0.18em] uppercase"
            scope="col"
          >
            What it counts
          </th>
          <th
            className="text-accent py-2 pl-4 text-right text-[12px] font-extrabold tracking-[0.18em] uppercase"
            scope="col"
          >
            This year
          </th>
        </tr>
      </thead>
      <tbody>
        {modules.map((module) => (
          <tr
            className="border-primary-foreground/12 border-b last:border-b-0"
            key={module.name}
          >
            <th className="py-2.5 pr-4 align-top text-sm font-bold" scope="row">
              {module.name}
            </th>
            <td className="text-primary-foreground/70 py-2.5 pr-4 align-top text-[13px] leading-relaxed">
              {module.desc}
            </td>
            <td className="py-2.5 pl-4 text-right align-top">
              <span className="font-heading block text-2xl leading-none font-semibold tabular-nums">
                {formatFigure(module.value)}
              </span>
              <span className="text-primary-foreground/50 mt-1 block text-[12px] font-bold tracking-[0.14em] uppercase">
                {module.unit}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Retrying re-runs the route loader, which re-reads the database. */
const RetryButton = ({
  label = "Read the figures again",
  pending = false,
}: {
  label?: string;
  pending?: boolean;
}) => {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-busy={pending}
      disabled={pending}
      onClick={() => {
        void router.invalidate();
      }}
      className="border-primary-foreground/45 hover:border-accent hover:text-accent mt-4 inline-flex items-center gap-2 border px-4 py-2.5 text-[12px] font-extrabold tracking-[0.08em] transition-colors disabled:opacity-60"
    >
      <RefreshCw aria-hidden="true" className="size-3.5" />
      {pending ? "READING…" : label.toUpperCase()}
    </button>
  );
};

/**
 * The figures section, told apart into three states before anything is drawn.
 *
 * Written as early returns rather than nested conditionals because the states
 * are genuinely different claims, not variations of one: "the read failed",
 * "the read succeeded and there is nothing yet", and "here are the numbers".
 * Collapsing them into a spinner or a row of dashes is what made the previous
 * version of this page lie — a pulsing skeleton is indistinguishable from a
 * page that will never load.
 */
const FiguresSection = ({ stats }: { stats: LandingStats }) => {
  const termRange =
    stats.yearStart || stats.yearEnd
      ? `${formatDate(stats.yearStart)} – ${formatDate(stats.yearEnd)}`
      : null;
  const daysLabel =
    stats.daysRemaining === null
      ? null
      : `${stats.daysRemaining.toLocaleString("en-US")} whole days`;

  const heading = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <h2
        className="font-heading m-0 text-[clamp(22px,2.6vw,30px)] leading-tight font-semibold"
        id="figures-heading"
      >
        What the system currently holds
      </h2>
      <p className="text-primary-foreground/60 m-0 text-xs">
        {termSummary(stats, termRange, daysLabel)}
      </p>
    </div>
  );

  if (!stats.databaseUp) {
    return (
      <section aria-labelledby="figures-heading">
        {heading}
        <output className="border-primary-foreground/30 mt-5 block border p-6">
          <span className="font-heading m-0 flex items-center gap-2 text-xl font-semibold">
            <CircleAlert aria-hidden="true" className="text-accent size-5" />
            The College database did not answer
          </span>
          <span className="text-primary-foreground/70 mt-2 block max-w-[62ch] text-sm leading-relaxed">
            This page reads its figures live, and the read failed. Nothing below
            is shown rather than shown as a zero &mdash; a count of nothing and
            a count that could not be taken are different facts. The sign-in
            page is unaffected and still works.
          </span>
          <RetryButton />
        </output>
      </section>
    );
  }

  if (stats.modules.length === 0) {
    return (
      <section aria-labelledby="figures-heading">
        {heading}
        <output className="border-primary-foreground/30 mt-5 block border p-6">
          <span className="font-heading m-0 flex items-center gap-2 text-xl font-semibold">
            <CircleCheck aria-hidden="true" className="size-5" />
            The database answered, and the year is empty
          </span>
          <span className="text-primary-foreground/70 mt-2 block max-w-[62ch] text-sm leading-relaxed">
            No academic year is open, so there is nothing to count yet. An
            administrator opens one from the College console; the figures above
            appear as soon as it exists.
          </span>
          <RetryButton />
        </output>
      </section>
    );
  }

  return (
    <section aria-labelledby="figures-heading">
      {heading}
      <div className="mt-5">
        <FiguresTable modules={stats.modules} />
      </div>
    </section>
  );
};

const LandingPage = () => {
  const { stats } = Route.useLoaderData();

  return (
    <div className="bg-sidebar text-primary-foreground flex min-h-dvh flex-col">
      <a
        className="bg-accent text-primary sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10 focus:px-4 focus:py-2 focus:text-[13px] focus:font-extrabold"
        href="#main"
      >
        Skip to content
      </a>

      <header className="border-primary-foreground/14 flex flex-wrap items-center gap-x-5 gap-y-3 border-b px-[clamp(20px,5vw,64px)] py-5">
        <img
          alt="St. Aloysius' College crest"
          className="block h-12 w-auto shrink-0"
          height={48}
          src={CREST}
          width={48}
        />
        <div className="leading-tight">
          <p className="m-0 text-[13px] font-extrabold tracking-[0.06em]">
            ST. ALOYSIUS&rsquo; COLLEGE
          </p>
          <p className="text-accent mt-1 mb-0 text-xs tracking-[0.24em]">
            GALLE &middot; SRI LANKA &middot; INTERNAL SYSTEM
          </p>
        </div>

        <p className="text-primary-foreground/60 m-0 ml-auto hidden text-xs lg:block">
          Not the public website. Staff and office accounts only.
        </p>

        <nav aria-label="Account">
          <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
            <li>
              <Link
                className="border-primary-foreground/40 hover:border-accent hover:text-accent inline-block border px-4 py-2.5 text-[12px] font-extrabold tracking-[0.08em] transition-colors"
                to="/signup"
              >
                REQUEST STAFF ACCESS
              </Link>
            </li>
            <li>
              <Link
                className="bg-accent text-primary hover:bg-accent-hover inline-block px-5 py-2.5 text-[12px] font-extrabold tracking-[0.08em] transition-colors"
                to="/login"
              >
                SIGN IN
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main
        className="flex flex-1 flex-col gap-[clamp(28px,5vh,64px)] px-[clamp(20px,5vw,64px)] py-[clamp(28px,5vh,64px)]"
        id="main"
      >
        <section className="max-w-[68ch]">
          <h1 className="font-heading m-0 text-[clamp(34px,6.2vw,68px)] leading-[1.02] font-semibold text-balance">
            {SITE_TAGLINE}
          </h1>
          <p className="text-primary-foreground/85 mt-5 mb-0 text-[clamp(15px,1.5vw,18px)] leading-[1.6] text-pretty">
            Staff records, classes and homeroom assignment, the weekly
            timetable, attendance, leave with quotas, and the school-wide
            equipment register &mdash; for the teaching staff of {SITE_NAME}.
            Every record is keyed to an academic year, and the year is part of
            the address rather than a filter, so last year&rsquo;s history is
            still there to read.
          </p>
          <p className="text-primary-foreground/70 mt-4 mb-0 max-w-[68ch] text-[15px] leading-[1.6]">
            This is the College&rsquo;s own system. Signing in needs the
            username issued with your account &mdash; for teachers, your NIC
            number. Registration checks your email address and then waits for an
            administrator or the Principal to confirm that you are on the
            establishment.
          </p>
        </section>

        <FiguresSection stats={stats} />

        <section aria-labelledby="access-heading" className="max-w-[68ch]">
          <h2
            className="font-heading m-0 text-[clamp(22px,2.6vw,30px)] leading-tight font-semibold"
            id="access-heading"
          >
            Getting an account
          </h2>
          <dl className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="m-0 text-[13px] font-extrabold tracking-[0.06em]">
                Teaching staff
              </dt>
              <dd className="text-primary-foreground/70 mt-1.5 mb-0 text-sm leading-relaxed">
                Register with your name, email and NIC number. The address is
                confirmed by a code, then an administrator or the Principal
                checks you are on the establishment before the teacher role is
                granted. You will see a waiting page until they do.
              </dd>
            </div>
            <div>
              <dt className="m-0 text-[13px] font-extrabold tracking-[0.06em]">
                Office staff, Principal, Deputy Principal
              </dt>
              <dd className="text-primary-foreground/70 mt-1.5 mb-0 text-sm leading-relaxed">
                There is no self-service sign-up. An administrator creates the
                staff record and hands over the login.
              </dd>
            </div>
          </dl>
        </section>
      </main>

      <footer className="border-primary-foreground/14 text-primary-foreground/55 flex flex-wrap items-center justify-between gap-4 border-t px-[clamp(20px,5vw,64px)] py-5 text-xs">
        <span className="max-w-[54ch]">
          {SITE_NAME} &middot; {SITE_TAGLINE}. Figures on this page are public
          totals, read on each visit.
        </span>
        <span className="text-accent font-extrabold tracking-[0.22em]">
          CERTA VIRILITER
        </span>
        <span className="font-mono tabular-nums">
          Server {formatClock(stats.serverTime)} &middot; v{stats.version}
        </span>
      </footer>
    </div>
  );
};

/** Client-side navigation to `/` while its loader is still running. */
const LandingSkeleton = () => (
  <div
    aria-busy="true"
    aria-live="polite"
    className="bg-sidebar text-primary-foreground min-h-dvh"
  >
    <span className="sr-only">Loading the College system…</span>
    <div className="border-primary-foreground/14 flex items-center gap-5 border-b px-[clamp(20px,5vw,64px)] py-5">
      <div className="bg-primary-foreground/10 size-12" />
      <div className="flex flex-col gap-2">
        <div className="bg-primary-foreground/20 h-3 w-44" />
        <div className="bg-primary-foreground/10 h-2.5 w-64" />
      </div>
    </div>
    <div className="flex flex-col gap-10 px-[clamp(20px,5vw,64px)] py-[clamp(28px,5vh,64px)]">
      <div className="flex flex-col gap-4">
        <div className="bg-primary-foreground/20 h-12 w-[min(30rem,80%)]" />
        <div className="bg-primary-foreground/10 h-3 w-[min(46rem,95%)]" />
        <div className="bg-primary-foreground/10 h-3 w-[min(38rem,80%)]" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="bg-primary-foreground/20 h-7 w-72" />
        <div className="bg-primary-foreground/10 h-3 w-full" />
        <div className="bg-primary-foreground/10 h-3 w-11/12" />
        <div className="bg-primary-foreground/10 h-3 w-4/5" />
      </div>
    </div>
  </div>
);

/** A failed loader, named and recoverable — never a dead end. */
const LandingError = () => (
  <div className="bg-sidebar text-primary-foreground flex min-h-dvh items-center px-[clamp(20px,5vw,64px)] py-16">
    <div className="max-w-[62ch]">
      <h1 className="font-heading m-0 text-[clamp(28px,4.4vw,44px)] leading-tight font-semibold">
        This page could not be served
      </h1>
      <p className="text-primary-foreground/75 mt-4 mb-0 text-[15px] leading-relaxed">
        The landing page reads its figures from the College database over the
        network, and the request did not complete. Signing in does not depend on
        this page &mdash; go straight to the{" "}
        <Link
          className="text-accent font-bold underline underline-offset-2"
          to="/login"
        >
          sign-in page
        </Link>{" "}
        if you already have an account, or read the numbers again.
      </p>
      <RetryButton label="Try reading again" />
      <p className="text-primary-foreground/50 mt-6 mb-0 text-xs">
        If it keeps failing, the College server or its network is down; tell an
        administrator.
      </p>
    </div>
  </div>
);

export const Route = createFileRoute("/")({
  component: LandingPage,
  pendingComponent: LandingSkeleton,
  errorComponent: LandingError,
  // Signed-in visitors skip the splash and go straight to their workspace.
  beforeLoad: async ({ location }) => {
    const session = await getUser();

    if (session) {
      await redirectAwayFromSelf(location.pathname);
    }
  },
  loader: async () => ({ stats: await getLandingStats() }),
  head: ({ matches }) =>
    pageSeo({
      matches,
      path: "/",
      title: `${SITE_NAME} — ${SITE_TAGLINE}`,
      description:
        "The internal staff system for St. Aloysius' College, Galle: staff records, classes, timetables, attendance, leave with quotas and the equipment register, every record scoped to an academic year.",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: `${SITE_NAME} ${SITE_TAGLINE}`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "en-GB",
        url: absoluteUrl(readSiteOrigin(matches), "/"),
        publisher: {
          "@type": "EducationalOrganization",
          name: SITE_NAME,
          address: {
            "@type": "PostalAddress",
            addressLocality: "Galle",
            addressCountry: "LK",
          },
        },
      },
    }),
});
