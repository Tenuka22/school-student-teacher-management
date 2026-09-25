import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

const SHORTCUTS = [
  {
    title: "Finalise leave",
    detail: "Decide the requests recommended by the Deputy Principal",
    to: "/principal/$year/leaves",
    action: "Open queue",
  },
  {
    title: "Recommendations",
    detail: "See what the Deputy Principal has already reviewed",
    to: "/principal/$year/leaves",
    action: "View history",
  },
] as const;

const PrincipalHome = () => {
  const { year } = Route.useParams();

  // The Principal acts last: everything the Deputy recommended and nobody
  // has finalised yet.
  const awaitingFinalisation = useQuery(
    orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { year: Number(year), queue: "principal" },
    })
  );

  const pendingCount = awaitingFinalisation.data?.requests.length ?? 0;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
            Principal&rsquo;s workspace
          </h1>
          <p className="text-primary/65 mt-1.5 text-[13.5px]">
            You are the final authority on every leave request. Recommendations
            from the Deputy Principal wait here for your decision.
          </p>
        </div>
        <Link
          to="/principal/$year/leaves"
          params={{ year }}
          className="bg-primary text-primary-foreground hover:bg-primary-hover px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
        >
          REVIEW LEAVE QUEUE
        </Link>
      </div>

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(300px,360px)_minmax(360px,1fr)]">
        <div className="border-primary border-primary/14 bg-card border-t-2 px-[22px] py-5">
          <div className="text-primary/55 text-xs font-extrabold tracking-[0.2em]">
            AWAITING YOUR DECISION
          </div>
          <div className="font-heading text-primary mt-3 text-[52px] leading-none font-semibold">
            {awaitingFinalisation.isPending ? "—" : pendingCount}
          </div>
          <div className="text-primary/60 mt-2 text-xs leading-relaxed">
            {pendingCount === 1
              ? "1 request recommended by the Deputy Principal."
              : `${pendingCount} requests recommended by the Deputy Principal.`}
          </div>
        </div>

        <div className="border-primary/14 bg-card border px-[22px] py-5">
          <div className="font-heading text-primary mb-3.5 text-[23px] font-semibold">
            Shortcuts
          </div>
          <div className="flex flex-col">
            {SHORTCUTS.map((item) => (
              <div
                key={item.title}
                className="border-primary/10 flex flex-wrap items-center gap-3.5 border-b py-3.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-primary block text-[13.5px] font-bold">
                    {item.title}
                  </span>
                  <span className="text-primary/55 mt-0.5 block text-xs">
                    {item.detail}
                  </span>
                </span>
                <Link
                  to={item.to}
                  params={{ year }}
                  className="border-primary/25 text-primary hover:border-primary hover:bg-muted border px-[15px] py-2 text-xs font-bold whitespace-nowrap transition-colors"
                >
                  {item.action}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-primary/50 text-xs">
        Leave authority is resolved from your selected-year position row; seeded
        institutional leadership remains globally authorised.
      </p>
    </div>
  );
};

export const Route = createFileRoute("/_auth/principal/$year/")({
  component: PrincipalHome,
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.leaves.getMyAuthority.queryOptions({
        input: { year: Number(params.year) },
      })
    );
  },
});
