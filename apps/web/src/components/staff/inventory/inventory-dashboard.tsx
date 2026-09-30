import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { StatTile } from "@/components/admin/admin-dashboard";
import type { Figure } from "@/components/admin/dashboard-figure";
import {
  FOCUS_RING,
  OUTLINE_LINK,
  plural,
  showFigure,
} from "@/components/admin/dashboard-figure";
import { PageHeader } from "@/components/ui-patterns/page-header";
import { orpc } from "@/utils/orpc";

/**
 * The Inventory Administrator's overview: the store as a storekeeper reads it.
 *
 * ## What this page is for, and why it is not the admin dashboard again
 *
 * The administrator's overview answers *academic* questions — are classes
 * staffed, whose leave is waiting — and every widget on it runs on a procedure
 * this seat does not hold. This one answers the questions this seat is the only
 * person who can answer: what is out, what is late, what is waiting for a
 * decision, and what has been handed to somebody who has not yet acknowledged
 * it. So the figures are the store's own (items, units, loans, low stock,
 * write-offs, issues, notices) and the links point at the register's panes.
 *
 * **Every count is a server total, and each is asked for with the smallest
 * request the API allows** — `limit: 1` where the procedure returns a separate
 * `total`, so the register's own paginated pages are not refetched to count them.
 * The alternative, deriving each figure from a 200-row page, is the mistake
 * `inventory-page.tsx` documents at length: a sum over the loaded page is a
 * different kind of number from a total, and a card that cannot tell the
 * difference is a card that lies.
 *
 * ## The six reads, and why there is no seventh
 *
 * `items.list` twice over (the register, and the low-stock slice of it),
 * `borrows.list` twice (open, and the overdue subset of it), `disposals.list`
 * for the write-off queue, `issues.list` for what went out to staff and
 * students, and `custody.notices.list` for the acknowledgements. There is no
 * seventh read for `ledger.transactions` even though this seat may read it: the
 * ledger is a place a storekeeper goes *to*, not a figure they watch, and a
 * "recent activity" count would be the one tile on this page whose number nobody
 * would ever act on. The register's own recents panel is the answer, and it is
 * one click away.
 *
 * `custody.requests.listIncoming` is deliberately absent too. Its results feed no
 * figure and no link on this page, and a request queue that belongs to the person
 * who asked for the handover is read on the item, not on a dashboard.
 */
type InventoryPath =
  | "/inventory-admin/$year/staff/inventory"
  | "/inventory-admin/$year/staff/inventory/loans"
  | "/inventory-admin/$year/staff/inventory/issues"
  | "/inventory-admin/$year/staff/inventory/write-offs"
  | "/inventory-admin/$year/staff/inventory/asset-register"
  | "/inventory-admin/$year/staff/inventory/ledger";

/** The store's six panes, in the order a storekeeper works through them. */
const quickActions: { label: string; to: InventoryPath }[] = [
  { label: "Item register", to: "/inventory-admin/$year/staff/inventory" },
  { label: "Loans", to: "/inventory-admin/$year/staff/inventory/loans" },
  { label: "Issues", to: "/inventory-admin/$year/staff/inventory/issues" },
  {
    label: "Write-offs",
    to: "/inventory-admin/$year/staff/inventory/write-offs",
  },
  {
    label: "Asset register",
    to: "/inventory-admin/$year/staff/inventory/asset-register",
  },
  { label: "Ledger", to: "/inventory-admin/$year/staff/inventory/ledger" },
];

/**
 * The first day of the current month, as `YYYY-MM-DD` — the lower bound the
 * issue list wants, and the only date this page computes.
 *
 * Built in UTC rather than local time for the reason the store's own pages are:
 * the column is a `date` and the input is a bare ISO date, so a bound computed
 * in a machine's local zone would shift "this month" by a day for half the world
 * and quietly change what the tile counts. The server's `todayIsoDate` is not
 * reachable from here, and one round trip to learn today's date is not worth a
 * tile.
 */
const monthStartIsoDate = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
};

const useInventoryDashboardData = () => {
  /**
   * `limit: 1` on every list that returns a `total` beside its rows.
   *
   * This is the whole reason this page is cheap: the figures are server totals,
   * so one row is enough to read the count off. It also means the dashboard and
   * the register never share a cache entry for the rows themselves — which is
   * correct, because the register's own filters produce different rows and a
   * shared key would make one of the two lie.
   */
  const itemsQuery = useQuery(
    orpc.inventory.items.list.queryOptions({ input: { limit: 1 } })
  );
  const lowStockQuery = useQuery(
    orpc.inventory.items.list.queryOptions({
      input: { limit: 1, lowStockOnly: true },
    })
  );
  const openBorrowsQuery = useQuery(
    orpc.inventory.borrows.list.queryOptions({
      input: { limit: 1, status: "borrowed" },
    })
  );
  const overdueQuery = useQuery(
    orpc.inventory.borrows.list.queryOptions({
      input: { limit: 1, overdueOnly: true },
    })
  );
  const disposalsQuery = useQuery(
    orpc.inventory.disposals.list.queryOptions({ input: { limit: 1 } })
  );
  const issuesQuery = useQuery(
    orpc.inventory.issues.list.queryOptions({
      input: { from: monthStartIsoDate(), limit: 1 },
    })
  );
  const noticesQuery = useQuery(
    orpc.inventory.custody.notices.list.queryOptions()
  );

  /**
   * The write-off queue's own number, and why it is not `total`.
   *
   * `listDisposals` returns both a matched `total` and a `summary` broken down by
   * status, and the figure a storekeeper acts on is the one waiting for a
   * decision — the rest are history. Using `total` here would put a figure
   * labelled "awaiting approval" beside a number that includes every cancelled
   * request the school has ever filed.
   */
  const pendingApprovals = disposalsQuery.data?.summary.pendingApproval;

  return {
    items: {
      value: itemsQuery.data?.total,
      isError: itemsQuery.isError,
    } satisfies Figure,
    lowStock: {
      value: lowStockQuery.data?.total,
      isError: lowStockQuery.isError,
    } satisfies Figure,
    outOnLoan: {
      value: openBorrowsQuery.data?.total,
      isError: openBorrowsQuery.isError,
    } satisfies Figure,
    overdue: {
      value: overdueQuery.data?.total,
      isError: overdueQuery.isError,
    } satisfies Figure,
    pendingApprovals: {
      value: pendingApprovals,
      isError: disposalsQuery.isError,
    } satisfies Figure,
    issuedThisMonth: {
      value: issuesQuery.data?.total,
      isError: issuesQuery.isError,
    } satisfies Figure,
    unacknowledgedNotices: {
      value: noticesQuery.data?.notices.length,
      isError: noticesQuery.isError,
    } satisfies Figure,
    /**
     * Whether every read came back, which is what the empty state below turns
     * on. A dashboard that says "nothing needs attention" while four of its six
     * reads failed is a dashboard that reports good news it did not look for, so
     * this is tracked separately from each tile's own `isError`.
     */
    allLoaded:
      itemsQuery.isSuccess &&
      lowStockQuery.isSuccess &&
      openBorrowsQuery.isSuccess &&
      overdueQuery.isSuccess &&
      disposalsQuery.isSuccess &&
      issuesQuery.isSuccess &&
      noticesQuery.isSuccess,
    /** The notices themselves, for naming the ones that are waiting. */
    notices: noticesQuery.data?.notices ?? [],
  };
};

/** How many notices the card names by hand, and why not all of them. */
const NOTICES_LISTED = 4;

type InventoryDashboardData = ReturnType<typeof useInventoryDashboardData>;

interface AttentionEntry {
  title: string;
  detail: string;
  action: string;
  to: InventoryPath;
}

/**
 * What is waiting, in the order a storekeeper would deal with it: an overdue loan
 * before a write-off, because a late projector is a problem with a person in it
 * and a write-off is a piece of paper.
 *
 * Each entry states only what the records show. There is no entry for "the store
 * looks untidy" or any other judgement the six reads cannot support — a dashboard
 * that invents a worry is a dashboard people learn to dismiss.
 */
const buildAttention = (data: InventoryDashboardData): AttentionEntry[] => {
  const entries: AttentionEntry[] = [];
  const overdue = data.overdue.value ?? 0;
  const approvals = data.pendingApprovals.value ?? 0;
  const notices = data.unacknowledgedNotices.value ?? 0;
  const items = data.items.value ?? 0;

  if (items === 0) {
    entries.push({
      title: "The register is empty",
      detail:
        "Nothing has been registered yet. The first item needs a person in charge and a person holding it.",
      action: "Register an item",
      to: "/inventory-admin/$year/staff/inventory",
    });
  }

  if (overdue > 0) {
    entries.push({
      title: `${overdue} ${plural(overdue, "loan is", "loans are")} past the due date`,
      detail:
        "Equipment that is late is the one figure here that grows on its own. Take the return through the loan record, so the date and the signature are kept.",
      action: "Open loans",
      to: "/inventory-admin/$year/staff/inventory/loans",
    });
  }

  if (approvals > 0) {
    entries.push({
      title: `${approvals} ${plural(approvals, "write-off awaits", "write-offs await")} approval`,
      detail:
        "A request to remove or dispose of an item. Approving it records the decision; it does not take the item off the register.",
      action: "Review write-offs",
      to: "/inventory-admin/$year/staff/inventory/write-offs",
    });
  }

  if (notices > 0) {
    entries.push({
      title: `${notices} custody ${plural(notices, "change is", "changes are")} unacknowledged`,
      detail:
        "You were on the chain for these handovers and have not said you saw them. Acknowledging records that you have; it does not reverse the change.",
      action: "Read the notices",
      to: "/inventory-admin/$year/staff/inventory",
    });
  }

  if ((data.lowStock.value ?? 0) > 0) {
    entries.push({
      title: `${data.lowStock.value} ${plural(data.lowStock.value ?? 0, "item is", "items are")} at or below the reorder level`,
      detail: "Nothing is on fire about these, but they run out quietly.",
      action: "Open the register",
      to: "/inventory-admin/$year/staff/inventory",
    });
  }

  return entries;
};

/**
 * The left-hand card: this seat's one private queue.
 *
 * The administrator's dashboard puts homeroom coverage here because that is the
 * academic desk's standing worry. The store's equivalent is **acknowledgement** —
 * `inventoryCustodyNoticeRecipient` rows this person was on the chain for and
 * have not answered. It is the only figure on this page nobody else can clear: an
 * administrator cannot acknowledge on this seat's behalf, and a dispute is per
 * person by design.
 *
 * **There is no progress ring, and that is a finding rather than an omission.**
 * The administrator's card draws one because its query returns classes with and
 * without a homeroom teacher — both halves of the ratio are in the response.
 * `custody.notices.list` returns *unacknowledged only*, by design: a queue that
 * showed answered notices would be a queue whose length is not a queue length. So
 * the denominator does not exist, and a ring would have to invent it — either by
 * counting the four rows printed below, or by saying 100% answered because the
 * list is empty, both of which are worse than a count. This card prints the count
 * the API can prove and names the next few by hand.
 */
const NoticesCard = ({
  data,
  year,
}: {
  data: InventoryDashboardData;
  year: string;
}) => {
  const { notices } = data;

  return (
    <section
      aria-labelledby="notices-heading"
      className="bg-card border-border border p-6"
    >
      <h2 id="notices-heading" className="text-gold-text type-eyebrow m-0">
        Custody notices
      </h2>
      <div className="text-foreground type-stat mt-2.5">
        {showFigure(data.unacknowledgedNotices)}
      </div>
      <p className="text-muted-foreground m-0 mt-1.5 text-sm">
        {data.unacknowledgedNotices.isError
          ? "Could not be loaded. Refresh to try again."
          : "handovers on your chain that you have not acknowledged"}
      </p>
      <ul className="mt-4.5 flex list-none flex-col p-0">
        {notices.length === 0 ? (
          <li className="text-muted-foreground border-border border-t py-2.5 text-sm">
            {data.allLoaded
              ? "Nothing is waiting for you."
              : "Checking the handover chain…"}
          </li>
        ) : (
          notices.slice(0, NOTICES_LISTED).map((notice) => (
            <li
              key={notice.id}
              className="border-border border-t py-2.5 text-sm"
            >
              <span className="text-foreground block font-semibold">
                {notice.itemName}
              </span>
              <span className="text-muted-foreground block">
                {notice.changeTypeLabel}
                {notice.note ? ` — ${notice.note}` : ""}
              </span>
            </li>
          ))
        )}
      </ul>
      {notices.length > NOTICES_LISTED ? (
        <p className="text-muted-foreground mt-3.5 mb-0 text-sm">
          and {notices.length - NOTICES_LISTED} more. The register lists every
          one with the item it names.
        </p>
      ) : null}
      {notices.length > 0 ? (
        <Link
          to="/inventory-admin/$year/staff/inventory"
          params={{ year }}
          className={`${OUTLINE_LINK} mt-4.5 inline-block px-3.75 py-2 text-sm`}
        >
          Read them on the register
        </Link>
      ) : null}
    </section>
  );
};

const AttentionList = ({
  data,
  year,
}: {
  data: InventoryDashboardData;
  year: string;
}) => {
  const entries = buildAttention(data);

  return (
    <section
      aria-labelledby="attention-heading"
      className="bg-card border-border border px-5.5 py-5"
    >
      <h2
        id="attention-heading"
        className="text-foreground type-section-title m-0 mb-1.5"
      >
        Needs attention
      </h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground m-0 py-3.5 text-sm">
          {data.allLoaded
            ? "Nothing needs attention right now."
            : "Reading the store records…"}
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {entries.map((entry) => (
            <li
              key={entry.title}
              className="border-border flex flex-wrap items-center gap-3.5 border-b py-3.5 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="bg-destructive size-2 flex-none rotate-45"
              />
              <span className="min-w-0 flex-1">
                <span className="text-foreground type-body block font-semibold">
                  {entry.title}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-sm">
                  {entry.detail}
                </span>
              </span>
              <Link
                to={entry.to}
                params={{ year }}
                className={`${OUTLINE_LINK} px-3.75 py-2 text-sm whitespace-nowrap`}
              >
                {entry.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

interface InventoryDashboardProps {
  /** The `$year` path segment, as the route received it. */
  year: string;
  /** The session the authed shell already resolved. */
  session: { user?: { name?: string | null } } | null;
}

export const InventoryDashboard = ({
  year,
  session,
}: InventoryDashboardProps) => {
  const data = useInventoryDashboardData();
  const items = data.items.value;
  const lowStockDetail =
    items === undefined
      ? "Distinct lines in the register"
      : `${items === 1 ? "the one line in" : `${items} lines in`} the store`;

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow={<>Store dashboard &middot; {year}</>}
        title={`Welcome back, ${session?.user?.name ?? "there"}`}
        description={`The state of school property in ${year}, read from the register's own totals each time this page loads.`}
        actions={
          <>
            <Link
              to="/inventory-admin/$year/staff/inventory/ledger"
              params={{ year }}
              className={`${OUTLINE_LINK} px-4.5 py-2.5 text-sm`}
            >
              Ledger
            </Link>
            <Link
              to="/inventory-admin/$year/staff/inventory"
              params={{ year }}
              className={`bg-primary text-primary-foreground hover:bg-primary-hover px-5 py-2.5 text-sm font-semibold transition-colors ${FOCUS_RING}`}
            >
              Open the register
            </Link>
          </>
        }
      />

      <div className="grid items-start gap-4.5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <NoticesCard data={data} year={year} />

        <div className="flex min-w-0 flex-col gap-4.5">
          <section aria-label="Key figures">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
              <StatTile
                label="Items"
                figure={data.items}
                detail={lowStockDetail}
              />
              <StatTile
                label="Out on loan"
                figure={data.outOnLoan}
                detail="Units away with a borrower right now"
              />
              <StatTile
                label="Overdue"
                figure={data.overdue}
                detail="Past the date they were due back"
              />
              <StatTile
                label="Low stock"
                figure={data.lowStock}
                detail="At or below the reorder threshold"
              />
              <StatTile
                label="Awaiting approval"
                figure={data.pendingApprovals}
                detail="Write-off requests not yet decided"
              />
              <StatTile
                label="Issued this month"
                figure={data.issuedThisMonth}
                detail="Handed to staff or students since the 1st"
              />
            </div>
          </section>

          <AttentionList data={data} year={year} />

          <nav
            aria-labelledby="quick-actions-heading"
            className="bg-card border-border border px-5.5 py-5"
          >
            <h2
              id="quick-actions-heading"
              className="text-foreground type-section-title m-0 mb-3.5"
            >
              Quick actions
            </h2>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5 p-0">
              {quickActions.map((action) => (
                <li key={action.to}>
                  <Link
                    to={action.to}
                    params={{ year }}
                    className={`${OUTLINE_LINK} block h-full px-3.5 py-3 text-left text-sm`}
                  >
                    {action.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
};
