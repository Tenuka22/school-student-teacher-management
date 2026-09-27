import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/ui-patterns/page-header";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

const SHORTCUTS = [
  {
    title: "Recommend leave",
    detail: "Review pending requests and pass them to the Principal",
    to: "/deputy-principal/$year/leaves",
    action: "Open queue",
  },
  {
    title: "Awaiting the Principal",
    detail: "Requests you have already recommended and handed over",
    to: "/deputy-principal/$year/leaves",
    action: "View handed over",
  },
] as const;

const DeputyPrincipalHome = () => {
  const { year } = Route.useParams();

  // The Deputy acts first: requests still sitting at `pending` need a
  // recommendation before the Principal can finalise them.
  const awaitingRecommendation = useQuery(
    orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { queue: "deputy" },
    })
  );

  const pendingCount = awaitingRecommendation.data?.requests.length ?? 0;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        eyebrow="Leadership"
        title="Deputy Principal's workspace"
        description={
          <>
            You are the first reviewer on the leave chain. Your recommendation
            passes each request to the Principal for a final decision.
          </>
        }
        actions={
          <Link
            to="/deputy-principal/$year/leaves"
            params={{ year }}
            className="bg-primary text-primary-foreground hover:bg-primary-hover px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            Recommend leave
          </Link>
        }
      />

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(300px,360px)_minmax(360px,1fr)]">
        <div className="border-primary border-border bg-card border-t-2 px-[22px] py-5">
          <h2 className="text-muted-foreground type-eyebrow m-0">
            Awaiting your recommendation
          </h2>
          <div className="text-foreground mt-3 text-[3.25rem] leading-none font-bold tracking-[-0.03em] tabular-nums">
            {awaitingRecommendation.isPending ? "—" : pendingCount}
          </div>
          <div className="text-muted-foreground mt-2.5 text-sm">
            {pendingCount === 1
              ? "1 request has not been reviewed yet."
              : `${pendingCount} requests have not been reviewed yet.`}
          </div>
        </div>

        <div className="border-border bg-card border px-[22px] py-5">
          <h2 className="text-foreground type-section-title m-0 mb-2">
            Shortcuts
          </h2>
          <div className="flex flex-col">
            {SHORTCUTS.map((item) => (
              <div
                key={item.title}
                className="border-border flex flex-wrap items-center gap-3.5 border-b py-3.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-foreground type-body block font-semibold">
                    {item.title}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-sm">
                    {item.detail}
                  </span>
                </span>
                <Link
                  to={item.to}
                  params={{ year }}
                  className="border-input text-foreground hover:border-primary hover:bg-muted border px-[15px] py-2 text-sm font-semibold whitespace-nowrap transition-colors"
                >
                  {item.action}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        Leave authority is resolved from your current-year position row, not
        from your login role.
      </p>
    </div>
  );
};

export const Route = createFileRoute("/_auth/deputy-principal/$year/")({
  component: DeputyPrincipalHome,
  head: () => pageHead("Deputy Principal's desk"),
});
