import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { ErrorPanel } from "@/components/admin/admin-overview-panels";
import { formatApiErrorMessage } from "@/lib/api-error";
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

/**
 * The sentence under the figure. Written as one function so the failed case
 * cannot be reached by accident through a count of 0.
 */
const awaitingRecommendationCaption = (
  count: number,
  isFailed: boolean
): string => {
  if (isFailed) {
    return "This figure could not be read — the leave queue was not loaded.";
  }
  if (count === 1) {
    return "1 request has not been reviewed yet.";
  }
  return `${count} requests have not been reviewed yet.`;
};

const DeputyPrincipalHome = () => {
  const { year } = Route.useParams();

  // The Deputy acts first: requests still sitting at `pending` need a
  // recommendation before the Principal can finalise them.
  const awaitingRecommendation = useQuery(
    orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { year: Number(year), queue: "deputy" },
    })
  );

  const pendingCount = awaitingRecommendation.data?.requests.length ?? 0;

  /**
   * "0 requests have not been reviewed yet" is a statement about the Deputy's
   * desk, and the old `?? 0` produced it for every reason the request could
   * come back empty — including a 500. The figure is now printed only from a
   * response that arrived; a failure shows a dash and the error panel below,
   * which says so and retries.
   */
  const isCountFailed = awaitingRecommendation.isError;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
            Deputy Principal&rsquo;s workspace
          </h1>
          <p className="text-primary/65 mt-1.5 text-[13.5px]">
            You are the first reviewer on the leave chain. Your recommendation
            passes each request to the Principal for a final decision.
          </p>
        </div>
        <Link
          to="/deputy-principal/$year/leaves"
          params={{ year }}
          className="bg-primary text-primary-foreground hover:bg-primary-hover px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
        >
          RECOMMEND LEAVE
        </Link>
      </div>

      {isCountFailed && (
        <ErrorPanel
          message={formatApiErrorMessage(
            awaitingRecommendation.error,
            "The server did not return the leave queue."
          )}
          onRetry={() => {
            void awaitingRecommendation.refetch();
          }}
          title="The leave queue could not be loaded"
        />
      )}

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(300px,360px)_minmax(360px,1fr)]">
        <div className="border-primary border-primary/14 bg-card border-t-2 px-[22px] py-5">
          <div className="text-primary/55 text-xs font-extrabold tracking-[0.2em]">
            AWAITING YOUR RECOMMENDATION
          </div>
          <div className="font-heading text-primary mt-3 text-[52px] leading-none font-semibold">
            {awaitingRecommendation.isPending || isCountFailed
              ? "—"
              : pendingCount}
          </div>
          <div className="text-primary/60 mt-2 text-xs leading-relaxed">
            {awaitingRecommendationCaption(pendingCount, isCountFailed)}
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

export const Route = createFileRoute("/_auth/deputy-principal/$year/")({
  component: DeputyPrincipalHome,
});
