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
      input: { queue: "principal" },
    })
  );

  const pendingCount = awaitingFinalisation.data?.requests.length ?? 0;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-heading m-0 text-[38px] leading-[1.05] font-semibold text-[#013405]">
            Principal&rsquo;s workspace
          </h1>
          <p className="mt-1.5 text-[13.5px] text-[#013405]/65">
            You are the final authority on every leave request. Recommendations
            from the Deputy Principal wait here for your decision.
          </p>
        </div>
        <Link
          to="/principal/$year/leaves"
          params={{ year }}
          className="bg-[#013405] px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] text-[#FFF8E7] transition-colors hover:bg-[#064A12]"
        >
          REVIEW LEAVE QUEUE
        </Link>
      </div>

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(300px,360px)_minmax(360px,1fr)]">
        <div className="border-t-2 border-[#013405] border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
          <div className="text-xs font-extrabold tracking-[0.2em] text-[#013405]/55">
            AWAITING YOUR DECISION
          </div>
          <div className="font-heading mt-3 text-[52px] leading-none font-semibold text-[#013405]">
            {awaitingFinalisation.isPending ? "—" : pendingCount}
          </div>
          <div className="mt-2 text-xs leading-relaxed text-[#013405]/60">
            {pendingCount === 1
              ? "1 request recommended by the Deputy Principal."
              : `${pendingCount} requests recommended by the Deputy Principal.`}
          </div>
        </div>

        <div className="border border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
          <div className="font-heading mb-3.5 text-[23px] font-semibold text-[#013405]">
            Shortcuts
          </div>
          <div className="flex flex-col">
            {SHORTCUTS.map((item) => (
              <div
                key={item.title}
                className="flex flex-wrap items-center gap-3.5 border-b border-[#013405]/10 py-3.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold text-[#013405]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#013405]/55">
                    {item.detail}
                  </span>
                </span>
                <Link
                  to={item.to}
                  params={{ year }}
                  className="border border-[#013405]/25 px-[15px] py-2 text-xs font-bold whitespace-nowrap text-[#013405] transition-colors hover:border-[#013405] hover:bg-[#F3F1E9]"
                >
                  {item.action}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-[#013405]/50">
        Leave authority is resolved from your current-year position row, not
        from your login role.
      </p>
    </div>
  );
};

export const Route = createFileRoute("/_auth/principal/$year/")({
  component: PrincipalHome,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.leaves.getMyAuthority.queryOptions()
    );
  },
});
