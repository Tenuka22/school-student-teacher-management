import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { functionalUpdate } from "@tanstack/react-table";
import type {
  OnChangeFn,
  PaginationState,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

import type { BanTarget } from "./ban-user-dialog";
import {
  DEFAULT_SORT,
  hasUsersFilters,
  toListAccountsInput,
  toPagination,
  toSorting,
  toUsersSearchParams,
  USERS_SORT_KEYS,
  validateUsersSearch,
} from "./users-search";
import type { UsersSearch } from "./users-search";
import type { AccountRow, RoleFilter, StatusFilter } from "./users-types";
import { ANY_FILTER } from "./users-types";

/** Which ban dialog is open: none, ban, or unban. */
export type BanDialogState = { target: BanTarget; banned: boolean } | null;

const isSortableKey = (
  value: string
): value is (typeof USERS_SORT_KEYS)[number] =>
  USERS_SORT_KEYS.some((key) => key === value);

/**
 * Data, the URL's list state, and the mutations for the users page.
 *
 * Kept out of the component so the markup reads as markup: a query, a mutation
 * per write, and the reads and writes for seven search params in one render
 * function is how a table turns into a maze, and the cognitive-complexity budget
 * is better spent on what the page shows.
 *
 * ## The list state is the URL, and the table is told about it
 *
 * `search` is the route's validated search params, handed in by the route rather
 * than read here: this hook deliberately does not import the route file, because
 * the route imports the page and the page imports this, and a cycle that resolves
 * a component at module-eval time is a class of bug this page has no need of.
 *
 * The table then receives sorting and pagination **as props** and reports changes
 * through callbacks that write the URL. That is the only arrangement in which all
 * three of these are true at once, and each of them rules out the alternatives:
 *
 * - the server has been told (the route's `loader` turns these params into the
 *   `listAccounts` input and fetches before the page is sent);
 * - the table cannot drift from the data (with `manualSorting` and
 *   `manualPagination`, a sorting state the table owned would reorder nothing —
 *   the rows arrive in the order the query asked for);
 * - the list survives a refresh, a shared link and the Back button.
 *
 * Column visibility is the one piece of table state that stays in the table,
 * because it is a property of the screen rather than of the College, and the row
 * selection stays here for the same reason: a ticked row is a thing you are about
 * to do, not a question about the College.
 *
 * Roles are deliberately read-only here. A role promotes someone into a
 * workspace, but the checks that belong with that — a verified address, a staff
 * record, a category, an employment status — are the approval service's job
 * (`teacher-requests.ts`), and leadership review authority comes from a
 * `staff_position` row rather than from this table.
 */
export const useAdminUsers = (search: UsersSearch) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banDialog, setBanDialog] = useState<BanDialogState>(null);
  const [bulkDialog, setBulkDialog] = useState<{
    accounts: AccountRow[];
    banned: boolean;
  } | null>(null);
  const [isPurgeOpen, setIsPurgeOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  /**
   * The one place the URL is written.
   *
   * A functional `search` update, so the params this page does not own survive:
   * a literal object would drop the rest of the query string, and the year or a
   * sibling page's tab would disappear because somebody typed in a search box.
   * The previous value is re-parsed rather than trusted, so a patch written on top
   * of a hand-edited URL produces a valid one.
   *
   * `replace` is the default and paging is the exception, because the two have
   * opposite histories: a search term is committed on a timer as somebody types
   * and must not leave one Back step per letter, while a page is a place somebody
   * was at and expects Back to return them to.
   */
  const writeSearch = useCallback(
    (patch: Partial<UsersSearch>, options?: { replace?: boolean }) => {
      void navigate({
        search: ((previous: Record<string, unknown>) =>
          toUsersSearchParams({
            ...validateUsersSearch(previous),
            ...patch,
          })) as never,
        replace: options?.replace ?? true,
      });
    },
    [navigate]
  );

  /**
   * The list state, in the shape TanStack Table speaks.
   *
   * Derived rather than stored, so there is exactly one copy of it: the URL. A
   * `SortingState` of `[{ id: "createdAt", desc: false }]` and a `?sort=createdAt`
   * that disagree would be two answers to one question, and only one of them would
   * reach the server. The callbacks above read the same two helpers from the
   * URL's own fields, so none of them depends on an object rebuilt every render.
   */
  const sorting = toSorting(search);
  const pagination = toPagination(search);

  /**
   * Every change to *what is listed* returns to the first page, and drops the
   * selection.
   *
   * Changing the search, a filter or the order makes the current page
   * meaningless — page 6 of a search that now matches four accounts is an empty
   * table, which reads as "no accounts match" and is a statement about the
   * College. The selection goes for the same reason: a selection is a set of
   * *rows on the page in front of you*, and those rows are about to be replaced.
   * Paging changes neither, because there the page is the thing being changed on
   * purpose. `page: 1` is the default, so it leaves the URL rather than being
   * written as `?page=1`.
   */
  const onSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      const [column] = functionalUpdate(updater, toSorting(search));

      writeSearch({
        sort: column && isSortableKey(column.id) ? column.id : DEFAULT_SORT,
        dir: column?.desc ? "desc" : "asc",
        page: 1,
      });
      setRowSelection({});
    },
    // `search` as a whole, because it is the router's own object and the router
    // keeps it referentially stable between renders; the callbacks are therefore
    // rebuilt exactly when the list actually changed.
    [search, writeSearch]
  );

  const onPaginationChange = useCallback<OnChangeFn<PaginationState>>(
    (updater) => {
      const next = functionalUpdate(updater, toPagination(search));

      writeSearch(
        { page: next.pageIndex + 1, size: next.pageSize },
        { replace: false }
      );
      setRowSelection({});
    },
    [search, writeSearch]
  );

  const onRowSelectionChange = useCallback<OnChangeFn<RowSelectionState>>(
    (updater) => {
      setRowSelection(updater);
    },
    [setRowSelection]
  );

  const onSearchChange = useCallback(
    (value: string) => writeSearch({ q: value, page: 1 }),
    [writeSearch]
  );

  const onRoleChange = useCallback(
    (value: RoleFilter) => {
      writeSearch({ role: value, page: 1 });
      setRowSelection({});
    },
    [writeSearch]
  );

  const onStatusChange = useCallback(
    (value: StatusFilter) => {
      writeSearch({ status: value, page: 1 });
      setRowSelection({});
    },
    [writeSearch]
  );

  const onResetFilters = useCallback(() => {
    writeSearch({
      q: "",
      role: ANY_FILTER,
      status: ANY_FILTER,
      page: 1,
    });
    setRowSelection({});
  }, [writeSearch]);

  const accountsQuery = useQuery(
    orpc.staff.listAccounts.queryOptions({
      input: toListAccountsInput(search),
      /*
       * The previous page stays on screen while the next one is fetched. Without
       * it, a page change empties the table for the length of a round trip, and
       * "no accounts" is what an administrator reads in that gap.
       */
      placeholderData: keepPreviousData,
    })
  );

  const invalidate = async () => {
    // A *partial* key, not one built from the input: a ban has to refresh the
    // page it was made from and every other page and filter combination in the
    // cache, and a full key would refresh only the one request that happened to
    // be in front of the administrator. It also refreshes the route's `loader`,
    // which reads the same cache entry — so a ban made on a shared link leaves
    // that link showing the new truth rather than the old one.
    await queryClient.invalidateQueries({
      queryKey: orpc.staff.listAccounts.key({ type: "query" }),
    });
  };

  const accounts = accountsQuery.data?.accounts;
  const total = accountsQuery.data?.total ?? 0;

  /**
   * One account, one ban, one typed reason.
   *
   * This stays on the admin plugin rather than moving to oRPC with the read,
   * because that is where the rule about the seeded institutional logins lives:
   * the `databaseHooks` in `packages/auth` refuse a ban on them server-side, and
   * the visible half of that rule is the disabled menu item in the row. Moving
   * the write would mean re-implementing the refusal here to keep it.
   */
  const banMutation = useMutation({
    mutationFn: async ({
      userId,
      banned,
      reason,
    }: {
      userId: string;
      banned: boolean;
      reason: string;
    }) => {
      const { error } = banned
        ? await authClient.admin.banUser({ userId, banReason: reason })
        : await authClient.admin.unbanUser({ userId });
      if (error) {
        throw new Error(error.message ?? "Failed to update user");
      }
    },
    onSuccess: async (_, variables) => {
      await invalidate();
      setBanDialog(null);
      toast.success(variables.banned ? "Account banned" : "Account unbanned");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /**
   * Signs an account out everywhere, without touching the account itself.
   *
   * The other thing an administrator reaches for when something is wrong with an
   * account and the answer is not to close it: a phone left signed in, a shared
   * browser, a session that outlived the person who should have ended it. It
   * changes nothing on the `user` row, so the list does not need invalidating —
   * which is also why it is not a ban and does not ask for a reason.
   */
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation -- revoking sessions changes no column this table shows: it deletes `session` rows and leaves `user` exactly as it was, and the table does not render sessions
  const revokeSessionsMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { error } = await authClient.admin.revokeUserSessions({ userId });
      if (error) {
        throw new Error(error.message ?? "Failed to sign the account out");
      }
    },
    onSuccess: () =>
      toast.success(
        "Signed out on every device — they sign in again themselves"
      ),
    onError: (error: Error) => toast.error(error.message),
  });

  /**
   * Many accounts, one decision, one reason.
   *
   * Better Auth has no bulk endpoint, so this is N calls — issued together rather
   * than in a loop, so fifty accounts take one round trip's latency instead of
   * fifty. The outcome is checked per account rather than assumed: a call that
   * comes back with an error is a name in the failure list, and the toast says
   * how many did not take. The list is invalidated either way, because a
   * partial success is still a change to the table.
   */
  const bulkBanMutation = useMutation({
    mutationFn: async ({
      accounts: targets,
      banned,
      reason,
    }: {
      accounts: AccountRow[];
      banned: boolean;
      reason: string;
    }) => {
      const outcomes = await Promise.all(
        targets.map(async (account) => {
          const { error } = banned
            ? await authClient.admin.banUser({
                userId: account.id,
                banReason: reason,
              })
            : await authClient.admin.unbanUser({ userId: account.id });

          return error ? account.name : null;
        })
      );
      const failures = outcomes.filter((name): name is string => name !== null);

      if (failures.length > 0) {
        throw new Error(
          `${failures.length} of ${targets.length} accounts could not be ${banned ? "banned" : "unbanned"}: ${failures.join(", ")}`
        );
      }

      return targets.length;
    },
    onSuccess: async (count, variables) => {
      await invalidate();
      setBulkDialog(null);
      setRowSelection({});
      toast.success(
        `${count} account${count === 1 ? "" : "s"} ${variables.banned ? "banned" : "unbanned"}`
      );
    },
    onError: async (error: Error) => {
      await invalidate();
      toast.error(error.message);
    },
  });

  const purgePreviewQuery = useQuery(
    orpc.staff.previewUnverifiedPurge.queryOptions()
  );

  /**
   * Re-read the purge preview at the moment of the decision, so the count in
   * the dialog describes the accounts about to be deleted rather than whatever
   * was true when the page loaded.
   */
  const openPurgeDialog = () => {
    setIsPurgeOpen(true);
    void purgePreviewQuery.refetch();
  };

  const purgeMutation = useMutation(
    orpc.staff.purgeUnverified.mutationOptions({
      onSuccess: async (result) => {
        await Promise.all([invalidate(), purgePreviewQuery.refetch()]);
        setIsPurgeOpen(false);
        toast.success(
          `Removed ${result.removed} unverified account${result.removed === 1 ? "" : "s"}`
        );
      },
      onError: (error: Error) => {
        toast.error(error.message);
      },
    })
  );

  return {
    accounts,
    total,
    pagination,
    sorting,
    rowSelection,
    /** The committed search term, which is `?q=` and not what is in the box. */
    search: search.q,
    role: search.role,
    status: search.status,
    hasFilters: hasUsersFilters(search),
    onSortingChange,
    onPaginationChange,
    onRowSelectionChange,
    onSearchChange,
    onRoleChange,
    onStatusChange,
    onResetFilters,
    isLoadingAccounts: accountsQuery.isPending,
    isErrorAccounts: accountsQuery.isError,
    errorAccounts: accountsQuery.error,
    refetchAccounts: accountsQuery.refetch,
    isFetchingAccounts: accountsQuery.isFetching,
    banDialog,
    setBanDialog,
    banMutation,
    revokeSessionsMutation,
    bulkDialog,
    setBulkDialog,
    bulkBanMutation,
    isPurgeOpen,
    setIsPurgeOpen,
    openPurgeDialog,
    purgePreview: purgePreviewQuery.data,
    isLoadingPurgePreview: purgePreviewQuery.isPending,
    purgeMutation,
  };
};
